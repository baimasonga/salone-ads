-- HYDERRA STAGING ONLY: project gknewzlxndmummwynuoa
-- Batch 2 of 5. Requires migrations through 45.
-- Original SQL follows unchanged; transactions are preserved.
-- On any error STOP. Earlier migrations may have committed.


-- ===== START 46_transactional_business_event_outbox.sql =====
-- Transactional business-event outbox integrated with the durable job queue.
begin;

create table if not exists public.business_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check(event_type ~ '^[A-Z][A-Za-z0-9]{2,79}$'),
  aggregate_type text not null check(aggregate_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  aggregate_id text not null,
  org_id uuid references public.organizations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid references public.business_events(id) on delete set null,
  idempotency_key text not null,
  status text not null default 'pending' check(status in ('pending','processing','processed','failed','dead_letter')),
  attempts integer not null default 0 check(attempts>=0),
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz, locked_by text, processed_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_type,idempotency_key)
);
create table if not exists public.business_event_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.business_events(id) on delete cascade,
  attempt_number integer not null, worker_id text not null, outcome text not null check(outcome in ('claimed','processed','failed')),
  error_message text, created_at timestamptz not null default now()
);
create index if not exists business_events_claim_idx on public.business_events(available_at,created_at) where status in ('pending','failed');
create index if not exists business_events_admin_idx on public.business_events(status,updated_at desc);
alter table public.business_events enable row level security; alter table public.business_event_attempts enable row level security;
revoke all on public.business_events,public.business_event_attempts from public,anon,authenticated;
grant select on public.business_events,public.business_event_attempts to authenticated;
drop policy if exists business_events_admin_read on public.business_events;
create policy business_events_admin_read on public.business_events for select to authenticated using(public.is_platform_admin());
drop policy if exists business_event_attempts_admin_read on public.business_event_attempts;
create policy business_event_attempts_admin_read on public.business_event_attempts for select to authenticated using(public.is_platform_admin());

