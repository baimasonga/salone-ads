-- Preserve anonymous feature detection after privilege hardening.
-- Apply after 30_function_privilege_hardening.sql.

begin;

create or replace function public.user_has_tender_feature(p_feature_key text)
returns boolean
language sql
stable
security invoker
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

revoke all on function public.user_has_tender_feature(text) from public, anon, authenticated;
grant execute on function public.user_has_tender_feature(text) to anon, authenticated, service_role;

commit;
