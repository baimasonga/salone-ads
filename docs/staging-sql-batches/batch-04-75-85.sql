-- HYDERRA STAGING ONLY: project gknewzlxndmummwynuoa
-- Batch 4 of 5. Requires migrations through 74.
-- Original SQL follows unchanged; transactions are preserved.
-- On any error STOP. Earlier migrations may have committed.


-- ===== START 75_platform_staff_access.sql =====
-- Platform staff roles, lifecycle controls and invitation audit foundation.

begin;

create table if not exists public.platform_staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','administrator','finance','editorial','support','auditor')),
  status text not null default 'invited' check (status in ('invited','active','suspended','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_staff_email_unique_idx
  on public.platform_staff_members (lower(email));
create index if not exists platform_staff_role_status_idx
  on public.platform_staff_members (role,status);

alter table public.platform_staff_members enable row level security;
revoke all on public.platform_staff_members from public,anon,authenticated;

create or replace function private.current_platform_staff_role()
returns text language sql stable security definer set search_path='' as $$
  select s.role from public.platform_staff_members s
  where s.user_id=(select auth.uid()) and s.status in ('invited','active')
$$;
revoke all on function private.current_platform_staff_role() from public,anon,authenticated;

-- Preserve existing platform-owner behaviour while moving authorization to a
-- dedicated staff registry. The legacy profile flag remains a safe fallback
-- during rollout only.
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    (select s.role in ('owner','administrator')
     from public.platform_staff_members s
     where s.user_id=(select auth.uid()) and s.status in ('invited','active')),
    (select p.platform_role='admin' from public.profiles p where p.id=(select auth.uid())),
    false
  )
$$;
revoke all on function private.is_platform_admin() from public,anon,authenticated;

create or replace function public.get_my_platform_staff_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object('role',s.role,'status',s.status,'email',s.email)
    into result from public.platform_staff_members s where s.user_id=(select auth.uid());
  return coalesce(result,'null'::jsonb);
end;
$$;
revoke all on function public.get_my_platform_staff_access() from public,anon;
grant execute on function public.get_my_platform_staff_access() to authenticated;

create or replace function public.admin_list_platform_staff()
returns table(user_id uuid,email text,full_name text,role text,status text,invited_at timestamptz,
  accepted_at timestamptz,suspended_at timestamptz,suspension_reason text,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  return query select s.user_id,s.email,p.full_name,s.role,s.status,s.invited_at,
    s.accepted_at,s.suspended_at,s.suspension_reason,s.updated_at
  from public.platform_staff_members s left join public.profiles p on p.id=s.user_id
  order by case s.role when 'owner' then 0 when 'administrator' then 1 else 2 end,s.email;
end;
$$;
revoke all on function public.admin_list_platform_staff() from public,anon;
grant execute on function public.admin_list_platform_staff() to authenticated;

create or replace function public.admin_update_platform_staff(
  p_user_id uuid,p_action text,p_role text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; target public.platform_staff_members;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  actor_role:=private.current_platform_staff_role();
  select * into target from public.platform_staff_members where user_id=p_user_id for update;
  if not found then raise exception 'Staff member not found'; end if;
  if target.role='owner' and actor_role<>'owner' then raise exception 'Only the owner can manage owner access'; end if;
  if p_user_id=(select auth.uid()) and p_action in ('suspend','revoke') then raise exception 'You cannot remove your own access'; end if;
  if p_action='change_role' then
    if p_role not in ('administrator','finance','editorial','support','auditor') then raise exception 'Invalid staff role'; end if;
    if target.role='owner' then raise exception 'Owner access cannot be reassigned here'; end if;
    update public.platform_staff_members set role=p_role,updated_at=now() where user_id=p_user_id;
  elsif p_action='suspend' then
    if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A suspension reason is required'; end if;
    update public.platform_staff_members set status='suspended',suspended_at=now(),suspension_reason=trim(p_reason),updated_at=now() where user_id=p_user_id;
    delete from auth.sessions where user_id=p_user_id;
  elsif p_action='reactivate' then
    update public.platform_staff_members set status='active',accepted_at=coalesce(accepted_at,now()),suspended_at=null,suspension_reason=null,updated_at=now() where user_id=p_user_id;
  elsif p_action='revoke' then
    update public.platform_staff_members set status='revoked',suspended_at=now(),suspension_reason=nullif(trim(coalesce(p_reason,'')),''),updated_at=now() where user_id=p_user_id;
    delete from auth.sessions where user_id=p_user_id;
  else raise exception 'Invalid staff action'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),'platform_staff.'||p_action,'platform_staff',p_user_id::text,
    jsonb_build_object('previous_role',target.role,'new_role',p_role,'reason',p_reason));
  return jsonb_build_object('userId',p_user_id,'action',p_action);
end;
$$;
revoke all on function public.admin_update_platform_staff(uuid,text,text,text) from public,anon;
grant execute on function public.admin_update_platform_staff(uuid,text,text,text) to authenticated;

-- Quantix Sierra Leone is the platform owner. This is idempotent and does not
-- alter the user's subscriber organisations.
insert into public.platform_staff_members(user_id,email,role,status,accepted_at)
select u.id,lower(u.email),'owner','active',now() from auth.users u
where lower(u.email)='mabangura@quantixsl.com'
on conflict(user_id) do update set role='owner',status='active',email=excluded.email,updated_at=now();

commit;

-- ===== END 75_platform_staff_access.sql =====

-- ===== START 76_platform_staff_rls_explicit_deny.sql =====
-- The staff registry is only reachable through guarded SECURITY DEFINER RPCs.
-- Keep an explicit deny policy so direct PostgREST access remains closed and
-- the database adviser can distinguish this from an unfinished RLS setup.

begin;

drop policy if exists platform_staff_direct_access_denied on public.platform_staff_members;
create policy platform_staff_direct_access_denied on public.platform_staff_members
  for all to authenticated using (false) with check (false);

commit;

-- ===== END 76_platform_staff_rls_explicit_deny.sql =====

-- ===== START 77_platform_staff_legacy_fallback_hardening.sql =====
-- An explicit staff record is authoritative. Never allow a suspended or
-- revoked record to regain access through the legacy profiles flag.

begin;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when exists (
      select 1 from public.platform_staff_members s where s.user_id=(select auth.uid())
    ) then exists (
      select 1 from public.platform_staff_members s
      where s.user_id=(select auth.uid())
        and s.status in ('invited','active')
        and s.role in ('owner','administrator')
    )
    else coalesce((
      select p.platform_role='admin' from public.profiles p where p.id=(select auth.uid())
    ),false)
  end
$$;
revoke all on function private.is_platform_admin() from public,anon,authenticated;

commit;

-- ===== END 77_platform_staff_legacy_fallback_hardening.sql =====

-- ===== START 78_platform_staff_capability_enforcement.sql =====
-- Enforce department-scoped platform access without broadening platform admin.

begin;

create or replace function private.platform_staff_has_capability(p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((
    select case
      when s.role in ('owner','administrator') then true
      when s.role='finance' then p_capability in ('finance:read','finance:manage')
      when s.role='editorial' then p_capability='editorial:manage'
      when s.role='support' then p_capability in ('support:read','support:manage')
      when s.role='auditor' then p_capability in ('audit:read','analytics:read')
      else false end
    from public.platform_staff_members s
    where s.user_id=(select auth.uid()) and s.status in ('invited','active')
  ),false)
$$;
revoke all on function private.platform_staff_has_capability(text) from public,anon;
grant execute on function private.platform_staff_has_capability(text) to authenticated,service_role;

create or replace function public.has_platform_capability(p_capability text)
returns boolean language sql stable security invoker set search_path='' as $$
  select case when (select auth.uid()) is null then false
    else private.platform_staff_has_capability(p_capability) end
$$;
revoke all on function public.has_platform_capability(text) from public,anon;
grant execute on function public.has_platform_capability(text) to authenticated,service_role;

-- Activate an invited staff record as soon as Supabase confirms the account or
-- records its first successful sign-in.
create or replace function private.activate_platform_staff_on_auth_confirmation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.email_confirmed_at is not null or new.last_sign_in_at is not null) then
    update public.platform_staff_members set status='active',
      accepted_at=coalesce(accepted_at,now()),updated_at=now()
    where user_id=new.id and status='invited';
  end if;
  return new;
end;
$$;
revoke all on function private.activate_platform_staff_on_auth_confirmation() from public,anon,authenticated;
drop trigger if exists activate_platform_staff_on_auth_confirmation on auth.users;
create trigger activate_platform_staff_on_auth_confirmation
after update of email_confirmed_at,last_sign_in_at on auth.users
for each row execute function private.activate_platform_staff_on_auth_confirmation();

-- Finance can read commercial records and perform only guarded finance RPCs.
drop policy if exists commercial_invoices_read on public.commercial_invoices;
create policy commercial_invoices_read on public.commercial_invoices for select to authenticated
  using(public.has_platform_capability('finance:read') or public.is_org_member(org_id));
drop policy if exists commercial_payments_read on public.commercial_payments;
create policy commercial_payments_read on public.commercial_payments for select to authenticated
  using(public.has_platform_capability('finance:read') or public.is_org_member(org_id));
drop policy if exists commercial_ledger_read on public.commercial_ledger_entries;
create policy commercial_ledger_read on public.commercial_ledger_entries for select to authenticated
  using(public.has_platform_capability('finance:read') or public.is_org_member(org_id));
drop policy if exists commercial_lines_read on public.commercial_invoice_lines;
create policy commercial_lines_read on public.commercial_invoice_lines for select to authenticated using(exists(
  select 1 from public.commercial_invoices i where i.id=invoice_id and
    (public.has_platform_capability('finance:read') or public.is_org_member(i.org_id))));
drop policy if exists commercial_allocations_read on public.commercial_payment_allocations;
create policy commercial_allocations_read on public.commercial_payment_allocations for select to authenticated using(exists(
  select 1 from public.commercial_invoices i where i.id=invoice_id and
    (public.has_platform_capability('finance:read') or public.is_org_member(i.org_id))));
drop policy if exists commercial_credit_notes_read on public.commercial_credit_notes;
create policy commercial_credit_notes_read on public.commercial_credit_notes for select to authenticated
  using(public.has_platform_capability('finance:read') or public.is_org_member(org_id));
drop policy if exists commercial_refunds_read on public.commercial_refunds;
create policy commercial_refunds_read on public.commercial_refunds for select to authenticated
  using(public.has_platform_capability('finance:read') or public.is_org_member(org_id));

-- Replace only the authorization predicate of established, already-tested
-- finance routines; their accounting behaviour remains unchanged.
do $$
declare fn record; definition text;
begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'record_commercial_payment','issue_commercial_credit',
      'record_commercial_refund','admin_process_commercial_invoice_overdue')
  loop
    definition:=pg_get_functiondef(fn.oid);
    definition:=replace(definition,'not public.is_platform_admin()',
      'not public.has_platform_capability(''finance:manage'')');
    definition:=replace(definition,'NOT public.is_platform_admin()',
      'NOT public.has_platform_capability(''finance:manage'')');
    execute definition;
  end loop;
