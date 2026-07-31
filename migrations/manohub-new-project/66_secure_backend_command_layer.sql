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
