-- Editorial team roles, assignments, guarded status transitions and audit history.
begin;

create table public.cms_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('writer', 'editor', 'publisher', 'administrator')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cms_content
  add column assigned_to uuid references auth.users(id) on delete set null;

alter table public.cms_content drop constraint if exists cms_content_status_check;
alter table public.cms_content
  add constraint cms_content_status_check
  check (status in ('draft', 'review', 'approved', 'published', 'archived'));

create table public.cms_activity_log (
  id bigint generated always as identity primary key,
  content_id uuid references public.cms_content(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cms_content_assigned_to_idx
  on public.cms_content (assigned_to, status, updated_at desc)
  where assigned_to is not null and deleted_at is null;
create index cms_team_members_role_idx on public.cms_team_members (role);
create index cms_activity_content_idx on public.cms_activity_log (content_id, created_at desc);
create index cms_activity_actor_idx on public.cms_activity_log (actor_id, created_at desc)
  where actor_id is not null;

alter table public.cms_team_members enable row level security;
alter table public.cms_activity_log enable row level security;

create or replace function private.cms_is_administrator()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.cms_team_members member
      where member.user_id = auth.uid() and member.role = 'administrator'
    )
$$;

create or replace function private.cms_is_member()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.cms_team_members member
      where member.user_id = auth.uid()
    )
$$;

create policy cms_team_self_or_admin_read
  on public.cms_team_members for select to authenticated
  using ((select private.cms_is_member()));
create policy cms_team_admin_manage
  on public.cms_team_members for all to authenticated
  using ((select private.cms_is_administrator()))
  with check ((select private.cms_is_administrator()));

create or replace function public.cms_current_role()
returns text
language sql
stable
security invoker
set search_path = 'pg_catalog', 'public'
as $$
  select case
    when public.is_platform_admin() then 'administrator'
    else (select member.role from public.cms_team_members member where member.user_id = auth.uid())
  end
$$;

revoke all on function public.cms_current_role() from public, anon;
grant execute on function public.cms_current_role() to authenticated, service_role;

create policy profiles_cms_team_read
  on public.profiles for select to authenticated
  using (
    (select private.cms_is_administrator())
    or (
      (select private.cms_is_member())
      and exists (
        select 1 from public.cms_team_members member where member.user_id = profiles.id
      )
    )
  );

drop policy if exists cms_content_admin_manage on public.cms_content;
create policy cms_content_team_read
  on public.cms_content for select to authenticated
  using ((select public.cms_current_role()) is not null);
create policy cms_content_team_insert
  on public.cms_content for insert to authenticated
  with check (
    (select public.cms_current_role()) in ('writer', 'editor', 'publisher', 'administrator')
    and created_by = (select auth.uid())
  );
create policy cms_content_team_update
  on public.cms_content for update to authenticated
  using ((select public.cms_current_role()) is not null)
  with check ((select public.cms_current_role()) is not null);
create policy cms_content_admin_delete
  on public.cms_content for delete to authenticated
  using ((select public.cms_current_role()) = 'administrator');

drop policy if exists cms_content_revisions_admin_read on public.cms_content_revisions;
create policy cms_content_revisions_team_read
  on public.cms_content_revisions for select to authenticated
  using ((select public.cms_current_role()) is not null);

drop policy if exists cms_comments_admin_manage on public.cms_editorial_comments;
create policy cms_comments_team_read
  on public.cms_editorial_comments for select to authenticated
  using ((select public.cms_current_role()) is not null);
create policy cms_comments_team_insert
  on public.cms_editorial_comments for insert to authenticated
  with check (
    (select public.cms_current_role()) is not null
    and author_id = (select auth.uid())
  );
create policy cms_comments_admin_delete
  on public.cms_editorial_comments for delete to authenticated
  using ((select public.cms_current_role()) = 'administrator');

drop policy if exists cms_events_admin_read on public.cms_content_events;
create policy cms_events_team_read
  on public.cms_content_events for select to authenticated
  using ((select public.cms_current_role()) is not null);

create policy cms_activity_team_read
  on public.cms_activity_log for select to authenticated
  using ((select public.cms_current_role()) is not null);

create or replace function private.enforce_cms_workflow()
returns trigger
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public'
as $$
declare
  member_role text := public.cms_current_role();
  user_id uuid := auth.uid();