create or replace function private.emit_business_event(p_event_type text,p_aggregate_type text,p_aggregate_id text,p_org_id uuid,p_payload jsonb,p_idempotency_key text,p_correlation_id uuid default gen_random_uuid(),p_causation_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid; begin
 insert into public.business_events(event_type,aggregate_type,aggregate_id,org_id,payload,idempotency_key,correlation_id,causation_id)
 values(p_event_type,p_aggregate_type,p_aggregate_id,p_org_id,coalesce(p_payload,'{}'),p_idempotency_key,p_correlation_id,p_causation_id)
 on conflict(event_type,idempotency_key) do update set updated_at=public.business_events.updated_at returning id into v_id;
 perform private.enqueue_background_job('business_event.dispatch',jsonb_build_object('event_id',v_id),v_id::text,now(),5,10::smallint);
 return v_id; end; $$;
revoke all on function private.emit_business_event(text,text,text,uuid,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.emit_business_event(text,text,text,uuid,jsonb,text,uuid,uuid) to service_role;

create or replace function private.claim_business_event(p_event_id uuid,p_worker_id text)
returns jsonb language plpgsql security definer set search_path='' as $$ declare v_event public.business_events%rowtype; begin
 if nullif(trim(p_worker_id),'') is null then raise exception 'Worker id is required'; end if;
 select * into v_event from public.business_events where id=p_event_id and status in ('pending','failed') and available_at<=now() for update skip locked;
 if not found then return null; end if;
 update public.business_events set status='processing',attempts=attempts+1,locked_at=now(),locked_by=p_worker_id,last_error=null,updated_at=now() where id=p_event_id returning * into v_event;
 insert into public.business_event_attempts(event_id,attempt_number,worker_id,outcome) values(v_event.id,v_event.attempts,p_worker_id,'claimed');
 return jsonb_build_object('id',v_event.id,'event_type',v_event.event_type,'aggregate_type',v_event.aggregate_type,'aggregate_id',v_event.aggregate_id,'org_id',v_event.org_id,'payload',v_event.payload,'correlation_id',v_event.correlation_id,'causation_id',v_event.causation_id,'attempt',v_event.attempts,'max_attempts',v_event.max_attempts);
end; $$;
revoke all on function private.claim_business_event(uuid,text) from public,anon,authenticated;
grant execute on function private.claim_business_event(uuid,text) to service_role;

create or replace function private.complete_business_event(p_event_id uuid,p_worker_id text)
returns boolean language plpgsql security definer set search_path='' as $$ declare v_attempt integer; begin
 update public.business_events set status='processed',processed_at=now(),locked_at=null,locked_by=null,last_error=null,updated_at=now()
 where id=p_event_id and status='processing' and locked_by=p_worker_id returning attempts into v_attempt;
 if not found then return false; end if;
 insert into public.business_event_attempts(event_id,attempt_number,worker_id,outcome) values(p_event_id,v_attempt,p_worker_id,'processed');
 return true;
end; $$;
revoke all on function private.complete_business_event(uuid,text) from public,anon,authenticated;
grant execute on function private.complete_business_event(uuid,text) to service_role;

create or replace function private.fail_business_event(p_event_id uuid,p_worker_id text,p_error text)
returns text language plpgsql security definer set search_path='' as $$ declare v_attempt integer; v_max_attempts integer; v_status text; begin
 select attempts,max_attempts into v_attempt,v_max_attempts from public.business_events
 where id=p_event_id and status='processing' and locked_by=p_worker_id for update;
 if not found then return null; end if;
 v_status:=case when v_attempt>=v_max_attempts then 'dead_letter' else 'failed' end;
 update public.business_events set status=v_status,
   available_at=case when v_status='failed' then now()+make_interval(secs=>least(3600,30*power(2,greatest(v_attempt-1,0)))::integer) else available_at end,
   locked_at=null,locked_by=null,last_error=left(coalesce(p_error,'Unknown dispatch error'),4000),updated_at=now()
 where id=p_event_id;
 insert into public.business_event_attempts(event_id,attempt_number,worker_id,outcome,error_message)
 values(p_event_id,v_attempt,p_worker_id,'failed',left(coalesce(p_error,'Unknown dispatch error'),4000));
 return v_status;
end; $$;
revoke all on function private.fail_business_event(uuid,text,text) from public,anon,authenticated;
grant execute on function private.fail_business_event(uuid,text,text) to service_role;

create or replace function private.capture_subscription_business_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform private.emit_business_event(case new.event_type when 'activated' then 'SubscriptionActivated' when 'renewed' then 'SubscriptionRenewed' when 'suspended' then 'SubscriptionSuspended' when 'cancelled' then 'SubscriptionCancelled' else 'SubscriptionChanged' end,'subscription',new.subscription_id::text,new.org_id,jsonb_build_object('event_type',new.event_type,'from_status',new.from_status,'to_status',new.to_status),new.id::text,gen_random_uuid(),null); return new; end; $$;
revoke all on function private.capture_subscription_business_event() from public,anon,authenticated;
drop trigger if exists subscription_events_emit_business_event on public.subscription_events;
create trigger subscription_events_emit_business_event after insert on public.subscription_events for each row execute function private.capture_subscription_business_event();

create or replace function private.capture_financial_business_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform private.emit_business_event(case new.entry_type when 'payment' then 'PaymentReceived' when 'invoice' then 'InvoiceIssued' when 'refund' then 'RefundRecorded' else 'LedgerEntryRecorded' end,'ledger_entry',new.id::text,new.org_id,jsonb_build_object('entry_type',new.entry_type,'direction',new.direction,'amount',new.amount,'currency',new.currency_code),new.id::text,gen_random_uuid(),null); return new; end; $$;
revoke all on function private.capture_financial_business_event() from public,anon,authenticated;
drop trigger if exists commercial_ledger_emit_business_event on public.commercial_ledger_entries;
create trigger commercial_ledger_emit_business_event after insert on public.commercial_ledger_entries for each row execute function private.capture_financial_business_event();

create or replace function public.admin_list_business_events(p_status text default null,p_limit integer default 50)
returns table(id uuid,event_type text,aggregate_type text,aggregate_id text,status text,attempts integer,max_attempts integer,correlation_id uuid,last_error text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 return query select e.id,e.event_type,e.aggregate_type,e.aggregate_id,e.status,e.attempts,e.max_attempts,e.correlation_id,e.last_error,e.created_at,e.updated_at from public.business_events e where p_status is null or e.status=p_status order by case e.status when 'dead_letter' then 0 when 'failed' then 1 when 'processing' then 2 else 3 end,e.updated_at desc limit least(greatest(p_limit,1),200); end; $$;
revoke all on function public.admin_list_business_events(text,integer) from public,anon; grant execute on function public.admin_list_business_events(text,integer) to authenticated;
create or replace function public.admin_replay_business_event(p_event_id uuid) returns boolean language plpgsql security definer set search_path='' as $$ declare n integer; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 update public.business_events set status='pending',attempts=0,available_at=now(),locked_at=null,locked_by=null,last_error=null,updated_at=now() where id=p_event_id and status in ('failed','dead_letter'); get diagnostics n=row_count;
 if n=1 then perform private.enqueue_background_job('business_event.dispatch',jsonb_build_object('event_id',p_event_id),'replay:'||p_event_id::text||':'||extract(epoch from now())::bigint,now(),5,10::smallint); end if; return n=1; end; $$;
revoke all on function public.admin_replay_business_event(uuid) from public,anon; grant execute on function public.admin_replay_business_event(uuid) to authenticated;

commit;

-- ===== END 46_transactional_business_event_outbox.sql =====

-- ===== START 47_central_workflow_state_machines.sql =====
-- Central workflow transition catalogue, enforcement, and immutable history.
begin;

create table if not exists public.workflow_transition_rules (
  domain text not null,
  from_status text not null,
  to_status text not null,
  requires_reason boolean not null default false,
  to_is_terminal boolean not null default false,
  description text not null default '',
  enabled boolean not null default true,
  primary key(domain,from_status,to_status)
);

create table if not exists public.workflow_transition_history (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  entity_id text not null,
  org_id uuid references public.organizations(id) on delete set null,
  from_status text not null,
  to_status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index if not exists workflow_transition_history_entity_idx
  on public.workflow_transition_history(domain,entity_id,created_at desc);
create index if not exists workflow_transition_history_org_idx
  on public.workflow_transition_history(org_id,created_at desc) where org_id is not null;

alter table public.workflow_transition_rules enable row level security;
alter table public.workflow_transition_history enable row level security;
revoke all on public.workflow_transition_rules,public.workflow_transition_history from public,anon,authenticated;
grant select on public.workflow_transition_rules,public.workflow_transition_history to authenticated;
drop policy if exists workflow_rules_admin_read on public.workflow_transition_rules;
create policy workflow_rules_admin_read on public.workflow_transition_rules
  for select to authenticated using(public.is_platform_admin());
drop policy if exists workflow_history_admin_read on public.workflow_transition_history;
create policy workflow_history_admin_read on public.workflow_transition_history
  for select to authenticated using(public.is_platform_admin());
drop policy if exists workflow_history_org_read on public.workflow_transition_history;
create policy workflow_history_org_read on public.workflow_transition_history
  for select to authenticated using(org_id is not null and public.is_org_member(org_id));

insert into public.workflow_transition_rules(domain,from_status,to_status,requires_reason,to_is_terminal,description) values
-- Procurement
('tender','draft','awaiting_review',false,false,'Submit draft for review'),
('tender','needs_correction','awaiting_review',false,false,'Resubmit corrected tender'),
('tender','awaiting_review','published',false,false,'Approve and publish'),
('tender','awaiting_review','needs_correction',true,false,'Request correction'),
('tender','awaiting_review','rejected',true,true,'Reject submission'),
('tender','draft','cancelled',false,true,'Cancel draft'),
('tender','awaiting_review','cancelled',false,true,'Cancel submitted tender'),
('tender','needs_correction','cancelled',false,true,'Cancel corrected tender'),
('tender','published','amended',false,false,'Publish amendment'),
('tender','deadline_extended','amended',false,false,'Publish amendment'),
('tender','amended','amended',false,false,'Publish another amendment'),
('tender','published','deadline_extended',false,false,'Extend deadline'),
('tender','amended','deadline_extended',false,false,'Extend amended tender deadline'),
('tender','deadline_extended','deadline_extended',false,false,'Extend deadline again'),
('tender','published','closed',false,true,'Close tender'),
('tender','amended','closed',false,true,'Close amended tender'),
('tender','deadline_extended','closed',false,true,'Close extended tender'),
('tender','published','awarded',false,true,'Record award'),
('tender','amended','awarded',false,true,'Record award'),
('tender','deadline_extended','awarded',false,true,'Record award'),
('tender','closed','awarded',false,true,'Record award after close'),
('tender','published','cancelled',false,true,'Cancel published tender'),
('tender','amended','cancelled',false,true,'Cancel amended tender'),
('tender','deadline_extended','cancelled',false,true,'Cancel extended tender'),
-- Advertising campaigns
('campaign','draft','submitted',false,false,'Submit campaign for review'),
('campaign','rejected','draft',false,false,'Return rejected campaign to draft'),
('campaign','rejected','submitted',false,false,'Resubmit rejected campaign'),
('campaign','submitted','approved',false,false,'Approve campaign'),
('campaign','submitted','rejected',true,true,'Reject campaign'),
('campaign','approved','active',false,false,'Activate approved campaign'),
('campaign','approved','paused',false,false,'Pause before activation'),
('campaign','approved','completed',false,true,'Complete approved campaign'),
('campaign','active','paused',false,false,'Pause campaign'),
('campaign','active','completed',false,true,'Complete campaign'),
('campaign','paused','active',false,false,'Resume campaign'),
('campaign','paused','completed',false,true,'Complete paused campaign'),
-- Editorial content
('cms_content','draft','review',false,false,'Submit content for review'),
('cms_content','review','draft',true,false,'Return content for correction'),
('cms_content','review','approved',false,false,'Approve content'),
('cms_content','approved','review',true,false,'Return approved content to review'),
('cms_content','approved','published',false,false,'Publish approved content'),
('cms_content','published','archived',false,true,'Archive published content'),
('cms_content','archived','draft',false,false,'Restore archived content as draft'),
-- Subscriptions
('subscription','pending','trialing',false,false,'Start trial'),
('subscription','pending','active',false,false,'Activate subscription'),
('subscription','pending','cancelled',false,true,'Cancel request'),
('subscription','trialing','active',false,false,'Activate trial'),
('subscription','trialing','cancelled',false,true,'Cancel trial'),
('subscription','trialing','expired',false,true,'Expire trial'),
('subscription','active','past_due',false,false,'Mark payment past due'),
('subscription','active','suspended',true,false,'Suspend subscription'),
('subscription','active','cancelled',false,true,'Cancel subscription'),
('subscription','active','expired',false,true,'Expire subscription'),
('subscription','past_due','active',false,false,'Restore paid subscription'),
('subscription','past_due','grace_period',false,false,'Start grace period'),
('subscription','past_due','suspended',true,false,'Suspend past-due subscription'),
('subscription','past_due','cancelled',false,true,'Cancel past-due subscription'),
('subscription','past_due','expired',false,true,'Expire past-due subscription'),
('subscription','grace_period','active',false,false,'Restore subscription in grace'),
('subscription','grace_period','suspended',true,false,'Suspend subscription in grace'),
('subscription','grace_period','cancelled',false,true,'Cancel subscription in grace'),
('subscription','grace_period','expired',false,true,'Expire subscription in grace'),
('subscription','suspended','active',false,false,'Resume subscription'),
('subscription','suspended','cancelled',false,true,'Cancel suspended subscription'),
('subscription','suspended','expired',false,true,'Expire suspended subscription')
on conflict(domain,from_status,to_status) do update set
 requires_reason=excluded.requires_reason,to_is_terminal=excluded.to_is_terminal,
 description=excluded.description,enabled=true;

create or replace function private.record_workflow_transition(
  p_domain text,p_entity_id text,p_org_id uuid,p_from_status text,p_to_status text,p_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_rule public.workflow_transition_rules%rowtype; v_id uuid; v_correlation uuid:=gen_random_uuid();
begin
 if p_from_status is not distinct from p_to_status then return null; end if;
 select * into v_rule from public.workflow_transition_rules
 where domain=p_domain and from_status=p_from_status and to_status=p_to_status and enabled;
 if not found then raise exception 'Invalid % transition: % -> %',p_domain,p_from_status,p_to_status; end if;
 if v_rule.requires_reason and nullif(trim(coalesce(p_reason,'')),'') is null then
   raise exception 'A reason is required for % transition: % -> %',p_domain,p_from_status,p_to_status;
 end if;
 insert into public.workflow_transition_history(domain,entity_id,org_id,from_status,to_status,actor_id,reason,correlation_id)
 values(p_domain,p_entity_id,p_org_id,p_from_status,p_to_status,auth.uid(),nullif(trim(p_reason),''),v_correlation)
 returning id into v_id;
 insert into public.audit_logs(actor_id,org_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_org_id,p_domain||'.transitioned',p_domain,p_entity_id,
   jsonb_build_object('from_status',p_from_status,'to_status',p_to_status,'reason',nullif(trim(p_reason),''),'correlation_id',v_correlation));
 if p_domain<>'subscription' then
   perform private.emit_business_event('WorkflowTransitioned',p_domain,p_entity_id,p_org_id,
     jsonb_build_object('from_status',p_from_status,'to_status',p_to_status,'reason',nullif(trim(p_reason),'')),
     v_id::text,v_correlation,null);
 end if;
 return v_id;
end; $$;
revoke all on function private.record_workflow_transition(text,text,uuid,text,text,text) from public,anon,authenticated;

create or replace function private.capture_tender_workflow_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_old text; v_new text; begin
 select code into v_old from public.opportunity_statuses where id=old.status_id;
 select code into v_new from public.opportunity_statuses where id=new.status_id;
 perform private.record_workflow_transition('tender',new.id::text,new.buyer_org_id,v_old,v_new,new.review_note);
 return new;
end; $$;
create or replace function private.capture_campaign_workflow_transition() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform private.record_workflow_transition('campaign',new.id::text,new.org_id,old.status,new.status,new.rejection_reason);
 return new;
end; $$;
create or replace function private.capture_cms_workflow_transition() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform private.record_workflow_transition('cms_content',new.id::text,null,old.status,new.status,new.review_note);
 return new;
end; $$;
create or replace function private.capture_subscription_workflow_transition() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform private.record_workflow_transition('subscription',new.id::text,new.org_id,old.status,new.status,coalesce(new.suspension_reason,new.notes));
 return new;
end; $$;
revoke all on function private.capture_tender_workflow_transition() from public,anon,authenticated;
revoke all on function private.capture_campaign_workflow_transition() from public,anon,authenticated;
revoke all on function private.capture_cms_workflow_transition() from public,anon,authenticated;
revoke all on function private.capture_subscription_workflow_transition() from public,anon,authenticated;

drop trigger if exists workflow_transition_tender on public.opportunities;
create trigger workflow_transition_tender after update of status_id on public.opportunities
for each row when(old.status_id is distinct from new.status_id) execute function private.capture_tender_workflow_transition();
drop trigger if exists workflow_transition_campaign on public.ad_campaigns;
create trigger workflow_transition_campaign after update of status on public.ad_campaigns
for each row when(old.status is distinct from new.status) execute function private.capture_campaign_workflow_transition();
drop trigger if exists workflow_transition_cms on public.cms_content;
create trigger workflow_transition_cms after update of status on public.cms_content
for each row when(old.status is distinct from new.status) execute function private.capture_cms_workflow_transition();
drop trigger if exists workflow_transition_subscription on public.subscriptions;
create trigger workflow_transition_subscription after update of status on public.subscriptions
for each row when(old.status is distinct from new.status) execute function private.capture_subscription_workflow_transition();

create or replace function public.admin_list_workflow_transitions(p_domain text default null,p_limit integer default 100)
returns table(id uuid,domain text,entity_id text,org_id uuid,from_status text,to_status text,actor_id uuid,reason text,correlation_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 return query select h.id,h.domain,h.entity_id,h.org_id,h.from_status,h.to_status,h.actor_id,h.reason,h.correlation_id,h.created_at
 from public.workflow_transition_history h where p_domain is null or h.domain=p_domain
 order by h.created_at desc limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_workflow_transitions(text,integer) from public,anon;
grant execute on function public.admin_list_workflow_transitions(text,integer) to authenticated;

commit;

-- ===== END 47_central_workflow_state_machines.sql =====

-- ===== START 48_automated_lifecycle_workflows.sql =====
-- Idempotent lifecycle automation using the existing state machines,
-- notification centre, audit log, outbox and pg_cron scheduler.
begin;

create unique index if not exists notifications_automation_key_idx
  on public.notifications(user_id,(metadata->>'automation_key'))
  where metadata ? 'automation_key';

create table if not exists public.lifecycle_automation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check(status in ('running','completed','failed')),
  tenders_closed integer not null default 0,
  reminders_created integer not null default 0,
  campaigns_activated integer not null default 0,
  campaigns_completed integer not null default 0,
  subscriptions_changed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.lifecycle_automation_runs enable row level security;
revoke all on public.lifecycle_automation_runs from public,anon,authenticated;
grant select on public.lifecycle_automation_runs to authenticated;
drop policy if exists lifecycle_automation_runs_admin_read on public.lifecycle_automation_runs;
create policy lifecycle_automation_runs_admin_read on public.lifecycle_automation_runs
  for select to authenticated using(public.is_platform_admin());

create or replace function private.create_lifecycle_notification(
  p_user_id uuid,p_org_id uuid,p_category text,p_title text,p_body text,
  p_workspace_target text,p_action_label text,p_automation_key text,p_metadata jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 insert into public.notifications(
   user_id,org_id,category,title,body,link_url,channel,status,priority,
   workspace_target,action_label,metadata
 ) values(
   p_user_id,p_org_id,p_category,p_title,p_body,null,'in_app','pending','high',
   p_workspace_target,p_action_label,
   coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('automation_key',p_automation_key)
 ) on conflict do nothing;
 get diagnostics v_count=row_count;
 return v_count=1;
end; $$;
revoke all on function private.create_lifecycle_notification(uuid,uuid,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;

create or replace function private.run_lifecycle_automation()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_run_id uuid; v_tenders integer:=0; v_reminders integer:=0;
 v_activated integer:=0; v_completed integer:=0; v_subscriptions integer:=0;
 v_row record; v_user record; v_event text; v_from text; v_to text; v_reason text;
begin
 insert into public.lifecycle_automation_runs default values returning id into v_run_id;
 begin

 -- Notify saved-tender watchers at seven, three and one day, with a unique key
 -- per deadline version so a later deadline extension can notify again.
 for v_row in
   select o.id,o.slug,o.title,o.buyer_org_id,o.submission_deadline,
     (o.submission_deadline::date-current_date)::integer days_left
   from public.opportunities o join public.opportunity_statuses s on s.id=o.status_id
   where s.code in ('published','amended','deadline_extended')
     and o.submission_deadline::date-current_date in (7,3,1)
 loop
   for v_user in
     select distinct recipients.user_id from (
       select so.user_id from public.saved_opportunities so where so.opportunity_id=v_row.id
       union
       select om.user_id from public.organization_members om
       where om.org_id=v_row.buyer_org_id and om.role in ('owner','admin')
     ) recipients
   loop
     if private.create_lifecycle_notification(
       v_user.user_id,v_row.buyer_org_id,'deadline_reminder',
       case when v_row.days_left=1 then 'Tender deadline tomorrow: ' else 'Tender deadline approaching: ' end||v_row.title,
       'Submission closes on '||to_char(v_row.submission_deadline,'DD Mon YYYY HH24:MI')||'.',
       'tenders','View tender',
       'tender:'||v_row.id::text||':deadline:'||v_row.submission_deadline::text||':'||v_row.days_left::text,
       jsonb_build_object('opportunity_id',v_row.id,'days_left',v_row.days_left)
     ) then v_reminders:=v_reminders+1; end if;
   end loop;
 end loop;

 -- Closing through a normal status update invokes migration 47's state machine,
 -- immutable transition history, audit entry and outbox event.
 update public.opportunities o set status_id=s_closed.id
 from public.opportunity_statuses s_current,public.opportunity_statuses s_closed
 where o.status_id=s_current.id and s_closed.code='closed'
   and s_current.code in ('published','amended','deadline_extended')
   and o.submission_deadline<now();
 get diagnostics v_tenders=row_count;

 -- Reuse the existing proven campaign scheduler. Its updates are now also
 -- validated and recorded by the central campaign state machine.
 select activated,completed into v_activated,v_completed
 from private.run_ad_campaign_schedule();

 -- Subscription reminders go to organization owners/admins and are deduplicated
 -- by subscription, milestone and current period/trial date.
 for v_row in
   select s.id,s.org_id,s.status,s.trial_ends_at,s.current_period_end,s.grace_ends_at
   from public.subscriptions s
   where (s.status='trialing' and s.trial_ends_at-current_date in (7,3,1))
      or (s.status='active' and s.current_period_end-current_date in (7,3,1))
      or (s.status='grace_period' and s.grace_ends_at-current_date in (3,1))
 loop
   for v_user in select user_id from public.organization_members
     where org_id=v_row.org_id and role in ('owner','admin')
   loop
     if private.create_lifecycle_notification(
       v_user.user_id,v_row.org_id,'subscriptions',
       case v_row.status when 'trialing' then 'Trial ending soon'
         when 'grace_period' then 'Subscription suspension approaching'
         else 'Subscription renewal approaching' end,
       case v_row.status when 'trialing' then 'Your trial ends on '||to_char(v_row.trial_ends_at,'DD Mon YYYY')||'.'
         when 'grace_period' then 'Your grace period ends on '||to_char(v_row.grace_ends_at,'DD Mon YYYY')||'.'
         else 'Your current subscription period ends on '||to_char(v_row.current_period_end,'DD Mon YYYY')||'.' end,
       'billing','Review subscription',
       'subscription:'||v_row.id::text||':'||v_row.status||':'||
         coalesce(v_row.trial_ends_at,v_row.grace_ends_at,v_row.current_period_end)::text,
       jsonb_build_object('subscription_id',v_row.id,'milestone',v_row.status)
     ) then v_reminders:=v_reminders+1; end if;
   end loop;
 end loop;

 -- Apply automated subscription transitions in deterministic order and retain
 -- the existing domain-specific subscription events used by the outbox.
 for v_row in
   select * from public.subscriptions
   where cancel_at_period_end and current_period_end<current_date
      or status='trialing' and trial_ends_at<current_date
      or status='active' and current_period_end<current_date
      or status='grace_period' and grace_ends_at<current_date
   order by created_at for update
 loop
   v_from:=v_row.status; v_reason:=null;
   if v_row.cancel_at_period_end and v_row.current_period_end<current_date then
     v_to:='cancelled'; v_event:='cancelled'; v_reason:='Scheduled cancellation reached its effective date';
     update public.subscriptions set status=v_to,cancel_at_period_end=false,cancelled_at=now(),
       notes=coalesce(notes,v_reason),updated_at=now() where id=v_row.id;
   elsif v_row.status='trialing' and v_row.trial_ends_at<current_date then
     v_to:='expired'; v_event:='expired'; v_reason:='Trial period ended';
     update public.subscriptions set status=v_to,updated_at=now() where id=v_row.id;
   elsif v_row.status='active' and v_row.current_period_end<current_date then
     v_to:='past_due'; v_event:='past_due'; v_reason:='Subscription period ended without renewal';
     update public.subscriptions set status=v_to,grace_ends_at=current_date+7,updated_at=now() where id=v_row.id;
   else
     v_to:='suspended'; v_event:='suspended'; v_reason:='Automatic suspension after grace period';
     update public.subscriptions set status=v_to,suspended_at=now(),suspension_reason=v_reason,updated_at=now()
     where id=v_row.id;
   end if;
   insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason,metadata)
   values(v_row.id,v_row.org_id,v_event,v_from,v_to,v_reason,jsonb_build_object('source','lifecycle_automation','run_id',v_run_id));
   v_subscriptions:=v_subscriptions+1;
 end loop;

 update public.lifecycle_automation_runs set status='completed',tenders_closed=v_tenders,
   reminders_created=v_reminders,campaigns_activated=coalesce(v_activated,0),
   campaigns_completed=coalesce(v_completed,0),subscriptions_changed=v_subscriptions,
   completed_at=now() where id=v_run_id;
 return jsonb_build_object('run_id',v_run_id,'tenders_closed',v_tenders,'reminders_created',v_reminders,
   'campaigns_activated',coalesce(v_activated,0),'campaigns_completed',coalesce(v_completed,0),
   'subscriptions_changed',v_subscriptions);
exception when others then
 update public.lifecycle_automation_runs set status='failed',error_message=left(sqlerrm,2000),completed_at=now()
 where id=v_run_id;
 return jsonb_build_object('run_id',v_run_id,'status','failed','error',sqlerrm);
 end;
end; $$;
revoke all on function private.run_lifecycle_automation() from public,anon,authenticated;
grant execute on function private.run_lifecycle_automation() to service_role;

create or replace function public.admin_list_lifecycle_automation_runs(p_limit integer default 25)
returns setof public.lifecycle_automation_runs language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 return query select * from public.lifecycle_automation_runs order by started_at desc
 limit least(greatest(p_limit,1),100);
end; $$;
revoke all on function public.admin_list_lifecycle_automation_runs(integer) from public,anon;
grant execute on function public.admin_list_lifecycle_automation_runs(integer) to authenticated;

do $$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='manohub-lifecycle-automation' limit 1;
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule('manohub-lifecycle-automation','15 * * * *','select private.run_lifecycle_automation();');
end; $$;

commit;

-- ===== END 48_automated_lifecycle_workflows.sql =====

-- ===== START 49_organization_lifecycle_and_recovery.sql =====
-- Organization lifecycle, recoverable closure, ownership transfer and support recovery.
begin;

alter table public.organizations
  add column if not exists status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists recoverable_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check(status in ('active','suspended','recovery_pending','closed'));
alter table public.organizations drop constraint if exists organizations_status_reason_check;
alter table public.organizations add constraint organizations_status_reason_check
  check(status_reason is null or length(status_reason)<=1000);
create index if not exists organizations_lifecycle_idx on public.organizations(status,updated_at desc);

create table if not exists public.organization_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check(event_type in (
    'suspended','reactivated','closed','recovery_requested','recovery_approved',
    'recovery_rejected','ownership_transferred'
  )),
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists organization_lifecycle_events_org_idx
  on public.organization_lifecycle_events(org_id,created_at desc);

create table if not exists public.organization_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check(length(trim(reason)) between 10 and 1000),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text check(decision_note is null or length(decision_note)<=1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists organization_recovery_one_pending_idx
  on public.organization_recovery_requests(org_id) where status='pending';

alter table public.organization_lifecycle_events enable row level security;
alter table public.organization_recovery_requests enable row level security;
revoke all on public.organization_lifecycle_events,public.organization_recovery_requests from public,anon,authenticated;
grant select on public.organization_lifecycle_events,public.organization_recovery_requests to authenticated;
drop policy if exists organization_lifecycle_admin_read on public.organization_lifecycle_events;
create policy organization_lifecycle_admin_read on public.organization_lifecycle_events
  for select to authenticated using(public.is_platform_admin());
drop policy if exists organization_lifecycle_member_read on public.organization_lifecycle_events;
create policy organization_lifecycle_member_read on public.organization_lifecycle_events
  for select to authenticated using(public.is_org_member(org_id));
drop policy if exists organization_recovery_admin_read on public.organization_recovery_requests;
create policy organization_recovery_admin_read on public.organization_recovery_requests
  for select to authenticated using(public.is_platform_admin());
drop policy if exists organization_recovery_owner_read on public.organization_recovery_requests;
create policy organization_recovery_owner_read on public.organization_recovery_requests
  for select to authenticated using(exists(
    select 1 from public.organization_members m where m.org_id=organization_recovery_requests.org_id
    and m.user_id=auth.uid() and m.role='owner'
  ));

-- Suspended and closed organizations retain membership visibility for recovery,
-- but no longer receive paid feature entitlements.
create or replace function public.org_has_feature(p_org_id uuid,p_feature_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations o where o.id=p_org_id and o.status='active')
   and (public.get_org_feature_limit(p_org_id,p_feature_key) is null
     or public.get_org_feature_limit(p_org_id,p_feature_key)>0);
$$;
revoke all on function public.org_has_feature(uuid,text) from public,anon,authenticated;
grant execute on function public.org_has_feature(uuid,text) to anon,authenticated,service_role;

create or replace function private.protect_organization_lifecycle_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if public.is_platform_admin() or current_setting('app.organization_lifecycle_override',true)='on' then return new; end if;
 new.status:=old.status; new.status_reason:=old.status_reason; new.suspended_at:=old.suspended_at;
 new.suspended_by:=old.suspended_by; new.closed_at:=old.closed_at;
 new.recoverable_until:=old.recoverable_until;
 return new;
end; $$;
revoke all on function private.protect_organization_lifecycle_fields() from public,anon,authenticated;
drop trigger if exists protect_organization_lifecycle_fields on public.organizations;
create trigger protect_organization_lifecycle_fields before update on public.organizations
for each row execute function private.protect_organization_lifecycle_fields();

create or replace function private.capture_organization_lifecycle_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.emit_business_event(
   case new.event_type when 'suspended' then 'OrganizationSuspended'
     when 'reactivated' then 'OrganizationReactivated'
     when 'closed' then 'OrganizationClosed'
     when 'recovery_requested' then 'OrganizationRecoveryRequested'
     when 'recovery_approved' then 'OrganizationRecoveryApproved'
     when 'recovery_rejected' then 'OrganizationRecoveryRejected'
     when 'ownership_transferred' then 'OrganizationOwnershipTransferred'
     else 'OrganizationChanged' end,
   'organization',new.org_id::text,new.org_id,
   jsonb_build_object('event_type',new.event_type,'from_status',new.from_status,'to_status',new.to_status,'reason',new.reason),
   new.id::text,gen_random_uuid(),null
 );
 return new;
end; $$;
revoke all on function private.capture_organization_lifecycle_event() from public,anon,authenticated;
drop trigger if exists organization_lifecycle_emit_event on public.organization_lifecycle_events;
create trigger organization_lifecycle_emit_event after insert on public.organization_lifecycle_events
for each row execute function private.capture_organization_lifecycle_event();

create or replace function public.request_organization_recovery(p_org_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.organization_members where org_id=p_org_id and user_id=auth.uid() and role='owner')
   then raise exception 'Organization owner access required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
   raise exception 'Recovery reason must be between 10 and 1000 characters'; end if;
 select status into v_status from public.organizations where id=p_org_id for update;
 if v_status not in ('suspended','closed') then raise exception 'Organization is not eligible for recovery'; end if;
 if v_status='closed' and (select recoverable_until<now() from public.organizations where id=p_org_id)
   then raise exception 'The recovery period has expired'; end if;
 insert into public.organization_recovery_requests(org_id,requested_by,reason)
 values(p_org_id,auth.uid(),trim(p_reason)) returning id into v_id;
 perform set_config('app.organization_lifecycle_override','on',true);
 update public.organizations set status='recovery_pending',updated_at=now() where id=p_org_id;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason,metadata)
 values(p_org_id,auth.uid(),'recovery_requested',v_status,'recovery_pending',trim(p_reason),jsonb_build_object('request_id',v_id));
 return v_id;
end; $$;
revoke all on function public.request_organization_recovery(uuid,text) from public,anon;
grant execute on function public.request_organization_recovery(uuid,text) to authenticated;

create or replace function public.admin_transition_organization(p_org_id uuid,p_action text,p_reason text)
returns text language plpgsql security definer set search_path='' as $$
declare v_from text; v_to text; v_event text; v_sub record;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 if p_action not in ('suspend','reactivate','close') then raise exception 'Invalid organization action'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
   raise exception 'A reason between 10 and 1000 characters is required'; end if;
 select status into v_from from public.organizations where id=p_org_id for update;
 if not found then raise exception 'Organization not found'; end if;
 if p_action='suspend' and v_from='active' then
   v_to:='suspended';v_event:='suspended';
   update public.organizations set status=v_to,status_reason=trim(p_reason),suspended_at=now(),
     suspended_by=auth.uid(),updated_at=now() where id=p_org_id;
   for v_sub in select id,status from public.subscriptions
     where org_id=p_org_id and status in ('active','past_due','grace_period') for update
   loop
     update public.subscriptions set status='suspended',suspended_at=now(),
       suspension_reason='Organization suspended: '||trim(p_reason),updated_at=now() where id=v_sub.id;
     insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason)
     values(v_sub.id,p_org_id,'suspended',v_sub.status,'suspended','Organization suspended: '||trim(p_reason));
   end loop;
 elsif p_action='reactivate' and v_from in ('suspended','recovery_pending','closed') then
   if v_from='closed' and (select recoverable_until<now() from public.organizations where id=p_org_id)
     then raise exception 'The recovery period has expired'; end if;
   v_to:='active';v_event:='reactivated';
   update public.organizations set status=v_to,status_reason=null,suspended_at=null,suspended_by=null,
     closed_at=null,recoverable_until=null,updated_at=now() where id=p_org_id;
   for v_sub in select id,status from public.subscriptions where org_id=p_org_id and status='suspended'
     and suspension_reason like 'Organization suspended:%' for update
   loop
     update public.subscriptions set status='active',suspended_at=null,suspension_reason=null,updated_at=now()
     where id=v_sub.id;
     insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason)
     values(v_sub.id,p_org_id,'resumed','suspended','active','Organization reactivated');
   end loop;
 elsif p_action='close' and v_from<>'closed' then
   v_to:='closed';v_event:='closed';
   update public.organizations set status=v_to,status_reason=trim(p_reason),closed_at=now(),
     recoverable_until=now()+interval '30 days',updated_at=now() where id=p_org_id;
 else raise exception 'Invalid organization transition: % from %',p_action,v_from;
 end if;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason)
 values(p_org_id,auth.uid(),v_event,v_from,v_to,trim(p_reason));
 insert into public.audit_logs(actor_id,org_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_org_id,'organization.'||v_event,'organization',p_org_id::text,
   jsonb_build_object('from_status',v_from,'to_status',v_to,'reason',trim(p_reason)));
 insert into public.notifications(user_id,org_id,category,title,body,channel,priority,workspace_target,action_label,metadata)
 select m.user_id,p_org_id,'organization_lifecycle','Organization '||replace(v_event,'_',' '),
   'Your organization is now '||replace(v_to,'_',' ')||'. '||trim(p_reason),'in_app','urgent',
   'team','Review account',jsonb_build_object('event_type',v_event)
 from public.organization_members m where m.org_id=p_org_id;
 return v_to;
end; $$;
revoke all on function public.admin_transition_organization(uuid,text,text) from public,anon;
grant execute on function public.admin_transition_organization(uuid,text,text) to authenticated;

create or replace function public.admin_decide_organization_recovery(p_request_id uuid,p_approve boolean,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_req public.organization_recovery_requests; v_from text; v_to text; v_event text; v_sub record;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_note,''))) not between 5 and 1000 then raise exception 'Decision note is required'; end if;
 select * into v_req from public.organization_recovery_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'Pending recovery request not found'; end if;
 select status into v_from from public.organizations where id=v_req.org_id for update;
 v_to:=case when p_approve then 'active' else 'suspended' end;
 v_event:=case when p_approve then 'recovery_approved' else 'recovery_rejected' end;
 update public.organization_recovery_requests set status=case when p_approve then 'approved' else 'rejected' end,
   decided_by=auth.uid(),decision_note=trim(p_note),decided_at=now() where id=p_request_id;
 perform set_config('app.organization_lifecycle_override','on',true);
 update public.organizations set status=v_to,status_reason=case when p_approve then null else trim(p_note) end,
   suspended_at=case when p_approve then null else coalesce(suspended_at,now()) end,
   suspended_by=case when p_approve then null else auth.uid() end,
   closed_at=null,recoverable_until=null,updated_at=now() where id=v_req.org_id;
 if p_approve then
   for v_sub in select id from public.subscriptions where org_id=v_req.org_id and status='suspended'
     and suspension_reason like 'Organization suspended:%' for update
   loop
     update public.subscriptions set status='active',suspended_at=null,suspension_reason=null,updated_at=now()
     where id=v_sub.id;
     insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason)
     values(v_sub.id,v_req.org_id,'resumed','suspended','active','Organization recovery approved');
   end loop;
 end if;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason,metadata)
 values(v_req.org_id,auth.uid(),v_event,v_from,v_to,trim(p_note),jsonb_build_object('request_id',p_request_id));
 return true;
