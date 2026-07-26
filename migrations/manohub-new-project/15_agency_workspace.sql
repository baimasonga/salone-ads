-- Enhancement 09: multi-client agency workspace with delegated permissions.
begin;

create table if not exists public.agency_profiles (
  agency_org_id uuid primary key references public.organizations(id) on delete cascade,
  trading_name text not null,
  report_brand_name text,
  report_logo_url text,
  report_primary_color text not null default '#059669',
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_clients (
  id uuid primary key default gen_random_uuid(),
  agency_org_id uuid not null references public.organizations(id) on delete cascade,
  client_org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','active','suspended','ended')),
  monthly_budget_limit numeric(14,2) check(monthly_budget_limit is null or monthly_budget_limit >= 0),
  permissions text[] not null default array['campaigns_read','reports_read']::text[],
  report_access_enabled boolean not null default false,
  invited_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(agency_org_id, client_org_id),
  check(agency_org_id <> client_org_id),
  check(permissions <@ array['campaigns_read','campaigns_write','campaigns_approve','billing_read','reports_read','reports_export']::text[])
);

create table if not exists public.agency_approval_requests (
  id uuid primary key default gen_random_uuid(),
  agency_client_id uuid not null references public.agency_clients(id) on delete cascade,
  campaign_id uuid references public.ad_campaigns(id) on delete cascade,
  request_type text not null check(request_type in ('campaign_submit','budget_change','creative_publish')),
  title text not null,
  details text not null default '',
  status text not null default 'pending' check(status in ('pending','approved','changes_requested','cancelled')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.agency_bulk_uploads (
  id uuid primary key default gen_random_uuid(),
  agency_client_id uuid not null references public.agency_clients(id) on delete cascade,
  file_name text not null,
  row_count integer not null check(row_count > 0),
  rows jsonb not null check(jsonb_typeof(rows)='array'),
  status text not null default 'draft' check(status in ('draft','review','processed','rejected')),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists agency_clients_agency_idx on public.agency_clients(agency_org_id,status);
create index if not exists agency_clients_client_idx on public.agency_clients(client_org_id,status);
create index if not exists agency_approvals_client_status_idx on public.agency_approval_requests(agency_client_id,status);

create or replace function private.guard_agency_client_activation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.status is distinct from old.status and new.status='active'
    and not public.is_org_member(old.client_org_id) and not public.is_platform_admin() then
    raise exception 'Only the client organisation can approve agency access';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_agency_client_activation() from public,anon,authenticated;
drop trigger if exists guard_agency_client_activation on public.agency_clients;
create trigger guard_agency_client_activation before update on public.agency_clients
for each row execute function private.guard_agency_client_activation();

alter table public.agency_profiles enable row level security;
alter table public.agency_clients enable row level security;
alter table public.agency_approval_requests enable row level security;
alter table public.agency_bulk_uploads enable row level security;

create policy agency_profiles_members on public.agency_profiles for all to authenticated
  using ((select public.is_org_member(agency_org_id)) or (select public.is_platform_admin()))
  with check ((select public.is_org_member(agency_org_id)) or (select public.is_platform_admin()));
create policy agency_clients_parties_read on public.agency_clients for select to authenticated
  using ((select public.is_org_member(agency_org_id)) or (select public.is_org_member(client_org_id)) or (select public.is_platform_admin()));
create policy agency_clients_agency_create on public.agency_clients for insert to authenticated
  with check (invited_by=(select auth.uid()) and (select public.is_org_member(agency_org_id)));
create policy agency_clients_parties_update on public.agency_clients for update to authenticated
  using ((select public.is_org_member(agency_org_id)) or (select public.is_org_member(client_org_id)) or (select public.is_platform_admin()))
  with check ((select public.is_org_member(agency_org_id)) or (select public.is_org_member(client_org_id)) or (select public.is_platform_admin()));
create policy agency_approvals_parties on public.agency_approval_requests for select to authenticated using (
  exists(select 1 from public.agency_clients ac where ac.id=agency_client_id and
    ((select public.is_org_member(ac.agency_org_id)) or (select public.is_org_member(ac.client_org_id)) or (select public.is_platform_admin())))
);
create policy agency_approvals_create on public.agency_approval_requests for insert to authenticated with check (
  requested_by=(select auth.uid()) and exists(select 1 from public.agency_clients ac where ac.id=agency_client_id and ac.status='active' and (select public.is_org_member(ac.agency_org_id)))
);
create policy agency_approvals_update on public.agency_approval_requests for update to authenticated
  using (exists(select 1 from public.agency_clients ac where ac.id=agency_client_id and ((select public.is_org_member(ac.client_org_id)) or (select public.is_platform_admin()))))
  with check (exists(select 1 from public.agency_clients ac where ac.id=agency_client_id and ((select public.is_org_member(ac.client_org_id)) or (select public.is_platform_admin()))));
create policy agency_bulk_parties on public.agency_bulk_uploads for select to authenticated using (
  exists(select 1 from public.agency_clients ac where ac.id=agency_client_id and
    ((select public.is_org_member(ac.agency_org_id)) or (select public.is_org_member(ac.client_org_id)) or (select public.is_platform_admin())))
);
create policy agency_bulk_create on public.agency_bulk_uploads for insert to authenticated with check (
  uploaded_by=(select auth.uid()) and exists(select 1 from public.agency_clients ac where ac.id=agency_client_id and ac.status='active' and (select public.is_org_member(ac.agency_org_id)))
);

create policy ad_campaigns_agency_read on public.ad_campaigns for select to authenticated using (
  exists(select 1 from public.agency_clients ac where ac.client_org_id=ad_campaigns.org_id and ac.status='active'
    and (select public.is_org_member(ac.agency_org_id))
    and ac.permissions && array['campaigns_read','campaigns_write','reports_read']::text[])
);
create policy ad_campaigns_agency_write on public.ad_campaigns for update to authenticated
  using (status in ('draft','rejected') and exists(select 1 from public.agency_clients ac where ac.client_org_id=ad_campaigns.org_id and ac.status='active'
    and (select public.is_org_member(ac.agency_org_id)) and 'campaigns_write'=any(ac.permissions)))
  with check (status in ('draft','submitted') and exists(select 1 from public.agency_clients ac where ac.client_org_id=ad_campaigns.org_id and ac.status='active'
    and (select public.is_org_member(ac.agency_org_id)) and 'campaigns_write'=any(ac.permissions)));
create policy advert_orders_agency_billing_read on public.advert_orders for select to authenticated using (
  exists(select 1 from public.agency_clients ac where ac.client_org_id=advert_orders.org_id and ac.status='active'
    and (select public.is_org_member(ac.agency_org_id)) and 'billing_read'=any(ac.permissions))
);
create policy adverts_agency_reports_read on public.adverts for select to authenticated using (
  exists(select 1 from public.agency_clients ac join public.ad_campaigns c on c.org_id=ac.client_org_id
    where c.id=adverts.campaign_id and ac.status='active' and ac.report_access_enabled
      and (select public.is_org_member(ac.agency_org_id)) and 'reports_read'=any(ac.permissions))
);

grant select,insert,update on public.agency_profiles,public.agency_clients,public.agency_approval_requests,public.agency_bulk_uploads to authenticated;
grant all on public.agency_profiles,public.agency_clients,public.agency_approval_requests,public.agency_bulk_uploads to service_role;
commit;
