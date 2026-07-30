-- Enhancement 2, phase 1: advertiser campaign model, permissions, and wizard.
-- Existing live campaigns remain valid; new self-service campaigns begin as drafts.
--
-- Wrapped in a transaction so a partial failure cannot leave the campaign
-- schema half-migrated.

begin;

alter table public.ad_campaigns
  add column if not exists description text not null default '',
  add column if not exists objective text not null default 'awareness',
  add column if not exists total_budget numeric(14, 2),
  add column if not exists daily_budget numeric(14, 2),
  add column if not exists currency_code text not null default 'SLE',
  add column if not exists location_targets text[] not null default '{}'::text[],
  add column if not exists category_targets text[] not null default '{}'::text[],
  add column if not exists device_targets text[] not null default '{}'::text[],
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;

alter table public.ad_campaigns
  alter column status set default 'draft';

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_status_check,
  add constraint ad_campaigns_status_check
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'active', 'paused', 'completed')),
  add constraint ad_campaigns_objective_check
    check (objective in ('awareness', 'traffic', 'leads', 'sales')),
  add constraint ad_campaigns_budget_check
    check (
      (total_budget is null or total_budget >= 0)
      and (daily_budget is null or daily_budget >= 0)
      and (total_budget is null or daily_budget is null or daily_budget <= total_budget)
    ),
  add constraint ad_campaigns_date_check
    check (start_date is null or end_date is null or end_date >= start_date),
  add constraint ad_campaigns_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  add constraint ad_campaigns_device_targets_check
    check (device_targets <@ array['mobile', 'desktop', 'tablet']::text[]);

create index if not exists ad_campaigns_status_idx
  on public.ad_campaigns (status);
create index if not exists ad_campaigns_schedule_idx
  on public.ad_campaigns (start_date, end_date);
create index if not exists ad_campaigns_reviewed_by_idx
  on public.ad_campaigns (reviewed_by);

alter table public.ad_campaigns enable row level security;

revoke all on table public.ad_campaigns from anon;
revoke all on table public.ad_campaigns from authenticated;
grant select, insert, update, delete on table public.ad_campaigns to authenticated;
grant all on table public.ad_campaigns to service_role;

drop policy if exists ad_campaigns_admin_all on public.ad_campaigns;
drop policy if exists ad_campaigns_org_read on public.ad_campaigns;
drop policy if exists ad_campaigns_org_create on public.ad_campaigns;
drop policy if exists ad_campaigns_org_update_drafts on public.ad_campaigns;
drop policy if exists ad_campaigns_org_delete_drafts on public.ad_campaigns;

create policy ad_campaigns_admin_all
  on public.ad_campaigns
  for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create policy ad_campaigns_org_read
  on public.ad_campaigns
  for select
  to authenticated
  using (
    org_id is not null
    and (select public.is_org_member(org_id))
    and (select public.org_has_feature(org_id, 'business_advertising'))
  );

create policy ad_campaigns_org_create
  on public.ad_campaigns
  for insert
  to authenticated
  with check (
    org_id is not null
    and created_by = (select auth.uid())
    and (select public.is_org_member(org_id))
    and (select public.org_has_feature(org_id, 'business_advertising'))
    and status in ('draft', 'submitted')
    and reviewed_by is null
    and approved_at is null
  );

create policy ad_campaigns_org_update_drafts
  on public.ad_campaigns
  for update
  to authenticated
  using (
    org_id is not null
    and (select public.is_org_member(org_id))
    and (select public.org_has_feature(org_id, 'business_advertising'))
    and status in ('draft', 'rejected')
  )
  with check (
    org_id is not null
    and (select public.is_org_member(org_id))
    and (select public.org_has_feature(org_id, 'business_advertising'))
    and status in ('draft', 'submitted')
    and reviewed_by is null
    and approved_at is null
  );

create policy ad_campaigns_org_delete_drafts
  on public.ad_campaigns
  for delete
  to authenticated
  using (
    org_id is not null
    and (select public.is_org_member(org_id))
    and (select public.org_has_feature(org_id, 'business_advertising'))
    and status in ('draft', 'rejected')
  );

commit;