end; $$;
revoke all on function public.admin_decide_organization_recovery(uuid,boolean,text) from public,anon;
grant execute on function public.admin_decide_organization_recovery(uuid,boolean,text) to authenticated;

create or replace function public.transfer_organization_ownership(p_org_id uuid,p_new_owner_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_previous uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select user_id into v_previous from public.organization_members
 where org_id=p_org_id and user_id=auth.uid() and role='owner' for update;
 if not found then raise exception 'Only the current owner can transfer ownership'; end if;
 if p_new_owner_id=auth.uid() then raise exception 'Choose another organization member'; end if;
 if not exists(select 1 from public.organization_members where org_id=p_org_id and user_id=p_new_owner_id)
   then raise exception 'New owner must already be an organization member'; end if;
 update public.organization_members set role='admin' where org_id=p_org_id and role='owner';
 update public.organization_members set role='owner' where org_id=p_org_id and user_id=p_new_owner_id;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,reason,metadata)
 values(p_org_id,auth.uid(),'ownership_transferred','Organization ownership transferred',
   jsonb_build_object('previous_owner_id',v_previous,'new_owner_id',p_new_owner_id));
 return true;
end; $$;
revoke all on function public.transfer_organization_ownership(uuid,uuid) from public,anon;
grant execute on function public.transfer_organization_ownership(uuid,uuid) to authenticated;

