-- Prevent subscriber lifecycle controls from revoking the platform owner's or
-- an active platform administrator's access. Keep the protection server-side
-- so it applies to every client, not only to the current UI.

begin;

grant execute on function private.is_platform_admin() to authenticated, service_role;

create or replace function private.organization_has_protected_staff(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.platform_staff_members s on s.user_id=m.user_id
    where m.org_id=p_org_id
      and s.status in ('invited','active')
      and s.role in ('owner','administrator')
  ) or exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id=m.user_id
    where m.org_id=p_org_id and p.platform_role='admin'
  );
$$;
revoke all on function private.organization_has_protected_staff(uuid) from public,anon,authenticated;

create or replace function private.protect_platform_linked_organization_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('suspended','closed','purged')
     and private.organization_has_protected_staff(old.id) then
    raise exception 'Platform-linked organizations cannot be suspended, closed or permanently removed';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_platform_linked_organization_lifecycle() from public,anon,authenticated;

drop trigger if exists protect_platform_linked_organization_lifecycle on public.organizations;
create trigger protect_platform_linked_organization_lifecycle
before update of status on public.organizations
for each row execute function private.protect_platform_linked_organization_lifecycle();

create or replace function public.admin_list_protected_organization_ids()
returns table(org_id uuid)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  return query
    select o.id
    from public.organizations o
    where private.organization_has_protected_staff(o.id);
end;
$$;
revoke all on function public.admin_list_protected_organization_ids() from public,anon;
grant execute on function public.admin_list_protected_organization_ids() to authenticated;

commit;
