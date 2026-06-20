-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — Phase 7 server migration  (idempotent; safe to re-run)
--  Run this in the Supabase SQL editor BEFORE using the updated app.
--
--  Closes the server-side requirements:
--    1. Helper functions (role checks)
--    2. next_task_number() backed by a real SEQUENCE  (numbers never reused)
--    3. New tables + RLS:  notifications, invoices
--    4. Audit trail: every authenticated user may INSERT; nobody may
--       UPDATE/DELETE  (permanent + tamper-proof)
--    5. fin_locks: DB-level write-block on a locked month for non-partners
--    6. Recently-deleted: 60-day auto-purge via pg_cron
--    7. `attachments` Storage bucket + policies (chat/document uploads)
--    8. profiles: username + designation columns (for the edge functions)
--
--  NOTE: the generic tables use  (id text primary key, data jsonb,
--  updated_at timestamptz).  Adjust the id type below if yours differ.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Role helpers ──────────────────────────────────────────────────────
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'superadmin', false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('superadmin','admin'), false)
$$;

-- "internal" = any signed-in staff member (everyone who is not a portal client)
create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('superadmin','admin','accountant','staff','intern'), false)
$$;

-- ── 2. Global, never-reused task number (real sequence) ──────────────────
create sequence if not exists public.task_number_seq start 1;

-- Seed the sequence past the highest number already used, so existing data
-- keeps its numbering and the next task continues from there.
do $$
declare hi bigint;
begin
  select coalesce(max((data->>'num')::bigint), 0) into hi from public.tasks
    where (data->>'num') ~ '^[0-9]+$';
  if hi >= 0 then perform setval('public.task_number_seq', greatest(hi, 1), hi > 0); end if;
end $$;

create or replace function public.next_task_number()
returns bigint language sql volatile security definer set search_path = public as $$
  select nextval('public.task_number_seq')
$$;
grant execute on function public.next_task_number() to authenticated;

-- ── 3. New collections: notifications + invoices ─────────────────────────
create table if not exists public.notifications (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.invoices (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
alter table public.invoices       enable row level security;

-- notifications: any signed-in member can read (the app filters by audience);
-- only admins can create / change / delete.
drop policy if exists notif_select on public.notifications;
drop policy if exists notif_write  on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (public.is_internal());
create policy notif_write  on public.notifications for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- invoices: internal staff manage them; a portal CLIENT may read only the
-- invoices shared to them (data.clientId = their auth id).
drop policy if exists inv_select on public.invoices;
drop policy if exists inv_write  on public.invoices;
create policy inv_select on public.invoices for select to authenticated
  using (public.is_internal() or (data->>'clientId') = auth.uid()::text);
create policy inv_write on public.invoices for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

-- ── 4. Permanent, tamper-proof audit trail ───────────────────────────────
--  Every authenticated user may INSERT (staff actions are now logged too).
--  No UPDATE/DELETE policy exists  ⇒  rows are immutable, even for admins.
alter table public.audit enable row level security;
-- remove any pre-existing permissive policies so immutability actually holds
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='audit' loop
    execute format('drop policy if exists %I on public.audit', pol.policyname);
  end loop;
end $$;
create policy audit_insert on public.audit for insert to authenticated with check (true);
create policy audit_select on public.audit for select to authenticated using (public.is_admin());
-- (intentionally NO update/delete policies → audit is append-only)
revoke update, delete on public.audit from authenticated, anon;

-- ── 5. Financial month-lock enforcement (DB-level) ───────────────────────
--  Block any write to a transaction/withdrawal in a locked 'YYYY-MM' unless
--  the actor is a partner (superadmin).  fin_locks holds the locked periods.
create or replace function public.guard_fin_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare per text;
begin
  if public.is_superadmin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  per := substring(coalesce(
           case when tg_op = 'DELETE' then old.data->>'date' else new.data->>'date' end, ''
         ) for 7);
  if per <> '' and exists (select 1 from public.fin_locks where period = per) then
    raise exception 'Period % is locked. Only a partner can change locked-month finances.', per
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_lock_tx  on public.transactions;
drop trigger if exists trg_lock_wd  on public.withdrawals;
create trigger trg_lock_tx before insert or update or delete on public.transactions
  for each row execute function public.guard_fin_lock();
create trigger trg_lock_wd before insert or update or delete on public.withdrawals
  for each row execute function public.guard_fin_lock();

-- ── 6. Recently-deleted: 60-day auto-purge (pg_cron) ─────────────────────
create extension if not exists pg_cron;

create or replace function public.purge_recycle()
returns void language sql security definer set search_path = public as $$
  delete from public.recycle
   where coalesce((data->>'deletedAt')::bigint, 0)
         < (extract(epoch from now()) * 1000)::bigint - (60::bigint * 86400000);
$$;

-- schedule once a day at 03:15 UTC (re-running this migration re-registers it)
select cron.unschedule('allbee_purge_recycle')
  where exists (select 1 from cron.job where jobname = 'allbee_purge_recycle');
select cron.schedule('allbee_purge_recycle', '15 3 * * *', $$ select public.purge_recycle(); $$);

-- ── 7. Storage bucket for uploads (chat attachments + documents) ─────────
insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', true)
  on conflict (id) do update set public = true;

drop policy if exists "attachments read"   on storage.objects;
drop policy if exists "attachments insert" on storage.objects;
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments read"   on storage.objects for select using (bucket_id = 'attachments');
create policy "attachments insert" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "attachments delete" on storage.objects for delete to authenticated using (bucket_id = 'attachments' and public.is_internal());

-- ── 8. profiles: username + designation + presence ──────────────────────
alter table public.profiles add column if not exists username    text;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists last_active timestamptz;  -- online-status heartbeat
create unique index if not exists profiles_username_key
  on public.profiles (lower(username)) where username is not null;

-- The app heartbeats `last_active` on the signed-in user's own row every 60s.
-- This relies on your existing "a user may update their own profile" RLS
-- policy. If a profiles guard-trigger rejects the write, presence simply won't
-- light up (the app swallows the error) — no crash. To allow it explicitly,
-- make sure self-updates of last_active are permitted.

-- ════════════════════════════════════════════════════════════════════════
--  Done.  Quick checks:
--    select public.next_task_number();              -- should advance by 1 each call
--    select * from cron.job where jobname = 'allbee_purge_recycle';
--    select * from storage.buckets where id = 'attachments';
-- ════════════════════════════════════════════════════════════════════════
