-- ============================================================================
-- ALLBEE — database schema for Supabase (Postgres)  ·  v3 (5 roles + access)
-- Run once: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run AND safe to run on top of a v2 install — every change is
-- guarded (create-if-not-exists / add-column-if-not-exists / drop-then-create),
-- so upgrading never destroys data.
--
-- ROLES (Phase 3 — five levels)
--   superadmin  → Haji & Alim. Everything: Share & accounts, Withdrawals,
--                 unlock financial periods, the team, every module. PERMANENT —
--                 only the admin sign-up code creates this role, and only Haji
--                 or Alim ever hold it.
--   admin       → trusted managers. Run the team, projects, attendance, leave,
--                 daily updates, the audit log and settings, and APPROVE staff
--                 work. They do NOT see the partner money (that is the two
--                 partners' personal split) — enforced here, not just hidden.
--   accountant  → finance only. Share & accounts and Withdrawals. No tasks,
--                 attendance, leave, projects, etc.
--   staff       → personal screens (tasks, attendance, leave, daily updates)
--                 plus any business modules an admin grants them one by one.
--   intern      → tasks, attendance and daily updates only.
--
-- WHO SEES THE MONEY
--   transactions + withdrawals  → can_finance()  = superadmin OR accountant
--   projects/students/marketing/concepts → can_module(<key>) = admin, or a
--                 staff member that an admin has granted that specific module
--   audit                       → readable by admins (super + admin)
-- ============================================================================

-- ── config: admin sign-up code + the live Terms & Conditions ────────────────
create table if not exists public.app_config (
  key   text primary key,
  value text
);
-- CHANGE THIS CODE, then share it only with Haji and Alim.
insert into public.app_config (key, value)
values ('admin_signup_code', 'ALLBEE-ADMIN-2025')
on conflict (key) do nothing;
-- Terms & Conditions live here too. Version 0 = nothing published yet (no gate).
-- Publishing/editing T&C from the app bumps the version, which forces every
-- accountant / staff / intern to re-accept before they can continue.
insert into public.app_config (key, value) values ('tnc_version', '0') on conflict (key) do nothing;
insert into public.app_config (key, value) values ('tnc_body', '')    on conflict (key) do nothing;

-- ── profiles: one row per user — identity, role, lifecycle, module grants ───
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'Member',
  email       text,
  role        text not null default 'staff',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- New in v3 (added here so upgrading an existing install picks them up):
alter table public.profiles add column if not exists status      text  not null default 'active';
alter table public.profiles add column if not exists mobile      text;
alter table public.profiles add column if not exists dob         date;
alter table public.profiles add column if not exists photo_url   text;
alter table public.profiles add column if not exists perms       jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists tnc_version int   not null default 0;

-- Role + lifecycle value checks (drop-then-add so they update cleanly on upgrade
-- from the old two-role check).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add  constraint profiles_role_check
  check (role in ('superadmin','admin','accountant','staff','intern'));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add  constraint profiles_status_check
  check (status in ('active','on_leave','suspended','resigned','terminated'));

-- ── helper functions (SECURITY DEFINER avoids policy recursion) ─────────────
-- Defined BEFORE any policy that calls them.
create or replace function public.is_superadmin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin' and active);
$$;

-- "admin" = management level = superadmin OR admin.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('superadmin','admin') and active);
$$;

-- who may touch the money: the two partners (superadmin) or an accountant.
create or replace function public.can_finance()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('superadmin','accountant') and active);
$$;

-- who may touch a given business module: any admin, or a staff member that an
-- admin has granted that module (perms.modules is a JSON array of module keys).
create or replace function public.can_module(mod text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and ( p.role in ('superadmin','admin')
            or (p.role = 'staff' and jsonb_exists(coalesce(p.perms->'modules','[]'::jsonb), mod)) )
  );
$$;

create or replace function public.current_name()
returns text language sql security definer stable set search_path = public as $$
  select name from public.profiles where id = auth.uid();
$$;

-- Field-level guard on profile updates. The RLS policy lets a person edit their
-- OWN row (needed for first-login details + accepting the Terms); this trigger
-- makes sure a non-admin can change only their personal fields, never their own
-- role / status / active flag / module grants — and that a partner's row can't
-- be touched or a new partner minted by anyone who isn't already a partner.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_admin boolean := public.is_admin();
  caller_super boolean := public.is_superadmin();
