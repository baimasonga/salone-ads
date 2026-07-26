-- Remove inherited public table privileges; expose only the required signup operation.
begin;

revoke all on public.public_audience_subscribers from public, anon;
grant insert on public.public_audience_subscribers to anon;
grant insert, select, update, delete on public.public_audience_subscribers to authenticated;
grant all on public.public_audience_subscribers to service_role;

commit;
