ALLBEE — Company Management
Internal app for ALLBEE SOLUTIONS. It supports the whole team with five
levels of access:
Super admins — Haji & Alim. See and control everything, including the
money: Share & accounts, Withdrawals and the partner balances, plus Projects,
Courses, Marketing, Concepts, the audit log, the team and every personal
screen. This role is permanent and only ever held by the two partners.
Admins. Trusted managers who run the team, projects and approvals and read
the audit log — but not the partner money (that stays between Haji and
Alim). Enforced by the database, not just hidden.
Accountants. Finance only: Share & accounts and Withdrawals. Nothing else.
Staff. Their own Tasks, Attendance, Leave and Daily updates,
plus any business modules (Projects, Courses, Marketing, Concepts) an admin
grants them one by one.
Interns. Tasks, Attendance and Daily updates only.
Who sees the money is enforced by the database (Row Level Security), so it
can't be reached even by editing the page — not merely hidden from the menu.
Everything runs on a shared Supabase Postgres database
and syncs live across the team.
---
What's new in Phase 3 (Foundation)
This phase rebuilds who-can-do-what and adds the first-run onboarding flow.
Five roles instead of two — Super admin, Admin, Accountant, Staff, Intern
(see Accounts & roles below). The two partners become Super admins
automatically when you upgrade.
The money is split off from "admin". Share & accounts and Withdrawals are
now limited to the two partners and an Accountant. A plain Admin runs the
business but never sees the partner split.
Per-staff module access. On the Team screen, give an individual staff
member exactly the business modules they need (Projects, Courses, Marketing,
Concepts). Everything else stays personal-only for them.
Employee lifecycle. Each person has a status — Active, On leave, Suspended,
Resigned or Terminated. Suspended / Resigned / Terminated revokes access
immediately; On leave keeps it.
First-login profile. New sign-ins are asked for their mobile number and
date of birth (photo optional) before the app opens.
Terms & conditions gate. Publish your agreement from Settings;
accountants, staff and interns must read and accept it (tick the box, then type
AGREE) before continuing. Editing the terms re-prompts everyone automatically.
Tighter security. The admin sign-up code is no longer readable by the
browser, and people can edit only their own personal details — never their own
role, status or module access.
> **Upgrading an existing install?** Re-run `supabase/schema.sql` in the Supabase
> SQL Editor — it only adds what's missing, promotes your existing admins
> (Haji & Alim) to **Super admin**, and is safe to run more than once. No new npm
> packages are needed for this phase. On their next sign-in, everyone is asked to
> fill in their mobile number and date of birth.
---
What's new in Phases 4–6 (CRM, money, collaboration, portal & insight)
This batch turns the foundation into a fuller business OS. Run `supabase/schema.sql`
once more before you deploy this version — it adds the new tables and rules and
is safe to re-run.
Sales & clients (CRM)
Leads — a simple pipeline (New → Contacted → Qualified → Proposal → Won → Lost)
with source, value and notes. Move a lead along the pipeline; a Won lead can be
turned into a Client in one tap.
Clients — your client list with duplicate detection (warns when a phone or
email already exists) and a one-tap "new quotation" for that client.
Quotations — build a quote with line items (description / qty / rate), a live
total and a status (Draft → Sent → Accepted → Rejected). Optionally share a quote
to a client's portal account.
Project approvals — when a staff member creates a project it's marked
Awaiting approval; an admin approves or rejects it. Projects made by admins are
approved automatically. (Existing projects are treated as approved.)
Leads and Clients are part of the per-staff module system — grant them on the
Team screen. A staff member sees only the leads/clients they own; admins see all.
Money, hardened
Withdrawal approvals — every withdrawal is recorded as Pending and only a
partner can Approve or Reject it. Only approved withdrawals affect the
balances, so a request can't quietly move money. (A partner's own withdrawals are
approved on the spot.)
Financial period locking — a partner can lock a month from Share & accounts.
Once locked, income, expenses and withdrawals dated in that month are frozen for
everyone except the partners — enforced in the database, not just the screen.
Planned & recurring expenses — track rent, subscriptions and other regular
costs with a repeat cycle and next-due date, and log any of them as a real expense
in one tap when paid.
Password vault (now with a screen) — see below; the on-screen Passwords page is
live in this build.
Collaboration
Announcements — admins post company-wide news; everyone sees it, and a bell
in the top bar shows how many announcements you haven't read yet.
Team chat — one shared channel for the whole internal team, with live updates.
Documents — a shared library of links (contracts, templates, brand files).
Knowledge base — short how-tos, policies and onboarding articles.
Client portal (a separate sign-in surface)
A client can create their own account from the login screen (choose Client).
When they sign in they get a read-only portal — only their own project updates
and the quotations shared with them. They never see anything internal: no other
clients, no team, no money, no tasks, no chat.
Staff/admins post updates to a client from Client updates.
Insight & polish
Performance — a leaderboard scoring each member on tasks completed, days present
this month and recognition points.
Recognition & rewards — admins award points/badges; each person sees their own,
and the points feed the leaderboard.
Global task numbers — every task gets a permanent TASK #n that is never
reused, even after deletion.
Pagination on the long lists, and Indian formatting throughout (₹1,00,000 ·
19 Jun 2026).
> **What's intentionally simple (be aware):** the client portal is **read-only** (a
> client can view a quote but accepts it by replying to you, not in-app); **chat** is a
> single shared channel (no DMs/threads yet); **notifications** are the announcements
> bell rather than per-event alerts; and the **password vault** is limited to the two
> partners. None of this has been load-tested against a live Supabase yet — run the
> schema and click through with a couple of test accounts before relying on it.
---
What's new in Phase 2
New logo across the sidebar, login screen, browser tab (favicon) and the
installable mobile-app icon, in both light and dark mode.
Full balance breakdown pages. The quick balance popup stays; it now has an
Open full view button that opens a dedicated page for each partner
(`#/accounts/haji`, `#/accounts/alim`) with summary cards, a detailed
transaction table (running balance, credited/debited, share %, notes),
date/client/project/category filters, and Export to PDF / Excel.
Task assignment to both partners. Tasks can now be assigned to Haji,
Alim, or Haji & Alim.
Task permissions. Only the assigned person can Accept → Start →
Complete. The creator (and admins) can view, edit, delete and monitor, but
cannot move someone else's task through its status.
Undo a completed task. The Completed tab has an Undo button that sends a
task back to In Progress — and records it in the audit log.
Task detail page. Click a task title to open `#/tasks/<id>` with its full
description, people, due date, priority, an activity timeline, attachments
(links) and comments.
Safe delete everywhere. Deleting anything (tasks, projects, courses,
students, marketing, concepts, account entries, withdrawals) now asks you to
type CONFIRM first — no more single-click deletes.
Recently deleted (recycle bin). Deleted items move here first instead of
being destroyed. Admins can Restore any item (also CONFIRM-gated), see who
deleted it and when, and expand the original details. There is no
permanent-delete button anywhere.
60-day auto-cleanup. Items in Recently deleted are removed automatically 60
days after deletion (see the note under Project structure about the optional
server-side cron).
Richer audit log. Deletes, restores, task undos, share-percentage changes
and balance/project edits are all recorded permanently.
> **Upgrading an existing install?** Just re-run `supabase/schema.sql` in the
> Supabase SQL Editor (it only adds what's missing) — this creates the new
> `recycle` table that powers Recently deleted. Then `npm install` to pull in the
> PDF/Excel export libraries, and redeploy.
---
What you need
A free Supabase account.
Node.js 18+.
~15 minutes.
---
Setup
1. Create the Supabase project
supabase.com → New project. Pick a database
password and the region closest to you (Mumbai / `ap-south-1` for India).
2. Create the database
Open SQL Editor → New query, paste all of `supabase/schema.sql`, and Run.
This creates every table, the roles system, and the security rules. While you're
there, change the admin code: the file sets it to `ALLBEE-ADMIN-2025` — edit
that line before running, or update it later in the `app_config` table. Share
this code only with Haji and Alim.
3. Connect the app
In Supabase: Project Settings → API, copy the Project URL and anon
public key. Then:
```bash
cp .env.example .env
```
Put the two values in `.env`:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```
4. (Recommended) Make login instant
Authentication → Providers → Email → turn Confirm email OFF. Now a new
account works immediately, no email step.
5. Run it
```bash
npm install
npm run dev
```
Open the printed URL (usually `http://localhost:5173`).
---
Accounts & roles
The two partners (Haji & Alim) — Super admins
On the login screen choose Create an account → Owner / admin, pick Haji
or Alim, enter the admin access code, and set an email + password. The
account becomes a Super admin automatically.
> Why Haji/Alim specifically? The profit split (Share & accounts, Withdrawals)
> is always between the two partners. Picking which one you are keeps those
> figures correct. Super admin is permanent — only these two ever hold it.
Everyone else
Other people choose Create an account → Team member, type their name, and set
an email + password. They start as Staff with only their personal screens. No
code needed — an admin then sets each person's real role.
Managing the team
Admins (and super admins) get a Team screen to:
set anyone's role to Admin, Accountant, Staff or Intern (Super admin can't
be assigned here — it's reserved for the two partners);
set a status — Active / On leave / Suspended / Resigned / Terminated — where
the last three revoke sign-in immediately and On leave keeps access;
and, for each Staff member, tick exactly which business modules they can
open (Projects, Courses, Marketing, Concepts).
Lock out strangers
Once everyone's in, go to Authentication → Providers → Email and turn OFF
"Allow new users to sign up". Turn it back on briefly whenever you add people.
---
What each role can do
Area	Super admin (Haji, Alim)	Admin	Accountant	Staff	Intern
Dashboard	Full overview + money	Overview (no money)	Money summary	Personal	Personal
Tasks	All, assign to anyone	All, assign to anyone	—	Own tasks	Own tasks
Attendance	Everyone	Everyone	—	Own	Own
Leave	Approve / see all	Approve / see all	—	Request own	—
Daily updates	Whole team	Whole team	—	Own	Own
Share & accounts, Withdrawals	Full access	—	Full access	—	—
Projects, Courses, Marketing, Concepts	All	All	—	Only those an admin grants	—
Team	Manage everyone	Manage (not partners)	—	—	—
Recently deleted, Audit log, Settings	Full access	Full access	—	—	—
> Interns don't get the Leave screen by default — that's a one-line change if you
> want to give it to them.
---
Put it online
Push to a private GitHub repo and import it in Vercel or
Netlify. Add the same two environment variables (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`). Build command `npm run build`, output `dist` (both
auto-detected). You get a URL the whole team can open on phone or laptop; add it
to the home screen for an app-like shortcut.
---
Optional add-ons
File attachments
Task detail pages already support link attachments (paste a Drive/Dropbox/etc
URL). For direct file uploads, Supabase has built-in storage: create a
Storage bucket named `attachments`, add a policy for authenticated
read/write, then upload with
`supabase.storage.from('attachments').upload(path, file)` and store the returned
path on the record. Ask and I'll wire real uploads into the task / project /
expense forms.
Installable Android app
Wrap the same build with Capacitor — no rewrite:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init ALLBEE in.allbee.app --web-dir=dist
npm run build && npx cap add android && npx cap sync
npx cap open android
```
Login and data are server-backed, so the Android app shares the same accounts
and database as the web app.
---
Backup & restore
Admins get Settings → Backup & restore: Export downloads the whole
database as a dated JSON file; Import replaces it from a backup. Supabase
also keeps its own automatic daily backups.
Import from Excel / Google Sheets
Settings → Import from Excel / Google Sheets brings in existing records —
income, expenses, withdrawals, projects, students, marketing clients, ideas, or
tasks — from a spreadsheet. Pick what you're importing, optionally Download a
template so your columns line up, then upload an `.xlsx` or `.csv` file (from
Google Sheets use File → Download). Columns are matched to fields by header
name (order doesn't matter, extra columns are ignored), you get a preview of what
will be added, and imported rows are appended — they never overwrite existing
data. Like the export feature, the spreadsheet engine loads from a CDN on demand.
Notifications
A bell in the top bar shows how many announcements you haven't read yet.
Clicking it opens the Announcements feed and clears the count. Admins post
announcements; everyone (any internal role) sees them. The unread state is stored
per person and synced, so it follows you across devices.
Mobile
The whole app is responsive: the sidebar collapses into a hamburger menu, cards
and summaries reflow to fit narrow screens, and the top bar condenses so it stays
usable on a phone. Add the site to your home screen (it ships a web manifest and
icons) for an app-like shortcut.
Passwords & logins (vault)
The shared password store keeps your business logins — Instagram, Facebook, the
website, hosting, email, domains and so on — in one place: service name, category,
username/email, password, login URL and free-form notes (handy for recovery
emails or 2FA backup codes).
> **Status.** The on-screen **Passwords** page is **live** in this build, locked to
> the **two partners (super admins)** in both the screen and the database. You can
> add, edit, reveal, copy and delete credentials, search them, and open the login
> URL. Extending vault access to specific non-partner staff is a later step.
> **Security note.** These credentials live in your own Supabase database,
> readable only by the partner accounts (enforced by Row Level Security) and
> served over HTTPS — the same protection as your financial data. Treat your
> Supabase project login as the master key: use a strong, unique password and
> turn on 2FA for your Supabase account. If you later want true end-to-end
> encryption (a master passphrase that even the database can't read), that can be
> added — just ask.
---
Project structure
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
How it works (for whoever maintains it)
The database loads into memory as one object; balances and reports are
computed from it in `AllbeeApp.jsx`.
Each person's role lives in a `profiles` row. `is_admin()` in the database
decides what they can read/write.
Saving routes through one `mutate()` that updates the screen instantly, then
writes only the changed rows. A realtime subscription keeps every screen in
sync.
Financial and business tables are restricted to admins by Row Level Security;
attendance / leave / daily updates are scoped to their owner; tasks are scoped
to the people involved.
