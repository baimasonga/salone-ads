-- Grouped, owner-scoped advertising performance reporting.

begin;

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
    ), '{}'::jsonb)
  )
  into result
  from totals;

  return result;
end;
$function$;

revoke all on function public.get_advert_performance_report(uuid, integer) from public, anon;
grant execute on function public.get_advert_performance_report(uuid, integer) to authenticated, service_role;

commit;