begin
  if old.role = 'superadmin' and not caller_super then
    return old;  -- a partner's row is untouchable except by a partner
  end if;
  if not caller_admin then
    new.role := old.role; new.active := old.active; new.status := old.status; new.perms := old.perms;
  end if;
  if new.role = 'superadmin' and old.role <> 'superadmin' and not caller_super then
    new.role := old.role;  -- only a partner can promote someone to partner
  end if;
  return new;
end $$;

-- ── create a profile automatically when a user signs up ─────────────────────
-- Haji/Alim sign up with the admin code → 'superadmin'. Everyone else → 'staff'
-- (an admin refines the role afterwards from the Team screen).
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
    v_role := 'superadmin';
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

-- ── one-time migration for installs upgrading from v2 (two roles) ───────────
-- The old system only ever made Haji & Alim 'admin'. Promote them to the new
-- 'superadmin' so they keep full access (including the money). The guard means
-- this fires only on the first v3 run (when no superadmin exists yet) — so
-- re-running the script later never clobbers legitimately-created admins.
update public.profiles set role = 'superadmin'
  where role = 'admin'
    and not exists (select 1 from public.profiles where role = 'superadmin');
-- A previously-deactivated person reads as 'suspended' under the new lifecycle
-- (active stays the source of truth for "can sign in").
update public.profiles set status = 'suspended' where active = false and status = 'active';

-- ── lock app_config down (now that is_admin() exists) ───────────────────────
-- Previously app_config had NO row-level security, so the admin sign-up code was
-- readable by any signed-in client. Now: anyone signed in can read only the
-- tnc_* keys (they need the agreement text); the admin code is admin-only; and
-- only admins can change anything. The sign-up trigger reads the code via
-- SECURITY DEFINER, so it keeps working.
alter table public.app_config enable row level security;
drop policy if exists app_config_read_tnc on public.app_config;
drop policy if exists app_config_admin_all on public.app_config;
create policy app_config_read_tnc on public.app_config for select to authenticated using (key like 'tnc_%');
create policy app_config_admin_all on public.app_config for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── RLS for profiles ────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists profiles_select       on public.profiles;
drop policy if exists profiles_self_insert   on public.profiles;
drop policy if exists profiles_admin_update   on public.profiles;
drop policy if exists profiles_update         on public.profiles;
-- everyone signed in can see the team (names, roles) — needed to assign work
create policy profiles_select on public.profiles for select to authenticated using (true);
-- a user may create only their own row, and only as staff (no self-promotion)
create policy profiles_self_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'staff');
-- admins manage anyone; everyone may edit their OWN row. The profiles_guard
-- trigger above enforces what each of those edits is actually allowed to change.
create policy profiles_update on public.profiles for update to authenticated
  using      (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

-- realtime for profiles + config (so role / lifecycle / T&C changes propagate live)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles')
  then alter publication supabase_realtime add table public.profiles; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='app_config')
  then alter publication supabase_realtime add table public.app_config; end if;
end $$;

-- ── data tables (one JSON row per record) with role-aware security ──────────
create or replace function public._allbee_realtime(tbl text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl)
  then execute format('alter publication supabase_realtime add table public.%I', tbl); end if;
end $$;

-- helper to (re)create a single all-or-nothing policy gated by a boolean expr
create or replace function public._allbee_table(tbl text, gate text)
returns void language plpgsql as $$
begin
  execute format('create table if not exists public.%I (id text primary key, data jsonb not null, updated_at timestamptz not null default now())', tbl);
  execute format('alter table public.%I enable row level security', tbl);
  -- drop BOTH the legacy v2 catch-all (gated by is_admin) and the v3 name, so an
  -- upgrade can't leave the old admin-wide policy in place alongside the new one.
  execute format('drop policy if exists %I on public.%I', tbl||'_admin_all', tbl);
  execute format('drop policy if exists %I on public.%I', tbl||'_all', tbl);
  execute format('create policy %I on public.%I for all to authenticated using (%s) with check (%s)', tbl||'_all', tbl, gate, gate);
  perform public._allbee_realtime(tbl);
end $$;

-- GROUP 1a — THE MONEY (superadmin + accountant only)
select public._allbee_table('transactions', 'public.can_finance()');
select public._allbee_table('withdrawals',  'public.can_finance()');

-- GROUP 1b — BUSINESS MODULES (admins, plus any staff granted that module)
select public._allbee_table('projects',  'public.can_module(''projects'')');
select public._allbee_table('students',  'public.can_module(''courses'')');
select public._allbee_table('marketing', 'public.can_module(''marketing'')');
select public._allbee_table('concepts',  'public.can_module(''concepts'')');

