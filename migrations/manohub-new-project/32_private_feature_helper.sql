-- Complete private-schema isolation for tender feature authorization.
-- Apply after 31_function_privilege_compatibility_fix.sql.

begin;

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

revoke all on function private.user_has_tender_feature(text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.user_has_tender_feature(text) to anon, authenticated, service_role;

create or replace function public.user_has_tender_feature(p_feature_key text)
returns boolean
language sql
stable
security invoker
set search_path to 'pg_catalog'
as $function$
  select private.user_has_tender_feature(p_feature_key);
$function$;

revoke all on function public.user_has_tender_feature(text) from public, anon, authenticated;
grant execute on function public.user_has_tender_feature(text) to anon, authenticated, service_role;

commit;
