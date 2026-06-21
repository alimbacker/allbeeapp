-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — ENABLE "DELETE USER" WITHOUT THE EDGE FUNCTION
--
--  Problem: deleting a staff member failed with "Failed to send a request to
--  the Edge Function" because the admin-users function isn't deployed, and the
--  delete depended on it entirely.
--
--  This change makes the app remove the person's PROFILE row directly from the
--  browser (taking them out of the team immediately). For that to be allowed,
--  the profiles table needs a DELETE policy. Run this ONCE. Safe to re-run.
--
--  After this: Team → Manage → Delete user works with no edge function.
--  (The app still tries the edge function too, as a bonus, to also remove their
--   auth login so the EMAIL frees up. See the note at the bottom.)
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    execute 'drop policy if exists profiles_admin_delete on public.profiles';
    -- Admins & partners may delete any NON-partner profile. Partners (superadmin)
    -- can never be deleted. Uses the is_admin() helper if present, else a direct
    -- role check.
    if exists (select 1 from pg_proc where proname = 'is_admin') then
      execute $p$
        create policy profiles_admin_delete on public.profiles
          for delete to authenticated
          using (public.is_admin() and role <> 'superadmin')
      $p$;
    else
      execute $p$
        create policy profiles_admin_delete on public.profiles
          for delete to authenticated
          using (
            coalesce((select me.role from public.profiles me where me.id = auth.uid()) in ('superadmin','admin'), false)
            and role <> 'superadmin'
          )
      $p$;
    end if;
  end if;
end $$;

-- Verify (optional):
--   select policyname, cmd from pg_policies where tablename = 'profiles';

-- ════════════════════════════════════════════════════════════════════════
--  ABOUT FULLY FREEING THE EMAIL
--
--  Deleting the profile removes the person from the team and frees their
--  USERNAME right away. Their auth LOGIN (and therefore their email) can only be
--  removed with the service-role key, which is why that part still needs the
--  admin-users edge function — OR you can delete the login by hand with no code:
--
--    Supabase Dashboard → Authentication → Users → (pick the user) → Delete user
--
--  Until the login is removed, you can re-create the person with the SAME
--  USERNAME or a NEW email; re-using the exact same email needs the login gone.
--  (If a removed person somehow signs in again before their login is deleted,
--   they land on "Awaiting approval" with no access — the app blocks them.)
-- ════════════════════════════════════════════════════════════════════════
