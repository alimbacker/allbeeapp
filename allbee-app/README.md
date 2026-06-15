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
| Projects, Courses, Marketing, Concepts, Audit log, Settings | Full access | — |

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
Supabase has built-in storage. Create a **Storage** bucket named `attachments`,
add a policy for authenticated read/write, then upload with
`supabase.storage.from('attachments').upload(path, file)` and store the path on
the record. Ask and I'll wire this into the task / project / expense forms.

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

---

## Project structure
```
allbee-app/
├─ index.html
├─ package.json
├─ vite.config.js
├─ .env.example
├─ supabase/
│  └─ schema.sql          # run once in Supabase — tables, roles, security
└─ src/
   ├─ main.jsx
   ├─ supabaseClient.js
   └─ AllbeeApp.jsx        # the whole app (all screens + logic)
```

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
