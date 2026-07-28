-- Reduce the privileged Data API surface without breaking existing RLS policies.
-- Apply after 29_procurement_audit_foundation.sql.

begin;

create schema if not exists private;

-- RLS policies need these checks, but their privileged implementations do not
-- need to be exposed as SECURITY DEFINER RPCs in the public schema.
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and platform_role = 'admin'
  );
$function$;

create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select exists (
    select 1
    from public.organization_members
    where org_id = target_org_id
      and user_id = (select auth.uid())
  );
$function$;

create or replace function private.user_has_tender_feature(p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select case
    when (select auth.uid()) is null then false
    else exists (
      select 1
      from public.organization_members om
      where om.user_id = (select auth.uid())
        and public.org_has_feature(om.org_id, p_feature_key)
    )
  end;
$function$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.user_has_tender_feature(text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.is_platform_admin() to anon, authenticated, service_role;
grant execute on function private.is_org_member(uuid) to anon, authenticated, service_role;
grant execute on function private.user_has_tender_feature(text) to anon, authenticated, service_role;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path to 'pg_catalog'
as $function$
  select private.is_platform_admin();
$function$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'pg_catalog'
as $function$
  select private.is_org_member(target_org_id);
$function$;

-- This helper only composes the protected membership and feature checks; it
-- does not require elevated table access itself.
create or replace function public.user_has_tender_feature(p_feature_key text)
returns boolean
language sql
stable
security invoker
set search_path to 'pg_catalog'
as $function$
  select private.user_has_tender_feature(p_feature_key);
$function$;

revoke all on function public.is_platform_admin() from public, anon, authenticated;
revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
revoke all on function public.user_has_tender_feature(text) from public, anon, authenticated;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;
grant execute on function public.is_org_member(uuid) to anon, authenticated, service_role;
grant execute on function public.user_has_tender_feature(text) to anon, authenticated, service_role;

commit;
