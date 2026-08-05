-- Unified subscriber administration, access revocation and privacy-safe purge.

begin;

alter table public.organizations
  add column if not exists purged_at timestamptz,
  add column if not exists purged_by uuid references auth.users(id) on delete set null;

alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('active','suspended','recovery_pending','closed','purged'));

create index if not exists organizations_subscriber_admin_idx
  on public.organizations (subscriber_type, status, created_at desc);

create table if not exists private.blocked_subscriber_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  former_org_id uuid not null,
  reason text not null,
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz not null default now()
);
revoke all on private.blocked_subscriber_users from public,anon,authenticated;

create or replace function private.prevent_blocked_subscriber_registration()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.created_by is not null and exists (
    select 1 from private.blocked_subscriber_users b where b.user_id=new.created_by
  ) then raise exception 'This account has been permanently removed and cannot create another workspace'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_blocked_subscriber_registration() from public,anon,authenticated;
drop trigger if exists prevent_blocked_subscriber_registration on public.organizations;
create trigger prevent_blocked_subscriber_registration before insert on public.organizations
for each row execute function private.prevent_blocked_subscriber_registration();

-- A lifecycle status change must end server-side sessions. Existing access
-- tokens remain subject to the organization status checks in the application
-- and entitlement functions until their short expiry.
create or replace function private.revoke_restricted_organization_sessions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('suspended','closed','purged') and new.status is distinct from old.status then
    delete from auth.sessions s
    using public.organization_members m
    where m.org_id = new.id and m.user_id = s.user_id;
  end if;
  return new;
end;
$$;
revoke all on function private.revoke_restricted_organization_sessions() from public,anon,authenticated;
drop trigger if exists revoke_restricted_organization_sessions on public.organizations;
create trigger revoke_restricted_organization_sessions
after update of status on public.organizations
for each row execute function private.revoke_restricted_organization_sessions();

