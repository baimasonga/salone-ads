# Migrating Manohub to the new Supabase project

Target: **`rffjehmbrycztiekcyho`** (project **Manohub**, account `mohamedbangura@avdp.org.sl`).
Source: `uhmukiqslcxoxzozeiyy` (SaloneReach).

## ⭐ The one file you need: `manohub_full_setup.sql`

Run it **once** in the **NEW** project → Dashboard → **SQL Editor** → paste the whole
file → **Run**. It recreates the entire database in dependency-safe order:

1. extensions (`pgcrypto`, `pg_trgm`)
2. all 51 tables
3. primary/unique/check/foreign-key constraints
4. indexes
5. all 32 functions (RPCs, RLS helpers, triggers' functions)
6. triggers (7 on public tables)
7. RLS enabled on every table
8. all 103 RLS policies (public + storage)
9. storage buckets (`advert-creatives`, `media-assets`, `private-documents`, `public-assets`)
10. reference data — currencies, countries, districts, sectors, opportunity types &
    statuses, procurement methods, plans & plan features (SL + Liberia seeded)
11. the `auth.users → handle_new_user` signup trigger

Generated directly from the live schema using Postgres's own DDL emitters, so the
functions/policies/constraints are byte-for-byte faithful.

## After running it
1. **Create your account**: sign up in the app (or Supabase → Authentication → Add user).
   Signing up auto-creates a `profiles` row via the trigger.
2. **Make yourself platform admin**:
   ```sql
   update public.profiles set platform_role = 'admin' where email = 'YOUR_EMAIL';
   ```
3. Create your organisation from the app; subscriptions/adverts/tenders are created
   through the app from there.

## What is NOT in the script (and why)
- **Auth users / passwords** — live in the `auth` schema and can't be moved by plain
  SQL. Sign up fresh (there were only 2 demo users).
- **Uploaded storage files** — there are **0** objects in the source project, nothing to copy.
- **Demo/operational rows** (the 2 orgs, sample leads/campaigns/etc.) — they reference
  auth users that won't exist on the new project, so they're intentionally omitted.
  Reference data (the lookups the app needs to function) **is** included.

## App cutover (final step, after the DB is loaded)
Point the app at the new project by setting these (deploy env + local `.env`):
- `VITE_SUPABASE_URL = https://rffjehmbrycztiekcyho.supabase.co`
- `VITE_SUPABASE_ANON_KEY = <new project's anon key>`  (Settings → API)
The server (container) needs the same two plus `APP_URL`. Do this **only after** the
script has run, so the live site never points at an empty database.

## 🔴 Rotate the secrets you shared
The new project's **service-role key**, **database password**, and a **personal
access token** were pasted in chat — treat all three as compromised. After migrating:
- revoke the PAT: https://supabase.com/dashboard/account/tokens
- roll the service_role key: Settings → API
- reset the DB password: Settings → Database
Only the public **anon** key ever belongs in the app config.

## Other files here
- `01_tables.sql`, `02_constraints.sql` — the table/constraint sections on their own.
- `EXPORT_from_old_project.sql` — an alternative generator you run in the OLD project
  to reproduce the same dump (not needed if you use `manohub_full_setup.sql`).
