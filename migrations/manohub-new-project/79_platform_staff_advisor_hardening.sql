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
