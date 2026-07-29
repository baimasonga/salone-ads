-- Restrict internal measurement helpers and remove retired public overloads.
-- Production verification should confirm that anon/authenticated cannot execute
-- the private helpers and that only the protected public overloads remain.

begin;

-- These SECURITY DEFINER helpers are implementation details of the protected
-- public measurement functions. Direct Data API access would allow callers to
-- fabricate rejection rollups or claim the retention-maintenance window.
revoke execute on function private.record_measurement_rejection(text, text, text)
  from public, anon, authenticated;
revoke execute on function private.maybe_prune_public_measurements()
  from public, anon, authenticated;
grant execute on function private.record_measurement_rejection(text, text, text)
  to service_role;
grant execute on function private.maybe_prune_public_measurements()
  to service_role;

-- Migration 34 deployed privacy-safe overloads. The legacy signatures were
-- already non-executable through the Data API; remove them permanently so a
-- later blanket grant cannot accidentally restore the bypass.
drop function if exists public.increment_opportunity_view(uuid);
drop function if exists public.resolve_tracking_link(text, text);

commit;