create or replace function public.admin_list_organizations(p_status text default null,p_search text default null,p_limit integer default 100)
returns table(id uuid,name text,type text,status text,status_reason text,member_count bigint,
 active_plan text,recovery_request_id uuid,recovery_reason text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 return query select o.id,o.name,o.type,o.status,o.status_reason,
   (select count(*) from public.organization_members m where m.org_id=o.id),
   (select p.name from public.subscriptions s join public.plans p on p.id=s.plan_id
     where s.org_id=o.id and s.status in ('trialing','active','past_due','grace_period','suspended')
     order by s.created_at desc limit 1),
   r.id,r.reason,o.created_at,o.updated_at
 from public.organizations o
 left join lateral(select rr.id,rr.reason from public.organization_recovery_requests rr
   where rr.org_id=o.id and rr.status='pending' order by rr.created_at desc limit 1) r on true
 where (p_status is null or o.status=p_status)
   and (nullif(trim(coalesce(p_search,'')),'') is null or o.name ilike '%'||trim(p_search)||'%')
 order by case o.status when 'recovery_pending' then 0 when 'suspended' then 1 when 'closed' then 2 else 3 end,o.updated_at desc
 limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_organizations(text,text,integer) from public,anon;
grant execute on function public.admin_list_organizations(text,text,integer) to authenticated;

commit;

-- ===== END 49_organization_lifecycle_and_recovery.sql =====

-- ===== START 50_incident_response_and_recovery.sql =====
-- Operational resilience: incident command, recovery objectives, and restore-exercise evidence.
begin;

create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('INC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  title text not null check (length(btrim(title)) between 5 and 180),
  summary text not null check (length(btrim(summary)) between 10 and 4000),
  affected_service text not null check (length(btrim(affected_service)) between 2 and 120),
  severity text not null check (severity in ('sev1', 'sev2', 'sev3', 'sev4')),
  status text not null default 'declared' check (status in ('declared', 'investigating', 'mitigated', 'monitoring', 'resolved', 'postmortem_complete')),
  incident_commander uuid references auth.users(id) on delete set null,
  customer_impact text,
  recovery_point_target_minutes integer not null default 1440 check (recovery_point_target_minutes between 0 and 10080),
  recovery_time_target_minutes integer not null default 240 check (recovery_time_target_minutes between 1 and 10080),
  declared_by uuid not null references auth.users(id) on delete restrict,
  declared_at timestamptz not null default now(),
  mitigated_at timestamptz,
  resolved_at timestamptz,
  postmortem_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.platform_incidents(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('declared', 'status_changed', 'commander_assigned', 'note_added')),
  from_status text,
  to_status text,
  note text not null check (length(btrim(note)) between 3 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.restore_exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_type text not null check (exercise_type in ('database', 'storage', 'cloudflare_configuration', 'dns', 'full_service')),
  environment text not null check (environment in ('staging', 'recovery_sandbox')),
  status text not null check (status in ('passed', 'passed_with_actions', 'failed')),
  backup_point_at timestamptz not null,
  started_at timestamptz not null,
  completed_at timestamptz not null check (completed_at >= started_at),
  achieved_rpo_minutes integer not null check (achieved_rpo_minutes >= 0),
  achieved_rto_minutes integer not null check (achieved_rto_minutes >= 0),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 500),
  findings text not null check (length(btrim(findings)) between 3 and 4000),
  performed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists platform_incidents_status_idx on public.platform_incidents(status, severity, declared_at desc);
create index if not exists platform_incident_events_incident_idx on public.platform_incident_events(incident_id, created_at desc);
create index if not exists restore_exercises_type_idx on public.restore_exercises(exercise_type, completed_at desc);

alter table public.platform_incidents enable row level security;
alter table public.platform_incident_events enable row level security;
alter table public.restore_exercises enable row level security;

revoke all on public.platform_incidents, public.platform_incident_events, public.restore_exercises from public, anon, authenticated;
grant select on public.platform_incidents, public.platform_incident_events, public.restore_exercises to authenticated;

drop policy if exists platform_incidents_admin_read on public.platform_incidents;
create policy platform_incidents_admin_read on public.platform_incidents
  for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists platform_incident_events_admin_read on public.platform_incident_events;
create policy platform_incident_events_admin_read on public.platform_incident_events
  for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists restore_exercises_admin_read on public.restore_exercises;
create policy restore_exercises_admin_read on public.restore_exercises
  for select to authenticated using ((select public.is_platform_admin()));

create or replace function private.validate_incident_transition(p_from text, p_to text)
returns boolean language sql immutable set search_path='' as $$
  select (p_from, p_to) in (
    ('declared', 'investigating'),
    ('declared', 'mitigated'),
    ('investigating', 'mitigated'),
    ('mitigated', 'monitoring'),
    ('monitoring', 'investigating'),
    ('monitoring', 'resolved'),
    ('resolved', 'postmortem_complete')
  );
$$;
revoke all on function private.validate_incident_transition(text, text) from public, anon, authenticated;

create or replace function public.admin_declare_incident(
  p_title text,
  p_summary text,
  p_affected_service text,
  p_severity text,
  p_customer_impact text default null,
  p_rpo_minutes integer default 1440,
  p_rto_minutes integer default 240
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  insert into public.platform_incidents(
    title, summary, affected_service, severity, customer_impact,
    recovery_point_target_minutes, recovery_time_target_minutes,
    declared_by, incident_commander, postmortem_due_at
  ) values (
    btrim(p_title), btrim(p_summary), btrim(p_affected_service), p_severity, nullif(btrim(p_customer_impact), ''),
    p_rpo_minutes, p_rto_minutes, auth.uid(), auth.uid(),
    case when p_severity in ('sev1', 'sev2') then now() + interval '5 days' else now() + interval '10 days' end
  ) returning id into v_id;
  insert into public.platform_incident_events(incident_id, actor_id, event_type, to_status, note)
  values(v_id, auth.uid(), 'declared', 'declared', 'Incident declared');
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'incident.declared', 'platform_incident', v_id::text, jsonb_build_object('severity', p_severity, 'service', btrim(p_affected_service)));
  return v_id;
end; $$;
revoke all on function public.admin_declare_incident(text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_declare_incident(text,text,text,text,text,integer,integer) to authenticated;

create or replace function public.admin_transition_incident(p_incident_id uuid, p_status text, p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_from text;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  if length(btrim(coalesce(p_note, ''))) not between 3 and 4000 then raise exception 'A transition note is required'; end if;
  select status into v_from from public.platform_incidents where id=p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  if not private.validate_incident_transition(v_from, p_status) then raise exception 'Invalid incident transition: % to %', v_from, p_status; end if;
  update public.platform_incidents set status=p_status, updated_at=now(),
    mitigated_at=case when p_status='mitigated' then now() else mitigated_at end,
    resolved_at=case when p_status='resolved' then now() else resolved_at end
  where id=p_incident_id;
  insert into public.platform_incident_events(incident_id, actor_id, event_type, from_status, to_status, note)
  values(p_incident_id, auth.uid(), 'status_changed', v_from, p_status, btrim(p_note));
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'incident.status_changed', 'platform_incident', p_incident_id::text, jsonb_build_object('from_status', v_from, 'to_status', p_status));
  return true;
end; $$;
revoke all on function public.admin_transition_incident(uuid,text,text) from public, anon;
grant execute on function public.admin_transition_incident(uuid,text,text) to authenticated;

create or replace function public.admin_record_restore_exercise(
  p_exercise_type text,
  p_environment text,
  p_status text,
  p_backup_point_at timestamptz,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_achieved_rpo_minutes integer,
  p_achieved_rto_minutes integer,
  p_evidence_reference text,
  p_findings text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  insert into public.restore_exercises(
    exercise_type, environment, status, backup_point_at, started_at, completed_at,
    achieved_rpo_minutes, achieved_rto_minutes, evidence_reference, findings, performed_by
  ) values (
    p_exercise_type, p_environment, p_status, p_backup_point_at, p_started_at, p_completed_at,
    p_achieved_rpo_minutes, p_achieved_rto_minutes, btrim(p_evidence_reference), btrim(p_findings), auth.uid()
  ) returning id into v_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'recovery.exercise_recorded', 'restore_exercise', v_id::text,
    jsonb_build_object('exercise_type', p_exercise_type, 'status', p_status, 'achieved_rpo_minutes', p_achieved_rpo_minutes, 'achieved_rto_minutes', p_achieved_rto_minutes));
  return v_id;
end; $$;
revoke all on function public.admin_record_restore_exercise(text,text,text,timestamptz,timestamptz,timestamptz,integer,integer,text,text) from public, anon;
grant execute on function public.admin_record_restore_exercise(text,text,text,timestamptz,timestamptz,timestamptz,integer,integer,text,text) to authenticated;

create or replace function public.admin_list_incidents(p_status text default null, p_limit integer default 100)
returns table(
  id uuid, reference text, title text, summary text, affected_service text, severity text, status text,
  customer_impact text, recovery_point_target_minutes integer, recovery_time_target_minutes integer,
  declared_at timestamptz, updated_at timestamptz, postmortem_due_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select i.id,i.reference,i.title,i.summary,i.affected_service,i.severity,i.status,i.customer_impact,
    i.recovery_point_target_minutes,i.recovery_time_target_minutes,i.declared_at,i.updated_at,i.postmortem_due_at
  from public.platform_incidents i
  where p_status is null or i.status=p_status
  order by case i.severity when 'sev1' then 0 when 'sev2' then 1 when 'sev3' then 2 else 3 end, i.declared_at desc
  limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_incidents(text,integer) from public, anon;
grant execute on function public.admin_list_incidents(text,integer) to authenticated;

create or replace function public.admin_list_restore_exercises(p_limit integer default 50)
returns table(
  id uuid, exercise_type text, environment text, status text, backup_point_at timestamptz,
  started_at timestamptz, completed_at timestamptz, achieved_rpo_minutes integer,
  achieved_rto_minutes integer, evidence_reference text, findings text
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select e.id,e.exercise_type,e.environment,e.status,e.backup_point_at,e.started_at,e.completed_at,
    e.achieved_rpo_minutes,e.achieved_rto_minutes,e.evidence_reference,e.findings
  from public.restore_exercises e order by e.completed_at desc limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_restore_exercises(integer) from public, anon;
grant execute on function public.admin_list_restore_exercises(integer) to authenticated;

commit;

-- ===== END 50_incident_response_and_recovery.sql =====

-- ===== START 51_lifecycle_and_quota_correctness.sql =====
-- Correctness fixes for the workflow state machines, quota enforcement,
-- organization recovery and lifecycle automation introduced in 42-49.
-- Apply after 50_incident_response_and_recovery.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Complete the workflow transition catalogue.
--
-- Migration 47 began enforcing a whitelist on tenders, campaigns, editorial
-- content and subscriptions. Three vocabularies were incomplete, so legitimate
-- transitions that the application and the automation already perform were
-- rejected at the trigger.
-- ---------------------------------------------------------------------------
insert into public.workflow_transition_rules(domain,from_status,to_status,requires_reason,to_is_terminal,description) values
-- Tenders: the seeded status vocabulary also contains approved, scheduled and
-- archived, which had no rules at all.
('tender','awaiting_review','approved',false,false,'Approve without publishing yet'),
('tender','approved','scheduled',false,false,'Schedule approved tender for publication'),
('tender','approved','published',false,false,'Publish approved tender'),
('tender','approved','needs_correction',true,false,'Request correction after approval'),
('tender','approved','cancelled',false,true,'Cancel approved tender'),
('tender','scheduled','published',false,false,'Publish scheduled tender'),
('tender','scheduled','cancelled',false,true,'Cancel scheduled tender'),
('tender','published','archived',false,true,'Archive published tender'),
('tender','closed','archived',false,true,'Archive closed tender'),
('tender','awarded','archived',false,true,'Archive awarded tender'),
('tender','cancelled','archived',false,true,'Archive cancelled tender'),
('tender','rejected','archived',false,true,'Archive rejected tender'),
-- Campaigns: returning an approved campaign for further work, and withdrawing
-- a submission, are ordinary operations the review queue needs.
('campaign','submitted','draft',false,false,'Withdraw campaign submission'),
('campaign','approved','draft',false,false,'Return approved campaign to draft'),
('campaign','approved','submitted',false,false,'Send approved campaign back for review'),
('campaign','approved','rejected',true,true,'Revoke campaign approval'),
-- Subscriptions: transition_subscription accepts 'cancel' from every state
-- except 'cancelled', and lifecycle automation reaches this pair whenever a
-- scheduled cancellation outlives the subscription's expiry.
('subscription','expired','cancelled',false,true,'Cancel an expired subscription')
on conflict(domain,from_status,to_status) do update set
 requires_reason=excluded.requires_reason,to_is_terminal=excluded.to_is_terminal,
 description=excluded.description,enabled=true;

-- ---------------------------------------------------------------------------
-- 2. Entitlements must follow the subscription lifecycle.
--
-- 42 introduced trialing/past_due/grace_period, but this helper still matched
-- only 'active' and therefore silently downgraded paying organizations to the
-- free plan. get_org_quota_snapshot already treats all four as current, so the
-- quota panel and the enforcement path disagreed.
-- ---------------------------------------------------------------------------
create or replace function public.get_org_feature_limit(
  p_org_id uuid,
  p_feature_key text
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  result integer;
begin
  if not public.is_org_member(p_org_id) and not public.is_platform_admin() then
    raise exception 'Organization access required';
  end if;

  -- A NULL limit_value on a matched row means "unlimited" and must be returned
  -- as-is; only a missing row falls through to the free plan.
  select pf.limit_value into result
  from public.subscriptions s
  join public.plan_features pf
    on pf.plan_id = s.plan_id and pf.feature_key = p_feature_key
  where s.org_id = p_org_id
    and s.status in ('trialing', 'active', 'past_due', 'grace_period')
  order by
    case s.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      else 3
    end,
    s.created_at desc
  limit 1;

  if found then
    return result;
  end if;

  select pf.limit_value into result
  from public.plans p
  join public.plan_features pf
    on pf.plan_id = p.id and pf.feature_key = p_feature_key
  where p.code = 'free';
  return result;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. An unlimited quota is not an unknown quota.
--
-- get_effective_org_quota returns NULL both for "this plan grants the feature
-- without a ceiling" and for "no such feature". consume_org_quota treated both
-- as an error, so every metered action failed on plans with unlimited features.
-- ---------------------------------------------------------------------------
create or replace function public.consume_org_quota(p_org_id uuid, p_meter_key text, p_amount integer default 1, p_idempotency_key text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer; v_value bigint; v_defined boolean;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if (select auth.uid()) is null or not (public.is_platform_admin() or public.is_org_member(p_org_id)) then raise exception 'Organization access is required'; end if;
  if p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid usage amount'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')), '') is null then raise exception 'An idempotency key is required'; end if;

  v_defined :=
    exists(select 1 from public.organization_quota_overrides qo
            where qo.org_id = p_org_id and qo.feature_key = p_meter_key
              and (qo.expires_at is null or qo.expires_at > now()))
    or exists(select 1 from public.plan_features pf where pf.feature_key = p_meter_key);
  if not v_defined then raise exception 'Unknown quota meter: %', p_meter_key; end if;

  -- NULL from here means the feature is granted without a ceiling.
  v_limit := public.get_effective_org_quota(p_org_id, p_meter_key);

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
  if v_limit is not null and v_value > v_limit then
    raise exception 'Quota exceeded for % (% of %)', p_meter_key, v_value, v_limit;
  end if;
  return v_value;
end; $$;
revoke all on function public.consume_org_quota(uuid,text,integer,text) from public, anon;
grant execute on function public.consume_org_quota(uuid,text,integer,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rejecting a recovery request must not resurrect a closed organization.
--
-- The reject path forced every organization to 'suspended' and cleared
-- closed_at/recoverable_until, which discarded the 30-day closure deadline and
-- let an owner re-request recovery indefinitely.
-- ---------------------------------------------------------------------------
alter table public.organization_recovery_requests
  add column if not exists previous_status text;

create or replace function public.request_organization_recovery(p_org_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.organization_members where org_id=p_org_id and user_id=auth.uid() and role='owner')
   then raise exception 'Organization owner access required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
   raise exception 'Recovery reason must be between 10 and 1000 characters'; end if;
 select status into v_status from public.organizations where id=p_org_id for update;
 if v_status not in ('suspended','closed') then raise exception 'Organization is not eligible for recovery'; end if;
 if v_status='closed' and (select recoverable_until<now() from public.organizations where id=p_org_id)
   then raise exception 'The recovery period has expired'; end if;
 insert into public.organization_recovery_requests(org_id,requested_by,reason,previous_status)
 values(p_org_id,auth.uid(),trim(p_reason),v_status) returning id into v_id;
 perform set_config('app.organization_lifecycle_override','on',true);
 update public.organizations set status='recovery_pending',updated_at=now() where id=p_org_id;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason,metadata)
 values(p_org_id,auth.uid(),'recovery_requested',v_status,'recovery_pending',trim(p_reason),jsonb_build_object('request_id',v_id));
 return v_id;
end; $$;
revoke all on function public.request_organization_recovery(uuid,text) from public,anon;
grant execute on function public.request_organization_recovery(uuid,text) to authenticated;

create or replace function public.admin_decide_organization_recovery(p_request_id uuid,p_approve boolean,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_req public.organization_recovery_requests; v_from text; v_to text; v_event text; v_sub record;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_note,''))) not between 5 and 1000 then raise exception 'Decision note is required'; end if;
 select * into v_req from public.organization_recovery_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'Pending recovery request not found'; end if;
 select status into v_from from public.organizations where id=v_req.org_id for update;
 -- A rejected request returns the organization to the state it was in before
 -- the request, preserving an existing closure and its recovery deadline.
 v_to:=case when p_approve then 'active' else coalesce(v_req.previous_status,'suspended') end;
 v_event:=case when p_approve then 'recovery_approved' else 'recovery_rejected' end;
 update public.organization_recovery_requests set status=case when p_approve then 'approved' else 'rejected' end,
   decided_by=auth.uid(),decision_note=trim(p_note),decided_at=now() where id=p_request_id;
 perform set_config('app.organization_lifecycle_override','on',true);
 if p_approve then
   update public.organizations set status=v_to,status_reason=null,suspended_at=null,suspended_by=null,
     closed_at=null,recoverable_until=null,updated_at=now() where id=v_req.org_id;
 else
   update public.organizations set status=v_to,status_reason=trim(p_note),
     suspended_at=case when v_to='suspended' then coalesce(suspended_at,now()) else suspended_at end,
     suspended_by=case when v_to='suspended' then coalesce(suspended_by,auth.uid()) else suspended_by end,
     updated_at=now() where id=v_req.org_id;
 end if;
 if p_approve then
   for v_sub in select id from public.subscriptions where org_id=v_req.org_id and status='suspended'
     and suspension_reason like 'Organization suspended:%' for update
   loop
     update public.subscriptions set status='active',suspended_at=null,suspension_reason=null,updated_at=now()
     where id=v_sub.id;
     insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason)
     values(v_sub.id,v_req.org_id,'resumed','suspended','active','Organization recovery approved');
   end loop;
 end if;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason,metadata)
 values(v_req.org_id,auth.uid(),v_event,v_from,v_to,trim(p_note),jsonb_build_object('request_id',p_request_id));
 return true;
