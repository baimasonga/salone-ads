-- Central tenant-authorization assurance and continuous RLS posture checks.

create table if not exists public.authorization_resource_registry (
  table_name text primary key,
  domain text not null,
  scope_columns text[] not null,
  data_classification text not null default 'confidential'
    check (data_classification in ('internal', 'confidential', 'restricted')),
  public_read_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  check (cardinality(scope_columns) > 0)
);

create table if not exists public.authorization_denials (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  permission text not null,
  resource_type text not null,
  resource_id text,
  reason_code text not null check (reason_code in (
    'unauthenticated', 'not_a_member', 'insufficient_role', 'organization_unavailable'
  )),
  source text not null default 'database',
  occurred_at timestamptz not null default now(),
  dedupe_key text not null unique
);

create index if not exists authorization_denials_occurred_idx
  on public.authorization_denials (occurred_at desc);
create index if not exists authorization_denials_org_occurred_idx
  on public.authorization_denials (org_id, occurred_at desc);
create index if not exists authorization_denials_actor_occurred_idx
  on public.authorization_denials (actor_id, occurred_at desc);

alter table public.authorization_resource_registry enable row level security;
alter table public.authorization_denials enable row level security;

drop policy if exists authorization_registry_admin_read on public.authorization_resource_registry;
create policy authorization_registry_admin_read
  on public.authorization_resource_registry for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists authorization_denials_admin_read on public.authorization_denials;
create policy authorization_denials_admin_read
  on public.authorization_denials for select to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.authorization_resource_registry from anon, authenticated;
revoke all on public.authorization_denials from anon, authenticated;
grant select on public.authorization_resource_registry to authenticated;
grant select on public.authorization_denials to authenticated;

insert into public.authorization_resource_registry
  (table_name, domain, scope_columns, data_classification, public_read_allowed)
values
  ('organization_members', 'organization', array['org_id'], 'restricted', false),
  ('ad_campaigns', 'campaign', array['org_id'], 'confidential', false),
  ('advert_orders', 'advertising', array['org_id'], 'restricted', false),
  ('advert_spend_entries', 'advertising', array['org_id'], 'restricted', false),
  ('agency_clients', 'agency', array['agency_org_id', 'client_org_id'], 'restricted', false),
  ('subscriptions', 'subscription', array['org_id'], 'restricted', false),
  ('commercial_invoices', 'billing', array['org_id'], 'restricted', false),
  ('commercial_payments', 'billing', array['org_id'], 'restricted', false),
  ('organization_usage_events', 'usage', array['org_id'], 'confidential', false),
  ('organization_usage_meters', 'usage', array['org_id'], 'confidential', false),
  ('audit_logs', 'audit', array['org_id'], 'restricted', false),
  ('opportunities', 'procurement', array['buyer_org_id'], 'confidential', true)
on conflict (table_name) do update set
  domain = excluded.domain,
  scope_columns = excluded.scope_columns,
  data_classification = excluded.data_classification,
  public_read_allowed = excluded.public_read_allowed;

