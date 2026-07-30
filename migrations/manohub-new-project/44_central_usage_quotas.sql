-- Central plan quotas, organization overrides and metered usage.

begin;

create table if not exists public.organization_quota_overrides (
  org_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  limit_value integer,
  reason text not null,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, feature_key),
  constraint organization_quota_overrides_key_check check (feature_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint organization_quota_overrides_limit_check check (limit_value is null or limit_value >= 0),
  constraint organization_quota_overrides_reason_check check (length(reason) between 3 and 500)
);

create table if not exists public.organization_usage_meters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  meter_key text not null,
  period_start date not null,
  period_end date not null,
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, meter_key, period_start),
  constraint organization_usage_meters_key_check check (meter_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint organization_usage_meters_value_check check (current_value >= 0),
  constraint organization_usage_meters_period_check check (period_end >= period_start)
);
create table if not exists public.organization_usage_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  meter_key text not null,
  amount integer not null check (amount > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, meter_key, idempotency_key)
);

alter table public.organization_quota_overrides enable row level security;
alter table public.organization_usage_meters enable row level security;
alter table public.organization_usage_events enable row level security;
revoke all on public.organization_quota_overrides, public.organization_usage_meters, public.organization_usage_events from public, anon, authenticated;
grant select on public.organization_quota_overrides, public.organization_usage_meters to authenticated;

drop policy if exists quota_overrides_admin_all on public.organization_quota_overrides;
create policy quota_overrides_admin_all on public.organization_quota_overrides
  for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
drop policy if exists quota_overrides_org_read on public.organization_quota_overrides;
create policy quota_overrides_org_read on public.organization_quota_overrides
  for select to authenticated using ((select public.is_org_member(org_id)));
drop policy if exists usage_meters_admin_read on public.organization_usage_meters;
create policy usage_meters_admin_read on public.organization_usage_meters
  for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists usage_meters_org_read on public.organization_usage_meters;
create policy usage_meters_org_read on public.organization_usage_meters
  for select to authenticated using ((select public.is_org_member(org_id)));

create or replace function public.get_effective_org_quota(p_org_id uuid, p_feature_key text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select qo.limit_value from public.organization_quota_overrides qo
      where qo.org_id = p_org_id and qo.feature_key = p_feature_key
        and (qo.expires_at is null or qo.expires_at > now())),
    public.get_org_feature_limit(p_org_id, p_feature_key)
  );
$$;
revoke all on function public.get_effective_org_quota(uuid, text) from public, anon;
grant execute on function public.get_effective_org_quota(uuid, text) to authenticated;

create or replace function public.get_org_quota_snapshot(p_org_id uuid)
returns table(feature_key text, feature_label text, limit_value integer, current_value bigint, remaining_value bigint, usage_percent numeric, is_override boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (public.is_platform_admin() or public.is_org_member(p_org_id)) then
    raise exception 'Organization access is required';
  end if;
  return query
  with active_plan as (
    select s.plan_id from public.subscriptions s
    where s.org_id = p_org_id and s.status in ('trialing','active','past_due','grace_period')
    order by s.created_at desc limit 1
  ), free_plan as (
    select p.id as plan_id from public.plans p where p.code = 'free' limit 1
  ), features as (
    select pf.feature_key, pf.feature_label, pf.limit_value
    from public.plan_features pf where pf.plan_id = coalesce((select plan_id from active_plan),(select plan_id from free_plan))
      and pf.limit_value is not null
  ), usage_values as (
    select f.feature_key,
      case f.feature_key
        when 'max_team_members' then (select count(*) from public.organization_members om where om.org_id = p_org_id)
        when 'max_active_campaigns' then (select count(*) from public.ad_campaigns c where c.org_id = p_org_id and c.status = 'active')
        when 'max_agency_clients' then (select count(*) from public.agency_clients ac where ac.agency_org_id = p_org_id and ac.status = 'active')
        else coalesce((select sum(m.current_value) from public.organization_usage_meters m
          where m.org_id = p_org_id and m.meter_key = f.feature_key and current_date between m.period_start and m.period_end),0)
      end::bigint as current_value
    from features f
  )
  select f.feature_key, f.feature_label,
    coalesce(o.limit_value, f.limit_value) as limit_value, u.current_value,
    greatest(coalesce(o.limit_value, f.limit_value)::bigint - u.current_value, 0) as remaining_value,
    case when coalesce(o.limit_value, f.limit_value) = 0 then 100
      else round((u.current_value::numeric / coalesce(o.limit_value, f.limit_value)) * 100, 1) end,
    o.org_id is not null
  from features f join usage_values u using (feature_key)
  left join public.organization_quota_overrides o on o.org_id = p_org_id and o.feature_key = f.feature_key
    and (o.expires_at is null or o.expires_at > now())
  order by f.feature_label;
end;
$$;
revoke all on function public.get_org_quota_snapshot(uuid) from public, anon;
grant execute on function public.get_org_quota_snapshot(uuid) to authenticated;

create or replace function public.consume_org_quota(p_org_id uuid, p_meter_key text, p_amount integer default 1, p_idempotency_key text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_value bigint; v_period_start date := date_trunc('month', current_date)::date; v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if (select auth.uid()) is null or not (public.is_platform_admin() or public.is_org_member(p_org_id)) then raise exception 'Organization access is required'; end if;
  if p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid usage amount'; end if;
  v_limit := public.get_effective_org_quota(p_org_id, p_meter_key);
  if v_limit is null then raise exception 'Unknown quota meter: %', p_meter_key; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')), '') is null then raise exception 'An idempotency key is required'; end if;
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
  if v_value > v_limit then raise exception 'Quota exceeded for % (% of %)', p_meter_key, v_value, v_limit; end if;
  return v_value;
end;
$$;
revoke all on function public.consume_org_quota(uuid,text,integer,text) from public, anon;
grant execute on function public.consume_org_quota(uuid,text,integer,text) to authenticated;

create or replace function public.set_org_quota_override(p_org_id uuid,p_feature_key text,p_limit_value integer,p_reason text,p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  insert into public.organization_quota_overrides(org_id,feature_key,limit_value,reason,expires_at,created_by)
  values(p_org_id,p_feature_key,p_limit_value,trim(p_reason),p_expires_at,(select auth.uid()))
  on conflict(org_id,feature_key) do update set limit_value=excluded.limit_value,reason=excluded.reason,expires_at=excluded.expires_at,updated_at=now();
end;
$$;
revoke all on function public.set_org_quota_override(uuid,text,integer,text,timestamptz) from public, anon;
grant execute on function public.set_org_quota_override(uuid,text,integer,text,timestamptz) to authenticated;

commit;
