import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Wallet, ArrowDownToLine, ListTodo, TrendingUp, Lightbulb,
  GraduationCap, Megaphone, FolderKanban, ScrollText, Settings as SettingsIcon,
  Plus, X, Sun, Moon, Search, Trash2, Pencil, ChevronRight, Check, AlertTriangle,
  Download, Upload, LogOut, Hexagon, CalendarClock, ArrowRight, Menu, Wifi, WifiOff,
  Mail, KeyRound, LogIn, RefreshCw, CloudOff,
  Users, UserCheck, CalendarDays, MessageSquare, Plane, Clock, CheckCircle2, XCircle, Hourglass, ShieldCheck,
  ArrowLeft, Undo2, RotateCcw, Paperclip, Link2, ExternalLink, Activity, Filter, Send, FileText, Sheet, Tag, Bell,
  Eye, EyeOff, Copy,
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ──────────────────────────────────────────────────────────────────────────
   ALLBEE — Business management app for Haji & Alim (ALLBEE SOLUTIONS)
   React app backed by Supabase: email/password auth, a shared Postgres
   database, and live sync between both partners. See README.md for setup.
─────────────────────────────────────────────────────────────────────────── */

const USERS = ["Haji", "Alim"];
const COMBINED = "Haji & Alim";          // a task can be assigned to both partners
const PRESETS = [[50, 50], [70, 30], [30, 70], [60, 40], [40, 60]];

const TASK_FLOW = ["Created", "Accepted", "In Progress", "Completed"];
const PROJECT_STAGES = ["Lead", "Discussion", "Proposal Sent", "Advance Received", "Development", "Testing", "Completed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const INCOME_CATEGORIES = ["Project", "Course", "Marketing", "Consulting", "Other"];
const EXPENSE_CATEGORIES = ["Office Rent", "Internet", "Electricity", "Marketing", "Software", "Travel", "Other"];
const LEAVE_TYPES = ["Casual", "Sick", "Earned", "Unpaid"];
const VAULT_CATEGORIES = ["Social media", "Website / Hosting", "Email", "Domain", "Banking / Finance", "Tool / Software", "Other"];

// Recently Deleted (recycle bin): which collections support soft-delete + restore,
// the human label shown for each, and how long items survive before auto-cleanup.
const RECYCLE_TTL_DAYS = 60;
const MODULE_LABEL = {
  transactions: "Accounts", withdrawals: "Withdrawals", tasks: "Tasks",
  projects: "Projects", students: "Courses", marketing: "Marketing", concepts: "Concepts",
  vault: "Passwords",
};
const LOGO_FULL = "/allbee-logo.png";   // full lockup (monogram + wordmark)
const LOGO_ICON = "/allbee-icon.png";   // square monogram

/* ── helpers ──────────────────────────────────────────────────────────── */
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function money(n, { sign = false } = {}) {
  const v = round2(n || 0);
  const neg = v < 0;
  const s = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.abs(v));
  const core = "₹" + s;
  if (neg) return "−" + core;
  if (sign) return "+" + core;
  return core;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
const sameMonth = (iso, ref = new Date()) => {
  const d = new Date(iso + "T00:00:00");
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
};

/* ── data layer (Supabase) ────────────────────────────────────────────────
   Architecture preserved from the prototype: the whole database is held in
   memory as one `db` object and all derived values are computed in JS. Here
   each collection is a Postgres table with one row per record:
   ( id text primary key, data jsonb, updated_at timestamptz ).
   We load every row into the in-memory shape, and on each change we persist
   only the rows that actually changed (insert / update / delete).
─────────────────────────────────────────────────────────────────────────── */
const TABLES = ["transactions", "withdrawals", "tasks", "projects", "students", "marketing", "concepts", "audit", "attendance", "leave", "updates", "recycle", "vault"];

async function fetchAll() {
  const db = emptyDB();
  await Promise.all(TABLES.map(async (t) => {
    try {
      const { data, error } = await supabase.from(t).select("id,data");
      if (error) {
        // Tolerate a table that hasn't been created yet (e.g. a new feature whose
        // schema migration hasn't been run). It simply loads empty so the rest of
        // the app still works instead of freezing on the loading screen.
        console.warn(`[ALLBEE] Skipping "${t}": ${error.message}. Re-run supabase/schema.sql if this is a new feature.`);
        return;
      }
      db[t] = (data || [])
        .map((r) => r.data)
        .sort((a, b) => (a?.createdAt || a?.ts || 0) - (b?.createdAt || b?.ts || 0));
    } catch (e) {
      console.warn(`[ALLBEE] Skipping "${t}": ${e?.message || e}`);
    }
  }));
  return db;
}

// Persist the difference between two db snapshots (per collection, by id).
async function applyDiff(prev, next) {
  const stamp = new Date().toISOString();
  const ops = [];
  for (const t of TABLES) {
    const before = new Map((prev?.[t] || []).map((x) => [x.id, x]));
    const after = new Map((next?.[t] || []).map((x) => [x.id, x]));
    const upserts = [];
    for (const [id, row] of after) {
      const b = before.get(id);
      if (!b || JSON.stringify(b) !== JSON.stringify(row)) upserts.push({ id, data: row, updated_at: stamp });
    }
    const deletes = [];
    for (const id of before.keys()) if (!after.has(id)) deletes.push(id);
    if (upserts.length) ops.push(supabase.from(t).upsert(upserts).then((r) => { if (r.error) throw new Error(`Saving ${t}: ${r.error.message}`); }));
    if (deletes.length) ops.push(supabase.from(t).delete().in("id", deletes).then((r) => { if (r.error) throw new Error(`Deleting from ${t}: ${r.error.message}`); }));
  }
  await Promise.all(ops);
}

// Replace the entire database (used by "Import backup").
async function replaceAll(clean) {
  const stamp = new Date().toISOString();
  for (const t of TABLES) {
    const del = await supabase.from(t).delete().neq("id", "");
    if (del.error) throw new Error(`Clearing ${t}: ${del.error.message}`);
    const rows = (clean[t] || []).map((x) => ({ id: x.id, data: x, updated_at: stamp }));
    if (rows.length) {
      const up = await supabase.from(t).upsert(rows);
      if (up.error) throw new Error(`Restoring ${t}: ${up.error.message}`);
    }
  }
}

/* ── people (profiles / roles) ────────────────────────────────────────── */
async function fetchTeam() {
  const { data, error } = await supabase.from("profiles").select("id,name,email,role,active,created_at").order("created_at", { ascending: true });
  if (error) throw new Error(`Loading team: ${error.message}`);
  return data || [];
}
// Make sure the signed-in user has a profile row (covers accounts made before
// the database trigger existed). Defaults to a staff member; an admin can change
// the role later from the Team screen.
async function ensureProfile(user) {
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  const name = user.user_metadata?.name || (user.email ? user.email.split("@")[0] : "Member");
  await supabase.from("profiles").upsert({ id: user.id, name, email: user.email, role: "staff" }, { onConflict: "id", ignoreDuplicates: true });
}
async function updateProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ── HR derived helpers ───────────────────────────────────────────────── */
const daysBetween = (from, to) => {
  if (!from || !to) return 0;
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00");
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
};
const hoursBetween = (a, b) => {
  if (!a || !b) return null;
  return Math.max(0, (new Date(b) - new Date(a)) / 3600000);
};
const clockTime = (ts) => (ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—");
const onApprovedLeave = (db, userId, dateISO) =>
  db.leave.some((l) => l.userId === userId && l.status === "Approved" && dateISO >= l.fromDate && dateISO <= l.toDate);
const attendanceFor = (db, userId, dateISO) => db.attendance.find((a) => a.userId === userId && a.date === dateISO) || null;

const emptyDB = () => ({
  version: 2,
  transactions: [], withdrawals: [], tasks: [], projects: [],
  students: [], marketing: [], concepts: [], audit: [],
  attendance: [], leave: [], updates: [], recycle: [], vault: [],
});

/* ── derived calculations ─────────────────────────────────────────────── */
function balances(db) {
  let Haji = 0, Alim = 0;
  for (const t of db.transactions) {
    const a = Number(t.amount) || 0;
    const h = (a * (Number(t.hajiPct) || 0)) / 100;
    const m = (a * (Number(t.alimPct) || 0)) / 100;
    if (t.kind === "income") { Haji += h; Alim += m; }
    else { Haji -= h; Alim -= m; }
  }
  for (const w of db.withdrawals) {
    if (w.user === "Haji") Haji -= Number(w.amount) || 0;
    else Alim -= Number(w.amount) || 0;
  }
  return { Haji: round2(Haji), Alim: round2(Alim), company: round2(Haji + Alim) };
}

function ledgerFor(db, user) {
  const events = [];
  for (const t of db.transactions) {
    const a = Number(t.amount) || 0;
    const pct = user === "Haji" ? Number(t.hajiPct) || 0 : Number(t.alimPct) || 0;
    const share = round2((a * pct) / 100);
    events.push({
      ts: t.createdAt || 0, date: t.date, client: t.client || "—",
      project: t.project || t.category || "—", category: t.category || "—",
      type: t.kind === "income" ? "Income" : "Expense",
      income: t.kind === "income" ? a : null,
      expense: t.kind === "expense" ? a : null,
      pct, credited: t.kind === "income" ? share : 0, debited: t.kind === "expense" ? share : 0,
      notes: t.notes || "",
    });
  }
  for (const w of db.withdrawals.filter((w) => w.user === user)) {
    events.push({
      ts: w.createdAt || 0, date: w.date, client: "—", project: "Withdrawal", category: "Withdrawal", type: "Withdrawal",
      income: null, expense: null, pct: 100, credited: 0, debited: Number(w.amount) || 0, notes: w.notes || "",
    });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts));
  let run = 0;
  return events.map((e) => { run = round2(run + e.credited - e.debited); return { ...e, running: run }; });
}

// ── task ownership / permissions ──────────────────────────────────────────
// Who may move a task through its workflow (Accept → Start → Complete → undo):
// only the assigned person. A task assigned to both partners can be acted on
// by either Haji or Alim.
const taskAssignees = (t) => (t.assignedTo === COMBINED ? USERS.slice() : [t.assignedTo]);
const canActOnTask = (t, name) => taskAssignees(t).includes(name);
// Who may edit / delete / monitor a task: an admin or the person who created it.
const canEditTask = (t, name, isAdmin) => isAdmin || t.assignedBy === name;
// A readable, ordered activity timeline. Falls back to a sensible reconstruction
// for tasks created before history tracking existed.
function taskTimeline(t) {
  if (Array.isArray(t.history) && t.history.length) {
    return [...t.history].sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  const out = [{ status: "Created", at: t.createdAt || 0, by: t.assignedBy }];
  const idx = TASK_FLOW.indexOf(t.status);
  for (let i = 1; i <= idx; i++) out.push({ status: TASK_FLOW[i], at: t.createdAt || 0, by: i === 1 ? t.assignedTo : t.assignedTo });
  return out;
}

function monthStats(db) {
  let rev = 0, exp = 0;
  for (const t of db.transactions) {
    if (!sameMonth(t.date)) continue;
    if (t.kind === "income") rev += Number(t.amount) || 0;
    else exp += Number(t.amount) || 0;
  }
  return { rev: round2(rev), exp: round2(exp) };
}

function marketingDue(m) {
  if (!m.startDate) return { label: "No start date", tone: "muted" };
  const start = new Date(m.startDate + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const due = new Date(today.getFullYear(), today.getMonth(), Math.min(start.getDate(), last));
  const paidThisMonth = m.lastPaid && sameMonth(m.lastPaid, today);
  if (paidThisMonth) return { label: "Paid this month", tone: "pos" };
  if (today >= due) return { label: "Payment due", tone: "neg" };
  return { label: "Due " + fmtDate(due.toISOString().slice(0, 10)), tone: "muted" };
}

/* ══════════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════════ */
const CSS = `
.allbee, .allbee * { box-sizing: border-box; }
html, body { max-width: 100%; overflow-x: hidden; }
.allbee {
  --bg:#F6F7F9; --surface:#FFFFFF; --surface-2:#F0F2F6; --ink:#161A20; --muted:#626C7A;
  --border:#E4E8EF; --primary:#2E3B8F; --primary-soft:#E9EBFA; --accent:#EAA417;
  --pos:#15924D; --pos-soft:#E5F4EB; --neg:#D23B3B; --neg-soft:#FBEAEA;
  --haji:#0E9F8E; --alim:#7C5CFC; --shadow:0 1px 2px rgba(16,22,32,.06),0 8px 24px rgba(16,22,32,.06);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--ink); background:var(--bg); min-height:100vh; -webkit-font-smoothing:antialiased;
}
.allbee[data-theme="dark"] {
  --bg:#0D1117; --surface:#161B22; --surface-2:#1C232C; --ink:#E7EBF1; --muted:#8B95A5;
  --border:#262E39; --primary:#6D7BFF; --primary-soft:#1B2247; --accent:#F2B23C;
  --pos:#3FBF73; --pos-soft:#12281C; --neg:#F0635F; --neg-soft:#2E1717;
  --haji:#26C4B0; --alim:#9B82FF; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35);
}
.mono { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace; font-variant-numeric:tabular-nums; }

.layout { display:grid; grid-template-columns:248px 1fr; min-height:100vh; }
.sidebar {
  background:var(--surface); border-right:1px solid var(--border); padding:18px 14px;
  display:flex; flex-direction:column; gap:4px; position:sticky; top:0; height:100vh; overflow-y:auto;
}
.brand { display:flex; align-items:center; gap:10px; padding:6px 8px 16px; }
.brand-badge { width:34px; height:34px; border-radius:9px; background:linear-gradient(135deg,var(--accent),#d98c00);
  display:grid; place-items:center; color:#fff; box-shadow:0 4px 12px rgba(234,164,23,.35); }
.brand h1 { font-size:16px; margin:0; letter-spacing:.3px; font-weight:800; }
.brand p { font-size:11px; margin:1px 0 0; color:var(--muted); letter-spacing:.6px; text-transform:uppercase; }
.navitem { display:flex; align-items:center; gap:11px; padding:9px 11px; border-radius:9px; cursor:pointer;
  font-size:14px; color:var(--muted); border:1px solid transparent; transition:.12s; font-weight:500; }
.navitem:hover { background:var(--surface-2); color:var(--ink); }
.navitem.active { background:var(--primary-soft); color:var(--primary); font-weight:600; }
.navitem .badge { margin-left:auto; }
.sidebar-foot { margin-top:auto; padding-top:12px; border-top:1px solid var(--border); }

.main { display:flex; flex-direction:column; min-width:0; }
.topbar { display:flex; align-items:center; gap:14px; padding:14px 22px; border-bottom:1px solid var(--border);
  background:color-mix(in srgb,var(--surface) 80%,transparent); backdrop-filter:blur(8px); position:sticky; top:0; z-index:20; }
.hamburger { display:none; }
.topbar h2 { font-size:18px; margin:0; font-weight:700; }
.topbar-sub { font-size:12px; color:var(--muted); margin-top:1px; }
.company-pill { margin-left:auto; display:flex; align-items:center; gap:10px; background:var(--surface);
  border:1px solid var(--border); padding:7px 13px; border-radius:11px; box-shadow:var(--shadow); }
.company-pill .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); }
.company-pill .val { font-size:16px; font-weight:700; }
.iconbtn { width:36px; height:36px; border-radius:9px; border:1px solid var(--border); background:var(--surface);
  display:grid; place-items:center; cursor:pointer; color:var(--ink); transition:.12s; }
.iconbtn:hover { background:var(--surface-2); }
.usermenu { position:relative; }
.userchip { display:flex; align-items:center; gap:8px; border:1px solid var(--border); background:var(--surface);
  border-radius:9px; padding:5px 10px 5px 6px; cursor:pointer; font-weight:600; font-size:13px; }
.avatar { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; color:#fff; font-size:12px; font-weight:700; }
.dropdown { position:absolute; right:0; top:46px; background:var(--surface); border:1px solid var(--border);
  border-radius:11px; box-shadow:var(--shadow); padding:6px; min-width:170px; z-index:40; }
.dropdown button { width:100%; text-align:left; padding:9px 10px; border:none; background:none; color:var(--ink);
  border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:9px; }
.dropdown button:hover { background:var(--surface-2); }
.drop-id { display:flex; align-items:center; gap:9px; padding:8px 10px 10px; margin-bottom:4px; border-bottom:1px solid var(--border); }
.userchip-name { max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.role-badge { font-size:10px; font-weight:800; letter-spacing:.4px; text-transform:uppercase; padding:2px 7px; border-radius:999px; }
.role-badge.admin { background:var(--primary-soft); color:var(--primary); }
.role-badge.staff { background:var(--surface-2); color:var(--muted); }
.quick-actions { display:flex; gap:10px; flex-wrap:wrap; }
.who-cell { display:inline-flex; align-items:center; gap:9px; }

.content { padding:22px; max-width:1180px; width:100%; }
.page-head { display:flex; align-items:center; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
.page-head h3 { font-size:20px; margin:0; font-weight:700; }
.page-head .spacer { flex:1; }

.card { background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow); }
.cards-grid { display:grid; gap:14px; }
.stat { padding:16px 18px; }
.stat .lbl { font-size:12px; color:var(--muted); display:flex; align-items:center; gap:7px; font-weight:500; }
.stat .num { font-size:26px; font-weight:700; margin-top:8px; letter-spacing:-.5px; }
.stat .sub { font-size:12px; color:var(--muted); margin-top:3px; }
.dot { width:9px; height:9px; border-radius:50%; }

.balance-card { padding:18px; position:relative; overflow:hidden; cursor:pointer; transition:.15s; }
.balance-card:hover { transform:translateY(-2px); }
.balance-card .stripe { position:absolute; left:0; top:0; bottom:0; width:4px; }
.balance-card .who { font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px; }
.balance-card .amt { font-size:30px; font-weight:800; margin-top:10px; letter-spacing:-.6px; }
.balance-card .hint { font-size:11px; color:var(--muted); margin-top:8px; display:flex; align-items:center; gap:4px; }

.split { display:flex; height:7px; border-radius:6px; overflow:hidden; background:var(--surface-2); }
.split .h { background:var(--haji); }
.split .a { background:var(--alim); }
.split-legend { display:flex; gap:14px; font-size:11px; color:var(--muted); margin-top:6px; }
.split-legend span { display:flex; align-items:center; gap:5px; }

.btn { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--border); background:var(--surface);
  color:var(--ink); padding:9px 14px; border-radius:9px; font-size:13.5px; font-weight:600; cursor:pointer; transition:.12s; }
.btn:hover { background:var(--surface-2); }
.btn.primary { background:var(--primary); color:#fff; border-color:var(--primary); }
.btn.primary:hover { filter:brightness(1.07); }
.btn.danger { color:var(--neg); border-color:transparent; background:transparent; }
.btn.danger:hover { background:var(--neg-soft); }
.btn.ghost { border-color:transparent; background:transparent; }
.btn.sm { padding:6px 10px; font-size:12.5px; }
.btn:disabled { opacity:.5; cursor:not-allowed; }

.badge { font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:var(--surface-2); color:var(--muted); white-space:nowrap; }
.badge.pos { background:var(--pos-soft); color:var(--pos); }
.badge.neg { background:var(--neg-soft); color:var(--neg); }
.badge.pri { background:var(--primary-soft); color:var(--primary); }
.badge.accent { background:rgba(234,164,23,.16); color:var(--accent); }

table.tbl { width:100%; border-collapse:collapse; font-size:13.5px; }
table.tbl th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted);
  padding:10px 14px; border-bottom:1px solid var(--border); font-weight:600; }
table.tbl td { padding:11px 14px; border-bottom:1px solid var(--border); vertical-align:middle; }
table.tbl tr:last-child td { border-bottom:none; }
table.tbl tr:hover td { background:var(--surface-2); }
.num-cell { text-align:right; }
.pos-txt { color:var(--pos); } .neg-txt { color:var(--neg); }

.item-row { display:flex; align-items:center; gap:14px; padding:14px 16px; border-bottom:1px solid var(--border); }
.item-row:last-child { border-bottom:none; }
.item-row:hover { background:var(--surface-2); }
.item-main { min-width:0; flex:1; }
.item-title { font-weight:600; font-size:14.5px; }
.item-meta { font-size:12.5px; color:var(--muted); margin-top:3px; display:flex; gap:10px; flex-wrap:wrap; }
.row-actions { display:flex; gap:4px; opacity:.8; }

.empty { text-align:center; padding:46px 20px; color:var(--muted); }
.empty .ic { width:54px; height:54px; border-radius:14px; background:var(--surface-2); display:grid; place-items:center; margin:0 auto 14px; }
.empty h4 { margin:0 0 6px; color:var(--ink); font-size:16px; }
.empty p { margin:0 0 16px; font-size:13.5px; }

.overlay { position:fixed; inset:0; background:rgba(10,14,20,.5); backdrop-filter:blur(2px); z-index:100;
  display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow-y:auto; }
.modal { background:var(--surface); border:1px solid var(--border); border-radius:16px; width:100%; max-width:560px;
  box-shadow:0 24px 64px rgba(0,0,0,.35); animation:pop .16s ease; }
@keyframes pop { from { opacity:0; transform:translateY(8px) scale(.99);} to { opacity:1; transform:none; } }
.modal-head { display:flex; align-items:center; padding:18px 20px; border-bottom:1px solid var(--border); }
.modal-head h3 { margin:0; font-size:17px; font-weight:700; }
.modal-body { padding:20px; display:flex; flex-direction:column; gap:14px; max-height:62vh; overflow-y:auto; }
.modal-foot { padding:14px 20px; border-top:1px solid var(--border); display:flex; gap:10px; justify-content:flex-end; }

.field label { display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; color:var(--ink); }
.field .req { color:var(--neg); }
.input, .select, .textarea { width:100%; background:var(--surface); border:1px solid var(--border); border-radius:9px;
  padding:10px 12px; font-size:14px; color:var(--ink); font-family:inherit; transition:.12s; }
.input:focus, .select:focus, .textarea:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-soft); }
.textarea { resize:vertical; min-height:90px; line-height:1.5; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.hint-line { font-size:12px; color:var(--muted); }
.field-err { font-size:12px; color:var(--neg); margin-top:5px; display:flex; align-items:center; gap:5px; }

.preset-row { display:flex; gap:6px; flex-wrap:wrap; }
.preset { font-size:11.5px; padding:5px 9px; border-radius:7px; border:1px solid var(--border); background:var(--surface);
  cursor:pointer; font-weight:600; color:var(--muted); }
.preset:hover { border-color:var(--primary); color:var(--primary); }

.calc-box { background:var(--surface-2); border-radius:11px; padding:13px 15px; display:flex; flex-direction:column; gap:9px; }
.calc-row { display:flex; align-items:center; justify-content:space-between; font-size:13.5px; }

.toolbar { display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap; }
.search { display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border);
  border-radius:9px; padding:0 12px; flex:1; min-width:180px; }
.search input { border:none; background:none; outline:none; padding:10px 0; font-size:14px; color:var(--ink); width:100%; font-family:inherit; }
.seg { display:flex; gap:2px; background:var(--surface-2); border-radius:9px; padding:3px; }
.seg button { border:none; background:none; padding:7px 12px; border-radius:7px; font-size:12.5px; cursor:pointer;
  color:var(--muted); font-weight:600; white-space:nowrap; }
.seg button.on { background:var(--surface); color:var(--ink); box-shadow:var(--shadow); }

.banner { display:flex; align-items:center; gap:9px; padding:9px 14px; border-radius:10px; font-size:12.5px;
  background:var(--accent); color:#3a2a00; margin:0 22px 0; margin-top:14px; font-weight:500; }

.progress-track { height:8px; border-radius:6px; background:var(--surface-2); overflow:hidden; }
.progress-fill { height:100%; background:var(--primary); border-radius:6px; transition:width .25s; }

.tag { font-size:11px; padding:2px 8px; border-radius:6px; background:var(--surface-2); color:var(--muted); }

.kbd { font-size:11px; }

/* Lock screen */
.lock { min-height:100vh; display:grid; place-items:center; padding:24px; }
.lock-card { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:36px 32px;
  width:100%; max-width:420px; box-shadow:var(--shadow); text-align:center; }
.lock-badge { width:60px; height:60px; border-radius:16px; margin:0 auto 18px; background:linear-gradient(135deg,var(--accent),#d98c00);
  display:grid; place-items:center; color:#fff; box-shadow:0 8px 24px rgba(234,164,23,.4); }
.lock h1 { margin:0; font-size:24px; font-weight:800; letter-spacing:.5px; }
.lock p { margin:6px 0 26px; color:var(--muted); font-size:14px; }
.who-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.who-btn { border:1px solid var(--border); background:var(--surface); border-radius:14px; padding:20px 12px; cursor:pointer;
  display:flex; flex-direction:column; align-items:center; gap:10px; transition:.14s; }
.who-btn:hover { transform:translateY(-2px); box-shadow:var(--shadow); border-color:var(--primary); }
.who-btn .av { width:48px; height:48px; border-radius:50%; display:grid; place-items:center; color:#fff; font-size:20px; font-weight:800; }
.who-btn .nm { font-weight:700; font-size:15px; }
.auth-msg { display:flex; align-items:center; gap:7px; font-size:12.5px; margin-top:14px; padding:9px 11px; border-radius:9px; text-align:left; }
.auth-msg.err { color:var(--neg); background:color-mix(in srgb, var(--neg) 12%, transparent); }
.auth-msg.ok { color:var(--pos); background:color-mix(in srgb, var(--pos) 14%, transparent); }
.linkbtn { background:none; border:none; color:var(--primary); font-size:13px; font-weight:600; cursor:pointer; margin-top:14px; }
.linkbtn:hover { text-decoration:underline; }
.spin { animation:sp 1s linear infinite; } @keyframes sp { to { transform:rotate(360deg); } }

@media (max-width:900px) {
  .layout { grid-template-columns:1fr; }
  .sidebar { position:fixed; left:0; top:0; bottom:0; width:264px; z-index:200; transform:translateX(-105%); transition:.22s; }
  .allbee.menu-open .sidebar { transform:none; box-shadow:0 0 0 100vmax rgba(0,0,0,.45); }
  .hamburger { display:grid; }
  .content { padding:16px; }
  .grid2 { grid-template-columns:1fr; }
  .company-pill .lbl { display:none; }
}

/* ── Phase 2 additions ─────────────────────────────────────────────────── */
/* logo */
.brand-logo { height:30px; width:auto; display:block; }
.lock-logo { height:64px; width:auto; margin:0 auto 16px; display:block; }
.brand-mini { display:flex; align-items:center; gap:10px; padding:6px 8px 16px; }

/* back link + detail header */
.backlink { display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--muted);
  font-size:13px; font-weight:600; cursor:pointer; padding:4px 0; margin-bottom:6px; }
.backlink:hover { color:var(--ink); }
.detail-head { display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.detail-head h3 { font-size:22px; margin:0; font-weight:800; letter-spacing:-.3px; }
.meta-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px; background:var(--border);
  border:1px solid var(--border); border-radius:12px; overflow:hidden; }
.meta-grid > div { background:var(--surface); padding:12px 14px; }
.meta-grid .k { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); font-weight:600; }
.meta-grid .v { font-weight:600; margin-top:5px; font-size:14px; }

/* summary stat strip */
.sumrow { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:16px; }
.sumrow .card { padding:14px 16px; }
.sumrow .k { font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px; font-weight:500; }
.sumrow .v { font-size:21px; font-weight:700; margin-top:7px; letter-spacing:-.4px; }

/* filter bar */
.filterbar { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; align-items:end; }
.filterbar .field { margin:0; }
.filterbar label { font-size:11px; }

/* activity timeline */
.timeline { position:relative; padding-left:22px; }
.timeline::before { content:""; position:absolute; left:6px; top:4px; bottom:4px; width:2px; background:var(--border); }
.tl-item { position:relative; padding:6px 0 14px; }
.tl-item:last-child { padding-bottom:0; }
.tl-dot { position:absolute; left:-20px; top:8px; width:11px; height:11px; border-radius:50%; background:var(--primary);
  border:2px solid var(--surface); box-shadow:0 0 0 1px var(--border); }
.tl-item .what { font-weight:600; font-size:14px; }
.tl-item .when { font-size:12px; color:var(--muted); margin-top:2px; }

/* comments */
.comment { display:flex; gap:10px; padding:12px 0; border-bottom:1px solid var(--border); }
.comment:last-child { border-bottom:none; }
.comment .body { flex:1; min-width:0; }
.comment .who { font-weight:600; font-size:13.5px; }
.comment .txt { margin-top:3px; line-height:1.5; white-space:pre-wrap; font-size:14px; }
.comment .when { font-size:11.5px; color:var(--muted); margin-top:4px; }
.composer { display:flex; gap:10px; align-items:flex-end; margin-top:6px; }
.composer .textarea { min-height:44px; }

/* attachment chips */
.attach-list { display:flex; flex-direction:column; gap:8px; }
.attach { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
.attach a { color:var(--primary); text-decoration:none; font-weight:600; font-size:14px; word-break:break-all; }
.attach a:hover { text-decoration:underline; }

/* recently deleted */
.ttl-pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; }
.ttl-ok { background:var(--surface-2); color:var(--muted); }
.ttl-soon { background:var(--neg-soft); color:var(--neg); }
.detail-json { background:var(--surface-2); border-radius:10px; padding:12px 14px; font-size:12.5px; line-height:1.7; }
.detail-json .k { color:var(--muted); }
.ttl-link { background:none; border:none; padding:0; margin:0; font:inherit; font-weight:700; font-size:14.5px; color:var(--ink);
  cursor:pointer; text-align:left; }
.ttl-link:hover { color:var(--primary); text-decoration:underline; }

/* notifications */
.notif-wrap { position:relative; }
.notif-panel { position:absolute; right:0; top:46px; width:330px; max-width:86vw; background:var(--surface); border:1px solid var(--border);
  border-radius:12px; box-shadow:0 18px 50px rgba(0,0,0,.4); z-index:300; overflow:hidden; }
.notif-head { display:flex; align-items:center; gap:8px; padding:11px 13px; border-bottom:1px solid var(--border); font-weight:700; font-size:13.5px; }
.notif-list { max-height:60vh; overflow-y:auto; }
.notif-item { display:flex; gap:9px; padding:11px 13px; border-bottom:1px solid var(--border); cursor:pointer; }
.notif-item:last-child { border-bottom:none; }
.notif-item:hover { background:var(--surface-2); }
.notif-item.unread { background:var(--primary-soft); }
.notif-item .nb { flex:1; min-width:0; }
.notif-item .nt { font-size:13.5px; line-height:1.4; }
.notif-item .nw { font-size:11.5px; color:var(--muted); margin-top:3px; }
.notif-dot { width:8px; height:8px; border-radius:50%; background:var(--primary); flex-shrink:0; margin-top:6px; }
.notif-badge { position:absolute; top:-4px; right:-4px; min-width:17px; height:17px; padding:0 4px; border-radius:999px;
  background:var(--neg); color:#fff; font-size:10px; font-weight:800; display:grid; place-items:center; border:2px solid var(--bg); }
.notif-empty { padding:26px 16px; text-align:center; color:var(--muted); font-size:13px; line-height:1.6; }

/* passwords / vault */
.vault-row { display:flex; align-items:center; gap:8px; }
.vault-row .vk { font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:var(--muted); width:74px; flex-shrink:0; }
.vault-row .vv { flex:1; min-width:0; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vault-link { display:inline-flex; align-items:center; gap:5px; color:var(--primary); text-decoration:none; font-size:13px; word-break:break-all; }
.vault-link:hover { text-decoration:underline; }

/* mobile refinements */
@media (max-width:640px) {
  .topbar { padding:11px 13px; gap:9px; }
  .topbar-sub { display:none; }
  .userchip-name { display:none; }
  .userchip { padding:5px 7px; }
  .company-pill { padding:6px 10px; }
  .topbar h2 { font-size:16px; max-width:44vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .content { padding:14px; }
  .sumrow { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .meta-grid { grid-template-columns:1fr 1fr !important; }
  .filterbar { grid-template-columns:1fr 1fr !important; }
  .stat .num { font-size:21px; }
  .page-head h3 { font-size:18px; }
  .detail-head h3 { font-size:19px; }
}
@media (max-width:420px) {
  .sumrow, .filterbar { grid-template-columns:1fr !important; }
}
`;

/* ══════════════════════════════════════════════════════════════════════
   SMALL UI PRIMITIVES
══════════════════════════════════════════════════════════════════════ */
function SplitBar({ h, a, legend = true }) {
  return (
    <div>
      <div className="split"><div className="h" style={{ width: `${h}%` }} /><div className="a" style={{ width: `${a}%` }} /></div>
      {legend && (
        <div className="split-legend">
          <span><span className="dot" style={{ background: "var(--haji)" }} /> Haji {h}%</span>
          <span><span className="dot" style={{ background: "var(--alim)" }} /> Alim {a}%</span>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><span style={{ flex: 1 }} />
          <button className="iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, required, children, error, hint }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span className="req"> *</span>}</label>}
      {children}
      {hint && !error && <div className="hint-line" style={{ marginTop: 5 }}>{hint}</div>}
      {error && <div className="field-err"><AlertTriangle size={13} />{error}</div>}
    </div>
  );
}

function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="ic">{icon}</div>
      <h4>{title}</h4><p>{text}</p>
      {action}
    </div>
  );
}

function Confirm({ title, body, confirmLabel = "Delete", onConfirm, onClose, danger = true }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={"btn " + (danger ? "primary" : "primary")} style={danger ? { background: "var(--neg)", borderColor: "var(--neg)" } : {}}
          onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>}>
      <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55 }}>{body}</p>
    </Modal>
  );
}

