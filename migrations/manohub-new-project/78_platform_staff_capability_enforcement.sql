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
