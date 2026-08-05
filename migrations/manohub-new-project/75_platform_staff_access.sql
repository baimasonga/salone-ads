-- Platform staff roles, lifecycle controls and invitation audit foundation.

begin;

create table if not exists public.platform_staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','administrator','finance','editorial','support','auditor')),
  status text not null default 'invited' check (status in ('invited','active','suspended','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_staff_email_unique_idx
  on public.platform_staff_members (lower(email));
create index if not exists platform_staff_role_status_idx
  on public.platform_staff_members (role,status);

alter table public.platform_staff_members enable row level security;
revoke all on public.platform_staff_members from public,anon,authenticated;

create or replace function private.current_platform_staff_role()
returns text language sql stable security definer set search_path='' as $$
  select s.role from public.platform_staff_members s
  where s.user_id=(select auth.uid()) and s.status in ('invited','active')
$$;
revoke all on function private.current_platform_staff_role() from public,anon,authenticated;

-- Preserve existing platform-owner behaviour while moving authorization to a
-- dedicated staff registry. The legacy profile flag remains a safe fallback
-- during rollout only.
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    (select s.role in ('owner','administrator')
     from public.platform_staff_members s
     where s.user_id=(select auth.uid()) and s.status in ('invited','active')),
    (select p.platform_role='admin' from public.profiles p where p.id=(select auth.uid())),
    false
  )
$$;
revoke all on function private.is_platform_admin() from public,anon,authenticated;

create or replace function public.get_my_platform_staff_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object('role',s.role,'status',s.status,'email',s.email)
    into result from public.platform_staff_members s where s.user_id=(select auth.uid());
  return coalesce(result,'null'::jsonb);
end;
$$;
revoke all on function public.get_my_platform_staff_access() from public,anon;
grant execute on function public.get_my_platform_staff_access() to authenticated;

create or replace function public.admin_list_platform_staff()
returns table(user_id uuid,email text,full_name text,role text,status text,invited_at timestamptz,
  accepted_at timestamptz,suspended_at timestamptz,suspension_reason text,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  return query select s.user_id,s.email,p.full_name,s.role,s.status,s.invited_at,
    s.accepted_at,s.suspended_at,s.suspension_reason,s.updated_at
  from public.platform_staff_members s left join public.profiles p on p.id=s.user_id
  order by case s.role when 'owner' then 0 when 'administrator' then 1 else 2 end,s.email;
end;
$$;
revoke all on function public.admin_list_platform_staff() from public,anon;
grant execute on function public.admin_list_platform_staff() to authenticated;

create or replace function public.admin_update_platform_staff(
  p_user_id uuid,p_action text,p_role text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; target public.platform_staff_members;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  actor_role:=private.current_platform_staff_role();
  select * into target from public.platform_staff_members where user_id=p_user_id for update;
  if not found then raise exception 'Staff member not found'; end if;
  if target.role='owner' and actor_role<>'owner' then raise exception 'Only the owner can manage owner access'; end if;
  if p_user_id=(select auth.uid()) and p_action in ('suspend','revoke') then raise exception 'You cannot remove your own access'; end if;
  if p_action='change_role' then
    if p_role not in ('administrator','finance','editorial','support','auditor') then raise exception 'Invalid staff role'; end if;
    if target.role='owner' then raise exception 'Owner access cannot be reassigned here'; end if;
    update public.platform_staff_members set role=p_role,updated_at=now() where user_id=p_user_id;
  elsif p_action='suspend' then
    if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A suspension reason is required'; end if;
    update public.platform_staff_members set status='suspended',suspended_at=now(),suspension_reason=trim(p_reason),updated_at=now() where user_id=p_user_id;
    delete from auth.sessions where user_id=p_user_id;
  elsif p_action='reactivate' then
    update public.platform_staff_members set status='active',accepted_at=coalesce(accepted_at,now()),suspended_at=null,suspension_reason=null,updated_at=now() where user_id=p_user_id;
  elsif p_action='revoke' then
    update public.platform_staff_members set status='revoked',suspended_at=now(),suspension_reason=nullif(trim(coalesce(p_reason,'')),''),updated_at=now() where user_id=p_user_id;
    delete from auth.sessions where user_id=p_user_id;
  else raise exception 'Invalid staff action'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),'platform_staff.'||p_action,'platform_staff',p_user_id::text,
    jsonb_build_object('previous_role',target.role,'new_role',p_role,'reason',p_reason));
  return jsonb_build_object('userId',p_user_id,'action',p_action);
end;
$$;
revoke all on function public.admin_update_platform_staff(uuid,text,text,text) from public,anon;
grant execute on function public.admin_update_platform_staff(uuid,text,text,text) to authenticated;

-- Quantix Sierra Leone is the platform owner. This is idempotent and does not
-- alter the user's subscriber organisations.
insert into public.platform_staff_members(user_id,email,role,status,accepted_at)
select u.id,lower(u.email),'owner','active',now() from auth.users u
where lower(u.email)='mabangura@quantixsl.com'
on conflict(user_id) do update set role='owner',status='active',email=excluded.email,updated_at=now();

commit;
