-- HYDERRA STAGING ONLY: project gknewzlxndmummwynuoa
-- Batch 1 of 5. Requires migrations through 32.
-- Original SQL follows unchanged; transactions are preserved.
-- On any error STOP. Earlier migrations may have committed.


-- ===== START 33_core_rls_policy_consolidation.sql =====
-- Consolidate core subscription and supplier RLS policies by role and command.
-- Apply after 32_private_feature_helper.sql.

begin;

-- Remove broad Data API privileges before granting only required operations.
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.supplier_profiles from anon, authenticated;
revoke all on table public.supplier_sectors from anon, authenticated;

grant select, insert, update, delete on table public.subscriptions to authenticated;
grant select on table public.supplier_profiles to anon;
grant select, insert, update, delete on table public.supplier_profiles to authenticated;
grant select on table public.supplier_sectors to anon;
grant select, insert, update, delete on table public.supplier_sectors to authenticated;

-- Subscription requests: members can request, read and revise pending requests;
-- platform administrators can review, activate, cancel or remove any request.
drop policy if exists "Admins manage all subscriptions" on public.subscriptions;
drop policy if exists "Org members can request a subscription" on public.subscriptions;
drop policy if exists "Org members can view their subscription" on public.subscriptions;
drop policy if exists "Org members can update their pending subscription" on public.subscriptions;

create policy subscriptions_read
on public.subscriptions
for select
to authenticated
using (
  (select public.is_platform_admin())
  or (select public.is_org_member(org_id))
);

create policy subscriptions_create
on public.subscriptions
for insert
to authenticated
with check (
  (select public.is_platform_admin())
  or (
    (select public.is_org_member(org_id))
    and status = 'pending'
    and approved_by is null
    and approved_at is null
  )
);

create policy subscriptions_update
on public.subscriptions
for update
to authenticated
using (
  (select public.is_platform_admin())
  or (
    (select public.is_org_member(org_id))
    and status = 'pending'
  )
)
with check (
  (select public.is_platform_admin())
  or (select public.is_org_member(org_id))
);

create policy subscriptions_delete
on public.subscriptions
for delete
to authenticated
using ((select public.is_platform_admin()));

