insert into public.plans (id, code, name, description, monthly_price, annual_price, currency_code, is_active, sort_order)
values (
  'cf7afebf-ebc8-49c4-b809-a885f42c6b04',
  'advertiser',
  'Business Advertiser',
  'Submit advertising requests and monitor campaign delivery and performance.',
  null,
  null,
  'SLE',
  true,
  4
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  sort_order = excluded.sort_order;

update public.plans set sort_order = 5 where code = 'enterprise' and sort_order <= 4;

insert into public.plan_features (plan_id, feature_key, feature_label, limit_value)
select p.id, values_to_add.feature_key, values_to_add.feature_label, values_to_add.limit_value
from public.plans p
cross join (values
  ('business_advertising', 'Business Advertising Requests', 1),
  ('tender_alerts_and_details', 'Tender Detail Access & Alerts', 0),
  ('tender_publishing', 'Publish Tenders', 0),
  ('max_team_members', 'Team Members', 3),
  ('max_saved_searches', 'Saved Searches', 3),
  ('data_export', 'Data Exports', 0)
) as values_to_add(feature_key, feature_label, limit_value)
where p.code = 'advertiser'
  and not exists (
    select 1 from public.plan_features existing
    where existing.plan_id = p.id and existing.feature_key = values_to_add.feature_key
  );

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

  select public.create_organization(org_name, org_type, org_country, org_district, org_primary_objective, org_monthly_budget)
  into new_org;

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