end; $$;
revoke all on function public.admin_decide_organization_recovery(uuid,boolean,text) from public,anon;
grant execute on function public.admin_decide_organization_recovery(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Only payable invoices accept payments.
-- ---------------------------------------------------------------------------
create or replace function public.record_commercial_payment(p_invoice_id uuid,p_reference text,p_method text,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$ declare v_i public.commercial_invoices; v_payment uuid; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 select * into v_i from public.commercial_invoices where id=p_invoice_id for update; if not found then raise exception 'Invoice not found'; end if;
 if v_i.status not in ('issued','partially_paid','overdue') then
   raise exception 'Invoice % cannot accept payments while it is %', v_i.invoice_number, v_i.status; end if;
 if p_amount<=0 or v_i.amount_paid+p_amount>v_i.total_amount then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.commercial_payments(org_id,payment_reference,method,currency_code,amount,verified_by) values(v_i.org_id,trim(p_reference),p_method,v_i.currency_code,p_amount,auth.uid()) returning id into v_payment;
 insert into public.commercial_payment_allocations values(v_payment,v_i.id,p_amount,now());
 update public.commercial_invoices set amount_paid=amount_paid+p_amount,status=case when amount_paid+p_amount=total_amount then 'paid' else 'partially_paid' end where id=v_i.id;
 insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,actor_id) values(v_i.org_id,'payment','credit',p_amount,v_i.currency_code,'commercial_payment',v_payment,'Payment '||trim(p_reference),auth.uid());
 return v_payment; end; $$;
revoke all on function public.record_commercial_payment(uuid,text,text,numeric) from public,anon;
grant execute on function public.record_commercial_payment(uuid,text,text,numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notification self-service is limited to read/archive.
--
-- 41 granted a direct column UPDATE so the RPCs could run as invoker. The
-- policy allowed any status value, including resurrecting a row as 'pending'.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status in ('read','archived'));

-- ---------------------------------------------------------------------------
-- 7. Lifecycle automation must survive a single bad row.
--
-- Every workload shared one savepoint, so one rejected transition rolled back
-- the deadline reminders, tender closures, campaign scheduling and every
-- subscription change in the same hourly run — permanently, because the same
-- row was retried on the next run.
-- ---------------------------------------------------------------------------
alter table public.lifecycle_automation_runs drop constraint if exists lifecycle_automation_runs_status_check;
alter table public.lifecycle_automation_runs add constraint lifecycle_automation_runs_status_check
  check(status in ('running','completed','completed_with_errors','failed'));

create or replace function private.run_lifecycle_automation()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_run_id uuid; v_tenders integer:=0; v_reminders integer:=0;
 v_activated integer:=0; v_completed integer:=0; v_subscriptions integer:=0;
 v_row record; v_user record; v_event text; v_from text; v_to text; v_reason text;
 v_errors text[]:=array[]::text[];
begin
 -- The run row is inserted outside the catch-all block so that its own
 -- savepoint cannot roll the record away before the handler updates it.
 insert into public.lifecycle_automation_runs default values returning id into v_run_id;
 begin

 -- Notify saved-tender watchers at seven, three and one day, with a unique key
 -- per deadline version so a later deadline extension can notify again.
 begin
   for v_row in
     select o.id,o.slug,o.title,o.buyer_org_id,o.submission_deadline,
       (o.submission_deadline::date-current_date)::integer days_left
     from public.opportunities o join public.opportunity_statuses s on s.id=o.status_id
     where s.code in ('published','amended','deadline_extended')
       and o.submission_deadline::date-current_date in (7,3,1)
   loop
     for v_user in
       select distinct recipients.user_id from (
         select so.user_id from public.saved_opportunities so where so.opportunity_id=v_row.id
         union
         select om.user_id from public.organization_members om
         where om.org_id=v_row.buyer_org_id and om.role in ('owner','admin')
       ) recipients
     loop
       if private.create_lifecycle_notification(
         v_user.user_id,v_row.buyer_org_id,'deadline_reminder',
         case when v_row.days_left=1 then 'Tender deadline tomorrow: ' else 'Tender deadline approaching: ' end||v_row.title,
         'Submission closes on '||to_char(v_row.submission_deadline,'DD Mon YYYY HH24:MI')||'.',
         'tenders','View tender',
         'tender:'||v_row.id::text||':deadline:'||v_row.submission_deadline::text||':'||v_row.days_left::text,
         jsonb_build_object('opportunity_id',v_row.id,'days_left',v_row.days_left)
       ) then v_reminders:=v_reminders+1; end if;
     end loop;
   end loop;
 exception when others then
   v_errors:=v_errors||('tender_reminders: '||left(sqlerrm,300));
 end;

 -- Closing through a normal status update invokes migration 47's state machine,
 -- immutable transition history, audit entry and outbox event.
 begin
   update public.opportunities o set status_id=s_closed.id
   from public.opportunity_statuses s_current,public.opportunity_statuses s_closed
   where o.status_id=s_current.id and s_closed.code='closed'
     and s_current.code in ('published','amended','deadline_extended')
     and o.submission_deadline<now();
   get diagnostics v_tenders=row_count;
 exception when others then
   v_tenders:=0;
   v_errors:=v_errors||('tender_close: '||left(sqlerrm,300));
 end;

 -- Reuse the existing proven campaign scheduler. Its updates are now also
 -- validated and recorded by the central campaign state machine.
 begin
   select activated,completed into v_activated,v_completed
   from private.run_ad_campaign_schedule();
 exception when others then
   v_activated:=0; v_completed:=0;
   v_errors:=v_errors||('campaign_schedule: '||left(sqlerrm,300));
 end;

 -- Subscription reminders go to organization owners/admins and are deduplicated
 -- by subscription, milestone and current period/trial date.
 begin
   for v_row in
     select s.id,s.org_id,s.status,s.trial_ends_at,s.current_period_end,s.grace_ends_at
     from public.subscriptions s
     where (s.status='trialing' and s.trial_ends_at-current_date in (7,3,1))
        or (s.status='active' and s.current_period_end-current_date in (7,3,1))
        or (s.status='grace_period' and s.grace_ends_at-current_date in (3,1))
   loop
     for v_user in select user_id from public.organization_members
       where org_id=v_row.org_id and role in ('owner','admin')
     loop
       if private.create_lifecycle_notification(
         v_user.user_id,v_row.org_id,'subscriptions',
         case v_row.status when 'trialing' then 'Trial ending soon'
           when 'grace_period' then 'Subscription suspension approaching'
           else 'Subscription renewal approaching' end,
         case v_row.status when 'trialing' then 'Your trial ends on '||to_char(v_row.trial_ends_at,'DD Mon YYYY')||'.'
           when 'grace_period' then 'Your grace period ends on '||to_char(v_row.grace_ends_at,'DD Mon YYYY')||'.'
           else 'Your current subscription period ends on '||to_char(v_row.current_period_end,'DD Mon YYYY')||'.' end,
         'billing','Review subscription',
         'subscription:'||v_row.id::text||':'||v_row.status||':'||
           coalesce(v_row.trial_ends_at,v_row.grace_ends_at,v_row.current_period_end)::text,
         jsonb_build_object('subscription_id',v_row.id,'milestone',v_row.status)
       ) then v_reminders:=v_reminders+1; end if;
     end loop;
   end loop;
 exception when others then
   v_errors:=v_errors||('subscription_reminders: '||left(sqlerrm,300));
 end;

 -- Apply automated subscription transitions in deterministic order. Each row is
 -- isolated so an unexpected rejection cannot discard the rest of the batch.
 -- The scheduled-cancellation branch covers every state the state machine can
 -- still leave for 'cancelled', which includes 'expired' and 'suspended' — both
 -- retain cancel_at_period_end, so excluding them would strand the flag forever.
 for v_row in
   select * from public.subscriptions
   where (cancel_at_period_end and current_period_end<current_date
           and status <> 'cancelled')
      or (status='trialing' and trial_ends_at<current_date)
      or (status='active' and current_period_end<current_date)
      or (status='grace_period' and grace_ends_at<current_date)
   order by created_at
 loop
   begin
     v_from:=v_row.status; v_reason:=null;
     if v_row.cancel_at_period_end and v_row.current_period_end<current_date then
       v_to:='cancelled'; v_event:='cancelled'; v_reason:='Scheduled cancellation reached its effective date';
       update public.subscriptions set status=v_to,cancel_at_period_end=false,cancelled_at=now(),
         notes=coalesce(notes,v_reason),updated_at=now() where id=v_row.id;
     elsif v_row.status='trialing' and v_row.trial_ends_at<current_date then
       v_to:='expired'; v_event:='expired'; v_reason:='Trial period ended';
       update public.subscriptions set status=v_to,updated_at=now() where id=v_row.id;
     elsif v_row.status='active' and v_row.current_period_end<current_date then
       v_to:='past_due'; v_event:='past_due'; v_reason:='Subscription period ended without renewal';
       update public.subscriptions set status=v_to,grace_ends_at=current_date+7,updated_at=now() where id=v_row.id;
     else
       v_to:='suspended'; v_event:='suspended'; v_reason:='Automatic suspension after grace period';
       update public.subscriptions set status=v_to,suspended_at=now(),suspension_reason=v_reason,updated_at=now()
       where id=v_row.id;
     end if;
     insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason,metadata)
     values(v_row.id,v_row.org_id,v_event,v_from,v_to,v_reason,jsonb_build_object('source','lifecycle_automation','run_id',v_run_id));
     v_subscriptions:=v_subscriptions+1;
   exception when others then
     v_errors:=v_errors||('subscription:'||v_row.id::text||': '||left(sqlerrm,300));
   end;
 end loop;

 update public.lifecycle_automation_runs
 set status=case when cardinality(v_errors)>0 then 'completed_with_errors' else 'completed' end,
   tenders_closed=v_tenders,reminders_created=v_reminders,
   campaigns_activated=coalesce(v_activated,0),campaigns_completed=coalesce(v_completed,0),
   subscriptions_changed=v_subscriptions,
   error_message=case when cardinality(v_errors)>0 then left(array_to_string(v_errors,E'\n'),2000) else null end,
   completed_at=now()
 where id=v_run_id;

 return jsonb_build_object('run_id',v_run_id,'tenders_closed',v_tenders,'reminders_created',v_reminders,
   'campaigns_activated',coalesce(v_activated,0),'campaigns_completed',coalesce(v_completed,0),
   'subscriptions_changed',v_subscriptions,'errors',to_jsonb(v_errors));
exception when others then
 update public.lifecycle_automation_runs set status='failed',error_message=left(sqlerrm,2000),completed_at=now()
 where id=v_run_id;
 return jsonb_build_object('run_id',v_run_id,'status','failed','error',sqlerrm);
 end;
end; $$;
revoke all on function private.run_lifecycle_automation() from public,anon,authenticated;
grant execute on function private.run_lifecycle_automation() to service_role;

commit;

-- ===== END 51_lifecycle_and_quota_correctness.sql =====

-- ===== START 52_private_schema_privilege_defaults.sql =====
-- Manohub: close a latent privilege hole in the `private` schema.
--
-- Background: 06_advert_measurement_foundation.sql grants `anon` and
-- `authenticated` USAGE on the `private` schema, because the public analytics
-- entry point (public.track_advert_event) is a SECURITY INVOKER shim that calls
-- private.track_advert_event_internal.
--
-- The risk: PostgreSQL grants EXECUTE to PUBLIC on *newly created* functions by
-- default. Combined with anon holding USAGE on the schema, any function added
-- to `private` in future becomes callable by anonymous visitors unless whoever
-- wrote it remembered an explicit REVOKE. That makes the safe outcome depend on
-- human memory. This migration inverts the default so it does not.
--
-- Migrations 30/35 revoke EXECUTE from individual `private` functions one at a
-- time. That works, but it is the pattern this migration exists to make
-- unnecessary: it only holds for as long as every future author remembers.
-- This sets the default so forgetting is safe.
--
-- Idempotent. Safe to run more than once.

begin;

-- 1. Future functions created in `private` are NOT executable by PUBLIC.
--    ALTER DEFAULT PRIVILEGES applies to objects created by the current role,
--    which is the role that runs migrations (postgres).
alter default privileges in schema private revoke execute on functions from public;

-- 2. Same for anything already present. The intended entry point keeps working:
--    it holds explicit grants to anon/authenticated, and revoking the PUBLIC
--    pseudo-role grant does not touch those.
revoke execute on all functions in schema private from public;

-- 3. Do not let PUBLIC create new objects in `private` either.
revoke create on schema private from public;

commit;

-- Verification — the analytics path must still work for anonymous visitors,
-- and nothing in `private` should be PUBLIC-executable:
--
--   select p.proname,
--          coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false) as anon_can_execute
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'private'
--   order by p.proname;
--
-- Expected: only track_advert_event_internal returns true.

-- ===== END 52_private_schema_privilege_defaults.sql =====

