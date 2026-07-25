-- ============================================================================
-- Manohub — ONE-FILE migration EXPORT.
-- Run this in the OLD project (SaloneReach) → Dashboard → SQL Editor → Run.
-- It returns ONE row / ONE column ("migration_sql") = the ENTIRE database
-- (tables, keys, indexes, functions, triggers, RLS + policies, storage buckets,
-- and reference data). Click the result cell → Copy → paste into the NEW
-- project's SQL Editor → Run. Reference data uses ON CONFLICT DO NOTHING.
--
-- NOT included (cannot be moved by SQL): auth users (log in / sign up fresh on
-- the new project — the first user should be made platform admin with
--   update public.profiles set platform_role='admin' where email='you@…';
-- ) and any uploaded storage files (there are 0 in this project).
-- ============================================================================
with
tables as (
  select coalesce(string_agg(ddl, E'\n' order by tbl), '') as s from (
    select c.relname as tbl,
      'create table if not exists public.'||quote_ident(c.relname)||E' (\n'||
      string_agg('  '||quote_ident(a.attname)||' '||format_type(a.atttypid,a.atttypmod)||
        case when a.attnotnull then ' not null' else '' end||
        case when ad.adbin is not null then ' default '||pg_get_expr(ad.adbin,ad.adrelid) else '' end,
        E',\n' order by a.attnum)||E'\n);' as ddl
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
    where c.relkind='r'
    group by c.relname
  ) t
),
cons as (
  select coalesce(string_agg(stmt, E'\n' order by ord, conname), '') as s from (
    select c.conname,
      case c.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end as ord,
      'alter table public.'||quote_ident(rel.relname)||' add constraint '||quote_ident(c.conname)||' '||pg_get_constraintdef(c.oid)||';' as stmt
    from pg_constraint c
    join pg_class rel on rel.oid=c.conrelid
    join pg_namespace n on n.oid=rel.relnamespace and n.nspname='public'
    where c.contype in ('p','u','c','f')
  ) x
),
idx as (
  select coalesce(string_agg(indexdef||';', E'\n' order by indexname), '') as s
  from pg_indexes i
  where schemaname='public'
    and indexname not in (select conname from pg_constraint where contype in ('p','u'))
),
funcs as (
  select coalesce(string_agg(pg_get_functiondef(p.oid)||';', E'\n\n' order by p.proname), '') as s
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
),
trigs as (
  select coalesce(string_agg(pg_get_triggerdef(t.oid)||';', E'\n' order by c.relname,t.tgname), '') as s
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal
),
rls_en as (
  select coalesce(string_agg('alter table public.'||quote_ident(c.relname)||' enable row level security;', E'\n' order by c.relname), '') as s
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
),
pol as (
  select coalesce(string_agg(
    'create policy '||quote_ident(policyname)||' on '||schemaname||'.'||quote_ident(tablename)
    ||' as '||lower(permissive)||' for '||lower(cmd)||' to '||array_to_string(roles,', ')
    ||coalesce(' using ('||qual||')','')||coalesce(' with check ('||with_check||')','')||';',
    E'\n' order by schemaname,tablename,policyname), '') as s
  from pg_policies where schemaname in ('public','storage')
),
buck as (
  select coalesce(string_agg(format('insert into storage.buckets (id,name,public) values (%L,%L,%L) on conflict (id) do nothing;', id,name,public), E'\n' order by id), '') as s
  from storage.buckets
),
d_currencies as (select 'insert into public.currencies (code,name,symbol,is_active) values '||string_agg(format('(%L,%L,%L,%L)',code,name,symbol,is_active),E',\n')||' on conflict (code) do nothing;' s from public.currencies),
d_countries as (select 'insert into public.countries (id,code,name,currency_code,is_active,sort_order,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L,%L,%L)',id,code,name,currency_code,is_active,sort_order,created_at),E',\n')||' on conflict (id) do nothing;' s from public.countries),
d_districts as (select 'insert into public.districts (id,country_id,name,is_active,sort_order,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L,%L)',id,country_id,name,is_active,sort_order,created_at),E',\n')||' on conflict (id) do nothing;' s from public.districts),
d_sectors as (select 'insert into public.sectors (id,name,slug,is_active,sort_order,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L,%L)',id,name,slug,is_active,sort_order,created_at),E',\n')||' on conflict (id) do nothing;' s from public.sectors),
d_categories as (select coalesce('insert into public.categories (id,sector_id,name,slug,is_active,sort_order,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L,%L,%L)',id,sector_id,name,slug,is_active,sort_order,created_at),E',\n')||' on conflict (id) do nothing;','-- no categories') s from public.categories),
d_funding as (select coalesce('insert into public.funding_agencies (id,name,website,is_active,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L)',id,name,website,is_active,created_at),E',\n')||' on conflict (id) do nothing;','-- no funding_agencies') s from public.funding_agencies),
d_optypes as (select 'insert into public.opportunity_types (id,code,label,is_active,sort_order) values '||string_agg(format('(%L,%L,%L,%L,%L)',id,code,label,is_active,sort_order),E',\n')||' on conflict (id) do nothing;' s from public.opportunity_types),
d_ostat as (select 'insert into public.opportunity_statuses (id,code,label,is_terminal,sort_order) values '||string_agg(format('(%L,%L,%L,%L,%L)',id,code,label,is_terminal,sort_order),E',\n')||' on conflict (id) do nothing;' s from public.opportunity_statuses),
d_pmethods as (select 'insert into public.procurement_methods (id,code,label,is_active,sort_order) values '||string_agg(format('(%L,%L,%L,%L,%L)',id,code,label,is_active,sort_order),E',\n')||' on conflict (id) do nothing;' s from public.procurement_methods),
d_plans as (select 'insert into public.plans (id,code,name,description,monthly_price,annual_price,currency_code,is_active,sort_order,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',id,code,name,description,monthly_price,annual_price,currency_code,is_active,sort_order,created_at),E',\n')||' on conflict (id) do nothing;' s from public.plans),
d_planfeat as (select 'insert into public.plan_features (id,plan_id,feature_key,feature_label,limit_value,created_at) values '||string_agg(format('(%L,%L,%L,%L,%L,%L)',id,plan_id,feature_key,feature_label,limit_value,created_at),E',\n')||' on conflict (id) do nothing;' s from public.plan_features)
select
   E'-- ===== EXTENSIONS =====\ncreate extension if not exists "pgcrypto";\ncreate extension if not exists "pg_trgm";\n'
|| E'\n-- ===== TABLES =====\n'      || (select s from tables)
|| E'\n\n-- ===== CONSTRAINTS =====\n' || (select s from cons)
|| E'\n\n-- ===== INDEXES =====\n'     || (select s from idx)
|| E'\n\n-- ===== FUNCTIONS =====\n'   || (select s from funcs)
|| E'\n\n-- ===== TRIGGERS =====\n'    || (select s from trigs)
|| E'\n\n-- ===== ENABLE RLS =====\n'  || (select s from rls_en)
|| E'\n\n-- ===== POLICIES =====\n'    || (select s from pol)
|| E'\n\n-- ===== STORAGE BUCKETS =====\n' || (select s from buck)
|| E'\n\n-- ===== REFERENCE DATA =====\n'
|| (select s from d_currencies) || E'\n' || (select s from d_countries) || E'\n' || (select s from d_districts) || E'\n'
|| (select s from d_sectors) || E'\n' || (select s from d_categories) || E'\n' || (select s from d_funding) || E'\n'
|| (select s from d_optypes) || E'\n' || (select s from d_ostat) || E'\n' || (select s from d_pmethods) || E'\n'
|| (select s from d_plans) || E'\n' || (select s from d_planfeat)
  as migration_sql;
