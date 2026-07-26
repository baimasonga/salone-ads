-- Manohub advertising measurement quality controls.
-- Rejects obvious automation and server-side repeats without storing IP
-- addresses, user-agent strings, names, contact details, or user IDs.

begin;

create index if not exists advert_events_quality_window_idx
  on public.advert_events (
    advert_id,
    visitor_token_hash,
    event_type,
    action,
    created_at desc
  )
  where visitor_token_hash is not null;

-- The current frontend records all interactions through track_advert_event.
-- Remove public access to the retired counter-only RPCs so they cannot bypass
-- deduplication, taxonomy validation, or bot filtering.
revoke execute on function public.track_advert_view(text) from anon, authenticated;
revoke execute on function public.track_advert_click(uuid) from anon, authenticated;

create or replace function private.track_advert_event_internal(
  p_advert_id uuid,
  p_event_type text,
  p_visitor_token_hash text default null,
  p_action text default null,
  p_source text default null,
  p_channel text default null,
  p_referrer_host text default null,
  p_device_class text default null,
  p_country_code text default null,
  p_district text default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  event_inserted boolean := false;
  clean_action text := nullif(lower(trim(p_action)), '');
  clean_metadata jsonb := '{}'::jsonb;
  request_headers jsonb := '{}'::jsonb;
  request_user_agent text := '';
  recent_event_count integer := 0;
begin
  if p_event_type is null or p_event_type not in (
    'impression', 'detail_view', 'cta_click', 'share', 'download'
  ) then
    raise exception 'Unsupported public advertising event';
  end if;

  if p_device_class is not null
     and p_device_class not in ('mobile', 'tablet', 'desktop', 'other') then
    raise exception 'Unsupported device class';
  end if;

  if length(coalesce(p_visitor_token_hash, '')) > 128
     or length(coalesce(p_dedupe_key, '')) > 160
     or length(coalesce(p_action, '')) > 64
     or length(coalesce(p_source, '')) > 80
     or length(coalesce(p_channel, '')) > 40
     or length(coalesce(p_referrer_host, '')) > 255
     or length(coalesce(p_country_code, '')) > 2
     or length(coalesce(p_district, '')) > 80 then
    raise exception 'Advertising event value exceeds the allowed length';
  end if;

  -- Public measurements require opaque SHA-256 values. The raw browser token
  -- is never sent to or stored by Manohub.
  if coalesce(p_visitor_token_hash, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_dedupe_key, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  -- Keep the public event/action vocabulary strict so reporting categories
  -- cannot be polluted by arbitrary client values.
  if (p_event_type = 'impression' and clean_action is distinct from 'advert_card')
     or (p_event_type = 'detail_view' and clean_action is not null)
     or (
       p_event_type = 'cta_click'
       and clean_action not in ('whatsapp', 'phone', 'website', 'social')
     )
     or (
       p_event_type = 'share'
       and clean_action not in ('native_share', 'copy_link')
     )
     or (p_event_type = 'download' and clean_action is distinct from 'download') then
    return false;
  end if;

  -- Inspect the request user agent only in memory. It is intentionally not
  -- written to advert_events or metadata.
  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception
    when others then
      request_headers := '{}'::jsonb;
  end;
  request_user_agent := lower(coalesce(request_headers ->> 'user-agent', ''));

  if request_user_agent ~ (
    '(^|[^a-z])(bot|crawler|spider|slurp)([^a-z]|$)'
    '|headlesschrome|phantomjs|selenium|playwright'
    '|lighthouse|pagespeed|curl/|wget/|python-requests|postmanruntime'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.adverts a
    where a.id = p_advert_id
      and a.status = 'live'
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at >= now())
  ) then
    return false;
  end if;

  -- Enforce deduplication independently of the client-provided key:
  -- one impression/detail view per advert and visitor every 30 minutes, and
  -- one identical action every 10 seconds.
  if p_event_type in ('impression', 'detail_view') then
    if exists (
      select 1
      from public.advert_events ae
      where ae.advert_id = p_advert_id
        and ae.visitor_token_hash = p_visitor_token_hash
        and ae.event_type = p_event_type
        and ae.created_at >= now() - interval '30 minutes'
    ) then
      return false;
    end if;
  elsif exists (
    select 1
    from public.advert_events ae
    where ae.advert_id = p_advert_id
      and ae.visitor_token_hash = p_visitor_token_hash
      and ae.event_type = p_event_type
      and ae.action is not distinct from clean_action
      and ae.created_at >= now() - interval '10 seconds'
  ) then
    return false;
  end if;

  -- A generous privacy-safe ceiling limits scripted floods without tracking
  -- an IP address or preventing normal browsing across the advert feed.
  select count(*)
  into recent_event_count
  from public.advert_events ae
  where ae.visitor_token_hash = p_visitor_token_hash
    and ae.created_at >= now() - interval '5 minutes';

  if recent_event_count >= 120 then
    return false;
  end if;

  -- Accept at most 12 small scalar diagnostic values and remove keys that
  -- could contain personal or contact information.
  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into clean_metadata
  from (
    select entry.key, entry.value
    from jsonb_each(
      case
        when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
          then coalesce(p_metadata, '{}'::jsonb)
        else '{}'::jsonb
      end
    ) as entry
    where lower(entry.key) not in (
      'email', 'phone', 'telephone', 'whatsapp', 'name',
      'address', 'ip', 'user_id', 'user-agent', 'user_agent'
    )
      and jsonb_typeof(entry.value) in ('string', 'number', 'boolean', 'null')
    order by entry.key
    limit 12
  ) item;

  if pg_column_size(clean_metadata) > 2048 then
    clean_metadata := '{}'::jsonb;
  end if;

  insert into public.advert_events (
    advert_id,
    kind,
    event_type,
    action,
    source,
    channel,
    referrer_host,
    device_class,
    country_code,
    district,
    visitor_token_hash,
    dedupe_key,
    metadata
  )
  values (
    p_advert_id,
    case
      when p_event_type = 'detail_view' then 'view'
      when p_event_type in ('cta_click', 'share', 'download') then 'click'
      else 'view'
    end,
    p_event_type,
    clean_action,
    nullif(lower(trim(p_source)), ''),
    nullif(lower(trim(p_channel)), ''),
    nullif(lower(trim(p_referrer_host)), ''),
    p_device_class,
    nullif(upper(trim(p_country_code)), ''),
    nullif(trim(p_district), ''),
    p_visitor_token_hash,
    p_dedupe_key,
    clean_metadata
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  event_inserted := found;

  if event_inserted and p_event_type = 'detail_view' then
    update public.adverts
    set view_count = view_count + 1
    where id = p_advert_id;
  elsif event_inserted and p_event_type in ('cta_click', 'share', 'download') then
    update public.adverts
    set click_count = click_count + 1
    where id = p_advert_id;
  end if;

  return event_inserted;
end;
$function$;

-- Keep the legacy summary RPC aligned with the reporting RPC: unique reach is
-- distinct visitors who generated a qualified viewable impression.
create or replace function public.get_advert_performance(
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
begin
  if p_days < 1 or p_days > 366 then
    raise exception 'Days must be between 1 and 366';
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
    raise exception 'Advert access required';
  end if;

  with measured as (
    select *
    from public.advert_events
    where advert_id = p_advert_id
      and created_at >= now() - make_interval(days => p_days)
  ),
  action_counts as (
    select action, count(*)::bigint as action_count
    from measured
    where action is not null
    group by action
  )
  select jsonb_build_object(
    'advert_id', p_advert_id,
    'period_days', p_days,
    'impressions', (select count(*) from measured where event_type = 'impression'),
    'unique_viewers', (
      select count(distinct visitor_token_hash)
      from measured
      where event_type = 'impression'
        and visitor_token_hash is not null
    ),
    'detail_views', (select count(*) from measured where event_type = 'detail_view'),
    'cta_clicks', (select count(*) from measured where event_type = 'cta_click'),
    'shares', (select count(*) from measured where event_type = 'share'),
    'downloads', (select count(*) from measured where event_type = 'download'),
    'actions', coalesce(
      (select jsonb_object_agg(action, action_count) from action_counts),
      '{}'::jsonb
    )
  )
  into result;

  return coalesce(result, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_advert_performance(uuid, integer) from public, anon;
grant execute on function public.get_advert_performance(uuid, integer) to authenticated;

commit;
