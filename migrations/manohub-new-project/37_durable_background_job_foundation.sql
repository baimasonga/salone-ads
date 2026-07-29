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
