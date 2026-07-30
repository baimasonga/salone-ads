# Manohub Supabase baseline

Target project: `rffjehmbrycztiekcyho` (`Manohub`).

This directory contains the reproducible database baseline for a fresh Manohub
Supabase project.

> ## Schema drift: found, and now resolved
>
> An audit found the live project running **96 public tables** while this
> directory only described **53** — 43 tables (a commerce, agency and CMS layer)
> had been applied straight to the database with no committed migration. A
> rebuild from the repo would silently have produced a different database.
>
> **That gap is now closed.** Migrations `12`–`51` were committed, and the files
> here declare **97 tables, minus `campaigns` which `11` drops = 96**, matching
> the live count exactly.
>
> ### Rule going forward
>
> Every schema change lands as a file in this directory **before** it is applied,
> and the database only ever receives what is in a file. Applying migrations
> straight to production — via a dashboard, an MCP tool, or an agent — is what
> caused the drift, and it is silent when it happens: nothing errors, features
> simply are not there after a rebuild.
>
> To re-check drift at any time, compare the counts in **Verification** below
> against the live project. If they diverge, something was applied without a file.

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

Migrations `06` through `11` add the advertising measurement, commercial
measurement and unified campaign layers. `10` and `11` are now wrapped in
transactions — `11` drops foreign keys, moves rows between tables and re-adds
them, so a mid-file failure without a transaction would leave `content_items`
and `tracking_links` with no campaign foreign key at all.

`12_private_schema_hardening.sql` must be applied. PostgreSQL grants `EXECUTE`
to `PUBLIC` on newly created functions, and `anon` holds `USAGE` on the `private`
schema (needed by the analytics RPC wrapper), so without this any future
function added to `private` would be callable anonymously. `12` inverts that
default.

`remove_demo_seed.sql` is an optional teardown for the demonstration content.
Run it when you have real tenders and adverts and no longer want fictional
records public. It only touches rows carrying the seed's own markers
(`[DEMO]` titles, `demo-%` slugs, `Demo %` names), aborts if a real user has
joined a demo organisation, and includes an audit query to preview scope first.

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

Expected counts after applying `full_setup.sql` and every numbered migration:

| Object | Expected |
| --- | --- |
| public tables | **96** (97 created across all files, minus `campaigns` dropped by `11`) |
| RLS-enabled public tables | **96** — every public table |
| `public` functions | **67** declared here; the live count is higher because Supabase adds its own |
| `private` functions | **41** |
| Storage buckets | **four** — `advert-creatives`, `media-assets`, `private-documents`, `public-assets` |

A divergence between these numbers and the live project means something was
applied without a committed file. Investigate before assuming the migration
failed.

Run the Supabase security and performance advisors after the migration.

## Application cutover

Set the deployment and local environment to:

```text
VITE_SUPABASE_URL=https://rffjehmbrycztiekcyho.supabase.co
VITE_SUPABASE_ANON_KEY=<target project publishable or anon key>
```

Never place the database password or service-role/secret key in frontend code.
Rotate credentials that have been shared outside the Supabase dashboard.
