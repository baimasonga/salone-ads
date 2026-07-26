-- Commercial advertising measurement: goals, period-specific spend and
-- organisation-confirmed leads/sales. Subscription payments are deliberately
-- excluded because they are platform billing, not campaign media spend.

begin;

create table if not exists public.advert_commercial_settings (
  advert_id uuid primary key references public.adverts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  goal_type text not null default 'lead'
    check (goal_type in ('awareness', 'traffic', 'lead', 'sale')),
  budget_amount numeric(16, 2)
    check (budget_amount is null or budget_amount >= 0),
  currency_code text not null default 'SLE'
    check (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.advert_spend_entries (
  id uuid primary key default gen_random_uuid(),
  advert_id uuid not null references public.adverts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  amount numeric(16, 2) not null check (amount > 0),
  currency_code text not null default 'SLE'
    check (currency_code ~ '^[A-Z]{3}$'),
  spent_on date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.advert_outcomes (
  id uuid primary key default gen_random_uuid(),
  advert_id uuid not null references public.adverts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  outcome_type text not null check (outcome_type in ('lead', 'sale')),
  source_action text not null
    check (source_action in ('whatsapp', 'phone', 'website', 'social', 'offline', 'other')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  revenue_amount numeric(16, 2)
    check (revenue_amount is null or revenue_amount >= 0),
  currency_code text not null default 'SLE'
    check (currency_code ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    outcome_type <> 'sale'
    or status <> 'confirmed'
    or (revenue_amount is not null and revenue_amount > 0)
  ),
  check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  )
);

create index if not exists advert_commercial_settings_org_idx
  on public.advert_commercial_settings(org_id);
create index if not exists advert_spend_entries_advert_date_idx
  on public.advert_spend_entries(advert_id, spent_on desc);
create index if not exists advert_spend_entries_org_idx
  on public.advert_spend_entries(org_id);
create index if not exists advert_outcomes_advert_date_idx
  on public.advert_outcomes(advert_id, occurred_at desc);
create index if not exists advert_outcomes_org_status_idx
  on public.advert_outcomes(org_id, status, occurred_at desc);

create or replace function public.validate_advert_commercial_scope()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  advert_org_id uuid;
begin
  select a.org_id into advert_org_id
  from public.adverts a
  where a.id = new.advert_id;

  if advert_org_id is null or advert_org_id <> new.org_id then
    raise exception 'Advert and organisation do not match';
  end if;

  if tg_table_name = 'advert_commercial_settings' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif tg_table_name = 'advert_outcomes' then
    new.updated_at := now();
    new.created_by := coalesce(new.created_by, auth.uid());

    if new.status = 'confirmed' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
    else
      new.confirmed_at := null;
      new.confirmed_by := null;
    end if;
  elsif tg_table_name = 'advert_spend_entries' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_advert_commercial_settings_scope
  on public.advert_commercial_settings;
create trigger validate_advert_commercial_settings_scope
before insert or update on public.advert_commercial_settings
for each row execute function public.validate_advert_commercial_scope();

drop trigger if exists validate_advert_spend_scope
  on public.advert_spend_entries;
create trigger validate_advert_spend_scope
before insert or update on public.advert_spend_entries
for each row execute function public.validate_advert_commercial_scope();

drop trigger if exists validate_advert_outcome_scope
  on public.advert_outcomes;
create trigger validate_advert_outcome_scope
before insert or update on public.advert_outcomes
for each row execute function public.validate_advert_commercial_scope();

alter table public.advert_commercial_settings enable row level security;
alter table public.advert_spend_entries enable row level security;
alter table public.advert_outcomes enable row level security;

drop policy if exists advert_commercial_settings_read on public.advert_commercial_settings;
create policy advert_commercial_settings_read
on public.advert_commercial_settings for select
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_commercial_settings_insert on public.advert_commercial_settings;
create policy advert_commercial_settings_insert
on public.advert_commercial_settings for insert
to authenticated
with check (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_commercial_settings_update on public.advert_commercial_settings;
create policy advert_commercial_settings_update
on public.advert_commercial_settings for update
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id))
with check (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_commercial_settings_delete on public.advert_commercial_settings;
create policy advert_commercial_settings_delete
on public.advert_commercial_settings for delete
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_spend_entries_read on public.advert_spend_entries;
create policy advert_spend_entries_read
on public.advert_spend_entries for select
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_spend_entries_insert on public.advert_spend_entries;
create policy advert_spend_entries_insert
on public.advert_spend_entries for insert
to authenticated
with check (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_spend_entries_update on public.advert_spend_entries;
create policy advert_spend_entries_update
on public.advert_spend_entries for update
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id))
with check (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_spend_entries_delete on public.advert_spend_entries;
create policy advert_spend_entries_delete
on public.advert_spend_entries for delete
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_outcomes_read on public.advert_outcomes;
create policy advert_outcomes_read
on public.advert_outcomes for select
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_outcomes_insert on public.advert_outcomes;
create policy advert_outcomes_insert
on public.advert_outcomes for insert
to authenticated
with check (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_outcomes_update on public.advert_outcomes;
create policy advert_outcomes_update
on public.advert_outcomes for update
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id))
with check (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists advert_outcomes_delete on public.advert_outcomes;
create policy advert_outcomes_delete
on public.advert_outcomes for delete
to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

revoke all on table public.advert_commercial_settings from public, anon;
revoke all on table public.advert_spend_entries from public, anon;
revoke all on table public.advert_outcomes from public, anon;
grant select, insert, update, delete on table public.advert_commercial_settings
  to authenticated, service_role;
grant select, insert, update, delete on table public.advert_spend_entries
  to authenticated, service_role;
grant select, insert, update, delete on table public.advert_outcomes
  to authenticated, service_role;

revoke all on function public.validate_advert_commercial_scope() from public, anon, authenticated;
grant execute on function public.validate_advert_commercial_scope() to service_role;

create or replace function public.get_advert_performance_report(
  p_advert_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  result jsonb;
  bucket_unit text;
begin
  if p_days < 1 or p_days > 366 then
    raise exception 'Days must be between 1 and 366';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.adverts a
    where a.id = p_advert_id
      and (
        public.is_platform_admin()
        or (a.org_id is not null and public.is_org_member(a.org_id))
      )
  ) then
    raise exception 'Advertising report access denied';
  end if;

  bucket_unit := case
    when p_days <= 31 then 'day'
    when p_days <= 120 then 'week'
    else 'month'
  end;

  with scoped as (
    select
      ae.event_type,
      ae.action,
      coalesce(nullif(trim(ae.source), ''), 'direct') as source,
      coalesce(nullif(trim(ae.device_class), ''), 'other') as device_class,
      ae.visitor_token_hash,
      ae.created_at
    from public.advert_events ae
    where ae.advert_id = p_advert_id
      and ae.created_at >= now() - make_interval(days => p_days)
  ),
  totals as (
    select
      count(*) filter (where event_type = 'impression')::bigint as impressions,
      count(distinct visitor_token_hash) filter (
        where event_type = 'impression' and visitor_token_hash is not null
      )::bigint as unique_viewers,
      count(*) filter (where event_type = 'detail_view')::bigint as detail_views,
      count(*) filter (where event_type = 'cta_click')::bigint as cta_clicks,
      count(*) filter (where event_type = 'share')::bigint as shares,
      count(*) filter (where event_type = 'download')::bigint as downloads
    from scoped
  ),
  series as (
    select
      date_trunc(bucket_unit, created_at) as bucket,
      count(*) filter (where event_type = 'impression')::bigint as impressions,
      count(distinct visitor_token_hash) filter (
        where event_type = 'impression' and visitor_token_hash is not null
      )::bigint as unique_viewers,
      count(*) filter (where event_type = 'detail_view')::bigint as detail_views,
      count(*) filter (where event_type = 'cta_click')::bigint as cta_clicks,
      count(*) filter (where event_type = 'share')::bigint as shares,
      count(*) filter (where event_type = 'download')::bigint as downloads
    from scoped
    group by 1
    order by 1
  ),
  source_counts as (
    select source as label, count(*)::bigint as value
    from scoped
    group by source
    order by count(*) desc, source
  ),
  device_counts as (
    select device_class as label, count(*)::bigint as value
    from scoped
    group by device_class
    order by count(*) desc, device_class
  ),
  action_counts as (
    select coalesce(nullif(trim(action), ''), event_type) as label, count(*)::bigint as value
    from scoped
    where event_type in ('cta_click', 'share', 'download', 'detail_view')
    group by 1
    order by count(*) desc, 1
  ),
  commercial as (
    select
      coalesce(acs.goal_type, 'lead') as goal_type,
      acs.budget_amount,
      coalesce(acs.currency_code, 'SLE') as currency_code,
      coalesce((
        select sum(ase.amount)
        from public.advert_spend_entries ase
        where ase.advert_id = p_advert_id
          and ase.spent_on >= current_date - p_days
      ), 0)::numeric as actual_spend,
      (
        select count(*)::bigint
        from public.advert_outcomes ao
        where ao.advert_id = p_advert_id
          and ao.status = 'confirmed'
          and ao.outcome_type = 'lead'
          and ao.occurred_at >= now() - make_interval(days => p_days)
      ) as confirmed_leads,
      (
        select count(*)::bigint
        from public.advert_outcomes ao
        where ao.advert_id = p_advert_id
          and ao.status = 'confirmed'
          and ao.outcome_type = 'sale'
          and ao.occurred_at >= now() - make_interval(days => p_days)
      ) as confirmed_sales,
      coalesce((
        select sum(ao.revenue_amount)
        from public.advert_outcomes ao
        where ao.advert_id = p_advert_id
          and ao.status = 'confirmed'
          and ao.outcome_type = 'sale'
          and ao.occurred_at >= now() - make_interval(days => p_days)
      ), 0)::numeric as confirmed_revenue,
      (
        select count(*)::bigint
        from public.advert_outcomes ao
        where ao.advert_id = p_advert_id
          and ao.status = 'pending'
          and ao.occurred_at >= now() - make_interval(days => p_days)
      ) as pending_outcomes,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'outcome_type', recent.outcome_type,
          'source_action', recent.source_action,
          'status', recent.status,
          'revenue_amount', recent.revenue_amount,
          'currency_code', recent.currency_code,
          'occurred_at', recent.occurred_at,
          'note', recent.note
        ) order by recent.occurred_at desc)
        from (
          select ao.*
          from public.advert_outcomes ao
          where ao.advert_id = p_advert_id
            and ao.occurred_at >= now() - make_interval(days => p_days)
          order by ao.occurred_at desc
          limit 50
        ) recent
      ), '[]'::jsonb) as recent_outcomes
    from (select 1) seed
    left join public.advert_commercial_settings acs
      on acs.advert_id = p_advert_id
  )
  select jsonb_build_object(
    'advert_id', p_advert_id,
    'period_days', p_days,
    'granularity', bucket_unit,
    'impressions', totals.impressions,
    'unique_viewers', totals.unique_viewers,
    'detail_views', totals.detail_views,
    'cta_clicks', totals.cta_clicks,
    'shares', totals.shares,
    'downloads', totals.downloads,
    'time_series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period', bucket,
        'impressions', impressions,
        'unique_viewers', unique_viewers,
        'detail_views', detail_views,
        'cta_clicks', cta_clicks,
        'shares', shares,
        'downloads', downloads
      ) order by bucket)
      from series
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'value', value))
      from source_counts
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'value', value))
      from device_counts
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_object_agg(label, value)
      from action_counts
    ), '{}'::jsonb),
    'commercial', jsonb_build_object(
      'goal_type', commercial.goal_type,
      'budget_amount', commercial.budget_amount,
      'currency_code', commercial.currency_code,
      'actual_spend', commercial.actual_spend,
      'confirmed_leads', commercial.confirmed_leads,
      'confirmed_sales', commercial.confirmed_sales,
      'confirmed_revenue', commercial.confirmed_revenue,
      'pending_outcomes', commercial.pending_outcomes,
      'recent_outcomes', commercial.recent_outcomes
    )
  )
  into result
  from totals
  cross join commercial;

  return result;
end;
$function$;

revoke all on function public.get_advert_performance_report(uuid, integer)
  from public, anon;
grant execute on function public.get_advert_performance_report(uuid, integer)
  to authenticated, service_role;

commit;
