-- Administrator Control Centre: role-aware operational snapshots and audited intake controls.
begin;

create schema if not exists private;

create table if not exists private.platform_intake_controls (
  control_key text primary key check (control_key in (
    'subscriber_onboarding','procurement_submissions','advertising_orders','service_requests'
  )),
  label text not null,
  is_enabled boolean not null default true,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.platform_intake_controls enable row level security;
revoke all on table private.platform_intake_controls from public, anon, authenticated;
grant select, insert, update, delete on table private.platform_intake_controls to service_role;

insert into private.platform_intake_controls(control_key,label) values
  ('subscriber_onboarding','Subscriber onboarding'),
  ('procurement_submissions','Procurement submissions'),
  ('advertising_orders','Advertising orders'),
  ('service_requests','Service requests')
on conflict(control_key) do update set label=excluded.label;

create or replace function private.enforce_platform_intake_control()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  control text:=tg_argv[0];
  enabled boolean;
  jwt_role text:=coalesce((select auth.jwt()->>'role'),'');
begin
  if jwt_role in ('','service_role') then return new; end if;
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select c.is_enabled into enabled from private.platform_intake_controls c where c.control_key=control;
  if not coalesce(enabled,true) then
    raise exception '% is temporarily paused by Manohub operations',control using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_platform_intake_control() from public,anon,authenticated;
grant execute on function private.enforce_platform_intake_control() to service_role;

drop trigger if exists enforce_subscriber_onboarding_control on public.organizations;
create trigger enforce_subscriber_onboarding_control before insert on public.organizations
for each row execute function private.enforce_platform_intake_control('subscriber_onboarding');
drop trigger if exists enforce_procurement_submissions_control on public.opportunities;
create trigger enforce_procurement_submissions_control before insert on public.opportunities
for each row execute function private.enforce_platform_intake_control('procurement_submissions');
drop trigger if exists enforce_advertising_orders_control on public.advert_orders;
create trigger enforce_advertising_orders_control before insert on public.advert_orders
for each row execute function private.enforce_platform_intake_control('advertising_orders');
drop trigger if exists enforce_service_requests_control on public.service_requests;
create trigger enforce_service_requests_control before insert on public.service_requests
for each row execute function private.enforce_platform_intake_control('service_requests');

create or replace function public.get_administrator_control_centre_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  staff_role text;
  can_admin boolean;
  metrics jsonb:='[]'::jsonb;
  queues jsonb:='[]'::jsonb;
  risks jsonb:='[]'::jsonb;
  health jsonb:='[]'::jsonb;
  controls jsonb:='[]'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select s.role into staff_role from public.platform_staff_members s
    where s.user_id=(select auth.uid()) and s.status in ('invited','active');
  if staff_role is null then raise exception 'Platform staff access is required'; end if;
  can_admin:=staff_role in ('owner','administrator');

  if can_admin then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Genuine subscribers','value',(select count(*) from public.organizations o where not coalesce(o.is_demo,false) and coalesce(o.status,'active')<>'closed'),'format','number','href','admin-organizations'),
      jsonb_build_object('label','Active subscriptions','value',(select count(*) from public.subscriptions s join public.organizations o on o.id=s.org_id where s.status in ('trial','active','grace') and not coalesce(o.is_demo,false)),'format','number','href','admin-subscriptions'),
      jsonb_build_object('label','Cash collected','value',(select coalesce(sum(p.amount),0) from public.commercial_payments p join public.organizations o on o.id=p.org_id where not coalesce(o.is_demo,false)),'format','currency','href','admin-finance'),
      jsonb_build_object('label','Activity · 24h','value',(select count(*) from public.audit_logs a where a.created_at>=now()-interval '24 hours'),'format','number','href','admin-audit-log')
    );
  elsif staff_role='finance' then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Open invoices','value',(select count(*) from public.commercial_invoices i join public.organizations o on o.id=i.org_id where i.status in ('issued','partially_paid','overdue') and not coalesce(o.is_demo,false)),'format','number','href','admin-finance'),
      jsonb_build_object('label','Cash collected','value',(select coalesce(sum(p.amount),0) from public.commercial_payments p join public.organizations o on o.id=p.org_id where not coalesce(o.is_demo,false)),'format','currency','href','admin-finance'),
      jsonb_build_object('label','Payment reviews','value',(select count(*) from public.advert_orders a join public.organizations o on o.id=a.org_id where a.status='payment_review' and not coalesce(o.is_demo,false)),'format','number','href','admin-advert-revenue')
    );
  elsif staff_role='editorial' then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Published content','value',(select count(*) from public.cms_content c where c.status='published' and c.deleted_at is null),'format','number','href','content-cms'),
      jsonb_build_object('label','In review','value',(select count(*) from public.cms_content c where c.status='review' and c.deleted_at is null),'format','number','href','content-cms'),
      jsonb_build_object('label','Draft content','value',(select count(*) from public.cms_content c where c.status='draft' and c.deleted_at is null),'format','number','href','content-cms')
    );
  elsif staff_role='support' then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Open service requests','value',(select count(*) from public.service_requests r join public.organizations o on o.id=r.org_id where r.status not in ('resolved','closed') and not coalesce(o.is_demo,false)),'format','number','href','admin-services'),
      jsonb_build_object('label','Unassigned requests','value',(select count(*) from public.service_requests r join public.organizations o on o.id=r.org_id where r.assigned_to is null and r.status not in ('resolved','closed') and not coalesce(o.is_demo,false)),'format','number','href','admin-services'),
      jsonb_build_object('label','Pending verification','value',(select count(*) from public.verification_requests v join public.organizations o on o.id=v.org_id where v.status in ('pending','submitted','in_review') and not coalesce(o.is_demo,false)),'format','number','href','admin-verification')
    );
  else
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Audit events · 24h','value',(select count(*) from public.audit_logs a where a.created_at>=now()-interval '24 hours'),'format','number','href','admin-audit-log'),
      jsonb_build_object('label','Open incidents','value',(select count(*) from public.platform_incidents i where i.status not in ('resolved','postmortem_complete')),'format','number','href','admin-resilience'),
      jsonb_build_object('label','Failed commands · 24h','value',(select count(*) from public.backend_command_requests c where c.status='failed' and c.updated_at>=now()-interval '24 hours'),'format','number','href','admin-audit-log')
    );
  end if;

  if can_admin or staff_role in ('editorial','support') then
    queues:=jsonb_build_array(
      jsonb_build_object('label','Tender moderation','value',(select count(*) from public.opportunities o join public.opportunity_statuses s on s.id=o.status_id left join public.organizations org on org.id=o.buyer_org_id where s.code='awaiting_review' and not coalesce(org.is_demo,false)),'href','admin-tender-review'),
      jsonb_build_object('label','Verification','value',(select count(*) from public.verification_requests v join public.organizations o on o.id=v.org_id where v.status in ('pending','submitted','in_review') and not coalesce(o.is_demo,false)),'href','admin-verification'),
      jsonb_build_object('label','Subscriptions','value',(select count(*) from public.subscriptions s join public.organizations o on o.id=s.org_id where s.status in ('pending','past_due','grace') and not coalesce(o.is_demo,false)),'href','admin-subscriptions'),
      jsonb_build_object('label','Service requests','value',(select count(*) from public.service_requests r join public.organizations o on o.id=r.org_id where r.status not in ('resolved','closed') and not coalesce(o.is_demo,false)),'href','admin-services'),
      jsonb_build_object('label','Advertising','value',(select count(*) from public.advert_orders a join public.organizations o on o.id=a.org_id where a.status in ('pending_payment','payment_review','disputed') and not coalesce(o.is_demo,false)),'href','admin-advert-revenue')
    );
  end if;

  if can_admin or staff_role in ('finance','auditor') then
    risks:=jsonb_build_array(
      jsonb_build_object('label','Open payment disputes','value',(select count(*) from public.advert_payment_disputes d join public.organizations o on o.id=d.org_id where d.status in ('open','investigating') and not coalesce(o.is_demo,false)),'severity','warning','href','admin-advert-revenue'),
      jsonb_build_object('label','Measurement rejections · 24h','value',(select coalesce(sum(r.rejected_count),0) from private.measurement_rejection_rollups r where r.bucket_hour>=date_trunc('hour',now()-interval '24 hours')),'severity','warning','href','admin-analytics'),
      jsonb_build_object('label','Failed protected commands · 24h','value',(select count(*) from public.backend_command_requests c where c.status='failed' and c.updated_at>=now()-interval '24 hours'),'severity','critical','href','admin-commands')
    );
  end if;

  if can_admin or staff_role='auditor' then
    health:=jsonb_build_array(
      jsonb_build_object('label','Open incidents','value',(select count(*) from public.platform_incidents i where i.status not in ('resolved','postmortem_complete')),'severity','critical','href','admin-resilience'),
      jsonb_build_object('label','Dead-letter jobs','value',(select count(*) from private.background_jobs j where j.status='dead_letter'),'severity','critical','href','admin-jobs'),
      jsonb_build_object('label','Failed business events','value',(select count(*) from public.business_events e where e.status in ('failed','dead_letter')),'severity','warning','href','admin-jobs')
    );
  end if;

  if can_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',c.control_key,'label',c.label,'enabled',c.is_enabled,'reason',c.reason,
      'updatedAt',c.updated_at,'updatedBy',c.updated_by
    ) order by c.control_key),'[]'::jsonb) into controls from private.platform_intake_controls c;
  end if;

  return jsonb_build_object('role',staff_role,'generatedAt',now(),'metrics',metrics,'queues',queues,
    'risks',risks,'health',health,'controls',controls,'canManageControls',can_admin);
