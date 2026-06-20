# ALLBEE — Phase 7 completion: what changed & how to apply

Four files:

| File | What it is |
|---|---|
| `AllbeeApp.jsx` | Your app with the remaining requirements implemented (compiles clean) |
| `allbee-phase7-migration.sql` | One idempotent migration that closes the whole server side |
| `edge-admin-users.ts` | Edge function: admin create-user / reset-password / set-designation |
| `edge-username-login.ts` | Edge function: username → email, so people can log in by username |

## Apply in this order

1. **Run the SQL** (`allbee-phase7-migration.sql`) in the Supabase SQL editor. **Do this first** — the app now logs *every* user's actions (including staff), and the migration is what lets non-admins write to the audit trail. It also creates the `notifications`/`invoices` tables, the `attachments` storage bucket, the task-number sequence, the lock trigger, and the 60-day purge job. It's safe to re-run.
2. **Deploy the app** (`AllbeeApp.jsx`) the way you normally do.
3. **Deploy the edge functions** (optional but needed for those two features):
   ```
   supabase functions deploy admin-users
   supabase functions deploy username-login --no-verify-jwt
   ```
4. **Set your company profile** in Settings → Company profile (name, logo, address, etc.).

## What's now implemented in the app

- **Password vault** logs every reveal and copy to the audit trail (the PRD's headline audit requirement).
- **Audit** now records staff actions too (task accept/start/complete/undo, deletes, restores), not just admin ones — paired with DB-level immutability in the SQL.
- **Notifications** — a real module, separate from Announcements: priority (General / Important / Urgent), targeting (Everyone / a role / one person), per-person read tracking, unread badge in the sidebar.
- **Invoices** — new module (number, client, amount, status, due date, payment) with outstanding/paid totals, plus they show in the **client portal** with payment status.
- **Company profile** — editable name / logo / address / email / phone / website in Settings.
- **Leads** — added Company, Service interested, Referred by, Lead owner; statuses renamed to **Proposal Sent / Converted**.
- **Clients** — added statuses (Prospect / Active / Inactive / Blacklisted) and staff now see only their own clients.
- **Leave** — added Emergency and a free-text "Other" type; pending count now shows as a **sidebar badge**.
- **Planned expenses** — added the approval statuses Planned / Approved / Purchased / Cancelled with inline status changes.
- **Performance** — now tracks leads generated, leads converted, attendance **hours**, daily-update consistency, plus monthly revenue — not just task counts.
- **File uploads** — real uploads to Supabase Storage with the 10/25/50 MB limits enforced; wired into Documents.
- **Chat** — read receipts ("· Seen").

## What's handled by the SQL / edge functions (not app code)

- `next_task_number` is now a true **sequence** → deleted numbers are never reused.
- Audit is **append-only** (no UPDATE/DELETE policy, even for admins).
- Locked months are enforced by a **DB trigger**, not just the UI.
- Recently-deleted items are **purged after 60 days** by a pg_cron job.
- Admin-created users, password resets, and username login run in the **edge functions** (they need the service-role key, which can't live in the browser).

## Final four (the items that were deferred — now implemented)

- **Chat file attachments** — paperclip button in the composer uploads to Storage (images show inline, other files as a download link), with the 10/25/50 MB limits enforced.
- **Online / presence status** — a 60s heartbeat marks you active; a green dot shows on online teammates in the Team roster, and "● N online" shows in the chat header. *(Needs the `last_active` column from the migration — already included.)*
- **Sidebar favorites + drag-to-reorder** — star any module to pin it to a Favorites section on top; drag items to reorder. Both persist in the browser.
- **Team admin actions** — partners get an **Add user** button (create account with email/password/role) and a **Manage** button per member (set job title / reset password). These call the two edge functions, so deploy those for the buttons to work.

## Note

This is a large, untested-at-runtime change to a live app — it compiles cleanly, but run it and send me any runtime errors and I'll turn them around fast.
