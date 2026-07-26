-- Enhancement 3, phase 1: sellable advert packages, checkout records,
-- payment verification, invoices/receipts, coupons and disputes.

begin;

create table if not exists public.advert_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  placement text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.advert_package_prices (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.advert_packages(id) on delete cascade,
  billing_period text not null check (billing_period in ('daily', 'weekly', 'monthly')),
  amount numeric(14,2) not null check (amount >= 0),
  currency_code text not null default 'SLE' check (currency_code ~ '^[A-Z]{3}$'),
  unique(package_id, billing_period, currency_code)
);

create table if not exists public.advert_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  currency_code text not null default 'SLE',
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.advert_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('AD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  org_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid references public.ad_campaigns(id) on delete set null,
  package_id uuid not null references public.advert_packages(id) on delete restrict,
  billing_period text not null check (billing_period in ('daily', 'weekly', 'monthly')),
  quantity integer not null default 1 check (quantity > 0),
  currency_code text not null default 'SLE',
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  coupon_id uuid references public.advert_coupons(id) on delete set null,
  payment_method text not null check (payment_method in ('orange_money', 'afrimoney', 'mobile_money', 'card', 'agency_credit')),
  payment_reference text,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'payment_review', 'paid', 'cancelled', 'refunded', 'disputed')),
  invoice_number text not null unique default ('INV-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  receipt_number text unique,
  paid_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.advert_payment_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.advert_orders(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'rejected')),
  resolution text,
  created_by uuid not null references auth.users(id) on delete restrict,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists advert_orders_org_created_idx on public.advert_orders(org_id, created_at desc);
create index if not exists advert_orders_status_idx on public.advert_orders(status);

alter table public.advert_packages enable row level security;
alter table public.advert_package_prices enable row level security;
alter table public.advert_coupons enable row level security;
alter table public.advert_orders enable row level security;
alter table public.advert_payment_disputes enable row level security;

create policy advert_packages_read on public.advert_packages for select to authenticated using (is_active or (select public.is_platform_admin()));
create policy advert_package_prices_read on public.advert_package_prices for select to authenticated using (true);
create policy advert_packages_admin on public.advert_packages for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy advert_package_prices_admin on public.advert_package_prices for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy advert_coupons_admin on public.advert_coupons for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy advert_orders_org_read on public.advert_orders for select to authenticated using ((select public.is_org_member(org_id)) or (select public.is_platform_admin()));
create policy advert_orders_org_update_reference on public.advert_orders for update to authenticated
  using ((select public.is_org_member(org_id)) and status = 'pending_payment')
  with check ((select public.is_org_member(org_id)) and status = 'payment_review');
create policy advert_orders_admin on public.advert_orders for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy advert_disputes_org_read on public.advert_payment_disputes for select to authenticated using ((select public.is_org_member(org_id)) or (select public.is_platform_admin()));
create policy advert_disputes_org_create on public.advert_payment_disputes for insert to authenticated with check (created_by = (select auth.uid()) and (select public.is_org_member(org_id)));
create policy advert_disputes_admin on public.advert_payment_disputes for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

grant select on public.advert_packages, public.advert_package_prices to authenticated;
grant select, update on public.advert_orders to authenticated;
grant select, insert on public.advert_payment_disputes to authenticated;
grant all on public.advert_packages, public.advert_package_prices, public.advert_coupons, public.advert_orders, public.advert_payment_disputes to service_role;

insert into public.advert_packages(code, name, description, placement, sort_order) values
  ('free', 'Free', 'A basic Manohub listing for organisations testing advertising.', 'standard', 10),
  ('featured', 'Featured', 'Priority placement in advert feeds and category pages.', 'featured', 20),
  ('premium', 'Premium', 'Higher-frequency placement with campaign performance reporting.', 'premium', 30),
  ('homepage_spotlight', 'Homepage Spotlight', 'Top-tier placement in the Manohub homepage marquee.', 'homepage', 40)
on conflict (code) do update set name=excluded.name, description=excluded.description, placement=excluded.placement, sort_order=excluded.sort_order;

insert into public.advert_package_prices(package_id, billing_period, amount, currency_code)
select p.id, x.period, x.amount, 'SLE'
from public.advert_packages p
join (values
  ('free','daily',0::numeric), ('free','weekly',0), ('free','monthly',0),
  ('featured','daily',150), ('featured','weekly',750), ('featured','monthly',2500),
  ('premium','daily',300), ('premium','weekly',1500), ('premium','monthly',5000),
  ('homepage_spotlight','daily',750), ('homepage_spotlight','weekly',3500), ('homepage_spotlight','monthly',12000)
) as x(code, period, amount) on x.code=p.code
on conflict(package_id, billing_period, currency_code) do update set amount=excluded.amount;

create or replace function public.create_advert_order(
  p_org_id uuid,
  p_campaign_id uuid,
  p_package_id uuid,
  p_billing_period text,
  p_payment_method text,
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  price_row public.advert_package_prices%rowtype;
  new_order_id uuid;
begin
  if auth.uid() is null or not public.is_org_member(p_org_id) then
    raise exception 'Organization access required';
  end if;
  if p_campaign_id is not null and not exists (
    select 1 from public.ad_campaigns where id=p_campaign_id and org_id=p_org_id
  ) then
    raise exception 'Campaign does not belong to this organization';
  end if;
  if p_payment_method not in ('orange_money','afrimoney','mobile_money','card','agency_credit') then
    raise exception 'Unsupported payment method';
  end if;
  select pp.* into price_row
  from public.advert_package_prices pp
  join public.advert_packages p on p.id=pp.package_id
  where pp.package_id=p_package_id and pp.billing_period=p_billing_period and p.is_active
  limit 1;
  if price_row.id is null then raise exception 'Package price not found'; end if;
  if price_row.amount > 0 and nullif(trim(p_payment_reference),'') is null then
    raise exception 'Payment reference required';
  end if;
  insert into public.advert_orders (
    org_id, campaign_id, package_id, billing_period, currency_code, subtotal,
    total_amount, payment_method, payment_reference, status, created_by
  ) values (
    p_org_id, p_campaign_id, p_package_id, p_billing_period, price_row.currency_code,
    price_row.amount, price_row.amount, p_payment_method, nullif(trim(p_payment_reference),''),
    'payment_review', auth.uid()
  ) returning id into new_order_id;
  return new_order_id;
end;
$function$;

revoke all on function public.create_advert_order(uuid,uuid,uuid,text,text,text) from public, anon;
grant execute on function public.create_advert_order(uuid,uuid,uuid,text,text,text) to authenticated, service_role;

commit;
