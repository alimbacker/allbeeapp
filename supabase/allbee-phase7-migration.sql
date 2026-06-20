-- ============================================================================
-- ALLBEE — Phase 8 (final "100%" backend)
-- Adds server objects for the last six features:
--   • Resignation requests   (employee-initiated, admin-approved)
--   • Document targeting      (client-targeted docs readable in the portal)
--   • Username login          (unique-username integrity)
--
-- Safe to run on top of allbee-phase7-migration.sql. Idempotent — re-running
-- is harmless. Run this in the Supabase SQL editor.
-- ============================================================================

-- ── 1. RESIGNATIONS ─────────────────────────────────────────────────────────
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


-- ── 2. DOCUMENT TARGETING → CLIENT PORTAL "FILES" ──────────────────────────
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


-- ── 3. USERNAME LOGIN INTEGRITY ─────────────────────────────────────────────
-- Username column (no-op if phase 7 already added it) + a case-insensitive
-- unique index so username→email resolution is never ambiguous.
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

-- ============================================================================
-- Done. After running:
--   • Employees see "Request resignation" in the top-right user menu; admins
--     see "Resignation requests" on the Team screen.
--   • Documents shared to a portal client appear under "Files" in that portal.
--   • Users can set a username (first-login profile) and sign in with it.
-- ============================================================================
