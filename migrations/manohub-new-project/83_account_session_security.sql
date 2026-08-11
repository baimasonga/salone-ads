-- Account and Session Security: observed login history, safe self-service revocation and AAL2 step-up.
begin;

create schema if not exists private;

create table if not exists private.account_session_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  ip_address inet,
  user_agent text,
  assurance_level text not null check (assurance_level in ('aal1','aal2')),
  unusual boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id,session_id)
);
create index if not exists account_session_events_user_recent_idx on private.account_session_events(user_id,last_seen_at desc);
alter table private.account_session_events enable row level security;
revoke all on table private.account_session_events from public,anon,authenticated;
grant select,insert,update,delete on table private.account_session_events to service_role;

create or replace function public.observe_my_account_session()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select auth.uid()); sid uuid; current_session auth.sessions; prior_count integer; familiar boolean; flagged boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  sid:=nullif((select auth.jwt()->>'session_id'),'')::uuid;
  if sid is null then raise exception 'Session identifier is required'; end if;
  select * into current_session from auth.sessions s where s.id=sid and s.user_id=actor;
  if not found then raise exception 'Active session not found'; end if;
  select count(*),coalesce(bool_or(e.ip_address is not distinct from current_session.ip and e.user_agent is not distinct from current_session.user_agent),false)
    into prior_count,familiar from private.account_session_events e where e.user_id=actor and e.session_id<>sid and e.last_seen_at>=now()-interval '90 days';
  flagged:=prior_count>0 and not familiar;
  insert into private.account_session_events(user_id,session_id,ip_address,user_agent,assurance_level,unusual,first_seen_at,last_seen_at)
  values(actor,sid,current_session.ip,current_session.user_agent,current_session.aal::text,flagged,current_session.created_at,now())
  on conflict(user_id,session_id) do update set ip_address=excluded.ip_address,user_agent=excluded.user_agent,
    assurance_level=excluded.assurance_level,last_seen_at=now(),unusual=private.account_session_events.unusual or excluded.unusual;
  if flagged and not exists(select 1 from public.notifications n where n.user_id=actor and n.category='security' and n.metadata->>'sessionId'=sid::text) then
    insert into public.notifications(user_id,category,title,body,link_url,priority,action_label,workspace_target,metadata)
    values(actor,'security','New sign-in detected','A new device or network signed in to your Manohub account. Review active sessions if this was not you.',
      '/?workspace=account-security','high','Review sessions','account-security',jsonb_build_object('sessionId',sid,'ipAddress',coalesce(host(current_session.ip),'Unavailable')));
  end if;
  return jsonb_build_object('sessionId',sid,'unusual',flagged);
end;
$$;
revoke all on function public.observe_my_account_session() from public,anon;
grant execute on function public.observe_my_account_session() to authenticated,service_role;

create or replace function public.get_my_account_security()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); sid uuid:=nullif((select auth.jwt()->>'session_id'),'')::uuid; sessions jsonb; recent jsonb; enabled boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') into enabled;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'lastSeenAt',coalesce(s.refreshed_at::timestamptz,s.updated_at),
    'userAgent',coalesce(s.user_agent,'Unknown device'),'ipAddress',coalesce(host(s.ip),'Unavailable'),'assuranceLevel',s.aal::text,
    'current',s.id=sid,'unusual',coalesce(e.unusual,false)) order by coalesce(s.refreshed_at::timestamptz,s.updated_at) desc),'[]'::jsonb)
    into sessions from auth.sessions s left join private.account_session_events e on e.user_id=s.user_id and e.session_id=s.id where s.user_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.session_id,'createdAt',e.first_seen_at,'lastSeenAt',e.last_seen_at,
    'userAgent',coalesce(e.user_agent,'Unknown device'),'ipAddress',coalesce(host(e.ip_address),'Unavailable'),'assuranceLevel',e.assurance_level,
    'current',e.session_id=sid,'unusual',e.unusual) order by e.last_seen_at desc),'[]'::jsonb) into recent
    from (select * from private.account_session_events x where x.user_id=actor order by x.last_seen_at desc limit 20) e;
  return jsonb_build_object('mfaEnabled',enabled,'sessions',sessions,'recentLogins',recent);
end;
$$;
revoke all on function public.get_my_account_security() from public,anon;
grant execute on function public.get_my_account_security() to authenticated,service_role;

create or replace function public.revoke_my_account_session(p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); current_sid uuid:=nullif((select auth.jwt()->>'session_id'),'')::uuid; has_mfa boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_session_id=current_sid then raise exception 'Use sign out to end the current session'; end if;
  select exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.status='verified') into has_mfa;
  if has_mfa and coalesce((select auth.jwt()->>'aal'),'aal1')<>'aal2' then raise exception 'Additional verification is required'; end if;
  delete from auth.sessions s where s.id=p_session_id and s.user_id=actor;
  if not found then raise exception 'Session not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(actor,'account.session.revoked','auth_session',p_session_id::text,jsonb_build_object('selfService',true));
end;
$$;
revoke all on function public.revoke_my_account_session(uuid) from public,anon;
grant execute on function public.revoke_my_account_session(uuid) to authenticated,service_role;

create or replace function private.enforce_sensitive_command_step_up()
returns trigger language plpgsql security definer set search_path='' as $$
declare jwt_role text:=coalesce((select auth.jwt()->>'role'),'');
begin
  if jwt_role in ('','service_role') then return new; end if;
  if new.command_name=any(array['organization.transition','organization.recovery.decide','organization.purge','subscription.transition',
    'organization.verification.approve','billing.payment.record','billing.credit.issue','billing.refund.record','platform_staff.update','platform_intake_control.update'])
    and coalesce((select auth.jwt()->>'aal'),'aal1')<>'aal2' then
    raise exception 'Additional verification is required before this sensitive action' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_sensitive_command_step_up() from public,anon,authenticated;
grant execute on function private.enforce_sensitive_command_step_up() to service_role;
drop trigger if exists enforce_sensitive_command_step_up on public.backend_command_requests;
create trigger enforce_sensitive_command_step_up before insert on public.backend_command_requests
for each row execute function private.enforce_sensitive_command_step_up();

commit;
