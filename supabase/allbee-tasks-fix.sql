-- ============================================================================
-- ALLBEE — FEATURES: staff document uploads + staff/client approval
-- Run once in Supabase → SQL Editor (after allbee-tasks-fix.sql).
-- Idempotent and safe to re-run.
-- ============================================================================

-- ── 1) DOCUMENTS — let any internal user (staff/intern/admin) upload ────────
-- Was admin-only. Now: anyone internal may ADD a document; only an admin or the
-- person who uploaded it may edit/delete it. Clients still can't see Documents.
drop policy if exists documents_wr  on public.documents;   -- old admin-only catch-all
drop policy if exists documents_ins on public.documents;
drop policy if exists documents_upd on public.documents;
drop policy if exists documents_del on public.documents;
create policy documents_ins on public.documents for insert to authenticated
  with check (not public.is_client());
create policy documents_upd on public.documents for update to authenticated
  using      (public.is_admin() or (data->>'ownerId') = auth.uid()::text)
  with check (public.is_admin() or (data->>'ownerId') = auth.uid()::text);
create policy documents_del on public.documents for delete to authenticated
  using      (public.is_admin() or (data->>'ownerId') = auth.uid()::text);
-- (documents_sel — internal-only read — is left exactly as it was.)

-- ── 2) APPROVAL — new staff & clients wait for a partner to approve ─────────
-- Adds an `approved` flag. Default TRUE so every EXISTING person stays approved
-- and nobody is locked out. The sign-up trigger below sets it FALSE for brand-new
-- staff/client accounts, so only people who join from now on need approving.
alter table public.profiles add column if not exists approved boolean not null default true;

-- Sign-up: super admins (admin code) are auto-approved; staff & clients are not.
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
  insert into public.profiles (id, name, email, role, approved)
  values (new.id, v_name, new.email, v_role, v_role = 'superadmin')
  on conflict (id) do nothing;
  return new;
end $$;

-- Field guard: a non-admin must never flip their OWN `approved` flag (that would
-- bypass approval). Re-defined to also pin `approved` for non-admin edits.
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
    new.role := old.role; new.active := old.active; new.status := old.status;
    new.perms := old.perms; new.approved := old.approved;   -- ← approval is admin-only
  end if;
  if new.role = 'superadmin' and old.role <> 'superadmin' and not caller_super then
    new.role := old.role;  -- only a partner can promote someone to partner
  end if;
  return new;
end $$;

-- ── confirm ─────────────────────────────────────────────────────────────────
select name, email, role, approved from public.profiles order by created_at;
