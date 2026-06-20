-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — RLS fix for read receipts (chat) + mark-as-read (notifications)
--  Run this in the Supabase SQL editor. Safe to re-run. No app redeploy needed.
--
--  Why: "seen by me" / "read by me" features update a row authored by someone
--  else. Row-level security only allowed updating your OWN rows, so those writes
--  were rejected — and because the app saves all of a table's changes in one
--  atomic batch, a rejected receipt update was also blocking new messages from
--  saving. This lets internal members UPDATE these rows (the UI still only lets
--  you edit your own message text).
-- ════════════════════════════════════════════════════════════════════════

-- ── Fix 1: chat (read receipts + sending messages) ───────────────────────
drop policy if exists chat_update_internal on public.chat;
create policy chat_update_internal on public.chat
  for update to authenticated
  using      ((select role from public.profiles where id = auth.uid()) <> 'client')
  with check ((select role from public.profiles where id = auth.uid()) <> 'client');

-- ── Fix 2: notifications mark-as-read by non-admins (only if the table exists)
do $$
begin
  if to_regclass('public.notifications') is not null then
    drop policy if exists notif_write  on public.notifications;
    drop policy if exists notif_insert on public.notifications;
    drop policy if exists notif_update on public.notifications;
    drop policy if exists notif_delete on public.notifications;
    -- create / delete: admins only
    create policy notif_insert on public.notifications for insert to authenticated
      with check ((select role from public.profiles where id = auth.uid()) in ('superadmin','admin'));
    create policy notif_delete on public.notifications for delete to authenticated
      using  ((select role from public.profiles where id = auth.uid()) in ('superadmin','admin'));
    -- update (mark-as-read): any internal member
    create policy notif_update on public.notifications for update to authenticated
      using      ((select role from public.profiles where id = auth.uid()) <> 'client')
      with check ((select role from public.profiles where id = auth.uid()) <> 'client');
  end if;
end $$;

-- Verify (optional):
--   select policyname, cmd from pg_policies where tablename in ('chat','notifications');