end $$;

-- Editorial staff inherit the CMS administrator workflow, not platform admin.
create or replace function private.cms_is_administrator()
returns boolean language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.has_platform_capability('editorial:manage') or exists (
    select 1 from public.cms_team_members member
    where member.user_id=auth.uid() and member.role='administrator')
$$;
create or replace function private.cms_is_member()
returns boolean language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.has_platform_capability('editorial:manage') or exists (
    select 1 from public.cms_team_members member where member.user_id=auth.uid())
$$;
create or replace function public.cms_current_role()
returns text language sql stable security invoker set search_path='pg_catalog','public' as $$
  select case when public.has_platform_capability('editorial:manage') then 'administrator'
    else (select member.role from public.cms_team_members member where member.user_id=auth.uid()) end
$$;

-- Support can operate the service queue, while subscriber deletion and account
-- lifecycle transitions remain restricted to owner/administrator routines.
drop policy if exists "Org members and admins can view their service requests" on public.service_requests;
create policy "Org members and admins can view their service requests" on public.service_requests
  for select to authenticated using(public.is_org_member(org_id) or public.has_platform_capability('support:read'));
drop policy if exists "Org members and admins can update service requests" on public.service_requests;
create policy "Org members and admins can update service requests" on public.service_requests
  for update to authenticated using(public.is_org_member(org_id) or public.has_platform_capability('support:manage'))
  with check(public.is_org_member(org_id) or public.has_platform_capability('support:manage'));
drop policy if exists "Admins can add any note" on public.service_request_activities;
create policy "Admins can add any note" on public.service_request_activities for insert to authenticated
  with check(public.has_platform_capability('support:manage') and author_id=(select auth.uid()));
drop policy if exists "Customer notes visible to org and admin, internal notes admin-o" on public.service_request_activities;
create policy "Customer notes visible to org and admin, internal notes admin-o" on public.service_request_activities
  for select to authenticated using(
    ((not is_internal) and exists(select 1 from public.service_requests sr where sr.id=request_id and public.is_org_member(sr.org_id)))
    or public.has_platform_capability('support:read'));

-- Auditor is strictly read-only. Finance/support also need organisation names
-- for their queues and reports, not organisation mutation rights.
drop policy if exists audit_logs_platform_admin_read on public.audit_logs;
create policy audit_logs_platform_admin_read on public.audit_logs for select to authenticated
  using(public.has_platform_capability('audit:read'));
