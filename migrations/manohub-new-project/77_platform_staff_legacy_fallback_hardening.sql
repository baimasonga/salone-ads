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