-- ===== START 53_advert_order_ledger_integration.sql =====
-- Manohub: join advert sales to the financial ledger.
--
-- THE GAP THIS CLOSES
-- 14_advert_packages_and_payments.sql created self-serve advert purchasing
-- (advert_orders). 45/51 created the financial ledger (commercial_invoices,
-- commercial_payments, commercial_payment_allocations,
-- commercial_ledger_entries). Nothing connected them:
--
--   * no trigger or function referenced advert_orders outside migrations 14/15;
--   * nothing anywhere ran `insert into public.commercial_invoices`, so the
--     ledger had no inflow at all;
--   * orders were marked paid by a raw client-side UPDATE
--     (procurementApi.confirmAdvertOrder), which posted nothing, wrote no audit
--     trail, and generated the receipt number in the browser.
--
-- Result: every advert sale was invisible to the ledger, so revenue reporting
-- under-reported by the entire self-serve advertising business.
--
-- commercial_invoices was already designed to receive these rows — it has
-- source_type 'advertising' and a source_id column. This migration supplies the
-- missing link as a single atomic, admin-only, idempotent RPC.
--
-- Idempotent. Safe to run more than once.

begin;

-- Find an advert order's invoice quickly, and stop the same order being
-- invoiced twice even if two admins confirm concurrently.
create unique index if not exists commercial_invoices_advertising_source_uidx
  on public.commercial_invoices (source_id)
  where source_type = 'advertising' and source_id is not null;

create or replace function public.confirm_advert_order(
  p_order_id uuid,
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order       public.advert_orders;
  v_reference   text;
  v_receipt     text;
  v_invoice_id  uuid;
  v_payment_id  uuid;
  v_method      text;
begin
  -- Only platform administrators verify money in. Enforced in the function so
  -- the EXECUTE grant can stay broad, matching record_commercial_payment.
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;

  -- Lock the order so two concurrent confirmations cannot both post.
  select * into v_order
  from public.advert_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Advert order not found';
  end if;

  if v_order.status = 'paid' then
    raise exception 'Order % has already been confirmed', v_order.order_number;
  end if;

  if v_order.status not in ('pending_payment', 'payment_review') then
    raise exception 'Order % cannot be confirmed while it is %',
      v_order.order_number, v_order.status;
  end if;

  -- A paid order must carry a payment reference. Accept one supplied at
  -- confirmation time, otherwise require the buyer to have already provided it.
  v_reference := coalesce(nullif(trim(p_payment_reference), ''), v_order.payment_reference);
  if v_order.total_amount > 0 and v_reference is null then
    raise exception 'A payment reference is required to confirm order %', v_order.order_number;
  end if;

  -- commercial_invoices.currency_code is a foreign key to currencies;
  -- advert_orders.currency_code is not. Fail with something readable rather
  -- than a raw constraint violation.
  if not exists (select 1 from public.currencies where code = v_order.currency_code) then
    raise exception 'Order % uses currency %, which is not registered in public.currencies',
      v_order.order_number, v_order.currency_code;
  end if;

  -- The two tables use different payment-method vocabularies, and they do not
  -- overlap: advert_orders allows orange_money/afrimoney/mobile_money/card/
  -- agency_credit, while commercial_payments.method only allows bank_transfer/
  -- mobile_money/card/cash/credit. Passing the order's value straight through
  -- would violate the check constraint for three of the five methods.
  v_method := case v_order.payment_method
    when 'orange_money'  then 'mobile_money'
    when 'afrimoney'     then 'mobile_money'
    when 'mobile_money'  then 'mobile_money'
    when 'card'          then 'card'
    when 'agency_credit' then 'credit'
  end;
  if v_method is null then
    raise exception 'Payment method % on order % has no ledger equivalent',
      v_order.payment_method, v_order.order_number;
  end if;

  -- commercial_payments enforces unique(org_id, payment_reference). Fail with a
  -- readable message rather than a raw unique violation.
  if v_order.total_amount > 0 and exists (
    select 1 from public.commercial_payments
    where org_id = v_order.org_id and payment_reference = v_reference
  ) then
    raise exception 'Payment reference % has already been recorded for this organisation', v_reference;
  end if;

  -- Server-issued receipt number. Previously generated in the browser, which
  -- made a financial identifier client-controlled.
  v_receipt := 'RCT-' || to_char(now(), 'YYYY') || '-' ||
               upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  update public.advert_orders
  set status          = 'paid',
      payment_reference = v_reference,
      receipt_number  = v_receipt,
      paid_at         = now(),
      verified_by     = auth.uid(),
      updated_at      = now()
  where id = v_order.id;

  -- 1. Issue the invoice. total_amount on commercial_invoices is generated from
  --    subtotal + tax_amount, so only subtotal is supplied. The order's own
  --    invoice_number is reused so the two systems share one human reference.
  insert into public.commercial_invoices (
    org_id, invoice_number, source_type, source_id, currency_code,
    status, subtotal, tax_amount, issued_at, created_by
  ) values (
    v_order.org_id, v_order.invoice_number, 'advertising', v_order.id,
    v_order.currency_code, 'issued', v_order.total_amount, 0, now(), auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.commercial_invoice_lines (
    invoice_id, description, quantity, unit_amount
  )
  select
    v_invoice_id,
    coalesce(p.name, 'Advertising package') || ' (' || v_order.billing_period || ')',
    v_order.quantity,
    case when v_order.quantity > 0
      then round(v_order.total_amount / v_order.quantity, 2)
      else v_order.total_amount
    end
  from public.advert_packages p
  where p.id = v_order.package_id;

  insert into public.commercial_ledger_entries (
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id, metadata
  ) values (
    v_order.org_id, 'invoice', 'debit', v_order.total_amount, v_order.currency_code,
    'commercial_invoice', v_invoice_id,
    'Advertising invoice ' || v_order.invoice_number, auth.uid(),
    jsonb_build_object('advert_order_id', v_order.id, 'order_number', v_order.order_number)
  );

  -- 2. Settle it. A zero-value order (fully discounted or a comped package) is
  --    invoiced and marked paid without a payment row.
  if v_order.total_amount > 0 then
    insert into public.commercial_payments (
      org_id, payment_reference, method, currency_code, amount, verified_by
    ) values (
      v_order.org_id, v_reference, v_method,
      v_order.currency_code, v_order.total_amount, auth.uid()
    )
    returning id into v_payment_id;

    insert into public.commercial_payment_allocations (
      payment_id, invoice_id, amount, created_at
    ) values (
      v_payment_id, v_invoice_id, v_order.total_amount, now()
    );

    insert into public.commercial_ledger_entries (
      org_id, entry_type, direction, amount, currency_code,
      reference_type, reference_id, description, actor_id, metadata
    ) values (
      v_order.org_id, 'payment', 'credit', v_order.total_amount, v_order.currency_code,
      'commercial_payment', v_payment_id,
      'Advertising payment ' || v_reference, auth.uid(),
      jsonb_build_object('advert_order_id', v_order.id, 'receipt_number', v_receipt)
    );
  end if;

  update public.commercial_invoices
  set amount_paid = v_order.total_amount,
      status      = 'paid'
  where id = v_invoice_id;

  return v_invoice_id;
end;
$function$;

revoke all on function public.confirm_advert_order(uuid, text) from public, anon;
grant execute on function public.confirm_advert_order(uuid, text) to authenticated;

-- Confirmation now happens only through the RPC above. Organisations keep the
-- narrow UPDATE that lets a buyer move their own order from 'pending_payment'
-- to 'payment_review' after paying (policy advert_orders_org_update_reference
-- from migration 14); that is unchanged.
--
-- Backfill note: any order already sitting in 'paid' before this migration has
-- no invoice and no ledger entries. Those cannot be reconstructed
-- automatically, because the receipt number, verifier and payment timestamp
-- were written client-side. Reconcile them manually:
--
--   select o.order_number, o.invoice_number, o.total_amount, o.currency_code,
--          o.paid_at, o.payment_reference
--   from public.advert_orders o
--   left join public.commercial_invoices i
--     on i.source_type = 'advertising' and i.source_id = o.id
--   where o.status = 'paid' and i.id is null
--   order by o.paid_at;

commit;

-- Verification:
--
--   -- every paid order should have exactly one invoice
--   select count(*) as paid_orders_without_invoice
--   from public.advert_orders o
--   left join public.commercial_invoices i
--     on i.source_type = 'advertising' and i.source_id = o.id
--   where o.status = 'paid' and i.id is null;
--
--   -- ledger should balance against invoiced advertising revenue
--   select
--     (select coalesce(sum(total_amount), 0) from public.commercial_invoices
--        where source_type = 'advertising')                        as invoiced,
--     (select coalesce(sum(amount), 0) from public.commercial_ledger_entries
--        where entry_type = 'invoice'
--          and reference_type = 'commercial_invoice')              as ledger_debits;

-- ===== END 53_advert_order_ledger_integration.sql =====

-- ===== START 54_opportunity_ingestion_workspace.sql =====
-- Opportunity inventory engine: source registry, researcher queue and safe
-- promotion into the existing administrator tender-review workflow.
-- Apply after 53_advert_order_ledger_integration.sql.

begin;

create or replace function public.is_opportunity_researcher()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and platform_role in ('researcher', 'admin')
  );
$$;
revoke all on function public.is_opportunity_researcher() from public, anon;
grant execute on function public.is_opportunity_researcher() to authenticated;

create table if not exists public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text,
  source_kind text not null default 'website'
    check (source_kind in ('website', 'document', 'email', 'manual')),
  country_id uuid references public.countries(id) on delete set null,
  trust_level text not null default 'unverified'
    check (trust_level in ('verified', 'trusted', 'unverified')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'retired')),
  check_frequency_hours integer not null default 24
    check (check_frequency_hours between 1 and 720),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists opportunity_sources_name_unique_idx
  on public.opportunity_sources (lower(name));
create index if not exists opportunity_sources_status_next_check_idx
  on public.opportunity_sources (status, next_check_at)
  where status = 'active';

