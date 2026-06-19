-- ============================================================================
-- ALLBEE — FIX: task saving (RLS) + restore Haji & Alim to super admin
-- Run once: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Idempotent and safe to re-run (drop-then-create / guarded).
-- ============================================================================

-- ── 1) TASKS — let the ASSIGNEE save their own Accept / Start / Complete ─────
-- The app persists every task change with upsert (INSERT ... ON CONFLICT), so
-- Postgres enforces the INSERT "WITH CHECK" even when it's really an update.
-- The old policy allowed only an admin or the task's CREATOR (assignedBy) to
-- write, so a staff/intern ASSIGNEE could never save a status change on a task
-- somebody else created. That is the exact cause of:
--     "new row violates row-level security policy for table tasks"
-- Adding the assignee (assignedTo) to the check fixes it. SELECT and DELETE are
-- left as they were (delete stays admin/creator only).
drop policy if exists tasks_ins on public.tasks;
create policy tasks_ins on public.tasks for insert to authenticated
  with check (
    public.is_admin()
    or (data->>'assignedBy') = public.current_name()
    or (data->>'assignedTo') = public.current_name()
  );

drop policy if exists tasks_upd on public.tasks;
create policy tasks_upd on public.tasks for update to authenticated
  using (
    public.is_admin()
    or (data->>'assignedTo') = public.current_name()
    or (data->>'assignedBy') = public.current_name()
  )
  with check (
    public.is_admin()
    or (data->>'assignedTo') = public.current_name()
    or (data->>'assignedBy') = public.current_name()
  );

-- ── 2) ROLES — Haji & Alim are PERMANENT super admins ───────────────────────
-- The profiles_guard trigger blocks role changes from anyone who isn't already
-- a super admin (and the SQL editor has no auth.uid(), so it counts as "not
-- admin" and the change is silently reverted). We lift the guard for this one
-- statement, restore the two partners, then put the guard straight back.
--
-- VERIFY FIRST — run this and confirm these are the right two rows:
--     select id, name, email, role, status from public.profiles
--     where lower(name) in ('haji','alim');
-- If their profile names are NOT literally "Haji"/"Alim", match by email
-- instead, e.g.  where email in ('haji@allbee...','alim@allbee...').

alter table public.profiles disable trigger profiles_guard_trg;
update public.profiles
   set role = 'superadmin', active = true, status = 'active'
 where lower(name) in ('haji', 'alim');     -- ← adjust to email if names differ
alter table public.profiles enable trigger profiles_guard_trg;

-- ── confirm the result ──────────────────────────────────────────────────────
select name, role, status, active
from public.profiles
where lower(name) in ('haji', 'alim')
order by name;
