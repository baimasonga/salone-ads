-- Privacy-safe deduplication, rate controls and retention for public metrics.
-- Apply after 33_core_rls_policy_consolidation.sql.

begin;

create schema if not exists private;

create table if not exists public.opportunity_view_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  visitor_token_hash text not null,
  viewed_at timestamptz not null default now(),
  constraint opportunity_view_events_hash_check
    check (visitor_token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists opportunity_view_events_lookup_idx
  on public.opportunity_view_events (
    opportunity_id,
    visitor_token_hash,
    viewed_at desc
  );
create index if not exists opportunity_view_events_visitor_idx
  on public.opportunity_view_events (visitor_token_hash, viewed_at desc);

alter table public.opportunity_view_events enable row level security;
revoke all on table public.opportunity_view_events from anon, authenticated;
grant select on table public.opportunity_view_events to authenticated;
drop policy if exists opportunity_view_events_admin_read on public.opportunity_view_events;
create policy opportunity_view_events_admin_read
on public.opportunity_view_events
for select
to authenticated
using ((select public.is_platform_admin()));

alter table public.tracking_link_clicks
  add column if not exists visitor_token_hash text,
  add column if not exists referrer_host text;

alter table public.tracking_link_clicks
  drop constraint if exists tracking_link_clicks_hash_check;
alter table public.tracking_link_clicks
  add constraint tracking_link_clicks_hash_check
  check (
    visitor_token_hash is null
    or visitor_token_hash ~ '^[0-9a-f]{64}$'
  );

create index if not exists tracking_link_clicks_visitor_window_idx
  on public.tracking_link_clicks (
    visitor_token_hash,
    tracking_link_id,
    clicked_at desc
  )
  where visitor_token_hash is not null;

create table if not exists private.measurement_rejection_rollups (
  bucket_hour timestamptz not null,
  event_scope text not null,
  reason text not null,
  entity_id text not null,
  rejected_count bigint not null default 1,
  last_seen_at timestamptz not null default now(),
  primary key (bucket_hour, event_scope, reason, entity_id)
);

create table if not exists private.measurement_maintenance_state (
  job_name text primary key,
  last_run_at timestamptz not null
);

revoke all on table private.measurement_rejection_rollups from public, anon, authenticated;
revoke all on table private.measurement_maintenance_state from public, anon, authenticated;

create or replace function private.record_measurement_rejection(
  p_event_scope text,
  p_reason text,
  p_entity_id text
)
returns void
language sql
security definer
set search_path to 'pg_catalog'
as $function$
  insert into private.measurement_rejection_rollups (
    bucket_hour,
    event_scope,
    reason,
    entity_id
  )
  values (
    date_trunc('hour', now()),
    left(coalesce(p_event_scope, 'unknown'), 40),
    left(coalesce(p_reason, 'unknown'), 40),
    left(coalesce(p_entity_id, 'unknown'), 100)
  )
  on conflict (bucket_hour, event_scope, reason, entity_id)
  do update set
    rejected_count = private.measurement_rejection_rollups.rejected_count + 1,
    last_seen_at = now();
$function$;

create or replace function private.maybe_prune_public_measurements()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  claimed boolean := false;
begin
  insert into private.measurement_maintenance_state (job_name, last_run_at)
  values ('public_measurement_retention', now())
  on conflict (job_name)
  do update set last_run_at = excluded.last_run_at
  where private.measurement_maintenance_state.last_run_at < now() - interval '1 day'
  returning true into claimed;

  if not coalesce(claimed, false) then
    return;
  end if;

  delete from public.opportunity_view_events
  where ctid in (
    select ctid
    from public.opportunity_view_events
    where viewed_at < now() - interval '90 days'
    limit 5000
  );

  delete from public.advert_events
  where ctid in (
    select ctid
    from public.advert_events
    where created_at < now() - interval '400 days'
    limit 5000
  );

  delete from public.tracking_link_clicks
  where ctid in (
    select ctid
    from public.tracking_link_clicks
    where clicked_at < now() - interval '400 days'
    limit 5000
  );

  delete from private.measurement_rejection_rollups
  where ctid in (
    select ctid
    from private.measurement_rejection_rollups
    where bucket_hour < now() - interval '90 days'
    limit 5000
  );
end;
$function$;

revoke all on function private.record_measurement_rejection(text, text, text)
  from public, anon, authenticated;
revoke all on function private.maybe_prune_public_measurements()
  from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.record_measurement_rejection(text, text, text)
  to anon, authenticated, service_role;
grant execute on function private.maybe_prune_public_measurements()
  to anon, authenticated, service_role;

-- Protected overload. The legacy one-argument function remains temporarily
-- available until the updated frontend has completed production rollout.
create or replace function public.increment_opportunity_view(
  p_opportunity_id uuid,
  p_visitor_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  request_headers jsonb := '{}'::jsonb;
  request_user_agent text := '';
  recent_count integer := 0;
begin
  if coalesce(p_visitor_token_hash, '') !~ '^[0-9a-f]{64}$' then
    perform private.record_measurement_rejection(
      'tender_view', 'invalid_visitor_token', p_opportunity_id::text
    );
    return false;
  end if;

  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;
  request_user_agent := lower(coalesce(request_headers ->> 'user-agent', ''));
  if request_user_agent ~ (
    '(^|[^a-z])(bot|crawler|spider|slurp)([^a-z]|$)'
    '|headlesschrome|phantomjs|selenium|playwright'
    '|lighthouse|pagespeed|curl/|wget/|python-requests|postmanruntime'
  ) then
    perform private.record_measurement_rejection(
      'tender_view', 'automated_client', p_opportunity_id::text
    );
    return false;
  end if;

  if not exists (
    select 1
    from public.opportunities o
    join public.opportunity_statuses s on s.id = o.status_id
    where o.id = p_opportunity_id
      and s.code in (
        'published', 'amended', 'deadline_extended', 'closed', 'awarded'
      )
  ) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_opportunity_id::text || ':' || p_visitor_token_hash,
      0
    )
  );

  if exists (
    select 1
    from public.opportunity_view_events ove
    where ove.opportunity_id = p_opportunity_id
      and ove.visitor_token_hash = p_visitor_token_hash
      and ove.viewed_at >= now() - interval '30 minutes'
  ) then
    return false;
  end if;

  select count(*) into recent_count
  from public.opportunity_view_events ove
  where ove.visitor_token_hash = p_visitor_token_hash
    and ove.viewed_at >= now() - interval '5 minutes';

  if recent_count >= 60 then
    perform private.record_measurement_rejection(
      'tender_view', 'rate_limit', p_opportunity_id::text
    );
    return false;
  end if;

  insert into public.opportunity_view_events (
    opportunity_id,
    visitor_token_hash
  )
  values (p_opportunity_id, p_visitor_token_hash);

  update public.opportunities
  set view_count = view_count + 1
  where id = p_opportunity_id;

  perform private.maybe_prune_public_measurements();
  return true;
