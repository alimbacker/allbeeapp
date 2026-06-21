-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — PROMPTS LIBRARY  (run once, then deploy the app)
--
--  Backs the new "Prompts" page — a shared library of the prompts your team
--  reuses. Same generic shape as the other ALLBEE tables (id / data jsonb).
--  Safe to re-run. The app tolerates this table being missing, so nothing
--  breaks if you deploy first and run this after — but saving prompts needs it.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.prompts (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.prompts enable row level security;

-- Internal team members (anyone who isn't a portal client) can read and manage
-- prompts. Clients simply get an empty list (RLS filters the rows, no error).
do $$
begin
  drop policy if exists prompts_all on public.prompts;
  -- Prefer the helper if your schema defines it…
  if exists (select 1 from pg_proc where proname = 'is_internal') then
    execute $p$
      create policy prompts_all on public.prompts
        for all to authenticated
        using (public.is_internal()) with check (public.is_internal())
    $p$;
  else
    -- …otherwise fall back to a direct role check against profiles.
    execute $p$
      create policy prompts_all on public.prompts
        for all to authenticated
        using (coalesce((select role from public.profiles where id = auth.uid()) <> 'client', false))
        with check (coalesce((select role from public.profiles where id = auth.uid()) <> 'client', false))
    $p$;
  end if;
end $$;

-- Verify (optional):
--   select policyname, cmd from pg_policies where tablename = 'prompts';
-- ════════════════════════════════════════════════════════════════════════