drop policy if exists organizations_platform_staff_reference_read on public.organizations;
create policy organizations_platform_staff_reference_read on public.organizations for select to authenticated
  using(public.has_platform_capability('finance:read') or public.has_platform_capability('support:read') or public.has_platform_capability('audit:read'));

commit;

-- ===== END 78_platform_staff_capability_enforcement.sql =====

-- ===== START 79_platform_staff_advisor_hardening.sql =====
-- Resolve capability-related database adviser findings.

begin;

create index if not exists platform_staff_invited_by_idx
  on public.platform_staff_members(invited_by) where invited_by is not null;

drop policy if exists organizations_platform_staff_reference_read on public.organizations;
drop policy if exists "Members can view their orgs" on public.organizations;
create policy "Members can view their orgs" on public.organizations for select to authenticated using(
  public.is_org_member(id)
  or public.has_platform_capability('finance:read')
  or public.has_platform_capability('support:read')
  or public.has_platform_capability('audit:read')
);

commit;

-- ===== END 79_platform_staff_advisor_hardening.sql =====

-- ===== START 80_agency_workspace_authorization_hardening.sql =====
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

-- ===== END 80_agency_workspace_authorization_hardening.sql =====

-- ===== START 81_advanced_search_discovery.sql =====
-- Unified, permission-aware discovery across Manohub's existing public records.
begin;

alter table public.saved_searches
  add column if not exists search_scope text not null default 'tenders',
  add column if not exists filters jsonb not null default '{}'::jsonb;

alter table public.saved_searches
  drop constraint if exists saved_searches_search_scope_check;
alter table public.saved_searches
  add constraint saved_searches_search_scope_check
  check (search_scope in ('tenders', 'discovery'));

alter table public.saved_searches
  drop constraint if exists saved_searches_filters_object_check;
alter table public.saved_searches
  add constraint saved_searches_filters_object_check
  check (jsonb_typeof(filters) = 'object');

create index if not exists opportunities_title_trgm_idx
  on public.opportunities using gin (lower(title) gin_trgm_ops);
create index if not exists adverts_title_trgm_idx
  on public.adverts using gin (lower(title) gin_trgm_ops);
create index if not exists directory_profiles_name_trgm_idx
  on public.directory_profiles using gin (lower(business_name) gin_trgm_ops);
create index if not exists influencer_profiles_name_trgm_idx
  on public.influencer_profiles using gin (lower(display_name) gin_trgm_ops);
create index if not exists plans_name_trgm_idx
  on public.plans using gin (lower(name) gin_trgm_ops);

