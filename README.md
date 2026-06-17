# ALLBEE — Company Management

Internal app for **ALLBEE SOLUTIONS**. It now supports the whole team, with two
levels of access:

- **Admins — Haji & Alim.** See everything: Share & accounts, Withdrawals, the
  partner balances, plus Projects, Courses, Marketing, Concepts, the audit log,
  and the whole team's Tasks / Attendance / Leave / Daily updates. They manage
  the team.
- **Staff — everyone else.** Their own login with **Tasks** assigned to them,
  **Attendance** (check in / out), **Leave** requests, and **Daily updates**.
  Staff **cannot** see the money side — that's enforced by the database, not
  just hidden.

Everything runs on a shared [Supabase](https://supabase.com) Postgres database
and **syncs live** across the team.

---

## What's new in Phase 2

- **New logo** across the sidebar, login screen, browser tab (favicon) and the
  installable mobile-app icon, in both light and dark mode.
- **Full balance breakdown pages.** The quick balance popup stays; it now has an
  **Open full view** button that opens a dedicated page for each partner
  (`#/accounts/haji`, `#/accounts/alim`) with summary cards, a detailed
  transaction table (running balance, credited/debited, share %, notes),
  date/client/project/category **filters**, and **Export to PDF / Excel**.
- **Task assignment to both partners.** Tasks can now be assigned to **Haji**,
  **Alim**, or **Haji & Alim**.
- **Task permissions.** Only the assigned person can **Accept → Start →
  Complete**. The creator (and admins) can view, edit, delete and *monitor*, but
  cannot move someone else's task through its status.
- **Undo a completed task.** The Completed tab has an **Undo** button that sends a
  task back to *In Progress* — and records it in the audit log.
- **Task detail page.** Click a task title to open `#/tasks/<id>` with its full
  description, people, due date, priority, an **activity timeline**, **attachments**
  (links) and **comments**.
- **Safe delete everywhere.** Deleting anything (tasks, projects, courses,
  students, marketing, concepts, account entries, withdrawals) now asks you to
  type **CONFIRM** first — no more single-click deletes.
- **Recently deleted (recycle bin).** Deleted items move here first instead of
  being destroyed. Admins can **Restore** any item (also CONFIRM-gated), see who
  deleted it and when, and expand the original details. There is **no
  permanent-delete** button anywhere.
- **60-day auto-cleanup.** Items in Recently deleted are removed automatically 60
  days after deletion (see the note under *Project structure* about the optional
  server-side cron).
- **Richer audit log.** Deletes, restores, task undos, share-percentage changes
  and balance/project edits are all recorded permanently.

> **Upgrading an existing install?** Just re-run `supabase/schema.sql` in the
> Supabase SQL Editor (it only adds what's missing) — this creates the new
> `recycle` table that powers Recently deleted. Then `npm install` to pull in the
> PDF/Excel export libraries, and redeploy.

---

## What you need
- A free [Supabase](https://supabase.com) account.
- [Node.js](https://nodejs.org) 18+.
- ~15 minutes.

---

## Setup

### 1. Create the Supabase project
[supabase.com](https://supabase.com) → **New project**. Pick a database
password and the region closest to you (Mumbai / `ap-south-1` for India).

### 2. Create the database
Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and **Run**.
This creates every table, the roles system, and the security rules. While you're
there, **change the admin code**: the file sets it to `ALLBEE-ADMIN-2025` — edit
that line before running, or update it later in the `app_config` table. Share
this code only with Haji and Alim.

### 3. Connect the app
In Supabase: **Project Settings → API**, copy the **Project URL** and **anon
public** key. Then:
```bash
cp .env.example .env
```
Put the two values in `.env`:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. (Recommended) Make login instant
**Authentication → Providers → Email →** turn **Confirm email OFF**. Now a new
account works immediately, no email step.

### 5. Run it
```bash
npm install
npm run dev
```
Open the printed URL (usually `http://localhost:5173`).

---

## Accounts & roles

### The two admins (Haji & Alim)
On the login screen choose **Create an account → Owner / admin**, pick **Haji**
or **Alim**, enter the **admin access code**, and set an email + password. The
account becomes an **admin** automatically.

> Why Haji/Alim specifically? The profit split (Share & accounts, Withdrawals)
> is always between the two partners Haji and Alim. Picking which one you are
> keeps those figures correct.

### Staff
Staff choose **Create an account → Team member**, type their name, and set an
email + password. They become **staff** automatically and see only their four
screens. No code needed.

### Managing the team
Admins get a **Team** screen: change anyone between Staff and Admin, and
deactivate or reactivate accounts. A deactivated person can't sign in until an
admin switches them back on.

### Lock out strangers
Once everyone's in, go to **Authentication → Providers → Email** and turn **OFF
"Allow new users to sign up"**. Turn it back on briefly whenever you add new
staff.

---

## What each role can do

| Area | Admin (Haji, Alim) | Staff |
| --- | --- | --- |
| Dashboard | Company overview | Personal: today's status, my tasks, quick actions |
| Tasks | All tasks, assign to anyone | Only tasks assigned to / by them |
| Attendance | Daily roster for everyone | Their own check in / out + history |
| Leave | Approve / reject, see all | Request, track, cancel their own |
| Daily updates | Whole team's feed | Post + see their own |
| Team | Manage roles & access | — |
| Share & accounts, Withdrawals | Full access | **No access (DB-enforced)** |
| Projects, Courses, Marketing, Concepts, Passwords, Recently deleted, Audit log, Settings | Full access | — |

---

## Put it online
Push to a private GitHub repo and import it in [Vercel](https://vercel.com) or
Netlify. Add the same two environment variables (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`). Build command `npm run build`, output `dist` (both
auto-detected). You get a URL the whole team can open on phone or laptop; add it
to the home screen for an app-like shortcut.

---

## Optional add-ons

### File attachments
Task detail pages already support **link attachments** (paste a Drive/Dropbox/etc
URL). For **direct file uploads**, Supabase has built-in storage: create a
**Storage** bucket named `attachments`, add a policy for authenticated
read/write, then upload with
`supabase.storage.from('attachments').upload(path, file)` and store the returned
path on the record. Ask and I'll wire real uploads into the task / project /
expense forms.

### Installable Android app
Wrap the same build with [Capacitor](https://capacitorjs.com) — no rewrite:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init ALLBEE in.allbee.app --web-dir=dist
npm run build && npx cap add android && npx cap sync
npx cap open android
```
Login and data are server-backed, so the Android app shares the same accounts
and database as the web app.

---

## Backup & restore
Admins get **Settings → Backup & restore**: **Export** downloads the whole
database as a dated JSON file; **Import** replaces it from a backup. Supabase
also keeps its own automatic daily backups.

## Import from Excel / Google Sheets
**Settings → Import from Excel / Google Sheets** brings in existing records —
income, expenses, withdrawals, projects, students, marketing clients, ideas, or
tasks — from a spreadsheet. Pick what you're importing, optionally **Download a
template** so your columns line up, then upload an `.xlsx` or `.csv` file (from
Google Sheets use **File → Download**). Columns are matched to fields by header
name (order doesn't matter, extra columns are ignored), you get a preview of what
will be added, and imported rows are **appended** — they never overwrite existing
data. Like the export feature, the spreadsheet engine loads from a CDN on demand.

## Notifications
A bell in the top bar shows a live feed of activity that involves you — a task
assigned to you, a task you're part of moving to a new stage, or a new comment —
with an unread count. Opening the bell clears the count; clicking an item jumps
straight to that task. The feed is built from synced task data, so it works on
every device and for both admins and staff.

## Mobile
The whole app is responsive: the sidebar collapses into a hamburger menu, cards
and summaries reflow to fit narrow screens, and the top bar condenses so it stays
usable on a phone. Add the site to your home screen (it ships a web manifest and
icons) for an app-like shortcut.

## Passwords & logins (vault)
The **Passwords** page (admin-only, like the money pages) keeps your shared
business logins — Instagram, Facebook, the website, hosting, email, domains and
so on — in one place. Each entry holds the service name, category, username/email,
password, login URL and free-form notes (handy for recovery emails or 2FA backup
codes). Passwords are hidden behind dots with a show/hide toggle, and there are
one-tap **copy** buttons for the username and password. Deleting a credential
sends it to Recently deleted like everything else (and the recycle view never
shows the password).

> **Security note.** These credentials are stored in your own Supabase database,
> readable only by the two admin accounts (enforced by Row Level Security) and
> served over HTTPS — the same protection as your financial data. Treat your
> Supabase project login as the master key: use a strong, unique password and
> turn on 2FA for your Supabase account. If you later want true end-to-end
> encryption (a master passphrase that even the database can't read), that can be
> added — just ask.

---

## Project structure
```
allbee-app/
├─ index.html
├─ package.json
├─ vite.config.js
├─ .env.example
├─ public/                 # logo, favicon, app icons, manifest.webmanifest
├─ supabase/
│  └─ schema.sql          # run once in Supabase — tables, roles, security
└─ src/
   ├─ main.jsx
   ├─ supabaseClient.js
   └─ AllbeeApp.jsx        # the whole app (all screens + logic)
```

> **PDF / Excel export** is fetched on demand from a CDN the moment you export
> (SheetJS for Excel, jsPDF for PDF). It is *not* an npm/build dependency, so
> there's nothing extra to install and nothing extra in the bundle — exporting
> just needs an internet connection in the browser. To make it fully offline /
> self-hosted instead, say the word and I'll switch it to bundled packages.

> **60-day auto-cleanup** currently runs in the app: when an admin opens it, any
> recycle-bin item older than 60 days is permanently removed. That's enough for a
> small team. If you'd rather have it run even when nobody's logged in, add a
> Supabase **scheduled function** (pg_cron) that deletes from `recycle` where the
> stored `deletedAt` is older than 60 days — ask and I'll provide the SQL.

## How it works (for whoever maintains it)
- The database loads into memory as one object; balances and reports are
  computed from it in `AllbeeApp.jsx`.
- Each person's **role** lives in a `profiles` row. `is_admin()` in the database
  decides what they can read/write.
- Saving routes through one `mutate()` that updates the screen instantly, then
  writes only the changed rows. A realtime subscription keeps every screen in
  sync.
- Financial and business tables are restricted to admins by Row Level Security;
  attendance / leave / daily updates are scoped to their owner; tasks are scoped
  to the people involved.
