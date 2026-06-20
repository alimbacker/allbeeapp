-- ════════════════════════════════════════════════════════════════════════
--  ALLBEE — FIX: "new row violates row-level security policy for table chat"
--  (and the identical issue on notifications for non-admins)
--
--  Run this in the Supabase SQL editor. Safe to re-run. No app redeploy needed.
--
--  ROOT CAUSE
--  Marking someone else's message as "Seen" — and a non-admin marking a
--  notification as read — updates a row authored by another user. The app
--  persists changes with INSERT ... ON CONFLICT (upsert), so PostgreSQL also
--  evaluates the *INSERT* policy on that row. The existing insert policies only
--  allowed rows you OWN (chat) or rows created by an ADMIN (notifications), so
--  the read-receipt write was rejected — and because the whole table's changes
--  save in one atomic batch, it also blocked new messages from saving.
--
--  FIX
--  Permit writing a row you are entitled to CREATE *or* a row that ALREADY
--  EXISTS (i.e. an update arriving via upsert). This fixes read receipts and
--  mark-as-read without letting anyone forge a message as someone else or
--  create a notification they shouldn't.
-- ════════════════════════════════════════════════════════════════════════

-- ── CHAT ────────────────────────────────────────────────────────────────
-- Insert: your OWN new message, or an upsert of a row that already exists
-- (read receipts add you to another message's seenBy).
drop policy if exists chat_insert_internal on public.chat;
create policy chat_insert_internal on public.chat
  for insert to authenticated
  with check (
    (data->>'userId') = auth.uid()::text
    or id in (select x.id from public.chat x)
  );

-- Update: any internal member (non-client) may update chat rows (read receipts
-- on messages authored by others). The UI still only lets you edit your own text.
drop policy if exists chat_update_internal on public.chat;
create policy chat_update_internal on public.chat
  for update to authenticated
  using      ((select role from public.profiles where id = auth.uid()) <> 'client')
  with check ((select role from public.profiles where id = auth.uid()) <> 'client');

-- ── NOTIFICATIONS ───────────────────────────────────────────────────────
-- Insert: admins create NEW notifications; anyone internal may upsert an
-- EXISTING one (mark-as-read). Preserves "only admins create notifications".
do $$
begin
  if to_regclass('public.notifications') is not null then
    drop policy if exists notif_insert on public.notifications;
    create policy notif_insert on public.notifications
      for insert to authenticated
      with check (
        coalesce((select role from public.profiles where id = auth.uid()) in ('superadmin','admin'), false)
        or id in (select x.id from public.notifications x)
      );
    -- mark-as-read by any internal member (no-op if already correct)
    drop policy if exists notif_update on public.notifications;
    create policy notif_update on public.notifications
      for update to authenticated
      using      ((select role from public.profiles where id = auth.uid()) <> 'client')
      with check ((select role from public.profiles where id = auth.uid()) <> 'client');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
--  Done. Reload the app — the yellow "couldn't sync" banner should be gone.
--  Verify (optional):
--    select policyname, cmd from pg_policies where tablename in ('chat','notifications');
-- ════════════════════════════════════════════════════════════════════════
