-- Manohub advertising measurement foundation.
-- Extends the existing advert_events table without deleting legacy data.

begin;

create schema if not exists private;

alter table public.advert_events
  add column if not exists event_type text,
  add column if not exists action text,
  add column if not exists source text,
  add column if not exists channel text,
  add column if not exists referrer_host text,
  add column if not exists device_class text,
  add column if not exists country_code text,
  add column if not exists district text,
  add column if not exists visitor_token_hash text,
  add column if not exists dedupe_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.advert_events
set event_type = case kind
  when 'view' then 'detail_view'
  when 'click' then 'cta_click'
  else kind
end
where event_type is null;

alter table public.advert_events
  alter column event_type set not null;

alter table public.advert_events
  drop constraint if exists advert_events_event_type_check;

alter table public.advert_events
  add constraint advert_events_event_type_check
  check (event_type = any (array[
    'impression'::text,
    'detail_view'::text,
    'cta_click'::text,
    'share'::text,
    'download'::text,
    'lead'::text,
    'conversion'::text
  ]));

alter table public.advert_events
  drop constraint if exists advert_events_device_class_check;

alter table public.advert_events
  add constraint advert_events_device_class_check
  check (
    device_class is null
    or device_class = any (array['mobile'::text, 'tablet'::text, 'desktop'::text, 'other'::text])
  );

create unique index if not exists advert_events_dedupe_key_uidx
  on public.advert_events (dedupe_key)
  where dedupe_key is not null;

create index if not exists advert_events_type_created_idx
  on public.advert_events (event_type, created_at desc);

create index if not exists advert_events_advert_type_created_idx
  on public.advert_events (advert_id, event_type, created_at desc);

create index if not exists advert_events_visitor_created_idx
  on public.advert_events (visitor_token_hash, created_at desc)
  where visitor_token_hash is not null;

drop policy if exists advert_events_admin_read on public.advert_events;
drop policy if exists advert_events_owner_read on public.advert_events;

create policy advert_events_owner_read
on public.advert_events
for select
to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.adverts a
    where a.id = advert_events.advert_id
      and a.org_id is not null
      and public.is_org_member(a.org_id)
  )
);

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
  clean_metadata jsonb;
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

  -- Accept only small, non-identifying diagnostic values from public clients.
  clean_metadata := coalesce(p_metadata, '{}'::jsonb) - array[
    'email', 'phone', 'telephone', 'whatsapp', 'name', 'address', 'ip', 'user_id'
  ];
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
    nullif(trim(p_action), ''),
    nullif(trim(p_source), ''),
    nullif(trim(p_channel), ''),
    nullif(lower(trim(p_referrer_host)), ''),
    p_device_class,
    nullif(upper(trim(p_country_code)), ''),
    nullif(trim(p_district), ''),
    nullif(trim(p_visitor_token_hash), ''),
    nullif(trim(p_dedupe_key), ''),
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

revoke all on function private.track_advert_event_internal(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) from public;

grant usage on schema private to anon, authenticated;
grant execute on function private.track_advert_event_internal(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.track_advert_event(
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
language sql
volatile
security invoker
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select private.track_advert_event_internal(
    p_advert_id,
    p_event_type,
    p_visitor_token_hash,
    p_action,
    p_source,
    p_channel,
    p_referrer_host,
    p_device_class,
    p_country_code,
    p_district,
    p_dedupe_key,
    p_metadata
  );
$function$;

revoke all on function public.track_advert_event(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) from public;
grant execute on function public.track_advert_event(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated;

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

  select jsonb_build_object(
    'advert_id', p_advert_id,
    'period_days', p_days,
    'impressions', count(*) filter (where event_type = 'impression'),
    'unique_viewers', count(distinct visitor_token_hash) filter (
      where visitor_token_hash is not null
    ),
    'detail_views', count(*) filter (where event_type = 'detail_view'),
    'cta_clicks', count(*) filter (where event_type = 'cta_click'),
    'shares', count(*) filter (where event_type = 'share'),
    'downloads', count(*) filter (where event_type = 'download'),
    'actions', coalesce(
      jsonb_object_agg(action, action_count) filter (where action is not null),
      '{}'::jsonb
    )
  )
  into result
  from (
    select
      event_type,
      visitor_token_hash,
      action,
      count(*) over (partition by action) as action_count
    from public.advert_events
    where advert_id = p_advert_id
      and created_at >= now() - make_interval(days => p_days)
  ) measured;

  return coalesce(result, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_advert_performance(uuid, integer) from public;
grant execute on function public.get_advert_performance(uuid, integer) to authenticated;

commit;
