-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — ROLE-BASED TERMS & CONDITIONS  (run ONCE, then deploy the app)
--
--  Adds a second layer of T&C on top of the existing general agreement:
--    • General  → app_config.tnc_body / tnc_version  (unchanged, "for all")
--    • Role     → app_config.tnc_roles  ── JSON, one entry per role:
--                 { "staff":  {"body":"…","version":2},
--                   "intern": {"body":"…","version":1},
--                   "accountant": {...}, "admin": {...} }
--
--  Every employee accepts their GENERAL terms AND their ROLE terms on sign-in.
--  Acceptance of the general one is tracked by profiles.tnc_version (already
--  there); acceptance of the role one is tracked by the new column below.
--
--  Safe to re-run. ⚠️  Run this BEFORE deploying the new app build — the app now
--  reads profiles.tnc_roles_accepted, so the column must exist first.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Per-user record of which role-T&C version each person has accepted.
--    Shape: { "<role>": <version> }, e.g. { "staff": 2 }. Defaults to empty.
alter table public.profiles
  add column if not exists tnc_roles_accepted jsonb not null default '{}'::jsonb;

-- 2. Let every signed-in user READ the public T&C keys — including the new
--    role-based key 'tnc_roles'. This is an ADDITIVE policy (Postgres RLS is
--    permissive / OR), so it never removes existing access and is safe even if
--    a tnc-read policy already exists. It does NOT expose any non-tnc/company
--    keys (e.g. the admin sign-up code stays locked down).
do $$
begin
  if to_regclass('public.app_config') is not null then
    execute 'alter table public.app_config enable row level security';
    execute 'drop policy if exists app_config_tnc_read on public.app_config';
    execute $p$
      create policy app_config_tnc_read on public.app_config
        for select to authenticated
        using (key like 'tnc_%' or key = 'company')
    $p$;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
--  Done. Now:
--   • Deploy the new app build.
--   • Go to Settings → Terms & conditions. The "Agreement" dropdown lets you
--     publish the general terms (All users) and a separate agreement per role.
--   • Publishing bumps that agreement's version; affected people are asked to
--     re-accept on their next sign-in.
--
--  Quick check:
--   select key, left(value, 60) from public.app_config where key like 'tnc_%';
--   select policyname, cmd from pg_policies where tablename = 'app_config';
-- ════════════════════════════════════════════════════════════════════════
