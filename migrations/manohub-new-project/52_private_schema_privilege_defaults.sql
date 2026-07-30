-- Manohub: close a latent privilege hole in the `private` schema.
--
-- Background: 06_advert_measurement_foundation.sql grants `anon` and
-- `authenticated` USAGE on the `private` schema, because the public analytics
-- entry point (public.track_advert_event) is a SECURITY INVOKER shim that calls
-- private.track_advert_event_internal.
--
-- The risk: PostgreSQL grants EXECUTE to PUBLIC on *newly created* functions by
-- default. Combined with anon holding USAGE on the schema, any function added
-- to `private` in future becomes callable by anonymous visitors unless whoever
-- wrote it remembered an explicit REVOKE. That makes the safe outcome depend on
-- human memory. This migration inverts the default so it does not.
--
-- Migrations 30/35 revoke EXECUTE from individual `private` functions one at a
-- time. That works, but it is the pattern this migration exists to make
-- unnecessary: it only holds for as long as every future author remembers.
-- This sets the default so forgetting is safe.
--
-- Idempotent. Safe to run more than once.

begin;

-- 1. Future functions created in `private` are NOT executable by PUBLIC.
--    ALTER DEFAULT PRIVILEGES applies to objects created by the current role,
--    which is the role that runs migrations (postgres).
alter default privileges in schema private revoke execute on functions from public;

-- 2. Same for anything already present. The intended entry point keeps working:
--    it holds explicit grants to anon/authenticated, and revoking the PUBLIC
--    pseudo-role grant does not touch those.
revoke execute on all functions in schema private from public;

-- 3. Do not let PUBLIC create new objects in `private` either.
revoke create on schema private from public;

commit;

-- Verification — the analytics path must still work for anonymous visitors,
-- and nothing in `private` should be PUBLIC-executable:
--
--   select p.proname,
--          coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false) as anon_can_execute
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'private'
--   order by p.proname;
--
-- Expected: only track_advert_event_internal returns true.
