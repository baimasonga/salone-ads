begin;

alter function public.mark_notification_read(uuid) security invoker;
alter function public.mark_all_notifications_read(uuid) security invoker;
alter function public.archive_notification(uuid) security invoker;

grant update (status, read_at) on public.notifications to authenticated;

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