-- Enforce field ownership at the database boundary. Organization members may
-- edit notes or cancel a pending request, but cannot approve, reassign or
-- alter the commercial terms of a subscription.
create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if (select public.is_platform_admin()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.current_period_start := null;
    new.current_period_end := null;
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  new.org_id := old.org_id;
  new.plan_id := old.plan_id;
  new.billing_cycle := old.billing_cycle;
  new.payment_method := old.payment_method;
  new.current_period_start := old.current_period_start;
  new.current_period_end := old.current_period_end;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;

  if old.status = 'pending' and new.status in ('pending', 'cancelled') then
    return new;
  end if;

  new.status := old.status;
  return new;
end;
$function$;

revoke all on function public.protect_subscription_fields() from public, anon, authenticated;
grant execute on function public.protect_subscription_fields() to service_role;

-- Supplier profiles: anonymous users see public rows; signed-in users see
-- public rows plus their own organization and platform administration views.
drop policy if exists "Anyone can view public supplier profiles" on public.supplier_profiles;
drop policy if exists "Org members manage their supplier profile" on public.supplier_profiles;

create policy supplier_profiles_anon_read
on public.supplier_profiles
for select
to anon
using (is_public);

create policy supplier_profiles_authenticated_read
on public.supplier_profiles
for select
to authenticated
using (
  is_public
  or (select public.is_org_member(org_id))
  or (select public.is_platform_admin())
);

create policy supplier_profiles_member_create
on public.supplier_profiles
for insert
to authenticated
with check ((select public.is_org_member(org_id)));

create policy supplier_profiles_member_update
on public.supplier_profiles
for update
to authenticated
using ((select public.is_org_member(org_id)))
with check ((select public.is_org_member(org_id)));

create policy supplier_profiles_member_delete
on public.supplier_profiles
for delete
to authenticated
using ((select public.is_org_member(org_id)));

-- Supplier sectors follow profile visibility for reads and organization
-- membership for writes.
drop policy if exists "Anyone can view supplier sectors of visible profiles" on public.supplier_sectors;
drop policy if exists "Org members manage their supplier sectors" on public.supplier_sectors;

create policy supplier_sectors_anon_read
on public.supplier_sectors
for select
to anon
using (
  exists (
    select 1
    from public.supplier_profiles sp
    where sp.org_id = supplier_sectors.org_id
      and sp.is_public
  )
);

create policy supplier_sectors_authenticated_read
on public.supplier_sectors
for select
to authenticated
using (
  (select public.is_org_member(org_id))
  or (select public.is_platform_admin())
  or exists (
    select 1
    from public.supplier_profiles sp
    where sp.org_id = supplier_sectors.org_id
      and sp.is_public
  )
);

create policy supplier_sectors_member_create
on public.supplier_sectors
for insert
to authenticated
with check ((select public.is_org_member(org_id)));

create policy supplier_sectors_member_update
on public.supplier_sectors
for update
to authenticated
using ((select public.is_org_member(org_id)))
with check ((select public.is_org_member(org_id)));

create policy supplier_sectors_member_delete
on public.supplier_sectors
for delete
to authenticated
using ((select public.is_org_member(org_id)));

commit;

-- ===== END 33_core_rls_policy_consolidation.sql =====

-- ===== START 34_public_measurement_abuse_protection.sql =====
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

-- ===== END 34_public_measurement_abuse_protection.sql =====

-- ===== START 35_private_measurement_helper_hardening.sql =====
-- Restrict internal measurement helpers and remove retired public overloads.
-- Production verification should confirm that anon/authenticated cannot execute
-- the private helpers and that only the protected public overloads remain.

begin;

-- These SECURITY DEFINER helpers are implementation details of the protected
-- public measurement functions. Direct Data API access would allow callers to
-- fabricate rejection rollups or claim the retention-maintenance window.
revoke execute on function private.record_measurement_rejection(text, text, text)
  from public, anon, authenticated;
revoke execute on function private.maybe_prune_public_measurements()
  from public, anon, authenticated;
grant execute on function private.record_measurement_rejection(text, text, text)
  to service_role;
grant execute on function private.maybe_prune_public_measurements()
  to service_role;

-- Migration 34 deployed privacy-safe overloads. The legacy signatures were
-- already non-executable through the Data API; remove them permanently so a
-- later blanket grant cannot accidentally restore the bypass.
drop function if exists public.increment_opportunity_view(uuid);
drop function if exists public.resolve_tracking_link(text, text);

commit;

-- ===== END 35_private_measurement_helper_hardening.sql =====

-- ===== START 36_harden_privileged_rpc_boundaries.sql =====
-- Harden privileged RPC boundaries after the production security audit.
-- Apply after 35_private_measurement_helper_hardening.sql.

begin;

-- Audit evidence must originate from database triggers or trusted server-side
-- code. Client-supplied action/entity metadata is not trustworthy evidence.
revoke all on function public.log_audit_event(text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_audit_event(text, text, text, uuid, jsonb)
  to service_role;

-- Organization administrators may invite members and administrators, but only
-- an existing owner may grant owner-level access.
create or replace function public.invite_team_member(
  p_org_id uuid,
  p_email text,
  p_role text default 'member'::text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  caller_role text;
  invitee_id uuid;
  current_count integer;
  member_limit integer;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select role into caller_role
  from public.organization_members
  where org_id = p_org_id and user_id = (select auth.uid());

  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only an organization owner or admin can invite team members';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_role = 'owner' and caller_role <> 'owner' then
    raise exception 'Only an organization owner can grant owner access';
  end if;

  if normalized_email = '' or length(normalized_email) > 320
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'A valid email address is required';
  end if;

  invitee_id := public.find_user_id_by_email(normalized_email);
  if invitee_id is null then
    raise exception 'No Manohub account found for %. Ask them to sign up first.', normalized_email;
  end if;

  if invitee_id = (select auth.uid()) then
    raise exception 'You are already a member of this organization';
  end if;

  if exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = invitee_id
  ) then
    raise exception 'That user is already a member of this organization';
  end if;

  select count(*) into current_count
  from public.organization_members
  where org_id = p_org_id;

  member_limit := public.get_org_feature_limit(p_org_id, 'max_team_members');
  if member_limit is not null and current_count >= member_limit then
    raise exception 'Your plan allows up to % team member(s). Upgrade to invite more.', member_limit;
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, invitee_id, p_role);
end;
$function$;

revoke all on function public.invite_team_member(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.invite_team_member(uuid, text, text)
  to authenticated, service_role;

commit;

-- ===== END 36_harden_privileged_rpc_boundaries.sql =====

-- ===== START 37_durable_background_job_foundation.sql =====
-- Durable, idempotent background-job foundation.
-- Apply after 36_harden_privileged_rpc_boundaries.sql.

begin;

create schema if not exists private;

create table if not exists private.background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'dead_letter')),
  priority smallint not null default 0 check (priority between -100 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_type, idempotency_key),
  check (jsonb_typeof(payload) = 'object')
);

create index if not exists background_jobs_claim_idx
  on private.background_jobs (priority desc, available_at, created_at)
  where status = 'queued';
create index if not exists background_jobs_status_updated_idx
  on private.background_jobs (status, updated_at desc);
create index if not exists background_jobs_locked_idx
  on private.background_jobs (locked_at)
  where status = 'processing';

alter table private.background_jobs enable row level security;
revoke all on table private.background_jobs from public, anon, authenticated;
grant select, insert, update, delete on table private.background_jobs to service_role;

