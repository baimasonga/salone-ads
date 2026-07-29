-- Harden privileged RPC boundaries after the production security audit.
-- Apply after 35_private_measurement_helper_hardening.sql.

begin;

-- Audit evidence must originate from database triggers or trusted server-side
-- code. Client-supplied action/entity metadata is not trustworthy evidence.
revoke all on function public.log_audit_event(text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_audit_event(text, text, text, uuid, jsonb)
  to service_role;

-- Organization administrators may invite members and administrators, but only
-- an existing owner may grant owner-level access.
create or replace function public.invite_team_member(
  p_org_id uuid,
  p_email text,
  p_role text default 'member'::text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  caller_role text;
  invitee_id uuid;
  current_count integer;
  member_limit integer;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select role into caller_role
  from public.organization_members
  where org_id = p_org_id and user_id = (select auth.uid());

  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only an organization owner or admin can invite team members';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_role = 'owner' and caller_role <> 'owner' then
    raise exception 'Only an organization owner can grant owner access';
  end if;

  if normalized_email = '' or length(normalized_email) > 320
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'A valid email address is required';
  end if;

  invitee_id := public.find_user_id_by_email(normalized_email);
  if invitee_id is null then
    raise exception 'No Manohub account found for %. Ask them to sign up first.', normalized_email;
  end if;

  if invitee_id = (select auth.uid()) then
    raise exception 'You are already a member of this organization';
  end if;

  if exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = invitee_id
  ) then
    raise exception 'That user is already a member of this organization';
  end if;

  select count(*) into current_count
  from public.organization_members
  where org_id = p_org_id;

  member_limit := public.get_org_feature_limit(p_org_id, 'max_team_members');
  if member_limit is not null and current_count >= member_limit then
    raise exception 'Your plan allows up to % team member(s). Upgrade to invite more.', member_limit;
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, invitee_id, p_role);
end;
$function$;

revoke all on function public.invite_team_member(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.invite_team_member(uuid, text, text)
  to authenticated, service_role;

commit;