// Safer destructive action: the button stays disabled until the person types the
// exact word (CONFIRM). Used for every delete and every restore.
function TypedConfirm({ title, body, note, word = "CONFIRM", actionLabel = "Delete", icon, danger = true, onConfirm, onClose }) {
  const [val, setVal] = useState("");
  const ok = val === word;
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ok}
          style={ok && danger ? { background: "var(--neg)", borderColor: "var(--neg)" } : {}}
          onClick={() => { if (ok) { onConfirm(); onClose(); } }}>
          {icon}{actionLabel}
        </button>
      </>}>
      {body && <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55 }}>{body}</p>}
      {note && (
        <div className="calc-box" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={18} color={danger ? "var(--neg)" : "var(--accent)"} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, lineHeight: 1.5 }}>{note}</span>
        </div>
      )}
      <Field label={<>Type <b className="mono" style={{ letterSpacing: ".5px" }}>{word}</b> to confirm</>}>
        <input className="input mono" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          placeholder={word} onKeyDown={(e) => { if (e.key === "Enter" && ok) { onConfirm(); onClose(); } }} />
      </Field>
    </Modal>
  );
}

const STAFF_COLORS = ["#E8743B", "#1DAF9C", "#C0428A", "#2E8BD0", "#E0A100", "#5A6ACF", "#3FA34D", "#D2553B", "#8E5CC0", "#0FA3A3"];
function avatarColor(name) {
  if (name === "Haji") return "var(--haji)";
  if (name === "Alim") return "var(--alim)";
  let h = 0; const s = name || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return STAFF_COLORS[h % STAFF_COLORS.length];
}

/* ══════════════════════════════════════════════════════════════════════
   FORMS
══════════════════════════════════════════════════════════════════════ */
function ShareForm({ kind, initial, onSave, onClose, currentUser }) {
  const isIncome = kind === "income";
  const [f, setF] = useState(() => ({
    client: "", project: "", amount: "", date: todayISO(),
    category: isIncome ? "Project" : "Office Rent", hajiPct: 50, alimPct: 50, notes: "",
    ...initial,
  }));
  const [touched, setTouched] = useState(false);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setSplit = (h) => setF((s) => ({ ...s, hajiPct: h, alimPct: 100 - h }));

  const amt = Number(f.amount) || 0;
  const sum = (Number(f.hajiPct) || 0) + (Number(f.alimPct) || 0);
  const splitOK = sum === 100;
  const valid = amt > 0 && splitOK && f.date;
  const hShare = round2((amt * (Number(f.hajiPct) || 0)) / 100);
  const aShare = round2((amt * (Number(f.alimPct) || 0)) / 100);

  const save = () => {
    setTouched(true);
    if (!valid) return;
    onSave({
      ...initial, id: initial?.id || uid(), kind, client: f.client.trim(), project: f.project.trim(),
      amount: amt, date: f.date, category: f.category, hajiPct: Number(f.hajiPct), alimPct: Number(f.alimPct),
      notes: f.notes.trim(), createdAt: initial?.createdAt || Date.now(),
    });
    onClose();
  };

  return (
    <Modal title={(initial?.id ? "Edit " : "Add ") + (isIncome ? "income" : "expense")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />{isIncome ? "Add income" : "Add expense"}</button></>}>
      <div className="grid2">
        <Field label="Client name"><input className="input" value={f.client} onChange={(e) => up("client", e.target.value)} placeholder="e.g. Sun Textiles" /></Field>
        <Field label={isIncome ? "Project / source" : "Project (optional)"}><input className="input" value={f.project} onChange={(e) => up("project", e.target.value)} placeholder={isIncome ? "Website redesign" : "Tied to a project?"} /></Field>
      </div>
      <div className="grid2">
        <Field label={isIncome ? "Income amount" : "Expense amount"} required error={touched && amt <= 0 ? "Enter an amount above ₹0" : ""}>
          <input className="input mono" type="number" min="0" value={f.amount} onChange={(e) => up("amount", e.target.value)} placeholder="10000" />
        </Field>
        <Field label="Date" required><input className="input" type="date" value={f.date} onChange={(e) => up("date", e.target.value)} /></Field>
      </div>
      <Field label="Category">
        <select className="select" value={f.category} onChange={(e) => up("category", e.target.value)}>
          {(isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>

      <Field label="Profit split" required error={touched && !splitOK ? `Split must total 100% (currently ${sum}%)` : ""}
        hint="Set the share for this entry — no fixed percentage is assumed.">
        <div className="preset-row" style={{ marginBottom: 10 }}>
          {PRESETS.map(([h, a]) => (
            <button key={h + "/" + a} className="preset" onClick={() => setSplit(h)}>{h} / {a}</button>
          ))}
        </div>
        <div className="grid2">
          <div><div className="hint-line" style={{ marginBottom: 5 }}>Haji %</div>
            <input className="input mono" type="number" min="0" max="100" value={f.hajiPct} onChange={(e) => up("hajiPct", e.target.value === "" ? "" : Number(e.target.value))} /></div>
          <div><div className="hint-line" style={{ marginBottom: 5 }}>Alim %</div>
            <input className="input mono" type="number" min="0" max="100" value={f.alimPct} onChange={(e) => up("alimPct", e.target.value === "" ? "" : Number(e.target.value))} /></div>
        </div>
        <div style={{ marginTop: 12 }}><SplitBar h={Number(f.hajiPct) || 0} a={Number(f.alimPct) || 0} /></div>
      </Field>

      {amt > 0 && splitOK && (
        <div className="calc-box">
          <div className="calc-row" style={{ color: "var(--muted)", fontSize: 12 }}>This entry will {isIncome ? "credit" : "debit"}:</div>
          <div className="calc-row"><span style={{ display: "flex", alignItems: "center", gap: 7 }}><span className="dot" style={{ background: "var(--haji)" }} />Haji</span>
            <span className={"mono " + (isIncome ? "pos-txt" : "neg-txt")} style={{ fontWeight: 700 }}>{money(isIncome ? hShare : -hShare, { sign: isIncome })}</span></div>
          <div className="calc-row"><span style={{ display: "flex", alignItems: "center", gap: 7 }}><span className="dot" style={{ background: "var(--alim)" }} />Alim</span>
            <span className={"mono " + (isIncome ? "pos-txt" : "neg-txt")} style={{ fontWeight: 700 }}>{money(isIncome ? aShare : -aShare, { sign: isIncome })}</span></div>
        </div>
      )}

      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => up("notes", e.target.value)} placeholder="Anything worth recording…" /></Field>
    </Modal>
  );
}

function WithdrawForm({ balances, defaultUser, onSave, onClose }) {
  const [user, setUser] = useState(defaultUser || "Haji");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const avail = balances[user] || 0;
  const amt = Number(amount) || 0;
  const over = amt > avail;
  const valid = amt > 0 && !over;
  const after = round2(avail - amt);

  const save = () => {
    setTouched(true);
    if (!valid) return;
    onSave({ id: uid(), user, amount: amt, date, notes: notes.trim(), createdAt: Date.now() });
    onClose();
  };
  return (
    <Modal title="Record withdrawal" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Withdraw</button></>}>
      <Field label="Who is withdrawing" required>
        <div className="seg">{USERS.map((u) => <button key={u} className={user === u ? "on" : ""} onClick={() => setUser(u)}>{u}</button>)}</div>
      </Field>
      <div className="calc-box"><div className="calc-row"><span style={{ color: "var(--muted)" }}>{user}'s available balance</span>
        <span className="mono" style={{ fontWeight: 700 }}>{money(avail)}</span></div></div>
      <div className="grid2">
        <Field label="Amount" required error={touched && amt <= 0 ? "Enter an amount" : over ? `Can't exceed available balance (${money(avail)})` : ""}>
          <input className="input mono" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
        </Field>
        <Field label="Date" required><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {amt > 0 && !over && (
        <div className="hint-line">Balance after withdrawal: <b className="mono">{money(after)}</b></div>
      )}
      <Field label="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason / reference" /></Field>
    </Modal>
  );
}