create table if not exists public.opportunity_ingestion_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.opportunity_sources(id) on delete set null,
  source_url text,
  external_reference text,
  title text not null default '',
  buyer_name text not null default '',
  summary text,
  description text,
  publication_date date,
  submission_deadline timestamptz,
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  currency_code text references public.currencies(code),
  sector_id uuid references public.sectors(id),
  country_id uuid references public.countries(id),
  district_id uuid references public.districts(id),
  opportunity_type_id uuid references public.opportunity_types(id),
  contact_details text,
  raw_text text,
  status text not null default 'draft'
    check (status in ('draft', 'ready_for_review', 'promoted', 'rejected')),
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  quality_issues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(quality_issues) = 'array'),
  duplicate_opportunity_id uuid references public.opportunities(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  opportunity_id uuid unique references public.opportunities(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunity_ingestion_status_created_idx
  on public.opportunity_ingestion_items (status, created_at desc);
create index if not exists opportunity_ingestion_assigned_status_idx
  on public.opportunity_ingestion_items (assigned_to, status, updated_at desc)
  where assigned_to is not null;
create index if not exists opportunity_ingestion_source_idx
  on public.opportunity_ingestion_items (source_id, created_at desc)
  where source_id is not null;

create or replace function public.refresh_opportunity_ingestion_quality()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  issues jsonb := '[]'::jsonb;
  score integer := 100;
  normalized_title text;
begin
  new.title := btrim(coalesce(new.title, ''));
  new.buyer_name := btrim(coalesce(new.buyer_name, ''));
  new.source_url := nullif(btrim(coalesce(new.source_url, '')), '');
  new.updated_at := now();

  if new.title = '' then
    issues := issues || '"Title is required"'::jsonb;
    score := score - 30;
  end if;
  if new.buyer_name = '' then
    issues := issues || '"Buyer name is required"'::jsonb;
    score := score - 20;
  end if;
  if new.submission_deadline is null then
    issues := issues || '"Submission deadline is required"'::jsonb;
    score := score - 25;
  elsif new.submission_deadline <= now() then
    issues := issues || '"Submission deadline has passed"'::jsonb;
    score := score - 25;
  end if;
  if new.source_url is null and new.source_id is null then
    issues := issues || '"A source record or source URL is required"'::jsonb;
    score := score - 15;
  end if;
  if nullif(btrim(coalesce(new.summary, '')), '') is null
     and nullif(btrim(coalesce(new.description, '')), '') is null then
    issues := issues || '"Add a summary or description"'::jsonb;
    score := score - 10;
  end if;

  normalized_title := lower(regexp_replace(new.title, '[^a-z0-9]+', '', 'g'));
  if normalized_title <> '' then
    select o.id
      into new.duplicate_opportunity_id
    from public.opportunities o
    where lower(regexp_replace(o.title, '[^a-z0-9]+', '', 'g')) = normalized_title
    order by o.created_at desc
    limit 1;
  else
    new.duplicate_opportunity_id := null;
  end if;

  if new.duplicate_opportunity_id is not null then
    issues := issues || '"An opportunity with the same normalized title already exists"'::jsonb;
  end if;

  new.quality_score := greatest(0, score);
  new.quality_issues := issues;

  if new.status = 'ready_for_review'
     and (new.quality_score < 75 or new.duplicate_opportunity_id is not null) then
    raise exception 'Resolve quality and duplicate checks before submitting for review';
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_ingestion_quality_refresh on public.opportunity_ingestion_items;
create trigger opportunity_ingestion_quality_refresh
before insert or update on public.opportunity_ingestion_items
for each row execute function public.refresh_opportunity_ingestion_quality();

create or replace function public.protect_opportunity_ingestion_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not (select public.is_opportunity_researcher()) then
    raise exception 'Researcher access required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.opportunity_id := null;
    if new.status not in ('draft', 'ready_for_review') then new.status := 'draft'; end if;
    return new;
  end if;

  if not (select public.is_platform_admin()) then
    new.created_by := old.created_by;
    if old.status in ('promoted', 'rejected') then
      raise exception 'Completed ingestion records are immutable';
    end if;
    if new.status = 'promoted'
       and old.status = 'ready_for_review'
       and new.opportunity_id is not null
       and exists (
         select 1 from public.opportunities
         where id = new.opportunity_id and created_by = (select auth.uid())
       ) then
      return new;
    end if;
    new.opportunity_id := old.opportunity_id;
    if new.status not in ('draft', 'ready_for_review') then new.status := old.status; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_ingestion_field_protection on public.opportunity_ingestion_items;
create trigger opportunity_ingestion_field_protection
before insert or update on public.opportunity_ingestion_items
for each row execute function public.protect_opportunity_ingestion_fields();

alter table public.opportunity_sources enable row level security;
alter table public.opportunity_ingestion_items enable row level security;

revoke all on public.opportunity_sources, public.opportunity_ingestion_items from anon;
grant select, insert, update on public.opportunity_sources, public.opportunity_ingestion_items to authenticated;
grant delete on public.opportunity_sources, public.opportunity_ingestion_items to authenticated;

create policy opportunity_sources_staff_read
on public.opportunity_sources for select to authenticated
using ((select public.is_opportunity_researcher()));
create policy opportunity_sources_staff_insert
on public.opportunity_sources for insert to authenticated
with check ((select public.is_opportunity_researcher()) and created_by = (select auth.uid()));
create policy opportunity_sources_staff_update
on public.opportunity_sources for update to authenticated
using ((select public.is_opportunity_researcher()))
with check ((select public.is_opportunity_researcher()));
create policy opportunity_sources_admin_delete
on public.opportunity_sources for delete to authenticated
using ((select public.is_platform_admin()));

create policy opportunity_ingestion_staff_read
on public.opportunity_ingestion_items for select to authenticated
using ((select public.is_opportunity_researcher()));
create policy opportunity_ingestion_staff_insert
on public.opportunity_ingestion_items for insert to authenticated
with check ((select public.is_opportunity_researcher()) and created_by = (select auth.uid()));
create policy opportunity_ingestion_staff_update
on public.opportunity_ingestion_items for update to authenticated
using ((select public.is_opportunity_researcher()))
with check ((select public.is_opportunity_researcher()));
create policy opportunity_ingestion_admin_delete
on public.opportunity_ingestion_items for delete to authenticated
using ((select public.is_platform_admin()));

create or replace function public.promote_opportunity_ingestion_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item public.opportunity_ingestion_items%rowtype;
  source public.opportunity_sources%rowtype;
  awaiting_review_id uuid;
  new_opportunity_id uuid;
  source_type_value text;
begin
  if (select auth.uid()) is null or not (select public.is_opportunity_researcher()) then
    raise exception 'Researcher access required';
  end if;

  select * into item
  from public.opportunity_ingestion_items
  where id = p_item_id
  for update;
  if not found then raise exception 'Ingestion record not found'; end if;
  if item.status <> 'ready_for_review' then
    raise exception 'Record must be ready for review';
  end if;
  if item.quality_score < 75 or item.duplicate_opportunity_id is not null then
    raise exception 'Record has unresolved quality or duplicate issues';
  end if;

  if item.source_id is not null then
    select * into source from public.opportunity_sources where id = item.source_id;
  end if;
  source_type_value := case source.source_kind
    when 'website' then 'website_ingestion'
    when 'document' then 'document_extraction'
    else 'admin_entry'
  end;
  select id into awaiting_review_id
  from public.opportunity_statuses where code = 'awaiting_review';

  insert into public.opportunities (
    slug, title, summary, description, opportunity_type_id, sector_id,
    country_id, district_id, buyer_name, publication_date,
    submission_deadline, estimated_value, currency_code, contact_details,
    source_name, source_url, source_type, status_id, data_confidence, created_by
  )
  values (
    regexp_replace(lower(item.title), '[^a-z0-9]+', '-', 'g')
      || '-' || substr(item.id::text, 1, 8),
    item.title, item.summary, item.description, item.opportunity_type_id,
    item.sector_id, item.country_id, item.district_id, item.buyer_name,
    item.publication_date, item.submission_deadline, item.estimated_value,
    item.currency_code, item.contact_details, source.name, item.source_url,
    source_type_value, awaiting_review_id,
    case source.trust_level when 'verified' then 'high' when 'trusted' then 'medium' else 'low' end,
    (select auth.uid())
  )
  returning id into new_opportunity_id;

  update public.opportunity_ingestion_items
  set status = 'promoted', opportunity_id = new_opportunity_id, updated_at = now()
  where id = p_item_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    (select auth.uid()),
    'opportunity_ingestion.promoted',
    'opportunity_ingestion_item',
    p_item_id::text,
    jsonb_build_object('opportunity_id', new_opportunity_id, 'quality_score', item.quality_score)
  );
  return new_opportunity_id;
end;
$$;
revoke all on function public.promote_opportunity_ingestion_item(uuid) from public, anon;
grant execute on function public.promote_opportunity_ingestion_item(uuid) to authenticated;

commit;

-- ===== END 54_opportunity_ingestion_workspace.sql =====

-- ===== START 55_opportunity_ingestion_index_hardening.sql =====
-- Cover opportunity-ingestion foreign keys used by joins, review filters and deletes.
-- Kept separate from migration 54 because that migration is already deployed.

create index if not exists opportunity_sources_country_idx
  on public.opportunity_sources(country_id);

create index if not exists opportunity_sources_created_by_idx
  on public.opportunity_sources(created_by);

create index if not exists opportunity_ingestion_country_idx
  on public.opportunity_ingestion_items(country_id);

create index if not exists opportunity_ingestion_created_by_idx
  on public.opportunity_ingestion_items(created_by);

create index if not exists opportunity_ingestion_currency_idx
  on public.opportunity_ingestion_items(currency_code);

create index if not exists opportunity_ingestion_district_idx
  on public.opportunity_ingestion_items(district_id);

create index if not exists opportunity_ingestion_duplicate_idx
  on public.opportunity_ingestion_items(duplicate_opportunity_id);

create index if not exists opportunity_ingestion_type_idx
  on public.opportunity_ingestion_items(opportunity_type_id);

create index if not exists opportunity_ingestion_sector_idx
  on public.opportunity_ingestion_items(sector_id);

-- ===== END 55_opportunity_ingestion_index_hardening.sql =====

-- ===== START 56_opportunity_source_monitoring.sql =====
-- Human-supervised source monitoring and deterministic extraction provenance.
-- No source is fetched and no opportunity is published automatically.

begin;

alter table public.opportunity_sources
  add column if not exists last_check_status text
    check (last_check_status is null or last_check_status in ('success', 'no_change', 'blocked', 'error')),
  add column if not exists consecutive_failures integer not null default 0
    check (consecutive_failures >= 0);

alter table public.opportunity_ingestion_items
  add column if not exists extraction_method text not null default 'manual'
    check (extraction_method in ('manual', 'assisted_text')),
  add column if not exists extraction_confidence integer
    check (extraction_confidence is null or extraction_confidence between 0 and 100),
  add column if not exists extracted_fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extracted_fields) = 'object');

create table if not exists public.opportunity_source_checks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.opportunity_sources(id) on delete cascade,
  status text not null check (status in ('success', 'no_change', 'blocked', 'error')),
  items_found integer not null default 0 check (items_found >= 0),
  notes text,
  checked_by uuid not null default auth.uid() references public.profiles(id),
  checked_at timestamptz not null default now()
);

create index if not exists opportunity_source_checks_source_time_idx
  on public.opportunity_source_checks(source_id, checked_at desc);
create index if not exists opportunity_source_checks_checked_by_idx
  on public.opportunity_source_checks(checked_by);

create or replace function public.refresh_opportunity_source_monitoring()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not (select public.is_opportunity_researcher()) then
    raise exception 'Researcher access required';
  end if;

  new.checked_by := (select auth.uid());
  update public.opportunity_sources
  set last_checked_at = new.checked_at,
      last_check_status = new.status,
      consecutive_failures = case
        when new.status in ('blocked', 'error') then consecutive_failures + 1
        else 0
      end,
      next_check_at = new.checked_at + make_interval(hours => check_frequency_hours),
      updated_at = now()
  where id = new.source_id;
  return new;
end;
$$;

drop trigger if exists opportunity_source_check_refresh on public.opportunity_source_checks;
create trigger opportunity_source_check_refresh
before insert on public.opportunity_source_checks
for each row execute function public.refresh_opportunity_source_monitoring();

alter table public.opportunity_source_checks enable row level security;
revoke all on public.opportunity_source_checks from anon;
grant select, insert on public.opportunity_source_checks to authenticated;

create policy opportunity_source_checks_staff_read
on public.opportunity_source_checks for select to authenticated
using ((select public.is_opportunity_researcher()));

create policy opportunity_source_checks_staff_insert
on public.opportunity_source_checks for insert to authenticated
with check (
  (select public.is_opportunity_researcher())
  and checked_by = (select auth.uid())
);

commit;

-- ===== END 56_opportunity_source_monitoring.sql =====

-- ===== START 57_procurement_search_alert_matching.sql =====
-- Procurement-grade saved-search matching and durable alert evidence.
-- Matches only reviewed opportunities when they enter a public status.

begin;

alter table public.saved_searches
  add column if not exists country_id uuid references public.countries(id) on delete set null,
  add column if not exists frequency text not null default 'immediate'
    check (frequency in ('immediate', 'daily', 'weekly')),
  add column if not exists is_active boolean not null default true,
  add column if not exists last_matched_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists saved_searches_country_id_idx
  on public.saved_searches(country_id);
create index if not exists saved_searches_active_user_idx
  on public.saved_searches(user_id, is_active, created_at desc);

create table if not exists public.saved_search_matches (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_score integer not null check (match_score between 0 and 100),
  match_reasons jsonb not null default '{}'::jsonb
    check (jsonb_typeof(match_reasons) = 'object'),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'notified', 'dismissed')),
  matched_at timestamptz not null default now(),
  notified_at timestamptz,
  unique(saved_search_id, opportunity_id)
);

create index if not exists saved_search_matches_search_time_idx
  on public.saved_search_matches(saved_search_id, matched_at desc);
create index if not exists saved_search_matches_opportunity_idx
  on public.saved_search_matches(opportunity_id);
create index if not exists saved_search_matches_user_status_idx
  on public.saved_search_matches(user_id, delivery_status, matched_at desc);

alter table public.saved_searches enable row level security;
alter table public.saved_search_matches enable row level security;

revoke all on public.saved_searches, public.saved_search_matches from anon;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select on public.saved_search_matches to authenticated;
grant update(delivery_status) on public.saved_search_matches to authenticated;

drop policy if exists "Users manage their own saved searches" on public.saved_searches;
drop policy if exists saved_searches_owner_read on public.saved_searches;
drop policy if exists saved_searches_owner_insert on public.saved_searches;
drop policy if exists saved_searches_owner_update on public.saved_searches;
drop policy if exists saved_searches_owner_delete on public.saved_searches;

create policy saved_searches_owner_read
on public.saved_searches for select to authenticated
using (user_id = (select auth.uid()));
create policy saved_searches_owner_insert
on public.saved_searches for insert to authenticated
with check (user_id = (select auth.uid()));
create policy saved_searches_owner_update
on public.saved_searches for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy saved_searches_owner_delete
on public.saved_searches for delete to authenticated
using (user_id = (select auth.uid()));

create policy saved_search_matches_owner_read
on public.saved_search_matches for select to authenticated
using (user_id = (select auth.uid()));
create policy saved_search_matches_owner_update
on public.saved_search_matches for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.notify_matching_users_on_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  public_status text;
  saved record;
  inserted_match_id uuid;
  calculated_score integer;
  reasons jsonb;
begin
  if tg_op = 'UPDATE' and old.status_id is not distinct from new.status_id then
    return new;
  end if;

  select code into public_status
  from public.opportunity_statuses
  where id = new.status_id;
  if public_status not in ('published', 'amended') then
    return new;
  end if;

  for saved in
    select ss.*
    from public.saved_searches ss
    where ss.is_active
      and (ss.country_id is null or ss.country_id = new.country_id)
      and (ss.sector_id is null or ss.sector_id = new.sector_id)
      and (ss.district_id is null or ss.district_id = new.district_id)
      and (ss.opportunity_type_id is null or ss.opportunity_type_id = new.opportunity_type_id)
      and (
        nullif(btrim(coalesce(ss.keyword, '')), '') is null
        or strpos(
          lower(concat_ws(' ', new.title, new.summary, new.description, new.buyer_name)),
          lower(btrim(ss.keyword))
        ) > 0
      )
      and (new.submission_deadline is null or new.submission_deadline > now())
  loop
    calculated_score := 50
      + case when saved.keyword is not null then 20 else 0 end
      + case when saved.sector_id is not null then 10 else 0 end
      + case when saved.country_id is not null then 10 else 0 end
      + case when saved.district_id is not null then 5 else 0 end
      + case when saved.opportunity_type_id is not null then 5 else 0 end;
    reasons := jsonb_strip_nulls(jsonb_build_object(
      'keyword', case when saved.keyword is not null then saved.keyword end,
      'sector', case when saved.sector_id is not null then true end,
      'country', case when saved.country_id is not null then true end,
      'district', case when saved.district_id is not null then true end,
      'opportunity_type', case when saved.opportunity_type_id is not null then true end
    ));

    inserted_match_id := null;
    insert into public.saved_search_matches (
      saved_search_id, opportunity_id, user_id, match_score, match_reasons
    ) values (
      saved.id, new.id, saved.user_id, least(calculated_score, 100), reasons
    )
    on conflict (saved_search_id, opportunity_id) do nothing
    returning id into inserted_match_id;

    if inserted_match_id is not null then
      update public.saved_searches
      set last_matched_at = now(), updated_at = now()
      where id = saved.id;

      if saved.frequency = 'immediate' then
        insert into public.notifications (
          user_id, category, title, body, link_url, channel, priority,
          action_label, workspace_target, metadata
        ) values (
          saved.user_id,
          'saved_search_match',
          'New tender matches ' || saved.name,
          new.title,
          '/tenders/' || new.slug,
          'in_app',
          case when new.submission_deadline is not null
                    and new.submission_deadline < now() + interval '7 days'
               then 'high' else 'normal' end,
          'View tender',
          'tenders',
          jsonb_build_object(
            'opportunity_id', new.id,
            'saved_search_id', saved.id,
            'match_id', inserted_match_id,
            'match_score', least(calculated_score, 100)
          )
        );
        update public.saved_search_matches
        set delivery_status = 'notified', notified_at = now()
        where id = inserted_match_id;
      end if;
    end if;
  end loop;

  if new.buyer_org_id is not null then
    insert into public.notifications (
      user_id, category, title, body, link_url, channel, metadata
    )
    select
      fb.user_id, 'followed_buyer', 'New tender from a buyer you follow',
      new.title, '/tenders/' || new.slug, 'in_app',
      jsonb_build_object('opportunity_id', new.id)
    from public.followed_buyers fb
    where fb.buyer_org_id = new.buyer_org_id
      and not exists (
        select 1 from public.notifications n
        where n.user_id = fb.user_id
          and n.category = 'followed_buyer'
          and n.metadata->>'opportunity_id' = new.id::text
      );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_matching_users_on_publish() from public, anon, authenticated;

drop trigger if exists notify_matching_users_on_publish_trigger on public.opportunities;
create trigger notify_matching_users_on_publish_trigger
after insert or update of status_id on public.opportunities
for each row execute function public.notify_matching_users_on_publish();

commit;

-- ===== END 57_procurement_search_alert_matching.sql =====

-- ===== START 58_tender_alert_email_delivery.sql =====
-- Durable email delivery for immediate, daily and weekly saved-search matches.
-- Uses the existing private background-job queue and Resend worker endpoint.

begin;

