-- Operational visibility for search-gap sourcing work.
-- Apply after 61_search_gap_sourcing_workflow.sql.

begin;

create table if not exists public.opportunity_sourcing_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.opportunity_sourcing_tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in ('created', 'assigned', 'status_changed', 'evidence_updated', 'completed')),
  previous_status text,
  next_status text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists opportunity_sourcing_task_events_task_created_idx
  on public.opportunity_sourcing_task_events(task_id, created_at desc);

alter table public.opportunity_sourcing_task_events enable row level security;
revoke all on public.opportunity_sourcing_task_events from public, anon, authenticated;
grant select on public.opportunity_sourcing_task_events to authenticated;
grant select, insert, update, delete on public.opportunity_sourcing_task_events to service_role;

create policy opportunity_sourcing_task_events_staff_read
on public.opportunity_sourcing_task_events for select to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.opportunity_sourcing_tasks task
    where task.id = task_id
      and task.assigned_to = (select auth.uid())
      and (select public.is_opportunity_researcher())
  )
);

create or replace function public.record_opportunity_sourcing_task_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  event_name text;
  event_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    event_name := 'created';
    event_details := jsonb_build_object(
      'priority', new.priority,
      'demand_count', new.demand_count,
      'assigned_to', new.assigned_to
    );
  elsif new.status = 'completed' and old.status is distinct from new.status then
    event_name := 'completed';
    event_details := jsonb_build_object('matched_opportunity_id', new.matched_opportunity_id);
  elsif old.assigned_to is distinct from new.assigned_to then
    event_name := 'assigned';
    event_details := jsonb_build_object(
      'previous_assignee', old.assigned_to,
      'assigned_to', new.assigned_to,
      'priority', new.priority,
      'due_at', new.due_at
    );
  elsif old.status is distinct from new.status then
    event_name := 'status_changed';
  elsif old.notes is distinct from new.notes or old.source_links is distinct from new.source_links then
    event_name := 'evidence_updated';
    event_details := jsonb_build_object(
      'source_link_count', jsonb_array_length(new.source_links),
      'has_notes', new.notes is not null
    );
  else
    return new;
  end if;

  insert into public.opportunity_sourcing_task_events(
    task_id, actor_id, event_type, previous_status, next_status, details
  ) values (
    new.id, auth.uid(), event_name,
    case when tg_op = 'UPDATE' then old.status end,
    new.status, event_details
  );
  return new;
end;
$$;

drop trigger if exists opportunity_sourcing_task_event_capture
  on public.opportunity_sourcing_tasks;
create trigger opportunity_sourcing_task_event_capture
after insert or update on public.opportunity_sourcing_tasks
for each row execute function public.record_opportunity_sourcing_task_event();

revoke all on function public.record_opportunity_sourcing_task_event()
  from public, anon, authenticated;

commit;