end;
$$;
revoke all on function public.get_administrator_control_centre_snapshot() from public,anon;
grant execute on function public.get_administrator_control_centre_snapshot() to authenticated,service_role;

create or replace function public.admin_update_platform_intake_control(
  p_control_key text,p_enabled boolean,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff_role text; prior private.platform_intake_controls; changed private.platform_intake_controls;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select s.role into staff_role from public.platform_staff_members s
    where s.user_id=(select auth.uid()) and s.status in ('invited','active');
  if staff_role not in ('owner','administrator') then raise exception 'Platform administrator access is required'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'A reason of at least 10 characters is required'; end if;
  select * into prior from private.platform_intake_controls c where c.control_key=p_control_key for update;
  if not found then raise exception 'Unknown intake control'; end if;
  update private.platform_intake_controls set is_enabled=p_enabled,reason=btrim(p_reason),
    updated_by=(select auth.uid()),updated_at=now() where control_key=p_control_key returning * into changed;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),'platform_intake_control.updated','platform_intake_control',p_control_key,
    jsonb_build_object('previous_enabled',prior.is_enabled,'enabled',changed.is_enabled,'reason',changed.reason));
  return jsonb_build_object('key',changed.control_key,'enabled',changed.is_enabled,'reason',changed.reason,'updatedAt',changed.updated_at);
