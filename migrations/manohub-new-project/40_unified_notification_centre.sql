begin;

alter table public.notifications
  add column if not exists priority text not null default 'normal',
  add column if not exists action_label text,
  add column if not exists workspace_target text;

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('pending', 'sent', 'failed', 'read', 'archived'));

alter table public.notifications drop constraint if exists notifications_priority_check;
alter table public.notifications add constraint notifications_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

update public.notifications
set priority = case
  when category in ('campaign_health', 'deadline_reminder') then 'high'
  when category = 'cms_workflow' then 'normal'
  else priority
end,
workspace_target = case
  when category = 'campaign_health' then 'campaign-builder'
  when category = 'cms_workflow' then 'content-cms'
  when category = 'deadline_reminder' then 'tenders'
  else workspace_target
end,
action_label = case
  when category = 'campaign_health' then 'Review campaign'
  when category = 'cms_workflow' then 'Open content'
  when category = 'deadline_reminder' then 'View tender'
  else action_label
end
where workspace_target is null or action_label is null;

create index if not exists notifications_user_status_created_idx
  on public.notifications (user_id, status, created_at desc);

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set status = 'read', read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid() and status <> 'archived';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.mark_all_notifications_read(p_org_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set status = 'read', read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and status not in ('read', 'archived')
    and (p_org_id is null or org_id = p_org_id);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.archive_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set status = 'archived', read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon;
revoke all on function public.archive_notification(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.archive_notification(uuid) to authenticated;

revoke update on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

drop policy if exists "Users can mark their own notifications read" on public.notifications;
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users manage their own notification preferences" on public.notification_preferences;
drop policy if exists notification_preferences_owner_manage on public.notification_preferences;
create policy notification_preferences_owner_manage on public.notification_preferences
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (public.is_org_member(org_id) or public.is_platform_admin())
  )
  with check (
    user_id = (select auth.uid())
    and (public.is_org_member(org_id) or public.is_platform_admin())
  );

commit;
