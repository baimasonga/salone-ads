-- Convert zero-result procurement searches into accountable sourcing work.
-- Apply after 60_procurement_search_intelligence.sql.

begin;

create table if not exists public.opportunity_sourcing_tasks (
  id uuid primary key default gen_random_uuid(),
  search_term text not null check (char_length(btrim(search_term)) between 2 and 160),
  demand_count integer not null default 1 check (demand_count > 0),
  latest_search_at timestamptz not null,
  sector_id uuid references public.sectors(id) on delete set null,
  country_id uuid references public.countries(id) on delete set null,
  district_id uuid references public.districts(id) on delete set null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'assigned', 'in_progress', 'candidate_found', 'completed', 'cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  notes text,
  source_links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_links) = 'array'),
  matched_opportunity_id uuid references public.opportunities(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.opportunity_ingestion_items
  add column if not exists sourcing_task_id uuid
  references public.opportunity_sourcing_tasks(id) on delete set null;

create unique index if not exists opportunity_ingestion_sourcing_task_unique_idx
  on public.opportunity_ingestion_items(sourcing_task_id)
  where sourcing_task_id is not null;
create index if not exists opportunity_sourcing_tasks_queue_idx
  on public.opportunity_sourcing_tasks(status, priority, due_at);
create index if not exists opportunity_sourcing_tasks_assignee_idx
  on public.opportunity_sourcing_tasks(assigned_to, status, updated_at desc)
  where assigned_to is not null;
create unique index if not exists opportunity_sourcing_tasks_active_gap_idx
  on public.opportunity_sourcing_tasks(lower(search_term), coalesce(sector_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(country_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status not in ('completed', 'cancelled');

alter table public.opportunity_sourcing_tasks enable row level security;
revoke all on public.opportunity_sourcing_tasks from public, anon, authenticated;
grant select on public.opportunity_sourcing_tasks to authenticated;
grant select, insert, update, delete on public.opportunity_sourcing_tasks to service_role;

create policy opportunity_sourcing_tasks_staff_read
on public.opportunity_sourcing_tasks for select to authenticated
using (
  (select public.is_platform_admin())
  or (
    (select public.is_opportunity_researcher())
    and assigned_to = (select auth.uid())
  )
);

create or replace function public.list_opportunity_researchers()
returns table(id uuid, full_name text, platform_role text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select profile.id, profile.full_name, profile.platform_role
  from public.profiles profile
  where public.is_platform_admin()
    and profile.platform_role in ('researcher', 'admin')
  order by profile.full_name, profile.id;
$$;

create or replace function public.create_sourcing_task_from_gap(
  p_term text,
  p_priority text default 'medium',
  p_assigned_to uuid default null,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_term text := lower(btrim(coalesce(p_term, '')));
  gap record;
  task_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid priority';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.profiles
    where id = p_assigned_to and platform_role in ('researcher', 'admin')
  ) then
    raise exception 'Assignee must be a platform researcher or administrator';
  end if;

  select count(*)::integer as demand_count, max(event.created_at) as latest_search_at,
    mode() within group (order by nullif(event.filters->>'sector_id', '')::uuid) as sector_id,
    mode() within group (order by nullif(event.filters->>'country_id', '')::uuid) as country_id,
    mode() within group (order by nullif(event.filters->>'district_id', '')::uuid) as district_id
  into gap
  from public.procurement_search_events event
  where lower(event.search_term) = normalized_term
    and event.result_count = 0
    and event.created_at >= now() - interval '90 days';

  if coalesce(gap.demand_count, 0) = 0 then
    raise exception 'This term is not a current zero-result search gap';
  end if;

  select id into task_id
  from public.opportunity_sourcing_tasks
  where lower(search_term) = normalized_term
    and sector_id is not distinct from gap.sector_id
    and country_id is not distinct from gap.country_id
    and district_id is not distinct from gap.district_id
    and status not in ('completed', 'cancelled')
  limit 1;

  if task_id is null then
    insert into public.opportunity_sourcing_tasks(
      search_term, demand_count, latest_search_at, sector_id, country_id, district_id,
      priority, status, assigned_to, due_at, created_by
    ) values (
      btrim(p_term), gap.demand_count, gap.latest_search_at, gap.sector_id, gap.country_id, gap.district_id,
      p_priority, case when p_assigned_to is null then 'open' else 'assigned' end,
      p_assigned_to, p_due_at, auth.uid()
    ) returning id into task_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'sourcing_task.created', 'opportunity_sourcing_task', task_id::text,
      jsonb_build_object('search_term', btrim(p_term), 'priority', p_priority, 'assigned_to', p_assigned_to));
  end if;

  if p_assigned_to is not null then
    insert into public.notifications(user_id, category, title, body, link_url, metadata)
    values (p_assigned_to, 'workflow', 'New sourcing assignment',
      format('Find a verified opportunity for “%s”.', btrim(p_term)),
      '/portal?workspace=opportunity-ingestion',
      jsonb_build_object('sourcing_task_id', task_id));
  end if;
  return task_id;
end;
$$;

create or replace function public.assign_opportunity_sourcing_task(
  p_task_id uuid,
  p_assigned_to uuid,
  p_priority text default 'medium',
  p_due_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare task_term text;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if not exists (select 1 from public.profiles where id = p_assigned_to and platform_role in ('researcher', 'admin')) then
    raise exception 'Assignee must be a platform researcher or administrator';
  end if;
  update public.opportunity_sourcing_tasks
  set assigned_to = p_assigned_to, priority = p_priority, due_at = p_due_at,
      status = case when status = 'open' then 'assigned' else status end, updated_at = now()
  where id = p_task_id and status not in ('completed', 'cancelled')
  returning search_term into task_term;
  if not found then raise exception 'Active sourcing task not found'; end if;
  insert into public.notifications(user_id, category, title, body, link_url, metadata)
  values (p_assigned_to, 'workflow', 'Sourcing task assigned',
    format('Find a verified opportunity for “%s”.', task_term),
    '/portal?workspace=opportunity-ingestion', jsonb_build_object('sourcing_task_id', p_task_id));
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'sourcing_task.assigned', 'opportunity_sourcing_task', p_task_id::text,
    jsonb_build_object('assigned_to', p_assigned_to, 'priority', p_priority, 'due_at', p_due_at));
end;
$$;

create or replace function public.update_opportunity_sourcing_task(
  p_task_id uuid,
  p_status text,
  p_notes text default null,
  p_source_links jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare task public.opportunity_sourcing_tasks%rowtype;
begin
  select * into task from public.opportunity_sourcing_tasks where id = p_task_id for update;
  if not found then raise exception 'Sourcing task not found'; end if;
  if not (public.is_platform_admin() or (
    public.is_opportunity_researcher() and task.assigned_to = auth.uid()
  )) then raise exception 'Sourcing task access required'; end if;
  if task.status in ('completed', 'cancelled') then raise exception 'Completed sourcing tasks are immutable'; end if;
  if p_status not in ('assigned', 'in_progress', 'candidate_found', 'cancelled') then
    raise exception 'Invalid task status; completion occurs automatically when a matching tender is published';
  end if;
  if jsonb_typeof(p_source_links) <> 'array' then raise exception 'Source links must be an array'; end if;
  update public.opportunity_sourcing_tasks
  set status = p_status, notes = nullif(btrim(coalesce(p_notes, '')), ''),
      source_links = p_source_links, updated_at = now()
  where id = p_task_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'sourcing_task.updated', 'opportunity_sourcing_task', p_task_id::text,
    jsonb_build_object('status', p_status, 'source_link_count', jsonb_array_length(p_source_links)));
end;
$$;

create or replace function public.sync_sourcing_task_from_ingestion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.sourcing_task_id is null then return new; end if;
  if not exists (
    select 1 from public.opportunity_sourcing_tasks task
    where task.id = new.sourcing_task_id
      and task.status not in ('completed', 'cancelled')
      and (public.is_platform_admin() or task.assigned_to = auth.uid())
  ) then raise exception 'Active assigned sourcing task required'; end if;
  update public.opportunity_sourcing_tasks
  set status = case when new.status = 'promoted' then 'candidate_found' else 'in_progress' end,
      matched_opportunity_id = coalesce(new.opportunity_id, matched_opportunity_id),
      updated_at = now()
  where id = new.sourcing_task_id;
  return new;
end;
$$;

drop trigger if exists opportunity_ingestion_sync_sourcing_task on public.opportunity_ingestion_items;
create trigger opportunity_ingestion_sync_sourcing_task
after insert or update of status, opportunity_id, sourcing_task_id
on public.opportunity_ingestion_items
for each row execute function public.sync_sourcing_task_from_ingestion();

create or replace function public.complete_sourcing_tasks_on_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare task record;
begin
  if not exists (
    select 1 from public.opportunity_statuses status
    where status.id = new.status_id and status.code in ('published', 'amended', 'deadline_extended')
  ) then return new; end if;

  for task in
    update public.opportunity_sourcing_tasks sourcing
    set status = 'completed', matched_opportunity_id = new.id,
        completed_at = now(), updated_at = now()
    where sourcing.status not in ('completed', 'cancelled')
      and (sourcing.sector_id is null or sourcing.sector_id = new.sector_id)
      and (sourcing.country_id is null or sourcing.country_id = new.country_id)
      and (sourcing.district_id is null or sourcing.district_id = new.district_id)
      and to_tsvector('simple', coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || coalesce(new.description, ''))
          @@ websearch_to_tsquery('simple', sourcing.search_term)
    returning sourcing.*
  loop
    if task.assigned_to is not null then
      insert into public.notifications(user_id, category, title, body, link_url, metadata)
      values (task.assigned_to, 'workflow', 'Sourcing gap resolved',
        format('“%s” was resolved by a published opportunity.', task.search_term),
        '/portal?workspace=opportunity-ingestion',
        jsonb_build_object('sourcing_task_id', task.id, 'opportunity_id', new.id));
    end if;
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'sourcing_task.completed', 'opportunity_sourcing_task', task.id::text,
      jsonb_build_object('opportunity_id', new.id, 'search_term', task.search_term));
  end loop;
  return new;
end;
$$;

drop trigger if exists opportunities_complete_sourcing_tasks on public.opportunities;
create trigger opportunities_complete_sourcing_tasks
after insert or update of status_id on public.opportunities
for each row execute function public.complete_sourcing_tasks_on_publish();

revoke all on function public.list_opportunity_researchers() from public, anon;
revoke all on function public.create_sourcing_task_from_gap(text, text, uuid, timestamptz) from public, anon;
revoke all on function public.assign_opportunity_sourcing_task(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.update_opportunity_sourcing_task(uuid, text, text, jsonb) from public, anon;
grant execute on function public.list_opportunity_researchers() to authenticated, service_role;
grant execute on function public.create_sourcing_task_from_gap(text, text, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.assign_opportunity_sourcing_task(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.update_opportunity_sourcing_task(uuid, text, text, jsonb) to authenticated, service_role;

revoke all on function public.sync_sourcing_task_from_ingestion() from public, anon, authenticated;
revoke all on function public.complete_sourcing_tasks_on_publish() from public, anon, authenticated;

commit;