begin
  if member_role is null then
    raise exception 'You are not a member of the editorial team.';
  end if;

  if tg_op = 'INSERT' then
    if member_role <> 'administrator' and new.status <> 'draft' then
      raise exception 'New content must begin as a draft.';
    end if;
    new.assigned_to := coalesce(new.assigned_to, user_id);
    return new;
  end if;

  if member_role = 'administrator' then
    null;
  elsif member_role = 'writer' then
    if not (old.created_by = user_id or old.assigned_to = user_id) then
      raise exception 'Writers may only change content assigned to them.';
    end if;
    if old.status <> 'draft' or new.status not in ('draft', 'review') then
      raise exception 'Writers may edit drafts and submit them for review.';
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      raise exception 'Writers cannot reassign content.';
    end if;
  elsif member_role = 'editor' then
    if new.status in ('published', 'archived') then
      raise exception 'Editors cannot publish or archive content.';
    end if;
    if old.status = 'published' then
      raise exception 'Published content must be changed by a publisher or administrator.';
    end if;
    if new.status = 'approved' and old.created_by = user_id then
      raise exception 'Editors cannot approve content they created.';
    end if;
  elsif member_role = 'publisher' then
    if new.status = 'published' and old.status <> 'approved' then
      raise exception 'Only approved content can be published.';
    end if;
    if old.status = 'published' and new.status <> 'published' then
      raise exception 'Only an administrator can unpublish content.';
    end if;
  end if;

  if new.status = 'review' and old.status is distinct from 'review' then
    new.review_requested_at := now();
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.reviewed_at := now();
    new.reviewed_by := user_id;
  end if;
  if new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger enforce_cms_workflow
  before insert or update on public.cms_content
  for each row execute function private.enforce_cms_workflow();

create or replace function private.log_cms_activity()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  activity text;
  target_id uuid;
begin
  target_id := coalesce(new.id, old.id);
  activity := case
    when tg_op = 'INSERT' then 'created'
    when tg_op = 'DELETE' then 'deleted'
    when new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then 'moved_to_trash'
    when new.deleted_at is distinct from old.deleted_at and new.deleted_at is null then 'restored'
    when new.assigned_to is distinct from old.assigned_to then 'assigned'
    when new.status is distinct from old.status then
      case new.status
        when 'review' then 'submitted_for_review'
        when 'approved' then 'approved'
        when 'published' then 'published'
        when 'draft' then 'changes_requested'
        when 'archived' then 'archived'
        else 'status_changed'
      end
    else 'updated'
  end;

  insert into public.cms_activity_log (content_id, actor_id, action, from_status, to_status, details)
  values (
    target_id,
    auth.uid(),
    activity,
    case when tg_op = 'INSERT' then null else old.status end,
    case when tg_op = 'DELETE' then null else new.status end,
    jsonb_build_object(
      'title', coalesce(new.title, old.title),
      'assigned_to', coalesce(new.assigned_to, old.assigned_to)
    )
  );

  if tg_op <> 'DELETE' and new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to then
    insert into public.notifications (user_id, category, title, body, link_url, metadata)
    values (
      new.assigned_to,
      'cms_workflow',
      'Content assigned to you',
      new.title,
      '/dashboard',
      jsonb_build_object('content_id', new.id, 'action', 'assigned')
    );
  end if;

  if tg_op <> 'DELETE' and new.status is distinct from old.status then
    if new.status = 'review' then
      insert into public.notifications (user_id, category, title, body, link_url, metadata)
      select member.user_id, 'cms_workflow', 'Content awaiting review', new.title, '/dashboard',
        jsonb_build_object('content_id', new.id, 'action', 'review')
      from public.cms_team_members member where member.role in ('editor', 'administrator');
    elsif new.status = 'approved' then
      insert into public.notifications (user_id, category, title, body, link_url, metadata)
      select member.user_id, 'cms_workflow', 'Content approved for publishing', new.title, '/dashboard',
        jsonb_build_object('content_id', new.id, 'action', 'approved')
      from public.cms_team_members member where member.role in ('publisher', 'administrator');
    elsif new.status = 'draft' and old.status = 'review' and new.assigned_to is not null then
      insert into public.notifications (user_id, category, title, body, link_url, metadata)
      values (
        new.assigned_to, 'cms_workflow', 'Changes requested', new.title, '/dashboard',
        jsonb_build_object('content_id', new.id, 'action', 'changes_requested')
      );
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger log_cms_activity
  after insert or update or delete on public.cms_content
  for each row execute function private.log_cms_activity();

create policy landing_cms_media_team_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.cms_current_role()) is not null
  );
create policy landing_cms_media_team_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.cms_current_role()) is not null
  )
  with check (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.cms_current_role()) is not null
  );
create policy landing_cms_media_team_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.cms_current_role()) is not null
  );

revoke all on public.cms_team_members, public.cms_activity_log from public, anon, authenticated;
grant select, insert, update, delete on public.cms_team_members to authenticated;
grant select on public.cms_activity_log to authenticated;
grant all on public.cms_team_members, public.cms_activity_log to service_role;
grant usage, select on sequence public.cms_activity_log_id_seq to service_role;
revoke all on function private.enforce_cms_workflow() from public, anon, authenticated;
revoke all on function private.log_cms_activity() from public, anon, authenticated;
revoke all on function private.cms_is_administrator() from public, anon;
grant execute on function private.cms_is_administrator() to authenticated, service_role;
revoke all on function private.cms_is_member() from public, anon;
grant execute on function private.cms_is_member() to authenticated, service_role;

commit;
