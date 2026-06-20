-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — fix  "permission denied for table audit"
--  (and preempt the same error on the Phase-7 notifications / invoices tables)
--
--  Why: a row-level policy is not enough on its own. Postgres checks the table
--  GRANT *before* it evaluates RLS, so the authenticated role also needs INSERT
--  granted on the table. The migration added the audit INSERT *policy* but not
--  the GRANT — so writes were denied at the privilege layer.
--
--  Run this in the Supabase SQL editor. Safe to re-run. No app redeploy needed.
-- ════════════════════════════════════════════════════════════════════════

-- ── Audit: append-only log — anyone may INSERT, only admins may READ,
--    nobody may UPDATE/DELETE (so it stays tamper-proof) ──────────────────
alter table public.audit enable row level security;

grant  select, insert  on public.audit to authenticated;   -- the missing piece
revoke update, delete  on public.audit from authenticated, anon;

drop policy if exists audit_insert on public.audit;
drop policy if exists audit_select on public.audit;
create policy audit_insert on public.audit
  for insert to authenticated with check (true);
create policy audit_select on public.audit
  for select to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('superadmin','admin'));

-- ── Preempt the identical grant gap on the Phase-7 tables (only if they
--    exist yet). RLS still governs which rows each person can touch. ───────
do $$
begin
  if to_regclass('public.notifications') is not null then
    grant select, insert, update, delete on public.notifications to authenticated;
  end if;
  if to_regclass('public.invoices') is not null then
    grant select, insert, update, delete on public.invoices to authenticated;
  end if;
end $$;

-- Verify (optional):
--   select has_table_privilege('authenticated','public.audit','INSERT') as can_insert_audit;