end;
$$;
revoke all on function public.admin_update_platform_intake_control(text,boolean,text) from public,anon;
grant execute on function public.admin_update_platform_intake_control(text,boolean,text) to authenticated,service_role;

-- Keep the idempotent command envelope authoritative for the new control command.
create or replace function public.claim_backend_command(
  p_command_name text,p_idempotency_key text,p_payload_hash text,p_request_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); existing public.backend_command_requests;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not (p_command_name=any(array[
    'organization.invite','organization.transition','organization.recovery.decide','organization.purge',
    'subscription.transition','advertising.order.create','organization.verification.approve',
    'procurement.ingestion.promote','billing.payment.record','billing.credit.issue','billing.refund.record',
    'platform_staff.update','platform_intake_control.update'
  ])) then raise exception 'Unsupported command'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid payload hash'; end if;
  insert into public.backend_command_requests(actor_id,command_name,idempotency_key,payload_hash,request_id)
  values(actor,p_command_name,p_idempotency_key,p_payload_hash,left(p_request_id,128))
  on conflict(actor_id,command_name,idempotency_key) do nothing returning * into existing;
  if found then return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id); end if;
  select * into existing from public.backend_command_requests where actor_id=actor and command_name=p_command_name and idempotency_key=p_idempotency_key for update;
  if existing.payload_hash<>p_payload_hash then raise exception 'Idempotency key was already used with different input'; end if;
  if existing.status='succeeded' then return jsonb_build_object('execute',false,'cached',true,'commandId',existing.id,'result',existing.result); end if;
  if existing.status='processing' and existing.started_at<now()-interval '5 minutes' then
    update public.backend_command_requests set attempt_count=attempt_count+1,started_at=now(),updated_at=now(),request_id=left(p_request_id,128),error_code=null where id=existing.id;
  elsif existing.status='failed' then
    update public.backend_command_requests set status='processing',attempt_count=attempt_count+1,started_at=now(),updated_at=now(),request_id=left(p_request_id,128),error_code=null where id=existing.id;
  else raise exception 'Command is already processing'; end if;
  return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id);
end;
$$;
revoke all on function public.claim_backend_command(text,text,text,text) from public,anon;
grant execute on function public.claim_backend_command(text,text,text,text) to authenticated;

commit;