create or replace function public.search_discovery(
  p_query text default null,
  p_result_types text[] default null,
  p_district text default null,
  p_category text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_sort text default 'relevance',
  p_visitor_hash text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  result_type text,
  result_id uuid,
  href text,
  title text,
  summary text,
  category text,
  district text,
  published_on date,
  amount numeric,
  currency_code text,
  is_verified boolean,
  is_sponsored boolean,
  district_match boolean,
  contact_email text,
  contact_whatsapp text,
  relevance double precision,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_query text := nullif(left(btrim(coalesce(p_query, '')), 120), '');
  normalized_district text := nullif(left(btrim(coalesce(p_district, '')), 80), '');
  normalized_category text := nullif(left(btrim(coalesce(p_category, '')), 80), '');
begin
  if p_sort not in ('relevance', 'newest', 'value_high', 'value_low') then
    raise exception 'Unsupported discovery sort mode';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 5000 then
    raise exception 'Invalid discovery result window';
  end if;
  if p_min_value is not null and p_max_value is not null and p_min_value > p_max_value then
    raise exception 'Minimum value cannot exceed maximum value';
  end if;
  if p_visitor_hash is not null and p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor token';
  end if;
  if p_result_types is not null and not (p_result_types <@ array['tender','award','project','advert','service','business','influencer']::text[]) then
    raise exception 'Unsupported discovery result type';
  end if;

  return query
  with public_records as (
    select
      case when opportunity_type.code = 'procurement_plan' then 'project' else 'tender' end::text as record_type,
      opportunity.id as record_id,
      '/tenders/' || opportunity.slug as record_href,
      opportunity.title as record_title,
      coalesce(opportunity.summary, opportunity.buyer_name) as record_summary,
      coalesce(sector.name, opportunity_type.label) as record_category,
      district_row.name as record_district,
      opportunity.publication_date as record_date,
      opportunity.estimated_value as record_amount,
      opportunity.currency_code as record_currency,
      true as record_verified,
      opportunity.is_featured as record_sponsored,
      concat_ws(' ', opportunity.title, opportunity.reference_number, opportunity.buyer_name,
        opportunity.summary, opportunity.description, sector.name, district_row.name, opportunity_type.label) as search_text
    from public.opportunities opportunity
    join public.opportunity_statuses opportunity_status on opportunity_status.id = opportunity.status_id
    left join public.opportunity_types opportunity_type on opportunity_type.id = opportunity.opportunity_type_id
    left join public.sectors sector on sector.id = opportunity.sector_id
    left join public.districts district_row on district_row.id = opportunity.district_id
    where opportunity_status.code in ('published','amended','deadline_extended','closed','awarded')
      and coalesce(opportunity_type.code, '') <> 'contract_award'

    union all

    select 'award', award.id, '/tenders/' || opportunity.slug,
      opportunity.title || ' — awarded to ' || award.winning_supplier_name,
      coalesce(award.notes, opportunity.summary, opportunity.buyer_name),
      coalesce(sector.name, 'Contract award'), district_row.name, award.award_date,
      award.awarded_value, coalesce(award.currency_code, opportunity.currency_code), true, false,
      concat_ws(' ', opportunity.title, opportunity.reference_number, opportunity.buyer_name,
        award.winning_supplier_name, award.notes, sector.name, district_row.name)
    from public.opportunity_awards award
    join public.opportunities opportunity on opportunity.id = award.opportunity_id
    join public.opportunity_statuses opportunity_status on opportunity_status.id = opportunity.status_id
    left join public.sectors sector on sector.id = opportunity.sector_id
    left join public.districts district_row on district_row.id = opportunity.district_id
    where opportunity_status.code in ('published','amended','deadline_extended','closed','awarded')

    union all

    select 'advert', advert.id, '/adverts/' || advert.slug, advert.title,
      coalesce(advert.summary, advert.business_name), advert.category, null::text,
      coalesce(advert.published_at::date, advert.created_at::date), null::numeric, null::text,
      true, true, concat_ws(' ', advert.title, advert.business_name, advert.summary, advert.content, advert.category)
    from public.adverts advert
    left join public.organizations advert_org on advert_org.id = advert.org_id
    where advert.status = 'live'
      and (advert.starts_at is null or advert.starts_at <= now())
      and (advert.ends_at is null or advert.ends_at >= now())
      and coalesce(advert_org.is_demo, false) = false
      and coalesce(advert_org.status, 'active') = 'active'

    union all

    select 'service', plan.id, null::text, plan.name, plan.description, 'Manohub service', null::text,
      plan.created_at::date, plan.monthly_price, plan.currency_code, true, false,
      concat_ws(' ', plan.name, plan.description, plan.code)
    from public.plans plan
    where plan.is_active

    union all

    select 'business', business.id, null::text, business.business_name, business.description,
      business.category, coalesce(business.district, business.city), business.created_at::date,
      null::numeric, null::text, business.is_verified, false,
      concat_ws(' ', business.business_name, business.category, business.description, business.district, business.city)
    from public.directory_profiles business
    left join public.organizations business_org on business_org.id = business.claimed_by_org_id
    where business.is_verified
      and coalesce(business_org.is_demo, false) = false
      and coalesce(business_org.status, 'active') = 'active'

    union all

    select 'influencer', influencer.id, null::text, influencer.display_name,
      concat_ws(' · ', influencer.audience_size, influencer.engagement_rate),
      array_to_string(influencer.categories, ', '), coalesce(influencer.district, influencer.location),
      influencer.created_at::date, null::numeric, null::text, influencer.is_verified, false,
      concat_ws(' ', influencer.display_name, influencer.location, influencer.district,
        array_to_string(influencer.categories, ' '), array_to_string(influencer.platforms, ' '))
    from public.influencer_profiles influencer
    where influencer.is_verified
  ), filtered as (
    select record.*,
      case when normalized_query is null then 0.0
        else greatest(
          extensions.similarity(lower(record.record_title), lower(normalized_query)) * 100,
          extensions.word_similarity(lower(normalized_query), lower(record.search_text)) * 90
        )
      end
      + case when record.record_verified then 4 else 0 end
      + case when record.record_sponsored then 1 else 0 end as score
    from public_records record
    where (p_result_types is null or record.record_type = any(p_result_types))
      and (normalized_query is null
        or extensions.word_similarity(lower(normalized_query), lower(record.search_text)) >= 0.3
        or lower(record.search_text) like '%' || lower(normalized_query) || '%')
      and (normalized_district is null or lower(record.record_district) = lower(normalized_district))
      and (normalized_category is null or lower(record.record_category) like '%' || lower(normalized_category) || '%')
      and (p_date_from is null or record.record_date >= p_date_from)
      and (p_date_to is null or record.record_date <= p_date_to)
      and (p_min_value is null or record.record_amount >= p_min_value)
      and (p_max_value is null or record.record_amount <= p_max_value)
  ), measured as (
    select filtered.*, count(*) over() as measured_total
    from filtered
  )
  select measured.record_type, measured.record_id, measured.record_href, measured.record_title,
    measured.record_summary, measured.record_category, measured.record_district, measured.record_date,
    measured.record_amount, measured.record_currency, measured.record_verified, measured.record_sponsored,
    (normalized_district is not null and lower(measured.record_district) = lower(normalized_district)),
    case when auth.uid() is not null and measured.record_type = 'business' then business.email else null end,
    case when auth.uid() is not null and measured.record_type = 'business' then business.whatsapp else null end,
    measured.score, measured.measured_total
  from measured
  left join public.directory_profiles business
    on measured.record_type = 'business' and business.id = measured.record_id
  order by
    case when p_sort = 'relevance' then measured.score end desc,
    case when p_sort = 'newest' then measured.record_date end desc nulls last,
    case when p_sort = 'value_high' then measured.record_amount end desc nulls last,
    case when p_sort = 'value_low' then measured.record_amount end asc nulls last,
    measured.record_verified desc, measured.record_sponsored desc, measured.record_title
  limit p_limit offset p_offset;

end;
$$;

create or replace function public.record_discovery_search(
  p_query text,
  p_filters jsonb,
  p_sort text,
  p_result_count integer,
  p_visitor_hash text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_query text := nullif(left(btrim(coalesce(p_query, '')), 120), '');
  safe_filters jsonb := coalesce(p_filters, '{}'::jsonb) || jsonb_build_object('scope', 'discovery');
begin
  if normalized_query is null then return; end if;
  if jsonb_typeof(safe_filters) <> 'object' or pg_column_size(safe_filters) > 4096 then
    raise exception 'Invalid discovery filters';
  end if;
  if p_sort not in ('relevance', 'newest', 'value_high', 'value_low') then
    raise exception 'Unsupported discovery sort mode';
  end if;
  if p_result_count < 0 or p_result_count > 100000 then
    raise exception 'Invalid discovery result count';
  end if;
  if p_visitor_hash is not null and p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor token';
  end if;

  insert into public.procurement_search_events(user_id, visitor_hash, search_term, filters, sort_mode, result_count)
  select auth.uid(), p_visitor_hash, lower(normalized_query), safe_filters,
    case when p_sort in ('relevance', 'newest') then p_sort else 'relevance' end,
    p_result_count
  where not exists (
    select 1 from public.procurement_search_events previous
    where previous.created_at >= now() - interval '1 minute'
      and previous.user_id is not distinct from auth.uid()
      and previous.visitor_hash is not distinct from p_visitor_hash
      and previous.search_term = lower(normalized_query)
      and previous.filters = safe_filters
  );
end;
$$;

create or replace function public.search_discovery_suggestions(p_query text, p_limit integer default 8)
returns table(term text, result_type text)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select candidate.title, candidate.result_type
  from public.search_discovery(p_query, null, null, null, null, null, null, null, 'relevance', null, least(greatest(p_limit, 1), 12), 0) candidate
  order by candidate.relevance desc, candidate.title
  limit least(greatest(p_limit, 1), 12)
$$;

create or replace function public.get_discovery_trends(p_limit integer default 8)
returns table(term text, searches bigint)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select event.search_term, count(*)
  from public.procurement_search_events event
  where event.created_at >= now() - interval '30 days'
    and event.filters->>'scope' = 'discovery'
    and event.search_term is not null
  group by event.search_term
  having count(*) >= 3
  order by count(*) desc, max(event.created_at) desc, event.search_term
  limit least(greatest(p_limit, 1), 20)
$$;

revoke all on function public.search_discovery(text,text[],text,text,date,date,numeric,numeric,text,text,integer,integer) from public;
revoke all on function public.record_discovery_search(text,jsonb,text,integer,text) from public;
revoke all on function public.search_discovery_suggestions(text,integer) from public;
revoke all on function public.get_discovery_trends(integer) from public;
grant execute on function public.search_discovery(text,text[],text,text,date,date,numeric,numeric,text,text,integer,integer) to anon, authenticated, service_role;
grant execute on function public.record_discovery_search(text,jsonb,text,integer,text) to anon, authenticated, service_role;
grant execute on function public.search_discovery_suggestions(text,integer) to anon, authenticated, service_role;
grant execute on function public.get_discovery_trends(integer) to anon, authenticated, service_role;

commit;

-- ===== END 81_advanced_search_discovery.sql =====

-- ===== START 82_administrator_control_centre.sql =====
-- Administrator Control Centre: role-aware operational snapshots and audited intake controls.
begin;

create schema if not exists private;

create table if not exists private.platform_intake_controls (
  control_key text primary key check (control_key in (
    'subscriber_onboarding','procurement_submissions','advertising_orders','service_requests'
  )),
  label text not null,
  is_enabled boolean not null default true,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.platform_intake_controls enable row level security;
revoke all on table private.platform_intake_controls from public, anon, authenticated;
grant select, insert, update, delete on table private.platform_intake_controls to service_role;

insert into private.platform_intake_controls(control_key,label) values
  ('subscriber_onboarding','Subscriber onboarding'),
  ('procurement_submissions','Procurement submissions'),
  ('advertising_orders','Advertising orders'),
  ('service_requests','Service requests')
on conflict(control_key) do update set label=excluded.label;

create or replace function private.enforce_platform_intake_control()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  control text:=tg_argv[0];
  enabled boolean;
  jwt_role text:=coalesce((select auth.jwt()->>'role'),'');
begin
  if jwt_role in ('','service_role') then return new; end if;
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select c.is_enabled into enabled from private.platform_intake_controls c where c.control_key=control;
  if not coalesce(enabled,true) then
    raise exception '% is temporarily paused by Manohub operations',control using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_platform_intake_control() from public,anon,authenticated;
grant execute on function private.enforce_platform_intake_control() to service_role;

drop trigger if exists enforce_subscriber_onboarding_control on public.organizations;
create trigger enforce_subscriber_onboarding_control before insert on public.organizations
for each row execute function private.enforce_platform_intake_control('subscriber_onboarding');
drop trigger if exists enforce_procurement_submissions_control on public.opportunities;
create trigger enforce_procurement_submissions_control before insert on public.opportunities
for each row execute function private.enforce_platform_intake_control('procurement_submissions');
drop trigger if exists enforce_advertising_orders_control on public.advert_orders;
create trigger enforce_advertising_orders_control before insert on public.advert_orders
for each row execute function private.enforce_platform_intake_control('advertising_orders');
drop trigger if exists enforce_service_requests_control on public.service_requests;
create trigger enforce_service_requests_control before insert on public.service_requests
for each row execute function private.enforce_platform_intake_control('service_requests');

create or replace function public.get_administrator_control_centre_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  staff_role text;
  can_admin boolean;
  metrics jsonb:='[]'::jsonb;
  queues jsonb:='[]'::jsonb;
  risks jsonb:='[]'::jsonb;
  health jsonb:='[]'::jsonb;
  controls jsonb:='[]'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select s.role into staff_role from public.platform_staff_members s
    where s.user_id=(select auth.uid()) and s.status in ('invited','active');
  if staff_role is null then raise exception 'Platform staff access is required'; end if;
  can_admin:=staff_role in ('owner','administrator');

  if can_admin then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Genuine subscribers','value',(select count(*) from public.organizations o where not coalesce(o.is_demo,false) and coalesce(o.status,'active')<>'closed'),'format','number','href','admin-organizations'),
      jsonb_build_object('label','Active subscriptions','value',(select count(*) from public.subscriptions s join public.organizations o on o.id=s.org_id where s.status in ('trial','active','grace') and not coalesce(o.is_demo,false)),'format','number','href','admin-subscriptions'),
      jsonb_build_object('label','Cash collected','value',(select coalesce(sum(p.amount),0) from public.commercial_payments p join public.organizations o on o.id=p.org_id where not coalesce(o.is_demo,false)),'format','currency','href','admin-finance'),
      jsonb_build_object('label','Activity · 24h','value',(select count(*) from public.audit_logs a where a.created_at>=now()-interval '24 hours'),'format','number','href','admin-audit-log')
    );
  elsif staff_role='finance' then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Open invoices','value',(select count(*) from public.commercial_invoices i join public.organizations o on o.id=i.org_id where i.status in ('issued','partially_paid','overdue') and not coalesce(o.is_demo,false)),'format','number','href','admin-finance'),
      jsonb_build_object('label','Cash collected','value',(select coalesce(sum(p.amount),0) from public.commercial_payments p join public.organizations o on o.id=p.org_id where not coalesce(o.is_demo,false)),'format','currency','href','admin-finance'),
      jsonb_build_object('label','Payment reviews','value',(select count(*) from public.advert_orders a join public.organizations o on o.id=a.org_id where a.status='payment_review' and not coalesce(o.is_demo,false)),'format','number','href','admin-advert-revenue')
    );
  elsif staff_role='editorial' then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Published content','value',(select count(*) from public.cms_content c where c.status='published' and c.deleted_at is null),'format','number','href','content-cms'),
      jsonb_build_object('label','In review','value',(select count(*) from public.cms_content c where c.status='review' and c.deleted_at is null),'format','number','href','content-cms'),
      jsonb_build_object('label','Draft content','value',(select count(*) from public.cms_content c where c.status='draft' and c.deleted_at is null),'format','number','href','content-cms')
    );
  elsif staff_role='support' then
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Open service requests','value',(select count(*) from public.service_requests r join public.organizations o on o.id=r.org_id where r.status not in ('resolved','closed') and not coalesce(o.is_demo,false)),'format','number','href','admin-services'),
      jsonb_build_object('label','Unassigned requests','value',(select count(*) from public.service_requests r join public.organizations o on o.id=r.org_id where r.assigned_to is null and r.status not in ('resolved','closed') and not coalesce(o.is_demo,false)),'format','number','href','admin-services'),
      jsonb_build_object('label','Pending verification','value',(select count(*) from public.verification_requests v join public.organizations o on o.id=v.org_id where v.status in ('pending','submitted','in_review') and not coalesce(o.is_demo,false)),'format','number','href','admin-verification')
    );
  else
    metrics:=jsonb_build_array(
      jsonb_build_object('label','Audit events · 24h','value',(select count(*) from public.audit_logs a where a.created_at>=now()-interval '24 hours'),'format','number','href','admin-audit-log'),
      jsonb_build_object('label','Open incidents','value',(select count(*) from public.platform_incidents i where i.status not in ('resolved','postmortem_complete')),'format','number','href','admin-resilience'),
      jsonb_build_object('label','Failed commands · 24h','value',(select count(*) from public.backend_command_requests c where c.status='failed' and c.updated_at>=now()-interval '24 hours'),'format','number','href','admin-audit-log')
    );
  end if;

  if can_admin or staff_role in ('editorial','support') then
    queues:=jsonb_build_array(
      jsonb_build_object('label','Tender moderation','value',(select count(*) from public.opportunities o join public.opportunity_statuses s on s.id=o.status_id left join public.organizations org on org.id=o.buyer_org_id where s.code='awaiting_review' and not coalesce(org.is_demo,false)),'href','admin-tender-review'),
      jsonb_build_object('label','Verification','value',(select count(*) from public.verification_requests v join public.organizations o on o.id=v.org_id where v.status in ('pending','submitted','in_review') and not coalesce(o.is_demo,false)),'href','admin-verification'),
      jsonb_build_object('label','Subscriptions','value',(select count(*) from public.subscriptions s join public.organizations o on o.id=s.org_id where s.status in ('pending','past_due','grace') and not coalesce(o.is_demo,false)),'href','admin-subscriptions'),
      jsonb_build_object('label','Service requests','value',(select count(*) from public.service_requests r join public.organizations o on o.id=r.org_id where r.status not in ('resolved','closed') and not coalesce(o.is_demo,false)),'href','admin-services'),
      jsonb_build_object('label','Advertising','value',(select count(*) from public.advert_orders a join public.organizations o on o.id=a.org_id where a.status in ('pending_payment','payment_review','disputed') and not coalesce(o.is_demo,false)),'href','admin-advert-revenue')
    );
  end if;

  if can_admin or staff_role in ('finance','auditor') then
    risks:=jsonb_build_array(
      jsonb_build_object('label','Open payment disputes','value',(select count(*) from public.advert_payment_disputes d join public.organizations o on o.id=d.org_id where d.status in ('open','investigating') and not coalesce(o.is_demo,false)),'severity','warning','href','admin-advert-revenue'),
      jsonb_build_object('label','Measurement rejections · 24h','value',(select coalesce(sum(r.rejected_count),0) from private.measurement_rejection_rollups r where r.bucket_hour>=date_trunc('hour',now()-interval '24 hours')),'severity','warning','href','admin-analytics'),
      jsonb_build_object('label','Failed protected commands · 24h','value',(select count(*) from public.backend_command_requests c where c.status='failed' and c.updated_at>=now()-interval '24 hours'),'severity','critical','href','admin-commands')
    );
  end if;

  if can_admin or staff_role='auditor' then
    health:=jsonb_build_array(
      jsonb_build_object('label','Open incidents','value',(select count(*) from public.platform_incidents i where i.status not in ('resolved','postmortem_complete')),'severity','critical','href','admin-resilience'),
      jsonb_build_object('label','Dead-letter jobs','value',(select count(*) from private.background_jobs j where j.status='dead_letter'),'severity','critical','href','admin-jobs'),
      jsonb_build_object('label','Failed business events','value',(select count(*) from public.business_events e where e.status in ('failed','dead_letter')),'severity','warning','href','admin-jobs')
    );
  end if;

  if can_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',c.control_key,'label',c.label,'enabled',c.is_enabled,'reason',c.reason,
      'updatedAt',c.updated_at,'updatedBy',c.updated_by
    ) order by c.control_key),'[]'::jsonb) into controls from private.platform_intake_controls c;
  end if;

  return jsonb_build_object('role',staff_role,'generatedAt',now(),'metrics',metrics,'queues',queues,
    'risks',risks,'health',health,'controls',controls,'canManageControls',can_admin);