function TaskForm({ initial, onSave, onClose, currentUser, team = USERS, isAdmin = true }) {
  const others = team.filter((n) => n !== currentUser);
  // Admins choose any teammate, plus a combined "Haji & Alim" option.
  const assigneeOptions = isAdmin ? [...team, COMBINED] : [currentUser];
  const [f, setF] = useState(() => ({
    title: "", desc: "", assignedBy: currentUser, assignedTo: initial?.assignedTo || (isAdmin ? (others[0] || currentUser) : currentUser),
    priority: "Medium", due: "", notes: "", ...initial,
  }));
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length > 0;
  const save = () => {
    if (!valid) return;
    onSave({
      ...initial, id: initial?.id || uid(), title: f.title.trim(), desc: f.desc.trim(),
      assignedBy: f.assignedBy, assignedTo: f.assignedTo, priority: f.priority, due: f.due,
      notes: f.notes.trim(), status: initial?.status || "Created", progress: initial?.progress ?? 0,
      history: initial?.history || [{ status: "Created", at: Date.now(), by: f.assignedBy }],
      comments: initial?.comments || [], attachments: initial?.attachments || [],
      createdAt: initial?.createdAt || Date.now(),
    });
    onClose();
  };
  return (
    <Modal title={initial?.id ? "Edit task" : "New task"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />{initial?.id ? "Save task" : "Create task"}</button></>}>
      <Field label="Task title" required><input className="input" value={f.title} onChange={(e) => up("title", e.target.value)} placeholder="Design the landing page" /></Field>
      <Field label="Description"><textarea className="textarea" value={f.desc} onChange={(e) => up("desc", e.target.value)} placeholder="Full, detailed instructions — write as much as you need." /></Field>
      <div className="grid2">
        <Field label="Assigned by"><input className="input" value={f.assignedBy} disabled style={{ opacity: .7 }} /></Field>
        <Field label="Assigned to" hint={f.assignedTo === COMBINED ? "Either partner can accept, start or complete it." : undefined}>
          {isAdmin
            ? <select className="select" value={f.assignedTo} onChange={(e) => up("assignedTo", e.target.value)}>{assigneeOptions.map((u) => <option key={u}>{u}</option>)}</select>
            : <input className="input" value={f.assignedTo} disabled style={{ opacity: .7 }} />}
        </Field>
      </div>
      <div className="grid2">
        <Field label="Priority"><select className="select" value={f.priority} onChange={(e) => up("priority", e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Due date"><input className="input" type="date" value={f.due} onChange={(e) => up("due", e.target.value)} /></Field>
      </div>
      <Field label="Notes"><textarea className="textarea" style={{ minHeight: 60 }} value={f.notes} onChange={(e) => up("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function ProjectForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => ({ client: "", name: "", type: "Website", cost: "", start: todayISO(), expected: "", stage: "Lead", notes: "", ...initial }));
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.name.trim().length > 0;
  const save = () => { if (!valid) return; onSave({ ...initial, id: initial?.id || uid(), client: f.client.trim(), name: f.name.trim(), type: f.type, cost: Number(f.cost) || 0, start: f.start, expected: f.expected, stage: f.stage, notes: f.notes.trim(), createdAt: initial?.createdAt || Date.now() }); onClose(); };
  return (
    <Modal title={initial?.id ? "Edit project" : "New project"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Save project</button></>}>
      <div className="grid2">
        <Field label="Project name" required><input className="input" value={f.name} onChange={(e) => up("name", e.target.value)} placeholder="E-commerce site" /></Field>
        <Field label="Client name"><input className="input" value={f.client} onChange={(e) => up("client", e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Project type"><select className="select" value={f.type} onChange={(e) => up("type", e.target.value)}>{["Website", "Mobile App", "Software", "Other"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Cost"><input className="input mono" type="number" min="0" value={f.cost} onChange={(e) => up("cost", e.target.value)} placeholder="50000" /></Field>
      </div>
      <div className="grid2">
        <Field label="Start date"><input className="input" type="date" value={f.start} onChange={(e) => up("start", e.target.value)} /></Field>
        <Field label="Expected completion"><input className="input" type="date" value={f.expected} onChange={(e) => up("expected", e.target.value)} /></Field>
      </div>
      <Field label="Stage"><select className="select" value={f.stage} onChange={(e) => up("stage", e.target.value)}>{PROJECT_STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => up("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function StudentForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => ({ name: "", phone: "", course: "", joinDate: todayISO(), fee: "", paymentStatus: "Unpaid", notes: "", ...initial }));
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.name.trim().length > 0;
  const save = () => { if (!valid) return; onSave({ ...initial, id: initial?.id || uid(), name: f.name.trim(), phone: f.phone.trim(), course: f.course.trim(), joinDate: f.joinDate, fee: Number(f.fee) || 0, paymentStatus: f.paymentStatus, notes: f.notes.trim(), createdAt: initial?.createdAt || Date.now() }); onClose(); };
  return (
    <Modal title={initial?.id ? "Edit student" : "New student"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Save student</button></>}>
      <div className="grid2">
        <Field label="Student name" required><input className="input" value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
        <Field label="Phone number"><input className="input" value={f.phone} onChange={(e) => up("phone", e.target.value)} placeholder="+91…" /></Field>
      </div>
      <div className="grid2">
        <Field label="Course name"><input className="input" value={f.course} onChange={(e) => up("course", e.target.value)} placeholder="Full-stack web dev" /></Field>
        <Field label="Joining date"><input className="input" type="date" value={f.joinDate} onChange={(e) => up("joinDate", e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Fee amount"><input className="input mono" type="number" min="0" value={f.fee} onChange={(e) => up("fee", e.target.value)} /></Field>
        <Field label="Payment status"><select className="select" value={f.paymentStatus} onChange={(e) => up("paymentStatus", e.target.value)}>{["Unpaid", "Partial", "Paid"].map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => up("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function MarketingForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => ({ client: "", business: "", plan: "", monthlyFee: "", startDate: todayISO(), notes: "", ...initial }));
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.client.trim().length > 0;
  const save = () => { if (!valid) return; onSave({ ...initial, id: initial?.id || uid(), client: f.client.trim(), business: f.business.trim(), plan: f.plan.trim(), monthlyFee: Number(f.monthlyFee) || 0, startDate: f.startDate, notes: f.notes.trim(), createdAt: initial?.createdAt || Date.now() }); onClose(); };
  return (
    <Modal title={initial?.id ? "Edit marketing client" : "New marketing client"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Save client</button></>}>
      <div className="grid2">
        <Field label="Client name" required><input className="input" value={f.client} onChange={(e) => up("client", e.target.value)} /></Field>
        <Field label="Business name"><input className="input" value={f.business} onChange={(e) => up("business", e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Plan name"><input className="input" value={f.plan} onChange={(e) => up("plan", e.target.value)} placeholder="Growth / Social" /></Field>
        <Field label="Monthly fee"><input className="input mono" type="number" min="0" value={f.monthlyFee} onChange={(e) => up("monthlyFee", e.target.value)} /></Field>
      </div>
      <Field label="Start date"><input className="input" type="date" value={f.startDate} onChange={(e) => up("startDate", e.target.value)} /></Field>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => up("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function ConceptForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => ({ title: "", notes: "", date: todayISO(), ...initial, tags: Array.isArray(initial?.tags) ? initial.tags.join(", ") : initial?.tags || "" }));
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length > 0;
  const save = () => { if (!valid) return; onSave({ ...initial, id: initial?.id || uid(), title: f.title.trim(), notes: f.notes.trim(), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), date: f.date, createdAt: initial?.createdAt || Date.now() }); onClose(); };
  return (
    <Modal title={initial?.id ? "Edit idea" : "New idea"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Save idea</button></>}>
      <Field label="Title" required><input className="input" value={f.title} onChange={(e) => up("title", e.target.value)} placeholder="Subscription billing tool" /></Field>
      <Field label="Detailed notes"><textarea className="textarea" style={{ minHeight: 120 }} value={f.notes} onChange={(e) => up("notes", e.target.value)} placeholder="Flesh out the idea…" /></Field>
      <div className="grid2">
        <Field label="Tags" hint="Comma separated"><input className="input" value={f.tags} onChange={(e) => up("tags", e.target.value)} placeholder="saas, future, B2B" /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => up("date", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PAGES
══════════════════════════════════════════════════════════════════════ */
function Dashboard({ db, bal, go, openBalance }) {
  const m = monthStats(db);
  const pending = db.tasks.filter((t) => t.status !== "Completed").length;
  const active = db.projects.filter((p) => p.stage !== "Completed").length;
  const recent = [...db.audit].slice(-8).reverse();
  return (
    <div className="content">
      <div className="page-head"><h3>Dashboard</h3></div>

      <div className="card stat" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div><div className="lbl"><Wallet size={14} /> Company balance</div>
          <div className="num mono" style={{ color: bal.company < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal.company)}</div>
          <div className="sub">Haji balance + Alim balance</div></div>
        <span style={{ flex: 1, minWidth: 20 }} />
        <div style={{ minWidth: 220 }}>
          <SplitBar
            h={bal.company > 0 ? Math.max(0, Math.round((bal.Haji / bal.company) * 100)) : 50}
            a={bal.company > 0 ? Math.max(0, Math.round((bal.Alim / bal.company) * 100)) : 50}
            legend={false} />
          <div className="split-legend" style={{ marginTop: 8 }}>
            <span><span className="dot" style={{ background: "var(--haji)" }} /> Haji {money(bal.Haji)}</span>
            <span><span className="dot" style={{ background: "var(--alim)" }} /> Alim {money(bal.Alim)}</span>
          </div>
        </div>
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 14 }}>
        {USERS.map((u) => (
          <div key={u} className="card balance-card" onClick={() => openBalance(u)}>
            <div className="stripe" style={{ background: avatarColor(u) }} />
            <div className="who"><span className="dot" style={{ background: avatarColor(u) }} /> {u} balance</div>
            <div className="amt mono" style={{ color: bal[u] < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal[u])}</div>
            <div className="hint">View full breakdown <ChevronRight size={13} /></div>
          </div>
        ))}
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 18 }}>
        <div className="card stat"><div className="lbl"><TrendingUp size={14} /> Monthly revenue</div><div className="num mono pos-txt">{money(m.rev)}</div></div>
        <div className="card stat"><div className="lbl"><TrendingUp size={14} style={{ transform: "scaleY(-1)" }} /> Monthly expenses</div><div className="num mono neg-txt">{money(m.exp)}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => go("tasks")}><div className="lbl"><ListTodo size={14} /> Pending tasks</div><div className="num">{pending}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => go("projects")}><div className="lbl"><FolderKanban size={14} /> Active projects</div><div className="num">{active}</div></div>
      </div>

      <div className="card">
        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>Recent activity</div>
        {recent.length === 0 ? (
          <Empty icon={<ScrollText size={22} color="var(--muted)" />} title="Nothing here yet" text="Your activity feed fills up as you and your partner work." />
        ) : recent.map((a) => (
          <div key={a.id} className="item-row">
            <div className="avatar" style={{ background: avatarColor(a.user), width: 28, height: 28, fontSize: 11 }}>{a.user[0]}</div>
            <div className="item-main"><div className="item-title" style={{ fontWeight: 500, fontSize: 14 }}><b>{a.user}</b> {a.action}</div>
              <div className="item-meta"><span>{a.module}</span><span>{fmtTime(a.ts)}</span></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BalanceDetail({ db, user, onClose, onFull }) {
  const rows = useMemo(() => ledgerFor(db, user), [db, user]);
  const final = rows.length ? rows[rows.length - 1].running : 0;
  return (
    <Modal title={`${user} — balance breakdown`} onClose={onClose}
      footer={<>
        {onFull && <button className="btn" onClick={() => { onClose(); onFull(user); }}><ExternalLink size={15} />Open full view</button>}
        <button className="btn primary" onClick={onClose}>Close</button>
      </>}>
      <div className="calc-box" style={{ marginBottom: 4 }}>
        <div className="calc-row"><span style={{ color: "var(--muted)" }}>Current balance</span>
          <span className="mono" style={{ fontWeight: 800, fontSize: 18, color: final < 0 ? "var(--neg)" : "var(--ink)" }}>{money(final)}</span></div>
      </div>
      {rows.length === 0 ? <Empty icon={<Wallet size={22} color="var(--muted)" />} title="No movements yet" text="Income, expenses and withdrawals for this partner will appear here." /> : (
        <div style={{ overflowX: "auto", margin: "0 -20px -20px" }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Client / item</th><th>Type</th><th>%</th><th className="num-cell">Credited</th><th className="num-cell">Debited</th><th className="num-cell">Balance</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                  <td><div style={{ fontWeight: 600 }}>{r.project}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{r.client}</div></td>
                  <td><span className={"badge " + (r.type === "Income" ? "pos" : r.type === "Expense" ? "neg" : "")}>{r.type}</span></td>
                  <td className="mono">{r.pct}%</td>
                  <td className="num-cell mono pos-txt">{r.credited ? money(r.credited) : "—"}</td>
                  <td className="num-cell mono neg-txt">{r.debited ? money(r.debited) : "—"}</td>
                  <td className="num-cell mono" style={{ fontWeight: 700, color: r.running < 0 ? "var(--neg)" : "var(--ink)" }}>{money(r.running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ── exports (Excel / PDF) ──────────────────────────────────────────────────
   The export libraries are fetched on demand from a CDN, so they are NOT npm
   or build dependencies — nothing to install, nothing to bundle, and the app
   loads fine without them. They're only downloaded the moment you export.
   (Loaded via a variable URL so the bundler treats them as runtime-external.) */
const EXPORT_CDN = {
  xlsx: "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs",
  jspdf: "https://esm.sh/jspdf@2.5.2",
  autotable: "https://esm.sh/jspdf-autotable@3.8.4",
};
async function exportRowsToExcel(filename, sheetName, columns, rows) {
  try {
    const mod = await import(/* @vite-ignore */ EXPORT_CDN.xlsx);
    const XLSX = mod.utils ? mod : (mod.default || mod);
    const aoa = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => c.value(r)))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = columns.map((c) => ({ wch: c.w || 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (sheetName || "Sheet1").slice(0, 31));
    XLSX.writeFile(wb, filename);
  } catch (e) { console.error(e); alert("Couldn't build the Excel file — the export library failed to load. Check your internet connection and try again."); }
}
async function exportRowsToPDF(filename, title, subtitle, columns, rows) {
  try {
    const jspdfMod = await import(/* @vite-ignore */ EXPORT_CDN.jspdf);
    const jsPDF = jspdfMod.jsPDF || jspdfMod.default;
    const autoTable = (await import(/* @vite-ignore */ EXPORT_CDN.autotable)).default;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(15); doc.text(title, 40, 40);
    if (subtitle) { doc.setFontSize(10); doc.setTextColor(120); doc.text(subtitle, 40, 58); doc.setTextColor(0); }
    autoTable(doc, {
      head: [columns.map((c) => c.label)],
      body: rows.map((r) => columns.map((c) => { const v = c.value(r); return v === "" || v == null ? "" : String(v); })),
      startY: 72, styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [16, 159, 142], textColor: 255 },
      alternateRowStyles: { fillColor: [244, 247, 249] },
    });
    doc.save(filename);
  } catch (e) { console.error(e); alert("Couldn't build the PDF — the export library failed to load. Check your internet connection and try again."); }
}

/* ── spreadsheet import (Excel / CSV / Google Sheets export) ────────────────
   Reads an .xlsx/.xls/.csv file with SheetJS (same CDN as export), auto-maps
   columns to fields by header name, and appends records to a chosen module.
   Google Sheets: File → Download → .xlsx or .csv, then upload here. */
async function loadXLSX() {
  const m = await import(/* @vite-ignore */ EXPORT_CDN.xlsx);
  return m.utils ? m : (m.default || m);
}
const impNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function impPick(row, labels) {
  const keys = Object.keys(row);
  for (const lab of labels) {
    const nl = impNorm(lab);
    const hit = keys.find((k) => impNorm(k) === nl);
    if (hit !== undefined && row[hit] !== "" && row[hit] != null) return row[hit];
  }
  return "";
}
const impNum = (v) => { const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
const impClamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function impISO(v) {
  if (v === "" || v == null) return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // assume day/month/year (India)
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
  const t = Date.parse(s); return isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}
function impPay(v) { const s = String(v).toLowerCase(); if (s.includes("partial")) return "Partial"; if (s.includes("paid") && !s.includes("un")) return "Paid"; return "Unpaid"; }
function impStatus(v) { const s = impNorm(v); if (s.includes("complete") || s === "done") return "Completed"; if (s.includes("progress")) return "In Progress"; if (s.includes("accept")) return "Accepted"; return "Created"; }
function impPriority(v) { const s = String(v).toLowerCase(); if (s.includes("urgent")) return "Urgent"; if (s.includes("high")) return "High"; if (s.includes("low")) return "Low"; return "Medium"; }
function impUser(v) { const s = String(v).trim().toLowerCase(); return s.startsWith("a") ? "Alim" : "Haji"; }

const buildTxn = (kind) => (row) => {
  const amount = impNum(impPick(row, ["amount", "value", "total", "price", "fee", kind]));
  if (!amount) return null;
  const hp = impPick(row, ["haji", "haji%", "hajipct", "hajipercent", "hajishare"]);
  const haji = hp === "" ? 50 : impClamp(impNum(hp), 0, 100);
  return {
    id: uid(), kind,
    client: String(impPick(row, ["client", "clientname", "customer"]) || "").trim(),
    project: String(impPick(row, ["project", "projectname", "source", "work", "description"]) || "").trim(),
    amount, date: impISO(impPick(row, ["date", "day"])) || todayISO(),
    category: String(impPick(row, ["category", "cat", "head"]) || (kind === "income" ? "Project" : "Other")).trim() || (kind === "income" ? "Project" : "Other"),
    hajiPct: haji, alimPct: 100 - haji,
    notes: String(impPick(row, ["notes", "note", "remark", "remarks", "details"]) || "").trim(),
    createdAt: Date.now(),
  };
};

const IMPORT_TARGETS = [
  { id: "income", label: "Accounts — income", table: "transactions", headers: ["Date", "Client", "Project", "Category", "Amount", "Haji %", "Alim %", "Notes"],
    example: { Date: "2025-04-12", Client: "Sun Textiles", Project: "Website redesign", Category: "Project", Amount: 50000, "Haji %": 50, "Alim %": 50, Notes: "Advance" }, build: buildTxn("income") },
  { id: "expense", label: "Accounts — expenses", table: "transactions", headers: ["Date", "Client", "Project", "Category", "Amount", "Haji %", "Alim %", "Notes"],
    example: { Date: "2025-04-12", Client: "", Project: "", Category: "Office Rent", Amount: 12000, "Haji %": 50, "Alim %": 50, Notes: "April rent" }, build: buildTxn("expense") },
  { id: "withdrawals", label: "Withdrawals", table: "withdrawals", headers: ["Date", "Partner", "Amount", "Notes"],
    example: { Date: "2025-04-20", Partner: "Haji", Amount: 10000, Notes: "Personal" },
    build: (row) => { const amount = impNum(impPick(row, ["amount", "value", "withdrawal"])); if (!amount) return null; return { id: uid(), user: impUser(impPick(row, ["partner", "user", "who", "name", "member"])), amount, date: impISO(impPick(row, ["date", "day"])) || todayISO(), notes: String(impPick(row, ["notes", "note", "remark", "reason"]) || "").trim(), createdAt: Date.now() }; } },
  { id: "projects", label: "Projects", table: "projects", headers: ["Name", "Client", "Type", "Cost", "Start date", "Expected completion", "Stage", "Notes"],
    example: { Name: "E-commerce site", Client: "Sun Textiles", Type: "Website", Cost: 80000, "Start date": "2025-03-01", "Expected completion": "2025-05-01", Stage: "Development", Notes: "" },
    build: (row) => { const name = String(impPick(row, ["name", "project", "projectname", "title"]) || "").trim(); if (!name) return null; return { id: uid(), name, client: String(impPick(row, ["client", "clientname", "customer"]) || "").trim(), type: String(impPick(row, ["type", "projecttype"]) || "Website").trim() || "Website", cost: impNum(impPick(row, ["cost", "amount", "price", "value", "budget"])), start: impISO(impPick(row, ["start", "startdate", "begin"])), expected: impISO(impPick(row, ["expected", "due", "deadline", "expectedcompletion", "enddate", "completion"])), stage: String(impPick(row, ["stage", "status", "phase"]) || "Lead").trim() || "Lead", notes: String(impPick(row, ["notes", "note", "remark", "remarks", "description"]) || "").trim(), createdAt: Date.now() }; } },
  { id: "students", label: "Courses / students", table: "students", headers: ["Name", "Phone", "Course", "Joining date", "Fee", "Payment status", "Notes"],
    example: { Name: "Asha R", Phone: "+91 90000 00000", Course: "Full-stack web dev", "Joining date": "2025-02-15", Fee: 25000, "Payment status": "Partial", Notes: "" },
    build: (row) => { const name = String(impPick(row, ["name", "student", "studentname"]) || "").trim(); if (!name) return null; return { id: uid(), name, phone: String(impPick(row, ["phone", "mobile", "contact", "number", "phoneno"]) || "").trim(), course: String(impPick(row, ["course", "coursename", "program", "batch"]) || "").trim(), joinDate: impISO(impPick(row, ["joindate", "joined", "joiningdate", "date", "enrolled"])), fee: impNum(impPick(row, ["fee", "amount", "cost", "fees"])), paymentStatus: impPay(impPick(row, ["paymentstatus", "status", "payment", "paid"])), notes: String(impPick(row, ["notes", "note", "remark"]) || "").trim(), createdAt: Date.now() }; } },
  { id: "marketing", label: "Marketing clients", table: "marketing", headers: ["Client", "Business", "Plan", "Monthly fee", "Start date", "Notes"],
    example: { Client: "GreenLeaf", Business: "GreenLeaf Cafe", Plan: "Social — Growth", "Monthly fee": 15000, "Start date": "2025-01-10", Notes: "" },
    build: (row) => { const client = String(impPick(row, ["client", "clientname", "customer", "name"]) || "").trim(); if (!client) return null; return { id: uid(), client, business: String(impPick(row, ["business", "businessname", "company"]) || "").trim(), plan: String(impPick(row, ["plan", "planname", "package", "service"]) || "").trim(), monthlyFee: impNum(impPick(row, ["monthlyfee", "fee", "amount", "monthly", "retainer", "price"])), startDate: impISO(impPick(row, ["startdate", "start", "since", "date"])), notes: String(impPick(row, ["notes", "note", "remark"]) || "").trim(), createdAt: Date.now() }; } },
  { id: "concepts", label: "Concepts / ideas", table: "concepts", headers: ["Title", "Notes", "Tags", "Date"],
    example: { Title: "Subscription billing tool", Notes: "Recurring invoices for retainer clients", Tags: "saas, future", Date: "2025-04-01" },
    build: (row) => { const title = String(impPick(row, ["title", "idea", "name", "concept"]) || "").trim(); if (!title) return null; return { id: uid(), title, notes: String(impPick(row, ["notes", "note", "details", "description"]) || "").trim(), tags: String(impPick(row, ["tags", "tag", "labels"]) || "").split(/[,;]/).map((t) => t.trim()).filter(Boolean), date: impISO(impPick(row, ["date", "day"])) || todayISO(), createdAt: Date.now() }; } },
  { id: "tasks", label: "Tasks", table: "tasks", headers: ["Title", "Description", "Assigned by", "Assigned to", "Due date", "Priority", "Status", "Progress"],
    example: { Title: "Design landing page", Description: "Full mockup + responsive", "Assigned by": "Haji", "Assigned to": "Alim", "Due date": "2025-05-10", Priority: "High", Status: "In Progress", Progress: 40 },
    build: (row, ctx) => { const title = String(impPick(row, ["title", "task", "taskname", "name"]) || "").trim(); if (!title) return null; const by = String(impPick(row, ["assignedby", "by", "creator", "from"]) || ctx.currentUser || "Haji").trim() || ctx.currentUser; const toRaw = String(impPick(row, ["assignedto", "to", "assignee", "owner", "for"]) || "").trim(); const tl = toRaw.toLowerCase(); const assignedTo = (tl.includes("&") || tl.includes("both") || tl.includes("haji and alim")) ? COMBINED : tl.startsWith("h") ? "Haji" : tl.startsWith("a") ? "Alim" : (toRaw || ctx.currentUser); const status = impStatus(impPick(row, ["status", "stage"])); const progress = impClamp(impNum(impPick(row, ["progress", "percent", "percentage", "done"])), 0, 100); return { id: uid(), title, desc: String(impPick(row, ["desc", "description", "details", "notes"]) || "").trim(), assignedBy: by, assignedTo, due: impISO(impPick(row, ["due", "duedate", "deadline", "date"])), priority: impPriority(impPick(row, ["priority", "importance"])), status, progress: status === "Completed" ? 100 : progress, history: [{ status: "Created", at: Date.now(), by }], comments: [], attachments: [], createdAt: Date.now() }; } },
];

function ImportData({ mutate, currentUser, onClose }) {
  const [targetId, setTargetId] = useState("income");
  const [rows, setRows] = useState(null);   // raw parsed objects
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(0);
  const fileRef = useRef(null);
  const target = IMPORT_TARGETS.find((t) => t.id === targetId);
  const ctx = { currentUser };

  const built = useMemo(() => (rows ? rows.map((r) => target.build(r, ctx)).filter(Boolean) : []), [rows, targetId]); // eslint-disable-line
  const previewKeys = built.length ? Object.keys(built[0]).filter((k) => !["id", "createdAt", "history", "comments", "attachments"].includes(k)) : [];

  const pickFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setErr(""); setDone(0); setRows(null); setBusy(true); setFileName(file.name);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
      if (!parsed.length) setErr("That sheet looks empty. Make sure the first row is a header row.");
      setRows(parsed);
    } catch (e2) { console.error(e2); setErr("Couldn't read that file. Use .xlsx, .xls or .csv (Google Sheets → File → Download)."); }
    finally { setBusy(false); }
  };

  const downloadTemplate = async () => {
    await exportRowsToExcel(`allbee-${target.id}-template.xlsx`, target.label, target.headers.map((h) => ({ label: h, w: 16, value: (r) => r[h] ?? "" })), [target.example]);
  };

  const doImport = () => {
    if (!built.length) return;
    const recs = built;
    mutate((d) => ({ ...d, [target.table]: [...d[target.table], ...recs] }), { action: `imported ${recs.length} record${recs.length === 1 ? "" : "s"} into ${target.label}`, module: "Settings" });
    setDone(recs.length); setRows(null); setFileName("");
  };

  return (
    <Modal title="Import from Excel / Google Sheets" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={doImport} disabled={!built.length}><Upload size={16} />{built.length ? `Import ${built.length} record${built.length === 1 ? "" : "s"}` : "Import"}</button></>}>
      {done > 0 && <div className="calc-box" style={{ borderColor: "var(--pos)", marginBottom: 14 }}><div className="calc-row" style={{ color: "var(--pos)", fontWeight: 700 }}><Check size={15} /> Imported {done} record{done === 1 ? "" : "s"} into {target.label}.</div></div>}

      <Field label="What are you importing?">
        <select className="select" value={targetId} onChange={(e) => { setTargetId(e.target.value); setRows(null); setDone(0); setErr(""); }}>
          {IMPORT_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Field>

      <div className="hint-line" style={{ lineHeight: 1.55, margin: "2px 0 12px" }}>
        Your sheet's first row should be column headers. Expected columns:{" "}
        <b>{target.headers.join(", ")}</b>. Column order doesn't matter and extra columns are ignored.{" "}
        <button className="ttl-link" style={{ fontSize: 12.5, fontWeight: 600 }} onClick={downloadTemplate}><Download size={12} style={{ verticalAlign: -2 }} /> Download a template</button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Sheet size={16} />{busy ? "Reading…" : "Choose .xlsx / .csv file"}</button>
        {fileName && <span className="hint-line">{fileName}</span>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={pickFile} style={{ display: "none" }} />
      </div>

      {err && <div className="hint-line" style={{ color: "var(--neg)", display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}><AlertTriangle size={13} />{err}</div>}

      {rows && built.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="hint-line" style={{ marginBottom: 8 }}>Found <b>{rows.length}</b> row{rows.length === 1 ? "" : "s"}; <b>{built.length}</b> ready to import{rows.length !== built.length ? ` (${rows.length - built.length} skipped — missing a required value)` : ""}. Preview:</div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead><tr>{previewKeys.map((k) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>{built.slice(0, 6).map((r, i) => (
                <tr key={i}>{previewKeys.map((k) => <td key={k} className={typeof r[k] === "number" ? "mono" : ""}>{Array.isArray(r[k]) ? r[k].join(", ") : String(r[k] ?? "")}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          {built.length > 6 && <div className="hint-line" style={{ marginTop: 6 }}>…and {built.length - 6} more.</div>}
        </div>
      )}
      {rows && built.length === 0 && !err && <div className="hint-line" style={{ color: "var(--neg)", marginTop: 10 }}>No importable rows found — check that your headers match and required values (like an amount or a name) are filled in.</div>}
    </Modal>
  );
}

function AccountFull({ db, user, goBack }) {
  const all = useMemo(() => ledgerFor(db, user), [db, user]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("all");
  const [project, setProject] = useState("all");
  const [category, setCategory] = useState("all");

  const clients = useMemo(() => Array.from(new Set(all.map((r) => r.client).filter((c) => c && c !== "—"))).sort(), [all]);
  const projects = useMemo(() => Array.from(new Set(all.map((r) => r.project).filter(Boolean))).sort(), [all]);
  const categories = useMemo(() => Array.from(new Set(all.map((r) => r.category).filter(Boolean))).sort(), [all]);

  const rows = useMemo(() => all.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (client !== "all" && r.client !== client) return false;
    if (project !== "all" && r.project !== project) return false;
    if (category !== "all" && r.category !== category) return false;
    return true;
  }), [all, from, to, client, project, category]);

  const filtered = from || to || client !== "all" || project !== "all" || category !== "all";
  const currentBalance = all.length ? all[all.length - 1].running : 0;
  const totIncome = round2(rows.filter((r) => r.type === "Income").reduce((s, r) => s + r.credited, 0));
  const totExpense = round2(rows.filter((r) => r.type === "Expense").reduce((s, r) => s + r.debited, 0));
  const totWithdraw = round2(rows.filter((r) => r.type === "Withdrawal").reduce((s, r) => s + r.debited, 0));
  const net = round2(totIncome - totExpense - totWithdraw);

  const columns = [
    { label: "Date", w: 12, value: (r) => fmtDate(r.date) },
    { label: "Client", w: 18, value: (r) => r.client },
    { label: "Project", w: 22, value: (r) => r.project },
    { label: "Category", w: 14, value: (r) => r.category },
    { label: "Income (₹)", w: 12, value: (r) => (r.income != null ? round2(r.income) : "") },
    { label: "Expense (₹)", w: 12, value: (r) => (r.expense != null ? round2(r.expense) : "") },
    { label: "Share %", w: 9, value: (r) => r.pct },
    { label: "Credited (₹)", w: 12, value: (r) => (r.credited ? round2(r.credited) : "") },
    { label: "Debited (₹)", w: 12, value: (r) => (r.debited ? round2(r.debited) : "") },
    { label: "Running balance (₹)", w: 14, value: (r) => round2(r.running) },
    { label: "Notes", w: 26, value: (r) => r.notes || "" },
  ];
  const sub = `${user} · generated ${fmtDate(todayISO())}${filtered ? " · filtered view" : ""}`;
  const doExcel = () => exportRowsToExcel(`allbee-${user.toLowerCase()}-account-${todayISO()}.xlsx`, `${user} account`, columns, rows);
  const doPDF = () => exportRowsToPDF(`allbee-${user.toLowerCase()}-account-${todayISO()}.pdf`, `ALLBEE — ${user} account statement`, sub, columns, rows);
  const clear = () => { setFrom(""); setTo(""); setClient("all"); setProject("all"); setCategory("all"); };

  const SUMMARY = [
    ["Current balance", currentBalance, <Wallet size={13} />, true],
    ["Total income", totIncome, <ArrowRight size={13} />, false],
    ["Total expenses", totExpense, <ArrowRight size={13} />, false],
    ["Total withdrawals", totWithdraw, <ArrowDownToLine size={13} />, false],
    ["Net balance", net, <TrendingUp size={13} />, true],
  ];

  return (
    <div className="content">
      <button className="backlink" onClick={goBack}><ArrowLeft size={15} />Back to Share &amp; accounts</button>
      <div className="detail-head">
        <span className="avatar" style={{ background: avatarColor(user), width: 40, height: 40, fontSize: 17 }}>{user[0]}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3>{user} — account statement</h3>
          <div className="topbar-sub">Full balance breakdown for {user}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={doExcel}><Sheet size={15} />Export Excel</button>
          <button className="btn" onClick={doPDF}><FileText size={15} />Export PDF</button>
        </div>
      </div>

      <div className="sumrow">
        {SUMMARY.map(([k, v, ic, strong]) => (
          <div key={k} className="card">
            <div className="k">{ic} {k}</div>
            <div className="v mono" style={{ color: strong ? (v < 0 ? "var(--neg)" : "var(--ink)") : (k === "Total income" ? "var(--pos)" : k === "Current balance" || k === "Net balance" ? undefined : "var(--neg)") }}>{money(v)}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="lbl" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}><Filter size={14} /> Filters</div>
        <div className="filterbar">
          <Field label="From date"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To date"><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Client"><select className="select" value={client} onChange={(e) => setClient(e.target.value)}><option value="all">All clients</option>{clients.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Project"><select className="select" value={project} onChange={(e) => setProject(e.target.value)}><option value="all">All projects</option>{projects.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Category"><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <span className="hint-line">{rows.length} of {all.length} entries{filtered ? " · totals above reflect these filters" : ""}</span>
          {filtered && <button className="btn sm ghost" onClick={clear}><X size={13} />Clear filters</button>}
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <Empty icon={<Wallet size={22} color="var(--muted)" />} title={all.length ? "No entries match these filters" : "No movements yet"}
            text={all.length ? "Try widening the date range or clearing a filter." : "Income, expenses and withdrawals for this partner will appear here."}
            action={filtered ? <button className="btn" onClick={clear}>Clear filters</button> : undefined} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr>
                <th>Date</th><th>Client</th><th>Project</th><th>Category</th>
                <th className="num-cell">Income</th><th className="num-cell">Expense</th><th>Share %</th>
                <th className="num-cell">Credited</th><th className="num-cell">Debited</th><th className="num-cell">Running</th><th>Notes</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                    <td>{r.client}</td>
                    <td style={{ fontWeight: 600 }}>{r.project}</td>
                    <td><span className="tag">{r.category}</span></td>
                    <td className="num-cell mono pos-txt">{r.income != null ? money(r.income) : "—"}</td>
                    <td className="num-cell mono neg-txt">{r.expense != null ? money(r.expense) : "—"}</td>
                    <td className="mono">{r.pct}%</td>
                    <td className="num-cell mono pos-txt">{r.credited ? money(r.credited) : "—"}</td>
                    <td className="num-cell mono neg-txt">{r.debited ? money(r.debited) : "—"}</td>
                    <td className="num-cell mono" style={{ fontWeight: 700, color: r.running < 0 ? "var(--neg)" : "var(--ink)" }}>{money(r.running)}</td>
                    <td style={{ color: "var(--muted)", fontSize: 13, maxWidth: 220 }}>{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Accounts({ db, bal, mutate, openModal, openBalance, removeItem }) {
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    let r = [...db.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    if (view !== "all") r = r.filter((t) => t.kind === view);
    if (q.trim()) { const s = q.toLowerCase(); r = r.filter((t) => [t.client, t.project, t.category, t.notes].join(" ").toLowerCase().includes(s)); }
    return r;
  }, [db.transactions, view, q]);

  const del = (t) => removeItem("transactions", t, { name: `${t.kind === "income" ? "Income" : "Expense"} ${money(t.amount)}${t.client ? " · " + t.client : ""}`, audit: `deleted a ${t.kind} of ${money(t.amount)}` });

  return (
    <div className="content">
      <div className="page-head"><h3>Share & accounts</h3><span className="spacer" />
        <button className="btn" onClick={() => openModal({ type: "importData" })}><Sheet size={16} />Import</button>
        <button className="btn" onClick={() => openModal({ type: "expense" })}><Plus size={16} />Add expense</button>
        <button className="btn primary" onClick={() => openModal({ type: "income" })}><Plus size={16} />Add income</button>
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 16 }}>
        <div className="card balance-card" onClick={() => openBalance("Haji")}><div className="stripe" style={{ background: "var(--haji)" }} />
          <div className="who"><span className="dot" style={{ background: "var(--haji)" }} /> Haji</div>
          <div className="amt mono" style={{ fontSize: 24, color: bal.Haji < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal.Haji)}</div>
          <div className="hint">Breakdown <ChevronRight size={13} /></div></div>
        <div className="card balance-card" onClick={() => openBalance("Alim")}><div className="stripe" style={{ background: "var(--alim)" }} />
          <div className="who"><span className="dot" style={{ background: "var(--alim)" }} /> Alim</div>
          <div className="amt mono" style={{ fontSize: 24, color: bal.Alim < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal.Alim)}</div>
          <div className="hint">Breakdown <ChevronRight size={13} /></div></div>
        <div className="card stat"><div className="lbl"><Wallet size={14} /> Company</div>
          <div className="num mono" style={{ color: bal.company < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal.company)}</div>
          <div className="sub">{db.transactions.length} entries recorded</div></div>
      </div>

      <div className="toolbar">
        <div className="search"><Search size={16} color="var(--muted)" /><input placeholder="Search client, project, notes…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="seg">{[["all", "All"], ["income", "Income"], ["expense", "Expenses"]].map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
      </div>

      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<Wallet size={22} color="var(--muted)" />} title="No entries yet" text="Record your first income or expense to start tracking the partner split."
            action={<button className="btn primary" onClick={() => openModal({ type: "income" })}><Plus size={16} />Add income</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Client / project</th><th>Category</th><th className="num-cell">Amount</th><th>Split</th><th></th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                    <td><div style={{ fontWeight: 600 }}>{t.project || t.client || "—"}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{t.client || ""}</div></td>
                    <td><span className={"badge " + (t.kind === "income" ? "pos" : "neg")}>{t.kind === "income" ? "Income" : "Expense"}</span> <span className="tag">{t.category}</span></td>
                    <td className={"num-cell mono " + (t.kind === "income" ? "pos-txt" : "neg-txt")} style={{ fontWeight: 700 }}>{money(t.kind === "income" ? t.amount : -t.amount, { sign: t.kind === "income" })}</td>
                    <td style={{ minWidth: 130 }}><SplitBar h={t.hajiPct} a={t.alimPct} legend={false} /><div className="split-legend"><span>H {t.hajiPct}%</span><span>A {t.alimPct}%</span></div></td>
                    <td><div className="row-actions">
                      <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: t.kind, initial: t })}><Pencil size={14} /></button>
                      <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete entry?", body: `Remove this ${t.kind} of ${money(t.amount)}? Balances will recalculate.`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(t) })}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Withdrawals({ db, bal, mutate, openModal, removeItem }) {
  const list = [...db.withdrawals].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const del = (w) => removeItem("withdrawals", w, { name: `Withdrawal ${money(w.amount)} · ${w.user}`, audit: `deleted a withdrawal of ${money(w.amount)}` });
  return (
    <div className="content">
      <div className="page-head"><h3>Withdrawals</h3><span className="spacer" />
        <button className="btn primary" onClick={() => openModal({ type: "withdraw" })}><Plus size={16} />Record withdrawal</button></div>

      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 16 }}>
        {USERS.map((u) => (
          <div key={u} className="card stat"><div className="lbl"><span className="dot" style={{ background: avatarColor(u) }} /> {u} available</div>
            <div className="num mono" style={{ color: bal[u] < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal[u])}</div>
            {bal[u] < 0 && <div className="sub neg-txt">Negative — to be settled by future profit share</div>}</div>
        ))}
      </div>

      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<ArrowDownToLine size={22} color="var(--muted)" />} title="No withdrawals yet" text="A partner can withdraw up to their current balance. Expense allocation can later push a balance negative — future income settles it automatically." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Partner</th><th className="num-cell">Amount</th><th>Notes</th><th></th></tr></thead>
              <tbody>{list.map((w) => (
                <tr key={w.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(w.date)}</td>
                  <td><span className="badge" style={{ background: "var(--surface-2)" }}><span className="dot" style={{ background: avatarColor(w.user), display: "inline-block", marginRight: 5 }} />{w.user}</span></td>
                  <td className="num-cell mono neg-txt" style={{ fontWeight: 700 }}>{money(-w.amount)}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{w.notes || "—"}</td>
                  <td><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete withdrawal?", body: `Remove this ${money(w.amount)} withdrawal for ${w.user}?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(w) })}><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function priorityTone(p) { return p === "Urgent" || p === "High" ? "neg" : p === "Medium" ? "pri" : ""; }

function Tasks({ db, mutate, openModal, isAdmin = true, currentUser, openTask, removeItem }) {
  const [filter, setFilter] = useState("active");
  const [scope, setScope] = useState("mine"); // staff: mine | assigned
  const list = useMemo(() => {
    let r = [...db.tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!isAdmin) r = r.filter((t) => scope === "assigned" ? t.assignedBy === currentUser : (t.assignedTo === currentUser || t.assignedTo === COMBINED));
    if (filter === "active") r = r.filter((t) => t.status !== "Completed");
    else if (filter === "done") r = r.filter((t) => t.status === "Completed");
    return r;
  }, [db.tasks, filter, scope, isAdmin, currentUser]);

  const auditFor = (action) => (isAdmin ? { action, module: "Tasks" } : null);

  // advance is only ever called by the assigned person (button is gated below)
  const advance = (t) => {
    const i = TASK_FLOW.indexOf(t.status); const next = TASK_FLOW[Math.min(i + 1, TASK_FLOW.length - 1)];
    const progress = next === "Completed" ? 100 : next === "In Progress" ? Math.max(t.progress || 0, 25) : t.progress || 0;
    const history = [...(t.history || []), { status: next, at: Date.now(), by: currentUser }];
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, status: next, progress, history } : x) }), auditFor(`moved "${t.title}" to ${next}`));
  };
  const undo = (t) => {
    const history = [...(t.history || []), { status: "In Progress", at: Date.now(), by: currentUser }];
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, status: "In Progress", progress: Math.min(t.progress ?? 90, 90), history } : x) }),
      auditFor(`restored task "${t.title}" from Completed to In Progress`));
  };
  const askDelete = (t) => openModal({
    type: "deleteConfirm", title: "Delete task?",
    body: `This moves "${t.title}" to Recently deleted.`, note: "You can restore it within 60 days.",
    onConfirm: () => removeItem("tasks", t, { name: t.title, audit: `deleted task "${t.title}"` }),
  });
  const actLabel = (s) => (s === "Created" ? "Accept" : s === "Accepted" ? "Start" : "Complete");

  return (
    <div className="content">
      <div className="page-head"><h3>{isAdmin ? "Tasks" : "My tasks"}</h3><span className="spacer" />
        <button className="btn primary" onClick={() => openModal({ type: "task" })}><Plus size={16} />New task</button></div>
      <div className="toolbar">
        <div className="seg">{[["active", "Active"], ["done", "Completed"], ["all", "All"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
        {!isAdmin && <div className="seg">{[["mine", "Assigned to me"], ["assigned", "I assigned"]].map(([k, l]) => <button key={k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{l}</button>)}</div>}
      </div>

      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<ListTodo size={22} color="var(--muted)" />} title="No tasks here"
            text={isAdmin ? "Assign work to anyone on the team. Tasks move Created → Accepted → In Progress → Completed." : "Tasks assigned to you will appear here. Accept one to get started."}
            action={<button className="btn primary" onClick={() => openModal({ type: "task" })}><Plus size={16} />New task</button>} />
        ) : list.map((t) => {
          const canAct = canActOnTask(t, currentUser);
          const canEdit = canEditTask(t, currentUser, isAdmin);
          return (
            <div key={t.id} className="item-row">
              <div className="item-main">
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <button className="ttl-link" onClick={() => openTask(t.id)}>{t.title}</button>
                  <span className={"badge " + (t.status === "Completed" ? "pos" : t.status === "In Progress" ? "accent" : "pri")}>{t.status}</span>
                  {t.priority && <span className={"badge " + priorityTone(t.priority)}>{t.priority}</span>}
                </div>
                {t.desc && <div className="item-meta" style={{ marginTop: 6 }}>{t.desc.length > 140 ? t.desc.slice(0, 140) + "…" : t.desc}</div>}
                <div className="item-meta" style={{ marginTop: 6 }}>
                  <span>{t.assignedBy} → <b style={{ color: t.assignedTo === COMBINED ? "var(--ink)" : avatarColor(t.assignedTo) }}>{t.assignedTo}</b></span>
                  {t.due && <span><CalendarClock size={12} style={{ verticalAlign: -2 }} /> {fmtDate(t.due)}</span>}
                  {!canAct && t.status !== "Completed" && <span className="hint-line" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ShieldCheck size={11} />{isAdmin ? "Monitor only — " : ""}{t.assignedTo} controls status</span>}
                </div>
              </div>
              <div className="row-actions">
                {canAct && t.status !== "Completed" && <button className="btn sm primary" onClick={() => advance(t)}>{actLabel(t.status)}<ArrowRight size={13} /></button>}
                {t.status === "Completed" && (canAct || canEdit) && <button className="btn sm" onClick={() => undo(t)}><Undo2 size={13} />Undo</button>}
                <button className="iconbtn" style={{ width: 32, height: 32 }} title="Open task" onClick={() => openTask(t.id)}><ExternalLink size={14} /></button>
                {canEdit && <button className="iconbtn" style={{ width: 32, height: 32 }} title="Edit" onClick={() => openModal({ type: "task", initial: t })}><Pencil size={14} /></button>}
                {canEdit && <button className="iconbtn" style={{ width: 32, height: 32 }} title="Delete" onClick={() => askDelete(t)}><Trash2 size={14} /></button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Progress({ db, mutate, isAdmin = true, currentUser, openTask }) {
  const list = db.tasks.filter((t) => t.status === "In Progress");
  const setProgress = (t, v) => {
    const done = v >= 100;
    const history = done ? [...(t.history || []), { status: "Completed", at: Date.now(), by: currentUser }] : (t.history || []);
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, progress: v, status: done ? "Completed" : "In Progress", history } : x) }), done && isAdmin ? { action: `completed "${t.title}"`, module: "Progress" } : null);
  };
  return (
    <div className="content">
      <div className="page-head"><h3>Progress</h3></div>
      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<TrendingUp size={22} color="var(--muted)" />} title="No tasks in progress" text="Accepted tasks you start working on show up here with a completion slider. Finished tasks move to Completed automatically." />
        ) : list.map((t) => {
          const canAct = canActOnTask(t, currentUser);
          return (
            <div key={t.id} className="item-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="item-main">
                  {openTask ? <button className="ttl-link" onClick={() => openTask(t.id)}>{t.title}</button> : <div className="item-title">{t.title}</div>}
                  <div className="item-meta"><span style={{ color: t.assignedTo === COMBINED ? "var(--ink)" : avatarColor(t.assignedTo) }}>{t.assignedTo}</span>{t.due && <span>Due {fmtDate(t.due)}</span>}<span className={"badge " + priorityTone(t.priority)}>{t.priority}</span></div></div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 18 }}>{t.progress || 0}%</div>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${t.progress || 0}%` }} /></div>
              {canAct
                ? <input type="range" min="0" max="100" step="5" value={t.progress || 0} onChange={(e) => setProgress(t, Number(e.target.value))} style={{ accentColor: "var(--primary)" }} />
                : <div className="hint-line" style={{ display: "flex", alignItems: "center", gap: 5 }}><ShieldCheck size={12} />Monitoring {t.assignedTo}'s progress — only they can update it</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskDetail({ db, taskId, me, isAdmin, currentUser, mutate, openModal, removeItem, goBack }) {
  const t = db.tasks.find((x) => x.id === taskId);
  const [comment, setComment] = useState("");
  const [atLabel, setAtLabel] = useState("");
  const [atUrl, setAtUrl] = useState("");

  if (!t) {
    return (
      <div className="content">
        <button className="backlink" onClick={goBack}><ArrowLeft size={15} />Back to tasks</button>
        <div className="card"><Empty icon={<ListTodo size={22} color="var(--muted)" />} title="Task not found" text="This task may have been deleted. Check Recently deleted to restore it." /></div>
      </div>
    );
  }

  const canAct = canActOnTask(t, currentUser);
  const canEdit = canEditTask(t, currentUser, isAdmin);
  const canCollaborate = canAct || canEdit;
  const auditFor = (action) => (isAdmin ? { action, module: "Tasks" } : null);

  const advance = () => {
    const i = TASK_FLOW.indexOf(t.status); const next = TASK_FLOW[Math.min(i + 1, TASK_FLOW.length - 1)];
    const progress = next === "Completed" ? 100 : next === "In Progress" ? Math.max(t.progress || 0, 25) : t.progress || 0;
    const history = [...(t.history || []), { status: next, at: Date.now(), by: currentUser }];
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, status: next, progress, history } : x) }), auditFor(`moved "${t.title}" to ${next}`));
  };
  const undo = () => {
    const history = [...(t.history || []), { status: "In Progress", at: Date.now(), by: currentUser }];
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, status: "In Progress", progress: Math.min(t.progress ?? 90, 90), history } : x) }),
      auditFor(`restored task "${t.title}" from Completed to In Progress`));
  };
  const addComment = () => {
    const text = comment.trim(); if (!text) return;
    const c = { id: uid(), by: currentUser, text, at: Date.now() };
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, comments: [...(x.comments || []), c] } : x) }), null);
    setComment("");
  };
  const addAttachment = () => {
    const url = atUrl.trim(); if (!url) return;
    const a = { id: uid(), label: atLabel.trim() || url, url, by: currentUser, at: Date.now() };
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, attachments: [...(x.attachments || []), a] } : x) }), null);
    setAtLabel(""); setAtUrl("");
  };
  const removeAttachment = (id) => mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, attachments: (x.attachments || []).filter((a) => a.id !== id) } : x) }), null);
  const askDelete = () => openModal({
    type: "deleteConfirm", title: "Delete task?", body: `This moves "${t.title}" to Recently deleted.`, note: "You can restore it within 60 days.",
    onConfirm: () => { removeItem("tasks", t, { name: t.title, audit: `deleted task "${t.title}"` }); goBack(); },
  });

  const timeline = taskTimeline(t);
  const actLabel = t.status === "Created" ? "Accept" : t.status === "Accepted" ? "Start" : "Complete";
  const lbl = { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 12 };
  const colorFor = (n) => (n === COMBINED ? "var(--ink)" : avatarColor(n));
  const META = [
    ["Assigned by", <span style={{ color: colorFor(t.assignedBy), fontWeight: 600 }}>{t.assignedBy}</span>],
    ["Assigned to", <span style={{ color: colorFor(t.assignedTo), fontWeight: 600 }}>{t.assignedTo}</span>],
    ["Due date", t.due ? fmtDate(t.due) : "—"],
    ["Priority", t.priority || "—"],
    ["Status", t.status],
    ["Created", t.createdAt ? fmtTime(t.createdAt) : "—"],
  ];

  return (
    <div className="content">
      <button className="backlink" onClick={goBack}><ArrowLeft size={15} />Back to tasks</button>
      <div className="detail-head">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3>{t.title}</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span className={"badge " + (t.status === "Completed" ? "pos" : t.status === "In Progress" ? "accent" : "pri")}>{t.status}</span>
            {t.priority && <span className={"badge " + priorityTone(t.priority)}>{t.priority}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canAct && t.status !== "Completed" && <button className="btn primary" onClick={advance}>{actLabel}<ArrowRight size={14} /></button>}
          {t.status === "Completed" && canCollaborate && <button className="btn" onClick={undo}><Undo2 size={15} />Undo</button>}
          {canEdit && <button className="btn" onClick={() => openModal({ type: "task", initial: t })}><Pencil size={14} />Edit</button>}
          {canEdit && <button className="btn danger" onClick={askDelete}><Trash2 size={14} />Delete</button>}
        </div>
      </div>

      {!canAct && t.status !== "Completed" && (
        <div className="hint-line" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
          <ShieldCheck size={12} />{isAdmin ? "You can monitor and edit this task, but " : ""}only {t.assignedTo} can accept, start or complete it.
        </div>
      )}

      <div className="meta-grid">
        {META.map(([k, v]) => <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={lbl}><FileText size={14} /> Description</div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{t.desc ? t.desc : <span className="hint-line">No description provided.</span>}</div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={lbl}><Activity size={14} /> Activity timeline</div>
        <div className="timeline">
          {timeline.map((ev, i) => (
            <div key={i} className="tl-item">
              <span className="tl-dot" />
              <div className="what">{ev.status}{ev.by ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {ev.by}</span> : null}</div>
              <div className="when">{ev.at ? fmtTime(ev.at) : "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={lbl}><Paperclip size={14} /> Attachments</div>
        {(t.attachments || []).length > 0 && (
          <div className="attach-list" style={{ marginBottom: canCollaborate ? 12 : 0 }}>
            {t.attachments.map((a) => (
              <div key={a.id} className="attach">
                <Link2 size={15} color="var(--muted)" />
                <a href={a.url} target="_blank" rel="noreferrer">{a.label}</a>
                <span style={{ flex: 1 }} />
                <a href={a.url} target="_blank" rel="noreferrer" className="iconbtn" style={{ width: 28, height: 28 }} title="Open"><ExternalLink size={13} /></a>
                {canCollaborate && <button className="iconbtn" style={{ width: 28, height: 28 }} title="Remove" onClick={() => removeAttachment(a.id)}><X size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {(t.attachments || []).length === 0 && <div className="hint-line" style={{ marginBottom: canCollaborate ? 12 : 0 }}>No attachments yet.</div>}
        {canCollaborate && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr auto", gap: 8 }}>
              <input className="input" placeholder="Label (optional)" value={atLabel} onChange={(e) => setAtLabel(e.target.value)} />
              <input className="input" placeholder="https://link-to-file" value={atUrl} onChange={(e) => setAtUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAttachment()} />
              <button className="btn" onClick={addAttachment}><Plus size={15} />Add link</button>
            </div>
            <div className="hint-line" style={{ marginTop: 10 }}>Attach links to files (Drive, Dropbox, etc). Direct uploads can be enabled with Supabase Storage — see README.</div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16, marginBottom: 8 }}>
        <div style={lbl}><MessageSquare size={14} /> Comments</div>
        {(t.comments || []).length === 0 && <div className="hint-line">No comments yet.</div>}
        {(t.comments || []).map((c) => (
          <div key={c.id} className="comment">
            <div className="avatar" style={{ background: avatarColor(c.by), width: 30, height: 30, fontSize: 12 }}>{(c.by || "?")[0]}</div>
            <div className="body">
              <div className="who">{c.by}</div>
              <div className="txt">{c.text}</div>
              <div className="when">{fmtTime(c.at)}</div>
            </div>
          </div>
        ))}
        {canCollaborate && (
          <div className="composer">
            <textarea className="textarea" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn primary" onClick={addComment} disabled={!comment.trim()}><Send size={15} />Post</button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentlyDeleted({ db, openModal, restoreItem }) {
  const [open, setOpen] = useState({});
  const list = useMemo(() => [...(db.recycle || [])].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)), [db.recycle]);
  const daysLeft = (r) => Math.max(0, RECYCLE_TTL_DAYS - Math.floor((Date.now() - (r.deletedAt || 0)) / 86400000));
  const askRestore = (r) => openModal({
    type: "restoreConfirm", title: "Restore item?",
    body: `Restore ${r.module.toLowerCase()} "${r.name}" to its original module?`, note: "It will reappear where it was before.",
    onConfirm: () => restoreItem(r),
  });
  const detailsOf = (r) => {
    const it = r.item || {};
    const skip = new Set(["id", "createdAt", "history", "comments", "attachments", "password"]);
    return Object.entries(it).filter(([k, v]) => !skip.has(k) && v !== "" && v != null && typeof v !== "object").slice(0, 10);
  };

  return (
    <div className="content">
      <div className="page-head"><h3>Recently deleted</h3></div>
      <div className="hint-line" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <AlertTriangle size={13} /> Deleted items are kept here for {RECYCLE_TTL_DAYS} days, then removed automatically. There is no permanent-delete option.
      </div>
      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<Trash2 size={22} color="var(--muted)" />} title="Nothing deleted" text="When you delete a task, project, entry or any other record, it lands here first so you can restore it." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Item</th><th>Module</th><th>Deleted by</th><th>Deleted</th><th>Auto-removes in</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const left = daysLeft(r);
                  const rows = detailsOf(r);
                  return (
                    <React.Fragment key={r.id}>
                      <tr>
                        <td><div style={{ fontWeight: 600 }}>{r.name}</div>
                          {rows.length > 0 && <button className="ttl-link" style={{ fontSize: 12, fontWeight: 500, marginTop: 3 }} onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>{open[r.id] ? "Hide" : "View"} original details</button>}
                        </td>
                        <td><span className="tag">{r.module}</span></td>
                        <td><span className="badge"><span className="dot" style={{ background: avatarColor(r.deletedBy), display: "inline-block", marginRight: 5 }} />{r.deletedBy}</span></td>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtTime(r.deletedAt)}</td>
                        <td><span className={"ttl-pill " + (left <= 7 ? "ttl-soon" : "ttl-ok")}>{left} {left === 1 ? "day" : "days"}</span></td>
                        <td><button className="btn sm primary" onClick={() => askRestore(r)}><RotateCcw size={13} />Restore</button></td>
                      </tr>
                      {open[r.id] && rows.length > 0 && (
                        <tr><td colSpan={6} style={{ background: "var(--surface-2)" }}>
                          <div className="detail-json">
                            {rows.map(([k, v]) => <div key={k}><span className="k">{k}:</span> {String(v)}</div>)}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Projects({ db, mutate, openModal, openIncome, removeItem }) {
  const list = [...db.projects].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const setStage = (p, stage) => mutate((d) => ({ ...d, projects: d.projects.map((x) => x.id === p.id ? { ...x, stage } : x) }), { action: `set "${p.name}" to ${stage}`, module: "Projects" });
  const del = (p) => removeItem("projects", p, { name: p.name, audit: `deleted project "${p.name}"` });
  return (
    <div className="content">
      <div className="page-head"><h3>Projects</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "project" })}><Plus size={16} />New project</button></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<FolderKanban size={22} color="var(--muted)" />} title="No projects yet" text="Track websites, apps and software from Lead all the way to Completed." action={<button className="btn primary" onClick={() => openModal({ type: "project" })}><Plus size={16} />New project</button>} /></div>
          : list.map((p) => (
            <div key={p.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div><div className="sub">{p.client || "No client"} · {p.type}</div></div>
                <div className="mono" style={{ fontWeight: 700 }}>{money(p.cost)}</div>
              </div>
              <select className="select" value={p.stage} onChange={(e) => setStage(p, e.target.value)}>{PROJECT_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
              <div className="item-meta">{p.start && <span>Start {fmtDate(p.start)}</span>}{p.expected && <span>Due {fmtDate(p.expected)}</span>}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button className="btn sm primary" onClick={() => openIncome({ client: p.client, project: p.name, amount: p.cost, category: "Project" })}>Record income</button>
                <button className="btn sm" onClick={() => openModal({ type: "project", initial: p })}><Pencil size={13} /></button>
                <button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Delete project?", body: `Delete "${p.name}"?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(p) })}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Courses({ db, mutate, openModal, openIncome, removeItem }) {
  const list = [...db.students].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const del = (s) => removeItem("students", s, { name: s.name, audit: `removed student ${s.name}` });
  return (
    <div className="content">
      <div className="page-head"><h3>Courses & students</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "student" })}><Plus size={16} />New student</button></div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<GraduationCap size={22} color="var(--muted)" />} title="No students yet" text="Register students and record their fees — paid fees flow straight into Accounts." action={<button className="btn primary" onClick={() => openModal({ type: "student" })}><Plus size={16} />New student</button>} />
          : <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>Student</th><th>Course</th><th>Joined</th><th className="num-cell">Fee</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id}>
                <td><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{s.phone}</div></td>
                <td>{s.course || "—"}</td><td className="mono">{fmtDate(s.joinDate)}</td>
                <td className="num-cell mono">{money(s.fee)}</td>
                <td><span className={"badge " + (s.paymentStatus === "Paid" ? "pos" : s.paymentStatus === "Partial" ? "accent" : "neg")}>{s.paymentStatus}</span></td>
                <td><div className="row-actions">
                  <button className="btn sm primary" onClick={() => openIncome({ client: s.name, project: s.course || "Course fee", amount: s.fee, category: "Course", source: { kind: "student", id: s.id } })}>Record fee</button>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "student", initial: s })}><Pencil size={14} /></button>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Remove student?", body: `Remove ${s.name}?`, note: "They move to Recently deleted — restore within 60 days.", onConfirm: () => del(s) })}><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </div>
    </div>
  );
}

function Marketing({ db, mutate, openModal, openIncome, removeItem }) {
  const list = [...db.marketing].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const del = (m) => removeItem("marketing", m, { name: m.client, audit: `removed marketing client ${m.client}` });
  return (
    <div className="content">
      <div className="page-head"><h3>Digital marketing</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "marketing" })}><Plus size={16} />New client</button></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<Megaphone size={22} color="var(--muted)" />} title="No marketing clients yet" text="Track monthly retainers and get a due reminder each cycle." action={<button className="btn primary" onClick={() => openModal({ type: "marketing" })}><Plus size={16} />New client</button>} /></div>
          : list.map((m) => {
            const due = marketingDue(m);
            return (
              <div key={m.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{m.client}</div><div className="sub">{m.business || "—"} · {m.plan || "Plan"}</div></div>
                  <div className="mono" style={{ fontWeight: 700 }}>{money(m.monthlyFee)}<span style={{ fontSize: 11, color: "var(--muted)" }}>/mo</span></div>
                </div>
                <div><span className={"badge " + due.tone}>{due.label}</span></div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button className="btn sm primary" onClick={() => openIncome({ client: m.client, project: (m.plan || "Marketing") + " — monthly", amount: m.monthlyFee, category: "Marketing", source: { kind: "marketing", id: m.id } })}>Record payment</button>
                  <button className="btn sm" onClick={() => openModal({ type: "marketing", initial: m })}><Pencil size={13} /></button>
                  <button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Remove client?", body: `Remove ${m.client}?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(m) })}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function Concepts({ db, mutate, openModal, removeItem }) {
  const list = [...db.concepts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const del = (c) => removeItem("concepts", c, { name: c.title, audit: `deleted idea "${c.title}"` });
  const convert = (c) => openModal({ type: "task", initial: { title: c.title, desc: c.notes }, fromConcept: c.id });
  return (
    <div className="content">
      <div className="page-head"><h3>Concepts & ideas</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "concept" })}><Plus size={16} />New idea</button></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<Lightbulb size={22} color="var(--muted)" />} title="No ideas saved" text="Park business ideas and future plans here. Turn any of them into a task with one tap." action={<button className="btn primary" onClick={() => openModal({ type: "concept" })}><Plus size={16} />New idea</button>} /></div>
          : list.map((c) => (
            <div key={c.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
              {c.notes && <div className="sub" style={{ lineHeight: 1.5 }}>{c.notes.length > 160 ? c.notes.slice(0, 160) + "…" : c.notes}</div>}
              {c.tags?.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{c.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
              <div className="item-meta"><span>{fmtDate(c.date)}</span></div>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button className="btn sm primary" onClick={() => convert(c)}><ArrowRight size={13} />Convert to task</button>
                <button className="btn sm" onClick={() => openModal({ type: "concept", initial: c })}><Pencil size={13} /></button>
                <button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Delete idea?", body: `Delete "${c.title}"?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(c) })}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function VaultForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => ({ service: "", category: "Social media", username: "", password: "", url: "", notes: "", ...initial }));
  const [show, setShow] = useState(false);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.service.trim().length > 0;
  const save = () => { if (!valid) return; onSave({ ...initial, id: initial?.id || uid(), service: f.service.trim(), category: f.category, username: f.username.trim(), password: f.password, url: f.url.trim(), notes: f.notes.trim(), createdAt: initial?.createdAt || Date.now() }); onClose(); };
  return (
    <Modal title={initial?.id ? "Edit credential" : "New credential"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Save</button></>}>
      <div className="grid2">
        <Field label="Account / service" required><input className="input" value={f.service} onChange={(e) => up("service", e.target.value)} placeholder="Instagram, Facebook Page, Hosting…" /></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={(e) => up("category", e.target.value)}>{VAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Username / email / login ID"><input className="input" value={f.username} onChange={(e) => up("username", e.target.value)} placeholder="login id or email" /></Field>
      <Field label="Password">
        <div style={{ position: "relative" }}>
          <input className="input mono" type={show ? "text" : "password"} value={f.password} onChange={(e) => up("password", e.target.value)} style={{ paddingRight: 40 }} placeholder="••••••••" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "grid", placeItems: "center" }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </Field>
      <Field label="Login URL (optional)"><input className="input" value={f.url} onChange={(e) => up("url", e.target.value)} placeholder="https://instagram.com" /></Field>
      <Field label="Notes (optional)" hint="Recovery email, 2FA backup codes, security answers…"><textarea className="textarea" style={{ minHeight: 70 }} value={f.notes} onChange={(e) => up("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function VaultCard({ v, onEdit, onDelete }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState("");
  const copy = (text, what) => { if (!text || !navigator.clipboard) return; navigator.clipboard.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(""), 1200); }).catch(() => {}); };
  const letter = (v.service || "?").trim()[0]?.toUpperCase() || "?";
  const href = v.url ? (/^https?:\/\//.test(v.url) ? v.url : "https://" + v.url) : null;
  return (
    <div className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="avatar" style={{ background: avatarColor(v.service), width: 34, height: 34, fontSize: 15, borderRadius: 9 }}>{letter}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.service}</div>
          <div><span className="tag">{v.category}</span></div>
        </div>
      </div>
      {v.username && (
        <div className="vault-row">
          <div className="vk">Username</div>
          <div className="vv mono">{v.username}</div>
          <button className="iconbtn" style={{ width: 28, height: 28 }} title="Copy username" onClick={() => copy(v.username, "user")}>{copied === "user" ? <Check size={13} color="var(--pos)" /> : <Copy size={13} />}</button>
        </div>
      )}
      <div className="vault-row">
        <div className="vk">Password</div>
        <div className="vv mono">{v.password ? (show ? v.password : "••••••••••") : "—"}</div>
        {v.password && <button className="iconbtn" style={{ width: 28, height: 28 }} title={show ? "Hide" : "Show"} onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
        {v.password && <button className="iconbtn" style={{ width: 28, height: 28 }} title="Copy password" onClick={() => copy(v.password, "pass")}>{copied === "pass" ? <Check size={13} color="var(--pos)" /> : <Copy size={13} />}</button>}
      </div>
      {href && <a href={href} target="_blank" rel="noreferrer" className="vault-link"><ExternalLink size={13} /> {v.url.replace(/^https?:\/\//, "")}</a>}
      {v.notes && <div className="hint-line" style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{v.notes}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button className="btn sm" onClick={onEdit}><Pencil size={13} />Edit</button>
        <button className="btn sm danger" onClick={onDelete}><Trash2 size={13} />Delete</button>
      </div>
    </div>
  );
}

function Vault({ db, mutate, openModal, removeItem }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const list = useMemo(() => {
    let r = [...(db.vault || [])].sort((a, b) => (a.service || "").localeCompare(b.service || ""));
    if (cat !== "all") r = r.filter((v) => v.category === cat);
    if (q.trim()) { const s = q.toLowerCase(); r = r.filter((v) => [v.service, v.username, v.url, v.category, v.notes].join(" ").toLowerCase().includes(s)); }
    return r;
  }, [db.vault, q, cat]);
  const cats = useMemo(() => Array.from(new Set((db.vault || []).map((v) => v.category).filter(Boolean))), [db.vault]);
  const del = (v) => openModal({ type: "deleteConfirm", title: "Delete credential?", body: `Delete the saved login for "${v.service}"?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => removeItem("vault", v, { name: v.service, audit: `deleted credentials for "${v.service}"` }) });
  return (
    <div className="content">
      <div className="page-head"><h3>Passwords & logins</h3><span className="spacer" />
        <button className="btn primary" onClick={() => openModal({ type: "vault" })}><Plus size={16} />New credential</button></div>
      <div className="hint-line" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <ShieldCheck size={13} /> Visible to admins (Haji &amp; Alim) only. Stored privately in your database — keep your Supabase login strong.
      </div>
      <div className="toolbar">
        <div className="search"><Search size={16} color="var(--muted)" /><input placeholder="Search service, username, notes…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {cats.length > 0 && <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: "auto" }}><option value="all">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>}
      </div>
      {list.length === 0 ? (
        <div className="card"><Empty icon={<KeyRound size={22} color="var(--muted)" />} title={db.vault?.length ? "Nothing matches" : "No credentials saved"} text={db.vault?.length ? "Try a different search or category." : "Save logins for Instagram, Facebook, your website, hosting, email and more — all in one place."} action={<button className="btn primary" onClick={() => openModal({ type: "vault" })}><Plus size={16} />New credential</button>} /></div>
      ) : (
        <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
          {list.map((v) => <VaultCard key={v.id} v={v} onEdit={() => openModal({ type: "vault", initial: v })} onDelete={() => del(v)} />)}
        </div>
      )}
    </div>
  );
}

function AuditLog({ db }) {
  const list = [...db.audit].reverse();
  return (
    <div className="content">
      <div className="page-head"><h3>Audit log</h3></div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<ScrollText size={22} color="var(--muted)" />} title="No activity recorded" text="Every action — edits, share changes, expenses, withdrawals — is logged here permanently." />
          : <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Module</th></tr></thead>
            <tbody>{list.map((a) => (
              <tr key={a.id}><td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtTime(a.ts)}</td>
                <td><span className="badge"><span className="dot" style={{ background: avatarColor(a.user), display: "inline-block", marginRight: 5 }} />{a.user}</span></td>
                <td>{a.action}</td><td><span className="tag">{a.module}</span></td></tr>
            ))}</tbody>
          </table></div>}
      </div>
    </div>
  );
}

function Settings({ db, mutate, replaceDB, syncError, currentUser, role, teamCount, sessionEmail, openModal }) {
  const fileRef = useRef(null);
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `allbee-backup-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (d && d.transactions) replaceDB(d); } catch { alert("That file couldn't be read as an ALLBEE backup."); } };
    r.readAsText(file); e.target.value = "";
  };
  const counts = { "Team members": teamCount || 0, Transactions: db.transactions.length, Withdrawals: db.withdrawals.length, Tasks: db.tasks.length, Projects: db.projects.length, Students: db.students.length, "Marketing clients": db.marketing.length, "Leave requests": db.leave.length, "Daily updates": db.updates.length };
  return (
    <div className="content" style={{ maxWidth: 760 }}>
      <div className="page-head"><h3>Settings</h3></div>

      <div className="card stat" style={{ marginBottom: 14 }}>
        <div className="lbl" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Backup & restore</div>
        <p className="hint-line" style={{ lineHeight: 1.55, marginBottom: 14 }}>
          Export a full copy of your database as a JSON file you can keep or upload to Google Drive yourself. Importing replaces the current data.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={exportJSON}><Download size={16} />Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} />Import backup</button>
          <input ref={fileRef} type="file" accept="application/json" onChange={importJSON} style={{ display: "none" }} />
        </div>
      </div>

      <div className="card stat" style={{ marginBottom: 14 }}>
        <div className="lbl" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Import from Excel / Google Sheets</div>
        <p className="hint-line" style={{ lineHeight: 1.55, marginBottom: 14 }}>
          Bring in existing records — income, expenses, withdrawals, projects, students, marketing clients, ideas or tasks — from a spreadsheet. Upload an <b>.xlsx</b> or <b>.csv</b> file (from Google Sheets use <b>File → Download</b>). Imported rows are <b>added</b> to what's already here; they don't replace anything.
        </p>
        <button className="btn primary" onClick={() => openModal({ type: "importData" })}><Sheet size={16} />Import a spreadsheet</button>
      </div>

      <div className="card stat" style={{ marginBottom: 14 }}>
        <div className="lbl" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Your data</div>
        <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px" }}>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div className="hint-line">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card stat">
        <div className="lbl" style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>About this build</div>
        <p className="hint-line" style={{ lineHeight: 1.6, margin: 0 }}>
          Signed in as <b style={{ color: avatarColor(currentUser) }}>{currentUser}</b>{sessionEmail ? ` (${sessionEmail})` : ""} · <b>{role === "admin" ? "Admin" : "Staff"}</b>. Records live in a shared Postgres database and sync across the team in real time{syncError ? " — but the last sync failed, so some changes may not have saved yet" : ""}. Staff accounts can't see Share &amp; accounts or Withdrawals; that's enforced by the database, not just hidden. File attachments and an installable Android version are optional add-ons documented in the project README.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STAFF + HR MODULES
══════════════════════════════════════════════════════════════════════ */
function StaffDashboard({ db, me, go, mutate, openModal }) {
  const today = todayISO();
  const att = attendanceFor(db, me.id, today);
  const leaveToday = onApprovedLeave(db, me.id, today);
  const myOpen = db.tasks.filter((t) => t.assignedTo === me.name && t.status !== "Completed");
  const myPendingLeave = db.leave.filter((l) => l.userId === me.id && l.status === "Pending");
  const myUpdatesToday = db.updates.filter((u) => u.userId === me.id && u.date === today);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  const checkIn = () => mutate((d) => ({ ...d, attendance: [...d.attendance, { id: uid(), userId: me.id, userName: me.name, date: today, checkIn: new Date().toISOString(), checkOut: null, createdAt: Date.now() }] }), null);
  const checkOut = () => mutate((d) => ({ ...d, attendance: d.attendance.map((a) => a.id === att.id ? { ...a, checkOut: new Date().toISOString() } : a) }), null);

  return (
    <div className="content">
      <div className="page-head"><h3>{greet}, {me.name}</h3></div>

      <div className="card stat" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div className="avatar" style={{ background: avatarColor(me.name), width: 44, height: 44, fontSize: 18 }}>{me.name[0]}</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="lbl"><Clock size={14} /> Today · {fmtDate(today)}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
            {leaveToday ? "On approved leave" : !att ? "Not checked in yet" : att.checkOut ? `Worked ${clockTime(att.checkIn)} – ${clockTime(att.checkOut)}` : `Checked in at ${clockTime(att.checkIn)}`}
          </div>
        </div>
        {!leaveToday && !att && <button className="btn primary" onClick={checkIn}><LogIn size={16} />Check in</button>}
        {!leaveToday && att && !att.checkOut && <button className="btn primary" onClick={checkOut}><CheckCircle2 size={16} />Check out</button>}
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", marginBottom: 16 }}>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => go("tasks")}>
          <div className="lbl"><ListTodo size={14} /> My open tasks</div><div className="num">{myOpen.length}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => go("leave")}>
          <div className="lbl"><Plane size={14} /> Pending leave</div><div className="num">{myPendingLeave.length}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => go("updates")}>
          <div className="lbl"><MessageSquare size={14} /> Today's updates</div><div className="num">{myUpdatesToday.length}</div></div>
      </div>

      <div className="quick-actions">
        <button className="btn" onClick={() => openModal({ type: "leave" })}><Plane size={15} />Request leave</button>
        <button className="btn" onClick={() => go("updates")}><MessageSquare size={15} />Post a daily update</button>
        <button className="btn" onClick={() => go("tasks")}><ListTodo size={15} />See my tasks</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>My next tasks</div>
        {myOpen.length === 0 ? (
          <Empty icon={<ListTodo size={22} color="var(--muted)" />} title="Nothing assigned right now" text="When an admin assigns you a task, it shows up here." />
        ) : myOpen.slice(0, 5).map((t) => (
          <div key={t.id} className="item-row">
            <div className="item-main">
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span className="item-title">{t.title}</span>
                <span className={"badge " + (t.status === "In Progress" ? "accent" : "pri")}>{t.status}</span>
                {t.priority && <span className={"badge " + priorityTone(t.priority)}>{t.priority}</span>}
              </div>
              {t.due && <div className="item-meta" style={{ marginTop: 6 }}><span><CalendarClock size={12} style={{ verticalAlign: -2 }} /> Due {fmtDate(t.due)}</span></div>}
            </div>
            <div className="row-actions"><button className="btn sm" onClick={() => go("tasks")}>Open<ArrowRight size={13} /></button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function attStatus(db, userId, dateISO) {
  if (onApprovedLeave(db, userId, dateISO)) return { label: "On leave", tone: "accent" };
  const a = attendanceFor(db, userId, dateISO);
  if (!a) return { label: "Absent", tone: "muted" };
  if (a.checkOut) return { label: "Checked out", tone: "pos" };
  return { label: "Present", tone: "pos" };
}

function Attendance({ db, mutate, me, isAdmin, team }) {
  const today = todayISO();
  const [date, setDate] = useState(today);

  if (!isAdmin) {
    const att = attendanceFor(db, me.id, today);
    const leaveToday = onApprovedLeave(db, me.id, today);
    const mine = [...db.attendance].filter((a) => a.userId === me.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 31);
    const checkIn = () => mutate((d) => ({ ...d, attendance: [...d.attendance, { id: uid(), userId: me.id, userName: me.name, date: today, checkIn: new Date().toISOString(), checkOut: null, createdAt: Date.now() }] }), null);
    const checkOut = () => mutate((d) => ({ ...d, attendance: d.attendance.map((a) => a.id === att.id ? { ...a, checkOut: new Date().toISOString() } : a) }), null);
    return (
      <div className="content">
        <div className="page-head"><h3>Attendance</h3></div>
        <div className="card stat" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="lbl"><Clock size={14} /> {fmtDate(today)}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
              {leaveToday ? "You're on approved leave today" : !att ? "Not checked in yet" : att.checkOut ? `${clockTime(att.checkIn)} – ${clockTime(att.checkOut)} · ${hoursBetween(att.checkIn, att.checkOut)?.toFixed(1)}h` : `Checked in at ${clockTime(att.checkIn)}`}
            </div>
          </div>
          {!leaveToday && !att && <button className="btn primary" onClick={checkIn}><LogIn size={16} />Check in</button>}
          {!leaveToday && att && !att.checkOut && <button className="btn primary" onClick={checkOut}><CheckCircle2 size={16} />Check out</button>}
          {att && att.checkOut && <span className="badge pos"><Check size={13} /> Done for today</span>}
        </div>

        <div className="card">
          <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>My recent attendance</div>
          {mine.length === 0 ? <Empty icon={<UserCheck size={22} color="var(--muted)" />} title="No records yet" text="Check in each day and your history builds up here." /> : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Date</th><th>In</th><th>Out</th><th className="num-cell">Hours</th></tr></thead>
                <tbody>{mine.map((a) => (
                  <tr key={a.id}><td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(a.date)}</td>
                    <td className="mono">{clockTime(a.checkIn)}</td><td className="mono">{clockTime(a.checkOut)}</td>
                    <td className="num-cell mono">{a.checkOut ? hoursBetween(a.checkIn, a.checkOut)?.toFixed(1) : "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // admin roster
  const roster = team.map((p) => ({ p, a: attendanceFor(db, p.id, date), st: attStatus(db, p.id, date) }));
  const present = roster.filter((r) => r.st.label === "Present" || r.st.label === "Checked out").length;
  const onLeave = roster.filter((r) => r.st.label === "On leave").length;
  const absent = roster.filter((r) => r.st.label === "Absent").length;
  return (
    <div className="content">
      <div className="page-head"><h3>Attendance</h3><span className="spacer" />
        <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} /></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 16 }}>
        <div className="card stat"><div className="lbl"><UserCheck size={14} /> Present</div><div className="num pos-txt">{present}</div></div>
        <div className="card stat"><div className="lbl"><Plane size={14} /> On leave</div><div className="num">{onLeave}</div></div>
        <div className="card stat"><div className="lbl"><XCircle size={14} /> Absent</div><div className="num neg-txt">{absent}</div></div>
      </div>
      <div className="card">
        {roster.length === 0 ? <Empty icon={<Users size={22} color="var(--muted)" />} title="No team members yet" text="Staff who create accounts will appear here." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Member</th><th>Status</th><th>In</th><th>Out</th><th className="num-cell">Hours</th></tr></thead>
              <tbody>{roster.map(({ p, a, st }) => (
                <tr key={p.id}>
                  <td><span className="who-cell"><span className="avatar" style={{ background: avatarColor(p.name), width: 24, height: 24, fontSize: 10 }}>{p.name[0]}</span>{p.name}</span></td>
                  <td><span className={"badge " + (st.tone === "muted" ? "" : st.tone)} style={st.tone === "muted" ? { background: "var(--surface-2)", color: "var(--muted)" } : undefined}>{st.label}</span></td>
                  <td className="mono">{clockTime(a?.checkIn)}</td><td className="mono">{clockTime(a?.checkOut)}</td>
                  <td className="num-cell mono">{a?.checkOut ? hoursBetween(a.checkIn, a.checkOut)?.toFixed(1) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LeaveForm({ initial, me, onSave, onClose }) {
  const [f, setF] = useState(() => ({ type: "Casual", fromDate: todayISO(), toDate: todayISO(), reason: "", ...initial }));
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const days = daysBetween(f.fromDate, f.toDate);
  const valid = f.fromDate && f.toDate && f.toDate >= f.fromDate && f.reason.trim().length > 0;
  const save = () => {
    if (!valid) return;
    onSave({ ...initial, id: initial?.id || uid(), userId: me.id, userName: me.name, type: f.type, fromDate: f.fromDate, toDate: f.toDate, days, reason: f.reason.trim(), status: initial?.status || "Pending", createdAt: initial?.createdAt || Date.now() });
    onClose();
  };
  return (
    <Modal title={initial?.id ? "Edit leave request" : "Request leave"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Submit request</button></>}>
      <Field label="Leave type"><select className="select" value={f.type} onChange={(e) => up("type", e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <div className="grid2">
        <Field label="From" required><input className="input" type="date" value={f.fromDate} onChange={(e) => up("fromDate", e.target.value)} /></Field>
        <Field label="To" required><input className="input" type="date" value={f.toDate} min={f.fromDate} onChange={(e) => up("toDate", e.target.value)} /></Field>
      </div>
      <div className="hint-line" style={{ marginBottom: 12 }}>{days > 0 ? `${days} day${days > 1 ? "s" : ""}` : "Pick valid dates"}{f.toDate < f.fromDate ? " · end date is before start" : ""}</div>
      <Field label="Reason" required><textarea className="textarea" value={f.reason} onChange={(e) => up("reason", e.target.value)} placeholder="Briefly, why you need this leave." /></Field>
    </Modal>
  );
}

function leaveTone(s) { return s === "Approved" ? "pos" : s === "Rejected" ? "neg" : "pri"; }

function Leave({ db, mutate, me, isAdmin, openModal }) {
  const [filter, setFilter] = useState(isAdmin ? "Pending" : "all");
  const all = [...db.leave].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = isAdmin
    ? all.filter((l) => filter === "all" ? true : l.status === filter)
    : all.filter((l) => l.userId === me.id);

  const decide = (l, status) => mutate((d) => ({ ...d, leave: d.leave.map((x) => x.id === l.id ? { ...x, status, decidedBy: me.name, decidedAt: Date.now() } : x) }), { action: `${status.toLowerCase()} ${l.userName}'s ${l.type.toLowerCase()} leave`, module: "Leave" });
  const cancel = (l) => mutate((d) => ({ ...d, leave: d.leave.filter((x) => x.id !== l.id) }), null);

  return (
    <div className="content">
      <div className="page-head"><h3>{isAdmin ? "Leave requests" : "My leave"}</h3><span className="spacer" />
        {!isAdmin && <button className="btn primary" onClick={() => openModal({ type: "leave" })}><Plus size={16} />Request leave</button>}</div>
      {isAdmin && <div className="toolbar"><div className="seg">{["Pending", "Approved", "Rejected", "all"].map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k === "all" ? "All" : k}</button>)}</div></div>}

      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<Plane size={22} color="var(--muted)" />} title={isAdmin ? "Nothing to review" : "No leave requests"} text={isAdmin ? "Approved and rejected requests stay here for your records." : "Request time off and track its status here."}
            action={!isAdmin ? <button className="btn primary" onClick={() => openModal({ type: "leave" })}><Plus size={16} />Request leave</button> : undefined} />
        ) : list.map((l) => (
          <div key={l.id} className="item-row">
            <div className="item-main">
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                {isAdmin && <span className="avatar" style={{ background: avatarColor(l.userName), width: 24, height: 24, fontSize: 10 }}>{l.userName[0]}</span>}
                <span className="item-title">{isAdmin ? l.userName + " · " : ""}{l.type} leave</span>
                <span className={"badge " + leaveTone(l.status)}>{l.status}</span>
                <span className="badge" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>{l.days} day{l.days > 1 ? "s" : ""}</span>
              </div>
              <div className="item-meta" style={{ marginTop: 6 }}>
                <span><CalendarDays size={12} style={{ verticalAlign: -2 }} /> {fmtDate(l.fromDate)} → {fmtDate(l.toDate)}</span>
                {l.decidedBy && <span>{l.status} by {l.decidedBy}</span>}
              </div>
              {l.reason && <div className="item-meta" style={{ marginTop: 6 }}>{l.reason}</div>}
            </div>
            <div className="row-actions">
              {isAdmin && l.status === "Pending" && (
                <>
                  <button className="btn sm primary" onClick={() => decide(l, "Approved")}><Check size={13} />Approve</button>
                  <button className="btn sm" onClick={() => decide(l, "Rejected")} style={{ color: "var(--neg)" }}><XCircle size={13} />Reject</button>
                </>
              )}
              {!isAdmin && l.status === "Pending" && (
                <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => openModal({ type: "confirm", title: "Cancel request?", body: "Withdraw this pending leave request?", confirmLabel: "Cancel request", onConfirm: () => cancel(l) })}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Updates({ db, mutate, me, isAdmin }) {
  const [text, setText] = useState("");
  const today = todayISO();
  const all = [...db.updates].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = isAdmin ? all : all.filter((u) => u.userId === me.id);
  const post = () => {
    const content = text.trim(); if (!content) return;
    mutate((d) => ({ ...d, updates: [...d.updates, { id: uid(), userId: me.id, userName: me.name, date: today, content, createdAt: Date.now() }] }), null);
    setText("");
  };
  const del = (u) => mutate((d) => ({ ...d, updates: d.updates.filter((x) => x.id !== u.id) }), null);

  return (
    <div className="content">
      <div className="page-head"><h3>Daily updates</h3></div>

      {!isAdmin && (
        <div className="card stat" style={{ marginBottom: 16 }}>
          <div className="lbl" style={{ marginBottom: 8 }}><MessageSquare size={14} /> What did you work on today?</div>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Share progress, blockers, or what's next…" style={{ minHeight: 80 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn primary" onClick={post} disabled={!text.trim()}><ArrowRight size={15} />Post update</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>{isAdmin ? "Team updates" : "My updates"}</div>
        {list.length === 0 ? (
          <Empty icon={<MessageSquare size={22} color="var(--muted)" />} title="No updates yet" text={isAdmin ? "Daily updates from your team will show up here." : "Post your first update above."} />
        ) : list.map((u) => (
          <div key={u.id} className="item-row">
            <div className="avatar" style={{ background: avatarColor(u.userName), width: 30, height: 30, fontSize: 12 }}>{u.userName[0]}</div>
            <div className="item-main">
              <div className="item-title" style={{ fontSize: 14 }}><b>{u.userName}</b></div>
              <div style={{ marginTop: 4, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{u.content}</div>
              <div className="item-meta" style={{ marginTop: 6 }}><span>{fmtDate(u.date)}</span><span>{fmtTime(u.createdAt)}</span></div>
            </div>
            {(isAdmin || u.userId === me.id) && (
              <div className="row-actions"><button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => del(u)}><Trash2 size={14} /></button></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Team({ team, me, changeProfile }) {
  const admins = team.filter((p) => p.role === "admin").length;
  const staff = team.length - admins;
  return (
    <div className="content">
      <div className="page-head"><h3>Team</h3></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 16 }}>
        <div className="card stat"><div className="lbl"><ShieldCheck size={14} /> Admins</div><div className="num">{admins}</div></div>
        <div className="card stat"><div className="lbl"><Users size={14} /> Staff</div><div className="num">{staff}</div></div>
      </div>
      <div className="card">
        {team.length === 0 ? <Empty icon={<Users size={22} color="var(--muted)" />} title="No one here yet" text="Share the app link so your team can create accounts." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>{team.map((p) => (
                <tr key={p.id} style={p.active === false ? { opacity: .55 } : undefined}>
                  <td>
                    <span className="who-cell">
                      <span className="avatar" style={{ background: avatarColor(p.name), width: 26, height: 26, fontSize: 11 }}>{p.name[0]}</span>
                      <span><div style={{ fontWeight: 600 }}>{p.name}{p.id === me.id ? " (you)" : ""}</div><div className="hint-line" style={{ fontSize: 11 }}>{p.email}</div></span>
                    </span>
                  </td>
                  <td>
                    <select className="select" style={{ width: "auto", padding: "5px 8px" }} value={p.role} disabled={p.id === me.id}
                      onChange={(e) => changeProfile(p.id, { role: e.target.value })}>
                      <option value="staff">Staff</option><option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    {p.active === false
                      ? <button className="btn sm" onClick={() => changeProfile(p.id, { active: true })}>Reactivate</button>
                      : <button className="btn sm" disabled={p.id === me.id} onClick={() => changeProfile(p.id, { active: false })} style={p.id === me.id ? undefined : { color: "var(--neg)" }}>Deactivate</button>}
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 13 }}>{p.created_at ? fmtDate(p.created_at.slice(0, 10)) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="hint-line" style={{ padding: "12px 16px" }}>Staff see only Tasks, Attendance, Leave and Daily updates. Admins see everything, including Share &amp; accounts and Withdrawals.</div>
      </div>
    </div>
  );
}

function Blocked({ isDark, name, onSignOut }) {
  return (
    <div className="allbee lock" data-theme={isDark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="lock-card">
        <div className="lock-badge" style={{ background: "var(--surface-2)" }}><Hourglass size={28} color="var(--muted)" /></div>
        <h1>Access paused</h1>
        <p>Hi {name}, your account is currently inactive. Please ask an ALLBEE admin to reactivate it.</p>
        <button className="btn" style={{ marginTop: 8 }} onClick={onSignOut}><LogOut size={15} />Sign out</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   APP SHELL + ERROR BOUNDARY
══════════════════════════════════════════════════════════════════════ */
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#444" }}>
        <h3>Something went wrong rendering the app.</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.err)}</pre>
        <button onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    );
    return this.props.children;
  }
}

const NAV = [
  ["dashboard", "Dashboard", LayoutDashboard, "all"],
  ["tasks", "Tasks", ListTodo, "all"],
  ["attendance", "Attendance", UserCheck, "all"],
  ["leave", "Leave", Plane, "all"],
  ["updates", "Daily updates", MessageSquare, "all"],
  ["team", "Team", Users, "admin"],
  ["accounts", "Share & accounts", Wallet, "admin"],
  ["withdrawals", "Withdrawals", ArrowDownToLine, "admin"],
  ["projects", "Projects", FolderKanban, "admin"],
  ["courses", "Courses", GraduationCap, "admin"],
  ["marketing", "Marketing", Megaphone, "admin"],
  ["concepts", "Concepts", Lightbulb, "admin"],
  ["progress", "Progress", TrendingUp, "admin"],
  ["vault", "Passwords", KeyRound, "admin"],
  ["recently-deleted", "Recently deleted", Trash2, "admin"],
  ["audit", "Audit log", ScrollText, "admin"],
  ["settings", "Settings", SettingsIcon, "admin"],
];

// Parse the URL hash into a view. Supports deep links like #/accounts/haji,
// #/tasks/<id> and #/recently-deleted, plus #/<navkey> for ordinary pages.
function parseHash(hash) {
  const h = (hash || "").replace(/^#\/?/, "").trim();
  if (!h) return { route: "dashboard", account: null, task: null };
  const parts = h.split("/");
  if (parts[0] === "accounts" && parts[1]) {
    const k = parts[1].toLowerCase();
    return { route: "accounts", account: k === "haji" ? "Haji" : k === "alim" ? "Alim" : null, task: null };
  }
  if (parts[0] === "tasks" && parts[1]) return { route: "tasks", account: null, task: decodeURIComponent(parts[1]) };
  if (parts[0] === "recently-deleted") return { route: "recently-deleted", account: null, task: null };
  return { route: parts[0], account: null, task: null };
}

function Lock({ isDark, setDark }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [acctType, setAcctType] = useState("staff"); // staff | owner
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");   // staff display name
  const [who, setWho] = useState("Haji"); // owner partner identity
  const [code, setCode] = useState("");   // admin access code
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async () => {
    setErr(""); setNotice("");
    if (!email.trim() || !pw) { setErr("Enter your email and password to continue."); return; }
    if (mode === "signup") {
      if (acctType === "staff" && !name.trim()) { setErr("Enter your name so your team knows who you are."); return; }
      if (acctType === "owner" && !code.trim()) { setErr("Enter the admin access code, or sign up as a team member instead."); return; }
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      } else {
        const meta = acctType === "owner" ? { name: who, admin_code: code.trim() } : { name: name.trim() };
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: meta } });
        if (error) throw error;
        if (!data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
      }
    } catch (e) {
      setErr(e.message || "Couldn't complete that. Try again.");
    } finally { setBusy(false); }
  };
  const onKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="allbee lock" data-theme={isDark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="lock-card">
        <img className="lock-logo" src={LOGO_FULL} alt="ALLBEE Solutions" />
        <p>{mode === "signin" ? "Sign in to your workspace" : "Create your account"}</p>

        {mode === "signup" && (
          <>
            <div className="seg" style={{ width: "100%", marginBottom: 16 }}>
              <button type="button" className={acctType === "staff" ? "on" : ""} onClick={() => setAcctType("staff")}>Team member</button>
              <button type="button" className={acctType === "owner" ? "on" : ""} onClick={() => setAcctType("owner")}>Owner / admin</button>
            </div>

            {acctType === "staff" ? (
              <div className="field" style={{ textAlign: "left" }}>
                <label>Your name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder="e.g. Priya" />
              </div>
            ) : (
              <div style={{ textAlign: "left", marginBottom: 4 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "var(--ink)" }}>Which partner are you?</label>
                <div className="who-grid" style={{ marginBottom: 12 }}>
                  {USERS.map((u) => (
                    <button key={u} type="button" className="who-btn" onClick={() => setWho(u)}
                      style={who === u ? { borderColor: avatarColor(u), boxShadow: "var(--shadow)" } : undefined}>
                      <div className="av" style={{ background: avatarColor(u), width: 36, height: 36, fontSize: 15 }}>{u[0]}</div>
                      <div className="nm" style={{ fontSize: 14 }}>{u}{who === u ? " ✓" : ""}</div>
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label>Admin access code</label>
                  <input className="input" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} placeholder="Provided by ALLBEE" />
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ textAlign: "left" }}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} placeholder="you@allbee.in" />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={onKey} placeholder="••••••••" />
          </div>
        </div>

        {err && <div className="auth-msg err"><AlertTriangle size={14} /> {err}</div>}
        {notice && <div className="auth-msg ok"><Check size={14} /> {notice}</div>}

        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={busy}>
          {busy ? <RefreshCw size={16} className="spin" /> : mode === "signin" ? <LogIn size={16} /> : <Mail size={16} />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button className="linkbtn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); setNotice(""); }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <button className="btn ghost" style={{ marginTop: 18 }} onClick={() => setDark(!isDark)}>
          {isDark ? <Sun size={15} /> : <Moon size={15} />} {isDark ? "Light" : "Dark"} mode
        </button>
      </div>
    </div>
  );
}

function NamePicker({ isDark, onChoose }) {
  return (
    <div className="allbee lock" data-theme={isDark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="lock-card">
        <img className="lock-logo" src={LOGO_ICON} alt="ALLBEE" style={{ height: 56 }} />
        <h1>One quick thing</h1>
        <p>Which partner is this account?</p>
        <div className="who-grid">
          {USERS.map((u) => (
            <button key={u} className="who-btn" onClick={() => onChoose(u)}>
              <div className="av" style={{ background: avatarColor(u) }}>{u[0]}</div>
              <div className="nm">{u}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Build a per-user notification feed from task activity (assignments, status
// changes and comments made by other people on tasks the user is part of).
// Works for admins and staff alike, and stays in sync because tasks sync.
function notificationsFor(db, me) {
  if (!me?.name) return [];
  const name = me.name;
  const out = [];
  for (const t of (db.tasks || [])) {
    const mine = taskAssignees(t).includes(name);
    const involved = t.assignedBy === name || mine;
    if (!involved) continue;
    for (const h of (t.history || [])) {
      if (!h || !h.at || h.by === name) continue;
      let text;
      if (h.status === "Created") { if (!mine) continue; text = `${h.by} assigned you "${t.title}"`; }
      else text = `${h.by} moved "${t.title}" to ${h.status}`;
      out.push({ id: `h:${t.id}:${h.at}:${h.status}`, at: h.at, text, taskId: t.id });
    }
    for (const c of (t.comments || [])) {
      if (!c || c.by === name || !c.at) continue;
      out.push({ id: `c:${t.id}:${c.id || c.at}`, at: c.at, text: `${c.by} commented on "${t.title}"`, taskId: t.id });
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, 40);
}

function NotifBell({ db, me, openTask }) {
  const key = `allbee:notifseen:${me?.name || "x"}`;
  const readSeen = () => { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } };
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);
  const prevSeen = useRef(seen);
  const list = useMemo(() => notificationsFor(db, me), [db, me]);
  const unread = list.filter((n) => n.at > seen).length;

  const persist = (v) => { setSeen(v); try { localStorage.setItem(key, String(v)); } catch {} };
  const toggle = () => setOpen((o) => { const nx = !o; if (nx) { prevSeen.current = seen; persist(Date.now()); } return nx; });
  const markAll = () => { prevSeen.current = Date.now(); persist(Date.now()); };
  const onPick = (n) => { setOpen(false); if (n.taskId) openTask(n.taskId); };

  return (
    <div className="notif-wrap">
      <button className="iconbtn" onClick={toggle} aria-label="Notifications" style={{ position: "relative" }}>
        <Bell size={18} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 290 }} />
          <div className="notif-panel">
            <div className="notif-head"><Bell size={15} /> Notifications <span style={{ flex: 1 }} />
              {list.length > 0 && <button className="ttl-link" style={{ fontSize: 12, fontWeight: 600 }} onClick={markAll}>Mark all read</button>}
            </div>
            <div className="notif-list">
              {list.length === 0 ? (
                <div className="notif-empty">You're all caught up.<br />Task assignments, updates and comments appear here.</div>
              ) : list.map((n) => (
                <div key={n.id} className={"notif-item" + (n.at > prevSeen.current ? " unread" : "")} onClick={() => onPick(n)}>
                  {n.at > prevSeen.current ? <span className="notif-dot" /> : <span style={{ width: 8, flexShrink: 0 }} />}
                  <div className="nb"><div className="nt">{n.text}</div><div className="nw">{fmtTime(n.at)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [db, setDb] = useState(null);
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [profile, setProfile] = useState(undefined);  // undefined = loading, null = none
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [route, setRoute] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [modal, setModal] = useState(null); // {type, ...}
  const [balanceUser, setBalanceUser] = useState(null);
  const [accountUser, setAccountUser] = useState(null);   // full-page partner statement (Haji/Alim)
  const [taskDetailId, setTaskDetailId] = useState(null); // full-page task detail

  const currentUser = profile?.name || null;
  const isAdmin = profile?.role === "admin";
  const me = { id: session?.user?.id, name: currentUser, role: profile?.role };

  // ── auth session ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── load my profile + the team, with live updates ─────────────────────
  const loadPeople = useCallback(async (user) => {
    try {
      await ensureProfile(user);
      const list = await fetchTeam();
      setTeam(list);
      setProfile(list.find((p) => p.id === user.id) || null);
    } catch (e) { setSyncError(e.message || String(e)); setProfile(null); }
  }, []);

  useEffect(() => {
    if (!session) { setProfile(undefined); setTeam([]); return; }
    loadPeople(session.user);
    const ch = supabase.channel("allbee-people")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadPeople(session.user));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, loadPeople]);

  const reload = useCallback(async () => {
    try { setDb(await fetchAll()); setSyncError(null); }
    catch (e) { setSyncError(e.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  // ── load data + live sync while signed in ─────────────────────────────
  useEffect(() => {
    if (!session) { setDb(null); setLoading(false); return; }
    setLoading(true);
    reload();
    const ch = supabase.channel("allbee-db-sync");
    TABLES.forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, reload));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, reload]);

  // mutate(updater, auditEntryOrNull) — updates the screen instantly, then
  // saves only the rows that changed. The other staff member's screen updates live.
  // Audit entries are written for admin actions only (staff can't access the log).
  const mutate = useCallback((updater, audit) => {
    setDb((prev) => {
      if (!prev) return prev;
      let next = updater(prev);
      if (audit) next = { ...next, audit: [...next.audit, { id: uid(), ts: Date.now(), user: currentUser || "—", ...audit }] };
      applyDiff(prev, next).catch((e) => setSyncError(e.message || String(e)));
      return next;
    });
  }, [currentUser]);

  // ── soft delete (recycle bin) ─────────────────────────────────────────
  // Move a row out of its table and into `recycle` instead of destroying it.
  // Original screens need no change — the row simply disappears from their list.
  // Audit is written for admins only (staff have no access to the audit table),
  // but a staff member's deleted item is still recoverable by an admin.
  const removeItem = useCallback((table, item, opts = {}) => {
    const name = opts.name || item.name || item.title || item.client || "item";
    const module = MODULE_LABEL[table] || table;
    const rec = {
      id: uid(), table, module, name, item,
      deletedBy: currentUser || "—", deletedById: me.id || null, deletedAt: Date.now(),
    };
    mutate(
      (d) => ({ ...d, [table]: d[table].filter((x) => x.id !== item.id), recycle: [...d.recycle, rec] }),
      isAdmin ? { action: opts.audit || `deleted ${module.toLowerCase()} "${name}"`, module } : null
    );
  }, [mutate, currentUser, isAdmin, me.id]);

  // Restore a recycled row back into its original table.
  const restoreItem = useCallback((rec) => {
    mutate((d) => {
      const exists = (d[rec.table] || []).some((x) => x.id === rec.item.id);
      return {
        ...d,
        [rec.table]: exists ? d[rec.table] : [...(d[rec.table] || []), rec.item],
        recycle: d.recycle.filter((r) => r.id !== rec.id),
      };
    }, isAdmin ? { action: `restored ${rec.module.toLowerCase()} "${rec.name}"`, module: rec.module } : null);
  }, [mutate, isAdmin]);

  // Auto-cleanup: permanently drop recycle rows older than 60 days. Runs once
  // per load for admins (their RLS lets them delete any recycle row). This is a
  // client-side sweep — see README for the optional server-side cron upgrade.
  const purgedRef = useRef(false);
  const purgeExpired = useCallback(() => {
    const cutoff = Date.now() - RECYCLE_TTL_DAYS * 86400000;
    setDb((prev) => {
      if (!prev || !prev.recycle?.length) return prev;
      const keep = prev.recycle.filter((r) => (r.deletedAt || 0) >= cutoff);
      if (keep.length === prev.recycle.length) return prev;
      const next = { ...prev, recycle: keep };
      applyDiff(prev, next).catch((e) => setSyncError(e.message || String(e)));
      return next;
    });
  }, []);

  useEffect(() => {
    if (isAdmin && !loading && db && !purgedRef.current) { purgedRef.current = true; purgeExpired(); }
  }, [isAdmin, loading, db, purgeExpired]);

  const replaceDB = useCallback(async (d) => {
    const clean = { ...emptyDB(), ...d };
    try { await replaceAll(clean); setDb(clean); setSyncError(null); }
    catch (e) { setSyncError(e.message || String(e)); }
  }, []);

  const changeProfile = useCallback(async (id, patch) => {
    try { await updateProfile(id, patch); if (session) await loadPeople(session.user); }
    catch (e) { setSyncError(e.message || String(e)); }
  }, [session, loadPeople]);

  const signOut = async () => { setUserMenu(false); await supabase.auth.signOut(); };

  const bal = useMemo(() => (db ? balances(db) : { Haji: 0, Alim: 0, company: 0 }), [db]);

  const openModal = (m) => setModal(m);
  const openBalance = (u) => setBalanceUser(u);
  const setHash = (h) => { if (window.location.hash !== h) window.location.hash = h; };
  const go = (r) => {
    setRoute(r); setAccountUser(null); setTaskDetailId(null); setMenuOpen(false);
    setHash(r === "dashboard" ? "#/" : `#/${r}`);
  };
  const openAccount = (u) => { setAccountUser(u); setTaskDetailId(null); setRoute("accounts"); setMenuOpen(false); setHash(`#/accounts/${String(u).toLowerCase()}`); };
  const openTask = (id) => { setTaskDetailId(id); setAccountUser(null); setRoute("tasks"); setMenuOpen(false); setHash(`#/tasks/${encodeURIComponent(id)}`); };
  const goBackDetail = () => {
    const target = taskDetailId ? "tasks" : "accounts";
    setAccountUser(null); setTaskDetailId(null); setRoute(target);
    setHash(`#/${target}`);
  };

  // keep the URL hash and the in-app view in sync (reload-safe deep links)
  useEffect(() => {
    const apply = () => {
      const p = parseHash(window.location.hash);
      setAccountUser(p.account); setTaskDetailId(p.task);
      if (p.route) setRoute(p.route);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // open income form prefilled (used by projects / courses / marketing)
  const openIncome = (prefill) => setModal({ type: "income", initial: prefill, source: prefill?.source });

  const saveShare = (entry, source) => {
    const prev = entry.id ? db.transactions.find((t) => t.id === entry.id) : null;
    const shareChanged = prev && (prev.hajiPct !== entry.hajiPct || prev.alimPct !== entry.alimPct);
    const shareNote = shareChanged ? ` · share ${prev.hajiPct}/${prev.alimPct} → ${entry.hajiPct}/${entry.alimPct}` : "";
    mutate((d) => {
      let next = { ...d };
      if (entry.id && d.transactions.some((t) => t.id === entry.id)) next.transactions = d.transactions.map((t) => t.id === entry.id ? entry : t);
      else next.transactions = [...d.transactions, entry];
      // update linked source status
      if (source?.kind === "student") next.students = next.students.map((s) => s.id === source.id ? { ...s, paymentStatus: "Paid" } : s);
      if (source?.kind === "marketing") next.marketing = next.marketing.map((m) => m.id === source.id ? { ...m, lastPaid: entry.date } : m);
      return next;
    }, { action: `${entry.id ? "updated" : "added"} ${entry.kind} ${money(entry.amount)}${entry.client ? " · " + entry.client : ""}${shareNote}`, module: "Accounts" });
  };

  const saveTask = (task, fromConcept) => {
    const isUpdate = task.id && db.tasks.some((t) => t.id === task.id);
    mutate((d) => {
      let next = { ...d };
      if (isUpdate) next.tasks = d.tasks.map((t) => t.id === task.id ? task : t);
      else next.tasks = [...d.tasks, task];
      if (fromConcept) next.concepts = d.concepts.filter((c) => c.id !== fromConcept);
      return next;
    }, isAdmin ? { action: `${isUpdate ? "updated" : "created"} task "${task.title}"`, module: "Tasks" } : null);
  };

  const saveGeneric = (coll, item, label) => {
    mutate((d) => ({ ...d, [coll]: d[coll].some((x) => x.id === item.id) ? d[coll].map((x) => x.id === item.id ? item : x) : [...d[coll], item] }),
      { action: `${db[coll].some((x) => x.id === item.id) ? "updated" : "added"} ${label}`, module: label === "project" ? "Projects" : label === "student" ? "Courses" : label === "marketing client" ? "Marketing" : "Concepts" });
  };

  const Loading = ({ note }) => (
    <div className="allbee" data-theme={isDark ? "dark" : "light"} style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 10 }}>
        <Hexagon size={20} className="spin" /> {note || "Loading ALLBEE…"}
      </div>
    </div>
  );

  if (session === undefined) return <Loading />;
  if (!session) return <Lock isDark={isDark} setDark={setIsDark} />;
  if (profile === undefined) return <Loading note="Signing you in…" />;
  if (profile && profile.active === false)
    return <Blocked isDark={isDark} name={currentUser} onSignOut={signOut} />;
  if (loading || !db) return <Loading />;

  const teamNames = team.length ? team.map((p) => p.name) : USERS;
  const visibleNav = NAV.filter((n) => isAdmin || n[3] !== "admin");
  const allowed = isAdmin ? null : new Set(["dashboard", "tasks", "attendance", "leave", "updates"]);
  const safeRoute = !allowed || allowed.has(route) ? route : "dashboard";
  const detailTask = taskDetailId ? db.tasks.find((t) => t.id === taskDetailId) : null;
  const routeTitle =
    accountUser && isAdmin ? `${accountUser} — account` :
    taskDetailId ? (detailTask ? detailTask.title : "Task") :
    NAV.find((n) => n[0] === safeRoute)?.[1] || "";
  const myPending = db.tasks.filter((t) => t.status !== "Completed" && (isAdmin || t.assignedTo === currentUser)).length;

  const renderPage = () => {
    // full-page detail views take precedence over the tab routes
    if (taskDetailId) return <TaskDetail db={db} taskId={taskDetailId} me={me} isAdmin={isAdmin} currentUser={currentUser} mutate={mutate} openModal={openModal} removeItem={removeItem} goBack={goBackDetail} />;
    if (accountUser && isAdmin) return <AccountFull db={db} user={accountUser} goBack={goBackDetail} />;

    switch (safeRoute) {
      case "dashboard":
        return isAdmin
          ? <Dashboard db={db} bal={bal} go={go} openBalance={openBalance} />
          : <StaffDashboard db={db} me={me} go={go} mutate={mutate} openModal={openModal} />;
      case "tasks": return <Tasks db={db} mutate={mutate} openModal={openModal} isAdmin={isAdmin} currentUser={currentUser} openTask={openTask} removeItem={removeItem} />;
      case "attendance": return <Attendance db={db} mutate={mutate} me={me} isAdmin={isAdmin} team={team} />;
      case "leave": return <Leave db={db} mutate={mutate} me={me} isAdmin={isAdmin} openModal={openModal} />;
      case "updates": return <Updates db={db} mutate={mutate} me={me} isAdmin={isAdmin} />;
      case "team": return <Team team={team} me={me} changeProfile={changeProfile} />;
      case "accounts": return <Accounts db={db} bal={bal} mutate={mutate} openModal={openModal} openBalance={openBalance} removeItem={removeItem} />;
      case "withdrawals": return <Withdrawals db={db} bal={bal} mutate={mutate} openModal={openModal} removeItem={removeItem} />;
      case "progress": return <Progress db={db} mutate={mutate} isAdmin={isAdmin} currentUser={currentUser} openTask={openTask} />;
      case "concepts": return <Concepts db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} />;
      case "courses": return <Courses db={db} mutate={mutate} openModal={openModal} openIncome={openIncome} removeItem={removeItem} />;
      case "marketing": return <Marketing db={db} mutate={mutate} openModal={openModal} openIncome={openIncome} removeItem={removeItem} />;
      case "projects": return <Projects db={db} mutate={mutate} openModal={openModal} openIncome={openIncome} removeItem={removeItem} />;
      case "recently-deleted": return <RecentlyDeleted db={db} openModal={openModal} restoreItem={restoreItem} />;
      case "vault": return <Vault db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} />;
      case "audit": return <AuditLog db={db} />;
      case "settings": return <Settings db={db} mutate={mutate} replaceDB={replaceDB} syncError={syncError} currentUser={currentUser} role={profile?.role} teamCount={team.length} sessionEmail={session?.user?.email} openModal={openModal} />;
      default: return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className={"allbee" + (menuOpen ? " menu-open" : "")} data-theme={isDark ? "dark" : "light"}>
        <style>{CSS}</style>

        {syncError && (
          <div className="banner"><CloudOff size={15} /> Couldn't sync with the server: {syncError}</div>
        )}

        <div className="layout">
          {menuOpen && <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />}
          <aside className="sidebar">
            <div className="brand">
              <img className="brand-logo" src={LOGO_ICON} alt="ALLBEE" style={{ height: 34 }} />
              <div><h1>ALLBEE</h1><p>Solutions</p></div>
            </div>
            {visibleNav.map(([key, label, Icon]) => (
              <div key={key} className={"navitem" + (safeRoute === key ? " active" : "")} onClick={() => go(key)}>
                <Icon size={18} /> {label}
                {key === "tasks" && myPending > 0 && <span className="badge pri">{myPending}</span>}
              </div>
            ))}
            <div className="sidebar-foot">
              <div className="navitem" onClick={() => setIsDark(!isDark)}>{isDark ? <Sun size={18} /> : <Moon size={18} />} {isDark ? "Light mode" : "Dark mode"}</div>
            </div>
          </aside>

          <div className="main">
            <header className="topbar">
              <button className="iconbtn hamburger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu"><Menu size={18} /></button>
              <div><h2>{routeTitle}</h2><div className="topbar-sub">ALLBEE Solutions · internal</div></div>
              {isAdmin && (
                <div className="company-pill">
                  <div><div className="lbl">Company balance</div><div className="val mono" style={{ color: bal.company < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal.company)}</div></div>
                </div>
              )}
              <div style={{ marginLeft: isAdmin ? 0 : "auto" }}><NotifBell db={db} me={me} openTask={openTask} /></div>
              <div className="usermenu">
                <div className="userchip" onClick={() => setUserMenu((v) => !v)}>
                  <div className="avatar" style={{ background: avatarColor(currentUser) }}>{currentUser[0]}</div>
                  <span className="userchip-name">{currentUser}</span>
                  <span className={"role-badge " + (isAdmin ? "admin" : "staff")}>{isAdmin ? "Admin" : "Staff"}</span>
                </div>
                {userMenu && (
                  <div className="dropdown" onMouseLeave={() => setUserMenu(false)}>
                    <div className="drop-id">
                      <div className="avatar" style={{ background: avatarColor(currentUser), width: 22, height: 22, fontSize: 10 }}>{currentUser[0]}</div>
                      <div><div style={{ fontWeight: 700, fontSize: 13 }}>{currentUser}</div><div className="hint-line" style={{ fontSize: 11 }}>{session?.user?.email}</div></div>
                    </div>
                    <button onClick={signOut}><LogOut size={15} />Sign out</button>
                  </div>
                )}
              </div>
            </header>
            {renderPage()}
          </div>
        </div>

        {/* MODALS */}
        {modal?.type === "income" && <ShareForm kind="income" initial={modal.initial} currentUser={currentUser} onSave={(e) => saveShare(e, modal.source)} onClose={() => setModal(null)} />}
        {modal?.type === "expense" && <ShareForm kind="expense" initial={modal.initial} currentUser={currentUser} onSave={(e) => saveShare(e, modal.source)} onClose={() => setModal(null)} />}
        {modal?.type === "withdraw" && <WithdrawForm balances={bal} defaultUser={currentUser} onSave={(w) => mutate((d) => ({ ...d, withdrawals: [...d.withdrawals, w] }), { action: `withdrew ${money(w.amount)}`, module: "Withdrawals" })} onClose={() => setModal(null)} />}
        {modal?.type === "task" && <TaskForm initial={modal.initial} currentUser={currentUser} team={teamNames} isAdmin={isAdmin} onSave={(t) => saveTask(t, modal.fromConcept)} onClose={() => setModal(null)} />}
        {modal?.type === "leave" && <LeaveForm initial={modal.initial} me={me} onSave={(l) => mutate((d) => ({ ...d, leave: d.leave.some((x) => x.id === l.id) ? d.leave.map((x) => x.id === l.id ? l : x) : [...d.leave, l] }), null)} onClose={() => setModal(null)} />}
        {modal?.type === "project" && <ProjectForm initial={modal.initial} onSave={(p) => saveGeneric("projects", p, "project")} onClose={() => setModal(null)} />}
        {modal?.type === "student" && <StudentForm initial={modal.initial} onSave={(s) => saveGeneric("students", s, "student")} onClose={() => setModal(null)} />}
        {modal?.type === "marketing" && <MarketingForm initial={modal.initial} onSave={(m) => saveGeneric("marketing", m, "marketing client")} onClose={() => setModal(null)} />}
        {modal?.type === "concept" && <ConceptForm initial={modal.initial} onSave={(c) => saveGeneric("concepts", c, "idea")} onClose={() => setModal(null)} />}
        {modal?.type === "confirm" && <Confirm title={modal.title} body={modal.body} confirmLabel={modal.confirmLabel} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
        {modal?.type === "deleteConfirm" && <TypedConfirm title={modal.title} body={modal.body} note={modal.note} actionLabel={modal.actionLabel || "Delete"} icon={<Trash2 size={15} />} danger onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
        {modal?.type === "restoreConfirm" && <TypedConfirm title={modal.title} body={modal.body} note={modal.note} actionLabel={modal.actionLabel || "Restore"} icon={<RotateCcw size={15} />} danger={false} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
        {modal?.type === "importData" && <ImportData mutate={mutate} currentUser={currentUser} onClose={() => setModal(null)} />}
        {modal?.type === "vault" && <VaultForm initial={modal.initial} onSave={(v) => mutate((d) => ({ ...d, vault: d.vault.some((x) => x.id === v.id) ? d.vault.map((x) => x.id === v.id ? v : x) : [...d.vault, v] }), { action: `${db.vault.some((x) => x.id === v.id) ? "updated" : "added"} credentials for ${v.service}`, module: "Passwords" })} onClose={() => setModal(null)} />}

        {balanceUser && <BalanceDetail db={db} user={balanceUser} onClose={() => setBalanceUser(null)} onFull={isAdmin ? openAccount : undefined} />}
      </div>
    </ErrorBoundary>
  );
}
