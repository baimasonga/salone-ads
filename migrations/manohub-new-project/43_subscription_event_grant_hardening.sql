-- Older Supabase projects may auto-grant new public tables to API roles.
-- Keep lifecycle history reachable only to authenticated users and still
-- constrained by organization/platform RLS policies.
begin;

revoke all on table public.subscription_events from public, anon, authenticated;
grant select on table public.subscription_events to authenticated;
revoke all on sequence public.subscription_events_id_seq from public, anon, authenticated;

commit;
