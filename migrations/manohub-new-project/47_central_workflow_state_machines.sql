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
