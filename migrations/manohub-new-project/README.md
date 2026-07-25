# Migrating Manohub to a new Supabase project

Target: `rffjehmbrycztiekcyho` (project **Manohub**, account `mohamedbangura@avdp.org.sl`).
Source: `uhmukiqslcxoxzozeiyy` (project **SaloneReach**).

## Why this exists
The assistant's Supabase MCP connection is bound to the account that owns
SaloneReach (org `njitxrjsjtcmznyadwek`), and this session's network egress
policy blocks direct connections to the new project's host. So the migration
can't be pushed server-side from the session as-is.

## The two files
- **`EXPORT_from_old_project.sql`** — run this **once in the OLD (SaloneReach)
  SQL Editor**. It returns a single cell (`migration_sql`) containing the entire
  database: extensions, tables, keys, indexes, functions, triggers, RLS +
  policies, storage buckets, and reference data (countries, sectors, districts,
  plans, plan_features, opportunity types/statuses, procurement methods,
  currencies). Copy that cell and run it in the **NEW project's SQL Editor**.
- **`01_tables.sql`** — the table DDL only, as a fallback / for reference.

## What is NOT migrated (and how to handle it)
- **Auth users** — cannot be copied by SQL (password hashes live in the `auth`
  schema). Sign up fresh on the new project. Make yourself platform admin:
  `update public.profiles set platform_role = 'admin' where email = 'you@example.com';`
  Then create your organisation from the app.
- **Uploaded storage files** — there are **0** objects in the source project, so
  nothing to copy. (Buckets themselves ARE recreated by the export.)
- **Demo/operational rows** (orgs, subscriptions, leads, campaigns, etc.) — these
  reference auth users that won't exist on the new project, so they're skipped;
  recreate through the app.

## Recommended path (Option B — connect the assistant to the new account)
1. On `mohamedbangura@avdp.org.sl`, create a Supabase **Personal Access Token**:
   https://supabase.com/dashboard/account/tokens
2. Set that token as the Supabase MCP server credential for this environment,
   then restart the session. `list_projects` will then include
   `rffjehmbrycztiekcyho`.
3. In the fresh session the assistant runs `EXPORT_from_old_project.sql` against
   the old project (if still reachable) or you paste its output, and the
   assistant applies it to the new project, then repoints the app.

## App cutover (final step)
Point the app at the new project by setting these env vars (deploy env + local `.env`):
- `VITE_SUPABASE_URL = https://rffjehmbrycztiekcyho.supabase.co`
- `VITE_SUPABASE_ANON_KEY = <the new project's anon key>`
(The server also needs `APP_URL` and the same two vars.) Do this only AFTER the
schema + reference data are loaded into the new project, so the live app never
points at an empty database.

## SECURITY — rotate the leaked secrets
The new project's **service_role key** and **database password** were shared in
chat. Treat them as compromised: after migrating, rotate both in the Supabase
dashboard (Settings → API → roll service_role; Settings → Database → reset
password). Never put the service_role key in the client app — only the anon key.
