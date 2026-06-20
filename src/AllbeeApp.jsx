import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Wallet, ArrowDownToLine, ListTodo, TrendingUp, Lightbulb,
  GraduationCap, Megaphone, FolderKanban, ScrollText, Settings as SettingsIcon,
  Plus, X, Sun, Moon, Search, Trash2, Pencil, ChevronRight, Check, AlertTriangle,
  Download, Upload, LogOut, Hexagon, CalendarClock, ArrowRight, Menu, Wifi, WifiOff,
  Mail, KeyRound, LogIn, RefreshCw, CloudOff,
  Users, UserCheck, CalendarDays, MessageSquare, Plane, Clock, CheckCircle2, XCircle, Hourglass, ShieldCheck,
  ArrowLeft, Undo2, RotateCcw, Paperclip, Link2, ExternalLink, Activity, Filter, Send, FileText, Sheet, Tag,
  Copy, Eye, EyeOff, Lock as LockIcon, Unlock as UnlockIcon, Award, Star, BookOpen, Bell, Building2, Phone, UserPlus, Megaphone as MegaphoneIcon, BadgeCheck, Banknote,
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
const LEAVE_TYPES = ["Casual", "Sick", "Emergency", "Earned", "Unpaid", "Other"];

// Phase 3–6 domain vocab
const LEAD_STAGES = ["New", "Contacted", "Qualified", "Proposal Sent", "Converted", "Lost"];
const LEAD_SOURCES = ["Referral", "Instagram", "Facebook", "Website", "Walk-in", "Cold call", "Other"];
const QUOTE_STATUS = ["Draft", "Sent", "Accepted", "Rejected"];
const DOC_CATEGORIES = ["Contract", "Invoice", "Design", "Brand", "Report", "Other"];
const KB_CATEGORIES = ["Policy", "How-to", "FAQ", "Onboarding", "Tools", "Other"];
const EXPENSE_RECURRENCE = ["One-time", "Monthly", "Quarterly", "Yearly"];
const REWARD_KINDS = ["Star performer", "On-time hero", "Team player", "Goal smashed", "Bonus"];
const VAULT_CATEGORIES = ["Social", "Website", "Hosting", "Email", "Domain", "Banking", "Tools", "Other"];

// ── Phase 7 additions: statuses, levels, notifications, file uploads ───────
const CLIENT_STATUS = ["Prospect", "Active", "Inactive", "Blacklisted"];
const PLANNED_STATUS = ["Planned", "Approved", "Purchased", "Cancelled"];
const NOTIF_LEVELS = ["General", "Important", "Urgent"];
const NOTIF_AUDIENCES = [["all", "Everyone"], ["staff", "Staff only"], ["intern", "Interns only"], ["accountant", "Accountants only"], ["admin", "Admins only"]];
const INVOICE_STATUS = ["Draft", "Sent", "Paid", "Overdue", "Cancelled"];
const LEAD_SERVICES = ["Website", "App", "Digital marketing", "Course", "Branding", "Other"];
const ONLINE_MS = 2 * 60 * 1000; // a member is "online" if active within 2 minutes
const isOnline = (p) => !!(p && p.last_active) && (Date.now() - new Date(p.last_active).getTime()) < ONLINE_MS;
function notifVisibleTo(n, profile) {
  const aud = (n && n.audience) || "all";
  if (aud === "all") return true;
  if (aud.startsWith("user:")) return aud.slice(5) === (profile && profile.id);
  return aud === (profile && profile.role);
}
const FILE_LIMITS = { image: 10, pdf: 50, doc: 25 };
const fileKind = (file) => { const t = ((file && file.type) || "").toLowerCase(); if (t.startsWith("image/")) return "image"; if (t === "application/pdf") return "pdf"; return "doc"; };
const fileLimitOK = (file) => ((file && file.size) || 0) <= FILE_LIMITS[fileKind(file)] * 1024 * 1024;
async function uploadAttachment(file) {
  const k = fileKind(file);
  if (!fileLimitOK(file)) throw new Error(`File too large \u2014 ${k === "image" ? "images" : k === "pdf" ? "PDFs" : "documents"} are limited to ${FILE_LIMITS[k]} MB.`);
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("attachments").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("attachments").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, size: file.size, type: file.type };
}

// Recently Deleted (recycle bin): which collections support soft-delete + restore,
// the human label shown for each, and how long items survive before auto-cleanup.
const RECYCLE_TTL_DAYS = 60;
const MODULE_LABEL = {
  transactions: "Accounts", withdrawals: "Withdrawals", tasks: "Tasks",
  projects: "Projects", students: "Courses", marketing: "Marketing", concepts: "Concepts",
  leads: "Leads", clients: "Clients", quotations: "Quotations", planned: "Planned expenses",
  announcements: "Announcements", documents: "Documents", knowledge: "Knowledge base",
  rewards: "Rewards", vault: "Passwords", portal_posts: "Client updates",
  notifications: "Notifications", invoices: "Invoices",
};
const LOGO_FULL = "/allbee-logo.png";   // full lockup (monogram + wordmark)
const LOGO_ICON = "/allbee-icon.png";   // square monogram

/* ── roles & access (Phase 3 — five levels) ───────────────────────────────
   superadmin (Haji & Alim) · admin · accountant · staff · intern.
   The money (Share & accounts, Withdrawals) is superadmin + accountant only;
   a plain admin runs the team and business but never sees the partner split. */
const ROLE_LABEL = { superadmin: "Super admin", admin: "Admin", accountant: "Accountant", staff: "Staff", intern: "Intern" };
const ROLE_OPTIONS = ["admin", "accountant", "staff", "intern"]; // an admin may assign these — never superadmin
const STATUS_LABEL = { active: "Active", on_leave: "On leave", suspended: "Suspended", resigned: "Resigned", terminated: "Terminated" };
const STATUS_OPTIONS = ["active", "on_leave", "suspended", "resigned", "terminated"];
// statuses that revoke sign-in (the row's `active` flag is set from this)
const STATUS_ACTIVE = { active: true, on_leave: true, suspended: false, resigned: false, terminated: false };
// business modules an admin can grant to an individual staff member, one by one
const GRANTABLE_MODULES = [["projects", "Projects"], ["leads", "Leads"], ["clients", "Clients"], ["courses", "Courses"], ["marketing", "Marketing"], ["concepts", "Concepts"]];
// who must accept the Terms & Conditions before they can use the app
const TNC_ROLES = ["accountant", "staff", "intern"];

const isSuperRole = (r) => r === "superadmin";
const isAdminRole = (r) => r === "superadmin" || r === "admin";        // management level
const canFinanceRole = (r) => r === "superadmin" || r === "accountant"; // the money

// Which nav entries a user can see, derived from their role + granted modules.
function navAllowed(tag, role, perms) {
  const sa = isSuperRole(role), adm = isAdminRole(role);
  const acc = role === "accountant", staff = role === "staff", intern = role === "intern";
  if (tag === "everyone") return true;               // dashboard
  if (tag === "work") return adm || staff || intern;  // tasks, attendance, daily updates
  if (tag === "leave") return adm || staff;           // leave (not interns, not accountant)
  if (tag === "finance") return sa || acc;            // share & accounts, withdrawals, planned
  if (tag === "admin") return adm;                    // team, progress, recycle, audit, settings
  if (tag === "collab") return true;                  // announcements, chat, docs, knowledge (any internal user)
  if (tag === "vault") return sa;                     // password vault (partners only for now)
  if (tag === "insight") return adm;                  // performance, rewards
  if (tag.startsWith("perm:")) {
    const mod = tag.slice(5);
    return adm || (staff && Array.isArray(perms?.modules) && perms.modules.includes(mod));
  }
  return adm;
}

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

// Subtle haptic feedback — only for meaningful actions (task accept/complete,
// leave & withdrawal decisions, notifications). No-op where unsupported.
function haptic(pattern = 12) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignore */ }
}
const minsSince = (ts) => (Date.now() - (ts || 0)) / 60000;
const withinMinutes = (ts, m) => minsSince(ts) <= m;
// Sum worked hours across completed attendance sessions (ignores open ones).
const sumHours = (rows) => rows.reduce((s, a) => s + (a.checkOut ? (hoursBetween(a.checkIn, a.checkOut) || 0) : 0), 0);
const startOfWeek = (ref = new Date()) => { const d = new Date(ref); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d; };

/* ── data layer (Supabase) ────────────────────────────────────────────────
   Architecture preserved from the prototype: the whole database is held in
   memory as one `db` object and all derived values are computed in JS. Here
   each collection is a Postgres table with one row per record:
   ( id text primary key, data jsonb, updated_at timestamptz ).
   We load every row into the in-memory shape, and on each change we persist
   only the rows that actually changed (insert / update / delete).
─────────────────────────────────────────────────────────────────────────── */
const TABLES = ["transactions", "withdrawals", "tasks", "projects", "students", "marketing", "concepts", "audit", "attendance", "leave", "updates", "recycle",
  "leads", "clients", "quotations", "planned", "announcements", "documents", "knowledge", "chat", "rewards", "vault", "portal_posts", "notifications", "invoices"];

