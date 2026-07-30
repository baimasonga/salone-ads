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
