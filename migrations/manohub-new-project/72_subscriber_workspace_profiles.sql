-- Durable subscriber identity, conditional onboarding data and profile updates.

begin;

alter table public.organizations
  add column if not exists subscriber_type text not null default 'free',
  add column if not exists city text,
  add column if not exists website text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists description text,
  add column if not exists audience_scope text,
  add column if not exists monthly_budget_sle numeric(14,2),
  add column if not exists subscriber_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_subscriber_type_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations add constraint organizations_subscriber_type_check
      check (subscriber_type in ('free', 'viewer', 'publisher', 'advertiser'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_monthly_budget_sle_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations add constraint organizations_monthly_budget_sle_check
      check (monthly_budget_sle is null or monthly_budget_sle >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_subscriber_details_object_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations add constraint organizations_subscriber_details_object_check
      check (jsonb_typeof(subscriber_details) = 'object');
  end if;
end $$;

-- Preserve the original text value for older records while exposing a proper
-- numeric SLE field for every new advertiser registration.
update public.organizations o
set subscriber_type = coalesce((
  select case p.code
    when 'professional' then 'viewer'
    when 'business' then 'publisher'
    when 'advertiser' then 'advertiser'
    else 'free'
  end
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.org_id = o.id
    and s.status in ('pending','trialing','active','past_due','grace_period','suspended')
  order by s.created_at desc
  limit 1
), 'free');

drop function if exists public.create_subscriber_organization(text, text, text, text, text, text, text);

create function public.create_subscriber_organization(
  org_name text,
  org_type text,
  org_country text,
  org_district text,
  org_city text,
  org_website text,
  org_phone text,
  org_whatsapp text,
  org_description text,
  org_primary_objective text,
  org_audience_scope text,
  org_monthly_budget_sle numeric,
  subscriber_type text,
  subscriber_details jsonb default '{}'::jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org public.organizations;
  v_type text := lower(trim(coalesce(subscriber_type, 'free')));
  v_details jsonb := coalesce(subscriber_details, '{}'::jsonb);
  v_plan_id uuid;
  v_plan_code text;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'You already have an organization. Sign in to access your existing workspace instead of creating a new one.';
  end if;
  if v_type not in ('free','viewer','publisher','advertiser') then raise exception 'Unknown subscriber type'; end if;
  if jsonb_typeof(v_details) <> 'object' then raise exception 'Subscriber details must be an object'; end if;
  if nullif(trim(coalesce(org_name, '')), '') is null then raise exception 'Organization name is required'; end if;
  if lower(trim(coalesce(org_country, ''))) = 'sierra leone'
     and nullif(trim(coalesce(org_district, '')), '') is null then
    raise exception 'Choose a Sierra Leone district';
  end if;
  if org_monthly_budget_sle is not null and org_monthly_budget_sle < 0 then
    raise exception 'Monthly budget cannot be negative';
  end if;

  insert into public.organizations (
    name, type, country, district, city, website, phone, whatsapp, description,
    primary_objective, audience_scope, monthly_budget_sle, monthly_budget,
    subscriber_type, subscriber_details, created_by, is_supplier, is_buyer
  ) values (
    trim(org_name), coalesce(nullif(trim(org_type), ''), 'Small Business'),
    coalesce(nullif(trim(org_country), ''), 'Sierra Leone'),
    nullif(trim(org_district), ''), nullif(trim(org_city), ''), nullif(trim(org_website), ''),
    nullif(trim(org_phone), ''), nullif(trim(org_whatsapp), ''), nullif(trim(org_description), ''),
    nullif(trim(org_primary_objective), ''), nullif(trim(org_audience_scope), ''),
    org_monthly_budget_sle,
    case when org_monthly_budget_sle is null then null else 'SLE ' || org_monthly_budget_sle::text end,
    v_type, v_details, v_user_id, v_type = 'viewer', v_type = 'publisher'
  ) returning * into v_org;

  insert into public.organization_members (org_id, user_id, role) values (v_org.id, v_user_id, 'owner');
  insert into public.brand_kits (org_id, brand_name, legal_name)
    values (v_org.id, v_org.name, v_org.name) on conflict (org_id) do nothing;

  if v_type = 'viewer' then
    insert into public.supplier_profiles (
      org_id, trading_name, registration_number, description, website, geographic_coverage
    ) values (
      v_org.id, v_org.name, nullif(v_details->>'registration_number',''), v_org.description,
      v_org.website, nullif(v_details->>'geographic_coverage','')
    ) on conflict (org_id) do nothing;
  elsif v_type = 'publisher' then
    insert into public.buyer_profiles (org_id, description, website)
      values (v_org.id, v_org.description, v_org.website) on conflict (org_id) do nothing;
  end if;

  v_plan_code := case v_type
    when 'viewer' then 'professional'
    when 'publisher' then 'business'
    when 'advertiser' then 'advertiser'
    else 'free'
  end;
  select id into v_plan_id from public.plans where code = v_plan_code and is_active limit 1;
  if v_plan_id is null then raise exception 'Selected subscription plan is unavailable'; end if;

  insert into public.subscriptions (
    org_id, plan_id, status, billing_cycle, payment_method, current_period_start, notes
  ) values (
    v_org.id, v_plan_id, case when v_type = 'free' then 'active' else 'pending' end,
    'monthly', 'invoice', case when v_type = 'free' then current_date else null end,
    case when v_type = 'free' then 'Free access activated during registration' else 'Requested during registration' end
  );

  return v_org;
end;
$$;

revoke all on function public.create_subscriber_organization(
  text,text,text,text,text,text,text,text,text,text,text,numeric,text,jsonb
) from public, anon;
grant execute on function public.create_subscriber_organization(
  text,text,text,text,text,text,text,text,text,text,text,numeric,text,jsonb
) to authenticated;

create or replace function public.update_subscriber_organization_profile(
  p_org_id uuid,
  p_name text,
  p_type text,
  p_country text,
  p_district text,
  p_city text,
  p_website text,
  p_phone text,
  p_whatsapp text,
  p_description text,
  p_primary_objective text,
  p_audience_scope text,
  p_monthly_budget_sle numeric,
  p_subscriber_details jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
  ) then raise exception 'Organization owner or administrator access is required'; end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then raise exception 'Organization name is required'; end if;
  if lower(trim(coalesce(p_country,''))) = 'sierra leone'
     and nullif(trim(coalesce(p_district,'')), '') is null then raise exception 'Choose a Sierra Leone district'; end if;
  if p_monthly_budget_sle is not null and p_monthly_budget_sle < 0 then raise exception 'Monthly budget cannot be negative'; end if;
  if jsonb_typeof(coalesce(p_subscriber_details,'{}'::jsonb)) <> 'object' then raise exception 'Subscriber details must be an object'; end if;

  update public.organizations set
    name=trim(p_name), type=trim(p_type), country=trim(p_country),
    district=nullif(trim(p_district),''), city=nullif(trim(p_city),''),
    website=nullif(trim(p_website),''), phone=nullif(trim(p_phone),''),
    whatsapp=nullif(trim(p_whatsapp),''), description=nullif(trim(p_description),''),
    primary_objective=nullif(trim(p_primary_objective),''), audience_scope=nullif(trim(p_audience_scope),''),
    monthly_budget_sle=p_monthly_budget_sle,
    monthly_budget=case when p_monthly_budget_sle is null then null else 'SLE ' || p_monthly_budget_sle::text end,
    subscriber_details=coalesce(p_subscriber_details,'{}'::jsonb), updated_at=now()
  where id=p_org_id returning * into v_org;

  if v_org.subscriber_type = 'viewer' then
    insert into public.supplier_profiles (org_id,trading_name,registration_number,description,website,geographic_coverage)
    values (v_org.id,v_org.name,nullif(v_org.subscriber_details->>'registration_number',''),v_org.description,v_org.website,nullif(v_org.subscriber_details->>'geographic_coverage',''))
    on conflict (org_id) do update set trading_name=excluded.trading_name,
      registration_number=excluded.registration_number,description=excluded.description,
      website=excluded.website,geographic_coverage=excluded.geographic_coverage,updated_at=now();
  elsif v_org.subscriber_type = 'publisher' then
    insert into public.buyer_profiles (org_id,description,website)
    values (v_org.id,v_org.description,v_org.website)
    on conflict (org_id) do update set description=excluded.description,website=excluded.website,updated_at=now();
  end if;
  return v_org;
end;
$$;

revoke all on function public.update_subscriber_organization_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,numeric,jsonb
) from public, anon;
grant execute on function public.update_subscriber_organization_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,numeric,jsonb
) to authenticated;

commit;
