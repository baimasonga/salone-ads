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
