-- Make intentional API denials explicit for internal operational tables.
--
-- These tables are written by trusted SECURITY DEFINER functions and backend
-- workers. They must not be queried or mutated directly by anon or
-- authenticated API clients. RLS without a policy already denied that access;
-- these policies preserve the same behaviour while making the boundary
-- auditable and unambiguous to the database advisor.

begin;

create policy "API clients cannot access background jobs"
on private.background_jobs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access procurement search events"
on public.procurement_search_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access tender alert deliveries"
on public.tender_alert_deliveries
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access tender alert email events"
on public.tender_alert_email_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "API clients cannot access tender alert email suppressions"
on public.tender_alert_email_suppressions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

commit;
