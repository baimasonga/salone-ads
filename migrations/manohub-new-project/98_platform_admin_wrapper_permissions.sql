-- Staff hardening revoked direct access to private.is_platform_admin(), but
-- the public SECURITY INVOKER wrapper still needed that revoked permission.
-- Keep the private implementation inaccessible and expose only its boolean
-- result for the current authenticated identity through a fixed wrapper.
begin;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

revoke all on function public.is_platform_admin() from public, anon, authenticated;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;

commit;
