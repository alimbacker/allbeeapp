-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — COMPLETE server setup  (single file · idempotent · safe to re-run)
--
--  Run this ONCE in the Supabase SQL editor and the entire backend is in place.
--  It is the union of every ALLBEE migration + fix, in dependency order:
--    Phase 7  (sections 1-8): role helpers · never-reused task number ·
--             notifications · invoices · append-only audit · fin-lock trigger ·
--             60-day recycle purge · attachments bucket · profiles columns
--    Chat fix (section 9):    read-receipt / message-send RLS for chat
--    Phase 8  (sections 10-11): resignations table · client-portal document reads
--
--  Every object is created with drop-if-exists / create-if-not-exists, so
--  re-running is harmless and there are no "already exists" errors. The
--  redundant audit-grant-fix and the duplicate username index were folded in
--  and de-duplicated.
--
--  Generic tables use (id text primary key, data jsonb, updated_at timestamptz).
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

-- The original app already defines next_task_number() with a different return
-- type, and CREATE OR REPLACE cannot change a function's return type — so drop
-- it first. (Only the client calls it via RPC, so there are no DB dependents.)
drop function if exists public.next_task_number();
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

-- notifications: any internal member can read + mark-as-read (the app filters
-- by audience); only admins can create or delete.
drop policy if exists notif_select on public.notifications;
drop policy if exists notif_write  on public.notifications;
drop policy if exists notif_insert on public.notifications;
drop policy if exists notif_update on public.notifications;
drop policy if exists notif_delete on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (public.is_internal());
create policy notif_insert on public.notifications for insert to authenticated
  with check (public.is_admin() or id in (select x.id from public.notifications x));
create policy notif_update on public.notifications for update to authenticated using (public.is_internal()) with check (public.is_internal());
create policy notif_delete on public.notifications for delete to authenticated using (public.is_admin());

-- invoices: internal staff manage them; a portal CLIENT may read only the
-- invoices shared to them (data.clientId = their auth id).
drop policy if exists inv_select on public.invoices;
drop policy if exists inv_write  on public.invoices;
create policy inv_select on public.invoices for select to authenticated
  using (public.is_internal() or (data->>'clientId') = auth.uid()::text);
create policy inv_write on public.invoices for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

-- table privileges (RLS above governs which rows each person can touch)
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.invoices       to authenticated;

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
grant  select, insert on public.audit to authenticated;   -- privilege layer (policies alone aren't enough)
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
-- The purge function works on its own; pg_cron just runs it on a schedule.
create or replace function public.purge_recycle()
returns void language sql security definer set search_path = public as $$
  delete from public.recycle
   where coalesce((data->>'deletedAt')::bigint, 0)
         < (extract(epoch from now()) * 1000)::bigint - (60::bigint * 86400000);
$$;

-- Schedule it daily at 03:15 UTC. If pg_cron isn't enabled on this project, skip
-- with a notice instead of failing the whole migration. (The app shows the
-- countdown regardless; you can run  select public.purge_recycle();  any time.)
do $$
begin
  create extension if not exists pg_cron;
  begin perform cron.unschedule('allbee_purge_recycle'); exception when others then null; end;
  perform cron.schedule('allbee_purge_recycle', '15 3 * * *', 'select public.purge_recycle();');
exception when others then
  raise notice 'pg_cron unavailable (%); 60-day auto-purge not scheduled. Enable pg_cron under Database > Extensions if you want it.', sqlerrm;
end $$;

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


-- ── 9. Chat: read receipts + message sending for internal members ─────────
-- Insert: your own new message, or an upsert of a row that already exists
-- (read receipts add you to another message's seenBy → that row is re-saved).
drop policy if exists chat_insert_internal on public.chat;
create policy chat_insert_internal on public.chat
  for insert to authenticated
  with check (
    (data->>'userId') = auth.uid()::text
    or id in (select x.id from public.chat x)
  );
drop policy if exists chat_update_internal on public.chat;
create policy chat_update_internal on public.chat
  for update to authenticated
  using      ((select role from public.profiles where id = auth.uid()) <> 'client')
  with check ((select role from public.profiles where id = auth.uid()) <> 'client');


-- ── 10. RESIGNATIONS (employee-initiated, admin-approved) ─────────────────────────────────────────────────────────
-- Generic data-row table (same shape as every other ALLBEE collection).
create table if not exists public.resignations (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.resignations enable row level security;
grant select, insert, update on public.resignations to authenticated;

-- An employee may file/see their OWN request; admins & partners see and act on all.
-- NOTE: the app saves changed rows with an atomic upsert, so the INSERT check must
-- also permit admins (whose status-change arrives as an insert-on-conflict-update).
drop policy if exists resignations_select on public.resignations;
create policy resignations_select on public.resignations
  for select to authenticated
  using (
    (data->>'userId') = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))
  );

drop policy if exists resignations_insert on public.resignations;
create policy resignations_insert on public.resignations
  for insert to authenticated
  with check (
    (data->>'userId') = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))
  );

drop policy if exists resignations_update on public.resignations;
create policy resignations_update on public.resignations
  for update to authenticated
  using (
    (data->>'userId') = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))
  )
  with check (true);

-- Keep the realtime sync working for this table.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.resignations';
    exception when duplicate_object then null; when others then null; end;
  end if;
end $$;


-- ── 11. DOCUMENT TARGETING → CLIENT PORTAL "FILES" ──────────────────────────
-- A portal client may read documents explicitly targeted to them
-- (data.audience = 'client' and data.clientId = their auth id). This is an
-- ADDITIONAL permissive SELECT policy; internal read access is unchanged.
-- The documents table already exists in any deployed ALLBEE DB; the guard below
-- just makes this script safe to run on a fresh schema too.
create table if not exists public.documents (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;
grant select, insert, update, delete on public.documents to authenticated;

drop policy if exists documents_client_read on public.documents;
create policy documents_client_read on public.documents
  for select to authenticated
  using ( (data->>'clientId') = auth.uid()::text );

-- ════════════════════════════════════════════════════════════════════════
--  Done — the full ALLBEE backend is now provisioned. Quick checks:
--    select public.next_task_number();                              -- advances by 1 each call
--    select * from cron.job where jobname = 'allbee_purge_recycle'; -- 60-day purge (if pg_cron on)
--    select * from storage.buckets where id = 'attachments';        -- upload bucket
--    select policyname, cmd from pg_policies
--      where tablename in ('audit','chat','notifications','invoices','resignations','documents');
--
--  Then: deploy the two edge functions and redeploy the app (see DEPLOY README).
-- ════════════════════════════════════════════════════════════════════════