create or replace function private.org_role_permissions(p_role text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_role
    when 'owner' then array[
      'organization.read', 'organization.manage', 'members.manage',
      'campaign.read', 'campaign.manage', 'advertising.read', 'advertising.manage',
      'agency.read', 'agency.manage', 'billing.read', 'billing.manage',
      'subscription.read', 'subscription.manage', 'usage.read', 'audit.read'
    ]::text[]
    when 'admin' then array[
      'organization.read', 'organization.manage', 'members.manage',
      'campaign.read', 'campaign.manage', 'advertising.read', 'advertising.manage',
      'agency.read', 'agency.manage', 'billing.read', 'billing.manage',
      'subscription.read', 'subscription.manage', 'usage.read', 'audit.read'
    ]::text[]
    when 'member' then array[
      'organization.read', 'campaign.read', 'campaign.manage',
      'advertising.read', 'advertising.manage', 'agency.read',
      'billing.read', 'subscription.read', 'usage.read', 'audit.read'
    ]::text[]
    else array[]::text[]
  end;
$$;

create or replace function public.get_org_permissions(p_org_id uuid)
returns table(role text, permissions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select om.role into caller_role
  from public.organization_members om
  where om.org_id = p_org_id and om.user_id = (select auth.uid());

  if caller_role is null and not public.is_platform_admin() then
    raise exception 'Organization access required';
  end if;

  return query select
    coalesce(caller_role, 'platform_admin'),
    case when caller_role is null
      then array['platform.*']::text[]
      else private.org_role_permissions(caller_role)
    end;
end;
$$;

revoke all on function public.get_org_permissions(uuid) from public, anon;
grant execute on function public.get_org_permissions(uuid) to authenticated;

create or replace function private.record_authorization_denial(
  p_org_id uuid,
  p_permission text,
  p_resource_type text,
  p_resource_id text,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket text;
begin
  bucket := concat_ws(':', coalesce((select auth.uid())::text, 'anonymous'),
    coalesce(p_org_id::text, 'none'), p_permission, p_resource_type,
    to_char(clock_timestamp(), 'YYYYMMDDHH24MI'));

  insert into public.authorization_denials (
    actor_id, org_id, permission, resource_type, resource_id, reason_code, dedupe_key
  ) values (
    (select auth.uid()), p_org_id, left(p_permission, 120), left(p_resource_type, 120),
    left(p_resource_id, 240), p_reason_code, encode(sha256(bucket::bytea), 'hex')
  ) on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function private.record_authorization_denial(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.check_org_permission(
  p_org_id uuid,
  p_permission text,
  p_resource_type text default 'organization',
  p_resource_id text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_role text;
  org_available boolean;
begin
  if (select auth.uid()) is null then
    perform private.record_authorization_denial(
      p_org_id, p_permission, p_resource_type, p_resource_id, 'unauthenticated'
    );
    return false;
  end if;

  if public.is_platform_admin() then return true; end if;

  select o.status = 'active' into org_available
  from public.organizations o where o.id = p_org_id;
  if coalesce(org_available, false) is false then
    perform private.record_authorization_denial(
      p_org_id, p_permission, p_resource_type, p_resource_id, 'organization_unavailable'
    );
    return false;
  end if;

  select om.role into caller_role
  from public.organization_members om
  where om.org_id = p_org_id and om.user_id = (select auth.uid());
  if caller_role is null then
    perform private.record_authorization_denial(
      p_org_id, p_permission, p_resource_type, p_resource_id, 'not_a_member'
    );
    return false;
  end if;

  if p_permission = any(private.org_role_permissions(caller_role)) then return true; end if;

  perform private.record_authorization_denial(
    p_org_id, p_permission, p_resource_type, p_resource_id, 'insufficient_role'
  );
  return false;
end;
$$;

revoke all on function public.check_org_permission(uuid, text, text, text) from public, anon;
grant execute on function public.check_org_permission(uuid, text, text, text) to authenticated;

create or replace function private.auto_enable_public_rls()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  command record;
begin
  for command in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
      and schema_name = 'public'
  loop
    execute format('alter table if exists %s enable row level security', command.object_identity);
  end loop;
end;
$$;

revoke all on function private.auto_enable_public_rls() from public, anon, authenticated;
drop event trigger if exists manohub_auto_enable_public_rls;
create event trigger manohub_auto_enable_public_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.auto_enable_public_rls();

create or replace function public.admin_get_authorization_assurance(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_days < 1 or p_days > 366 then raise exception 'Days must be between 1 and 366'; end if;

  with registered as (
    select r.*,
      c.oid as relation_id,
      coalesce(c.relrowsecurity, false) as rls_enabled,
      exists(select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid) as has_policy,
      exists(
        select 1 from pg_catalog.pg_policy p
        where p.polrelid = c.oid
          and (
            pg_catalog.pg_get_expr(p.polqual, p.polrelid) ilike '%is_org_member%'
            or pg_catalog.pg_get_expr(p.polqual, p.polrelid) ilike '%is_platform_admin%'
            or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) ilike '%is_org_member%'
            or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) ilike '%is_platform_admin%'
          )
      ) as has_tenant_guard
    from public.authorization_resource_registry r
    left join (
      select relation.oid, relation.relname, relation.relrowsecurity
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
    ) c on c.relname = r.table_name
  ), public_tables as (
    select c.relname, c.relrowsecurity
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  ), unsafe_functions as (
    select count(*)::integer as count
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
  ), denials as (
    select count(*)::integer as total,
      count(*) filter (where reason_code = 'not_a_member')::integer as cross_tenant,
      count(*) filter (where reason_code = 'insufficient_role')::integer as role_denials
    from public.authorization_denials
    where occurred_at >= now() - make_interval(days => p_days)
  )
  select jsonb_build_object(
    'generatedAt', now(), 'windowDays', p_days,
    'summary', jsonb_build_object(
      'publicTables', (select count(*) from public_tables),
      'rlsProtectedTables', (select count(*) from public_tables where relrowsecurity),
      'registeredResources', (select count(*) from registered),
      'passingResources', (select count(*) from registered where relation_id is not null and rls_enabled and has_policy and has_tenant_guard),
      'unsafeAnonDefiners', (select count from unsafe_functions),
      'authorizationDenials', (select total from denials),
      'crossTenantDenials', (select cross_tenant from denials),
      'roleDenials', (select role_denials from denials)
    ),
    'resources', coalesce((select jsonb_agg(jsonb_build_object(
      'tableName', table_name, 'domain', domain, 'classification', data_classification,
      'rlsEnabled', rls_enabled, 'hasPolicy', has_policy, 'hasTenantGuard', has_tenant_guard,
      'status', case when relation_id is not null and rls_enabled and has_policy and has_tenant_guard then 'pass' else 'attention' end
    ) order by domain, table_name) from registered), '[]'::jsonb),
    'recentDenials', coalesce((select jsonb_agg(item order by occurred_at desc) from (
      select jsonb_build_object('occurredAt', occurred_at, 'permission', permission,
        'resourceType', resource_type, 'reasonCode', reason_code, 'orgId', org_id) as item,
        occurred_at from public.authorization_denials
      where occurred_at >= now() - make_interval(days => p_days)
      order by occurred_at desc limit 50
    ) recent), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_get_authorization_assurance(integer) from public, anon;
grant execute on function public.admin_get_authorization_assurance(integer) to authenticated;

insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
values (null, 'security.authorization_assurance_enabled', 'platform_security', 'tenant-isolation',
  jsonb_build_object('registered_resources', 12, 'future_table_rls_guard', true));