-- GROUP 1c — PASSWORD VAULT (superadmin only for now; per-person grants land
-- with the vault UI in the next phase). Created here so it's ready.
select public._allbee_table('vault', 'public.is_superadmin()');

-- AUDIT — readable by admins, append-only for any signed-in actor, content
-- never updatable. (A delete policy is kept so a superadmin's backup-restore
-- still works; the UI exposes no way to delete log rows. Fully tamper-proof
-- audit — blocking even restore — is part of the later audit-hardening pass.)
create table if not exists public.audit (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.audit enable row level security;
drop policy if exists audit_admin_all on public.audit;  -- remove old v2 catch-all
drop policy if exists audit_sel on public.audit;
drop policy if exists audit_ins on public.audit;
drop policy if exists audit_del on public.audit;
create policy audit_sel on public.audit for select to authenticated using (public.is_admin());
create policy audit_ins on public.audit for insert to authenticated with check (true);
create policy audit_del on public.audit for delete to authenticated using (public.is_admin());
select public._allbee_realtime('audit');

-- GROUP 2 — OWNER-SCOPED (each person sees their own; admins see all)
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
create policy leave_upd on public."leave" for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy leave_del on public."leave" for delete to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text);
select public._allbee_realtime('leave');

-- GROUP 4 — TASKS (admins see all; staff/intern see tasks they own or assigned)
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

-- GROUP 5 — RECYCLE (recently deleted). File & read back your own deletions;
-- admins see and manage everything. No UPDATE policy → recycled rows are frozen.
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
-- PHASE 2–6 — money hardening, CRM, collaboration, client portal, insight
-- Everything below is additive and guarded; safe to run on top of Phase 1.
-- ============================================================================

-- profiles: notifications "last seen" marker + allow the client-portal role
alter table public.profiles add column if not exists notif_seen_at timestamptz;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add  constraint profiles_role_check
  check (role in ('superadmin','admin','accountant','staff','intern','client'));

create or replace function public.is_client()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'client');
$$;

-- sign-up: mint a 'client' when the portal sign-up asks for it (admin code still
-- wins → superadmin). Re-defined here so the role logic stays in one place.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text := coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1));
  v_code   text := new.raw_user_meta_data->>'admin_code';
  v_intent text := new.raw_user_meta_data->>'role_intent';
  v_admin  text;
  v_role   text := 'staff';
begin
  select value into v_admin from public.app_config where key = 'admin_signup_code';
  if v_code is not null and v_admin is not null and v_code = v_admin then
    v_role := 'superadmin';
  elsif v_intent = 'client' then
    v_role := 'client';
  end if;
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, v_role)
  on conflict (id) do nothing;
  return new;
end $$;

-- a portal client must see only their own profile row, never the team roster
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_client());

-- ── GLOBAL TASK NUMBERING (monotonic, never reused) ─────────────────────────
insert into public.app_config (key, value) values ('task_counter','0') on conflict (key) do nothing;
create or replace function public.next_task_number()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.app_config set value = ((coalesce(value,'0'))::int + 1)::text
    where key = 'task_counter' returning value::int into n;
  if n is null then
    insert into public.app_config(key,value) values ('task_counter','1')
      on conflict (key) do update set value = ((coalesce(public.app_config.value,'0'))::int + 1)::text
      returning value::int into n;
  end if;
  return n;
end $$;
grant execute on function public.next_task_number() to authenticated;

-- ── FINANCIAL PERIOD LOCKING ────────────────────────────────────────────────
create table if not exists public.fin_locks (
  period     text primary key,           -- 'YYYY-MM'
  locked_by  text,
  locked_at  timestamptz not null default now()
);
alter table public.fin_locks enable row level security;
drop policy if exists fin_locks_sel on public.fin_locks;
drop policy if exists fin_locks_super on public.fin_locks;
create policy fin_locks_sel on public.fin_locks for select to authenticated using (not public.is_client());
create policy fin_locks_super on public.fin_locks for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
select public._allbee_realtime('fin_locks');

create or replace function public.is_period_locked(d date)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.fin_locks where period = to_char(d,'YYYY-MM'));
$$;

-- block writes to a locked month for everyone except a partner (superadmin)
create or replace function public.fin_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; d date;
begin
  if tg_op = 'DELETE' then r := old.data; else r := new.data; end if;
  if not public.is_superadmin() then
    d := nullif(r->>'date','')::date;
    if d is not null and public.is_period_locked(d) then
      raise exception 'This month is locked. Ask a partner to unlock % before changing it.', to_char(d,'YYYY-MM');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists fin_lock_txn on public.transactions;