end;
$function$;

revoke all on function public.increment_opportunity_view(uuid, text)
  from public, anon, authenticated;
grant execute on function public.increment_opportunity_view(uuid, text)
  to anon, authenticated, service_role;

-- Protected overload for the server redirect. It stores only the hostname and
-- an opaque cookie-token hash, never a raw IP address or full referrer URL.
create or replace function public.resolve_tracking_link(
  p_code text,
  p_referrer_host text,
  p_visitor_token_hash text
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  link_row record;
  request_headers jsonb := '{}'::jsonb;
  request_user_agent text := '';
  recent_count integer := 0;
begin
  if coalesce(p_code, '') !~ '^[a-zA-Z0-9_-]{4,64}$' then
    return null;
  end if;

  select id, org_id, target_url
  into link_row
  from public.tracking_links
  where short_code = p_code;

  if link_row.id is null
     or link_row.target_url !~* '^https?://[^[:space:]]+$' then
    return null;
  end if;

  if coalesce(p_visitor_token_hash, '') !~ '^[0-9a-f]{64}$' then
    perform private.record_measurement_rejection(
      'tracking_redirect', 'invalid_visitor_token', link_row.id::text
    );
    return link_row.target_url;
  end if;

  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;
  request_user_agent := lower(coalesce(request_headers ->> 'user-agent', ''));
  if request_user_agent ~ (
    '(^|[^a-z])(bot|crawler|spider|slurp)([^a-z]|$)'
    '|headlesschrome|phantomjs|selenium|playwright'
    '|lighthouse|pagespeed|curl/|wget/|python-requests|postmanruntime'
  ) then
    perform private.record_measurement_rejection(
      'tracking_redirect', 'automated_client', link_row.id::text
    );
    return link_row.target_url;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      link_row.id::text || ':' || p_visitor_token_hash,
      0
    )
  );

  if exists (
    select 1
    from public.tracking_link_clicks tlc
    where tlc.tracking_link_id = link_row.id
      and tlc.visitor_token_hash = p_visitor_token_hash
      and tlc.clicked_at >= now() - interval '10 minutes'
  ) then
    return link_row.target_url;
  end if;

  select count(*) into recent_count
  from public.tracking_link_clicks tlc
  where tlc.visitor_token_hash = p_visitor_token_hash
    and tlc.clicked_at >= now() - interval '5 minutes';

  if recent_count >= 100 then
    perform private.record_measurement_rejection(
      'tracking_redirect', 'rate_limit', link_row.id::text
    );
    return link_row.target_url;
  end if;

  update public.tracking_links
  set click_count = click_count + 1
  where id = link_row.id;

  insert into public.tracking_link_clicks (
    tracking_link_id,
    org_id,
    visitor_token_hash,
    referrer_host,
    referrer
  )
  values (
    link_row.id,
    link_row.org_id,
    p_visitor_token_hash,
    left(nullif(lower(trim(p_referrer_host)), ''), 255),
    null
  );

  perform private.maybe_prune_public_measurements();
  return link_row.target_url;
end;
$function$;

revoke all on function public.resolve_tracking_link(text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_tracking_link(text, text, text)
  to anon, authenticated, service_role;

-- Keep advert measurement retention on the same successful-event path.
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
language plpgsql
volatile
security invoker
set search_path to 'pg_catalog'
as $function$
declare
  accepted boolean;
begin
  accepted := private.track_advert_event_internal(
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
  if accepted then
    perform private.maybe_prune_public_measurements();
  end if;
  return accepted;
end;
$function$;

revoke all on function public.track_advert_event(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.track_advert_event(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated, service_role;

create or replace function public.get_measurement_abuse_summary(
  p_days integer default 7
)
returns table (
  event_scope text,
  reason text,
  entity_id text,
  rejected_count bigint,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Admin access required';
  end if;
  if p_days < 1 or p_days > 90 then
    raise exception 'Days must be between 1 and 90';
  end if;

  return query
  select
    r.event_scope,
    r.reason,
    r.entity_id,
    sum(r.rejected_count)::bigint,
    max(r.last_seen_at)
  from private.measurement_rejection_rollups r
  where r.bucket_hour >= now() - make_interval(days => p_days)
  group by r.event_scope, r.reason, r.entity_id
  order by sum(r.rejected_count) desc, max(r.last_seen_at) desc
  limit 200;
end;
$function$;

revoke all on function public.get_measurement_abuse_summary(integer)
  from public, anon, authenticated;
grant execute on function public.get_measurement_abuse_summary(integer)
  to authenticated, service_role;

commit;
