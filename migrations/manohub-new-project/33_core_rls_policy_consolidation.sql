-- Consolidate core subscription and supplier RLS policies by role and command.
-- Apply after 32_private_feature_helper.sql.

begin;

-- Remove broad Data API privileges before granting only required operations.
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.supplier_profiles from anon, authenticated;
revoke all on table public.supplier_sectors from anon, authenticated;

grant select, insert, update, delete on table public.subscriptions to authenticated;
grant select on table public.supplier_profiles to anon;
grant select, insert, update, delete on table public.supplier_profiles to authenticated;
grant select on table public.supplier_sectors to anon;
grant select, insert, update, delete on table public.supplier_sectors to authenticated;

-- Subscription requests: members can request, read and revise pending requests;
-- platform administrators can review, activate, cancel or remove any request.
drop policy if exists "Admins manage all subscriptions" on public.subscriptions;
drop policy if exists "Org members can request a subscription" on public.subscriptions;
drop policy if exists "Org members can view their subscription" on public.subscriptions;
drop policy if exists "Org members can update their pending subscription" on public.subscriptions;

create policy subscriptions_read
on public.subscriptions
for select
to authenticated
using (
  (select public.is_platform_admin())
  or (select public.is_org_member(org_id))
);

create policy subscriptions_create
on public.subscriptions
for insert
to authenticated
with check (
  (select public.is_platform_admin())
  or (
    (select public.is_org_member(org_id))
    and status = 'pending'
    and approved_by is null
    and approved_at is null
  )
);

create policy subscriptions_update
on public.subscriptions
for update
to authenticated
using (
  (select public.is_platform_admin())
  or (
    (select public.is_org_member(org_id))
    and status = 'pending'
  )
)
with check (
  (select public.is_platform_admin())
  or (select public.is_org_member(org_id))
);

create policy subscriptions_delete
on public.subscriptions
for delete
to authenticated
using ((select public.is_platform_admin()));

-- Enforce field ownership at the database boundary. Organization members may
-- edit notes or cancel a pending request, but cannot approve, reassign or
-- alter the commercial terms of a subscription.
create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if (select public.is_platform_admin()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.current_period_start := null;
    new.current_period_end := null;
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  new.org_id := old.org_id;
  new.plan_id := old.plan_id;
  new.billing_cycle := old.billing_cycle;
  new.payment_method := old.payment_method;
  new.current_period_start := old.current_period_start;
  new.current_period_end := old.current_period_end;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;

  if old.status = 'pending' and new.status in ('pending', 'cancelled') then
    return new;
  end if;

  new.status := old.status;
  return new;
end;
$function$;

revoke all on function public.protect_subscription_fields() from public, anon, authenticated;
grant execute on function public.protect_subscription_fields() to service_role;

-- Supplier profiles: anonymous users see public rows; signed-in users see
-- public rows plus their own organization and platform administration views.
drop policy if exists "Anyone can view public supplier profiles" on public.supplier_profiles;
drop policy if exists "Org members manage their supplier profile" on public.supplier_profiles;

create policy supplier_profiles_anon_read
on public.supplier_profiles
for select
to anon
using (is_public);

create policy supplier_profiles_authenticated_read
on public.supplier_profiles
for select
to authenticated
using (
  is_public
  or (select public.is_org_member(org_id))
  or (select public.is_platform_admin())
);

create policy supplier_profiles_member_create
on public.supplier_profiles
for insert
to authenticated
with check ((select public.is_org_member(org_id)));

create policy supplier_profiles_member_update
on public.supplier_profiles
for update
to authenticated
using ((select public.is_org_member(org_id)))
with check ((select public.is_org_member(org_id)));

create policy supplier_profiles_member_delete
on public.supplier_profiles
for delete
to authenticated
using ((select public.is_org_member(org_id)));

-- Supplier sectors follow profile visibility for reads and organization
-- membership for writes.
drop policy if exists "Anyone can view supplier sectors of visible profiles" on public.supplier_sectors;
drop policy if exists "Org members manage their supplier sectors" on public.supplier_sectors;

create policy supplier_sectors_anon_read
on public.supplier_sectors
for select
to anon
using (
  exists (
    select 1
    from public.supplier_profiles sp
    where sp.org_id = supplier_sectors.org_id
      and sp.is_public
  )
);

create policy supplier_sectors_authenticated_read
on public.supplier_sectors
for select
to authenticated
using (
  (select public.is_org_member(org_id))
  or (select public.is_platform_admin())
  or exists (
    select 1
    from public.supplier_profiles sp
    where sp.org_id = supplier_sectors.org_id
      and sp.is_public
  )
);

create policy supplier_sectors_member_create
on public.supplier_sectors
for insert
to authenticated
with check ((select public.is_org_member(org_id)));

create policy supplier_sectors_member_update
on public.supplier_sectors
for update
to authenticated
using ((select public.is_org_member(org_id)))
with check ((select public.is_org_member(org_id)));

create policy supplier_sectors_member_delete
on public.supplier_sectors
for delete
to authenticated
using ((select public.is_org_member(org_id)));

commit;