drop function if exists public.admin_list_subscribers(text,text,text,integer,integer);
create function public.admin_list_subscribers(
  p_status text default null,
  p_subscriber_type text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  id uuid, name text, organization_type text, subscriber_type text,
  status text, status_reason text, country text, district text, city text,
  website text, phone text, whatsapp text, description text,
  audience_scope text, primary_objective text, monthly_budget_sle numeric,
  subscriber_details jsonb, owner_id uuid, owner_name text, owner_email text,
  member_count bigint, subscription_id uuid, plan_code text, plan_name text,
  subscription_status text, billing_cycle text, current_period_end timestamptz,
  created_at timestamptz, updated_at timestamptz, closed_at timestamptz,
  recoverable_until timestamptz, purged_at timestamptz,
  recovery_request_id uuid, recovery_reason text, total_count bigint
)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_status is not null and p_status not in ('active','suspended','recovery_pending','closed','purged') then
    raise exception 'Invalid subscriber status';
  end if;
  if p_subscriber_type is not null and p_subscriber_type not in ('free','viewer','publisher','advertiser') then
    raise exception 'Invalid subscriber type';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then raise exception 'Invalid pagination'; end if;

  return query
  with filtered as (
    select o.* from public.organizations o
    where (p_status is null or o.status = p_status)
      and (p_subscriber_type is null or o.subscriber_type = p_subscriber_type)
      and (
        nullif(trim(coalesce(p_search,'')),'') is null
        or o.name ilike '%'||trim(p_search)||'%'
        or o.phone ilike '%'||trim(p_search)||'%'
        or o.whatsapp ilike '%'||trim(p_search)||'%'
        or exists (
          select 1 from public.organization_members sm
          join public.profiles sp on sp.id=sm.user_id
          where sm.org_id=o.id and (sp.full_name ilike '%'||trim(p_search)||'%' or sp.email ilike '%'||trim(p_search)||'%')
        )
      )
  )
  select f.id,f.name,f.type,f.subscriber_type,f.status,f.status_reason,
    f.country,f.district,f.city,f.website,f.phone,f.whatsapp,f.description,
    f.audience_scope,f.primary_objective,f.monthly_budget_sle,f.subscriber_details,
    owner.user_id,owner.full_name,owner.email,
    (select count(*) from public.organization_members members where members.org_id=f.id),
    subscription.id,subscription.plan_code,subscription.plan_name,subscription.status,
    subscription.billing_cycle,subscription.current_period_end,
    f.created_at,f.updated_at,f.closed_at,f.recoverable_until,f.purged_at,
    recovery.id,recovery.reason,
    count(*) over()
  from filtered f
  left join lateral (
    select m.user_id,p.full_name,p.email
    from public.organization_members m join public.profiles p on p.id=m.user_id
    where m.org_id=f.id and m.role='owner' limit 1
  ) owner on true
  left join lateral (
    select s.id,p.code plan_code,p.name plan_name,s.status,s.billing_cycle,s.current_period_end
    from public.subscriptions s join public.plans p on p.id=s.plan_id
    where s.org_id=f.id order by s.created_at desc limit 1
  ) subscription on true
  left join lateral (
    select r.id,r.reason from public.organization_recovery_requests r
    where r.org_id=f.id and r.status='pending' order by r.created_at desc limit 1
  ) recovery on true
  order by case f.status when 'recovery_pending' then 0 when 'suspended' then 1 when 'closed' then 2 when 'purged' then 4 else 3 end,
    f.updated_at desc
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.admin_list_subscribers(text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_subscribers(text,text,text,integer,integer) to authenticated;

create or replace function public.admin_purge_subscriber(
  p_org_id uuid,
  p_confirmation text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target public.organizations;
  affected_users uuid[];
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
    raise exception 'A deletion reason between 10 and 1000 characters is required';
  end if;
  select * into target from public.organizations where id=p_org_id for update;
  if not found then raise exception 'Subscriber organization not found'; end if;
  if target.status <> 'closed' then raise exception 'Close the subscriber account before permanent removal'; end if;
  if target.recoverable_until is null or target.recoverable_until > now() then
    raise exception 'The 30-day recovery period has not expired';
  end if;
  if p_confirmation <> target.name then raise exception 'Organization name confirmation does not match'; end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id=m.user_id
    where m.org_id=p_org_id and p.platform_role='admin'
  ) then raise exception 'A platform administrator account cannot be purged'; end if;

  select coalesce(array_agg(user_id),'{}'::uuid[]) into affected_users
  from public.organization_members where org_id=p_org_id;

  delete from auth.sessions where user_id=any(affected_users);

  -- Anonymize profiles only when the person has no membership outside this
  -- subscriber. Financial and audit rows retain opaque identifiers.
  update public.profiles p set full_name='Deleted subscriber',email=null
  where p.id=any(affected_users)
    and not exists (
      select 1 from public.organization_members other
      where other.user_id=p.id and other.org_id<>p_org_id
    );

  insert into private.blocked_subscriber_users(user_id,former_org_id,reason,blocked_by)
  select user_id,p_org_id,trim(p_reason),(select auth.uid())
  from public.organization_members where org_id=p_org_id
  on conflict(user_id) do update set reason=excluded.reason,blocked_by=excluded.blocked_by,blocked_at=now();

  delete from public.organization_members where org_id=p_org_id;

  perform set_config('app.organization_lifecycle_override','on',true);
  update public.organizations set
    name='Deleted subscriber '||left(id::text,8), type='Deleted', country='Deleted',
    district=null,city=null,website=null,phone=null,whatsapp=null,description=null,
    audience_scope=null,primary_objective=null,monthly_budget=null,monthly_budget_sle=null,
    subscriber_details='{}'::jsonb,status='purged',status_reason=trim(p_reason),
    purged_at=now(),purged_by=(select auth.uid()),updated_at=now()
  where id=p_org_id;

  insert into public.audit_logs(actor_id,org_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),p_org_id,'subscriber.purged','organization',p_org_id::text,
    jsonb_build_object('reason',trim(p_reason),'affected_user_count',cardinality(affected_users)));

  return jsonb_build_object('organizationId',p_org_id,'status','purged','affectedUsers',cardinality(affected_users));
end;
$$;
revoke all on function public.admin_purge_subscriber(uuid,text,text) from public,anon;
grant execute on function public.admin_purge_subscriber(uuid,text,text) to authenticated;

-- Extend the idempotent command allowlist with the destructive purge command.
create or replace function public.claim_backend_command(
  p_command_name text,p_idempotency_key text,p_payload_hash text,p_request_id text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); existing public.backend_command_requests;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not (p_command_name = any(array[
    'organization.invite','organization.transition','organization.recovery.decide','organization.purge',
    'subscription.transition','advertising.order.create','organization.verification.approve',
    'procurement.ingestion.promote','billing.payment.record','billing.credit.issue','billing.refund.record'
  ])) then raise exception 'Unsupported command'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid payload hash'; end if;
  insert into public.backend_command_requests(actor_id,command_name,idempotency_key,payload_hash,request_id)
  values(actor,p_command_name,p_idempotency_key,p_payload_hash,left(p_request_id,128))
  on conflict(actor_id,command_name,idempotency_key) do nothing returning * into existing;
  if found then return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id); end if;
  select * into existing from public.backend_command_requests
  where actor_id=actor and command_name=p_command_name and idempotency_key=p_idempotency_key for update;
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