end;
$$;
revoke all on function public.get_administrator_control_centre_snapshot() from public,anon;
grant execute on function public.get_administrator_control_centre_snapshot() to authenticated,service_role;

create or replace function public.admin_update_platform_intake_control(
  p_control_key text,p_enabled boolean,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff_role text; prior private.platform_intake_controls; changed private.platform_intake_controls;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select s.role into staff_role from public.platform_staff_members s
    where s.user_id=(select auth.uid()) and s.status in ('invited','active');
  if staff_role not in ('owner','administrator') then raise exception 'Platform administrator access is required'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'A reason of at least 10 characters is required'; end if;
  select * into prior from private.platform_intake_controls c where c.control_key=p_control_key for update;
  if not found then raise exception 'Unknown intake control'; end if;
  update private.platform_intake_controls set is_enabled=p_enabled,reason=btrim(p_reason),
    updated_by=(select auth.uid()),updated_at=now() where control_key=p_control_key returning * into changed;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),'platform_intake_control.updated','platform_intake_control',p_control_key,
    jsonb_build_object('previous_enabled',prior.is_enabled,'enabled',changed.is_enabled,'reason',changed.reason));
  return jsonb_build_object('key',changed.control_key,'enabled',changed.is_enabled,'reason',changed.reason,'updatedAt',changed.updated_at);
