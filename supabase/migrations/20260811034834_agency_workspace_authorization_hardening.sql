-- Keep agency relationships client-controlled and make approval evidence server-owned.
begin;

alter table public.agency_profiles enable row level security;
alter table public.agency_clients enable row level security;
alter table public.agency_approval_requests enable row level security;
alter table public.agency_bulk_uploads enable row level security;

revoke all on table public.agency_profiles from anon;
revoke all on table public.agency_clients from anon;
revoke all on table public.agency_approval_requests from anon;
revoke all on table public.agency_bulk_uploads from anon;

create or replace function private.guard_agency_client_activation()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending'
      or new.approved_by is not null
      or new.approved_at is not null
      or new.report_access_enabled
      or new.permissions <> array['campaigns_read','reports_read']::text[] then
      raise exception 'Agency relationships must begin as an unapproved pending request';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.agency_org_id is distinct from old.agency_org_id
    or new.client_org_id is distinct from old.client_org_id
    or new.invited_by is distinct from old.invited_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Agency relationship identity is immutable';
  end if;

  if not public.is_org_member(old.client_org_id) and not public.is_platform_admin() then
    raise exception 'Only the client organisation can manage delegated agency access';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('active','ended'))
    or (old.status = 'active' and new.status in ('suspended','ended'))
    or (old.status = 'suspended' and new.status in ('active','ended'))
  ) then
    raise exception 'Invalid agency relationship transition from % to %', old.status, new.status;
  end if;

  if new.status = 'active' and old.status <> 'active' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at then
    raise exception 'Agency approval evidence is server-owned';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_agency_client_activation() from public, anon, authenticated;
drop trigger if exists guard_agency_client_activation on public.agency_clients;
create trigger guard_agency_client_activation
before insert or update on public.agency_clients
for each row execute function private.guard_agency_client_activation();

create or replace function private.guard_agency_approval_decision()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public'
as $function$
declare
  v_client_org_id uuid;
begin
  select ac.client_org_id
    into v_client_org_id
    from public.agency_clients ac
   where ac.id = new.agency_client_id;

  if tg_op = 'INSERT' then
    if new.status <> 'pending'
      or new.decided_by is not null
      or new.decided_at is not null
      or new.decision_note is not null then
      raise exception 'Agency approvals must begin pending without decision evidence';
    end if;
    if new.campaign_id is not null and not exists (
      select 1 from public.ad_campaigns c
       where c.id = new.campaign_id and c.org_id = v_client_org_id
    ) then
      raise exception 'Campaign does not belong to the connected client';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.agency_client_id is distinct from old.agency_client_id
    or new.campaign_id is distinct from old.campaign_id
    or new.request_type is distinct from old.request_type
    or new.title is distinct from old.title
    or new.details is distinct from old.details
    or new.requested_by is distinct from old.requested_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Agency approval request identity and content are immutable';
  end if;

  if old.status <> 'pending' then
    raise exception 'Agency approval decisions are immutable';
  end if;
  if new.status not in ('approved','changes_requested','cancelled') then
    raise exception 'Invalid agency approval decision';
  end if;
  if new.status = 'approved'
    and new.request_type in ('campaign_submit','creative_publish')
    and not public.org_has_feature(v_client_org_id, 'business_advertising') then
    raise exception 'The client does not currently have the advertising entitlement';
  end if;

  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end;
$function$;

revoke all on function private.guard_agency_approval_decision() from public, anon, authenticated;
drop trigger if exists guard_agency_approval_decision on public.agency_approval_requests;
create trigger guard_agency_approval_decision
before insert or update on public.agency_approval_requests
for each row execute function private.guard_agency_approval_decision();

drop policy if exists agency_clients_agency_create on public.agency_clients;
create policy agency_clients_agency_create on public.agency_clients
for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and (select public.is_org_member(agency_org_id))
  and status = 'pending'
  and approved_by is null
  and approved_at is null
  and not report_access_enabled
  and permissions = array['campaigns_read','reports_read']::text[]
);

drop policy if exists agency_clients_parties_update on public.agency_clients;
create policy agency_clients_client_control on public.agency_clients
for update to authenticated
using ((select public.is_org_member(client_org_id)) or (select public.is_platform_admin()))
with check ((select public.is_org_member(client_org_id)) or (select public.is_platform_admin()));

drop policy if exists agency_approvals_update on public.agency_approval_requests;
create policy agency_approvals_client_decide on public.agency_approval_requests
for update to authenticated
using (
  status = 'pending' and exists (
    select 1 from public.agency_clients ac
     where ac.id = agency_client_id
       and ((select public.is_org_member(ac.client_org_id)) or (select public.is_platform_admin()))
  )
)
with check (
  exists (
    select 1 from public.agency_clients ac
     where ac.id = agency_client_id
       and ((select public.is_org_member(ac.client_org_id)) or (select public.is_platform_admin()))
  )
);

commit;