create or replace function private.enqueue_background_job(
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default gen_random_uuid()::text,
  p_available_at timestamptz default now(),
  p_max_attempts integer default 5,
  p_priority smallint default 0
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  job_id uuid;
  normalized_type text := lower(btrim(coalesce(p_job_type, '')));
begin
  if normalized_type !~ '^[a-z][a-z0-9_.-]{2,79}$' then
    raise exception 'Invalid job type';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(p_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Job payload must be a JSON object';
  end if;
  if p_max_attempts < 1 or p_max_attempts > 20 then
    raise exception 'Maximum attempts must be between 1 and 20';
  end if;

  insert into private.background_jobs (
    job_type, payload, idempotency_key, available_at, max_attempts, priority
  ) values (
    normalized_type, coalesce(p_payload, '{}'::jsonb), btrim(p_idempotency_key),
    coalesce(p_available_at, now()), p_max_attempts, p_priority
  )
  on conflict (job_type, idempotency_key)
  do update set updated_at = private.background_jobs.updated_at
  returning id into job_id;

  return job_id;
end;
$function$;

create or replace function private.claim_background_jobs(
  p_worker_id text,
  p_limit integer default 10
)
returns table (
  id uuid,
  job_type text,
  payload jsonb,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 120 then
    raise exception 'Valid worker ID required';
  end if;
  if p_limit < 1 or p_limit > 50 then
    raise exception 'Claim limit must be between 1 and 50';
  end if;

  return query
  with candidates as (
    select j.id
    from private.background_jobs j
    where j.status = 'queued' and j.available_at <= now()
    order by j.priority desc, j.available_at, j.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.background_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        locked_at = now(),
        locked_by = btrim(p_worker_id),
        updated_at = now(),
        last_error = null
    from candidates c
    where j.id = c.id
    returning j.id, j.job_type, j.payload, j.attempts, j.max_attempts
  )
  select c.id, c.job_type, c.payload, c.attempts, c.max_attempts
  from claimed c;
end;
$function$;

create or replace function private.complete_background_job(
  p_job_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  changed integer;
begin
  update private.background_jobs
  set status = 'completed',
      completed_at = now(),
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = btrim(p_worker_id);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$function$;

create or replace function private.fail_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  next_status text;
begin
  update private.background_jobs j
  set status = case when j.attempts >= j.max_attempts then 'dead_letter' else 'queued' end,
      available_at = case
        when j.attempts >= j.max_attempts then j.available_at
        else now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(j.attempts - 1, 0))))
      end,
      locked_at = null,
      locked_by = null,
      last_error = left(coalesce(p_error, 'Unknown job failure'), 2000),
      updated_at = now()
  where j.id = p_job_id
    and j.status = 'processing'
    and j.locked_by = btrim(p_worker_id)
  returning status into next_status;

  if next_status is null then
    raise exception 'Job is not owned by this worker';
  end if;
  return next_status;
end;
$function$;

create or replace function private.recover_stalled_background_jobs(
  p_timeout_minutes integer default 15
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  changed integer;
begin
  if p_timeout_minutes < 1 or p_timeout_minutes > 1440 then
    raise exception 'Timeout must be between 1 and 1440 minutes';
  end if;

  update private.background_jobs j
  set status = case when j.attempts >= j.max_attempts then 'dead_letter' else 'queued' end,
      available_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = coalesce(j.last_error, 'Worker lease expired'),
      updated_at = now()
  where j.status = 'processing'
    and j.locked_at < now() - make_interval(mins => p_timeout_minutes);
  get diagnostics changed = row_count;
  return changed;
end;
$function$;

revoke all on function private.enqueue_background_job(text, jsonb, text, timestamptz, integer, smallint)
  from public, anon, authenticated;
revoke all on function private.claim_background_jobs(text, integer)
  from public, anon, authenticated;
revoke all on function private.complete_background_job(uuid, text)
  from public, anon, authenticated;
revoke all on function private.fail_background_job(uuid, text, text)
  from public, anon, authenticated;
revoke all on function private.recover_stalled_background_jobs(integer)
  from public, anon, authenticated;
grant execute on function private.enqueue_background_job(text, jsonb, text, timestamptz, integer, smallint)
  to service_role;
grant execute on function private.claim_background_jobs(text, integer)
  to service_role;
grant execute on function private.complete_background_job(uuid, text)
  to service_role;
grant execute on function private.fail_background_job(uuid, text, text)
  to service_role;
grant execute on function private.recover_stalled_background_jobs(integer)
  to service_role;

create or replace function public.get_background_job_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  result jsonb;
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'queued', count(*) filter (where status = 'queued'),
    'processing', count(*) filter (where status = 'processing'),
    'completed', count(*) filter (where status = 'completed'),
    'dead_letter', count(*) filter (where status = 'dead_letter'),
    'oldest_queued_at', min(created_at) filter (where status = 'queued'),
    'last_failure_at', max(updated_at) filter (where last_error is not null)
  ) into result
  from private.background_jobs;
  return result;
end;
$function$;

create or replace function public.admin_replay_background_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  changed integer;
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Admin access required';
  end if;

  update private.background_jobs
  set status = 'queued',
      attempts = 0,
      available_at = now(),
      locked_at = null,
      locked_by = null,
      completed_at = null,
      last_error = null,
      updated_at = now()
  where id = p_job_id and status = 'dead_letter';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$function$;

revoke all on function public.get_background_job_summary() from public, anon, authenticated;
revoke all on function public.admin_replay_background_job(uuid) from public, anon, authenticated;
grant execute on function public.get_background_job_summary() to authenticated, service_role;
grant execute on function public.admin_replay_background_job(uuid) to authenticated, service_role;

commit;

-- ===== END 37_durable_background_job_foundation.sql =====

-- ===== START 39_background_job_operations_console.sql =====
begin;

create or replace function public.admin_list_background_jobs(
  p_status text default null,
  p_limit integer default 50
)
returns table(
  id uuid,
  job_type text,
  status text,
  attempts integer,
  max_attempts integer,
  available_at timestamptz,
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Admin access required';
  end if;
  if p_status is not null and p_status not in ('queued', 'processing', 'completed', 'dead_letter') then
    raise exception 'Invalid job status';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Limit must be between 1 and 200';
  end if;

  return query
  select
    j.id,
    j.job_type,
    j.status,
    j.attempts,
    j.max_attempts,
    j.available_at,
    j.locked_at,
    j.completed_at,
    j.last_error,
    j.created_at,
    j.updated_at
  from private.background_jobs j
  where p_status is null or j.status = p_status
  order by
    case j.status
      when 'dead_letter' then 0
      when 'processing' then 1
      when 'queued' then 2
      else 3
    end,
    j.updated_at desc
  limit p_limit;
end;
$$;

revoke all on function public.admin_list_background_jobs(text, integer) from public, anon;
grant execute on function public.admin_list_background_jobs(text, integer) to authenticated;

commit;

-- ===== END 39_background_job_operations_console.sql =====

-- ===== START 40_unified_notification_centre.sql =====
begin;

alter table public.notifications
  add column if not exists priority text not null default 'normal',
  add column if not exists action_label text,
  add column if not exists workspace_target text;

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('pending', 'sent', 'failed', 'read', 'archived'));

alter table public.notifications drop constraint if exists notifications_priority_check;
alter table public.notifications add constraint notifications_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

update public.notifications
set priority = case
  when category in ('campaign_health', 'deadline_reminder') then 'high'
  when category = 'cms_workflow' then 'normal'
  else priority
end,
workspace_target = case
  when category = 'campaign_health' then 'campaign-builder'
  when category = 'cms_workflow' then 'content-cms'
  when category = 'deadline_reminder' then 'tenders'
  else workspace_target
end,
action_label = case
  when category = 'campaign_health' then 'Review campaign'
  when category = 'cms_workflow' then 'Open content'
  when category = 'deadline_reminder' then 'View tender'
  else action_label
end
where workspace_target is null or action_label is null;

create index if not exists notifications_user_status_created_idx
  on public.notifications (user_id, status, created_at desc);

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set status = 'read', read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid() and status <> 'archived';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.mark_all_notifications_read(p_org_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set status = 'read', read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and status not in ('read', 'archived')
    and (p_org_id is null or org_id = p_org_id);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.archive_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set status = 'archived', read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon;
revoke all on function public.archive_notification(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.archive_notification(uuid) to authenticated;

revoke update on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

drop policy if exists "Users can mark their own notifications read" on public.notifications;
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users manage their own notification preferences" on public.notification_preferences;
drop policy if exists notification_preferences_owner_manage on public.notification_preferences;
create policy notification_preferences_owner_manage on public.notification_preferences
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (public.is_org_member(org_id) or public.is_platform_admin())
  )
  with check (
    user_id = (select auth.uid())
    and (public.is_org_member(org_id) or public.is_platform_admin())
  );

commit;

-- ===== END 40_unified_notification_centre.sql =====

-- ===== START 41_notification_rpc_security_invoker.sql =====
begin;

alter function public.mark_notification_read(uuid) security invoker;
alter function public.mark_all_notifications_read(uuid) security invoker;
alter function public.archive_notification(uuid) security invoker;

grant update (status, read_at) on public.notifications to authenticated;

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;

-- ===== END 41_notification_rpc_security_invoker.sql =====

-- ===== START 42_subscription_lifecycle_foundation.sql =====
-- Formal organization subscription lifecycle, immutable history and guarded transitions.

begin;

alter table public.subscriptions
  add column if not exists trial_ends_at date,
  add column if not exists grace_ends_at date,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_contact_email text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'trialing', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled', 'expired'));
alter table public.subscriptions drop constraint if exists subscriptions_billing_contact_email_check;
alter table public.subscriptions add constraint subscriptions_billing_contact_email_check
  check (billing_contact_email is null or length(billing_contact_email) <= 254);
alter table public.subscriptions drop constraint if exists subscriptions_suspension_reason_check;
alter table public.subscriptions add constraint subscriptions_suspension_reason_check
  check (suspension_reason is null or length(suspension_reason) <= 1000);

create unique index if not exists subscriptions_one_current_per_org_idx
  on public.subscriptions (org_id)
  where status in ('trialing', 'active', 'past_due', 'grace_period', 'suspended');
create index if not exists subscriptions_lifecycle_queue_idx
  on public.subscriptions (status, current_period_end, grace_ends_at);

create table if not exists public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_events_type_check check (
    event_type in ('requested', 'trial_started', 'activated', 'renewed', 'past_due', 'grace_started',
      'suspended', 'resumed', 'cancel_scheduled', 'cancelled', 'expired', 'plan_changed', 'billing_contact_updated')
  ),
  constraint subscription_events_reason_check check (reason is null or length(reason) <= 1000)
);

alter table public.subscription_events enable row level security;
revoke insert, update, delete, truncate on public.subscription_events from anon, authenticated;
grant select on public.subscription_events to authenticated;

drop policy if exists subscription_events_admin_read on public.subscription_events;
create policy subscription_events_admin_read on public.subscription_events
  for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists subscription_events_org_read on public.subscription_events;
create policy subscription_events_org_read on public.subscription_events
  for select to authenticated using ((select public.is_org_member(org_id)));

create or replace function public.transition_subscription(
  p_subscription_id uuid,
  p_action text,
  p_reason text default null,
  p_effective_date date default current_date
) returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_from_status text;
  v_to_status text;
  v_event_type text;
  v_period_end date;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if length(coalesce(p_reason, '')) > 1000 then
    raise exception 'Reason must not exceed 1000 characters';
  end if;

  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;
  if not found then raise exception 'Subscription not found'; end if;
  v_from_status := v_subscription.status;

  if p_action = 'start_trial' and v_from_status = 'pending' then
    v_to_status := 'trialing'; v_event_type := 'trial_started';
    update public.subscriptions set status = v_to_status, trial_ends_at = p_effective_date + 14,
      current_period_start = p_effective_date, current_period_end = p_effective_date + 14,
      approved_by = (select auth.uid()), approved_at = now(), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action in ('activate', 'resume') and v_from_status in ('pending', 'trialing', 'past_due', 'grace_period', 'suspended') then
    v_to_status := 'active';
    v_event_type := case when p_action = 'resume' then 'resumed' else 'activated' end;
    v_period_end := case when v_subscription.billing_cycle = 'annual'
      then (p_effective_date + interval '1 year')::date else (p_effective_date + interval '1 month')::date end;
    update public.subscriptions set status = v_to_status, current_period_start = p_effective_date,
      current_period_end = v_period_end, grace_ends_at = null, suspended_at = null,
      suspension_reason = null, cancel_at_period_end = false,
      approved_by = (select auth.uid()), approved_at = coalesce(approved_at, now()), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'renew' and v_from_status in ('active', 'past_due', 'grace_period') then
    v_to_status := 'active'; v_event_type := 'renewed';
    v_period_end := case when v_subscription.billing_cycle = 'annual'
      then (greatest(p_effective_date, coalesce(v_subscription.current_period_end, p_effective_date)) + interval '1 year')::date
      else (greatest(p_effective_date, coalesce(v_subscription.current_period_end, p_effective_date)) + interval '1 month')::date end;
    update public.subscriptions set status = v_to_status, current_period_end = v_period_end,
      grace_ends_at = null, cancel_at_period_end = false, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'mark_past_due' and v_from_status = 'active' then
    v_to_status := 'past_due'; v_event_type := 'past_due';
    update public.subscriptions set status = v_to_status, grace_ends_at = p_effective_date + 7, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'start_grace' and v_from_status = 'past_due' then
    v_to_status := 'grace_period'; v_event_type := 'grace_started';
    update public.subscriptions set status = v_to_status, grace_ends_at = coalesce(grace_ends_at, p_effective_date + 7), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'suspend' and v_from_status in ('active', 'past_due', 'grace_period') then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A suspension reason is required'; end if;
    v_to_status := 'suspended'; v_event_type := 'suspended';
    update public.subscriptions set status = v_to_status, suspended_at = now(),
      suspension_reason = trim(p_reason), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'schedule_cancel' and v_from_status in ('trialing', 'active', 'past_due', 'grace_period') then
    v_to_status := v_from_status; v_event_type := 'cancel_scheduled';
    update public.subscriptions set cancel_at_period_end = true, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'cancel' and v_from_status <> 'cancelled' then
    v_to_status := 'cancelled'; v_event_type := 'cancelled';
    update public.subscriptions set status = v_to_status, cancelled_at = now(),
      cancel_at_period_end = false, notes = coalesce(nullif(trim(p_reason), ''), notes), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'expire' and v_from_status in ('trialing', 'active', 'past_due', 'grace_period', 'suspended') then
    v_to_status := 'expired'; v_event_type := 'expired';
    update public.subscriptions set status = v_to_status, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  else
    raise exception 'Invalid subscription transition: % from %', p_action, v_from_status;
  end if;

  insert into public.subscription_events
    (subscription_id, org_id, actor_id, event_type, from_status, to_status, reason)
  values
    (v_subscription.id, v_subscription.org_id, (select auth.uid()), v_event_type, v_from_status, v_to_status, nullif(trim(p_reason), ''));

  insert into public.notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
  select om.user_id, v_subscription.org_id, 'subscriptions',
    'Subscription ' || replace(v_event_type, '_', ' '),
    'Your organization subscription is now ' || replace(v_subscription.status, '_', ' ') || '.',
    'workspace:billing', 'in_app', jsonb_build_object('subscription_id', v_subscription.id, 'event_type', v_event_type)
  from public.organization_members om
  where om.org_id = v_subscription.org_id and om.role in ('owner', 'admin');

  return v_subscription;
end;
$$;

revoke all on function public.transition_subscription(uuid, text, text, date) from public, anon;
grant execute on function public.transition_subscription(uuid, text, text, date) to authenticated;

create or replace function private.capture_subscription_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscription_events
    (subscription_id, org_id, actor_id, event_type, to_status, reason)
  values (new.id, new.org_id, (select auth.uid()), 'requested', new.status, new.notes);
  return new;
end;
$$;
revoke all on function private.capture_subscription_request() from public, anon, authenticated;
drop trigger if exists subscriptions_capture_request on public.subscriptions;
create trigger subscriptions_capture_request after insert on public.subscriptions
for each row execute function private.capture_subscription_request();

-- Browser clients may request plans and update payment/billing contact details,
-- but lifecycle fields are changed only by the guarded transition function.
revoke update on public.subscriptions from authenticated;
grant select, insert on public.subscriptions to authenticated;
grant update (notes, billing_contact_name, billing_contact_email) on public.subscriptions to authenticated;

commit;

-- ===== END 42_subscription_lifecycle_foundation.sql =====

-- ===== START 43_subscription_event_grant_hardening.sql =====
-- Older Supabase projects may auto-grant new public tables to API roles.
-- Keep lifecycle history reachable only to authenticated users and still
-- constrained by organization/platform RLS policies.
begin;

revoke all on table public.subscription_events from public, anon, authenticated;
grant select on table public.subscription_events to authenticated;
revoke all on sequence public.subscription_events_id_seq from public, anon, authenticated;

commit;

-- ===== END 43_subscription_event_grant_hardening.sql =====

-- ===== START 44_central_usage_quotas.sql =====
-- Central plan quotas, organization overrides and metered usage.

begin;

create table if not exists public.organization_quota_overrides (
  org_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  limit_value integer,
  reason text not null,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, feature_key),
  constraint organization_quota_overrides_key_check check (feature_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint organization_quota_overrides_limit_check check (limit_value is null or limit_value >= 0),
  constraint organization_quota_overrides_reason_check check (length(reason) between 3 and 500)
);

create table if not exists public.organization_usage_meters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  meter_key text not null,
  period_start date not null,
  period_end date not null,
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, meter_key, period_start),
  constraint organization_usage_meters_key_check check (meter_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint organization_usage_meters_value_check check (current_value >= 0),
  constraint organization_usage_meters_period_check check (period_end >= period_start)
);
create table if not exists public.organization_usage_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  meter_key text not null,
  amount integer not null check (amount > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, meter_key, idempotency_key)
);

