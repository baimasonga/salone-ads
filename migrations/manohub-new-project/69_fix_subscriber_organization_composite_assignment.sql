create or replace function public.create_subscriber_organization(
  org_name text,
  org_type text,
  org_country text,
  org_district text,
  org_primary_objective text,
  org_monthly_budget text,
  subscriber_type text
)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_org public.organizations;
  selected_type text := lower(coalesce(subscriber_type, 'free'));
  selected_plan_id uuid;
  selected_plan_code text;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if selected_type not in ('free', 'viewer', 'publisher', 'advertiser') then
    raise exception 'Unknown subscriber type';
  end if;

  -- A function returning a composite row must be expanded before assigning
  -- it to a row variable. Selecting it as one scalar attempts to cast the
  -- complete `(id,name,...)` record into the first UUID column.
  select *
  into new_org
  from public.create_organization(org_name, org_type, org_country, org_district, org_primary_objective, org_monthly_budget);

  selected_plan_code := case selected_type
    when 'viewer' then 'professional'
    when 'publisher' then 'business'
    when 'advertiser' then 'advertiser'
    else 'free'
  end;

  if selected_plan_code <> 'free' then
    select id into selected_plan_id from public.plans where code = selected_plan_code and is_active limit 1;
    if selected_plan_id is null then raise exception 'Selected subscription plan is unavailable'; end if;
    insert into public.subscriptions (org_id, plan_id, status, billing_cycle, payment_method, notes)
    values (new_org.id, selected_plan_id, 'pending', 'monthly', 'manual_bank_transfer', 'Requested during registration');
  end if;

  return new_org;
end;
$$;

revoke all on function public.create_subscriber_organization(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_subscriber_organization(text, text, text, text, text, text, text) to authenticated;
