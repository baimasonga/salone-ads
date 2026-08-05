-- Match the subscriber listing contract to subscriptions.current_period_end (date).

begin;

drop function if exists public.admin_list_subscribers(text,text,text,integer,integer);
create function public.admin_list_subscribers(
  p_status text default null,p_subscriber_type text default null,p_search text default null,
  p_limit integer default 25,p_offset integer default 0
)
returns table(
  id uuid,name text,organization_type text,subscriber_type text,status text,status_reason text,
  country text,district text,city text,website text,phone text,whatsapp text,description text,
  audience_scope text,primary_objective text,monthly_budget_sle numeric,subscriber_details jsonb,
  owner_id uuid,owner_name text,owner_email text,member_count bigint,subscription_id uuid,
  plan_code text,plan_name text,subscription_status text,billing_cycle text,current_period_end date,
  created_at timestamptz,updated_at timestamptz,closed_at timestamptz,recoverable_until timestamptz,
  purged_at timestamptz,recovery_request_id uuid,recovery_reason text,total_count bigint
)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  if p_status is not null and p_status not in ('active','suspended','recovery_pending','closed','purged') then raise exception 'Invalid subscriber status'; end if;
  if p_subscriber_type is not null and p_subscriber_type not in ('free','viewer','publisher','advertiser') then raise exception 'Invalid subscriber type'; end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'Invalid pagination'; end if;
  return query
  with filtered as (
    select o.* from public.organizations o
    where (p_status is null or o.status=p_status)
      and (p_subscriber_type is null or o.subscriber_type=p_subscriber_type)
      and (nullif(trim(coalesce(p_search,'')),'') is null
        or o.name ilike '%'||trim(p_search)||'%'
        or o.phone ilike '%'||trim(p_search)||'%'
        or o.whatsapp ilike '%'||trim(p_search)||'%'
        or exists(select 1 from public.organization_members sm join public.profiles sp on sp.id=sm.user_id
          where sm.org_id=o.id and (sp.full_name ilike '%'||trim(p_search)||'%' or sp.email ilike '%'||trim(p_search)||'%')))
  )
  select f.id,f.name,f.type,f.subscriber_type,f.status,f.status_reason,f.country,f.district,f.city,
    f.website,f.phone,f.whatsapp,f.description,f.audience_scope,f.primary_objective,f.monthly_budget_sle,
    f.subscriber_details,owner.user_id,owner.full_name,owner.email,
    (select count(*) from public.organization_members members where members.org_id=f.id),
    subscription.id,subscription.plan_code,subscription.plan_name,subscription.status,
    subscription.billing_cycle,subscription.current_period_end,f.created_at,f.updated_at,f.closed_at,
    f.recoverable_until,f.purged_at,recovery.id,recovery.reason,count(*) over()
  from filtered f
  left join lateral(select m.user_id,p.full_name,p.email from public.organization_members m
    join public.profiles p on p.id=m.user_id where m.org_id=f.id and m.role='owner' limit 1) owner on true
  left join lateral(select s.id,p.code plan_code,p.name plan_name,s.status,s.billing_cycle,s.current_period_end
    from public.subscriptions s join public.plans p on p.id=s.plan_id
    where s.org_id=f.id order by s.created_at desc limit 1) subscription on true
  left join lateral(select r.id,r.reason from public.organization_recovery_requests r
    where r.org_id=f.id and r.status='pending' order by r.created_at desc limit 1) recovery on true
  order by case f.status when 'recovery_pending' then 0 when 'suspended' then 1 when 'closed' then 2 when 'purged' then 4 else 3 end,f.updated_at desc
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.admin_list_subscribers(text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_subscribers(text,text,text,integer,integer) to authenticated;

commit;