end;
$$;
revoke all on function public.admin_update_platform_intake_control(text,boolean,text) from public,anon;
grant execute on function public.admin_update_platform_intake_control(text,boolean,text) to authenticated,service_role;

-- Keep the idempotent command envelope authoritative for the new control command.
create or replace function public.claim_backend_command(
  p_command_name text,p_idempotency_key text,p_payload_hash text,p_request_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); existing public.backend_command_requests;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not (p_command_name=any(array[
    'organization.invite','organization.transition','organization.recovery.decide','organization.purge',
    'subscription.transition','advertising.order.create','organization.verification.approve',
    'procurement.ingestion.promote','billing.payment.record','billing.credit.issue','billing.refund.record',
    'platform_staff.update','platform_intake_control.update'
  ])) then raise exception 'Unsupported command'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid payload hash'; end if;
  insert into public.backend_command_requests(actor_id,command_name,idempotency_key,payload_hash,request_id)
  values(actor,p_command_name,p_idempotency_key,p_payload_hash,left(p_request_id,128))
  on conflict(actor_id,command_name,idempotency_key) do nothing returning * into existing;
  if found then return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id); end if;
  select * into existing from public.backend_command_requests where actor_id=actor and command_name=p_command_name and idempotency_key=p_idempotency_key for update;
  if existing.payload_hash<>p_payload_hash then raise exception 'Idempotency key was already used with different input'; end if;
  if existing.status='succeeded' then return jsonb_build_object('execute',false,'cached',true,'commandId',existing.id,'result',existing.result); end if;
  if existing.status='processing' and existing.started_at<now()-interval '5 minutes' then
    update public.backend_command_requests set attempt_count=attempt_count+1,started_at=now(),updated_at=now(),request_id=left(p_request_id,128),error_code=null where id=existing.id;
  elsif existing.status='failed' then
    update public.backend_command_requests set status='processing',attempt_count=attempt_count+1,started_at=now(),updated_at=now(),request_id=left(p_request_id,128),error_code=null where id=existing.id;
  else raise exception 'Command is already processing'; end if;
  return jsonb_build_object('execute',true,'cached',false,'commandId',existing.id);
end;
$$;
revoke all on function public.claim_backend_command(text,text,text,text) from public,anon;
grant execute on function public.claim_backend_command(text,text,text,text) to authenticated;

commit;

-- ===== END 82_administrator_control_centre.sql =====