async function fetchAll() {
  const db = emptyDB();
  await Promise.all(TABLES.map(async (t) => {
    const { data, error } = await supabase.from(t).select("id,data");
    if (error) {
      // Tolerate a table that hasn't been migrated yet so a partial deploy
      // (new app, old schema) doesn't brick the whole workspace. Real errors
      // (RLS, auth, network) still surface.
      if (/does not exist|find the table|schema cache|PGRST205/i.test(error.message || "")) { db[t] = []; return; }
      throw new Error(`Loading ${t}: ${error.message}`);
    }
    db[t] = (data || [])
      .map((r) => r.data)
      .sort((a, b) => (a?.createdAt || a?.ts || 0) - (b?.createdAt || b?.ts || 0));
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
  const { data, error } = await supabase.from("profiles").select("id,name,email,role,active,created_at,status,mobile,dob,photo_url,perms,tnc_version,approved,designation,last_active,username").order("created_at", { ascending: true });
  if (error) throw new Error(`Loading team: ${error.message}`);
  return data || [];
}
// The live Terms & Conditions + version live in app_config; staff can read only
// the tnc_* keys (the admin sign-up code is locked away by row-level security).
async function fetchConfig() {
  const { data, error } = await supabase.from("app_config").select("key,value").in("key", ["tnc_version", "tnc_body", "company"]);
  if (error) return {}; // non-fatal — the T&C gate simply won't apply
  const out = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}
async function saveConfig(patch) {
  const rows = Object.entries(patch).map(([key, value]) => ({ key, value: value == null ? "" : String(value) }));
  const { error } = await supabase.from("app_config").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

// Global, never-reused task number (atomic on the server).
async function nextTaskNumber() {
  const { data, error } = await supabase.rpc("next_task_number");
  if (error) return null;
  return typeof data === "number" ? data : Number(data);
}
// Financial period locks ('YYYY-MM'). Partners lock/unlock; the DB blocks writes
// to a locked month for everyone else.
async function fetchLocks() {
  const { data, error } = await supabase.from("fin_locks").select("period").order("period", { ascending: true });
  if (error) return [];
  return (data || []).map((r) => r.period);
}
async function lockPeriod(period, who) {
  const { error } = await supabase.from("fin_locks").upsert({ period, locked_by: who || null }, { onConflict: "period" });
  if (error) throw new Error(error.message);
}
async function unlockPeriod(period) {
  const { error } = await supabase.from("fin_locks").delete().eq("period", period);
  if (error) throw new Error(error.message);
}
const periodOf = (iso) => (iso ? String(iso).slice(0, 7) : todayISO().slice(0, 7)); // 'YYYY-MM'
const fmtPeriod = (p) => { const [y, m] = (p || "").split("-"); const d = new Date(Number(y), Number(m) - 1, 1); return isNaN(d) ? p : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }); };
const fmtDateTime = (ts) => { const d = new Date(ts); return isNaN(d) ? "—" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); };
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
  version: 3,
  transactions: [], withdrawals: [], tasks: [], projects: [],
  students: [], marketing: [], concepts: [], audit: [],
  attendance: [], leave: [], updates: [], recycle: [],
  leads: [], clients: [], quotations: [], planned: [],
  announcements: [], documents: [], knowledge: [], chat: [],
  rewards: [], vault: [], portal_posts: [],
  notifications: [], invoices: [],
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
    if (w.status === "pending" || w.status === "rejected") continue; // only approved withdrawals move money
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
  for (const w of db.withdrawals.filter((w) => w.user === user && w.status !== "pending" && w.status !== "rejected")) {
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

// ── dual-accept for "Haji & Alim" tasks ───────────────────────────────────
// A task assigned to BOTH partners needs each of them to Accept before it can
// Start; a single-assignee task needs only that one person. Either may Complete.
const taskAccepts = (t) => (Array.isArray(t.accepts) ? t.accepts : []);

// The workflow patch produced when `by` clicks the action button. Returns only
// the fields to merge into the task. For a combined task still gathering both
// partners' acceptances it records the acceptance and keeps the status "Created".
function nextTaskState(t, by) {
  const accepts = taskAccepts(t);
  if (t.status === "Created" && t.assignedTo === COMBINED) {
    const merged = accepts.includes(by) ? accepts : [...accepts, by];
    if (!USERS.every((u) => merged.includes(u))) {
      return { accepts: merged, history: [...(t.history || []), { status: `Accepted by ${by}`, at: Date.now(), by }] };
    }
    return { status: "Accepted", accepts: merged, progress: t.progress || 0, history: [...(t.history || []), { status: "Accepted", at: Date.now(), by }] };
  }
  const i = TASK_FLOW.indexOf(t.status);
  const next = TASK_FLOW[Math.min(i + 1, TASK_FLOW.length - 1)];
  const progress = next === "Completed" ? 100 : next === "In Progress" ? Math.max(t.progress || 0, 25) : (t.progress || 0);
  const merged = next === "Accepted" && !accepts.includes(by) ? [...accepts, by] : accepts;
  return { status: next, progress, accepts: merged, history: [...(t.history || []), { status: next, at: Date.now(), by }] };
}
// Label + disabled state for the workflow button. `null` means no action (done).
function taskAction(t, by) {
  if (t.status === "Completed") return null;
  if (t.status === "Created" && t.assignedTo === COMBINED && taskAccepts(t).includes(by)) {
    const waiting = USERS.filter((u) => !taskAccepts(t).includes(u)).join(" & ");
    return { label: `Waiting for ${waiting}`, disabled: true };
  }
  return { label: t.status === "Created" ? "Accept" : t.status === "Accepted" ? "Start" : "Complete", disabled: false };
}
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

/* ── Phase 3: roles, access gates, lifecycle ───────────────────────────── */
.role-badge.superadmin { background:rgba(234,164,23,.18); color:var(--accent); }
.role-badge.accountant { background:var(--pos-soft); color:var(--pos); }
.role-badge.intern { background:var(--surface-2); color:var(--muted); }

/* first-login profile + terms gates reuse the lock card */
.gate-card { max-width:480px; text-align:left; }
.gate-card h1 { font-size:22px; text-align:center; }
.gate-card > p { text-align:center; }
.gate-foot { display:flex; gap:10px; margin-top:18px; }
.tnc-scroll { max-height:44vh; overflow:auto; border:1px solid var(--border); border-radius:12px;
  padding:14px 16px; background:var(--surface-2); font-size:13.5px; line-height:1.6; white-space:pre-wrap; }
.checkrow { display:flex; align-items:flex-start; gap:10px; font-size:13.5px; margin-top:16px; cursor:pointer; line-height:1.45; }
.checkrow input { margin-top:2px; width:16px; height:16px; flex:none; }

/* per-staff module grants */
.perm-list { display:flex; flex-direction:column; gap:8px; }
.perm-item { display:flex; align-items:center; gap:11px; padding:11px 13px; border:1px solid var(--border);
  border-radius:10px; background:var(--surface-2); font-size:14px; font-weight:600; cursor:pointer; }
.perm-item input { width:16px; height:16px; }

/* employee lifecycle */
.status-pill { font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px; white-space:nowrap; }
.status-active { background:var(--pos-soft); color:var(--pos); }
.status-on_leave { background:rgba(234,164,23,.16); color:var(--accent); }
.status-suspended, .status-resigned, .status-terminated { background:var(--neg-soft); color:var(--neg); }
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
function Dashboard({ db, bal, go, openBalance, showMoney = true, showOps = true }) {
  const m = monthStats(db);
  const pending = db.tasks.filter((t) => t.status !== "Completed").length;
  const active = db.projects.filter((p) => p.stage !== "Completed").length;
  const recent = [...db.audit].slice(-8).reverse();
  const stats = [];
  if (showMoney) {
    stats.push(<div key="rev" className="card stat"><div className="lbl"><TrendingUp size={14} /> Monthly revenue</div><div className="num mono pos-txt">{money(m.rev)}</div></div>);
    stats.push(<div key="exp" className="card stat"><div className="lbl"><TrendingUp size={14} style={{ transform: "scaleY(-1)" }} /> Monthly expenses</div><div className="num mono neg-txt">{money(m.exp)}</div></div>);
  }
  if (showOps) {
    stats.push(<div key="tasks" className="card stat" style={{ cursor: "pointer" }} onClick={() => go("tasks")}><div className="lbl"><ListTodo size={14} /> Pending tasks</div><div className="num">{pending}</div></div>);
    stats.push(<div key="proj" className="card stat" style={{ cursor: "pointer" }} onClick={() => go("projects")}><div className="lbl"><FolderKanban size={14} /> Active projects</div><div className="num">{active}</div></div>);
  }
  return (
    <div className="content">
      <div className="page-head"><h3>Dashboard</h3></div>

      {showMoney && (
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
      )}

      {showMoney && (
        <div className="cards-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
          {USERS.map((u) => (
            <div key={u} className="card balance-card" onClick={() => openBalance(u)}>
              <div className="stripe" style={{ background: avatarColor(u) }} />
              <div className="who"><span className="dot" style={{ background: avatarColor(u) }} /> {u} balance</div>
              <div className="amt mono" style={{ color: bal[u] < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal[u])}</div>
              <div className="hint">View full breakdown <ChevronRight size={13} /></div>
            </div>
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 18 }}>
          {stats}
        </div>
      )}

      <div className="card">
        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>Recent activity</div>
        {recent.length === 0 ? (
          <Empty icon={<ScrollText size={22} color="var(--muted)" />} title="Nothing here yet" text="Your activity feed fills up as the team works." />
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

function Accounts({ db, bal, mutate, openModal, openBalance, removeItem, locks = [], lockPeriod, unlockPeriod, isSuper, currentUser }) {
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const thisPeriod = todayISO().slice(0, 7);
  const lockedThis = locks.includes(thisPeriod);
  const doLock = async (p, on) => { try { on ? await lockPeriod(p, currentUser) : await unlockPeriod(p); } catch (e) { alert(e.message || "Couldn't update the lock."); } };
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
        <button className="btn" onClick={() => openModal({ type: "expense" })}><Plus size={16} />Add expense</button>
        <button className="btn primary" onClick={() => openModal({ type: "income" })}><Plus size={16} />Add income</button>
      </div>

      {lockedThis && <div className="banner" style={{ marginLeft: 0, marginRight: 0, marginBottom: 14 }}><LockIcon size={15} /> {fmtPeriod(thisPeriod)} is locked — income, expenses and withdrawals dated this month are frozen{isSuper ? "." : " until a partner unlocks it."}</div>}

      {isSuper && (
        <div className="card stat" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <LockIcon size={16} color="var(--muted)" />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700 }}>Financial locking</div>
              <div className="hint-line" style={{ fontSize: 12 }}>Lock a closed month to freeze its books. Only partners can lock or unlock.</div>
            </div>
            <button className={"btn sm " + (lockedThis ? "" : "primary")} onClick={() => doLock(thisPeriod, !lockedThis)}>
              {lockedThis ? <><UnlockIcon size={13} />Unlock {fmtPeriod(thisPeriod)}</> : <><LockIcon size={13} />Lock {fmtPeriod(thisPeriod)}</>}
            </button>
          </div>
          {locks.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {locks.map((p) => <span key={p} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><LockIcon size={11} />{fmtPeriod(p)}<button className="iconbtn" style={{ width: 20, height: 20 }} onClick={() => doLock(p, false)} title="Unlock"><X size={11} /></button></span>)}
          </div>}
        </div>
      )}

      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
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

function Withdrawals({ db, bal, mutate, openModal, removeItem, isSuper, currentUser }) {
  const list = [...db.withdrawals].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const del = (w) => removeItem("withdrawals", w, { name: `Withdrawal ${money(w.amount)} · ${w.user}`, audit: `deleted a withdrawal of ${money(w.amount)}` });
  const statusOf = (w) => w.status || "approved"; // legacy rows (no status) already moved money
  const tone = (s) => s === "approved" ? "pos" : s === "rejected" ? "neg" : "pri";
  const setStatus = (w, s) => { haptic(s === "approved" ? 12 : [10, 30, 10]); mutate((d) => ({ ...d, withdrawals: d.withdrawals.map((x) => x.id === w.id ? { ...x, status: s, approvedBy: currentUser, approvedAt: Date.now() } : x) }),
    { action: `${s === "approved" ? "approved" : "rejected"} withdrawal of ${money(w.amount)} for ${w.user}`, module: "Withdrawals" }); };
  const pending = list.filter((w) => statusOf(w) === "pending").length;
  return (
    <div className="content">
      <div className="page-head"><h3>Withdrawals</h3><span className="spacer" />
        <button className="btn primary" onClick={() => openModal({ type: "withdraw" })}><Plus size={16} />Record withdrawal</button></div>

      {pending > 0 && <div className="banner" style={{ marginLeft: 0, marginRight: 0 }}><Hourglass size={15} /> {pending} withdrawal{pending > 1 ? "s" : ""} awaiting a partner's approval. Only approved withdrawals affect the balances.</div>}

      <div className="cards-grid" style={{ gridTemplateColumns: "1fr 1fr", margin: "16px 0" }}>
        {USERS.map((u) => (
          <div key={u} className="card stat"><div className="lbl"><span className="dot" style={{ background: avatarColor(u) }} /> {u} available</div>
            <div className="num mono" style={{ color: bal[u] < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal[u])}</div>
            {bal[u] < 0 && <div className="sub neg-txt">Negative — to be settled by future profit share</div>}</div>
        ))}
      </div>

      <div className="card">
        {list.length === 0 ? (
          <Empty icon={<ArrowDownToLine size={22} color="var(--muted)" />} title="No withdrawals yet" text="A partner can withdraw up to their current balance. Each withdrawal needs a partner's approval before it moves money." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Partner</th><th className="num-cell">Amount</th><th>Status</th><th>Notes</th><th></th></tr></thead>
              <tbody>{list.map((w) => {
                const st = statusOf(w);
                return (
                <tr key={w.id} style={st === "rejected" ? { opacity: 0.55 } : undefined}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(w.date)}</td>
                  <td><span className="badge" style={{ background: "var(--surface-2)" }}><span className="dot" style={{ background: avatarColor(w.user), display: "inline-block", marginRight: 5 }} />{w.user}</span></td>
                  <td className="num-cell mono neg-txt" style={{ fontWeight: 700 }}>{money(-w.amount)}</td>
                  <td><span className={"badge " + tone(st)} style={{ textTransform: "capitalize" }}>{st}</span></td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{w.notes || "—"}</td>
                  <td><div className="row-actions">
                    {isSuper && st !== "approved" && <button className="btn sm primary" onClick={() => setStatus(w, "approved")} title="Approve"><Check size={13} /></button>}
                    {isSuper && st !== "rejected" && <button className="btn sm danger" onClick={() => setStatus(w, "rejected")} title="Reject"><X size={13} /></button>}
                    <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete withdrawal?", body: `Remove this ${money(w.amount)} withdrawal for ${w.user}?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(w) })}><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ); })}</tbody>
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
    else if (filter === "progress") r = r.filter((t) => t.status === "In Progress");
    else if (filter === "done") r = r.filter((t) => t.status === "Completed");
    return r;
  }, [db.tasks, filter, scope, isAdmin, currentUser]);

  const auditFor = (action) => ({ action, module: "Tasks" });

  // advance is only ever called by the assigned person (button is gated below).
  // A task assigned to both partners needs each of them to Accept before Start.
  const advance = (t) => {
    const patch = nextTaskState(t, currentUser);
    const note = patch.status ? `moved "${t.title}" to ${patch.status}` : `accepted "${t.title}"`;
    haptic(patch.status === "Completed" ? [10, 40, 10] : 12);
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, ...patch } : x) }), auditFor(note));
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

  return (
    <div className="content">
      <div className="page-head"><h3>{isAdmin ? "Tasks" : "My tasks"}</h3><span className="spacer" />
        <button className="btn primary" onClick={() => openModal({ type: "task" })}><Plus size={16} />New task</button></div>
      <div className="toolbar">
        <div className="seg">{[["all", "All"], ["active", "Active"], ["progress", "Progress"], ["done", "Completed"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
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
          const act = canAct ? taskAction(t, currentUser) : null;
          return (
            <div key={t.id} className="item-row">
              <div className="item-main">
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  {t.num != null && <span className="badge mono" style={{ fontWeight: 700 }}>#{t.num}</span>}
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
                {act && <button className="btn sm primary" disabled={act.disabled} onClick={() => { if (!act.disabled) advance(t); }}>{act.label}<ArrowRight size={13} /></button>}
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
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, progress: v, status: done ? "Completed" : "In Progress", history } : x) }), done ? { action: `completed "${t.title}"`, module: "Progress" } : null);
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
  const auditFor = (action) => ({ action, module: "Tasks" });

  const advance = () => {
    const patch = nextTaskState(t, currentUser);
    const note = patch.status ? `moved "${t.title}" to ${patch.status}` : `accepted "${t.title}"`;
    haptic(patch.status === "Completed" ? [10, 40, 10] : 12);
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => x.id === t.id ? { ...x, ...patch } : x) }), auditFor(note));
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
  const act = canAct ? taskAction(t, currentUser) : null;
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
          {t.num != null && <div className="hint-line mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".5px" }}>TASK #{t.num}</div>}
          <h3>{t.title}</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span className={"badge " + (t.status === "Completed" ? "pos" : t.status === "In Progress" ? "accent" : "pri")}>{t.status}</span>
            {t.priority && <span className={"badge " + priorityTone(t.priority)}>{t.priority}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {act && <button className="btn primary" disabled={act.disabled} onClick={() => { if (!act.disabled) advance(); }}>{act.label}<ArrowRight size={14} /></button>}
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
    const skip = new Set(["id", "createdAt", "history", "comments", "attachments"]);
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

function Projects({ db, mutate, openModal, openIncome, removeItem, canFinance, isAdmin, me }) {
  const list = [...db.projects].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  // Staff may edit a project they created for 7 days; after that it's admin-only.
  const canEditP = (p) => isAdmin || (p.createdById === me?.id && (Date.now() - (p.createdAt || 0)) < 7 * 86400000);
  const setStage = (p, stage) => mutate((d) => ({ ...d, projects: d.projects.map((x) => x.id === p.id ? { ...x, stage } : x) }), { action: `set "${p.name}" to ${stage}`, module: "Projects" });
  const appr = (p) => p.approvalStatus || "approved"; // legacy projects count as approved
  const setApproval = (p, s) => mutate((d) => ({ ...d, projects: d.projects.map((x) => x.id === p.id ? { ...x, approvalStatus: s, approvedAt: Date.now() } : x) }), { action: `${s === "approved" ? "approved" : "rejected"} project "${p.name}"`, module: "Projects" });
  const del = (p) => removeItem("projects", p, { name: p.name, audit: `deleted project "${p.name}"` });
  const pending = isAdmin ? list.filter((p) => appr(p) === "pending").length : 0;
  return (
    <div className="content">
      <div className="page-head"><h3>Projects</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "project" })}><Plus size={16} />New project</button></div>
      {pending > 0 && <div className="banner" style={{ marginLeft: 0, marginRight: 0, marginBottom: 14 }}><Hourglass size={15} /> {pending} project{pending > 1 ? "s" : ""} submitted by staff awaiting your approval.</div>}
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<FolderKanban size={22} color="var(--muted)" />} title="No projects yet" text="Track websites, apps and software from Lead all the way to Completed." action={<button className="btn primary" onClick={() => openModal({ type: "project" })}><Plus size={16} />New project</button>} /></div>
          : list.map((p) => (
            <div key={p.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div><div className="sub">{p.client || "No client"} · {p.type}</div></div>
                <div className="mono" style={{ fontWeight: 700 }}>{money(p.cost)}</div>
              </div>
              {appr(p) !== "approved" && <div><span className={"badge " + (appr(p) === "rejected" ? "neg" : "accent")}>{appr(p) === "rejected" ? "Rejected" : "Awaiting approval"}</span>{p.ownerName && <span className="hint-line" style={{ fontSize: 11, marginLeft: 8 }}>by {p.ownerName}</span>}</div>}
              <select className="select" value={p.stage} onChange={(e) => setStage(p, e.target.value)}>{PROJECT_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
              <div className="item-meta">{p.start && <span>Start {fmtDate(p.start)}</span>}{p.expected && <span>Due {fmtDate(p.expected)}</span>}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                {isAdmin && appr(p) !== "approved" && <button className="btn sm primary" onClick={() => setApproval(p, "approved")}><Check size={13} />Approve</button>}
                {isAdmin && appr(p) === "pending" && <button className="btn sm danger" onClick={() => setApproval(p, "rejected")}><X size={13} />Reject</button>}
                {canFinance && <button className="btn sm primary" onClick={() => openIncome({ client: p.client, project: p.name, amount: p.cost, category: "Project" })}>Record income</button>}
                {canEditP(p) && <button className="btn sm" onClick={() => openModal({ type: "project", initial: p })}><Pencil size={13} /></button>}
                {canEditP(p) && <button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Delete project?", body: `Delete "${p.name}"?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(p) })}><Trash2 size={13} /></button>}
                {!canEditP(p) && <span className="hint-line" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}><LockIcon size={11} />Admin-only after 7 days</span>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Courses({ db, mutate, openModal, openIncome, removeItem, canFinance }) {
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
                  {canFinance && <button className="btn sm primary" onClick={() => openIncome({ client: s.name, project: s.course || "Course fee", amount: s.fee, category: "Course", source: { kind: "student", id: s.id } })}>Record fee</button>}
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

function Marketing({ db, mutate, openModal, openIncome, removeItem, canFinance }) {
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
                  {canFinance && <button className="btn sm primary" onClick={() => openIncome({ client: m.client, project: (m.plan || "Marketing") + " — monthly", amount: m.monthlyFee, category: "Marketing", source: { kind: "marketing", id: m.id } })}>Record payment</button>}
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

function Settings({ db, mutate, replaceDB, syncError, currentUser, role, teamCount, sessionEmail, config, saveTnc, saveCompany }) {
  const fileRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);
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

      <TncManager config={config} saveTnc={saveTnc} />

      <CompanySettings config={config} saveCompany={saveCompany} />

      <div className="card stat" style={{ marginBottom: 14 }}>
        <div className="lbl" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Import from Excel / Google Sheets</div>
        <p className="hint-line" style={{ lineHeight: 1.55, marginBottom: 14 }}>
          Bring in existing records — income, expenses, withdrawals, projects, students, marketing clients, ideas or tasks — from a spreadsheet. Upload an <b>.xlsx</b> or <b>.csv</b> file (from Google Sheets use <b>File → Download</b>). Imported rows are <b>added</b> to what's already here; they don't replace anything.
        </p>
        <button className="btn primary" onClick={() => setImportOpen(true)}><Sheet size={16} />Import a spreadsheet</button>
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
          Signed in as <b style={{ color: avatarColor(currentUser) }}>{currentUser}</b>{sessionEmail ? ` (${sessionEmail})` : ""} · <b>{ROLE_LABEL[role] || "Staff"}</b>. Records live in a shared Postgres database and sync across the team in real time{syncError ? " — but the last sync failed, so some changes may not have saved yet" : ""}. Share &amp; accounts and Withdrawals are limited to the two partners and an accountant; module access for staff is set per person on the Team screen. All of this is enforced by the database, not just hidden. File attachments and an installable Android version are optional add-ons documented in the project README.
        </p>
      </div>

      {importOpen && <ImportData mutate={mutate} currentUser={currentUser} onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function TncManager({ config, saveTnc }) {
  const version = Number(config?.tnc_version || 0);
  const [body, setBody] = useState(config?.tnc_body || "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setBody(config?.tnc_body || ""); }, [config?.tnc_body]);
  const publish = async () => {
    setSaving(true); setDone(false);
    try { await saveTnc(body); setDone(true); } catch { /* surfaced via the sync banner */ } finally { setSaving(false); }
  };
  return (
    <div className="card stat" style={{ marginBottom: 14 }}>
      <div className="lbl" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Terms &amp; conditions</div>
      <p className="hint-line" style={{ lineHeight: 1.55, marginBottom: 14 }}>
        The agreement every accountant, staff member and intern accepts on first sign-in. {version > 0 ? <>Currently on <b>version {version}</b>. </> : <>Nothing published yet. </>}
        Publishing a change asks everyone to read and accept it again before they can carry on.
      </p>
      <textarea className="textarea" style={{ minHeight: 150 }} value={body} onChange={(e) => { setBody(e.target.value); setDone(false); }} placeholder="Paste or write your terms & conditions here…" />
      <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" onClick={publish} disabled={saving || !body.trim()}>
          {saving ? <RefreshCw size={16} className="spin" /> : <ScrollText size={16} />}{version > 0 ? "Publish update" : "Publish terms"}
        </button>
        {done && <span className="hint-line" style={{ color: "var(--pos)", display: "flex", alignItems: "center", gap: 6 }}><Check size={14} /> Published — the team will be asked to re-accept.</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STAFF + HR MODULES
══════════════════════════════════════════════════════════════════════ */
function StaffDashboard({ db, me, go, mutate, openModal }) {
  const today = todayISO();
  const todays = db.attendance.filter((a) => a.userId === me.id && a.date === today);
  const openSess = todays.find((a) => !a.checkOut);
  const todayH = sumHours(todays);
  const leaveToday = onApprovedLeave(db, me.id, today);
  const myOpen = db.tasks.filter((t) => t.assignedTo === me.name && t.status !== "Completed");
  const myPendingLeave = db.leave.filter((l) => l.userId === me.id && l.status === "Pending");
  const myUpdatesToday = db.updates.filter((u) => u.userId === me.id && u.date === today);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  const doCheckIn = () => mutate((d) => ({ ...d, attendance: [...d.attendance, { id: uid(), userId: me.id, userName: me.name, date: today, checkIn: new Date().toISOString(), checkOut: null, createdAt: Date.now() }] }), null);
  const doCheckOut = () => { if (!openSess) return; mutate((d) => ({ ...d, attendance: d.attendance.map((a) => a.id === openSess.id ? { ...a, checkOut: new Date().toISOString() } : a) }), null); };
  const checkIn = () => openModal({ type: "okConfirm", title: "Check in?", body: "Type OK to confirm your check-in.", actionLabel: "Check in", icon: <LogIn size={15} />, onConfirm: () => { haptic(12); doCheckIn(); } });
  const checkOut = () => openModal({ type: "okConfirm", title: "Check out?", body: "Type OK to confirm your check-out.", actionLabel: "Check out", icon: <CheckCircle2 size={15} />, onConfirm: () => { haptic(12); doCheckOut(); } });

  return (
    <div className="content">
      <div className="page-head"><h3>{greet}, {me.name}</h3></div>

      <div className="card stat" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div className="avatar" style={{ background: avatarColor(me.name), width: 44, height: 44, fontSize: 18 }}>{me.name[0]}</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="lbl"><Clock size={14} /> Today · {fmtDate(today)}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
            {leaveToday ? "On approved leave" : openSess ? `Checked in at ${clockTime(openSess.checkIn)}` : todays.length ? `${todays.length} session${todays.length > 1 ? "s" : ""} today · ${todayH.toFixed(1)}h` : "Not checked in yet"}
          </div>
        </div>
        {!leaveToday && !openSess && <button className="btn primary" onClick={checkIn}><LogIn size={16} />Check in</button>}
        {!leaveToday && openSess && <button className="btn primary" onClick={checkOut}><CheckCircle2 size={16} />Check out</button>}
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

function Attendance({ db, mutate, me, isAdmin, team, openModal }) {
  const today = todayISO();
  const [date, setDate] = useState(today);

  if (!isAdmin) {
    const mineAll = db.attendance.filter((a) => a.userId === me.id);
    const todays = mineAll.filter((a) => a.date === today);
    const openSess = todays.find((a) => !a.checkOut);
    const leaveToday = onApprovedLeave(db, me.id, today);
    const mine = [...mineAll].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
    const weekStart = startOfWeek();
    const todayH = sumHours(todays);
    const weekH = sumHours(mineAll.filter((a) => new Date(a.date + "T00:00:00") >= weekStart));
    const monthH = sumHours(mineAll.filter((a) => sameMonth(a.date)));
    const doCheckIn = () => mutate((d) => ({ ...d, attendance: [...d.attendance, { id: uid(), userId: me.id, userName: me.name, date: today, checkIn: new Date().toISOString(), checkOut: null, createdAt: Date.now() }] }), null);
    const doCheckOut = () => { if (!openSess) return; mutate((d) => ({ ...d, attendance: d.attendance.map((a) => a.id === openSess.id ? { ...a, checkOut: new Date().toISOString() } : a) }), null); };
    const checkIn = () => openModal({ type: "okConfirm", title: "Check in?", body: "Type OK to confirm your check-in.", actionLabel: "Check in", icon: <LogIn size={15} />, onConfirm: () => { haptic(12); doCheckIn(); } });
    const checkOut = () => openModal({ type: "okConfirm", title: "Check out?", body: "Type OK to confirm your check-out.", actionLabel: "Check out", icon: <CheckCircle2 size={15} />, onConfirm: () => { haptic(12); doCheckOut(); } });
    return (
      <div className="content">
        <div className="page-head"><h3>Attendance</h3></div>
        <div className="card stat" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="lbl"><Clock size={14} /> {fmtDate(today)}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
              {leaveToday ? "You're on approved leave today" : openSess ? `Checked in at ${clockTime(openSess.checkIn)}` : todays.length ? `${todays.length} session${todays.length > 1 ? "s" : ""} · ${todayH.toFixed(1)}h today` : "Not checked in yet"}
            </div>
          </div>
          {!leaveToday && !openSess && <button className="btn primary" onClick={checkIn}><LogIn size={16} />Check in</button>}
          {!leaveToday && openSess && <button className="btn primary" onClick={checkOut}><CheckCircle2 size={16} />Check out</button>}
        </div>

        <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", marginBottom: 16 }}>
          <div className="card stat"><div className="lbl"><Clock size={14} /> Today</div><div className="num">{todayH.toFixed(1)}h</div></div>
          <div className="card stat"><div className="lbl"><CalendarDays size={14} /> This week</div><div className="num">{weekH.toFixed(1)}h</div></div>
          <div className="card stat"><div className="lbl"><CalendarDays size={14} /> This month</div><div className="num">{monthH.toFixed(1)}h</div></div>
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
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
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
  const valid = f.fromDate && f.toDate && f.toDate >= f.fromDate && f.reason.trim().length > 0 && (f.type !== "Other" || (f.customType || "").trim().length > 0);
  const save = () => {
    if (!valid) return;
    onSave({ ...initial, id: initial?.id || uid(), userId: me.id, userName: me.name, type: f.type === "Other" ? ((f.customType || "").trim() || "Other") : f.type, fromDate: f.fromDate, toDate: f.toDate, days, reason: f.reason.trim(), status: initial?.status || "Pending", createdAt: initial?.createdAt || Date.now() });
    onClose();
  };
  return (
    <Modal title={initial?.id ? "Edit leave request" : "Request leave"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!valid}><Check size={16} />Submit request</button></>}>
      <Field label="Leave type"><select className="select" value={f.type} onChange={(e) => up("type", e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      {f.type === "Other" && <Field label="Specify type" required><input className="input" value={f.customType || ""} onChange={(e) => up("customType", e.target.value)} placeholder="e.g. Bereavement" /></Field>}
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

  const decide = (l, status) => { haptic(/^app/i.test(status) ? 12 : [10, 30, 10]); mutate((d) => ({ ...d, leave: d.leave.map((x) => x.id === l.id ? { ...x, status, decidedBy: me.name, decidedAt: Date.now() } : x) }), { action: `${status.toLowerCase()} ${l.userName}'s ${l.type.toLowerCase()} leave`, module: "Leave" }); };
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

function Updates({ db, mutate, me, isAdmin, removeItem, openModal }) {
  const [text, setText] = useState("");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const today = todayISO();
  const all = [...db.updates].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = isAdmin ? all : all.filter((u) => u.userId === me.id);
  const post = () => {
    const content = text.trim(); if (!content) return;
    mutate((d) => ({ ...d, updates: [...d.updates, { id: uid(), userId: me.id, userName: me.name, date: today, content, createdAt: Date.now() }] }), null);
    setText("");
  };
  const startEdit = (u) => { setEditId(u.id); setEditText(u.content); };
  const saveEdit = (u) => { const c = editText.trim(); if (!c) { setEditId(null); return; } mutate((d) => ({ ...d, updates: d.updates.map((x) => x.id === u.id ? { ...x, content: c, editedAt: Date.now() } : x) }), null); setEditId(null); setEditText(""); };
  const acknowledge = (u) => { haptic(10); mutate((d) => ({ ...d, updates: d.updates.map((x) => x.id === u.id ? { ...x, ackBy: me.name, ackAt: Date.now() } : x) }), { action: `acknowledged ${u.userName}'s daily update`, module: "Daily updates" }); };
  const askDelete = (u) => openModal({ type: "deleteConfirm", title: "Delete update?", body: "This moves the update to Recently deleted.", note: "You can restore it within 60 days.", onConfirm: () => removeItem("updates", u, { name: `${u.userName}'s update`, audit: "deleted a daily update" }) });

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
              {editId === u.id ? (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea className="textarea" style={{ minHeight: 64 }} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button className="btn sm" onClick={() => { setEditId(null); setEditText(""); }}>Cancel</button><button className="btn sm primary" onClick={() => saveEdit(u)}><Check size={13} />Save</button></div>
                </div>
              ) : <div style={{ marginTop: 4, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{u.content}</div>}
              <div className="item-meta" style={{ marginTop: 6 }}><span>{fmtDate(u.date)}</span><span>{fmtTime(u.createdAt)}</span>{u.editedAt && <span>edited</span>}{u.ackAt && <span style={{ color: "var(--pos)", display: "inline-flex", alignItems: "center", gap: 4 }}><BadgeCheck size={12} />Acknowledged by {u.ackBy || "admin"}</span>}</div>
            </div>
            {editId !== u.id && (
              <div className="row-actions">
                {!isAdmin && u.userId === me.id && withinMinutes(u.createdAt, 30) && <button className="iconbtn" style={{ width: 32, height: 32 }} title="Edit (within 30 min)" onClick={() => startEdit(u)}><Pencil size={14} /></button>}
                {isAdmin && !u.ackAt && <button className="btn sm" onClick={() => acknowledge(u)}><Check size={13} />Acknowledge</button>}
                {(isAdmin || u.userId === me.id) && <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => askDelete(u)}><Trash2 size={14} /></button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PermsModal({ person, onSave, onClose }) {
  const init = Array.isArray(person.perms?.modules) ? person.perms.modules : [];
  const [mods, setMods] = useState(init);
  const toggle = (k) => setMods((m) => m.includes(k) ? m.filter((x) => x !== k) : [...m, k]);
  return (
    <Modal title={`Module access — ${person.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onSave(mods); onClose(); }}><Check size={15} />Save access</button></>}>
      <p className="hint-line" style={{ lineHeight: 1.55 }}>Tick the business modules {person.name} can open. Their personal screens — tasks, attendance, leave and daily updates — are always available.</p>
      <div className="perm-list">
        {GRANTABLE_MODULES.map(([k, label]) => (
          <label key={k} className="perm-item">
            <input type="checkbox" checked={mods.includes(k)} onChange={() => toggle(k)} />{label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function Team({ team, me, changeProfile }) {
  const [permFor, setPermFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [manageFor, setManageFor] = useState(null);
  const count = (r) => team.filter((p) => p.role === r).length;
  const setStatus = (p, status) => changeProfile(p.id, { status, active: STATUS_ACTIVE[status] });
  const moduleSummary = (p) => {
    if (p.role === "superadmin" || p.role === "admin") return "All modules";
    if (p.role === "accountant") return "Share & accounts, Withdrawals";
    if (p.role === "intern") return "Tasks, attendance, updates";
    const mods = Array.isArray(p.perms?.modules) ? p.perms.modules : [];
    return mods.length ? mods.map((k) => (GRANTABLE_MODULES.find((g) => g[0] === k) || [k, k])[1]).join(", ") : "Personal screens only";
  };
  const isSuper = me.role === "superadmin";
  const pending = team.filter((p) => (p.role === "staff" || p.role === "client") && p.approved === false);
  const roster = team.filter((p) => p.role !== "client");          // clients live in the portal, not the internal roster
  const approve = (p) => { haptic(10); changeProfile(p.id, { approved: true }); };
  const reject = (p) => changeProfile(p.id, { approved: false, status: "terminated", active: false });
  return (
    <div className="content">
      <div className="page-head"><h3>Team</h3><span className="spacer" />{isSuper && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />Add user</button>}</div>
      {isSuper && pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Hourglass size={15} /> {pending.length} account{pending.length > 1 ? "s" : ""} awaiting your approval</div>
          {pending.map((p) => (
            <div key={p.id} className="item-row">
              <div className="avatar" style={{ background: avatarColor(p.name), width: 30, height: 30, fontSize: 12 }}>{(p.name || "?")[0]}</div>
              <div className="item-main">
                <div className="item-title" style={{ fontSize: 14 }}>{p.name} <span className="badge accent" style={{ marginLeft: 4 }}>{p.role === "client" ? "Client" : "Staff"}</span></div>
                <div className="item-meta"><span>{p.email}</span>{p.created_at && <span>Signed up {fmtDate(p.created_at.slice(0, 10))}</span>}</div>
              </div>
              <div className="row-actions">
                <button className="btn sm primary" onClick={() => approve(p)}><Check size={13} />Approve</button>
                <button className="btn sm danger" onClick={() => reject(p)}><X size={13} />Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", marginBottom: 16 }}>
        <div className="card stat"><div className="lbl"><ShieldCheck size={14} /> Partners</div><div className="num">{count("superadmin")}</div></div>
        <div className="card stat"><div className="lbl"><ShieldCheck size={14} /> Admins</div><div className="num">{count("admin")}</div></div>
        <div className="card stat"><div className="lbl"><Wallet size={14} /> Accountants</div><div className="num">{count("accountant")}</div></div>
        <div className="card stat"><div className="lbl"><Users size={14} /> Staff</div><div className="num">{count("staff")}</div></div>
        <div className="card stat"><div className="lbl"><Users size={14} /> Interns</div><div className="num">{count("intern")}</div></div>
      </div>
      <div className="card">
        {team.length === 0 ? <Empty icon={<Users size={22} color="var(--muted)" />} title="No one here yet" text="Share the app link so your team can create accounts." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Module access</th><th>Joined</th></tr></thead>
              <tbody>{roster.map((p) => {
                const isSelf = p.id === me.id;
                const isSuper = p.role === "superadmin";
                return (
                  <tr key={p.id} style={p.active === false ? { opacity: .55 } : undefined}>
                    <td>
                      <span className="who-cell">
                        <span style={{ position: "relative", display: "inline-flex" }}><span className="avatar" style={{ background: avatarColor(p.name), width: 26, height: 26, fontSize: 11 }}>{p.name[0]}</span>{isOnline(p) && <span title="Online" style={{ position: "absolute", right: -1, bottom: -1, width: 9, height: 9, borderRadius: "50%", background: "var(--pos)", border: "2px solid var(--surface, #fff)" }} />}</span>
                        <span><div style={{ fontWeight: 600 }}>{p.name}{isSelf ? " (you)" : ""}</div><div className="hint-line" style={{ fontSize: 11 }}>{p.designation ? p.designation + " · " : ""}{p.email}</div></span>
                      </span>
                    </td>
                    <td>
                      {isSuper
                        ? <span className="role-badge superadmin">Super admin</span>
                        : <select className="select" style={{ width: "auto", padding: "5px 8px" }} value={p.role} disabled={isSelf}
                            onChange={(e) => changeProfile(p.id, { role: e.target.value })}>
                            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>}
                    </td>
                    <td>
                      {isSuper
                        ? <span className="status-pill status-active">Active</span>
                        : <select className={"select"} style={{ width: "auto", padding: "5px 8px" }} value={p.status || "active"} disabled={isSelf}
                            onChange={(e) => setStatus(p, e.target.value)}>
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="hint-line" style={{ fontSize: 12 }}>{moduleSummary(p)}</span>
                        {p.role === "staff" && <button className="btn sm" onClick={() => setPermFor(p)}><Pencil size={12} />Edit</button>}
                        {me.role === "superadmin" && !isSelf && <button className="btn sm" onClick={() => setManageFor(p)}><KeyRound size={12} />Manage</button>}
                      </div>
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 13 }}>{p.created_at ? fmtDate(p.created_at.slice(0, 10)) : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <div className="hint-line" style={{ padding: "12px 16px", lineHeight: 1.5 }}>
          Partners (Haji &amp; Alim) and accountants are the only people who see Share &amp; accounts and Withdrawals. Admins run the team, projects and approvals but not the money. Set a status of Suspended, Resigned or Terminated to revoke someone's access immediately; On leave keeps it.
        </div>
      </div>
      {permFor && <PermsModal person={permFor} onClose={() => setPermFor(null)} onSave={(modules) => changeProfile(permFor.id, { perms: { ...(permFor.perms || {}), modules } })} />}
      {creating && <CreateUserModal onClose={() => setCreating(false)} />}
      {manageFor && <ManageUserModal person={manageFor} onClose={() => setManageFor(null)} />}
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

function ApprovalPending({ isDark, name, onSignOut }) {
  return (
    <div className="allbee lock" data-theme={isDark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="lock-card">
        <div className="lock-badge" style={{ background: "var(--surface-2)" }}><ShieldCheck size={28} color="var(--muted)" /></div>
        <h1>Awaiting approval</h1>
        <p>Thanks {name} — your account has been created. A partner needs to approve it before you can get in. You'll have access as soon as they do.</p>
        <button className="btn" style={{ marginTop: 8 }} onClick={onSignOut}><LogOut size={15} />Sign out</button>
      </div>
    </div>
  );
}

// First sign-in: collect the details every profile needs before the app opens.
function ProfileSetup({ profile, onSave, onSignOut, isDark }) {
  const [name, setName] = useState(profile?.name || "");
  const [mobile, setMobile] = useState(profile?.mobile || "");
  const [dob, setDob] = useState(profile?.dob || "");
  const [photo, setPhoto] = useState(profile?.photo_url || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (!name.trim()) { setErr("Tell us your full name."); return; }
    if (mobile.replace(/\D/g, "").length < 7) { setErr("Enter a valid mobile number."); return; }
    if (!dob) { setErr("Add your date of birth."); return; }
    setBusy(true);
    try { await onSave({ name: name.trim(), mobile: mobile.trim(), dob, photo_url: photo.trim() || null }); }
    catch (e) { setErr(e.message || "Couldn't save that. Try again."); setBusy(false); }
  };
  return (
    <div className="allbee lock" data-theme={isDark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="lock-card gate-card">
        <img className="lock-logo" src={LOGO_ICON} alt="ALLBEE" style={{ height: 52 }} />
        <h1>Complete your profile</h1>
        <p>A few details before you start — your team uses these to reach you.</p>
        <div className="gate-body">
          <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" /></Field>
          <Field label="Mobile number" required hint="Used for work contact and birthday wishes."><input className="input" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 …" /></Field>
          <Field label="Date of birth" required><input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={todayISO()} /></Field>
          <Field label="Profile photo URL" hint="Optional — add or change this any time."><input className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" /></Field>
        </div>
        {err && <div className="auth-msg err"><AlertTriangle size={14} /> {err}</div>}
        <div className="gate-foot">
          <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={save} disabled={busy}>{busy ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}Save and continue</button>
        </div>
        <button className="linkbtn" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

// Terms gate: shown to accountants/staff/interns until they accept the current
// published version. Editing the terms bumps the version and re-prompts everyone.
function TermsGate({ body, version, onAccept, onSignOut, isDark }) {
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = checked && typed.trim().toUpperCase() === "AGREE";
  const accept = async () => {
    if (!ready) return;
    setBusy(true); setErr("");
    try { await onAccept(version); }
    catch (e) { setErr(e.message || "Couldn't record that. Try again."); setBusy(false); }
  };
  return (
    <div className="allbee lock" data-theme={isDark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="lock-card gate-card">
        <img className="lock-logo" src={LOGO_ICON} alt="ALLBEE" style={{ height: 52 }} />
        <h1>Terms &amp; conditions</h1>
        <p>Please read and accept to continue.</p>
        <div className="tnc-scroll">{body && body.trim() ? body : "Your administrator hasn't added the agreement text yet."}</div>
        <label className="checkrow">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I have read and understood the terms above.
        </label>
        <div style={{ marginTop: 12 }}>
          <Field label="Type AGREE to confirm"><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="AGREE" autoCapitalize="characters" /></Field>
        </div>
        {err && <div className="auth-msg err"><AlertTriangle size={14} /> {err}</div>}
        <div className="gate-foot">
          <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={accept} disabled={!ready || busy}>{busy ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}Accept &amp; continue</button>
        </div>
        <button className="linkbtn" onClick={onSignOut}>Sign out</button>
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
  ["dashboard", "Dashboard", LayoutDashboard, "everyone"],
  ["tasks", "Tasks", ListTodo, "work"],
  ["attendance", "Attendance", UserCheck, "work"],
  ["leave", "Leave", Plane, "leave"],
  ["updates", "Daily updates", MessageSquare, "work"],
  ["chat", "Team chat", Send, "collab"],
  ["leads", "Leads", UserPlus, "perm:leads"],
  ["clients", "Clients", Building2, "perm:clients"],
  ["quotations", "Quotations", FileText, "perm:clients"],
  ["invoices", "Invoices", Banknote, "perm:clients"],
  ["portal-posts", "Client updates", ExternalLink, "perm:clients"],
  ["projects", "Projects", FolderKanban, "perm:projects"],
  ["courses", "Courses", GraduationCap, "perm:courses"],
  ["marketing", "Marketing", Megaphone, "perm:marketing"],
  ["concepts", "Concepts", Lightbulb, "perm:concepts"],
  ["accounts", "Share & accounts", Wallet, "finance"],
  ["withdrawals", "Withdrawals", ArrowDownToLine, "finance"],
  ["planned", "Planned expenses", CalendarClock, "finance"],
  ["vault", "Passwords", KeyRound, "vault"],
  ["notifications", "Notifications", Bell, "everyone"],
  ["announcements", "Announcements", MegaphoneIcon, "collab"],
  ["documents", "Documents", Paperclip, "collab"],
  ["knowledge", "Knowledge base", BookOpen, "collab"],
  ["performance", "Performance", TrendingUp, "insight"],
  ["rewards", "Rewards", Award, "collab"],
  ["team", "Team", Users, "admin"],
  ["progress", "Progress", Activity, "admin"],
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
      if ((acctType === "staff" || acctType === "client") && !name.trim()) { setErr("Enter your name so we know who you are."); return; }
      if (acctType === "owner" && !code.trim()) { setErr("Enter the admin access code, or sign up as a team member instead."); return; }
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      } else {
        const meta = acctType === "owner" ? { name: who, admin_code: code.trim() }
          : acctType === "client" ? { name: name.trim(), role_intent: "client" }
          : { name: name.trim() };
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
              <button type="button" className={acctType === "client" ? "on" : ""} onClick={() => setAcctType("client")}>Client</button>
              <button type="button" className={acctType === "owner" ? "on" : ""} onClick={() => setAcctType("owner")}>Owner / admin</button>
            </div>

            {acctType === "staff" || acctType === "client" ? (
              <div className="field" style={{ textAlign: "left" }}>
                <label>Your name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder={acctType === "client" ? "Your name or business" : "e.g. Priya"} />
                {acctType === "client" && <p className="hint-line" style={{ fontSize: 12, marginTop: 6 }}>Client accounts see only their own project updates and quotations.</p>}
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

/* ══════════════════════════════════════════════════════════════════════
   PHASE 2–6 — FORMS
══════════════════════════════════════════════════════════════════════ */
function LeadForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { name: "", company: "", phone: "", email: "", source: "Referral", referredBy: "", leadOwner: "", service: "Website", stage: "New", value: "", notes: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.name.trim()) { setErr("Add the lead's name."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), name: f.name.trim(), value: Number(f.value) || 0 });
  };
  return (
    <Modal title={f.id ? "Edit lead" : "New lead"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save lead</button></>}>
      <Field label="Name" required error={err}><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Person or business" /></Field>
      <div className="grid2">
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 …" /></Field>
        <Field label="Email"><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@email" /></Field>
      </div>
      <div className="grid2">
        <Field label="Source"><select className="select" value={f.source} onChange={(e) => set("source", e.target.value)}>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Stage"><select className="select" value={f.stage} onChange={(e) => set("stage", e.target.value)}>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <div className="grid2">
        <Field label="Company"><input className="input" value={f.company || ""} onChange={(e) => set("company", e.target.value)} placeholder="Business name" /></Field>
        <Field label="Service interested"><select className="select" value={f.service || "Website"} onChange={(e) => set("service", e.target.value)}>{LEAD_SERVICES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <div className="grid2">
        <Field label="Referred by"><input className="input" value={f.referredBy || ""} onChange={(e) => set("referredBy", e.target.value)} placeholder="Who referred them?" /></Field>
        <Field label="Lead owner"><input className="input" value={f.leadOwner || ""} onChange={(e) => set("leadOwner", e.target.value)} placeholder="Who owns this lead?" /></Field>
      </div>
      <Field label="Estimated value (₹)"><input className="input" type="number" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="0" /></Field>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What do they need?" /></Field>
    </Modal>
  );
}

function ClientForm({ initial, onSave, onClose, existing }) {
  const [f, setF] = useState(initial || { name: "", phone: "", email: "", company: "", status: "Prospect", notes: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  // duplicate detection on phone / email (ignore the record being edited)
  const dupe = (existing || []).find((c) => c.id !== f.id && ((f.phone && c.phone && c.phone.replace(/\D/g, "") === f.phone.replace(/\D/g, "")) || (f.email && c.email && c.email.toLowerCase() === f.email.toLowerCase())));
  const save = () => {
    if (!f.name.trim()) { setErr("Add the client's name."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), name: f.name.trim() });
  };
  return (
    <Modal title={f.id ? "Edit client" : "New client"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save client</button></>}>
      <Field label="Name" required error={err}><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Client name" /></Field>
      {dupe && <div className="auth-msg err" style={{ marginTop: -4 }}><AlertTriangle size={14} /> Looks like a duplicate of <b style={{ margin: "0 4px" }}>{dupe.name}</b> — same {dupe.email && f.email && dupe.email.toLowerCase() === f.email.toLowerCase() ? "email" : "phone"}.</div>}
      <div className="grid2">
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 …" /></Field>
        <Field label="Email"><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@email" /></Field>
      </div>
      <div className="grid2">
        <Field label="Company"><input className="input" value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Business name (optional)" /></Field>
        <Field label="Status"><select className="select" value={f.status || "Prospect"} onChange={(e) => set("status", e.target.value)}>{CLIENT_STATUS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering" /></Field>
    </Modal>
  );
}

function QuotationForm({ initial, onSave, onClose, clients, portalClients }) {
  const [f, setF] = useState(initial || { client: "", clientId: "", title: "", status: "Draft", notes: "", items: [{ desc: "", qty: 1, rate: 0 }] });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setItem = (i, k, v) => setF((s) => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setF((s) => ({ ...s, items: [...s.items, { desc: "", qty: 1, rate: 0 }] }));
  const delItem = (i) => setF((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }));
  const total = (f.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.client.trim()) { setErr("Add a client name."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), client: f.client.trim(), total: round2(total) });
  };
  return (
    <Modal title={f.id ? "Edit quotation" : "New quotation"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save quotation</button></>}>
      <div className="grid2">
        <Field label="Client" required error={err}>
          <input className="input" list="quote-clients" value={f.client} onChange={(e) => set("client", e.target.value)} placeholder="Client name" />
          <datalist id="quote-clients">{(clients || []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set("status", e.target.value)}>{QUOTE_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Website + branding" /></Field>
      {portalClients && portalClients.length > 0 && (
        <Field label="Share to portal client" hint="Optional — lets that client see this quote when they sign in.">
          <select className="select" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">Don't share</option>
            {portalClients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
          </select>
        </Field>
      )}
      <div className="field">
        <label>Line items</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(f.items || []).map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 64px 90px 32px", gap: 6, alignItems: "center" }}>
              <input className="input" value={it.desc} onChange={(e) => setItem(i, "desc", e.target.value)} placeholder="Description" />
              <input className="input" type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} placeholder="Qty" />
              <input className="input" type="number" value={it.rate} onChange={(e) => setItem(i, "rate", e.target.value)} placeholder="Rate" />
              <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => delItem(i)} disabled={f.items.length === 1}><X size={14} /></button>
            </div>
          ))}
        </div>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={addItem}><Plus size={13} />Add line</button>
      </div>
      <div className="calc-box"><div className="calc-row"><span>Total</span><b className="mono">{money(total)}</b></div></div>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Terms, validity, etc." /></Field>
    </Modal>
  );
}

function PlannedForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { title: "", category: "Office Rent", amount: "", recurrence: "Monthly", status: "Planned", nextDue: todayISO(), notes: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.title.trim()) { setErr("Name this expense."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), title: f.title.trim(), amount: Number(f.amount) || 0 });
  };
  return (
    <Modal title={f.id ? "Edit planned expense" : "New planned expense"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save</button></>}>
      <Field label="What is it?" required error={err}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Office rent" /></Field>
      <div className="grid2">
        <Field label="Category"><select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount (₹)"><input className="input" type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /></Field>
      </div>
      <div className="grid2">
        <Field label="Repeats"><select className="select" value={f.recurrence} onChange={(e) => set("recurrence", e.target.value)}>{EXPENSE_RECURRENCE.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Next due"><input className="input" type="date" value={f.nextDue} onChange={(e) => set("nextDue", e.target.value)} /></Field>
      </div>
      <Field label="Status"><select className="select" value={f.status || "Planned"} onChange={(e) => set("status", e.target.value)}>{PLANNED_STATUS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></Field>
    </Modal>
  );
}

function VaultForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { service: "", category: "Social", username: "", password: "", url: "", notes: "" });
  const [show, setShow] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.service.trim()) { setErr("Name the service."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), service: f.service.trim() });
  };
  return (
    <Modal title={f.id ? "Edit credential" : "New credential"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save</button></>}>
      <div className="grid2">
        <Field label="Service" required error={err}><input className="input" value={f.service} onChange={(e) => set("service", e.target.value)} placeholder="e.g. Instagram" /></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>{VAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Username / email"><input className="input" value={f.username} onChange={(e) => set("username", e.target.value)} placeholder="login@…" /></Field>
      <Field label="Password">
        <div style={{ display: "flex", gap: 6 }}>
          <input className="input" type={show ? "text" : "password"} value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
          <button className="iconbtn" onClick={() => setShow((v) => !v)} type="button" aria-label="Show/hide">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </Field>
      <Field label="Login URL"><input className="input" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></Field>
      <Field label="Notes" hint="Recovery email, 2FA backup codes, etc."><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function DocForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { title: "", category: "Contract", url: "", notes: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setErr("");
    try { const up = await uploadAttachment(file); setF((s) => ({ ...s, url: up.url, title: s.title || up.name })); }
    catch (er) { setErr(er.message || "Upload failed."); }
    finally { setBusy(false); if (e.target) e.target.value = ""; }
  };
  const save = () => {
    if (!f.title.trim()) { setErr("Add a title."); return; }
    if (!f.url.trim()) { setErr("Add a link to the file."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), title: f.title.trim(), url: f.url.trim() });
  };
  return (
    <Modal title={f.id ? "Edit document" : "Add document"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save</button></>}>
      <div className="grid2">
        <Field label="Title" required error={err}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. NDA template" /></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="File or link" required hint="Upload (image ≤10MB, PDF ≤50MB, other ≤25MB) or paste a link.">
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://… or upload →" />
          <button className="btn" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Upload size={15} />}Upload</button>
          <input ref={fileRef} type="file" onChange={pick} style={{ display: "none" }} />
        </div>
      </Field>
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function KbForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { title: "", category: "How-to", body: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.title.trim()) { setErr("Add a title."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), title: f.title.trim() });
  };
  return (
    <Modal title={f.id ? "Edit article" : "New article"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save</button></>}>
      <div className="grid2">
        <Field label="Title" required error={err}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. How to onboard a client" /></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>{KB_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Content"><textarea className="textarea" style={{ minHeight: 180 }} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="Write the guide…" /></Field>
    </Modal>
  );
}

function RewardForm({ initial, onSave, onClose, team }) {
  const staff = (team || []).filter((p) => ["staff", "intern", "admin", "accountant"].includes(p.role));
  const [f, setF] = useState(initial || { userId: staff[0]?.id || "", kind: "Star performer", points: 10, note: "", date: todayISO() });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.userId) { setErr("Pick a team member."); return; }
    const person = staff.find((p) => p.id === f.userId);
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), userName: person?.name || "", points: Number(f.points) || 0 });
  };
  return (
    <Modal title={f.id ? "Edit recognition" : "Give recognition"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Award size={15} />Award</button></>}>
      <Field label="To" required error={err}>
        <select className="select" value={f.userId} onChange={(e) => set("userId", e.target.value)}>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <div className="grid2">
        <Field label="For"><select className="select" value={f.kind} onChange={(e) => set("kind", e.target.value)}>{REWARD_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Points"><input className="input" type="number" value={f.points} onChange={(e) => set("points", e.target.value)} /></Field>
      </div>
      <Field label="Note"><textarea className="textarea" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="What did they do well?" /></Field>
    </Modal>
  );
}

function PortalPostForm({ initial, onSave, onClose, portalClients }) {
  const [f, setF] = useState(initial || { clientId: portalClients?.[0]?.id || "", title: "", body: "", status: "In progress" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.clientId) { setErr("Pick a client."); return; }
    if (!f.title.trim()) { setErr("Add a heading."); return; }
    const person = (portalClients || []).find((p) => p.id === f.clientId);
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), clientName: person?.name || "", title: f.title.trim(), meetingLink: (f.meetingLink || "").trim() });
  };
  return (
    <Modal title={f.id ? "Edit update" : "Post a client update"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Send size={15} />Post</button></>}>
      {(!portalClients || portalClients.length === 0)
        ? <p className="hint-line">No client portal accounts yet. A client creates one from the login screen (choose <b>Client</b>), then they'll appear here.</p>
        : <>
          <Field label="Client" required error={err}>
            <select className="select" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>{portalClients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}</select>
          </Field>
          <div className="grid2">
            <Field label="Heading"><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Homepage design ready" /></Field>
            <Field label="Status"><select className="select" value={f.status} onChange={(e) => set("status", e.target.value)}>{["Not started", "In progress", "Review", "Completed", "On hold"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <Field label="Message"><textarea className="textarea" value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="What's the latest for this client?" /></Field>
          <Field label="Meeting link (optional)" hint="Paste a Google Meet / Zoom / Teams link — the client gets a Join button in their portal."><input className="input" value={f.meetingLink || ""} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://meet.google.com/…" /></Field>
        </>}
    </Modal>
  );
}

function AnnouncementForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { title: "", body: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.title.trim()) { setErr("Add a headline."); return; }
    onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), title: f.title.trim(), meetingLink: (f.meetingLink || "").trim() });
  };
  return (
    <Modal title={f.id ? "Edit announcement" : "New announcement"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><MegaphoneIcon size={15} />Post</button></>}>
      <Field label="Headline" required error={err}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Office closed on Friday" /></Field>
      <Field label="Details"><textarea className="textarea" style={{ minHeight: 120 }} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="The full message…" /></Field>
      <Field label="Meeting link (optional)" hint="Paste a Google Meet / Zoom / Teams link — everyone gets a Join button."><input className="input" value={f.meetingLink || ""} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://meet.google.com/…" /></Field>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PHASE 2–6 — SCREENS
══════════════════════════════════════════════════════════════════════ */
function LoadMore({ shown, total, onMore }) {
  if (shown >= total) return null;
  return <div style={{ textAlign: "center", padding: "14px 0" }}><button className="btn" onClick={onMore}>Show more ({total - shown} more)</button></div>;
}

function Leads({ db, mutate, openModal, removeItem, isAdmin }) {
  const [stage, setStage] = useState("All");
  const [n, setN] = useState(25);
  const all = [...db.leads].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = stage === "All" ? all : all.filter((l) => l.stage === stage);
  const setLeadStage = (l, s) => mutate((d) => ({ ...d, leads: d.leads.map((x) => x.id === l.id ? { ...x, stage: s } : x) }), { action: `moved lead "${l.name}" to ${s}`, module: "Leads" });
  const convert = (l) => openModal({ type: "client", initial: { name: l.name, phone: l.phone, email: l.email, notes: l.notes }, fromLead: l.id });
  const del = (l) => removeItem("leads", l, { name: l.name, audit: `deleted lead "${l.name}"` });
  const tone = (s) => s === "Converted" ? "pos" : s === "Lost" ? "neg" : s === "Proposal Sent" ? "accent" : "pri";
  return (
    <div className="content">
      <div className="page-head"><h3>Leads</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "lead" })}><Plus size={16} />New lead</button></div>
      <div className="toolbar"><div className="seg">{["All", ...LEAD_STAGES].map((s) => <button key={s} className={stage === s ? "on" : ""} onClick={() => { setStage(s); setN(25); }}>{s}</button>)}</div></div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<UserPlus size={22} color="var(--muted)" />} title="No leads here" text="Capture every enquiry and move it from New all the way to Won." action={<button className="btn primary" onClick={() => openModal({ type: "lead" })}><Plus size={16} />New lead</button>} />
          : list.slice(0, n).map((l) => (
            <div key={l.id} className="item-row">
              <div className="item-main">
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span className="item-title">{l.name}</span>
                  <span className={"badge " + tone(l.stage)}>{l.stage}</span>
                  {l.value > 0 && <span className="badge">{money(l.value)}</span>}
                </div>
                <div className="item-meta">{l.source && <span><Tag size={12} style={{ verticalAlign: -2 }} /> {l.source}</span>}{l.phone && <span><Phone size={12} style={{ verticalAlign: -2 }} /> {l.phone}</span>}{l.email && <span>{l.email}</span>}</div>
              </div>
              <div className="row-actions" style={{ alignItems: "center" }}>
                <select className="select" style={{ width: "auto", padding: "5px 8px" }} value={l.stage} onChange={(e) => setLeadStage(l, e.target.value)}>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
                {l.stage === "Converted" && <button className="btn sm primary" onClick={() => convert(l)}><ArrowRight size={13} />Client</button>}
                <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "lead", initial: l })}><Pencil size={14} /></button>
                <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete lead?", body: `Delete "${l.name}"?`, note: "It moves to Recently deleted — restore within 60 days.", onConfirm: () => del(l) })}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        <LoadMore shown={Math.min(n, list.length)} total={list.length} onMore={() => setN((x) => x + 25)} />
      </div>
    </div>
  );
}

function Clients({ db, mutate, openModal, removeItem, isAdmin = true, me }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState(25);
  const all = [...db.clients].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const scoped = isAdmin ? all : all.filter((c) => c.ownerId === (me && me.id));
  const list = q.trim() ? scoped.filter((c) => (c.name + " " + (c.company || "") + " " + (c.phone || "") + " " + (c.email || "")).toLowerCase().includes(q.toLowerCase())) : scoped;
  const del = (c) => removeItem("clients", c, { name: c.name, audit: `removed client "${c.name}"` });
  const quote = (c) => openModal({ type: "quotation", initial: { client: c.name } });
  return (
    <div className="content">
      <div className="page-head"><h3>Clients</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "client" })}><Plus size={16} />New client</button></div>
      <div className="toolbar"><div className="search"><Search size={16} color="var(--muted)" /><input value={q} onChange={(e) => { setQ(e.target.value); setN(25); }} placeholder="Search clients…" /></div></div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<Building2 size={22} color="var(--muted)" />} title={q ? "No matches" : "No clients yet"} text="Win a lead or add a client directly, then send them quotations." action={!q && <button className="btn primary" onClick={() => openModal({ type: "client" })}><Plus size={16} />New client</button>} />
          : <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>Client</th><th>Contact</th><th>Added</th><th></th></tr></thead>
            <tbody>{list.slice(0, n).map((c) => (
              <tr key={c.id}>
                <td><div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>{c.name}{c.status && <span className={"badge " + (c.status === "Blacklisted" ? "neg" : c.status === "Active" ? "pos" : c.status === "Inactive" ? "" : "pri")} style={{ fontSize: 10 }}>{c.status}</span>}</div>{c.company && <div className="hint-line" style={{ fontSize: 11 }}>{c.company}</div>}</td>
                <td>{c.phone && <div style={{ fontSize: 13 }}>{c.phone}</div>}{c.email && <div className="hint-line" style={{ fontSize: 11 }}>{c.email}</div>}{!c.phone && !c.email && "—"}</td>
                <td className="mono" style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 13 }}>{c.createdAt ? fmtDate(new Date(c.createdAt).toISOString().slice(0, 10)) : "—"}</td>
                <td><div className="row-actions">
                  <button className="btn sm" onClick={() => quote(c)}><FileText size={13} />Quote</button>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "client", initial: c })}><Pencil size={14} /></button>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Remove client?", body: `Remove ${c.name}?`, note: "Moves to Recently deleted — restore within 60 days.", onConfirm: () => del(c) })}><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>}
        <LoadMore shown={Math.min(n, list.length)} total={list.length} onMore={() => setN((x) => x + 25)} />
      </div>
    </div>
  );
}

function Quotations({ db, mutate, openModal, removeItem }) {
  const [status, setStatus] = useState("All");
  const all = [...db.quotations].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = status === "All" ? all : all.filter((qt) => qt.status === status);
  const setQuoteStatus = (qt, s) => mutate((d) => ({ ...d, quotations: d.quotations.map((x) => x.id === qt.id ? { ...x, status: s } : x) }), { action: `marked quote for ${qt.client} ${s}`, module: "Quotations" });
  const del = (qt) => removeItem("quotations", qt, { name: qt.client, audit: `deleted quotation for ${qt.client}` });
  const tone = (s) => s === "Accepted" ? "pos" : s === "Rejected" ? "neg" : s === "Sent" ? "pri" : "";
  return (
    <div className="content">
      <div className="page-head"><h3>Quotations</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "quotation" })}><Plus size={16} />New quotation</button></div>
      <div className="toolbar"><div className="seg">{["All", ...QUOTE_STATUS].map((s) => <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{s}</button>)}</div></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<FileText size={22} color="var(--muted)" />} title="No quotations" text="Build a quote with line items and a running total, then mark it Sent." action={<button className="btn primary" onClick={() => openModal({ type: "quotation" })}><Plus size={16} />New quotation</button>} /></div>
          : list.map((qt) => (
            <div key={qt.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{qt.client}</div><div className="sub">{qt.title || "Quotation"}</div></div>
                <div className="mono" style={{ fontWeight: 700 }}>{money(qt.total)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className={"badge " + tone(qt.status)}>{qt.status}</span>
                {(qt.items || []).length > 0 && <span className="hint-line" style={{ fontSize: 12 }}>{qt.items.length} item{qt.items.length > 1 ? "s" : ""}</span>}
                {qt.clientId && <span className="badge accent">Shared</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                <select className="select" style={{ width: "auto", padding: "5px 8px" }} value={qt.status} onChange={(e) => setQuoteStatus(qt, e.target.value)}>{QUOTE_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                <button className="btn sm" onClick={() => openModal({ type: "quotation", initial: qt })}><Pencil size={13} /></button>
                <button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Delete quotation?", body: `Delete the quote for ${qt.client}?`, note: "Moves to Recently deleted — restore within 60 days.", onConfirm: () => del(qt) })}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Planned({ db, mutate, openModal, removeItem, openIncome, canFinance }) {
  const list = [...db.planned].sort((a, b) => (a.nextDue || "").localeCompare(b.nextDue || ""));
  const del = (p) => removeItem("planned", p, { name: p.title, audit: `deleted planned expense "${p.title}"` });
  const monthlyTotal = list.filter((p) => p.recurrence === "Monthly").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const dueTone = (p) => { if (!p.nextDue) return "muted"; const today = todayISO(); return p.nextDue < today ? "neg" : p.nextDue <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) ? "accent" : "muted"; };
  const recordPaid = (p) => {
    openIncome({ kind: "expense", category: p.category, amount: p.amount, notes: p.title, source: { kind: "planned", id: p.id } });
  };
  return (
    <div className="content">
      <div className="page-head"><h3>Planned & recurring expenses</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "planned" })}><Plus size={16} />New</button></div>
      <div className="sumrow">
        <div className="card"><div className="k"><CalendarClock size={14} /> Recurring monthly</div><div className="v mono">{money(monthlyTotal)}</div></div>
        <div className="card"><div className="k"><Banknote size={14} /> Items tracked</div><div className="v mono">{list.length}</div></div>
      </div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<CalendarClock size={22} color="var(--muted)" />} title="Nothing planned yet" text="Track rent, subscriptions and other regular costs, and log them as expenses when paid." action={<button className="btn primary" onClick={() => openModal({ type: "planned" })}><Plus size={16} />New planned expense</button>} />
          : <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>Expense</th><th>Repeats</th><th>Next due</th><th className="num-cell">Amount</th><th></th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td><div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>{p.title}{p.status && <span className={"badge " + (p.status === "Purchased" ? "pos" : p.status === "Cancelled" ? "neg" : p.status === "Approved" ? "accent" : "pri")} style={{ fontSize: 10 }}>{p.status}</span>}</div><div className="hint-line" style={{ fontSize: 11 }}>{p.category}</div></td>
                <td>{p.recurrence}</td>
                <td><span className={"badge " + dueTone(p)}>{p.nextDue ? fmtDate(p.nextDue) : "—"}</span></td>
                <td className="num-cell mono">{money(p.amount)}</td>
                <td><div className="row-actions">
                  <select className="select" style={{ width: "auto", padding: "4px 6px" }} value={p.status || "Planned"} onChange={(e) => mutate((d) => ({ ...d, planned: d.planned.map((x) => x.id === p.id ? { ...x, status: e.target.value } : x) }), { action: `set planned "${p.title}" to ${e.target.value}`, module: "Planned expenses" })}>{PLANNED_STATUS.map((x) => <option key={x}>{x}</option>)}</select>
                  {canFinance && <button className="btn sm primary" onClick={() => recordPaid(p)}>Log expense</button>}
                  <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "planned", initial: p })}><Pencil size={14} /></button>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete?", body: `Delete "${p.title}"?`, note: "Moves to Recently deleted — restore within 60 days.", onConfirm: () => del(p) })}><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </div>
    </div>
  );
}

function Vault({ db, mutate, openModal, removeItem }) {
  const [q, setQ] = useState("");
  const [reveal, setReveal] = useState({});
  const all = [...db.vault].sort((a, b) => (a.service || "").localeCompare(b.service || ""));
  const list = q.trim() ? all.filter((v) => (v.service + " " + (v.category || "") + " " + (v.username || "")).toLowerCase().includes(q.toLowerCase())) : all;
  const del = (v) => removeItem("vault", v, { name: v.service, audit: `deleted credential "${v.service}"` });
  const logVault = (action) => mutate((d) => d, { action, module: "Passwords" });
  const copy = (t, v, what) => { try { navigator.clipboard?.writeText(t || ""); logVault(`copied ${what} for "${v.service}"`); } catch { /* clipboard may be blocked */ } };
  const toggleReveal = (v) => setReveal((r) => { const now = !r[v.id]; if (now) logVault(`viewed password for "${v.service}"`); return { ...r, [v.id]: now }; });
  return (
    <div className="content">
      <div className="page-head"><h3>Passwords</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "vault" })}><Plus size={16} />New credential</button></div>
      <div className="banner" style={{ marginLeft: 0, marginRight: 0 }}><LockIcon size={15} /> Visible to partners only. Stored in your database with row-level security.</div>
      <div className="toolbar" style={{ marginTop: 14 }}><div className="search"><Search size={16} color="var(--muted)" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logins…" /></div></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<KeyRound size={22} color="var(--muted)" />} title={q ? "No matches" : "No logins saved"} text="Keep shared business logins — social, hosting, email, domains — in one safe place." action={!q && <button className="btn primary" onClick={() => openModal({ type: "vault" })}><Plus size={16} />New credential</button>} /></div>
          : list.map((v) => (
            <div key={v.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{v.service}</div><div className="sub">{v.category}</div></div>
                <span className="tag">{v.category}</span>
              </div>
              {v.username && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><span className="hint-line" style={{ minWidth: 64 }}>User</span><span className="mono" style={{ flex: 1, wordBreak: "break-all" }}>{v.username}</span><button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => copy(v.username, v, "username")}><Copy size={13} /></button></div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><span className="hint-line" style={{ minWidth: 64 }}>Pass</span><span className="mono" style={{ flex: 1 }}>{reveal[v.id] ? v.password : "••••••••"}</span>
                <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => toggleReveal(v)}>{reveal[v.id] ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => copy(v.password, v, "password")}><Copy size={13} /></button>
              </div>
              {v.url && <a className="hint-line" href={v.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5 }}><ExternalLink size={12} />Open login</a>}
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button className="btn sm" onClick={() => openModal({ type: "vault", initial: v })}><Pencil size={13} />Edit</button>
                <button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Delete credential?", body: `Delete "${v.service}"?`, note: "Moves to Recently deleted — restore within 60 days.", onConfirm: () => del(v) })}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Announcements({ db, mutate, openModal, removeItem, isAdmin, me }) {
  const list = [...db.announcements].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const del = (a) => removeItem("announcements", a, { name: a.title, audit: `deleted announcement "${a.title}"` });
  const ack = (a) => { haptic(10); mutate((d) => ({ ...d, announcements: d.announcements.map((x) => x.id === a.id ? { ...x, acks: Array.from(new Set([...(x.acks || []), me.id])) } : x) }), null); };
  return (
    <div className="content">
      <div className="page-head"><h3>Announcements</h3><span className="spacer" />{isAdmin && <button className="btn primary" onClick={() => openModal({ type: "announcement" })}><Plus size={16} />New announcement</button>}</div>
      {list.length === 0 ? <div className="card"><Empty icon={<MegaphoneIcon size={22} color="var(--muted)" />} title="Nothing announced yet" text={isAdmin ? "Post company-wide news here — everyone sees it and gets a bell." : "Company news from your admins will show up here."} action={isAdmin && <button className="btn primary" onClick={() => openModal({ type: "announcement" })}><Plus size={16} />New announcement</button>} /></div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{list.map((a) => (
          <div key={a.id} className="card stat">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{a.title}</div>
                {a.body && <div style={{ marginTop: 6, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{a.body}</div>}
                <div className="item-meta" style={{ marginTop: 8 }}><span>{a.by || "Admin"}</span><span>{fmtDateTime(a.createdAt)}</span>{isAdmin && <span><BadgeCheck size={12} style={{ verticalAlign: -2 }} /> {(a.acks || []).length} acknowledged</span>}</div>
                {a.meetingLink && <div style={{ marginTop: 8 }}><a className="btn sm primary" href={a.meetingLink} target="_blank" rel="noreferrer"><Link2 size={13} />Join meeting</a></div>}
                {!isAdmin && ((a.acks || []).includes(me.id)
                  ? <div className="hint-line" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, color: "var(--pos)" }}><BadgeCheck size={13} />You acknowledged this</div>
                  : <div style={{ marginTop: 10 }}><button className="btn sm primary" onClick={() => ack(a)}><Check size={13} />Acknowledge</button></div>)}
              </div>
              {isAdmin && <div className="row-actions"><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "announcement", initial: a })}><Pencil size={14} /></button><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete announcement?", body: `Delete "${a.title}"?`, note: "Moves to Recently deleted.", onConfirm: () => del(a) })}><Trash2 size={14} /></button></div>}
            </div>
          </div>
        ))}</div>}
    </div>
  );
}

function Documents({ db, mutate, openModal, removeItem, isAdmin, me }) {
  const [cat, setCat] = useState("All");
  const all = [...db.documents].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = cat === "All" ? all : all.filter((d) => d.category === cat);
  const del = (d) => removeItem("documents", d, { name: d.title, audit: `deleted document "${d.title}"` });
  const canManage = (d) => isAdmin || d.ownerId === me?.id;
  return (
    <div className="content">
      <div className="page-head"><h3>Documents</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "document" })}><Plus size={16} />Add document</button></div>
      <div className="toolbar"><div className="seg">{["All", ...DOC_CATEGORIES].map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div></div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<FileText size={22} color="var(--muted)" />} title="No documents" text="Keep shared contracts, templates and brand files (as links) in one place." action={<button className="btn primary" onClick={() => openModal({ type: "document" })}><Plus size={16} />Add document</button>} />
          : list.map((d) => (
            <div key={d.id} className="item-row">
              <div className="empty" style={{ padding: 0 }}><div className="ic" style={{ width: 40, height: 40, margin: 0 }}><FileText size={18} color="var(--muted)" /></div></div>
              <div className="item-main">
                <div className="item-title"><a href={d.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", textDecoration: "none" }}>{d.title}</a></div>
                <div className="item-meta"><span className="tag">{d.category}</span>{d.owner && <span>by {d.owner}</span>}{d.notes && <span>{d.notes}</span>}<span>{fmtDate(new Date(d.createdAt).toISOString().slice(0, 10))}</span></div>
              </div>
              <div className="row-actions" style={{ alignItems: "center" }}>
                <a className="btn sm" href={d.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open</a>
                {canManage(d) && <><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "document", initial: d })}><Pencil size={14} /></button><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete document?", body: `Delete "${d.title}"?`, note: "Moves to Recently deleted.", onConfirm: () => del(d) })}><Trash2 size={14} /></button></>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Knowledge({ db, mutate, openModal, removeItem, isAdmin }) {
  const [open, setOpen] = useState(null);
  const [cat, setCat] = useState("All");
  const all = [...db.knowledge].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = cat === "All" ? all : all.filter((k) => k.category === cat);
  const del = (k) => removeItem("knowledge", k, { name: k.title, audit: `deleted article "${k.title}"` });
  const article = open ? db.knowledge.find((k) => k.id === open) : null;
  if (article) return (
    <div className="content">
      <button className="backlink" onClick={() => setOpen(null)}><ArrowLeft size={15} />Back to knowledge base</button>
      <div className="detail-head"><div><h3>{article.title}</h3><div className="item-meta" style={{ marginTop: 6 }}><span className="tag">{article.category}</span><span>{fmtDate(new Date(article.createdAt).toISOString().slice(0, 10))}</span></div></div></div>
      <div className="card stat" style={{ lineHeight: 1.65, whiteSpace: "pre-wrap", fontSize: 14.5 }}>{article.body || "No content yet."}</div>
    </div>
  );
  return (
    <div className="content">
      <div className="page-head"><h3>Knowledge base</h3><span className="spacer" />{isAdmin && <button className="btn primary" onClick={() => openModal({ type: "knowledge" })}><Plus size={16} />New article</button>}</div>
      <div className="toolbar"><div className="seg">{["All", ...KB_CATEGORIES].map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div></div>
      <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
        {list.length === 0 ? <div className="card" style={{ gridColumn: "1/-1" }}><Empty icon={<BookOpen size={22} color="var(--muted)" />} title="No articles yet" text={isAdmin ? "Write down how-tos, policies and onboarding guides for the team." : "Guides from your team will show up here."} action={isAdmin && <button className="btn primary" onClick={() => openModal({ type: "knowledge" })}><Plus size={16} />New article</button>} /></div>
          : list.map((k) => (
            <div key={k.id} className="card stat" style={{ display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }} onClick={() => setOpen(k.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><BookOpen size={16} color="var(--primary)" /><span className="tag">{k.category}</span></div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{k.title}</div>
              <div className="sub" style={{ lineHeight: 1.5 }}>{(k.body || "").slice(0, 110)}{(k.body || "").length > 110 ? "…" : ""}</div>
              {isAdmin && <div style={{ display: "flex", gap: 6, marginTop: 2 }} onClick={(e) => e.stopPropagation()}><button className="btn sm" onClick={() => openModal({ type: "knowledge", initial: k })}><Pencil size={13} /></button><button className="btn sm danger" onClick={() => openModal({ type: "deleteConfirm", title: "Delete article?", body: `Delete "${k.title}"?`, note: "Moves to Recently deleted.", onConfirm: () => del(k) })}><Trash2 size={13} /></button></div>}
            </div>
          ))}
      </div>
    </div>
  );
}

function Chat({ db, mutate, me, team }) {
  const [text, setText] = useState("");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const list = [...db.chat].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [list.length]);
  // Read receipts: mark messages from others as seen by me (converges once all seen).
  useEffect(() => {
    const unseen = db.chat.filter((m) => m.userId !== me.id && !(m.seenBy || []).includes(me.id));
    if (!unseen.length) return;
    const ids = new Set(unseen.map((m) => m.id));
    mutate((d) => ({ ...d, chat: d.chat.map((m) => ids.has(m.id) ? { ...m, seenBy: Array.from(new Set([...(m.seenBy || []), me.id])) } : m) }), null);
  }, [db.chat, me.id, mutate]);
  const send = () => {
    const t = text.trim(); if (!t) return;
    setText("");
    mutate((d) => ({ ...d, chat: [...d.chat, { id: uid(), userId: me.id, userName: me.name, text: t, createdAt: Date.now() }] }), null);
  };
  const attach = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { const up = await uploadAttachment(file); mutate((d) => ({ ...d, chat: [...d.chat, { id: uid(), userId: me.id, userName: me.name, text: "", attachment: up, createdAt: Date.now() }] }), null); }
    catch (er) { alert(er.message || "Upload failed."); }
    finally { setBusy(false); if (e.target) e.target.value = ""; }
  };
  const onlineCount = (team || []).filter((p) => p.id !== me.id && isOnline(p)).length;
  const startEdit = (m) => { setEditId(m.id); setEditText(m.text); };
  const saveEdit = (m) => { const t = editText.trim(); if (!t) { setEditId(null); return; } mutate((d) => ({ ...d, chat: d.chat.map((x) => x.id === m.id ? { ...x, text: t, editedAt: Date.now() } : x) }), null); setEditId(null); setEditText(""); };
  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      <div className="page-head"><h3>Team chat</h3><span className="spacer" />{onlineCount > 0 && <span className="hint-line" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--pos)", display: "inline-block" }} />{onlineCount} online</span>}</div>
      <div className="card" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {list.length === 0 ? <Empty icon={<Send size={22} color="var(--muted)" />} title="Say hello 👋" text="This channel is shared with the whole internal team." />
          : list.map((m) => {
            const mine = m.userId === me.id;
            return (
              <div key={m.id} style={{ display: "flex", gap: 10, flexDirection: mine ? "row-reverse" : "row" }}>
                <div style={{ position: "relative", flex: "none" }}><div className="avatar" style={{ background: avatarColor(m.userName), width: 30, height: 30, fontSize: 12 }}>{(m.userName || "?")[0]}</div>{isOnline((team || []).find((p) => p.id === m.userId)) && <span title="Online" style={{ position: "absolute", right: -1, bottom: -1, width: 9, height: 9, borderRadius: "50%", background: "var(--pos)", border: "2px solid var(--surface, #fff)" }} />}</div>
                <div style={{ maxWidth: "72%" }}>
                  {editId === m.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea className="textarea" style={{ minHeight: 44 }} value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(m); } }} autoFocus />
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button className="btn sm" onClick={() => { setEditId(null); setEditText(""); }}>Cancel</button><button className="btn sm primary" onClick={() => saveEdit(m)}><Check size={13} />Save</button></div>
                    </div>
                  ) : (
                    <div style={{ background: mine ? "var(--primary)" : "var(--surface-2)", color: mine ? "#fff" : "var(--ink)", padding: "9px 13px", borderRadius: 12, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{m.text}{m.attachment && ((m.attachment.type || "").startsWith("image/")
                      ? <a href={m.attachment.url} target="_blank" rel="noreferrer"><img src={m.attachment.url} alt={m.attachment.name || ""} style={{ display: "block", maxWidth: 220, maxHeight: 220, borderRadius: 8, marginTop: m.text ? 8 : 0 }} /></a>
                      : <a href={m.attachment.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: m.text ? 8 : 0, color: mine ? "#fff" : "var(--primary)", textDecoration: "underline" }}><Paperclip size={13} />{m.attachment.name || "Attachment"}</a>)}</div>
                  )}
                  <div className="hint-line" style={{ fontSize: 11, marginTop: 3, textAlign: mine ? "right" : "left" }}>{mine ? "You" : m.userName} · {fmtDateTime(m.createdAt)}{m.editedAt ? " · edited" : ""}{mine && (m.seenBy || []).filter((u) => u !== me.id).length > 0 ? " · Seen" : ""}{mine && editId !== m.id && withinMinutes(m.createdAt, 5) && <button onClick={() => startEdit(m)} style={{ marginLeft: 6, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", font: "inherit", padding: 0, textDecoration: "underline" }}>Edit</button>}</div>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>
      <div className="composer" style={{ marginTop: 12 }}>
        <textarea className="textarea" style={{ minHeight: 44 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message the team… (Enter to send)" />
        <button className="btn" type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach a file">{busy ? <RefreshCw size={16} className="spin" /> : <Paperclip size={16} />}</button>
        <input ref={fileRef} type="file" onChange={attach} style={{ display: "none" }} />
        <button className="btn primary" onClick={send} disabled={!text.trim()}><Send size={16} />Send</button>
      </div>
    </div>
  );
}

function Performance({ db, team }) {
  const month = new Date();
  const staff = (team || []).filter((p) => ["staff", "intern", "admin", "accountant"].includes(p.role) && p.active !== false);
  const rows = staff.map((p) => {
    const done = db.tasks.filter((t) => t.assignedTo === p.name && t.status === "Completed").length;
    const open = db.tasks.filter((t) => t.assignedTo === p.name && t.status !== "Completed").length;
    const myLeads = db.leads.filter((l) => l.ownerId === p.id || l.leadOwner === p.name);
    const leadsGen = myLeads.length;
    const leadsWon = myLeads.filter((l) => l.stage === "Converted").length;
    const hours = round2(sumHours(db.attendance.filter((a) => a.userId === p.id && sameMonth(a.date, month))));
    const updateDays = new Set(db.updates.filter((u) => u.userId === p.id && sameMonth(u.date, month)).map((u) => u.date)).size;
    const points = db.rewards.filter((r) => r.userId === p.id).reduce((s, r) => s + (Number(r.points) || 0), 0);
    const score = done * 10 + leadsWon * 15 + Math.round(hours) + updateDays * 3 + points;
    return { p, done, open, leadsGen, leadsWon, hours, updateDays, points, score };
  }).sort((a, b) => b.score - a.score);
  const medal = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
  return (
    <div className="content">
      <div className="page-head"><h3>Performance</h3></div>
      <div className="sumrow" style={{ marginBottom: 14 }}>
        <div className="card"><div className="k"><TrendingUp size={14} /> Revenue this month</div><div className="v mono">{money(db.transactions.filter((t) => t.kind === "income" && sameMonth(t.date, month)).reduce((s, t) => s + (Number(t.amount) || 0), 0))}</div></div>
        <div className="card"><div className="k"><UserPlus size={14} /> Leads this month</div><div className="v mono">{db.leads.filter((l) => sameMonth(new Date(l.createdAt || 0).toISOString().slice(0, 10), month)).length}</div></div>
      </div>
      <div className="card">
        {rows.length === 0 ? <Empty icon={<TrendingUp size={22} color="var(--muted)" />} title="No team data yet" text="As people complete tasks, check in and earn recognition, the leaderboard fills up." />
          : <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>#</th><th>Member</th><th className="num-cell">Tasks</th><th className="num-cell">Leads</th><th className="num-cell">Won</th><th className="num-cell">Hours</th><th className="num-cell">Updates</th><th className="num-cell">Points</th><th className="num-cell">Score</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.p.id}>
                <td style={{ fontSize: 16 }}>{medal(i)}</td>
                <td><span className="who-cell"><span className="avatar" style={{ background: avatarColor(r.p.name), width: 26, height: 26, fontSize: 11 }}>{r.p.name[0]}</span><span><div style={{ fontWeight: 600 }}>{r.p.name}</div><div className="hint-line" style={{ fontSize: 11 }}>{ROLE_LABEL[r.p.role]}</div></span></span></td>
                <td className="num-cell mono">{r.done}</td><td className="num-cell mono">{r.leadsGen}</td><td className="num-cell mono">{r.leadsWon}</td><td className="num-cell mono">{r.hours}</td><td className="num-cell mono">{r.updateDays}</td><td className="num-cell mono">{r.points}</td>
                <td className="num-cell mono" style={{ fontWeight: 700 }}>{r.score}</td>
              </tr>
            ))}</tbody>
          </table></div>}
        <div className="hint-line" style={{ padding: "12px 16px" }}>Score = tasks completed ×10 + days present this month ×2 + recognition points.</div>
      </div>
    </div>
  );
}

function Rewards({ db, mutate, openModal, removeItem, me, isAdmin, team }) {
  const all = [...db.rewards].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = isAdmin ? all : all.filter((r) => r.userId === me.id);
  const del = (r) => removeItem("rewards", r, { name: r.userName, audit: `removed recognition for ${r.userName}` });
  const myPoints = db.rewards.filter((r) => r.userId === me.id).reduce((s, r) => s + (Number(r.points) || 0), 0);
  return (
    <div className="content">
      <div className="page-head"><h3>Recognition & rewards</h3><span className="spacer" />{isAdmin && <button className="btn primary" onClick={() => openModal({ type: "reward" })}><Award size={16} />Give recognition</button>}</div>
      {!isAdmin && <div className="sumrow"><div className="card"><div className="k"><Star size={14} /> Your points</div><div className="v mono">{myPoints}</div></div></div>}
      <div className="card">
        {list.length === 0 ? <Empty icon={<Award size={22} color="var(--muted)" />} title={isAdmin ? "No recognition given yet" : "No recognition yet"} text={isAdmin ? "Celebrate good work — points feed the performance leaderboard." : "When an admin recognises your work, it shows up here."} action={isAdmin && <button className="btn primary" onClick={() => openModal({ type: "reward" })}><Award size={16} />Give recognition</button>} />
          : list.map((r) => (
            <div key={r.id} className="item-row">
              <div className="avatar" style={{ background: avatarColor(r.userName), width: 34, height: 34, fontSize: 14 }}>{(r.userName || "?")[0]}</div>
              <div className="item-main">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span className="item-title">{r.userName}</span><span className="badge accent">{r.kind}</span><span className="badge pos">+{r.points} pts</span></div>
                {r.note && <div className="item-meta" style={{ marginTop: 4 }}>{r.note}</div>}
                <div className="item-meta"><span>{fmtDate(r.date || new Date(r.createdAt).toISOString().slice(0, 10))}</span></div>
              </div>
              {isAdmin && <div className="row-actions"><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Remove recognition?", body: `Remove this for ${r.userName}?`, note: "Moves to Recently deleted.", onConfirm: () => del(r) })}><Trash2 size={14} /></button></div>}
            </div>
          ))}
      </div>
    </div>
  );
}

function PortalPosts({ db, mutate, openModal, removeItem, portalClients }) {
  const list = [...db.portal_posts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const del = (p) => removeItem("portal_posts", p, { name: p.title, audit: `deleted client update "${p.title}"` });
  const statusTone = (s) => s === "Completed" ? "pos" : s === "On hold" ? "neg" : s === "Review" ? "accent" : "pri";
  return (
    <div className="content">
      <div className="page-head"><h3>Client updates</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "portalPost" })}><Plus size={16} />Post update</button></div>
      <p className="hint-line" style={{ marginTop: -4 }}>Updates you post here appear in that client's portal when they sign in.</p>
      <div className="card" style={{ marginTop: 12 }}>
        {list.length === 0 ? <Empty icon={<ExternalLink size={22} color="var(--muted)" />} title="No client updates yet" text={portalClients.length === 0 ? "No client portal accounts yet — a client signs up from the login screen (choose Client)." : "Post a status update and your client will see it in their portal."} action={portalClients.length > 0 && <button className="btn primary" onClick={() => openModal({ type: "portalPost" })}><Plus size={16} />Post update</button>} />
          : list.map((p) => (
            <div key={p.id} className="item-row">
              <div className="item-main">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span className="item-title">{p.title}</span><span className={"badge " + statusTone(p.status)}>{p.status}</span></div>
                <div className="item-meta"><span><Building2 size={12} style={{ verticalAlign: -2 }} /> {p.clientName}</span><span>{fmtDateTime(p.createdAt)}</span></div>
                {p.body && <div className="sub" style={{ marginTop: 4 }}>{p.body}</div>}
                {p.meetingLink && <div style={{ marginTop: 6 }}><a className="btn sm primary" href={p.meetingLink} target="_blank" rel="noreferrer"><Link2 size={13} />Join meeting</a></div>}
              </div>
              <div className="row-actions">
                <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "portalPost", initial: p })}><Pencil size={14} /></button>
                <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete update?", body: `Delete "${p.title}"?`, note: "Moves to Recently deleted.", onConfirm: () => del(p) })}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ── Client portal: a separate, read-only surface for external clients ──── */
function ClientPortal({ db, profile, signOut, isDark }) {
  const myId = profile?.id;
  const posts = [...db.portal_posts].filter((p) => p.clientId === myId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const quotes = [...db.quotations].filter((q) => q.clientId === myId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const invoices = [...db.invoices].filter((iv) => iv.clientId === myId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const statusTone = (s) => s === "Completed" ? "pos" : s === "On hold" ? "neg" : s === "Review" ? "accent" : "pri";
  return (
    <div className="allbee" data-theme={isDark ? "dark" : "light"} style={{ minHeight: "100vh" }}>
      <style>{CSS}</style>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <img className="brand-logo" src={LOGO_ICON} alt="ALLBEE" style={{ height: 30 }} />
        <div><h2 style={{ fontSize: 16 }}>Client portal</h2><div className="topbar-sub">ALLBEE Solutions</div></div>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="userchip" onClick={signOut} style={{ cursor: "pointer" }}><div className="avatar" style={{ background: avatarColor(profile?.name || "C") }}>{(profile?.name || "C")[0]}</div><span className="userchip-name">{profile?.name}</span><LogOut size={15} /></div>
      </header>
      <div className="content" style={{ maxWidth: 820, margin: "0 auto" }}>
        <div className="page-head"><h3>Welcome, {profile?.name?.split(" ")[0] || "there"}</h3></div>

        <div className="card stat" style={{ marginBottom: 16 }}>
          <div className="lbl" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Your project updates</div>
          {posts.length === 0 ? <p className="hint-line" style={{ margin: "8px 0 0" }}>No updates yet. We'll post progress here as we go.</p>
            : <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>{posts.map((p) => (
              <div key={p.id} style={{ borderLeft: "3px solid var(--primary)", paddingLeft: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontWeight: 700 }}>{p.title}</span><span className={"badge " + statusTone(p.status)}>{p.status}</span></div>
                {p.body && <div style={{ marginTop: 5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{p.body}</div>}
                {p.meetingLink && <div style={{ marginTop: 8 }}><a className="btn sm primary" href={p.meetingLink} target="_blank" rel="noreferrer"><Link2 size={13} />Join meeting</a></div>}
                <div className="hint-line" style={{ fontSize: 11.5, marginTop: 5 }}>{fmtDateTime(p.createdAt)}</div>
              </div>
            ))}</div>}
        </div>

        <div className="card stat">
          <div className="lbl" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Your quotations</div>
          {quotes.length === 0 ? <p className="hint-line" style={{ margin: "8px 0 0" }}>No quotations shared with you yet.</p>
            : <div style={{ overflowX: "auto", marginTop: 10 }}><table className="tbl">
              <thead><tr><th>Quotation</th><th>Status</th><th className="num-cell">Total</th></tr></thead>
              <tbody>{quotes.map((q) => (
                <tr key={q.id}><td><div style={{ fontWeight: 600 }}>{q.title || "Quotation"}</div><div className="hint-line" style={{ fontSize: 11 }}>{(q.items || []).length} item{(q.items || []).length === 1 ? "" : "s"}</div></td>
                  <td><span className={"badge " + (q.status === "Accepted" ? "pos" : q.status === "Rejected" ? "neg" : "pri")}>{q.status}</span></td>
                  <td className="num-cell mono">{money(q.total)}</td></tr>
              ))}</tbody>
            </table></div>}
          <p className="hint-line" style={{ marginTop: 12 }}>Questions about a quote? Reply to the email from your ALLBEE contact.</p>
        </div>

        <div className="card stat" style={{ marginTop: 16 }}>
          <div className="lbl" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Your invoices</div>
          {invoices.length === 0 ? <p className="hint-line" style={{ margin: "8px 0 0" }}>No invoices yet.</p>
            : <div style={{ overflowX: "auto", marginTop: 10 }}><table className="tbl">
              <thead><tr><th>Invoice</th><th>Payment</th><th>Due</th><th className="num-cell">Amount</th></tr></thead>
              <tbody>{invoices.map((iv) => (
                <tr key={iv.id}><td><div style={{ fontWeight: 600 }}>{iv.number || "Invoice"}</div><div className="hint-line" style={{ fontSize: 11 }}>{iv.title || ""}</div></td>
                  <td><span className={"badge " + (iv.status === "Paid" ? "pos" : iv.status === "Overdue" ? "neg" : "pri")}>{iv.status === "Paid" ? "Paid" : iv.status === "Overdue" ? "Overdue" : "Due"}</span></td>
                  <td className="mono">{iv.dueDate ? fmtDate(iv.dueDate) : "—"}</td>
                  <td className="num-cell mono">{money(iv.amount)}</td></tr>
              ))}</tbody>
            </table></div>}
        </div>
      </div>
    </div>
  );
}



/* ══════════════════════════════════════════════════════════════════════
   PHASE 7 — Notifications, Invoices, Company profile
══════════════════════════════════════════════════════════════════════ */
function Notifications({ db, mutate, openModal, removeItem, isAdmin, me, profile, team }) {
  const visible = [...db.notifications].filter((n) => isAdmin || notifVisibleTo(n, profile)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const levelTone = (l) => l === "Urgent" ? "neg" : l === "Important" ? "accent" : "pri";
  const audienceLabel = (a) => { if (!a || a === "all") return "Everyone"; if (a.startsWith("user:")) { const u = (team || []).find((x) => x.id === a.slice(5)); return u ? "Only " + u.name : "One person"; } return (NOTIF_AUDIENCES.find((x) => x[0] === a) || [a, a])[1]; };
  const markRead = (n) => { if ((n.reads || []).includes(me.id)) return; mutate((d) => ({ ...d, notifications: d.notifications.map((x) => x.id === n.id ? { ...x, reads: Array.from(new Set([...(x.reads || []), me.id])) } : x) }), null); };
  const del = (n) => removeItem("notifications", n, { name: n.title, audit: `deleted notification "${n.title}"` });
  return (
    <div className="content">
      <div className="page-head"><h3>Notifications</h3><span className="spacer" />{isAdmin && <button className="btn primary" onClick={() => openModal({ type: "notification" })}><Bell size={16} />New notification</button>}</div>
      {visible.length === 0 ? <div className="card"><Empty icon={<Bell size={22} color="var(--muted)" />} title="No notifications" text={isAdmin ? "Broadcast an update to everyone, a role, or one person \u2014 with a priority level." : "Notifications from your admins show up here."} action={isAdmin && <button className="btn primary" onClick={() => openModal({ type: "notification" })}><Bell size={16} />New notification</button>} /></div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{visible.map((n) => {
          const seen = (n.reads || []).includes(me.id);
          return (
            <div key={n.id} className="card stat" style={{ borderLeft: `3px solid var(${n.level === "Urgent" ? "--neg" : "--primary"})` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontWeight: 700, fontSize: 15 }}>{n.title}</span><span className={"badge " + levelTone(n.level)}>{n.level || "General"}</span>{!seen && !isAdmin && <span className="badge pri">New</span>}</div>
                  {n.body && <div style={{ marginTop: 6, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{n.body}</div>}
                  <div className="item-meta" style={{ marginTop: 8 }}><span>{n.by || "Admin"}</span><span>{fmtDateTime(n.createdAt)}</span>{isAdmin && <span><Users size={12} style={{ verticalAlign: -2 }} /> {audienceLabel(n.audience)}</span>}{isAdmin && <span><Check size={12} style={{ verticalAlign: -2 }} /> {(n.reads || []).length} read</span>}</div>
                  {!isAdmin && !seen && <div style={{ marginTop: 10 }}><button className="btn sm primary" onClick={() => markRead(n)}><Check size={13} />Mark as read</button></div>}
                  {!isAdmin && seen && <div className="hint-line" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, color: "var(--pos)" }}><BadgeCheck size={13} />Read</div>}
                </div>
                {isAdmin && <div className="row-actions"><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => del(n)}><Trash2 size={14} /></button></div>}
              </div>
            </div>
          );
        })}</div>}
    </div>
  );
}

function NotificationForm({ initial, team, onSave, onClose }) {
  const [f, setF] = useState(initial || { title: "", body: "", level: "General", audience: "all" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [err, setErr] = useState("");
  const people = (team || []).filter((p) => p.role !== "client");
  const save = () => { if (!f.title.trim()) { setErr("Add a title."); return; } onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), title: f.title.trim(), reads: f.reads || [] }); };
  return (
    <Modal title={f.id ? "Edit notification" : "New notification"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Bell size={15} />Send</button></>}>
      <Field label="Title" required error={err}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Office closed Friday" /></Field>
      <Field label="Message"><textarea className="textarea" value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="Details\u2026" /></Field>
      <div className="grid2">
        <Field label="Priority"><select className="select" value={f.level} onChange={(e) => set("level", e.target.value)}>{NOTIF_LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
        <Field label="Send to"><select className="select" value={f.audience} onChange={(e) => set("audience", e.target.value)}>{NOTIF_AUDIENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<optgroup label="One person">{people.map((p) => <option key={p.id} value={"user:" + p.id}>{p.name}</option>)}</optgroup></select></Field>
      </div>
    </Modal>
  );
}

function Invoices({ db, mutate, openModal, removeItem, portalClients }) {
  const [status, setStatus] = useState("All");
  const all = [...db.invoices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = status === "All" ? all : all.filter((iv) => iv.status === status);
  const setIvStatus = (iv, sv) => mutate((d) => ({ ...d, invoices: d.invoices.map((x) => x.id === iv.id ? { ...x, status: sv, paid: sv === "Paid" } : x) }), { action: `marked invoice ${iv.number || ""} for ${iv.client} ${sv}`, module: "Invoices" });
  const del = (iv) => removeItem("invoices", iv, { name: (iv.number || "Invoice") + " \u00b7 " + iv.client, audit: `deleted invoice for ${iv.client}` });
  const tone = (sv) => sv === "Paid" ? "pos" : sv === "Overdue" ? "neg" : sv === "Sent" ? "pri" : sv === "Cancelled" ? "" : "accent";
  const outstanding = all.filter((iv) => iv.status === "Sent" || iv.status === "Overdue").reduce((a, iv) => a + (Number(iv.amount) || 0), 0);
  const paid = all.filter((iv) => iv.status === "Paid").reduce((a, iv) => a + (Number(iv.amount) || 0), 0);
  return (
    <div className="content">
      <div className="page-head"><h3>Invoices</h3><span className="spacer" /><button className="btn primary" onClick={() => openModal({ type: "invoice" })}><Plus size={16} />New invoice</button></div>
      <div className="sumrow">
        <div className="card"><div className="k"><Banknote size={14} /> Outstanding</div><div className="v mono">{money(outstanding)}</div></div>
        <div className="card"><div className="k"><BadgeCheck size={14} /> Paid</div><div className="v mono">{money(paid)}</div></div>
      </div>
      <div className="toolbar"><div className="seg">{["All", ...INVOICE_STATUS].map((sv) => <button key={sv} className={status === sv ? "on" : ""} onClick={() => setStatus(sv)}>{sv}</button>)}</div></div>
      <div className="card">
        {list.length === 0 ? <Empty icon={<FileText size={22} color="var(--muted)" />} title="No invoices" text="Raise an invoice, track its payment, and optionally share it to the client portal." action={<button className="btn primary" onClick={() => openModal({ type: "invoice" })}><Plus size={16} />New invoice</button>} />
          : <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>Invoice</th><th>Client</th><th>Status</th><th>Due</th><th className="num-cell">Amount</th><th></th></tr></thead>
            <tbody>{list.map((iv) => (
              <tr key={iv.id}>
                <td><div style={{ fontWeight: 600 }}>{iv.number || "\u2014"}</div>{iv.title && <div className="hint-line" style={{ fontSize: 11 }}>{iv.title}</div>}</td>
                <td>{iv.client}{iv.clientId && <span className="badge accent" style={{ marginLeft: 6, fontSize: 10 }}>Shared</span>}</td>
                <td><select className="select" style={{ width: "auto", padding: "4px 6px" }} value={iv.status || "Draft"} onChange={(e) => setIvStatus(iv, e.target.value)}>{INVOICE_STATUS.map((sv) => <option key={sv}>{sv}</option>)}</select></td>
                <td><span className={"badge " + (iv.dueDate && iv.status !== "Paid" && iv.dueDate < todayISO() ? "neg" : "")}>{iv.dueDate ? fmtDate(iv.dueDate) : "\u2014"}</span></td>
                <td className="num-cell mono" style={{ fontWeight: 700 }}>{money(iv.amount)}</td>
                <td><div className="row-actions"><span className={"badge " + tone(iv.status)}>{iv.status || "Draft"}</span><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "invoice", initial: iv })}><Pencil size={14} /></button><button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openModal({ type: "deleteConfirm", title: "Delete invoice?", body: `Delete this invoice for ${iv.client}?`, note: "Moves to Recently deleted \u2014 restore within 60 days.", onConfirm: () => del(iv) })}><Trash2 size={14} /></button></div></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </div>
    </div>
  );
}

function InvoiceForm({ initial, clients, portalClients, onSave, onClose }) {
  const [f, setF] = useState(initial || { number: "INV-" + String(Date.now()).slice(-5), client: "", clientId: "", title: "", amount: "", status: "Draft", dueDate: todayISO(), notes: "" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [err, setErr] = useState("");
  const save = () => { if (!f.client.trim()) { setErr("Add a client."); return; } onSave({ ...f, id: f.id || uid(), createdAt: f.createdAt || Date.now(), client: f.client.trim(), amount: Number(f.amount) || 0 }); };
  return (
    <Modal title={f.id ? "Edit invoice" : "New invoice"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Check size={15} />Save invoice</button></>}>
      <div className="grid2">
        <Field label="Invoice #"><input className="input" value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="INV-001" /></Field>
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => set("status", e.target.value)}>{INVOICE_STATUS.map((sv) => <option key={sv}>{sv}</option>)}</select></Field>
      </div>
      <Field label="Client" required error={err}>
        <input className="input" list="inv-clients" value={f.client} onChange={(e) => set("client", e.target.value)} placeholder="Client name" />
        <datalist id="inv-clients">{(clients || []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </Field>
      <Field label="Description"><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Website \u2014 milestone 1" /></Field>
      <div className="grid2">
        <Field label="Amount (\u20b9)"><input className="input mono" type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /></Field>
        <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
      </div>
      {portalClients && portalClients.length > 0 && (
        <Field label="Share to portal client" hint="Optional \u2014 lets that client see this invoice and its payment status.">
          <select className="select" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">Don't share</option>
            {portalClients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Payment terms, bank details, etc." /></Field>
    </Modal>
  );
}

function CompanySettings({ config, saveCompany }) {
  const init = (() => { try { return JSON.parse((config && config.company) || "{}") || {}; } catch { return {}; } })();
  const [f, setF] = useState({ name: "ALLBEE Solutions", logoUrl: "", address: "", email: "", phone: "", website: "", ...init });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setDone(false); };
  const save = async () => { setBusy(true); try { await saveCompany(f); setDone(true); } finally { setBusy(false); } };
  return (
    <div className="card stat" style={{ marginBottom: 14 }}>
      <div className="lbl" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Company profile</div>
      <p className="hint-line" style={{ lineHeight: 1.55, marginBottom: 14 }}>Shown on the client portal and used on quotations and invoices.</p>
      <div className="grid2">
        <Field label="Company name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="ALLBEE Solutions" /></Field>
        <Field label="Logo URL"><input className="input" value={f.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://\u2026/logo.png" /></Field>
      </div>
      <Field label="Address"><textarea className="textarea" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city, PIN" /></Field>
      <div className="grid2">
        <Field label="Email"><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@allbee.in" /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 \u2026" /></Field>
      </div>
      <Field label="Website"><input className="input" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://allbee.in" /></Field>
      <button className="btn primary" onClick={save} disabled={busy}>{busy ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}{done ? "Saved" : "Save company profile"}</button>
    </div>
  );
}

function CreateUserModal({ onClose }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "staff" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const create = async () => {
    if (!f.email.trim() || f.password.length < 6) { setErr("Enter an email and a password of at least 6 characters."); return; }
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "create", email: f.email.trim(), password: f.password, name: f.name.trim(), role: f.role } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      setOk(true);
    } catch (e) { setErr((e && e.message) || "Couldn't create the user. Is the admin-users function deployed?"); }
    finally { setBusy(false); }
  };
  if (ok) return <Modal title="User created" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}><p className="hint-line" style={{ lineHeight: 1.6 }}>{f.name || f.email} can now sign in with the email and password you set. The account is confirmed and approved.</p></Modal>;
  return (
    <Modal title="Add a user" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={create} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}Create user</button></>}>
      <div className="grid2">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Priya Sharma" /></Field>
        <Field label="Role"><select className="select" value={f.role} onChange={(e) => set("role", e.target.value)}>{ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
      </div>
      <Field label="Email" required><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@allbee.in" /></Field>
      <Field label="Password" required hint="At least 6 characters. Share it with them securely."><input className="input" type="text" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="Temporary password" /></Field>
      {err && <div className="auth-msg err"><AlertTriangle size={14} /> {err}</div>}
      <p className="hint-line" style={{ marginTop: 8 }}>Requires the <b>admin-users</b> edge function to be deployed.</p>
    </Modal>
  );
}

function ManageUserModal({ person, onClose }) {
  const [designation, setDesignation] = useState(person.designation || "");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const call = async (body) => { setBusy(true); setMsg(""); setErr(""); try { const { data, error } = await supabase.functions.invoke("admin-users", { body }); if (error) throw error; if (data && data.error) throw new Error(data.error); return true; } catch (e) { setErr((e && e.message) || "Action failed. Is the admin-users function deployed?"); return false; } finally { setBusy(false); } };
  const saveDes = async () => { if (await call({ action: "set_designation", userId: person.id, designation })) setMsg("Job title updated."); };
  const resetPw = async () => { if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; } if (await call({ action: "reset_password", userId: person.id, password: pw })) { setMsg("Password reset."); setPw(""); } };
  return (
    <Modal title={"Manage " + person.name} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <Field label="Job title / designation"><div style={{ display: "flex", gap: 8 }}><input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Developer" /><button className="btn primary" onClick={saveDes} disabled={busy}>Save</button></div></Field>
      <Field label="Reset password" hint="Sets a new password for this user immediately."><div style={{ display: "flex", gap: 8 }}><input className="input" type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" /><button className="btn primary" onClick={resetPw} disabled={busy}>Reset</button></div></Field>
      {err && <div className="auth-msg err"><AlertTriangle size={14} /> {err}</div>}
      {msg && <div className="auth-msg ok"><Check size={14} /> {msg}</div>}
      <p className="hint-line" style={{ marginTop: 8 }}>Requires the <b>admin-users</b> edge function to be deployed.</p>
    </Modal>
  );
}

export default function App() {
  const [db, setDb] = useState(null);
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [profile, setProfile] = useState(undefined);  // undefined = loading, null = none
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [isDark, setIsDark] = useState(() => { try { const v = localStorage.getItem("allbee_theme"); return v ? v === "dark" : false; } catch { return false; } });
  const [route, setRoute] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [modal, setModal] = useState(null); // {type, ...}
  const [balanceUser, setBalanceUser] = useState(null);
  const [accountUser, setAccountUser] = useState(null);   // full-page partner statement (Haji/Alim)
  const [taskDetailId, setTaskDetailId] = useState(null); // full-page task detail
  const [config, setConfig] = useState(null);             // app_config (T&C body + version)
  const [locks, setLocks] = useState([]);                 // locked financial periods ('YYYY-MM')
  const [navOrder, setNavOrder] = useState(() => { try { return JSON.parse(localStorage.getItem("allbee_navorder") || "null") || []; } catch { return []; } });
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("allbee_favs") || "null") || []; } catch { return []; } });
  const dragNavRef = useRef(null);

  const currentUser = profile?.name || null;
  const role = profile?.role;
  const isSuper = isSuperRole(role);
  const isAdmin = isAdminRole(role);        // management level (superadmin OR admin)
  const canFinance = canFinanceRole(role);  // the money (superadmin OR accountant)
  const me = { id: session?.user?.id, name: currentUser, role };

  // ── auth session ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── load my profile + the team + config, with live updates ────────────
  const loadPeople = useCallback(async (user) => {
    try {
      await ensureProfile(user);
      const [list, cfg, lk] = await Promise.all([fetchTeam(), fetchConfig(), fetchLocks()]);
      setTeam(list);
      setConfig(cfg);
      setLocks(lk);
      setProfile(list.find((p) => p.id === user.id) || null);
    } catch (e) { setSyncError(e.message || String(e)); setProfile(null); }
  }, []);

  useEffect(() => {
    if (!session) { setProfile(undefined); setTeam([]); setConfig(null); setLocks([]); return; }
    loadPeople(session.user);
    const ch = supabase.channel("allbee-people")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadPeople(session.user))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_config" }, () => loadPeople(session.user))
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_locks" }, async () => setLocks(await fetchLocks()));
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

  // If an admin changes my role or the modules I'm granted while I'm signed in,
  // my row-level access changes — so refetch everything under the new permissions
  // (otherwise a freshly-granted module would show up empty until a refresh).
  const accessKey = `${profile?.role || ""}|${JSON.stringify(profile?.perms?.modules || [])}`;
  const accessKeyRef = useRef(accessKey);
  useEffect(() => {
    if (accessKeyRef.current !== accessKey) {
      accessKeyRef.current = accessKey;
      if (session && db) reload();
    }
  }, [accessKey, session, db, reload]);

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
      { action: opts.audit || `deleted ${module.toLowerCase()} "${name}"`, module }
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
    }, { action: `restored ${rec.module.toLowerCase()} "${rec.name}"`, module: rec.module });
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

  // first-login profile completion + T&C acceptance (both write to my own row)
  const saveMyProfile = useCallback((patch) => changeProfile(me.id, patch), [changeProfile, me.id]);
  const acceptTnc = useCallback((v) => changeProfile(me.id, { tnc_version: v }), [changeProfile, me.id]);
  // publish/edit the Terms (admins): bump the version so everyone re-accepts
  const saveTnc = useCallback(async (body) => {
    const next = Number(config?.tnc_version || 0) + 1;
    await saveConfig({ tnc_body: body, tnc_version: next });
    if (session) setConfig(await fetchConfig());
  }, [config, session]);
  const saveCompany = useCallback(async (obj) => {
    await saveConfig({ company: JSON.stringify(obj || {}) });
    if (session) setConfig(await fetchConfig());
  }, [session]);

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

  // Presence heartbeat: mark me active so teammates see an "online" dot.
  useEffect(() => {
    if (!session || !me.id) return;
    const beat = () => { if (typeof document !== "undefined" && document.visibilityState === "hidden") return; supabase.from("profiles").update({ last_active: new Date().toISOString() }).eq("id", me.id).then(() => {}, () => {}); };
    beat();
    const t = setInterval(beat, 60000);
    return () => clearInterval(t);
  }, [session, me.id]);

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

  const saveTask = async (task, fromConcept) => {
    const isUpdate = task.id && db.tasks.some((t) => t.id === task.id);
    let t = task;
    if (!isUpdate && t.num == null) {
      const n = await nextTaskNumber();        // global counter — numbers are never reused
      if (n != null) t = { ...t, num: n };
    }
    mutate((d) => {
      let next = { ...d };
      if (isUpdate) next.tasks = d.tasks.map((x) => x.id === t.id ? t : x);
      else next.tasks = [...d.tasks, t];
      if (fromConcept) next.concepts = d.concepts.filter((c) => c.id !== fromConcept);
      return next;
    }, { action: `${isUpdate ? "updated" : "created"} task "${t.title}"${!isUpdate && t.num ? ` (#${t.num})` : ""}`, module: "Tasks" });
  };

  const saveGeneric = (coll, item, label) => {
    let toSave = item;
    // staff-created projects need an admin's approval before they count as active
    if (coll === "projects" && !db.projects.some((x) => x.id === item.id)) {
      toSave = { ...item, approvalStatus: isAdmin ? "approved" : "pending", createdById: me.id, ownerName: currentUser };
    }
    mutate((d) => ({ ...d, [coll]: d[coll].some((x) => x.id === toSave.id) ? d[coll].map((x) => x.id === toSave.id ? toSave : x) : [...d[coll], toSave] }),
      { action: `${db[coll].some((x) => x.id === item.id) ? "updated" : "added"} ${label}${coll === "projects" && !isAdmin && !db.projects.some((x) => x.id === item.id) ? " (awaiting approval)" : ""}`, module: label === "project" ? "Projects" : label === "student" ? "Courses" : label === "marketing client" ? "Marketing" : "Concepts" });
  };

  // CRM / collaboration / finance rows: stamp the owner + author on first save.
  const saveOwned = (coll, item) => {
    const isUpdate = db[coll].some((x) => x.id === item.id);
    const row = isUpdate ? item : { ...item, ownerId: me.id, owner: currentUser, by: currentUser };
    mutate((d) => ({ ...d, [coll]: isUpdate ? d[coll].map((x) => x.id === item.id ? row : x) : [...d[coll], row] }),
      { action: `${isUpdate ? "updated" : "added"} ${MODULE_LABEL[coll] || coll}`, module: MODULE_LABEL[coll] || coll });
    setModal(null);
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
  // new staff & client sign-ups wait for a partner to approve them
  if (profile && (role === "staff" || role === "client") && profile.approved === false)
    return <ApprovalPending isDark={isDark} name={currentUser} onSignOut={signOut} />;
  // portal clients get their own surface and skip the internal profile/T&C gates
  if (role === "client") {
    if (loading || !db) return <Loading note="Loading your portal…" />;
    return <ClientPortal db={db} profile={profile} signOut={signOut} isDark={isDark} />;
  }
  // first login: require the core profile details before anything else
  if (profile && (!profile.mobile || !profile.dob))
    return <ProfileSetup profile={profile} onSave={saveMyProfile} onSignOut={signOut} isDark={isDark} />;
  // then the Terms gate for accountants / staff / interns until they accept the
  // current published version
  const tncVersion = Number(config?.tnc_version || 0);
  const mustAcceptTnc = tncVersion > 0 && TNC_ROLES.includes(role) && Number(profile?.tnc_version || 0) < tncVersion;
  if (profile && mustAcceptTnc)
    return <TermsGate body={config?.tnc_body || ""} version={tncVersion} onAccept={acceptTnc} onSignOut={signOut} isDark={isDark} />;
  if (loading || !db) return <Loading />;

  const teamNames = team.length ? team.map((p) => p.name) : USERS;
  const visibleNav = NAV.filter((n) => navAllowed(n[3], role, profile?.perms || {}));
  const allowedRoutes = new Set(visibleNav.map((n) => n[0]));
  const safeRoute = allowedRoutes.has(route) ? route : "dashboard";
  const detailTask = taskDetailId ? db.tasks.find((t) => t.id === taskDetailId) : null;
  const routeTitle =
    accountUser && canFinance ? `${accountUser} — account` :
    taskDetailId ? (detailTask ? detailTask.title : "Task") :
    NAV.find((n) => n[0] === safeRoute)?.[1] || "";
  const myPending = db.tasks.filter((t) => t.status !== "Completed" && (isAdmin || t.assignedTo === currentUser)).length;
  const pendingLeave = isAdmin ? db.leave.filter((l) => l.status === "Pending").length : 0;
  const unreadNotifs = db.notifications.filter((n) => notifVisibleTo(n, profile) && !(n.reads || []).includes(me.id)).length;
  const portalClients = team.filter((p) => p.role === "client");
  const unseenAnn = db.announcements.filter((a) => !profile?.notif_seen_at || (a.createdAt || 0) > new Date(profile.notif_seen_at).getTime()).length;

  const renderPage = () => {
    // full-page detail views take precedence over the tab routes
    if (taskDetailId) return <TaskDetail db={db} taskId={taskDetailId} me={me} isAdmin={isAdmin} currentUser={currentUser} mutate={mutate} openModal={openModal} removeItem={removeItem} goBack={goBackDetail} />;
    if (accountUser && canFinance) return <AccountFull db={db} user={accountUser} goBack={goBackDetail} />;

    switch (safeRoute) {
      case "dashboard":
        return (role === "staff" || role === "intern")
          ? <StaffDashboard db={db} me={me} go={go} mutate={mutate} openModal={openModal} />
          : <Dashboard db={db} bal={bal} go={go} openBalance={openBalance} showMoney={canFinance} showOps={isAdmin} />;
      case "tasks": return <Tasks db={db} mutate={mutate} openModal={openModal} isAdmin={isAdmin} currentUser={currentUser} openTask={openTask} removeItem={removeItem} />;
      case "attendance": return <Attendance db={db} mutate={mutate} me={me} isAdmin={isAdmin} team={team} openModal={openModal} />;
      case "leave": return <Leave db={db} mutate={mutate} me={me} isAdmin={isAdmin} openModal={openModal} />;
      case "updates": return <Updates db={db} mutate={mutate} me={me} isAdmin={isAdmin} removeItem={removeItem} openModal={openModal} />;
      case "team": return <Team team={team} me={me} changeProfile={changeProfile} />;
      case "accounts": return <Accounts db={db} bal={bal} mutate={mutate} openModal={openModal} openBalance={openBalance} removeItem={removeItem} locks={locks} lockPeriod={lockPeriod} unlockPeriod={unlockPeriod} isSuper={isSuper} currentUser={currentUser} />;
      case "withdrawals": return <Withdrawals db={db} bal={bal} mutate={mutate} openModal={openModal} removeItem={removeItem} isSuper={isSuper} currentUser={currentUser} />;
      case "progress": return <Progress db={db} mutate={mutate} isAdmin={isAdmin} currentUser={currentUser} openTask={openTask} />;
      case "concepts": return <Concepts db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} />;
      case "courses": return <Courses db={db} mutate={mutate} openModal={openModal} openIncome={openIncome} removeItem={removeItem} canFinance={canFinance} />;
      case "marketing": return <Marketing db={db} mutate={mutate} openModal={openModal} openIncome={openIncome} removeItem={removeItem} canFinance={canFinance} />;
      case "projects": return <Projects db={db} mutate={mutate} openModal={openModal} openIncome={openIncome} removeItem={removeItem} canFinance={canFinance} isAdmin={isAdmin} me={me} />;
      case "leads": return <Leads db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} isAdmin={isAdmin} />;
      case "clients": return <Clients db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} isAdmin={isAdmin} me={me} />;
      case "quotations": return <Quotations db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} />;
      case "invoices": return <Invoices db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} portalClients={portalClients} />;
      case "portal-posts": return <PortalPosts db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} portalClients={portalClients} />;
      case "planned": return <Planned db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} openIncome={openIncome} canFinance={canFinance} />;
      case "vault": return <Vault db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} />;
      case "notifications": return <Notifications db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} isAdmin={isAdmin} me={me} profile={profile} team={team} />;
      case "announcements": return <Announcements db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} isAdmin={isAdmin} me={me} />;
      case "documents": return <Documents db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} isAdmin={isAdmin} me={me} />;
      case "knowledge": return <Knowledge db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} isAdmin={isAdmin} />;
      case "chat": return <Chat db={db} mutate={mutate} me={me} team={team} />;
      case "performance": return <Performance db={db} team={team} />;
      case "rewards": return <Rewards db={db} mutate={mutate} openModal={openModal} removeItem={removeItem} me={me} isAdmin={isAdmin} team={team} />;
      case "recently-deleted": return <RecentlyDeleted db={db} openModal={openModal} restoreItem={restoreItem} />;
      case "audit": return <AuditLog db={db} />;
      case "settings": return <Settings db={db} mutate={mutate} replaceDB={replaceDB} syncError={syncError} currentUser={currentUser} role={role} teamCount={team.length} sessionEmail={session?.user?.email} config={config} saveTnc={saveTnc} saveCompany={saveCompany} />;
      default: return null;
    }
  };

  // Sidebar: favorites pinned on top + drag-to-reorder, persisted locally.
  const persistNav = (o) => { try { localStorage.setItem("allbee_navorder", JSON.stringify(o)); } catch { /* ignore */ } };
  const persistFavs = (o) => { try { localStorage.setItem("allbee_favs", JSON.stringify(o)); } catch { /* ignore */ } };
  const toggleFav = (k) => setFavorites((prev) => { const nx = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]; persistFavs(nx); return nx; });
  const moveNav = (dragK, dropK) => {
    if (dragK === dropK) return;
    setNavOrder((prev) => {
      const base = (prev && prev.length) ? prev.slice() : NAV.map((n) => n[0]);
      if (!base.includes(dragK)) base.push(dragK);
      if (!base.includes(dropK)) base.push(dropK);
      base.splice(base.indexOf(dragK), 1);
      base.splice(base.indexOf(dropK), 0, dragK);
      persistNav(base);
      return base;
    });
  };
  const favSet = new Set(favorites);
  const navRank = (k) => { const i = (navOrder || []).indexOf(k); return i === -1 ? 1000 + NAV.findIndex((n) => n[0] === k) : i; };
  const sortedNav = visibleNav.slice().sort((a, b) => navRank(a[0]) - navRank(b[0]));
  const favNav = sortedNav.filter((n) => favSet.has(n[0]));
  const restNav = sortedNav.filter((n) => !favSet.has(n[0]));
  const navBadge = (key) => (
    <>
      {key === "tasks" && myPending > 0 && <span className="badge pri">{myPending}</span>}
      {key === "leave" && pendingLeave > 0 && <span className="badge pri">{pendingLeave}</span>}
      {key === "notifications" && unreadNotifs > 0 && <span className="badge pri">{unreadNotifs}</span>}
    </>
  );
  const renderNav = ([key, label, Icon]) => (
    <div key={key} draggable
      onDragStart={(e) => { dragNavRef.current = key; try { e.dataTransfer.effectAllowed = "move"; } catch { /* ignore */ } }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (dragNavRef.current) moveNav(dragNavRef.current, key); dragNavRef.current = null; }}
      className={"navitem" + (safeRoute === key ? " active" : "")} onClick={() => go(key)} title="Drag to reorder">
      <Icon size={18} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {navBadge(key)}
      <button onClick={(e) => { e.stopPropagation(); toggleFav(key); }} title={favSet.has(key) ? "Unpin from favorites" : "Pin to favorites"} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 2, opacity: favSet.has(key) ? 0.95 : 0.3, flex: "none", display: "flex" }}><Star size={13} fill={favSet.has(key) ? "currentColor" : "none"} /></button>
    </div>
  );

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
            {favNav.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", padding: "6px 11px 2px" }}>Favorites</div>}
            {favNav.map(renderNav)}
            {favNav.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", padding: "12px 11px 2px" }}>All modules</div>}
            {restNav.map(renderNav)}
            <div className="sidebar-foot">
              <div className="navitem" onClick={() => { const nd = !isDark; setIsDark(nd); try { localStorage.setItem("allbee_theme", nd ? "dark" : "light"); } catch { /* ignore */ } }}>{isDark ? <Sun size={18} /> : <Moon size={18} />} {isDark ? "Light mode" : "Dark mode"}</div>
            </div>
          </aside>

          <div className="main">
            <header className="topbar">
              <button className="iconbtn hamburger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu"><Menu size={18} /></button>
              <div><h2>{routeTitle}</h2><div className="topbar-sub">ALLBEE Solutions · internal</div></div>
              {canFinance && (
                <div className="company-pill">
                  <div><div className="lbl">Company balance</div><div className="val mono" style={{ color: bal.company < 0 ? "var(--neg)" : "var(--ink)" }}>{money(bal.company)}</div></div>
                </div>
              )}
              <div className="usermenu">
                <button className="iconbtn" title="Announcements" style={{ position: "relative", marginRight: 4 }}
                  onClick={() => { go("announcements"); if (me.id) changeProfile(me.id, { notif_seen_at: new Date().toISOString() }); }}>
                  <Bell size={18} />
                  {unseenAnn > 0 && <span className="badge pri" style={{ position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, padding: "0 4px", fontSize: 10, lineHeight: "16px" }}>{unseenAnn}</span>}
                </button>
                <div className="userchip" onClick={() => setUserMenu((v) => !v)}>
                  <div className="avatar" style={{ background: avatarColor(currentUser) }}>{currentUser[0]}</div>
                  <span className="userchip-name">{currentUser}</span>
                  <span className={"role-badge " + (role || "staff")}>{ROLE_LABEL[role] || "Staff"}</span>
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
        {modal?.type === "withdraw" && <WithdrawForm balances={bal} defaultUser={currentUser} onSave={(w) => mutate((d) => ({ ...d, withdrawals: [...d.withdrawals, { ...w, status: isSuper ? "approved" : "pending" }] }), { action: `recorded withdrawal of ${money(w.amount)}${isSuper ? "" : " (awaiting approval)"}`, module: "Withdrawals" })} onClose={() => setModal(null)} />}
        {modal?.type === "task" && <TaskForm initial={modal.initial} currentUser={currentUser} team={teamNames} isAdmin={isAdmin} onSave={(t) => saveTask(t, modal.fromConcept)} onClose={() => setModal(null)} />}
        {modal?.type === "leave" && <LeaveForm initial={modal.initial} me={me} onSave={(l) => mutate((d) => ({ ...d, leave: d.leave.some((x) => x.id === l.id) ? d.leave.map((x) => x.id === l.id ? l : x) : [...d.leave, l] }), { action: (db.leave.some((x) => x.id === l.id) ? "updated " : "submitted ") + l.type + " leave request", module: "Leave" })} onClose={() => setModal(null)} />}
        {modal?.type === "project" && <ProjectForm initial={modal.initial} onSave={(p) => saveGeneric("projects", p, "project")} onClose={() => setModal(null)} />}
        {modal?.type === "student" && <StudentForm initial={modal.initial} onSave={(s) => saveGeneric("students", s, "student")} onClose={() => setModal(null)} />}
        {modal?.type === "marketing" && <MarketingForm initial={modal.initial} onSave={(m) => saveGeneric("marketing", m, "marketing client")} onClose={() => setModal(null)} />}
        {modal?.type === "concept" && <ConceptForm initial={modal.initial} onSave={(c) => saveGeneric("concepts", c, "idea")} onClose={() => setModal(null)} />}
        {modal?.type === "lead" && <LeadForm initial={modal.initial} onSave={(x) => saveOwned("leads", x)} onClose={() => setModal(null)} />}
        {modal?.type === "client" && <ClientForm initial={modal.initial} existing={db.clients} onSave={(x) => { saveOwned("clients", x); }} onClose={() => setModal(null)} />}
        {modal?.type === "quotation" && <QuotationForm initial={modal.initial} clients={db.clients} portalClients={portalClients} onSave={(x) => saveOwned("quotations", x)} onClose={() => setModal(null)} />}
        {modal?.type === "invoice" && <InvoiceForm initial={modal.initial} clients={db.clients} portalClients={portalClients} onSave={(x) => saveOwned("invoices", x)} onClose={() => setModal(null)} />}
        {modal?.type === "planned" && <PlannedForm initial={modal.initial} onSave={(x) => saveOwned("planned", x)} onClose={() => setModal(null)} />}
        {modal?.type === "vault" && <VaultForm initial={modal.initial} onSave={(x) => saveOwned("vault", x)} onClose={() => setModal(null)} />}
        {modal?.type === "document" && <DocForm initial={modal.initial} onSave={(x) => saveOwned("documents", x)} onClose={() => setModal(null)} />}
        {modal?.type === "knowledge" && <KbForm initial={modal.initial} onSave={(x) => saveOwned("knowledge", x)} onClose={() => setModal(null)} />}
        {modal?.type === "reward" && <RewardForm initial={modal.initial} team={team} onSave={(x) => saveOwned("rewards", x)} onClose={() => setModal(null)} />}
        {modal?.type === "notification" && <NotificationForm initial={modal.initial} team={team} onSave={(x) => saveOwned("notifications", x)} onClose={() => setModal(null)} />}
        {modal?.type === "announcement" && <AnnouncementForm initial={modal.initial} onSave={(x) => saveOwned("announcements", x)} onClose={() => setModal(null)} />}
        {modal?.type === "portalPost" && <PortalPostForm initial={modal.initial} portalClients={portalClients} onSave={(x) => saveOwned("portal_posts", x)} onClose={() => setModal(null)} />}
        {modal?.type === "confirm" && <Confirm title={modal.title} body={modal.body} confirmLabel={modal.confirmLabel} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
        {modal?.type === "deleteConfirm" && <TypedConfirm title={modal.title} body={modal.body} note={modal.note} actionLabel={modal.actionLabel || "Delete"} icon={<Trash2 size={15} />} danger onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
        {modal?.type === "restoreConfirm" && <TypedConfirm title={modal.title} body={modal.body} note={modal.note} actionLabel={modal.actionLabel || "Restore"} icon={<RotateCcw size={15} />} danger={false} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}
        {modal?.type === "okConfirm" && <TypedConfirm title={modal.title} body={modal.body} note={modal.note} word="OK" actionLabel={modal.actionLabel || "Confirm"} icon={modal.icon} danger={false} onConfirm={modal.onConfirm} onClose={() => setModal(null)} />}

        {balanceUser && <BalanceDetail db={db} user={balanceUser} onClose={() => setBalanceUser(null)} onFull={canFinance ? openAccount : undefined} />}
      </div>
    </ErrorBoundary>
  );
}
