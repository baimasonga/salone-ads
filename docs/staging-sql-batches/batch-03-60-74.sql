-- HYDERRA STAGING ONLY: project gknewzlxndmummwynuoa
-- Batch 3 of 5. Requires migrations through 59.
-- Original SQL follows unchanged; transactions are preserved.
-- On any error STOP. Earlier migrations may have committed.


-- ===== START 60_procurement_search_intelligence.sql =====
-- Actionable, privacy-conscious procurement search intelligence for platform
-- administrators. No visitor or user identifiers leave this RPC.

begin;

create or replace function public.admin_get_procurement_search_insights(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  period_start timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;
  if p_days < 1 or p_days > 365 then
    raise exception 'Insight window must be between 1 and 365 days';
  end if;
  period_start := date_trunc('day', now()) - make_interval(days => p_days - 1);

  return jsonb_build_object(
    'period_days', p_days,
    'searches', (
      select count(*) from public.procurement_search_events
      where created_at >= period_start
    ),
    'unique_searchers', (
      select count(distinct coalesce(user_id::text, visitor_hash))
      from public.procurement_search_events
      where created_at >= period_start
        and coalesce(user_id::text, visitor_hash) is not null
    ),
    'zero_result_searches', (
      select count(*) from public.procurement_search_events
      where created_at >= period_start and result_count = 0
    ),
    'zero_result_rate', coalesce((
      select round(
        100.0 * count(*) filter (where result_count = 0) / nullif(count(*), 0),
        1
      )
      from public.procurement_search_events
      where created_at >= period_start
    ), 0),
    'average_results', coalesce((
      select round(avg(result_count), 1)
      from public.procurement_search_events
      where created_at >= period_start
    ), 0),
    'daily_trend', coalesce((
      select jsonb_agg(to_jsonb(day_row) order by day_row.search_date)
      from (
        select
          day::date as search_date,
          count(event.id) as searches,
          count(event.id) filter (where event.result_count = 0) as zero_results
        from generate_series(
          date_trunc('day', now()) - make_interval(days => p_days - 1),
          date_trunc('day', now()),
          interval '1 day'
        ) day
        left join public.procurement_search_events event
          on event.created_at >= day and event.created_at < day + interval '1 day'
        group by day
      ) day_row
    ), '[]'::jsonb),
    'top_terms', coalesce((
      select jsonb_agg(to_jsonb(term_row))
      from (
        select
          search_term as term,
          count(*) as searches,
          round(avg(result_count), 1) as average_results,
          round(100.0 * count(*) filter (where result_count = 0) / count(*), 1) as zero_result_rate
        from public.procurement_search_events
        where created_at >= period_start and search_term is not null
        group by search_term
        order by count(*) desc, max(created_at) desc, search_term
        limit 10
      ) term_row
    ), '[]'::jsonb),
    'content_gaps', coalesce((
      select jsonb_agg(to_jsonb(gap_row))
      from (
        select
          search_term as term,
          count(*) as searches,
          max(created_at) as latest_search_at
        from public.procurement_search_events
        where created_at >= period_start
          and result_count = 0
          and search_term is not null
        group by search_term
        order by count(*) desc, max(created_at) desc, search_term
        limit 10
      ) gap_row
    ), '[]'::jsonb),
    'sector_demand', coalesce((
      select jsonb_agg(to_jsonb(sector_row))
      from (
        select sector.name as label, count(*) as searches
        from public.procurement_search_events event
        join public.sectors sector
          on sector.id = nullif(event.filters->>'sector_id', '')::uuid
        where event.created_at >= period_start
        group by sector.name
        order by count(*) desc, sector.name
        limit 10
      ) sector_row
    ), '[]'::jsonb),
    'country_demand', coalesce((
      select jsonb_agg(to_jsonb(country_row))
      from (
        select country.name as label, count(*) as searches
        from public.procurement_search_events event
        join public.countries country
          on country.id = nullif(event.filters->>'country_id', '')::uuid
        where event.created_at >= period_start
        group by country.name
        order by count(*) desc, country.name
        limit 10
      ) country_row
    ), '[]'::jsonb),
    'district_demand', coalesce((
      select jsonb_agg(to_jsonb(district_row))
      from (
        select district.name as label, count(*) as searches
        from public.procurement_search_events event
        join public.districts district
          on district.id = nullif(event.filters->>'district_id', '')::uuid
        where event.created_at >= period_start
        group by district.name
        order by count(*) desc, district.name
        limit 10
      ) district_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_procurement_search_insights(integer) from public, anon;
grant execute on function public.admin_get_procurement_search_insights(integer)
  to authenticated, service_role;

commit;

-- ===== END 60_procurement_search_intelligence.sql =====

-- ===== START 61_search_gap_sourcing_workflow.sql =====
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

-- ===== END 61_search_gap_sourcing_workflow.sql =====

-- ===== START 62_sourcing_task_operations.sql =====
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

-- ===== END 62_sourcing_task_operations.sql =====

-- ===== START 63_commercial_billing_operations.sql =====
-- Complete core commercial billing operations with credits, refunds and
-- deterministic overdue processing on top of the append-only ledger.
begin;

alter table public.commercial_invoices
  add column if not exists amount_credited numeric(16,2) not null default 0
    check (amount_credited >= 0);

alter table public.commercial_payments
  add column if not exists refunded_amount numeric(16,2) not null default 0
    check (refunded_amount >= 0 and refunded_amount <= amount);

create table if not exists public.commercial_credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.commercial_invoices(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  credit_number text not null unique,
  currency_code text not null references public.currencies(code),
  amount numeric(16,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now()
);

create table if not exists public.commercial_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.commercial_payments(id) on delete restrict,
  invoice_id uuid not null references public.commercial_invoices(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  refund_reference text not null,
  currency_code text not null references public.currencies(code),
  amount numeric(16,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (org_id, refund_reference)
);

create index if not exists commercial_credit_notes_invoice_idx
  on public.commercial_credit_notes(invoice_id, issued_at desc);
create index if not exists commercial_refunds_payment_idx
  on public.commercial_refunds(payment_id, recorded_at desc);

alter table public.commercial_credit_notes enable row level security;
alter table public.commercial_refunds enable row level security;
revoke all on public.commercial_credit_notes, public.commercial_refunds
  from public, anon, authenticated;
grant select on public.commercial_credit_notes, public.commercial_refunds
  to authenticated;

drop policy if exists commercial_credit_notes_read on public.commercial_credit_notes;
create policy commercial_credit_notes_read on public.commercial_credit_notes
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists commercial_refunds_read on public.commercial_refunds;
create policy commercial_refunds_read on public.commercial_refunds
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

create or replace function public.record_commercial_payment(
  p_invoice_id uuid,
  p_reference text,
  p_method text,
  p_amount numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.commercial_invoices;
  v_payment_id uuid;
  v_outstanding numeric(16,2);
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if nullif(trim(coalesce(p_reference, '')), '') is null
     or length(trim(p_reference)) > 200 then
    raise exception 'A valid payment reference is required';
  end if;
  if p_method not in ('bank_transfer','mobile_money','card','cash','credit') then
    raise exception 'Unsupported payment method';
  end if;

  select * into v_invoice
  from public.commercial_invoices
  where id = p_invoice_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'void' then raise exception 'A void invoice cannot receive payment'; end if;

  v_outstanding := greatest(
    v_invoice.total_amount - v_invoice.amount_paid - v_invoice.amount_credited,
    0
  );
  if p_amount <= 0 or p_amount > v_outstanding then
    raise exception 'Payment exceeds outstanding balance';
  end if;

  insert into public.commercial_payments(
    org_id, payment_reference, method, currency_code, amount, verified_by
  ) values (
    v_invoice.org_id, trim(p_reference), p_method,
    v_invoice.currency_code, p_amount, (select auth.uid())
  ) returning id into v_payment_id;

  insert into public.commercial_payment_allocations(payment_id, invoice_id, amount)
  values (v_payment_id, v_invoice.id, p_amount);

  update public.commercial_invoices
  set amount_paid = amount_paid + p_amount,
      status = case
        when amount_paid + amount_credited + p_amount >= total_amount then 'paid'
        else 'partially_paid'
      end
  where id = v_invoice.id;

  insert into public.commercial_ledger_entries(
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id
  ) values (
    v_invoice.org_id, 'payment', 'credit', p_amount, v_invoice.currency_code,
    'commercial_payment', v_payment_id, 'Payment ' || trim(p_reference),
    (select auth.uid())
  );

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), v_invoice.org_id, 'billing.payment_recorded',
    'commercial_invoice', v_invoice.id::text,
    jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount,
      'currency', v_invoice.currency_code, 'reference', trim(p_reference))
  );

  return v_payment_id;
end;
$$;

revoke all on function public.record_commercial_payment(uuid,text,text,numeric)
  from public, anon;
grant execute on function public.record_commercial_payment(uuid,text,text,numeric)
  to authenticated;

create or replace function public.issue_commercial_credit(
  p_invoice_id uuid,
  p_credit_number text,
  p_amount numeric,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.commercial_invoices;
  v_credit_id uuid;
  v_outstanding numeric(16,2);
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if nullif(trim(coalesce(p_credit_number, '')), '') is null
     or length(trim(p_credit_number)) > 200 then
    raise exception 'A valid credit-note number is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Credit reason must contain 3 to 1000 characters';
  end if;

  select * into v_invoice from public.commercial_invoices
  where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'void' then raise exception 'A void invoice cannot be credited'; end if;

  v_outstanding := greatest(
    v_invoice.total_amount - v_invoice.amount_paid - v_invoice.amount_credited,
    0
  );
  if p_amount <= 0 or p_amount > v_outstanding then
    raise exception 'Credit exceeds outstanding balance';
  end if;

  insert into public.commercial_credit_notes(
    invoice_id, org_id, credit_number, currency_code, amount, reason, issued_by
  ) values (
    v_invoice.id, v_invoice.org_id, trim(p_credit_number),
    v_invoice.currency_code, p_amount, trim(p_reason), (select auth.uid())
  ) returning id into v_credit_id;

  update public.commercial_invoices
  set amount_credited = amount_credited + p_amount,
      status = case
        when amount_paid + amount_credited + p_amount >= total_amount then 'paid'
        when amount_paid > 0 then 'partially_paid'
        when due_at is not null and due_at < current_date then 'overdue'
        else 'issued'
      end
  where id = v_invoice.id;

  insert into public.commercial_ledger_entries(
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id, metadata
  ) values (
    v_invoice.org_id, 'credit', 'credit', p_amount, v_invoice.currency_code,
    'commercial_credit_note', v_credit_id,
    'Credit note ' || trim(p_credit_number), (select auth.uid()),
    jsonb_build_object('invoice_id', v_invoice.id, 'reason', trim(p_reason))
  );

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), v_invoice.org_id, 'billing.credit_issued',
    'commercial_invoice', v_invoice.id::text,
    jsonb_build_object('credit_id', v_credit_id, 'amount', p_amount,
      'currency', v_invoice.currency_code, 'reason', trim(p_reason))
  );

  return v_credit_id;
end;
$$;

revoke all on function public.issue_commercial_credit(uuid,text,numeric,text)
  from public, anon;
grant execute on function public.issue_commercial_credit(uuid,text,numeric,text)
  to authenticated;

create or replace function public.record_commercial_refund(
  p_payment_id uuid,
  p_refund_reference text,
  p_amount numeric,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.commercial_payments;
  v_allocation public.commercial_payment_allocations;
  v_invoice public.commercial_invoices;
  v_refund_id uuid;
  v_available numeric(16,2);
  v_next_paid numeric(16,2);
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if nullif(trim(coalesce(p_refund_reference, '')), '') is null
     or length(trim(p_refund_reference)) > 200 then
    raise exception 'A valid refund reference is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Refund reason must contain 3 to 1000 characters';
  end if;

  select * into v_payment from public.commercial_payments
  where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status not in ('verified','reversed') then
    raise exception 'Only verified payments can be refunded';
  end if;

  select * into v_allocation from public.commercial_payment_allocations
  where payment_id = p_payment_id
  order by created_at
  limit 1;
  if not found then raise exception 'Payment allocation not found'; end if;

  select * into v_invoice from public.commercial_invoices
  where id = v_allocation.invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;

  v_available := v_payment.amount - v_payment.refunded_amount;
  if p_amount <= 0 or p_amount > v_available
     or p_amount > v_invoice.amount_paid then
    raise exception 'Refund exceeds the refundable amount';
  end if;
  v_next_paid := v_invoice.amount_paid - p_amount;

  insert into public.commercial_refunds(
    payment_id, invoice_id, org_id, refund_reference,
    currency_code, amount, reason, recorded_by
  ) values (
    v_payment.id, v_invoice.id, v_invoice.org_id, trim(p_refund_reference),
    v_invoice.currency_code, p_amount, trim(p_reason), (select auth.uid())
  ) returning id into v_refund_id;

  update public.commercial_payments
  set refunded_amount = refunded_amount + p_amount,
      status = case when refunded_amount + p_amount >= amount then 'reversed' else 'verified' end
  where id = v_payment.id;

  update public.commercial_invoices
  set amount_paid = v_next_paid,
      status = case
        when v_next_paid + amount_credited >= total_amount then 'paid'
        when due_at is not null and due_at < current_date then 'overdue'
        when v_next_paid > 0 then 'partially_paid'
        else 'issued'
      end
  where id = v_invoice.id;

  insert into public.commercial_ledger_entries(
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id, metadata
  ) values (
    v_invoice.org_id, 'refund', 'debit', p_amount, v_invoice.currency_code,
    'commercial_refund', v_refund_id,
    'Refund ' || trim(p_refund_reference), (select auth.uid()),
    jsonb_build_object('invoice_id', v_invoice.id, 'payment_id', v_payment.id,
      'reason', trim(p_reason))
  );

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), v_invoice.org_id, 'billing.refund_recorded',
    'commercial_invoice', v_invoice.id::text,
    jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment.id,
      'amount', p_amount, 'currency', v_invoice.currency_code,
      'reason', trim(p_reason))
  );

  return v_refund_id;
end;
$$;

revoke all on function public.record_commercial_refund(uuid,text,numeric,text)
  from public, anon;
grant execute on function public.record_commercial_refund(uuid,text,numeric,text)
  to authenticated;

create or replace function private.process_commercial_invoice_overdue(
  p_as_of date default current_date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice record;
  v_user record;
  v_count integer := 0;
begin
  for v_invoice in
    update public.commercial_invoices
    set status = 'overdue'
    where status in ('issued','partially_paid')
      and due_at is not null
      and due_at < p_as_of
      and total_amount > amount_paid + amount_credited
    returning id, org_id, invoice_number, due_at, currency_code,
      total_amount - amount_paid - amount_credited as outstanding
  loop
    v_count := v_count + 1;

    insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
    values (
      (select auth.uid()), v_invoice.org_id, 'billing.invoice_overdue',
      'commercial_invoice', v_invoice.id::text,
      jsonb_build_object('invoice_number', v_invoice.invoice_number,
        'due_at', v_invoice.due_at, 'outstanding', v_invoice.outstanding,
        'currency', v_invoice.currency_code, 'source', 'billing_automation')
    );

    for v_user in
      select user_id from public.organization_members
      where org_id = v_invoice.org_id and role in ('owner','admin')
    loop
      insert into public.notifications(
        user_id, org_id, category, title, body, channel, status, priority,
        workspace_target, action_label, metadata
      ) values (
        v_user.user_id, v_invoice.org_id, 'billing',
        'Invoice overdue: ' || v_invoice.invoice_number,
        'Payment was due on ' || to_char(v_invoice.due_at, 'DD Mon YYYY') ||
          '. Outstanding: ' || v_invoice.currency_code || ' ' ||
          to_char(v_invoice.outstanding, 'FM999999999999990.00') || '.',
        'in_app', 'pending', 'high', 'billing', 'Review invoice',
        jsonb_build_object('invoice_id', v_invoice.id,
          'automation_key', 'invoice-overdue:' || v_invoice.id::text)
      ) on conflict do nothing;
    end loop;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.process_commercial_invoice_overdue(date)
  from public, anon, authenticated;
grant execute on function private.process_commercial_invoice_overdue(date)
  to service_role;

create or replace function public.admin_process_commercial_invoice_overdue(
  p_as_of date default current_date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  return private.process_commercial_invoice_overdue(p_as_of);
end;
$$;

revoke all on function public.admin_process_commercial_invoice_overdue(date)
  from public, anon;
grant execute on function public.admin_process_commercial_invoice_overdue(date)
  to authenticated;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job
  where jobname = 'manohub-commercial-invoice-overdue'
  limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'manohub-commercial-invoice-overdue',
    '25 1 * * *',
    'select private.process_commercial_invoice_overdue(current_date);'
  );
end;
$$;

commit;

-- ===== END 63_commercial_billing_operations.sql =====

-- ===== START 64_platform_audit_and_usage_coverage.sql =====
-- Bridge major SaaS domains into the central immutable audit log and enrich
-- organization usage metering without duplicating advertising analytics.
begin;

alter table public.organization_usage_events
  add column if not exists actor_id uuid references auth.users(id) on delete set null,
  add column if not exists event_type text not null default 'consumed',
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists source text not null default 'application',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_event_type_check;
alter table public.organization_usage_events
  add constraint organization_usage_events_event_type_check
  check (event_type ~ '^[a-z][a-z0-9_]{1,79}$');
alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_source_check;
alter table public.organization_usage_events
  add constraint organization_usage_events_source_check
  check (source in ('application','database_trigger','automation','import','administrator'));
alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_metadata_check;
alter table public.organization_usage_events
  add constraint organization_usage_events_metadata_check
  check (jsonb_typeof(metadata) = 'object');

create index if not exists organization_usage_events_org_created_idx
  on public.organization_usage_events(org_id, created_at desc);
create index if not exists organization_usage_events_meter_created_idx
  on public.organization_usage_events(meter_key, created_at desc);

grant select on public.organization_usage_events to authenticated;
drop policy if exists usage_events_read on public.organization_usage_events;
create policy usage_events_read on public.organization_usage_events
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

create or replace function private.record_org_usage_event(
  p_org_id uuid,
  p_meter_key text,
  p_amount integer,
  p_idempotency_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_source text default 'database_trigger',
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if p_org_id is null or not exists(select 1 from public.organizations where id = p_org_id) then
    raise exception 'Valid organization is required';
  end if;
  if p_meter_key !~ '^[a-z][a-z0-9_]{1,79}$'
     or p_event_type !~ '^[a-z][a-z0-9_]{1,79}$' then
    raise exception 'Invalid usage meter or event type';
  end if;
  if p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid usage amount'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'An idempotency key is required';
  end if;
  if p_source not in ('application','database_trigger','automation','import','administrator') then
    raise exception 'Invalid usage source';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Usage metadata must be an object';
  end if;

  insert into public.organization_usage_events(
    org_id, meter_key, amount, idempotency_key, actor_id, event_type,
    entity_type, entity_id, source, metadata
  ) values (
    p_org_id, p_meter_key, p_amount, trim(p_idempotency_key),
    (select auth.uid()), p_event_type, nullif(trim(p_entity_type), ''),
    nullif(trim(p_entity_id), ''), p_source, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict(org_id, meter_key, idempotency_key) do nothing;

  if not found then
    select current_value into v_value
    from public.organization_usage_meters
    where org_id = p_org_id and meter_key = p_meter_key
      and period_start = v_period_start;
    return coalesce(v_value, 0);
  end if;

  insert into public.organization_usage_meters(
    org_id, meter_key, period_start, period_end, current_value
  ) values (
    p_org_id, p_meter_key, v_period_start, v_period_end, p_amount
  )
  on conflict(org_id, meter_key, period_start) do update
  set current_value = public.organization_usage_meters.current_value + p_amount,
      updated_at = now()
  returning current_value into v_value;
  return v_value;
end;
$$;

revoke all on function private.record_org_usage_event(
  uuid,text,integer,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function private.record_org_usage_event(
  uuid,text,integer,text,text,text,text,text,jsonb
) to service_role;

create or replace function private.capture_subscription_central_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    new.actor_id, new.org_id, 'subscription.' || new.event_type,
    'subscription', new.subscription_id::text,
    jsonb_build_object(
      'from_status', new.from_status,
      'to_status', new.to_status,
      'reason', new.reason,
      'source', 'subscription_events',
      'event_id', new.id
    )
  );
  return new;
end;
$$;
revoke all on function private.capture_subscription_central_audit()
  from public, anon, authenticated;
drop trigger if exists subscription_events_central_audit on public.subscription_events;
create trigger subscription_events_central_audit
after insert on public.subscription_events
for each row execute function private.capture_subscription_central_audit();

create or replace function private.capture_cms_central_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_actor uuid;
begin
  v_actor := coalesce(new.updated_by, new.created_by, (select auth.uid()));
  if tg_op = 'INSERT' then
    v_action := 'content.created';
  elsif new.deleted_at is distinct from old.deleted_at then
    v_action := case when new.deleted_at is null then 'content.restored' else 'content.deleted' end;
  elsif new.status is distinct from old.status then
    v_action := 'content.' || replace(new.status, '_', '.');
  else
    return new;
  end if;

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor, v_action, 'cms_content', new.id::text,
    jsonb_build_object(
      'content_type', new.content_type,
      'title', new.title,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', new.status,
      'source', 'database_trigger'
    )
  );
  return new;
end;
$$;
revoke all on function private.capture_cms_central_audit()
  from public, anon, authenticated;
drop trigger if exists cms_content_central_audit on public.cms_content;
create trigger cms_content_central_audit
after insert or update on public.cms_content
for each row execute function private.capture_cms_central_audit();

create or replace function private.capture_membership_central_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := coalesce(new.org_id, old.org_id);
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'membership.added';
  elsif tg_op = 'DELETE' then
    v_action := 'membership.removed';
  elsif new.role is distinct from old.role then
    v_action := 'membership.role_changed';
  else
    return coalesce(new, old);
  end if;

  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    (select auth.uid()), v_org_id, v_action, 'organization_member',
    v_user_id::text,
    jsonb_build_object(
      'previous_role', case when tg_op <> 'INSERT' then old.role end,
      'new_role', case when tg_op <> 'DELETE' then new.role end,
      'source', 'database_trigger'
    )
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.capture_membership_central_audit()
  from public, anon, authenticated;
drop trigger if exists organization_members_central_audit on public.organization_members;
create trigger organization_members_central_audit
after insert or update or delete on public.organization_members
for each row execute function private.capture_membership_central_audit();

create or replace function private.capture_agency_central_audit_and_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.agency_clients;
  v_action text;
begin
  v_row := coalesce(new, old);
  if tg_op = 'INSERT' then
    v_action := 'agency.client_invited';
    perform private.record_org_usage_event(
      v_row.agency_org_id, 'agency_client_links', 1,
      'agency-client:' || v_row.id::text, 'client_invited',
      'agency_client', v_row.id::text, 'database_trigger',
      jsonb_build_object('client_org_id', v_row.client_org_id)
    );
  elsif tg_op = 'DELETE' then
    v_action := 'agency.client_removed';
  elsif new.status is distinct from old.status then
    v_action := 'agency.client_status_changed';
  else
    return coalesce(new, old);
  end if;

  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    (select auth.uid()), v_row.agency_org_id, v_action, 'agency_client',
    v_row.id::text,
    jsonb_build_object(
      'client_org_id', v_row.client_org_id,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', case when tg_op <> 'DELETE' then new.status end,
      'source', 'database_trigger'
    )
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.capture_agency_central_audit_and_usage()
  from public, anon, authenticated;
drop trigger if exists agency_clients_central_audit_usage on public.agency_clients;
create trigger agency_clients_central_audit_usage
after insert or update or delete on public.agency_clients
for each row execute function private.capture_agency_central_audit_and_usage();

create or replace function private.capture_campaign_central_audit_and_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(
      actor_id, org_id, action, entity_type, entity_id, metadata
    ) values (
      coalesce(new.created_by, (select auth.uid())), new.org_id,
      'campaign.created', 'ad_campaign', new.id::text,
      jsonb_build_object('name', new.name, 'status', new.status, 'source', 'database_trigger')
    );
    perform private.record_org_usage_event(
      new.org_id, 'campaigns_created', 1, 'campaign:' || new.id::text,
      'campaign_created', 'ad_campaign', new.id::text, 'database_trigger',
      jsonb_build_object('status', new.status)
    );
  elsif new.status is distinct from old.status and new.status = 'active' then
    perform private.record_org_usage_event(
      new.org_id, 'campaign_activations', 1,
      'campaign-activated:' || new.id::text || ':' || coalesce(new.updated_at::text, now()::text),
      'campaign_activated', 'ad_campaign', new.id::text, 'database_trigger',
      jsonb_build_object('previous_status', old.status)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.capture_campaign_central_audit_and_usage()
  from public, anon, authenticated;
drop trigger if exists ad_campaigns_central_audit_usage on public.ad_campaigns;
create trigger ad_campaigns_central_audit_usage
after insert or update of status on public.ad_campaigns
for each row execute function private.capture_campaign_central_audit_and_usage();

create or replace function private.capture_advert_order_central_audit_and_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'advertising.order_created';
    perform private.record_org_usage_event(
      new.org_id, 'advert_orders_created', 1, 'advert-order:' || new.id::text,
      'order_created', 'advert_order', new.id::text, 'database_trigger',
      jsonb_build_object('currency', new.currency_code, 'total_amount', new.total_amount)
    );
  elsif new.status is distinct from old.status then
    v_action := 'advertising.order_status_changed';
    if new.status = 'paid' then
      perform private.record_org_usage_event(
        new.org_id, 'advert_orders_paid', 1,
        'advert-order-paid:' || new.id::text, 'order_paid',
        'advert_order', new.id::text, 'database_trigger',
        jsonb_build_object('currency', new.currency_code, 'total_amount', new.total_amount)
      );
    end if;
  else
    return new;
  end if;

  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    coalesce(new.verified_by, new.created_by, (select auth.uid())), new.org_id,
    v_action, 'advert_order', new.id::text,
    jsonb_build_object(
      'order_number', new.order_number,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', new.status,
      'currency', new.currency_code,
      'total_amount', new.total_amount,
      'source', 'database_trigger'
    )
  );
  return new;
end;
$$;
revoke all on function private.capture_advert_order_central_audit_and_usage()
  from public, anon, authenticated;
drop trigger if exists advert_orders_central_audit_usage on public.advert_orders;
create trigger advert_orders_central_audit_usage
after insert or update of status on public.advert_orders
for each row execute function private.capture_advert_order_central_audit_and_usage();

create or replace function public.admin_get_usage_metering_summary(
  p_days integer default 30
) returns table(
  org_id uuid,
  org_name text,
  meter_key text,
  total_amount bigint,
  event_count bigint,
  last_event_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_days < 1 or p_days > 366 then raise exception 'Days must be between 1 and 366'; end if;

  return query
  select e.org_id, o.name, e.meter_key, sum(e.amount)::bigint,
    count(*)::bigint, max(e.created_at)
  from public.organization_usage_events e
  join public.organizations o on o.id = e.org_id
  where e.created_at >= now() - make_interval(days => p_days)
  group by e.org_id, o.name, e.meter_key
  order by max(e.created_at) desc, o.name, e.meter_key;
end;
$$;

revoke all on function public.admin_get_usage_metering_summary(integer)
  from public, anon;
grant execute on function public.admin_get_usage_metering_summary(integer)
  to authenticated;

commit;

-- ===== END 64_platform_audit_and_usage_coverage.sql =====

-- ===== START 65_tenant_authorization_assurance.sql =====
-- Central tenant-authorization assurance and continuous RLS posture checks.

create table if not exists public.authorization_resource_registry (
  table_name text primary key,
  domain text not null,
  scope_columns text[] not null,
  data_classification text not null default 'confidential'
    check (data_classification in ('internal', 'confidential', 'restricted')),
  public_read_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  check (cardinality(scope_columns) > 0)
);

create table if not exists public.authorization_denials (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  permission text not null,
  resource_type text not null,
  resource_id text,
  reason_code text not null check (reason_code in (
    'unauthenticated', 'not_a_member', 'insufficient_role', 'organization_unavailable'
  )),
  source text not null default 'database',
  occurred_at timestamptz not null default now(),
  dedupe_key text not null unique
);

create index if not exists authorization_denials_occurred_idx
  on public.authorization_denials (occurred_at desc);
create index if not exists authorization_denials_org_occurred_idx
  on public.authorization_denials (org_id, occurred_at desc);
create index if not exists authorization_denials_actor_occurred_idx
  on public.authorization_denials (actor_id, occurred_at desc);

alter table public.authorization_resource_registry enable row level security;
alter table public.authorization_denials enable row level security;

drop policy if exists authorization_registry_admin_read on public.authorization_resource_registry;
create policy authorization_registry_admin_read
  on public.authorization_resource_registry for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists authorization_denials_admin_read on public.authorization_denials;
create policy authorization_denials_admin_read
  on public.authorization_denials for select to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.authorization_resource_registry from anon, authenticated;
revoke all on public.authorization_denials from anon, authenticated;
grant select on public.authorization_resource_registry to authenticated;
grant select on public.authorization_denials to authenticated;

insert into public.authorization_resource_registry
  (table_name, domain, scope_columns, data_classification, public_read_allowed)
values
  ('organization_members', 'organization', array['org_id'], 'restricted', false),
  ('ad_campaigns', 'campaign', array['org_id'], 'confidential', false),
  ('advert_orders', 'advertising', array['org_id'], 'restricted', false),
  ('advert_spend_entries', 'advertising', array['org_id'], 'restricted', false),
  ('agency_clients', 'agency', array['agency_org_id', 'client_org_id'], 'restricted', false),
  ('subscriptions', 'subscription', array['org_id'], 'restricted', false),
  ('commercial_invoices', 'billing', array['org_id'], 'restricted', false),
  ('commercial_payments', 'billing', array['org_id'], 'restricted', false),
  ('organization_usage_events', 'usage', array['org_id'], 'confidential', false),
  ('organization_usage_meters', 'usage', array['org_id'], 'confidential', false),
  ('audit_logs', 'audit', array['org_id'], 'restricted', false),
  ('opportunities', 'procurement', array['buyer_org_id'], 'confidential', true)
on conflict (table_name) do update set
  domain = excluded.domain,
  scope_columns = excluded.scope_columns,
  data_classification = excluded.data_classification,
  public_read_allowed = excluded.public_read_allowed;

create or replace function private.org_role_permissions(p_role text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_role
    when 'owner' then array[
      'organization.read', 'organization.manage', 'members.manage',
      'campaign.read', 'campaign.manage', 'advertising.read', 'advertising.manage',
      'agency.read', 'agency.manage', 'billing.read', 'billing.manage',
      'subscription.read', 'subscription.manage', 'usage.read', 'audit.read'
    ]::text[]
    when 'admin' then array[
      'organization.read', 'organization.manage', 'members.manage',
      'campaign.read', 'campaign.manage', 'advertising.read', 'advertising.manage',
      'agency.read', 'agency.manage', 'billing.read', 'billing.manage',
      'subscription.read', 'subscription.manage', 'usage.read', 'audit.read'
    ]::text[]
    when 'member' then array[
      'organization.read', 'campaign.read', 'campaign.manage',
      'advertising.read', 'advertising.manage', 'agency.read',
      'billing.read', 'subscription.read', 'usage.read', 'audit.read'
    ]::text[]
    else array[]::text[]
  end;
$$;

create or replace function public.get_org_permissions(p_org_id uuid)
returns table(role text, permissions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select om.role into caller_role
  from public.organization_members om
  where om.org_id = p_org_id and om.user_id = (select auth.uid());

  if caller_role is null and not public.is_platform_admin() then
    raise exception 'Organization access required';
  end if;

  return query select
    coalesce(caller_role, 'platform_admin'),
    case when caller_role is null
      then array['platform.*']::text[]
      else private.org_role_permissions(caller_role)
    end;
end;
$$;

revoke all on function public.get_org_permissions(uuid) from public, anon;
grant execute on function public.get_org_permissions(uuid) to authenticated;

create or replace function private.record_authorization_denial(
  p_org_id uuid,
  p_permission text,
  p_resource_type text,
  p_resource_id text,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket text;
begin
  bucket := concat_ws(':', coalesce((select auth.uid())::text, 'anonymous'),
    coalesce(p_org_id::text, 'none'), p_permission, p_resource_type,
    to_char(clock_timestamp(), 'YYYYMMDDHH24MI'));

  insert into public.authorization_denials (
    actor_id, org_id, permission, resource_type, resource_id, reason_code, dedupe_key
  ) values (
    (select auth.uid()), p_org_id, left(p_permission, 120), left(p_resource_type, 120),
    left(p_resource_id, 240), p_reason_code, encode(sha256(bucket::bytea), 'hex')
  ) on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function private.record_authorization_denial(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.check_org_permission(
  p_org_id uuid,
  p_permission text,
  p_resource_type text default 'organization',
  p_resource_id text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_role text;
  org_available boolean;
begin
  if (select auth.uid()) is null then
    perform private.record_authorization_denial(
      p_org_id, p_permission, p_resource_type, p_resource_id, 'unauthenticated'
    );
    return false;
  end if;

  if public.is_platform_admin() then return true; end if;

  select o.status = 'active' into org_available
  from public.organizations o where o.id = p_org_id;
  if coalesce(org_available, false) is false then
    perform private.record_authorization_denial(
      p_org_id, p_permission, p_resource_type, p_resource_id, 'organization_unavailable'
    );
    return false;
  end if;

  select om.role into caller_role
  from public.organization_members om
  where om.org_id = p_org_id and om.user_id = (select auth.uid());
  if caller_role is null then
    perform private.record_authorization_denial(
      p_org_id, p_permission, p_resource_type, p_resource_id, 'not_a_member'
    );
    return false;
  end if;

  if p_permission = any(private.org_role_permissions(caller_role)) then return true; end if;

  perform private.record_authorization_denial(
    p_org_id, p_permission, p_resource_type, p_resource_id, 'insufficient_role'
  );
  return false;
end;
$$;

revoke all on function public.check_org_permission(uuid, text, text, text) from public, anon;
grant execute on function public.check_org_permission(uuid, text, text, text) to authenticated;

create or replace function private.auto_enable_public_rls()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  command record;
begin
  for command in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
      and schema_name = 'public'
  loop
    execute format('alter table if exists %s enable row level security', command.object_identity);
  end loop;
end;
$$;

revoke all on function private.auto_enable_public_rls() from public, anon, authenticated;
drop event trigger if exists manohub_auto_enable_public_rls;
create event trigger manohub_auto_enable_public_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.auto_enable_public_rls();

create or replace function public.admin_get_authorization_assurance(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_days < 1 or p_days > 366 then raise exception 'Days must be between 1 and 366'; end if;

  with registered as (
    select r.*,
      c.oid as relation_id,
      coalesce(c.relrowsecurity, false) as rls_enabled,
      exists(select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid) as has_policy,
      exists(
        select 1 from pg_catalog.pg_policy p
        where p.polrelid = c.oid
          and (
            pg_catalog.pg_get_expr(p.polqual, p.polrelid) ilike '%is_org_member%'
            or pg_catalog.pg_get_expr(p.polqual, p.polrelid) ilike '%is_platform_admin%'
            or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) ilike '%is_org_member%'
            or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) ilike '%is_platform_admin%'
          )
      ) as has_tenant_guard
    from public.authorization_resource_registry r
    left join (
      select relation.oid, relation.relname, relation.relrowsecurity
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
    ) c on c.relname = r.table_name
  ), public_tables as (
    select c.relname, c.relrowsecurity
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  ), unsafe_functions as (
    select count(*)::integer as count
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
  ), denials as (
    select count(*)::integer as total,
      count(*) filter (where reason_code = 'not_a_member')::integer as cross_tenant,
      count(*) filter (where reason_code = 'insufficient_role')::integer as role_denials
    from public.authorization_denials
    where occurred_at >= now() - make_interval(days => p_days)
  )
  select jsonb_build_object(
    'generatedAt', now(), 'windowDays', p_days,
    'summary', jsonb_build_object(
      'publicTables', (select count(*) from public_tables),
      'rlsProtectedTables', (select count(*) from public_tables where relrowsecurity),
      'registeredResources', (select count(*) from registered),
      'passingResources', (select count(*) from registered where relation_id is not null and rls_enabled and has_policy and has_tenant_guard),
      'unsafeAnonDefiners', (select count from unsafe_functions),
      'authorizationDenials', (select total from denials),
      'crossTenantDenials', (select cross_tenant from denials),
      'roleDenials', (select role_denials from denials)
    ),
    'resources', coalesce((select jsonb_agg(jsonb_build_object(
      'tableName', table_name, 'domain', domain, 'classification', data_classification,
      'rlsEnabled', rls_enabled, 'hasPolicy', has_policy, 'hasTenantGuard', has_tenant_guard,
      'status', case when relation_id is not null and rls_enabled and has_policy and has_tenant_guard then 'pass' else 'attention' end
    ) order by domain, table_name) from registered), '[]'::jsonb),
    'recentDenials', coalesce((select jsonb_agg(item order by occurred_at desc) from (
      select jsonb_build_object('occurredAt', occurred_at, 'permission', permission,
        'resourceType', resource_type, 'reasonCode', reason_code, 'orgId', org_id) as item,
        occurred_at from public.authorization_denials
      where occurred_at >= now() - make_interval(days => p_days)
      order by occurred_at desc limit 50
    ) recent), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_get_authorization_assurance(integer) from public, anon;
grant execute on function public.admin_get_authorization_assurance(integer) to authenticated;

insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
values (null, 'security.authorization_assurance_enabled', 'platform_security', 'tenant-isolation',
  jsonb_build_object('registered_resources', 12, 'future_table_rls_guard', true));

-- ===== END 65_tenant_authorization_assurance.sql =====

-- ===== START 66_secure_backend_command_layer.sql =====
-- Durable command-envelope controls for sensitive application operations.

create table if not exists public.backend_command_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  command_name text not null,
  idempotency_key text not null,
  payload_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  result jsonb,
  error_code text,
  request_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (actor_id, command_name, idempotency_key)
);

create index if not exists backend_command_status_updated_idx
  on public.backend_command_requests (status, updated_at desc);
create index if not exists backend_command_actor_started_idx
  on public.backend_command_requests (actor_id, started_at desc);

alter table public.backend_command_requests enable row level security;
drop policy if exists backend_commands_actor_read on public.backend_command_requests;
create policy backend_commands_actor_read on public.backend_command_requests
  for select to authenticated
  using ((select auth.uid()) = actor_id or (select public.is_platform_admin()));

revoke all on public.backend_command_requests from anon, authenticated;
grant select on public.backend_command_requests to authenticated;

create or replace function public.claim_backend_command(
  p_command_name text,
  p_idempotency_key text,
  p_payload_hash text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.backend_command_requests;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not (p_command_name = any(array[
    'organization.invite','organization.transition','organization.recovery.decide',
    'subscription.transition','advertising.order.create','organization.verification.approve',
    'procurement.ingestion.promote','billing.payment.record','billing.credit.issue',
    'billing.refund.record'
  ])) then raise exception 'Unsupported command'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid payload hash'; end if;

  insert into public.backend_command_requests
    (actor_id, command_name, idempotency_key, payload_hash, request_id)
  values (actor, p_command_name, p_idempotency_key, p_payload_hash, left(p_request_id, 128))
  on conflict (actor_id, command_name, idempotency_key) do nothing
  returning * into existing;

  if found then
    return jsonb_build_object('execute', true, 'cached', false, 'commandId', existing.id);
  end if;

  select * into existing from public.backend_command_requests
  where actor_id = actor and command_name = p_command_name and idempotency_key = p_idempotency_key
  for update;

  if existing.payload_hash <> p_payload_hash then
    raise exception 'Idempotency key was already used with different input';
  end if;
  if existing.status = 'succeeded' then
    return jsonb_build_object('execute', false, 'cached', true, 'commandId', existing.id, 'result', existing.result);
  end if;
  if existing.status = 'processing' and existing.started_at < now() - interval '5 minutes' then
    update public.backend_command_requests set
      attempt_count = attempt_count + 1, started_at = now(), updated_at = now(),
      request_id = left(p_request_id, 128), error_code = null
    where id = existing.id;
  elsif existing.status = 'failed' then
    update public.backend_command_requests set
      status = 'processing', attempt_count = attempt_count + 1, started_at = now(),
      updated_at = now(), request_id = left(p_request_id, 128), error_code = null
    where id = existing.id;
  else
    raise exception 'Command is already processing';
  end if;

  return jsonb_build_object('execute', true, 'cached', false, 'commandId', existing.id);
end;
$$;

create or replace function public.complete_backend_command(p_command_id uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.backend_command_requests set status='succeeded', result=coalesce(p_result,'{}'::jsonb),
    completed_at=now(), updated_at=now(), error_code=null
  where id=p_command_id and actor_id=(select auth.uid()) and status='processing';
  if not found then raise exception 'Active command request not found'; end if;
end; $$;

create or replace function public.fail_backend_command(p_command_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.backend_command_requests set status='failed', error_code=left(p_error_code,80),
    completed_at=now(), updated_at=now()
  where id=p_command_id and actor_id=(select auth.uid()) and status='processing';
end; $$;

revoke all on function public.claim_backend_command(text,text,text,text) from public, anon;
revoke all on function public.complete_backend_command(uuid,jsonb) from public, anon;
revoke all on function public.fail_backend_command(uuid,text) from public, anon;
grant execute on function public.claim_backend_command(text,text,text,text) to authenticated;
grant execute on function public.complete_backend_command(uuid,jsonb) to authenticated;
grant execute on function public.fail_backend_command(uuid,text) to authenticated;

create or replace function public.admin_approve_organization_verification(
  p_request_id uuid, p_org_id uuid, p_request_type text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_request_type not in ('supplier','buyer') then raise exception 'Invalid request type'; end if;
  update public.verification_requests set status='verified', reviewed_by=(select auth.uid()), reviewed_at=now()
  where id=p_request_id and org_id=p_org_id and request_type=p_request_type
    and status in ('submitted','under_review','additional_info_required');
  if not found then raise exception 'Active verification request not found'; end if;
  perform public.admin_set_organization_verification(p_org_id,p_request_type,true);
end; $$;
revoke all on function public.admin_approve_organization_verification(uuid,uuid,text) from public, anon;
grant execute on function public.admin_approve_organization_verification(uuid,uuid,text) to authenticated;

create or replace function public.admin_get_backend_command_summary(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_days < 1 or p_days > 366 then raise exception 'Days must be between 1 and 366'; end if;
  select jsonb_build_object(
    'windowDays',p_days,
    'summary',jsonb_build_object(
      'total',count(*),'succeeded',count(*) filter(where status='succeeded'),
      'failed',count(*) filter(where status='failed'),'processing',count(*) filter(where status='processing'),
      'retries',coalesce(sum(greatest(attempt_count-1,0)),0)
    ),
    'commands',coalesce((select jsonb_agg(row_item order by total desc) from (
      select jsonb_build_object('commandName',command_name,'total',count(*),
        'succeeded',count(*) filter(where status='succeeded'),'failed',count(*) filter(where status='failed')) row_item,
        count(*) total from public.backend_command_requests
      where started_at>=now()-make_interval(days=>p_days) group by command_name
    ) grouped),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(row_item order by started_at desc) from (
      select jsonb_build_object('id',id,'commandName',command_name,'status',status,
        'attemptCount',attempt_count,'errorCode',error_code,'requestId',request_id,'startedAt',started_at) row_item,
        started_at from public.backend_command_requests
      where started_at>=now()-make_interval(days=>p_days) order by started_at desc limit 50
    ) recent_rows),'[]'::jsonb)
  ) into result from public.backend_command_requests
  where started_at>=now()-make_interval(days=>p_days);
  return result;
end; $$;

revoke all on function public.admin_get_backend_command_summary(integer) from public, anon;
grant execute on function public.admin_get_backend_command_summary(integer) to authenticated;

insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
values(null,'platform.backend_command_layer_enabled','platform_service','secure-command-gateway',
  jsonb_build_object('idempotency',true,'user_scoped_execution',true));

-- ===== END 66_secure_backend_command_layer.sql =====

-- ===== START 67_secure_bid_document_submissions.sql =====
create table if not exists public.bid_submissions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  response_id uuid not null references public.opportunity_responses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'withdrawn')),
  version integer not null default 1 check (version > 0),
  cover_note text,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (response_id, version)
);

create table if not exists public.bid_submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.bid_submissions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  mime_type text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists bid_submissions_opportunity_idx on public.bid_submissions(opportunity_id, status);
create index if not exists bid_submissions_org_idx on public.bid_submissions(org_id, updated_at desc);
create index if not exists bid_submission_documents_submission_idx on public.bid_submission_documents(submission_id);

create or replace function public.guard_bid_submission_transition()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if new.opportunity_id <> old.opportunity_id or new.response_id <> old.response_id
     or new.org_id <> old.org_id or new.submitted_by <> old.submitted_by
     or new.version <> old.version or new.created_at <> old.created_at then
    raise exception 'Bid submission identity and version are immutable';
  end if;
  if old.status = 'draft' and new.status = 'submitted' then
    if not exists (
      select 1 from public.opportunities o join public.opportunity_statuses s on s.id = o.status_id
      where o.id = old.opportunity_id and s.code in ('published', 'amended', 'deadline_extended')
        and (o.submission_deadline is null or o.submission_deadline >= now())
    ) then
      raise exception 'The tender is not accepting bid submissions';
    end if;
    if not exists (select 1 from public.bid_submission_documents d where d.submission_id = old.id) then
      raise exception 'Upload at least one document before submitting a bid';
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  elsif old.status = 'submitted' and new.status = 'withdrawn' then
    if exists (select 1 from public.opportunities o where o.id = old.opportunity_id and o.submission_deadline < now()) then
      raise exception 'The submission deadline has passed';
    end if;
    new.withdrawn_at := coalesce(new.withdrawn_at, now());
  elsif new.status <> old.status then
    raise exception 'Invalid bid submission status transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_bid_submission_transition() from public, anon, authenticated;
drop trigger if exists guard_bid_submission_transition on public.bid_submissions;
create trigger guard_bid_submission_transition before update on public.bid_submissions
for each row execute function public.guard_bid_submission_transition();

alter table public.bid_submissions enable row level security;
alter table public.bid_submission_documents enable row level security;

create policy bid_submissions_supplier_select on public.bid_submissions for select to authenticated
using (public.is_org_member(org_id));
create policy bid_submissions_buyer_select on public.bid_submissions for select to authenticated
using (exists (select 1 from public.opportunities o where o.id = opportunity_id and public.is_org_member(o.buyer_org_id)));
create policy bid_submissions_admin_select on public.bid_submissions for select to authenticated
using (public.is_platform_admin());
create policy bid_submissions_supplier_insert on public.bid_submissions for insert to authenticated
with check (
  public.is_org_member(org_id)
  and submitted_by = (select auth.uid())
  and exists (
    select 1 from public.opportunity_responses r
    join public.opportunities o on o.id = r.opportunity_id
    join public.opportunity_statuses s on s.id = o.status_id
    where r.id = response_id and r.opportunity_id = opportunity_id and r.org_id = org_id
      and r.status = 'active' and r.kind = 'intent_to_bid'
      and s.code in ('published', 'amended', 'deadline_extended')
      and (o.submission_deadline is null or o.submission_deadline >= now())
  )
);
create policy bid_submissions_supplier_update on public.bid_submissions for update to authenticated
using (public.is_org_member(org_id) and status in ('draft', 'submitted'))
with check (public.is_org_member(org_id) and submitted_by = (select auth.uid()));

create policy bid_documents_visible_with_submission on public.bid_submission_documents for select to authenticated
using (exists (select 1 from public.bid_submissions b where b.id = submission_id));
create policy bid_documents_supplier_insert on public.bid_submission_documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (select 1 from public.bid_submissions b where b.id = submission_id and b.status = 'draft' and public.is_org_member(b.org_id))
);
create policy bid_documents_supplier_delete on public.bid_submission_documents for delete to authenticated
using (exists (select 1 from public.bid_submissions b where b.id = submission_id and b.status = 'draft' and public.is_org_member(b.org_id)));

insert into storage.buckets (id, name, public, file_size_limit)
values ('bid-submissions', 'bid-submissions', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy bid_storage_supplier_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'bid-submissions'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.bid_submissions b
    where b.id = ((storage.foldername(name))[4])::uuid
      and b.org_id = ((storage.foldername(name))[1])::uuid
      and b.opportunity_id = ((storage.foldername(name))[3])::uuid
      and b.status = 'draft'
  )
);
create policy bid_storage_authorized_read on storage.objects for select to authenticated
using (
  bucket_id = 'bid-submissions'
  and exists (
    select 1 from public.bid_submission_documents d
    join public.bid_submissions b on b.id = d.submission_id
    join public.opportunities o on o.id = b.opportunity_id
    where d.storage_path = name
      and (public.is_org_member(b.org_id) or public.is_org_member(o.buyer_org_id) or public.is_platform_admin())
  )
);
create policy bid_storage_supplier_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'bid-submissions'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.bid_submissions b
    where b.id = ((storage.foldername(name))[4])::uuid
      and b.org_id = ((storage.foldername(name))[1])::uuid
      and b.opportunity_id = ((storage.foldername(name))[3])::uuid
      and b.status = 'draft'
  )
);

grant select, insert, update on public.bid_submissions to authenticated;
grant select, insert, delete on public.bid_submission_documents to authenticated;

-- ===== END 67_secure_bid_document_submissions.sql =====

-- ===== START 68_registration_subscriber_types.sql =====
insert into public.plans (id, code, name, description, monthly_price, annual_price, currency_code, is_active, sort_order)
values (
  'cf7afebf-ebc8-49c4-b809-a885f42c6b04',
  'advertiser',
  'Business Advertiser',
  'Submit advertising requests and monitor campaign delivery and performance.',
  null,
  null,
  'SLE',
  true,
  4
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  sort_order = excluded.sort_order;

update public.plans set sort_order = 5 where code = 'enterprise' and sort_order <= 4;

insert into public.plan_features (plan_id, feature_key, feature_label, limit_value)
select p.id, values_to_add.feature_key, values_to_add.feature_label, values_to_add.limit_value
from public.plans p
cross join (values
  ('business_advertising', 'Business Advertising Requests', 1),
  ('tender_alerts_and_details', 'Tender Detail Access & Alerts', 0),
  ('tender_publishing', 'Publish Tenders', 0),
  ('max_team_members', 'Team Members', 3),
  ('max_saved_searches', 'Saved Searches', 3),
  ('data_export', 'Data Exports', 0)
) as values_to_add(feature_key, feature_label, limit_value)
where p.code = 'advertiser'
  and not exists (
    select 1 from public.plan_features existing
    where existing.plan_id = p.id and existing.feature_key = values_to_add.feature_key
  );

create or replace function public.create_subscriber_organization(
  org_name text,
  org_type text,
  org_country text,
  org_district text,
  org_primary_objective text,
  org_monthly_budget text,
  subscriber_type text
)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_org public.organizations;
  selected_type text := lower(coalesce(subscriber_type, 'free'));
  selected_plan_id uuid;
  selected_plan_code text;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if selected_type not in ('free', 'viewer', 'publisher', 'advertiser') then
    raise exception 'Unknown subscriber type';
  end if;

  select *
  into new_org
  from public.create_organization(org_name, org_type, org_country, org_district, org_primary_objective, org_monthly_budget);

  selected_plan_code := case selected_type
    when 'viewer' then 'professional'
    when 'publisher' then 'business'
    when 'advertiser' then 'advertiser'
    else 'free'
  end;

  if selected_plan_code <> 'free' then
    select id into selected_plan_id from public.plans where code = selected_plan_code and is_active limit 1;
    if selected_plan_id is null then raise exception 'Selected subscription plan is unavailable'; end if;
    insert into public.subscriptions (org_id, plan_id, status, billing_cycle, payment_method, notes)
    values (new_org.id, selected_plan_id, 'pending', 'monthly', 'manual_bank_transfer', 'Requested during registration');
  end if;

  return new_org;
end;
$$;

revoke all on function public.create_subscriber_organization(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_subscriber_organization(text, text, text, text, text, text, text) to authenticated;

-- ===== END 68_registration_subscriber_types.sql =====

-- ===== START 69_fix_subscriber_organization_composite_assignment.sql =====
create or replace function public.create_subscriber_organization(
  org_name text,
  org_type text,
  org_country text,
  org_district text,
  org_primary_objective text,
  org_monthly_budget text,
  subscriber_type text
)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_org public.organizations;
  selected_type text := lower(coalesce(subscriber_type, 'free'));
  selected_plan_id uuid;
  selected_plan_code text;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if selected_type not in ('free', 'viewer', 'publisher', 'advertiser') then
    raise exception 'Unknown subscriber type';
  end if;

  -- A function returning a composite row must be expanded before assigning
  -- it to a row variable. Selecting it as one scalar attempts to cast the
  -- complete `(id,name,...)` record into the first UUID column.
  select *
  into new_org
  from public.create_organization(org_name, org_type, org_country, org_district, org_primary_objective, org_monthly_budget);

  selected_plan_code := case selected_type
    when 'viewer' then 'professional'
    when 'publisher' then 'business'
    when 'advertiser' then 'advertiser'
    else 'free'
  end;

  if selected_plan_code <> 'free' then
    select id into selected_plan_id from public.plans where code = selected_plan_code and is_active limit 1;
    if selected_plan_id is null then raise exception 'Selected subscription plan is unavailable'; end if;
    insert into public.subscriptions (org_id, plan_id, status, billing_cycle, payment_method, notes)
    values (new_org.id, selected_plan_id, 'pending', 'monthly', 'manual_bank_transfer', 'Requested during registration');
  end if;

  return new_org;
end;
$$;

revoke all on function public.create_subscriber_organization(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_subscriber_organization(text, text, text, text, text, text, text) to authenticated;

-- ===== END 69_fix_subscriber_organization_composite_assignment.sql =====

-- ===== START 70_subscription_payment_activation.sql =====
-- Dedicated payment evidence and atomic subscription approval/rejection.

begin;

create table if not exists public.subscription_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null unique references public.subscriptions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  payment_method text not null check (payment_method in ('bank_transfer', 'mobile_money')),
  payment_reference text not null check (length(trim(payment_reference)) between 3 and 120),
  amount numeric(14,2) check (amount is null or amount > 0),
  currency_code text not null default 'SLE' check (currency_code = 'SLE'),
  payer_name text check (payer_name is null or length(trim(payer_name)) <= 160),
  receipt_object_path text check (receipt_object_path is null or length(receipt_object_path) <= 500),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payment_proofs_review_queue_idx
  on public.subscription_payment_proofs (status, created_at)
  where status = 'pending';
create index if not exists subscription_payment_proofs_org_idx
  on public.subscription_payment_proofs (org_id, created_at desc);
create index if not exists subscription_payment_proofs_submitted_by_idx
  on public.subscription_payment_proofs (submitted_by);
create index if not exists subscription_payment_proofs_reviewed_by_idx
  on public.subscription_payment_proofs (reviewed_by)
  where reviewed_by is not null;

alter table public.subscription_payment_proofs enable row level security;
revoke all on table public.subscription_payment_proofs from public, anon, authenticated;
grant select on table public.subscription_payment_proofs to authenticated;

drop policy if exists subscription_payment_proofs_org_or_admin_read on public.subscription_payment_proofs;
create policy subscription_payment_proofs_org_or_admin_read on public.subscription_payment_proofs
  for select to authenticated
  using ((select public.is_org_member(org_id)) or (select public.is_platform_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subscription-payment-proofs',
  'subscription-payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists subscription_payment_storage_member_insert on storage.objects;
create policy subscription_payment_storage_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'subscription-payment-proofs'
    and (select public.is_org_member(((storage.foldername(name))[1])::uuid))
    and exists (
      select 1 from public.subscriptions s
      where s.id = ((storage.foldername(name))[2])::uuid
        and s.org_id = ((storage.foldername(name))[1])::uuid
        and s.status = 'pending'
    )
  );

drop policy if exists subscription_payment_storage_authorized_read on storage.objects;
create policy subscription_payment_storage_authorized_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'subscription-payment-proofs'
    and exists (
      select 1 from public.subscription_payment_proofs proof
      where proof.receipt_object_path = name
        and ((select public.is_org_member(proof.org_id)) or (select public.is_platform_admin()))
    )
  );

create or replace function public.submit_subscription_payment_proof(
  p_subscription_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_amount numeric default null,
  p_payer_name text default null,
  p_receipt_object_path text default null
) returns public.subscription_payment_proofs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_proof public.subscription_payment_proofs;
  v_reference text := trim(coalesce(p_payment_reference, ''));
  v_path text := nullif(trim(coalesce(p_receipt_object_path, '')), '');
begin
  if (select auth.uid()) is null then raise exception 'Sign in to submit payment evidence'; end if;
  if p_payment_method not in ('bank_transfer', 'mobile_money') then raise exception 'Choose bank transfer or mobile money'; end if;
  if length(v_reference) not between 3 and 120 then raise exception 'Enter a valid payment reference'; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if length(trim(coalesce(p_payer_name, ''))) > 160 then raise exception 'Payer name must not exceed 160 characters'; end if;

  select * into v_subscription from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription request not found'; end if;
  if not public.is_org_member(v_subscription.org_id) then raise exception 'Organization membership is required'; end if;
  if v_subscription.status <> 'pending' then raise exception 'Only pending subscription requests accept payment evidence'; end if;
  if v_path is not null and (
    split_part(v_path, '/', 1) <> v_subscription.org_id::text
    or split_part(v_path, '/', 2) <> v_subscription.id::text
  ) then raise exception 'Receipt path does not match the subscription request'; end if;

  insert into public.subscription_payment_proofs (
    subscription_id, org_id, payment_method, payment_reference, amount,
    payer_name, receipt_object_path, submitted_by
  ) values (
    v_subscription.id, v_subscription.org_id, p_payment_method, v_reference, p_amount,
    nullif(trim(coalesce(p_payer_name, '')), ''), v_path, (select auth.uid())
  )
  on conflict (subscription_id) do update set
    payment_method = excluded.payment_method,
    payment_reference = excluded.payment_reference,
    amount = excluded.amount,
    payer_name = excluded.payer_name,
    receipt_object_path = excluded.receipt_object_path,
    status = 'pending',
    submitted_by = excluded.submitted_by,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null,
    updated_at = now()
  where public.subscription_payment_proofs.status <> 'verified'
  returning * into v_proof;

  if v_proof.id is null then raise exception 'Verified payment evidence cannot be replaced'; end if;
  return v_proof;
end;
$$;

revoke all on function public.submit_subscription_payment_proof(uuid, text, text, numeric, text, text) from public, anon;
grant execute on function public.submit_subscription_payment_proof(uuid, text, text, numeric, text, text) to authenticated;

create or replace function public.review_subscription_payment(
  p_proof_id uuid,
  p_decision text,
  p_review_note text default null
) returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.subscription_payment_proofs;
  v_subscription public.subscriptions;
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_decision not in ('verified', 'rejected') then raise exception 'Decision must be verified or rejected'; end if;
  if p_decision = 'rejected' and v_note is null then raise exception 'A rejection reason is required'; end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Review note must not exceed 1000 characters'; end if;

  select * into v_proof from public.subscription_payment_proofs where id = p_proof_id for update;
  if not found then raise exception 'Payment evidence not found'; end if;
  if v_proof.status <> 'pending' then raise exception 'Payment evidence has already been reviewed'; end if;

  update public.subscription_payment_proofs set
    status = p_decision,
    reviewed_by = (select auth.uid()),
    reviewed_at = now(),
    review_note = v_note,
    updated_at = now()
  where id = v_proof.id;

  select * into v_subscription
  from public.transition_subscription(
    v_proof.subscription_id,
    case when p_decision = 'verified' then 'activate' else 'cancel' end,
    coalesce(v_note, 'Payment evidence verified'),
    current_date
  );

  return v_subscription;
end;
$$;

revoke all on function public.review_subscription_payment(uuid, text, text) from public, anon;
grant execute on function public.review_subscription_payment(uuid, text, text) to authenticated;

commit;

-- ===== END 70_subscription_payment_activation.sql =====

-- ===== START 71_explicit_internal_table_denials.sql =====
-- Make intentional API denials explicit for internal operational tables.
--
-- These tables are written by trusted SECURITY DEFINER functions and backend
-- workers. They must not be queried or mutated directly by anon or
-- authenticated API clients. RLS without a policy already denied that access;
-- these policies preserve the same behaviour while making the boundary
-- auditable and unambiguous to the database advisor.

begin;

create policy "API clients cannot access background jobs"
on private.background_jobs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access procurement search events"
on public.procurement_search_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access tender alert deliveries"
on public.tender_alert_deliveries
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access tender alert email events"
on public.tender_alert_email_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access tender alert email suppressions"
on public.tender_alert_email_suppressions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

commit;

-- ===== END 71_explicit_internal_table_denials.sql =====

-- ===== START 72_subscriber_workspace_profiles.sql =====
-- Durable subscriber identity, conditional onboarding data and profile updates.

begin;

alter table public.organizations
  add column if not exists subscriber_type text not null default 'free',
  add column if not exists city text,
  add column if not exists website text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists description text,
  add column if not exists audience_scope text,
  add column if not exists monthly_budget_sle numeric(14,2),
  add column if not exists subscriber_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_subscriber_type_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations add constraint organizations_subscriber_type_check
      check (subscriber_type in ('free', 'viewer', 'publisher', 'advertiser'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_monthly_budget_sle_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations add constraint organizations_monthly_budget_sle_check
      check (monthly_budget_sle is null or monthly_budget_sle >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_subscriber_details_object_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations add constraint organizations_subscriber_details_object_check
      check (jsonb_typeof(subscriber_details) = 'object');
  end if;
end $$;

-- Preserve the original text value for older records while exposing a proper
-- numeric SLE field for every new advertiser registration.
update public.organizations o
set subscriber_type = coalesce((
  select case p.code
    when 'professional' then 'viewer'
    when 'business' then 'publisher'
    when 'advertiser' then 'advertiser'
    else 'free'
  end
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.org_id = o.id
    and s.status in ('pending','trialing','active','past_due','grace_period','suspended')
  order by s.created_at desc
  limit 1
), 'free');

drop function if exists public.create_subscriber_organization(text, text, text, text, text, text, text);

create function public.create_subscriber_organization(
  org_name text,
  org_type text,
  org_country text,
  org_district text,
  org_city text,
  org_website text,
  org_phone text,
  org_whatsapp text,
  org_description text,
  org_primary_objective text,
  org_audience_scope text,
  org_monthly_budget_sle numeric,
  subscriber_type text,
  subscriber_details jsonb default '{}'::jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org public.organizations;
  v_type text := lower(trim(coalesce(subscriber_type, 'free')));
  v_details jsonb := coalesce(subscriber_details, '{}'::jsonb);
  v_plan_id uuid;
  v_plan_code text;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'You already have an organization. Sign in to access your existing workspace instead of creating a new one.';
  end if;
  if v_type not in ('free','viewer','publisher','advertiser') then raise exception 'Unknown subscriber type'; end if;
  if jsonb_typeof(v_details) <> 'object' then raise exception 'Subscriber details must be an object'; end if;
  if nullif(trim(coalesce(org_name, '')), '') is null then raise exception 'Organization name is required'; end if;
  if lower(trim(coalesce(org_country, ''))) = 'sierra leone'
     and nullif(trim(coalesce(org_district, '')), '') is null then
    raise exception 'Choose a Sierra Leone district';
  end if;
  if org_monthly_budget_sle is not null and org_monthly_budget_sle < 0 then
    raise exception 'Monthly budget cannot be negative';
  end if;

  insert into public.organizations (
    name, type, country, district, city, website, phone, whatsapp, description,
    primary_objective, audience_scope, monthly_budget_sle, monthly_budget,
    subscriber_type, subscriber_details, created_by, is_supplier, is_buyer
  ) values (
    trim(org_name), coalesce(nullif(trim(org_type), ''), 'Small Business'),
    coalesce(nullif(trim(org_country), ''), 'Sierra Leone'),
    nullif(trim(org_district), ''), nullif(trim(org_city), ''), nullif(trim(org_website), ''),
    nullif(trim(org_phone), ''), nullif(trim(org_whatsapp), ''), nullif(trim(org_description), ''),
    nullif(trim(org_primary_objective), ''), nullif(trim(org_audience_scope), ''),
    org_monthly_budget_sle,
    case when org_monthly_budget_sle is null then null else 'SLE ' || org_monthly_budget_sle::text end,
    v_type, v_details, v_user_id, v_type = 'viewer', v_type = 'publisher'
  ) returning * into v_org;

  insert into public.organization_members (org_id, user_id, role) values (v_org.id, v_user_id, 'owner');
  insert into public.brand_kits (org_id, brand_name, legal_name)
    values (v_org.id, v_org.name, v_org.name) on conflict (org_id) do nothing;

  if v_type = 'viewer' then
    insert into public.supplier_profiles (
      org_id, trading_name, registration_number, description, website, geographic_coverage
    ) values (
      v_org.id, v_org.name, nullif(v_details->>'registration_number',''), v_org.description,
      v_org.website, nullif(v_details->>'geographic_coverage','')
    ) on conflict (org_id) do nothing;
  elsif v_type = 'publisher' then
    insert into public.buyer_profiles (org_id, description, website)
      values (v_org.id, v_org.description, v_org.website) on conflict (org_id) do nothing;
  end if;

  v_plan_code := case v_type
    when 'viewer' then 'professional'
    when 'publisher' then 'business'
    when 'advertiser' then 'advertiser'
    else 'free'
  end;
  select id into v_plan_id from public.plans where code = v_plan_code and is_active limit 1;
  if v_plan_id is null then raise exception 'Selected subscription plan is unavailable'; end if;

  insert into public.subscriptions (
    org_id, plan_id, status, billing_cycle, payment_method, current_period_start, notes
  ) values (
    v_org.id, v_plan_id, case when v_type = 'free' then 'active' else 'pending' end,
    'monthly', 'invoice', case when v_type = 'free' then current_date else null end,
    case when v_type = 'free' then 'Free access activated during registration' else 'Requested during registration' end
  );

  return v_org;
end;
$$;

revoke all on function public.create_subscriber_organization(
  text,text,text,text,text,text,text,text,text,text,text,numeric,text,jsonb
) from public, anon;
grant execute on function public.create_subscriber_organization(
  text,text,text,text,text,text,text,text,text,text,text,numeric,text,jsonb
) to authenticated;

create or replace function public.update_subscriber_organization_profile(
  p_org_id uuid,
  p_name text,
  p_type text,
  p_country text,
  p_district text,
  p_city text,
  p_website text,
  p_phone text,
  p_whatsapp text,
  p_description text,
  p_primary_objective text,
  p_audience_scope text,
  p_monthly_budget_sle numeric,
  p_subscriber_details jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
  ) then raise exception 'Organization owner or administrator access is required'; end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then raise exception 'Organization name is required'; end if;
  if lower(trim(coalesce(p_country,''))) = 'sierra leone'
     and nullif(trim(coalesce(p_district,'')), '') is null then raise exception 'Choose a Sierra Leone district'; end if;
  if p_monthly_budget_sle is not null and p_monthly_budget_sle < 0 then raise exception 'Monthly budget cannot be negative'; end if;
  if jsonb_typeof(coalesce(p_subscriber_details,'{}'::jsonb)) <> 'object' then raise exception 'Subscriber details must be an object'; end if;

  update public.organizations set
    name=trim(p_name), type=trim(p_type), country=trim(p_country),
    district=nullif(trim(p_district),''), city=nullif(trim(p_city),''),
    website=nullif(trim(p_website),''), phone=nullif(trim(p_phone),''),
    whatsapp=nullif(trim(p_whatsapp),''), description=nullif(trim(p_description),''),
    primary_objective=nullif(trim(p_primary_objective),''), audience_scope=nullif(trim(p_audience_scope),''),
    monthly_budget_sle=p_monthly_budget_sle,
    monthly_budget=case when p_monthly_budget_sle is null then null else 'SLE ' || p_monthly_budget_sle::text end,
    subscriber_details=coalesce(p_subscriber_details,'{}'::jsonb), updated_at=now()
  where id=p_org_id returning * into v_org;

  if v_org.subscriber_type = 'viewer' then
    insert into public.supplier_profiles (org_id,trading_name,registration_number,description,website,geographic_coverage)
    values (v_org.id,v_org.name,nullif(v_org.subscriber_details->>'registration_number',''),v_org.description,v_org.website,nullif(v_org.subscriber_details->>'geographic_coverage',''))
    on conflict (org_id) do update set trading_name=excluded.trading_name,
      registration_number=excluded.registration_number,description=excluded.description,
      website=excluded.website,geographic_coverage=excluded.geographic_coverage,updated_at=now();
  elsif v_org.subscriber_type = 'publisher' then
    insert into public.buyer_profiles (org_id,description,website)
    values (v_org.id,v_org.description,v_org.website)
    on conflict (org_id) do update set description=excluded.description,website=excluded.website,updated_at=now();
  end if;
  return v_org;
end;
$$;

revoke all on function public.update_subscriber_organization_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,numeric,jsonb
) from public, anon;
grant execute on function public.update_subscriber_organization_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,numeric,jsonb
) to authenticated;

commit;

-- ===== END 72_subscriber_workspace_profiles.sql =====

-- ===== START 73_unified_subscriber_administration.sql =====
-- Unified subscriber administration, access revocation and privacy-safe purge.

begin;

alter table public.organizations
  add column if not exists purged_at timestamptz,
  add column if not exists purged_by uuid references auth.users(id) on delete set null;

alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('active','suspended','recovery_pending','closed','purged'));

create index if not exists organizations_subscriber_admin_idx
  on public.organizations (subscriber_type, status, created_at desc);

create table if not exists private.blocked_subscriber_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  former_org_id uuid not null,
  reason text not null,
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz not null default now()
);
revoke all on private.blocked_subscriber_users from public,anon,authenticated;

create or replace function private.prevent_blocked_subscriber_registration()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.created_by is not null and exists (
    select 1 from private.blocked_subscriber_users b where b.user_id=new.created_by
  ) then raise exception 'This account has been permanently removed and cannot create another workspace'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_blocked_subscriber_registration() from public,anon,authenticated;
drop trigger if exists prevent_blocked_subscriber_registration on public.organizations;
create trigger prevent_blocked_subscriber_registration before insert on public.organizations
for each row execute function private.prevent_blocked_subscriber_registration();

-- A lifecycle status change must end server-side sessions. Existing access
-- tokens remain subject to the organization status checks in the application
-- and entitlement functions until their short expiry.
create or replace function private.revoke_restricted_organization_sessions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('suspended','closed','purged') and new.status is distinct from old.status then
    delete from auth.sessions s
    using public.organization_members m
    where m.org_id = new.id and m.user_id = s.user_id;
  end if;
  return new;
end;
$$;
revoke all on function private.revoke_restricted_organization_sessions() from public,anon,authenticated;
drop trigger if exists revoke_restricted_organization_sessions on public.organizations;
create trigger revoke_restricted_organization_sessions
after update of status on public.organizations
for each row execute function private.revoke_restricted_organization_sessions();

drop function if exists public.admin_list_subscribers(text,text,text,integer,integer);
create function public.admin_list_subscribers(
  p_status text default null,
  p_subscriber_type text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  id uuid, name text, organization_type text, subscriber_type text,
  status text, status_reason text, country text, district text, city text,
  website text, phone text, whatsapp text, description text,
  audience_scope text, primary_objective text, monthly_budget_sle numeric,
  subscriber_details jsonb, owner_id uuid, owner_name text, owner_email text,
  member_count bigint, subscription_id uuid, plan_code text, plan_name text,
  subscription_status text, billing_cycle text, current_period_end timestamptz,
  created_at timestamptz, updated_at timestamptz, closed_at timestamptz,
  recoverable_until timestamptz, purged_at timestamptz,
  recovery_request_id uuid, recovery_reason text, total_count bigint
)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_status is not null and p_status not in ('active','suspended','recovery_pending','closed','purged') then
    raise exception 'Invalid subscriber status';
  end if;
  if p_subscriber_type is not null and p_subscriber_type not in ('free','viewer','publisher','advertiser') then
    raise exception 'Invalid subscriber type';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then raise exception 'Invalid pagination'; end if;

  return query
  with filtered as (
    select o.* from public.organizations o
    where (p_status is null or o.status = p_status)
      and (p_subscriber_type is null or o.subscriber_type = p_subscriber_type)
      and (
        nullif(trim(coalesce(p_search,'')),'') is null
        or o.name ilike '%'||trim(p_search)||'%'
        or o.phone ilike '%'||trim(p_search)||'%'
        or o.whatsapp ilike '%'||trim(p_search)||'%'
        or exists (
          select 1 from public.organization_members sm
          join public.profiles sp on sp.id=sm.user_id
          where sm.org_id=o.id and (sp.full_name ilike '%'||trim(p_search)||'%' or sp.email ilike '%'||trim(p_search)||'%')
        )
      )
  )
  select f.id,f.name,f.type,f.subscriber_type,f.status,f.status_reason,
    f.country,f.district,f.city,f.website,f.phone,f.whatsapp,f.description,
    f.audience_scope,f.primary_objective,f.monthly_budget_sle,f.subscriber_details,
    owner.user_id,owner.full_name,owner.email,
    (select count(*) from public.organization_members members where members.org_id=f.id),
    subscription.id,subscription.plan_code,subscription.plan_name,subscription.status,
    subscription.billing_cycle,subscription.current_period_end,
    f.created_at,f.updated_at,f.closed_at,f.recoverable_until,f.purged_at,
    recovery.id,recovery.reason,
    count(*) over()
  from filtered f
  left join lateral (
    select m.user_id,p.full_name,p.email
    from public.organization_members m join public.profiles p on p.id=m.user_id
    where m.org_id=f.id and m.role='owner' limit 1
  ) owner on true
  left join lateral (
    select s.id,p.code plan_code,p.name plan_name,s.status,s.billing_cycle,s.current_period_end
    from public.subscriptions s join public.plans p on p.id=s.plan_id
    where s.org_id=f.id order by s.created_at desc limit 1
  ) subscription on true
  left join lateral (
    select r.id,r.reason from public.organization_recovery_requests r
    where r.org_id=f.id and r.status='pending' order by r.created_at desc limit 1
  ) recovery on true
  order by case f.status when 'recovery_pending' then 0 when 'suspended' then 1 when 'closed' then 2 when 'purged' then 4 else 3 end,
    f.updated_at desc
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.admin_list_subscribers(text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_subscribers(text,text,text,integer,integer) to authenticated;

create or replace function public.admin_purge_subscriber(
  p_org_id uuid,
  p_confirmation text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target public.organizations;
  affected_users uuid[];
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
    raise exception 'A deletion reason between 10 and 1000 characters is required';
  end if;
  select * into target from public.organizations where id=p_org_id for update;
  if not found then raise exception 'Subscriber organization not found'; end if;
  if target.status <> 'closed' then raise exception 'Close the subscriber account before permanent removal'; end if;
  if target.recoverable_until is null or target.recoverable_until > now() then
    raise exception 'The 30-day recovery period has not expired';
  end if;
  if p_confirmation <> target.name then raise exception 'Organization name confirmation does not match'; end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id=m.user_id
    where m.org_id=p_org_id and p.platform_role='admin'
  ) then raise exception 'A platform administrator account cannot be purged'; end if;

  select coalesce(array_agg(user_id),'{}'::uuid[]) into affected_users
  from public.organization_members where org_id=p_org_id;

  delete from auth.sessions where user_id=any(affected_users);

  -- Anonymize profiles only when the person has no membership outside this
  -- subscriber. Financial and audit rows retain opaque identifiers.
  update public.profiles p set full_name='Deleted subscriber',email=null
  where p.id=any(affected_users)
    and not exists (
      select 1 from public.organization_members other
      where other.user_id=p.id and other.org_id<>p_org_id
    );

  insert into private.blocked_subscriber_users(user_id,former_org_id,reason,blocked_by)
  select user_id,p_org_id,trim(p_reason),(select auth.uid())
  from public.organization_members where org_id=p_org_id
  on conflict(user_id) do update set reason=excluded.reason,blocked_by=excluded.blocked_by,blocked_at=now();

  delete from public.organization_members where org_id=p_org_id;

  perform set_config('app.organization_lifecycle_override','on',true);
  update public.organizations set
    name='Deleted subscriber '||left(id::text,8), type='Deleted', country='Deleted',
    district=null,city=null,website=null,phone=null,whatsapp=null,description=null,
    audience_scope=null,primary_objective=null,monthly_budget=null,monthly_budget_sle=null,
    subscriber_details='{}'::jsonb,status='purged',status_reason=trim(p_reason),
    purged_at=now(),purged_by=(select auth.uid()),updated_at=now()
  where id=p_org_id;

  insert into public.audit_logs(actor_id,org_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),p_org_id,'subscriber.purged','organization',p_org_id::text,
    jsonb_build_object('reason',trim(p_reason),'affected_user_count',cardinality(affected_users)));

  return jsonb_build_object('organizationId',p_org_id,'status','purged','affectedUsers',cardinality(affected_users));
end;
$$;
revoke all on function public.admin_purge_subscriber(uuid,text,text) from public,anon;
grant execute on function public.admin_purge_subscriber(uuid,text,text) to authenticated;

-- Extend the idempotent command allowlist with the destructive purge command.
create or replace function public.claim_backend_command(
  p_command_name text,p_idempotency_key text,p_payload_hash text,p_request_id text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); existing public.backend_command_requests;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not (p_command_name = any(array[
    'organization.invite','organization.transition','organization.recovery.decide','organization.purge',
    'subscription.transition','advertising.order.create','organization.verification.approve',
    'procurement.ingestion.promote','billing.payment.record','billing.credit.issue','billing.refund.record'
  ])) then raise exception 'Unsupported command'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid payload hash'; end if;
  insert into public.backend_command_requests(actor_id,command_name,idempotency_key,payload_hash,request_id)
  values(actor,p_command_name,p_idempotency_key,p_payload_hash,left(p_request_id,128))
  on conflict(actor_id,command_name,idempotency_key) do nothing returning * into existing;
  if found then return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id); end if;
  select * into existing from public.backend_command_requests
  where actor_id=actor and command_name=p_command_name and idempotency_key=p_idempotency_key for update;
  if existing.payload_hash<>p_payload_hash then raise exception 'Idempotency key was already used with different input'; end if;
  if existing.status='succeeded' then return jsonb_build_object('execute',false,'cached',true,'commandId',existing.id,'result',existing.result); end if;
  if existing.status='processing' and existing.started_at<now()-interval '5 minutes' then
    update public.backend_command_requests set attempt_count=attempt_count+1,started_at=now(),updated_at=now(),request_id=left(p_request_id,128),error_code=null where id=existing.id;
  elsif existing.status='failed' then
    update public.backend_command_requests set status='processing',attempt_count=attempt_count+1,started_at=now(),updated_at=now(),request_id=left(p_request_id,128),error_code=null where id=existing.id;
  else raise exception 'Command is already processing'; end if;
  return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id);
end;
$$;
revoke all on function public.claim_backend_command(text,text,text,text) from public,anon;
grant execute on function public.claim_backend_command(text,text,text,text) to authenticated;

commit;

-- ===== END 73_unified_subscriber_administration.sql =====

-- ===== START 74_fix_subscriber_admin_period_type.sql =====
-- Match the subscriber listing contract to subscriptions.current_period_end (date).

begin;

drop function if exists public.admin_list_subscribers(text,text,text,integer,integer);
create function public.admin_list_subscribers(
  p_status text default null,p_subscriber_type text default null,p_search text default null,
  p_limit integer default 25,p_offset integer default 0
)
returns table(
  id uuid,name text,organization_type text,subscriber_type text,status text,status_reason text,
  country text,district text,city text,website text,phone text,whatsapp text,description text,
  audience_scope text,primary_objective text,monthly_budget_sle numeric,subscriber_details jsonb,
  owner_id uuid,owner_name text,owner_email text,member_count bigint,subscription_id uuid,
  plan_code text,plan_name text,subscription_status text,billing_cycle text,current_period_end date,
  created_at timestamptz,updated_at timestamptz,closed_at timestamptz,recoverable_until timestamptz,
  purged_at timestamptz,recovery_request_id uuid,recovery_reason text,total_count bigint
)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  if p_status is not null and p_status not in ('active','suspended','recovery_pending','closed','purged') then raise exception 'Invalid subscriber status'; end if;
  if p_subscriber_type is not null and p_subscriber_type not in ('free','viewer','publisher','advertiser') then raise exception 'Invalid subscriber type'; end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'Invalid pagination'; end if;
  return query
  with filtered as (
    select o.* from public.organizations o
    where (p_status is null or o.status=p_status)
      and (p_subscriber_type is null or o.subscriber_type=p_subscriber_type)
      and (nullif(trim(coalesce(p_search,'')),'') is null
        or o.name ilike '%'||trim(p_search)||'%'
        or o.phone ilike '%'||trim(p_search)||'%'
        or o.whatsapp ilike '%'||trim(p_search)||'%'
        or exists(select 1 from public.organization_members sm join public.profiles sp on sp.id=sm.user_id
          where sm.org_id=o.id and (sp.full_name ilike '%'||trim(p_search)||'%' or sp.email ilike '%'||trim(p_search)||'%')))
  )
  select f.id,f.name,f.type,f.subscriber_type,f.status,f.status_reason,f.country,f.district,f.city,
    f.website,f.phone,f.whatsapp,f.description,f.audience_scope,f.primary_objective,f.monthly_budget_sle,
    f.subscriber_details,owner.user_id,owner.full_name,owner.email,
    (select count(*) from public.organization_members members where members.org_id=f.id),
    subscription.id,subscription.plan_code,subscription.plan_name,subscription.status,
    subscription.billing_cycle,subscription.current_period_end,f.created_at,f.updated_at,f.closed_at,
    f.recoverable_until,f.purged_at,recovery.id,recovery.reason,count(*) over()
  from filtered f
  left join lateral(select m.user_id,p.full_name,p.email from public.organization_members m
    join public.profiles p on p.id=m.user_id where m.org_id=f.id and m.role='owner' limit 1) owner on true
  left join lateral(select s.id,p.code plan_code,p.name plan_name,s.status,s.billing_cycle,s.current_period_end
    from public.subscriptions s join public.plans p on p.id=s.plan_id
    where s.org_id=f.id order by s.created_at desc limit 1) subscription on true
  left join lateral(select r.id,r.reason from public.organization_recovery_requests r
    where r.org_id=f.id and r.status='pending' order by r.created_at desc limit 1) recovery on true
  order by case f.status when 'recovery_pending' then 0 when 'suspended' then 1 when 'closed' then 2 when 'purged' then 4 else 3 end,f.updated_at desc
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.admin_list_subscribers(text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_subscribers(text,text,text,integer,integer) to authenticated;

commit;

-- ===== END 74_fix_subscriber_admin_period_type.sql =====

select 'Batch 3/5 complete: migrations 60-74' as staging_migration_progress;
