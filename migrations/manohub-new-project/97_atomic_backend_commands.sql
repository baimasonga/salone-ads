begin;

-- The mutation and its cached result share one transaction. An interrupted
-- request either commits both or rolls back both; retries cannot replay a
-- committed effect with missing bookkeeping.
create or replace function public.execute_backend_command(
  p_command_name text, p_idempotency_key text, p_params jsonb, p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target_function text;
  command_row public.backend_command_requests;
  args text;
  signature_count integer;
  returns_void boolean;
  result_value jsonb;
  payload_hash text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object' then raise exception 'Command parameters must be an object'; end if;
  target_function := case p_command_name
    when 'organization.invite' then 'invite_team_member'
    when 'organization.transition' then 'admin_transition_organization'
    when 'organization.recovery.decide' then 'admin_decide_organization_recovery'
    when 'organization.purge' then 'admin_purge_subscriber'
    when 'subscription.transition' then 'transition_subscription'
    when 'advertising.order.create' then 'create_advert_order'
    when 'organization.verification.approve' then 'admin_approve_organization_verification'
    when 'procurement.ingestion.promote' then 'promote_opportunity_ingestion_item'
    when 'billing.payment.record' then 'record_commercial_payment'
    when 'billing.credit.issue' then 'issue_commercial_credit'
    when 'billing.refund.record' then 'record_commercial_refund'
    when 'billing.proforma.create' then 'admin_create_commercial_proforma'
    when 'billing.invoice.create' then 'admin_create_commercial_invoice'
    when 'billing.proforma.transition' then 'admin_transition_commercial_proforma'
    when 'platform_staff.update' then 'admin_update_platform_staff'
    when 'platform_intake_control.update' then 'admin_update_platform_intake_control'
    else null end;
  if target_function is null then raise exception 'Unsupported command'; end if;
  if p_command_name = any(array['organization.transition','organization.recovery.decide','organization.purge','subscription.transition','organization.verification.approve','billing.payment.record','billing.credit.issue','billing.refund.record','platform_staff.update','platform_intake_control.update','billing.proforma.create','billing.proforma.transition','billing.invoice.create'])
    and coalesce((select auth.jwt()->>'aal'),'aal1') <> 'aal2' then
    raise exception 'Additional verification is required before this sensitive action' using errcode='42501';
  end if;

  -- Resolve only an allowlisted public function with exactly these named
  -- parameters. Names and casts come from pg_catalog, never SQL supplied by
  -- a caller. Values are bound through USING.
  select count(*), bool_and(p.prorettype = 'pg_catalog.void'::regtype)
  into signature_count, returns_void
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=target_function
    and p.prokind='f' and p.proargmodes is null
    and cardinality(p.proargnames)=(select count(*) from jsonb_object_keys(p_params))
    and p.proargnames @> array(select jsonb_object_keys(p_params));
  if signature_count <> 1 then raise exception 'Invalid command parameters'; end if;
  select string_agg(format('%I => ($1 ->> %L)::%s', a.name, a.name, pg_catalog.format_type(a.type_oid,null)), ', ' order by a.position)
  into args
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  cross join lateral unnest(p.proargnames, p.proargtypes::oid[]) with ordinality a(name,type_oid,position)
  where n.nspname='public' and p.proname=target_function
    and p.prokind='f' and p.proargmodes is null
    and cardinality(p.proargnames)=(select count(*) from jsonb_object_keys(p_params))
    and p.proargnames @> array(select jsonb_object_keys(p_params));

  payload_hash := encode(sha256(convert_to(p_params::text,'UTF8')),'hex');
  insert into public.backend_command_requests(actor_id,command_name,idempotency_key,payload_hash,request_id)
  values(actor,p_command_name,p_idempotency_key,payload_hash,left(p_request_id,128))
  on conflict(actor_id,command_name,idempotency_key) do nothing
  returning * into command_row;
  if not found then
    select * into command_row from public.backend_command_requests
    where actor_id=actor and command_name=p_command_name and idempotency_key=p_idempotency_key
    for update;
    if command_row.payload_hash <> payload_hash then raise exception 'Idempotency key was already used with different input'; end if;
    if command_row.status='succeeded' then
      return jsonb_build_object('result',command_row.result,'cached',true,'commandId',command_row.id);
    end if;
    -- Old processing/failed records may already have committed their effect.
    -- They require reconciliation, never automatic replay.
    raise exception 'Legacy command outcome requires reconciliation; command is already processing or failed';
  end if;

  if returns_void then
    execute format('select public.%I(%s)', target_function, args) using p_params;
    result_value := null;
  else
    execute format('select to_jsonb(public.%I(%s))', target_function, args) into result_value using p_params;
  end if;
  update public.backend_command_requests set status='succeeded', result=result_value,
    completed_at=now(),updated_at=now(),error_code=null where id=command_row.id;
  return jsonb_build_object('result',result_value,'cached',false,'commandId',command_row.id);
end;
$$;
revoke all on function public.execute_backend_command(text,text,jsonb,text) from public,anon;
grant execute on function public.execute_backend_command(text,text,jsonb,text) to authenticated;
-- Only the transactional entry point may modify command outcomes now.
revoke execute on function public.claim_backend_command(text,text,text,text) from authenticated;
revoke execute on function public.complete_backend_command(uuid,jsonb) from authenticated;
revoke execute on function public.fail_backend_command(uuid,text) from authenticated;

commit;