alter table public.saved_search_matches
  add column if not exists email_status text not null default 'pending'
    check (email_status in ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed')),
  add column if not exists email_delivery_id uuid;

create table if not exists public.tender_alert_email_suppressions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('bounced', 'complained', 'suppressed', 'manual')),
  provider_event_id text,
  suppressed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tender_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  frequency text not null check (frequency in ('immediate', 'daily', 'weekly')),
  match_ids uuid[] not null check (cardinality(match_ids) between 1 and 100),
  match_count integer not null check (match_count between 1 and 100),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'suppressed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  provider_message_id text,
  error_message text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_search_matches
  drop constraint if exists saved_search_matches_email_delivery_id_fkey;
alter table public.saved_search_matches
  add constraint saved_search_matches_email_delivery_id_fkey
  foreign key (email_delivery_id) references public.tender_alert_deliveries(id) on delete set null;

create index if not exists tender_alert_deliveries_queue_idx
  on public.tender_alert_deliveries(status, scheduled_at, created_at);
create unique index if not exists tender_alert_deliveries_provider_idx
  on public.tender_alert_deliveries(provider_message_id)
  where provider_message_id is not null;
create index if not exists tender_alert_deliveries_user_time_idx
  on public.tender_alert_deliveries(user_id, created_at desc);
create index if not exists saved_search_matches_email_delivery_idx
  on public.saved_search_matches(email_delivery_id)
  where email_delivery_id is not null;

create table if not exists public.tender_alert_email_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  delivery_id uuid not null references public.tender_alert_deliveries(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tender_alert_email_events_delivery_idx
  on public.tender_alert_email_events(delivery_id, occurred_at desc);

alter table public.tender_alert_deliveries enable row level security;
alter table public.tender_alert_email_events enable row level security;
alter table public.tender_alert_email_suppressions enable row level security;
revoke all on public.tender_alert_deliveries, public.tender_alert_email_events,
  public.tender_alert_email_suppressions from public, anon, authenticated;
grant select, insert, update, delete on public.tender_alert_deliveries,
  public.tender_alert_email_events, public.tender_alert_email_suppressions to service_role;

create or replace function public.enqueue_due_tender_alert_jobs(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate record;
  delivery_id uuid;
  queued_count integer := 0;
begin
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Enqueue limit must be between 1 and 200';
  end if;

  -- The scheduler can overlap during container restarts. Serialise selection
  -- and claiming so the same pending matches cannot enter two digests.
  perform pg_advisory_xact_lock(hashtext('enqueue_due_tender_alert_jobs'));

  for candidate in
    select
      m.user_id,
      ss.frequency,
      p.email,
      (array_agg(m.id order by m.matched_at))[1:100] as match_ids
    from public.saved_search_matches m
    join public.saved_searches ss on ss.id = m.saved_search_id
    join public.profiles p on p.id = m.user_id
    left join public.tender_alert_email_suppressions suppression on suppression.user_id = m.user_id
    where m.email_status = 'pending'
      and ss.is_active
      and nullif(btrim(coalesce(p.email, '')), '') is not null
      and suppression.user_id is null
      and (
        ss.frequency = 'immediate'
        or (
          ss.frequency = 'daily'
          and now() >= date_trunc('day', now()) + interval '7 hours'
          and m.matched_at < date_trunc('day', now()) + interval '7 hours'
        )
        or (
          ss.frequency = 'weekly'
          and extract(isodow from now()) = 1
          and now() >= date_trunc('day', now()) + interval '7 hours'
          and m.matched_at < date_trunc('day', now()) + interval '7 hours'
        )
      )
    group by m.user_id, ss.frequency, p.email
    order by min(m.matched_at)
    limit p_limit
  loop
    insert into public.tender_alert_deliveries (
      user_id, recipient_email, frequency, match_ids, match_count
    ) values (
      candidate.user_id,
      lower(btrim(candidate.email)),
      candidate.frequency,
      candidate.match_ids,
      cardinality(candidate.match_ids)
    )
    returning id into delivery_id;

    update public.saved_search_matches
    set email_status = 'queued', email_delivery_id = delivery_id
    where id = any(candidate.match_ids);

    perform private.enqueue_background_job(
      'tender.alert.dispatch',
      jsonb_build_object('delivery_id', delivery_id),
      delivery_id::text,
      now(),
      8,
      (case candidate.frequency when 'immediate' then 60 else 30 end)::smallint
    );
    queued_count := queued_count + 1;
  end loop;
  return queued_count;
end;
$$;

create or replace function public.admin_get_tender_alert_delivery_summary()
returns table(
  queued bigint, sent bigint, delivered bigint, failed bigint,
  suppressed bigint, deliveries_24h bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return query
  select
    count(*) filter (where d.status in ('queued', 'sending')),
    count(*) filter (where d.status = 'sent'),
    count(*) filter (where d.status = 'delivered'),
    count(*) filter (where d.status in ('failed', 'bounced', 'complained')),
    count(*) filter (where d.status = 'suppressed'),
    count(*) filter (where d.created_at >= now() - interval '24 hours')
  from public.tender_alert_deliveries d;
end;
$$;

revoke all on function public.enqueue_due_tender_alert_jobs(integer) from public, anon, authenticated;
revoke all on function public.admin_get_tender_alert_delivery_summary() from public, anon;
grant execute on function public.enqueue_due_tender_alert_jobs(integer) to service_role;
grant execute on function public.admin_get_tender_alert_delivery_summary() to authenticated, service_role;

commit;

-- ===== END 58_tender_alert_email_delivery.sql =====

-- ===== START 59_procurement_ranked_search.sql =====
-- Ranked procurement discovery with server-side filters and privacy-conscious
-- search analytics. Public search is explicitly restricted to public statuses.

begin;

alter table public.opportunities
  add column if not exists search_vector tsvector;

create or replace function public.refresh_opportunity_search_vector()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple'::regconfig, coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.reference_number, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.buyer_name, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.summary, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.description, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.eligibility_requirements, '')), 'C');
  return new;
end;
$$;

update public.opportunities
set search_vector =
      setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(reference_number, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(buyer_name, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(summary, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(description, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, coalesce(eligibility_requirements, '')), 'C')
where search_vector is null;

alter table public.opportunities
  alter column search_vector set default ''::tsvector,
  alter column search_vector set not null;

drop trigger if exists opportunities_refresh_search_vector on public.opportunities;
create trigger opportunities_refresh_search_vector
before insert or update of title, reference_number, buyer_name, summary, description, eligibility_requirements
on public.opportunities
for each row execute function public.refresh_opportunity_search_vector();

create index if not exists opportunities_search_vector_idx
  on public.opportunities using gin(search_vector);
create index if not exists opportunities_public_discovery_idx
  on public.opportunities(status_id, is_featured desc, submission_deadline, publication_date desc);

create table if not exists public.procurement_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_hash text check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$'),
  search_term text,
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  sort_mode text not null check (sort_mode in ('relevance', 'deadline', 'newest')),
  result_count integer not null default 0 check (result_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists procurement_search_events_created_idx
  on public.procurement_search_events(created_at desc);
create index if not exists procurement_search_events_term_idx
  on public.procurement_search_events(lower(search_term), created_at desc)
  where search_term is not null;
create index if not exists procurement_search_events_user_idx
  on public.procurement_search_events(user_id, created_at desc)
  where user_id is not null;

alter table public.procurement_search_events enable row level security;
revoke all on public.procurement_search_events from public, anon, authenticated;
grant select, insert, update, delete on public.procurement_search_events to service_role;

create or replace function public.search_public_opportunities(
  p_query text default null,
  p_sector_id uuid default null,
  p_country_id uuid default null,
  p_district_id uuid default null,
  p_opportunity_type_id uuid default null,
  p_status_filter text default 'all',
  p_sort text default 'relevance',
  p_visitor_hash text default null,
  p_limit integer default 50
)
returns table(
  id uuid,
  slug text,
  title text,
  buyer_name text,
  submission_deadline timestamptz,
  estimated_value numeric,
  currency_code text,
  is_featured boolean,
  review_note text,
  view_count integer,
  sector text,
  district text,
  country text,
  opportunity_type text,
  status_code text,
  status_label text,
  relevance_score real,
  total_count bigint,
  search_event_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_query text := nullif(left(btrim(coalesce(p_query, '')), 120), '');
  search_query tsquery;
  analytics_id uuid;
  filters_json jsonb;
begin
  if p_status_filter not in ('all', 'open', 'closing', 'featured') then
    raise exception 'Unsupported tender status filter';
  end if;
  if p_sort not in ('relevance', 'deadline', 'newest') then
    raise exception 'Unsupported tender sort mode';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Search limit must be between 1 and 100';
  end if;
  if p_visitor_hash is not null and p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor token';
  end if;

  if normalized_query is not null then
    search_query := websearch_to_tsquery('simple'::regconfig, normalized_query);
  end if;
  filters_json := jsonb_strip_nulls(jsonb_build_object(
    'sector_id', p_sector_id,
    'country_id', p_country_id,
    'district_id', p_district_id,
    'opportunity_type_id', p_opportunity_type_id,
    'status', p_status_filter
  ));

  insert into public.procurement_search_events(
    user_id, visitor_hash, search_term, filters, sort_mode
  )
  select auth.uid(), p_visitor_hash, lower(normalized_query), filters_json, p_sort
  where not exists (
    select 1
    from public.procurement_search_events previous
    where previous.created_at >= now() - interval '1 minute'
      and previous.user_id is not distinct from auth.uid()
      and previous.visitor_hash is not distinct from p_visitor_hash
      and previous.search_term is not distinct from lower(normalized_query)
      and previous.filters = filters_json
      and previous.sort_mode = p_sort
  )
  returning public.procurement_search_events.id into analytics_id;

  if analytics_id is null then
    select previous.id into analytics_id
    from public.procurement_search_events previous
    where previous.created_at >= now() - interval '1 minute'
      and previous.user_id is not distinct from auth.uid()
      and previous.visitor_hash is not distinct from p_visitor_hash
      and previous.search_term is not distinct from lower(normalized_query)
      and previous.filters = filters_json
      and previous.sort_mode = p_sort
    order by previous.created_at desc
    limit 1;
  end if;

  return query
  with ranked as (
    select
      opportunity.id,
      opportunity.slug,
      opportunity.title,
      opportunity.buyer_name,
      opportunity.publication_date,
      opportunity.submission_deadline,
      opportunity.estimated_value,
      opportunity.currency_code,
      opportunity.is_featured,
      opportunity.review_note,
      opportunity.view_count,
      sector.name as sector,
      district.name as district,
      country.name as country,
      opportunity_type.label as opportunity_type,
      status.code as status_code,
      status.label as status_label,
      (
        case when search_query is null then 0
          else ts_rank_cd(opportunity.search_vector, search_query, 32) * 100
        end
        + case when opportunity.is_featured then 4 else 0 end
        + case when opportunity.publication_date >= current_date - 14 then 2 else 0 end
      )::real as relevance_score
    from public.opportunities opportunity
    join public.opportunity_statuses status on status.id = opportunity.status_id
    left join public.sectors sector on sector.id = opportunity.sector_id
    left join public.districts district on district.id = opportunity.district_id
    left join public.countries country on country.id = opportunity.country_id
    left join public.opportunity_types opportunity_type on opportunity_type.id = opportunity.opportunity_type_id
    where status.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded')
      and (search_query is null or opportunity.search_vector @@ search_query)
      and (p_sector_id is null or opportunity.sector_id = p_sector_id)
      and (p_country_id is null or opportunity.country_id = p_country_id)
      and (p_district_id is null or opportunity.district_id = p_district_id)
      and (p_opportunity_type_id is null or opportunity.opportunity_type_id = p_opportunity_type_id)
      and (
        p_status_filter = 'all'
        or (p_status_filter = 'open' and opportunity.submission_deadline >= now())
        or (p_status_filter = 'closing' and opportunity.submission_deadline between now() and now() + interval '7 days')
        or (p_status_filter = 'featured' and opportunity.is_featured)
      )
  ),
  measured as (
    select ranked.*, count(*) over() as total_count
    from ranked
  )
  select
    measured.id, measured.slug, measured.title, measured.buyer_name,
    measured.submission_deadline, measured.estimated_value, measured.currency_code,
    measured.is_featured, measured.review_note, measured.view_count,
    measured.sector, measured.district, measured.country, measured.opportunity_type,
    measured.status_code, measured.status_label, measured.relevance_score,
    measured.total_count, analytics_id
  from measured
  order by
    case when p_sort = 'relevance' then measured.relevance_score end desc,
    case when p_sort = 'newest' then measured.publication_date end desc,
    case when p_sort = 'deadline' then measured.submission_deadline end asc,
    measured.is_featured desc,
    measured.submission_deadline asc,
    measured.id
  limit p_limit;

  update public.procurement_search_events event
  set result_count = coalesce((
    select count(*)::integer
    from public.opportunities opportunity
    join public.opportunity_statuses status on status.id = opportunity.status_id
    where status.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded')
      and (search_query is null or opportunity.search_vector @@ search_query)
      and (p_sector_id is null or opportunity.sector_id = p_sector_id)
      and (p_country_id is null or opportunity.country_id = p_country_id)
      and (p_district_id is null or opportunity.district_id = p_district_id)
      and (p_opportunity_type_id is null or opportunity.opportunity_type_id = p_opportunity_type_id)
      and (
        p_status_filter = 'all'
        or (p_status_filter = 'open' and opportunity.submission_deadline >= now())
        or (p_status_filter = 'closing' and opportunity.submission_deadline between now() and now() + interval '7 days')
        or (p_status_filter = 'featured' and opportunity.is_featured)
      )
  ), 0)
  where event.id = analytics_id;
end;
$$;

create or replace function public.admin_get_procurement_search_insights(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;
  if p_days < 1 or p_days > 365 then
    raise exception 'Insight window must be between 1 and 365 days';
  end if;
  return jsonb_build_object(
    'searches', (select count(*) from public.procurement_search_events where created_at >= now() - make_interval(days => p_days)),
    'zero_result_searches', (select count(*) from public.procurement_search_events where created_at >= now() - make_interval(days => p_days) and result_count = 0),
    'top_terms', coalesce((
      select jsonb_agg(to_jsonb(term_row))
      from (
        select search_term as term, count(*) as searches, round(avg(result_count), 1) as average_results
        from public.procurement_search_events
        where created_at >= now() - make_interval(days => p_days) and search_term is not null
        group by search_term order by count(*) desc, search_term limit 10
      ) term_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.refresh_opportunity_search_vector() from public, anon, authenticated;
revoke all on function public.search_public_opportunities(text, uuid, uuid, uuid, uuid, text, text, text, integer) from public;
revoke all on function public.admin_get_procurement_search_insights(integer) from public, anon;
grant execute on function public.search_public_opportunities(text, uuid, uuid, uuid, uuid, text, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.admin_get_procurement_search_insights(integer) to authenticated, service_role;

commit;

-- ===== END 59_procurement_ranked_search.sql =====

select 'Batch 2/5 complete: migrations 46-59' as staging_migration_progress;
