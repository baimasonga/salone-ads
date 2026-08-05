-- The staff registry is only reachable through guarded SECURITY DEFINER RPCs.
-- Keep an explicit deny policy so direct PostgREST access remains closed and
-- the database adviser can distinguish this from an unfinished RLS setup.

begin;

drop policy if exists platform_staff_direct_access_denied on public.platform_staff_members;
create policy platform_staff_direct_access_denied on public.platform_staff_members
  for all to authenticated using (false) with check (false);

commit;
