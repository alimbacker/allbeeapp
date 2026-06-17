-- ============================================================================
-- ALLBEE — database schema for Supabase (Postgres)  ·  v2 (roles + staff)
-- Run once: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it only creates things that don't already exist.
--
-- ROLES
--   admin  → Haji & Alim. See everything, including Share & accounts and
--            Withdrawals. Manage the team.
--   staff  → everyone else. See only Tasks, Attendance, Leave, Daily updates.
--            They CANNOT read the financial tables — enforced here, in the
--            database, not just hidden in the app.
--
-- HOW ROLES ARE ASSIGNED
--   On sign-up the app sends a name and (for owners) an admin access code.
--   A trigger gives the account the 'admin' role only if that code matches the
--   one stored in app_config; otherwise the account is 'staff'. Admins can also
--   change anyone's role later from the in-app Team screen.
-- ============================================================================

-- ── config: the admin sign-up code ─────────────────────────────────────────
create table if not exists public.app_config (
  key   text primary key,
  value text
);
-- CHANGE THIS CODE, then share it only with Haji and Alim.
insert into public.app_config (key, value)
values ('admin_signup_code', 'ALLBEE-ADMIN-2025')
on conflict (key) do nothing;

-- ── profiles: one row per user, holds their name + role ─────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default 'Member',
  email      text,
  role       text not null default 'staff' check (role in ('admin','staff')),
  active      boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── helper functions (SECURITY DEFINER avoids policy recursion) ─────────────
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.current_name()
returns text language sql security definer stable set search_path = public as $$
  select name from public.profiles where id = auth.uid();
$$;

-- ── create a profile automatically when a user signs up ─────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text := coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1));
  v_code  text := new.raw_user_meta_data->>'admin_code';
  v_admin text;
  v_role  text := 'staff';
begin
  select value into v_admin from public.app_config where key = 'admin_signup_code';
  if v_code is not null and v_admin is not null and v_code = v_admin then
    v_role := 'admin';
  end if;
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, v_role)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS for profiles ────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
-- everyone signed in can see the team (names, roles)
create policy profiles_select on public.profiles for select to authenticated using (true);
-- a user may create only their own row, and only as staff (no self-promotion)
create policy profiles_self_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'staff');
-- only admins can change roles / activate / deactivate
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- realtime for profiles
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles')
  then alter publication supabase_realtime add table public.profiles; end if;
end $$;

-- ── data tables (one JSON row per record) with role-aware security ──────────
-- helper to attach realtime
create or replace function public._allbee_realtime(tbl text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl)
  then execute format('alter publication supabase_realtime add table public.%I', tbl); end if;
end $$;

-- GROUP 1 — ADMINS ONLY (the money + the business + the audit trail)
do $$
declare t text; tbls text[] := array['transactions','withdrawals','projects','students','marketing','concepts','audit'];
begin
  foreach t in array tbls loop
    execute format('create table if not exists public.%I (id text primary key, data jsonb not null, updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_admin_all', t);
    perform public._allbee_realtime(t);
  end loop;
end $$;

-- GROUP 2 — OWNER-SCOPED (each person sees their own; admins see all)
-- attendance + daily updates
do $$
declare t text; tbls text[] := array['attendance','updates'];
begin
  foreach t in array tbls loop
    execute format('create table if not exists public.%I (id text primary key, data jsonb not null, updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format($f$create policy %I on public.%I for select to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text)$f$, t||'_sel', t);
    execute format($f$create policy %I on public.%I for insert to authenticated with check (public.is_admin() or (data->>'userId') = auth.uid()::text)$f$, t||'_ins', t);
    execute format($f$create policy %I on public.%I for update to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text) with check (public.is_admin() or (data->>'userId') = auth.uid()::text)$f$, t||'_upd', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text)$f$, t||'_del', t);
    perform public._allbee_realtime(t);
  end loop;
end $$;

-- GROUP 3 — LEAVE (staff request & cancel their own; only admins approve/reject)
create table if not exists public."leave" (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public."leave" enable row level security;
drop policy if exists leave_sel on public."leave";
drop policy if exists leave_ins on public."leave";
drop policy if exists leave_upd on public."leave";
drop policy if exists leave_del on public."leave";
create policy leave_sel on public."leave" for select to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text);
create policy leave_ins on public."leave" for insert to authenticated with check (public.is_admin() or (data->>'userId') = auth.uid()::text);
-- update is admin-only → staff cannot approve their own leave
create policy leave_upd on public."leave" for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy leave_del on public."leave" for delete to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text);
select public._allbee_realtime('leave');

-- GROUP 4 — TASKS (admins see all; staff see tasks they own or assigned)
create table if not exists public.tasks (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.tasks enable row level security;
drop policy if exists tasks_sel on public.tasks;
drop policy if exists tasks_ins on public.tasks;
drop policy if exists tasks_upd on public.tasks;
drop policy if exists tasks_del on public.tasks;
create policy tasks_sel on public.tasks for select to authenticated
  using (public.is_admin() or (data->>'assignedTo') = public.current_name() or (data->>'assignedBy') = public.current_name());
create policy tasks_ins on public.tasks for insert to authenticated
  with check (public.is_admin() or (data->>'assignedBy') = public.current_name());
create policy tasks_upd on public.tasks for update to authenticated
  using (public.is_admin() or (data->>'assignedTo') = public.current_name() or (data->>'assignedBy') = public.current_name())
  with check (public.is_admin() or (data->>'assignedTo') = public.current_name() or (data->>'assignedBy') = public.current_name());
create policy tasks_del on public.tasks for delete to authenticated
  using (public.is_admin() or (data->>'assignedBy') = public.current_name());
select public._allbee_realtime('tasks');

-- GROUP 5 — RECYCLE (recently deleted / recycle bin)
-- Anything deleted in the app moves here first instead of being destroyed.
-- A user can file (insert) and read back their own deletions; admins see and
-- manage everything. There is no UPDATE policy — recycled rows are immutable.
-- Rows are removed when an admin restores an item or when the app's 60-day
-- auto-cleanup sweep runs (admins can delete any expired row).
create table if not exists public.recycle (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.recycle enable row level security;
drop policy if exists recycle_sel on public.recycle;
drop policy if exists recycle_ins on public.recycle;
drop policy if exists recycle_del on public.recycle;
create policy recycle_sel on public.recycle for select to authenticated
  using (public.is_admin() or (data->>'deletedById') = auth.uid()::text);
create policy recycle_ins on public.recycle for insert to authenticated
  with check (public.is_admin() or (data->>'deletedById') = auth.uid()::text);
create policy recycle_del on public.recycle for delete to authenticated
  using (public.is_admin() or (data->>'deletedById') = auth.uid()::text);
select public._allbee_realtime('recycle');

-- ============================================================================
-- AFTER RUNNING THIS
--   0. Re-running on an existing database is safe — this script only adds what
--      is missing. If you are upgrading, this run creates the new `recycle`
--      table that powers the Recently deleted module.
--   1. Authentication -> Providers -> Email: turn OFF "Confirm email" for
--      instant logins (optional, but nice for an internal tool).
--   2. Haji & Alim: in the app choose "Owner / admin", pick their name, and
--      enter the admin access code above.
--   3. Everyone else: choose "Team member" and enter their name → they become
--      staff automatically.
--   4. Once all owners have signed up, you can turn OFF "Allow new users to
--      sign up" (Authentication -> Providers -> Email) so no strangers can
--      register. Add future staff by turning it back on briefly.
--   5. Need to promote/deactivate someone later? Do it in the app's Team
--      screen (admins only).
-- ============================================================================
