create or replace function private.claim_background_jobs_by_type(
  p_worker_id text,
  p_job_types text[],
  p_limit integer default 10
)
returns table(id uuid, job_type text, payload jsonb, attempts integer, max_attempts integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 120 then
    raise exception 'Valid worker ID required';
  end if;
  if p_job_types is null or cardinality(p_job_types) < 1 or cardinality(p_job_types) > 20 then
    raise exception 'At least one and at most 20 job types are required';
  end if;
  if p_limit < 1 or p_limit > 50 then
    raise exception 'Claim limit must be between 1 and 50';
  end if;

  return query
  with candidates as (
    select j.id
    from private.background_jobs j
    where j.status = 'queued'
      and j.available_at <= now()
      and j.job_type = any(p_job_types)
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
$$;

create or replace function public.enqueue_due_audience_email_jobs(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  campaign record;
  queued_count integer := 0;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Enqueue limit must be between 1 and 100';
  end if;

  for campaign in
    select c.id
    from public.audience_email_campaigns c
    where c.status in ('queued', 'scheduled', 'processing')
      and (c.scheduled_at is null or c.scheduled_at <= now())
    order by c.scheduled_at asc nulls first, c.created_at asc
    limit p_limit
  loop
    perform private.enqueue_background_job(
      'audience.email.dispatch',
      jsonb_build_object('campaign_id', campaign.id),
      campaign.id::text,
      now(),
      10,
      50::smallint
    );
    queued_count := queued_count + 1;
  end loop;

  return queued_count;
end;
$$;

create or replace function public.claim_background_jobs_for_worker(
  p_worker_id text,
  p_job_types text[],
  p_limit integer default 10
)
returns table(id uuid, job_type text, payload jsonb, attempts integer, max_attempts integer)
language sql
security definer
set search_path = pg_catalog
as $$
  select * from private.claim_background_jobs_by_type(p_worker_id, p_job_types, p_limit);
$$;

create or replace function public.complete_background_job_for_worker(p_job_id uuid, p_worker_id text)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select private.complete_background_job(p_job_id, p_worker_id);
$$;

create or replace function public.fail_background_job_for_worker(p_job_id uuid, p_worker_id text, p_error text)
returns text
language sql
security definer
set search_path = pg_catalog
as $$
  select private.fail_background_job(p_job_id, p_worker_id, p_error);
$$;

create or replace function public.defer_background_job_for_worker(
  p_job_id uuid,
  p_worker_id text,
  p_delay_seconds integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  changed integer;
begin
  if p_delay_seconds < 1 or p_delay_seconds > 3600 then
    raise exception 'Delay must be between 1 and 3600 seconds';
  end if;

  update private.background_jobs
  set status = 'queued',
      attempts = greatest(attempts - 1, 0),
      available_at = now() + make_interval(secs => p_delay_seconds),
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = btrim(p_worker_id);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.recover_stalled_background_jobs_for_worker(p_timeout_minutes integer default 15)
returns integer
language sql
security definer
set search_path = pg_catalog
as $$
  select private.recover_stalled_background_jobs(p_timeout_minutes);
$$;

revoke all on function private.claim_background_jobs_by_type(text, text[], integer) from public;
revoke all on function public.enqueue_due_audience_email_jobs(integer) from public, anon, authenticated;
revoke all on function public.claim_background_jobs_for_worker(text, text[], integer) from public, anon, authenticated;
revoke all on function public.complete_background_job_for_worker(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_background_job_for_worker(uuid, text, text) from public, anon, authenticated;
revoke all on function public.defer_background_job_for_worker(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.recover_stalled_background_jobs_for_worker(integer) from public, anon, authenticated;

grant execute on function public.enqueue_due_audience_email_jobs(integer) to service_role;
grant execute on function public.claim_background_jobs_for_worker(text, text[], integer) to service_role;
grant execute on function public.complete_background_job_for_worker(uuid, text) to service_role;
grant execute on function public.fail_background_job_for_worker(uuid, text, text) to service_role;
grant execute on function public.defer_background_job_for_worker(uuid, text, integer) to service_role;
grant execute on function public.recover_stalled_background_jobs_for_worker(integer) to service_role;