-- ===== START 83_account_session_security.sql =====
-- Account and Session Security: observed login history, safe self-service revocation and AAL2 step-up.
begin;

create schema if not exists private;

create table if not exists private.account_session_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  ip_address inet,
  user_agent text,
  assurance_level text not null check (assurance_level in ('aal1','aal2')),
  unusual boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id,session_id)
);
create index if not exists account_session_events_user_recent_idx on private.account_session_events(user_id,last_seen_at desc);
alter table private.account_session_events enable row level security;
revoke all on table private.account_session_events from public,anon,authenticated;
grant select,insert,update,delete on table private.account_session_events to service_role;

create or replace function public.observe_my_account_session()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select auth.uid()); sid uuid; current_session auth.sessions; prior_count integer; familiar boolean; flagged boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  sid:=nullif((select auth.jwt()->>'session_id'),'')::uuid;
  if sid is null then raise exception 'Session identifier is required'; end if;
  select * into current_session from auth.sessions s where s.id=sid and s.user_id=actor;
  if not found then raise exception 'Active session not found'; end if;
  select count(*),coalesce(bool_or(e.ip_address is not distinct from current_session.ip and e.user_agent is not distinct from current_session.user_agent),false)
    into prior_count,familiar from private.account_session_events e where e.user_id=actor and e.session_id<>sid and e.last_seen_at>=now()-interval '90 days';
  flagged:=prior_count>0 and not familiar;
  insert into private.account_session_events(user_id,session_id,ip_address,user_agent,assurance_level,unusual,first_seen_at,last_seen_at)
  values(actor,sid,current_session.ip,current_session.user_agent,current_session.aal::text,flagged,current_session.created_at,now())
  on conflict(user_id,session_id) do update set ip_address=excluded.ip_address,user_agent=excluded.user_agent,
    assurance_level=excluded.assurance_level,last_seen_at=now(),unusual=private.account_session_events.unusual or excluded.unusual;
  if flagged and not exists(select 1 from public.notifications n where n.user_id=actor and n.category='security' and n.metadata->>'sessionId'=sid::text) then
    insert into public.notifications(user_id,category,title,body,link_url,priority,action_label,workspace_target,metadata)
    values(actor,'security','New sign-in detected','A new device or network signed in to your Manohub account. Review active sessions if this was not you.',
      '/?workspace=account-security','high','Review sessions','account-security',jsonb_build_object('sessionId',sid,'ipAddress',coalesce(host(current_session.ip),'Unavailable')));
  end if;
  return jsonb_build_object('sessionId',sid,'unusual',flagged);
end;
$$;
revoke all on function public.observe_my_account_session() from public,anon;
grant execute on function public.observe_my_account_session() to authenticated,service_role;

create or replace function public.get_my_account_security()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); sid uuid:=nullif((select auth.jwt()->>'session_id'),'')::uuid; sessions jsonb; recent jsonb; enabled boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') into enabled;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'lastSeenAt',coalesce(s.refreshed_at::timestamptz,s.updated_at),
    'userAgent',coalesce(s.user_agent,'Unknown device'),'ipAddress',coalesce(host(s.ip),'Unavailable'),'assuranceLevel',s.aal::text,
    'current',s.id=sid,'unusual',coalesce(e.unusual,false)) order by coalesce(s.refreshed_at::timestamptz,s.updated_at) desc),'[]'::jsonb)
    into sessions from auth.sessions s left join private.account_session_events e on e.user_id=s.user_id and e.session_id=s.id where s.user_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.session_id,'createdAt',e.first_seen_at,'lastSeenAt',e.last_seen_at,
    'userAgent',coalesce(e.user_agent,'Unknown device'),'ipAddress',coalesce(host(e.ip_address),'Unavailable'),'assuranceLevel',e.assurance_level,
    'current',e.session_id=sid,'unusual',e.unusual) order by e.last_seen_at desc),'[]'::jsonb) into recent
    from (select * from private.account_session_events x where x.user_id=actor order by x.last_seen_at desc limit 20) e;
  return jsonb_build_object('mfaEnabled',enabled,'sessions',sessions,'recentLogins',recent);
end;
$$;
revoke all on function public.get_my_account_security() from public,anon;
grant execute on function public.get_my_account_security() to authenticated,service_role;

create or replace function public.revoke_my_account_session(p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); current_sid uuid:=nullif((select auth.jwt()->>'session_id'),'')::uuid; has_mfa boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_session_id=current_sid then raise exception 'Use sign out to end the current session'; end if;
  select exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') into has_mfa;
  if has_mfa and coalesce((select auth.jwt()->>'aal'),'aal1')<>'aal2' then raise exception 'Additional verification is required'; end if;
  delete from auth.sessions s where s.id=p_session_id and s.user_id=actor;
  if not found then raise exception 'Session not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(actor,'account.session.revoked','auth_session',p_session_id::text,jsonb_build_object('selfService',true));
end;
$$;
revoke all on function public.revoke_my_account_session(uuid) from public,anon;
grant execute on function public.revoke_my_account_session(uuid) to authenticated,service_role;

create or replace function private.enforce_sensitive_command_step_up()
returns trigger language plpgsql security definer set search_path='' as $$
declare jwt_role text:=coalesce((select auth.jwt()->>'role'),'');
begin
  if jwt_role in ('','service_role') then return new; end if;
  if new.command_name=any(array['organization.transition','organization.recovery.decide','organization.purge','subscription.transition',
    'organization.verification.approve','billing.payment.record','billing.credit.issue','billing.refund.record','platform_staff.update','platform_intake_control.update'])
    and coalesce((select auth.jwt()->>'aal'),'aal1')<>'aal2' then
    raise exception 'Additional verification is required before this sensitive action' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_sensitive_command_step_up() from public,anon,authenticated;
grant execute on function private.enforce_sensitive_command_step_up() to service_role;
drop trigger if exists enforce_sensitive_command_step_up on public.backend_command_requests;
create trigger enforce_sensitive_command_step_up before insert on public.backend_command_requests
for each row execute function private.enforce_sensitive_command_step_up();

commit;

-- ===== END 83_account_session_security.sql =====

-- ===== START 84_upload_endpoint_protection.sql =====
begin;

create table if not exists public.upload_security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 240),
  file_kind text not null check (file_kind in ('image','document','receipt','csv')),
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 10485760),
  verdict text not null check (verdict in ('clean','blocked','error')),
  threat_detail text,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.upload_security_events enable row level security;
revoke all on table public.upload_security_events from public, anon, authenticated;
revoke all on sequence public.upload_security_events_id_seq from public, anon, authenticated;
grant insert, select on table public.upload_security_events to service_role;
grant usage, select on sequence public.upload_security_events_id_seq to service_role;