create trigger fin_lock_txn before insert or update or delete on public.transactions
  for each row execute function public.fin_lock_guard();
drop trigger if exists fin_lock_wd on public.withdrawals;
create trigger fin_lock_wd before insert or update or delete on public.withdrawals
  for each row execute function public.fin_lock_guard();

-- ── FINANCE: planned & recurring expenses (finance roles only) ──────────────
select public._allbee_table('planned', 'public.can_finance()');

-- ── CRM: leads / clients / quotations ───────────────────────────────────────
-- admins see all; a staff member granted the module sees only the rows they own.
select public._allbee_table('leads',      'public.is_admin() or (public.can_module(''leads'') and (data->>''ownerId'') = auth.uid()::text)');
select public._allbee_table('clients',    'public.is_admin() or (public.can_module(''clients'') and (data->>''ownerId'') = auth.uid()::text)');
select public._allbee_table('quotations', 'public.is_admin() or (public.can_module(''clients'') and (data->>''ownerId'') = auth.uid()::text)');
-- a portal client may additionally read quotations addressed to them
drop policy if exists quotations_client_sel on public.quotations;
create policy quotations_client_sel on public.quotations for select to authenticated
  using ((data->>'clientId') = auth.uid()::text);

-- ── COLLABORATION: announcements / documents / knowledge (admins write, team reads) ──
do $$
declare t text; tbls text[] := array['announcements','documents','knowledge'];
begin
  foreach t in array tbls loop
    execute format('create table if not exists public.%I (id text primary key, data jsonb not null, updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_wr', t);
    execute format('create policy %I on public.%I for select to authenticated using (not public.is_client())', t||'_sel', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_wr', t);
    perform public._allbee_realtime(t);
  end loop;
end $$;

-- ── COLLABORATION: internal team chat (everyone internal; post as yourself) ──
create table if not exists public.chat (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.chat enable row level security;
drop policy if exists chat_sel on public.chat;
drop policy if exists chat_ins on public.chat;
drop policy if exists chat_del on public.chat;
create policy chat_sel on public.chat for select to authenticated using (not public.is_client());
create policy chat_ins on public.chat for insert to authenticated with check (not public.is_client() and (data->>'userId') = auth.uid()::text);
create policy chat_del on public.chat for delete to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text);
select public._allbee_realtime('chat');

-- ── INSIGHT: rewards / recognition (admins grant; each person sees their own) ─
create table if not exists public.rewards (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.rewards enable row level security;
drop policy if exists rewards_sel on public.rewards;
drop policy if exists rewards_wr on public.rewards;
create policy rewards_sel on public.rewards for select to authenticated using (public.is_admin() or (data->>'userId') = auth.uid()::text);
create policy rewards_wr on public.rewards for all to authenticated using (public.is_admin()) with check (public.is_admin());
select public._allbee_realtime('rewards');

-- ── CLIENT PORTAL: status posts a client sees (staff/admin write, client reads own) ──
create table if not exists public.portal_posts (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
alter table public.portal_posts enable row level security;
drop policy if exists portal_sel on public.portal_posts;
drop policy if exists portal_wr on public.portal_posts;
create policy portal_sel on public.portal_posts for select to authenticated
  using (public.is_admin() or public.can_module('clients') or (data->>'clientId') = auth.uid()::text);
create policy portal_wr on public.portal_posts for all to authenticated
  using (public.is_admin() or public.can_module('clients')) with check (public.is_admin() or public.can_module('clients'));
select public._allbee_realtime('portal_posts');

-- ============================================================================
-- AFTER RUNNING THIS
--   0. Re-running / upgrading is safe — this script only adds what's missing and
--      (on the first v3 run) promotes existing admins (Haji & Alim) to the new
--      'superadmin' role.
--   1. Authentication -> Providers -> Email: turn OFF "Confirm email" for
--      instant logins (optional, but nice for an internal tool).
--   2. Haji & Alim: in the app choose "Owner / admin", pick their name, and
--      enter the admin access code above → they become superadmins.
--   3. Everyone else: choose "Team member" → they start as staff. An admin then
--      sets each person to Admin / Accountant / Staff / Intern on the Team
--      screen, and (for staff) ticks which business modules they can open.
--   4. Once everyone's in, turn OFF "Allow new users to sign up"
--      (Authentication -> Providers -> Email). Re-enable briefly to add people.
--   5. First sign-in asks each person for mobile + date of birth, then (for
--      accountants/staff/interns) to accept the Terms & Conditions you publish
--      from Settings. Editing the T&C re-prompts everyone automatically.
-- ============================================================================