alter table public.organization_quota_overrides enable row level security;
alter table public.organization_usage_meters enable row level security;
alter table public.organization_usage_events enable row level security;
revoke all on public.organization_quota_overrides, public.organization_usage_meters, public.organization_usage_events from public, anon, authenticated;
grant select on public.organization_quota_overrides, public.organization_usage_meters to authenticated;

drop policy if exists quota_overrides_admin_all on public.organization_quota_overrides;
create policy quota_overrides_admin_all on public.organization_quota_overrides
  for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
drop policy if exists quota_overrides_org_read on public.organization_quota_overrides;
create policy quota_overrides_org_read on public.organization_quota_overrides
  for select to authenticated using ((select public.is_org_member(org_id)));
drop policy if exists usage_meters_admin_read on public.organization_usage_meters;
create policy usage_meters_admin_read on public.organization_usage_meters
  for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists usage_meters_org_read on public.organization_usage_meters;
create policy usage_meters_org_read on public.organization_usage_meters
  for select to authenticated using ((select public.is_org_member(org_id)));

create or replace function public.get_effective_org_quota(p_org_id uuid, p_feature_key text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select qo.limit_value from public.organization_quota_overrides qo
      where qo.org_id = p_org_id and qo.feature_key = p_feature_key
        and (qo.expires_at is null or qo.expires_at > now())),
    public.get_org_feature_limit(p_org_id, p_feature_key)
  );