create index if not exists upload_security_events_created_at_idx on public.upload_security_events (created_at desc);
create index if not exists upload_security_events_blocked_idx on public.upload_security_events (created_at desc) where verdict = 'blocked';

create or replace function public.admin_upload_security_events(p_limit integer default 50)
returns table (id bigint, file_name text, file_kind text, mime_type text, file_size bigint, verdict text, threat_detail text, request_id text, created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select role into caller_role from public.platform_staff_members where user_id = auth.uid() and status = 'active';
  if caller_role not in ('owner','administrator','auditor','support') then raise exception 'Security event access denied' using errcode = '42501'; end if;
  return query select e.id,e.file_name,e.file_kind,e.mime_type,e.file_size,e.verdict,e.threat_detail,e.request_id,e.created_at
    from public.upload_security_events e order by e.created_at desc limit least(greatest(coalesce(p_limit,50),1),200);
end;
$$;

revoke all on function public.admin_upload_security_events(integer) from public, anon;
grant execute on function public.admin_upload_security_events(integer) to authenticated;

update storage.buckets set file_size_limit = 10485760 where id in (
  'advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs'
);

commit;

-- ===== END 84_upload_endpoint_protection.sql =====

-- ===== START 85_backup_verification_and_disaster_recovery.sql =====
-- Verified backup runs and disaster-recovery readiness evidence.
begin;

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  run_reference text not null unique,
  backup_kind text not null check (backup_kind in ('database','storage','configuration','full')),
  trigger_source text not null check (trigger_source in ('schedule','manual','restore_exercise')),
  status text not null check (status in ('running','succeeded','failed','verified')),
  backup_point_at timestamptz not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  object_count bigint check (object_count is null or object_count >= 0),
  byte_count bigint check (byte_count is null or byte_count >= 0),
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[a-f0-9]{64}$'),
  offsite_reference text,
  workflow_run_url text,
  failure_summary text,
  created_at timestamptz not null default now(),
  check ((status='running' and completed_at is null) or (status<>'running' and completed_at is not null)),
  check (status<>'failed' or length(btrim(coalesce(failure_summary,''))) between 3 and 1000)
);

create index if not exists backup_runs_status_started_idx on public.backup_runs(status, started_at desc);
create index if not exists backup_runs_kind_started_idx on public.backup_runs(backup_kind, started_at desc);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from public, anon, authenticated;

create table if not exists private.recovery_control_state (
  singleton boolean primary key default true check (singleton),
  database_method text not null default 'logical_export' check (database_method in ('logical_export','scheduled_backup','pitr')),
  storage_method text not null default 'encrypted_offsite_copy' check (storage_method='encrypted_offsite_copy'),
  target_rpo_minutes integer not null default 1440 check (target_rpo_minutes between 1 and 10080),
  target_rto_minutes integer not null default 240 check (target_rto_minutes between 1 and 10080),
  pitr_status text not null default 'unavailable' check (pitr_status in ('unavailable','configured','restore_verified')),
  schedule text not null default 'daily 02:17 UTC',
  updated_at timestamptz not null default now()
);
insert into private.recovery_control_state(singleton) values(true) on conflict(singleton) do nothing;
revoke all on private.recovery_control_state from public, anon, authenticated;

create or replace function private.record_backup_run(
  p_run_reference text, p_backup_kind text, p_trigger_source text, p_status text,
  p_backup_point_at timestamptz, p_started_at timestamptz, p_completed_at timestamptz,
  p_object_count bigint, p_byte_count bigint, p_manifest_sha256 text,
  p_offsite_reference text, p_workflow_run_url text, p_failure_summary text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if current_user not in ('postgres','supabase_admin') then raise exception 'Backup recorder role required'; end if;
  insert into public.backup_runs(run_reference,backup_kind,trigger_source,status,backup_point_at,started_at,completed_at,
    object_count,byte_count,manifest_sha256,offsite_reference,workflow_run_url,failure_summary)
  values(btrim(p_run_reference),p_backup_kind,p_trigger_source,p_status,p_backup_point_at,p_started_at,p_completed_at,
    p_object_count,p_byte_count,nullif(lower(btrim(p_manifest_sha256)),''),nullif(btrim(p_offsite_reference),''),
    nullif(btrim(p_workflow_run_url),''),nullif(btrim(p_failure_summary),''))
  on conflict(run_reference) do update set status=excluded.status,completed_at=excluded.completed_at,
    object_count=coalesce(excluded.object_count,backup_runs.object_count),byte_count=coalesce(excluded.byte_count,backup_runs.byte_count),
    manifest_sha256=coalesce(excluded.manifest_sha256,backup_runs.manifest_sha256),
    offsite_reference=coalesce(excluded.offsite_reference,backup_runs.offsite_reference),
    workflow_run_url=excluded.workflow_run_url,failure_summary=excluded.failure_summary
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function private.record_backup_run(text,text,text,text,timestamptz,timestamptz,timestamptz,bigint,bigint,text,text,text,text) from public, anon, authenticated;

create or replace function public.admin_list_backup_runs(p_limit integer default 50)
returns table(id uuid,run_reference text,backup_kind text,trigger_source text,status text,backup_point_at timestamptz,
  started_at timestamptz,completed_at timestamptz,object_count bigint,byte_count bigint,manifest_sha256 text,
  offsite_reference text,workflow_run_url text,failure_summary text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select r.id,r.run_reference,r.backup_kind,r.trigger_source,r.status,r.backup_point_at,r.started_at,
    r.completed_at,r.object_count,r.byte_count,r.manifest_sha256,r.offsite_reference,r.workflow_run_url,r.failure_summary
  from public.backup_runs r order by r.started_at desc limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_backup_runs(integer) from public, anon;
grant execute on function public.admin_list_backup_runs(integer) to authenticated;

create or replace function public.admin_get_recovery_readiness()
returns table(database_method text,storage_method text,target_rpo_minutes integer,target_rto_minutes integer,
  pitr_status text,schedule text,last_success_at timestamptz,last_verified_restore_at timestamptz,backup_overdue boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select c.database_method,c.storage_method,c.target_rpo_minutes,c.target_rto_minutes,c.pitr_status,c.schedule,
    (select max(r.completed_at) from public.backup_runs r where r.status in ('succeeded','verified')),
    (select max(e.completed_at) from public.restore_exercises e where e.status in ('passed','passed_with_actions')),
    coalesce((select max(r.completed_at) < now()-(c.target_rpo_minutes||' minutes')::interval
      from public.backup_runs r where r.status in ('succeeded','verified')),true)
  from private.recovery_control_state c where c.singleton;
end; $$;
revoke all on function public.admin_get_recovery_readiness() from public, anon;
grant execute on function public.admin_get_recovery_readiness() to authenticated;

commit;

-- ===== END 85_backup_verification_and_disaster_recovery.sql =====

select 'Batch 4/5 complete: migrations 75-85' as staging_migration_progress;
