-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — SHEETS LINK LIBRARY  (run once, then deploy the app)
--
--  Backs the new "Sheets" page — a shared directory of your Google Sheets (and
--  any spreadsheet) links. Same generic shape as the other ALLBEE tables.
--  Safe to re-run. The app tolerates this table being missing, so nothing
--  breaks if you deploy first and run this after — but saving links needs it.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.sheets (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.sheets enable row level security;

-- Internal team members (anyone who isn't a portal client) can read and manage
-- sheet links. Clients simply get an empty list (RLS filters rows, no error).
-- Note: which staff actually SEE the page is controlled in-app by Module access
-- (Team → Edit) — this policy just lets the data load for internal users.
do $$
begin
  drop policy if exists sheets_all on public.sheets;
  if exists (select 1 from pg_proc where proname = 'is_internal') then
    execute $p$
      create policy sheets_all on public.sheets
        for all to authenticated
        using (public.is_internal()) with check (public.is_internal())
    $p$;
  else
    execute $p$
      create policy sheets_all on public.sheets
        for all to authenticated
        using (coalesce((select role from public.profiles where id = auth.uid()) <> 'client', false))
        with check (coalesce((select role from public.profiles where id = auth.uid()) <> 'client', false))
    $p$;
  end if;
end $$;

-- Verify (optional):
--   select policyname, cmd from pg_policies where tablename = 'sheets';
-- ════════════════════════════════════════════════════════════════════════
