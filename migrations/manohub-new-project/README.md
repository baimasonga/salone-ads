# Manohub Supabase baseline

Target project: `rffjehmbrycztiekcyho` (`Manohub`).

This directory contains the reproducible database baseline for a fresh Manohub
Supabase project.

## Migration order

Run `full_setup.sql` once, as the project owner, in the target project's SQL
Editor or through an authenticated migration runner.

Then run `03_security_hardening.sql`. It contains the post-baseline advisor
repairs for Storage access, RPC authorization, RLS execution plans, extension
placement, and foreign-key indexes. It is idempotent and is also required for
fresh projects.

For a new production environment that needs safe demonstration content, run
`04_demo_seed.sql` after the hardening migration. It adds only conspicuously
labelled fictional records, uses reserved `.example` domains, and can be rerun
without duplicating data. Apply `05_publish_demo_seed.sql` last; this keeps the
sample opportunities public even when the normal buyer review-transition
trigger is enabled.

The migration is atomic and includes:

- PostgreSQL extensions
- 51 public tables
- primary, unique, check and foreign-key constraints
- indexes
- 32 functions and their safe `search_path` configuration
- triggers, including the `auth.users` profile trigger
- RLS on every public table
- public and Storage policies
- four Storage buckets
- countries, districts, currencies, sectors, procurement metadata, plans and
  plan-feature reference data
- explicit Data API grants required by new Supabase projects
- restricted `SECURITY DEFINER` execution grants

`01_tables.sql` and `02_constraints.sql` are retained only as the original
split exports. They are not a complete migration and must not be run in
addition to `full_setup.sql`.

`EXPORT_from_old_project.sql` is retained as the export generator used to
produce the baseline. It is not required for a fresh target project.

## Not contained in schema scripts

The supplied SQL does not contain existing operational rows, Auth users, or
uploaded Storage objects. Those require separate source exports:

- Auth users: an Auth migration/export process
- Public application rows: a data-only `pg_dump` or equivalent export
- Storage objects: copy the underlying bucket objects separately

Reference/catalogue rows needed by the application are included.

## Verification

After applying the migration, verify:

```sql
select count(*) as public_tables
from pg_tables
where schemaname = 'public';

select count(*) as rls_tables
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity;

select count(*) as public_functions
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select id, public
from storage.buckets
where id in (
  'advert-creatives',
  'media-assets',
  'private-documents',
  'public-assets'
)
order by id;
```

Expected counts after both migrations are 51 public tables, 51 RLS-enabled
public tables, 32 application functions in `public`, and four Storage buckets.

Run the Supabase security and performance advisors after the migration.

## Application cutover

Set the deployment and local environment to:

```text
VITE_SUPABASE_URL=https://rffjehmbrycztiekcyho.supabase.co
VITE_SUPABASE_ANON_KEY=<target project publishable or anon key>
```

Never place the database password or service-role/secret key in frontend code.
Rotate credentials that have been shared outside the Supabase dashboard.