$$;
revoke all on function public.get_effective_org_quota(uuid, text) from public, anon;
grant execute on function public.get_effective_org_quota(uuid, text) to authenticated;

create or replace function public.get_org_quota_snapshot(p_org_id uuid)
returns table(feature_key text, feature_label text, limit_value integer, current_value bigint, remaining_value bigint, usage_percent numeric, is_override boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (public.is_platform_admin() or public.is_org_member(p_org_id)) then
    raise exception 'Organization access is required';
  end if;
  return query
  with active_plan as (
    select s.plan_id from public.subscriptions s
    where s.org_id = p_org_id and s.status in ('trialing','active','past_due','grace_period')
    order by s.created_at desc limit 1
  ), free_plan as (
    select p.id as plan_id from public.plans p where p.code = 'free' limit 1
  ), features as (
    select pf.feature_key, pf.feature_label, pf.limit_value
    from public.plan_features pf where pf.plan_id = coalesce((select plan_id from active_plan),(select plan_id from free_plan))
      and pf.limit_value is not null
  ), usage_values as (
    select f.feature_key,
      case f.feature_key
        when 'max_team_members' then (select count(*) from public.organization_members om where om.org_id = p_org_id)
        when 'max_active_campaigns' then (select count(*) from public.ad_campaigns c where c.org_id = p_org_id and c.status = 'active')
        when 'max_agency_clients' then (select count(*) from public.agency_clients ac where ac.agency_org_id = p_org_id and ac.status = 'active')
        else coalesce((select sum(m.current_value) from public.organization_usage_meters m
          where m.org_id = p_org_id and m.meter_key = f.feature_key and current_date between m.period_start and m.period_end),0)
      end::bigint as current_value
    from features f
  )
  select f.feature_key, f.feature_label,
    coalesce(o.limit_value, f.limit_value) as limit_value, u.current_value,
    greatest(coalesce(o.limit_value, f.limit_value)::bigint - u.current_value, 0) as remaining_value,
    case when coalesce(o.limit_value, f.limit_value) = 0 then 100
      else round((u.current_value::numeric / coalesce(o.limit_value, f.limit_value)) * 100, 1) end,
    o.org_id is not null
  from features f join usage_values u using (feature_key)
  left join public.organization_quota_overrides o on o.org_id = p_org_id and o.feature_key = f.feature_key
    and (o.expires_at is null or o.expires_at > now())
  order by f.feature_label;
end;
$$;
revoke all on function public.get_org_quota_snapshot(uuid) from public, anon;
grant execute on function public.get_org_quota_snapshot(uuid) to authenticated;

create or replace function public.consume_org_quota(p_org_id uuid, p_meter_key text, p_amount integer default 1, p_idempotency_key text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_value bigint; v_period_start date := date_trunc('month', current_date)::date; v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if (select auth.uid()) is null or not (public.is_platform_admin() or public.is_org_member(p_org_id)) then raise exception 'Organization access is required'; end if;
  if p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid usage amount'; end if;
  v_limit := public.get_effective_org_quota(p_org_id, p_meter_key);
  if v_limit is null then raise exception 'Unknown quota meter: %', p_meter_key; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')), '') is null then raise exception 'An idempotency key is required'; end if;
  insert into public.organization_usage_events(org_id,meter_key,amount,idempotency_key)
  values(p_org_id,p_meter_key,p_amount,trim(p_idempotency_key))
  on conflict(org_id,meter_key,idempotency_key) do nothing;
  if not found then
    select current_value into v_value from public.organization_usage_meters
      where org_id=p_org_id and meter_key=p_meter_key and period_start=v_period_start;
    return coalesce(v_value,0);
  end if;
  insert into public.organization_usage_meters(org_id,meter_key,period_start,period_end,current_value)
  values(p_org_id,p_meter_key,v_period_start,v_period_end,p_amount)
  on conflict(org_id,meter_key,period_start) do update set current_value=public.organization_usage_meters.current_value+p_amount,updated_at=now()
  returning current_value into v_value;
  if v_value > v_limit then raise exception 'Quota exceeded for % (% of %)', p_meter_key, v_value, v_limit; end if;
  return v_value;
end;
$$;
revoke all on function public.consume_org_quota(uuid,text,integer,text) from public, anon;
grant execute on function public.consume_org_quota(uuid,text,integer,text) to authenticated;

create or replace function public.set_org_quota_override(p_org_id uuid,p_feature_key text,p_limit_value integer,p_reason text,p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  insert into public.organization_quota_overrides(org_id,feature_key,limit_value,reason,expires_at,created_by)
  values(p_org_id,p_feature_key,p_limit_value,trim(p_reason),p_expires_at,(select auth.uid()))
  on conflict(org_id,feature_key) do update set limit_value=excluded.limit_value,reason=excluded.reason,expires_at=excluded.expires_at,updated_at=now();
end;
$$;
revoke all on function public.set_org_quota_override(uuid,text,integer,text,timestamptz) from public, anon;
grant execute on function public.set_org_quota_override(uuid,text,integer,text,timestamptz) to authenticated;

commit;

-- ===== END 44_central_usage_quotas.sql =====

-- ===== START 45_platform_financial_ledger.sql =====
-- Unified append-only ledger for subscriptions, advertising and managed services.
begin;

create table if not exists public.commercial_invoices (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete restrict,
  invoice_number text not null unique, source_type text not null check(source_type in ('subscription','advertising','managed_service','manual')),
  source_id uuid, currency_code text not null references public.currencies(code), status text not null default 'issued'
    check(status in ('draft','issued','partially_paid','paid','void','overdue')),
  subtotal numeric(16,2) not null check(subtotal>=0), tax_amount numeric(16,2) not null default 0 check(tax_amount>=0),
  total_amount numeric(16,2) generated always as (subtotal+tax_amount) stored,
  amount_paid numeric(16,2) not null default 0 check(amount_paid>=0), due_at date, issued_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.commercial_invoice_lines (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.commercial_invoices(id) on delete cascade,
  description text not null, quantity numeric(12,2) not null default 1 check(quantity>0), unit_amount numeric(16,2) not null check(unit_amount>=0),
  line_total numeric(16,2) generated always as (quantity*unit_amount) stored
);
create table if not exists public.commercial_payments (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete restrict,
  payment_reference text not null, method text not null check(method in ('bank_transfer','mobile_money','card','cash','credit')),
  currency_code text not null references public.currencies(code), amount numeric(16,2) not null check(amount>0),
  status text not null default 'verified' check(status in ('pending','verified','reversed')),
  received_at timestamptz not null default now(), verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), unique(org_id,payment_reference)
);
create table if not exists public.commercial_payment_allocations (
  payment_id uuid not null references public.commercial_payments(id) on delete restrict,
  invoice_id uuid not null references public.commercial_invoices(id) on delete restrict,
  amount numeric(16,2) not null check(amount>0), created_at timestamptz not null default now(),
  primary key(payment_id,invoice_id)
);
create table if not exists public.commercial_ledger_entries (
  id bigint generated always as identity primary key, org_id uuid not null references public.organizations(id) on delete restrict,
  entry_type text not null check(entry_type in ('invoice','payment','credit','refund','adjustment','reversal')),
  direction text not null check(direction in ('debit','credit')), amount numeric(16,2) not null check(amount>0),
  currency_code text not null references public.currencies(code), reference_type text not null, reference_id uuid,
  description text not null, occurred_at timestamptz not null default now(), actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists commercial_ledger_org_time_idx on public.commercial_ledger_entries(org_id,occurred_at desc);
create index if not exists commercial_invoices_status_due_idx on public.commercial_invoices(status,due_at);
alter table public.commercial_invoices enable row level security; alter table public.commercial_invoice_lines enable row level security;
alter table public.commercial_payments enable row level security; alter table public.commercial_payment_allocations enable row level security;
alter table public.commercial_ledger_entries enable row level security;
revoke all on public.commercial_invoices,public.commercial_invoice_lines,public.commercial_payments,public.commercial_payment_allocations,public.commercial_ledger_entries from public,anon,authenticated;
grant select on public.commercial_invoices,public.commercial_invoice_lines,public.commercial_payments,public.commercial_payment_allocations,public.commercial_ledger_entries to authenticated;
drop policy if exists commercial_invoices_read on public.commercial_invoices;
create policy commercial_invoices_read on public.commercial_invoices for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
drop policy if exists commercial_payments_read on public.commercial_payments;
create policy commercial_payments_read on public.commercial_payments for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
drop policy if exists commercial_ledger_read on public.commercial_ledger_entries;
create policy commercial_ledger_read on public.commercial_ledger_entries for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
drop policy if exists commercial_lines_read on public.commercial_invoice_lines;
create policy commercial_lines_read on public.commercial_invoice_lines for select to authenticated using(exists(select 1 from public.commercial_invoices i where i.id=invoice_id and (public.is_platform_admin() or public.is_org_member(i.org_id))));
drop policy if exists commercial_allocations_read on public.commercial_payment_allocations;
create policy commercial_allocations_read on public.commercial_payment_allocations for select to authenticated using(exists(select 1 from public.commercial_invoices i where i.id=invoice_id and (public.is_platform_admin() or public.is_org_member(i.org_id))));
create or replace function private.prevent_commercial_ledger_mutation() returns trigger language plpgsql security definer set search_path='' as $$ begin raise exception 'Commercial ledger entries are immutable'; end; $$;
revoke all on function private.prevent_commercial_ledger_mutation() from public,anon,authenticated;
drop trigger if exists commercial_ledger_immutable on public.commercial_ledger_entries;
create trigger commercial_ledger_immutable before update or delete on public.commercial_ledger_entries for each row execute function private.prevent_commercial_ledger_mutation();
create or replace function public.record_commercial_payment(p_invoice_id uuid,p_reference text,p_method text,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$ declare v_i public.commercial_invoices; v_payment uuid; v_paid numeric; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 select * into v_i from public.commercial_invoices where id=p_invoice_id for update; if not found then raise exception 'Invoice not found'; end if;
 if p_amount<=0 or v_i.amount_paid+p_amount>v_i.total_amount then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.commercial_payments(org_id,payment_reference,method,currency_code,amount,verified_by) values(v_i.org_id,trim(p_reference),p_method,v_i.currency_code,p_amount,auth.uid()) returning id into v_payment;
 insert into public.commercial_payment_allocations values(v_payment,v_i.id,p_amount,now());
 update public.commercial_invoices set amount_paid=amount_paid+p_amount,status=case when amount_paid+p_amount=total_amount then 'paid' else 'partially_paid' end where id=v_i.id;
 insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,actor_id) values(v_i.org_id,'payment','credit',p_amount,v_i.currency_code,'commercial_payment',v_payment,'Payment '||trim(p_reference),auth.uid());
 return v_payment; end; $$;
revoke all on function public.record_commercial_payment(uuid,text,text,numeric) from public,anon; grant execute on function public.record_commercial_payment(uuid,text,text,numeric) to authenticated;

commit;

-- ===== END 45_platform_financial_ledger.sql =====

select 'Batch 1/5 complete: migrations 33-45' as staging_migration_progress;
