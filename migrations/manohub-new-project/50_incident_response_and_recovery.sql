-- Operational resilience: incident command, recovery objectives, and restore-exercise evidence.
begin;

create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('INC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  title text not null check (length(btrim(title)) between 5 and 180),
  summary text not null check (length(btrim(summary)) between 10 and 4000),
  affected_service text not null check (length(btrim(affected_service)) between 2 and 120),
  severity text not null check (severity in ('sev1', 'sev2', 'sev3', 'sev4')),
  status text not null default 'declared' check (status in ('declared', 'investigating', 'mitigated', 'monitoring', 'resolved', 'postmortem_complete')),
  incident_commander uuid references auth.users(id) on delete set null,
  customer_impact text,
  recovery_point_target_minutes integer not null default 1440 check (recovery_point_target_minutes between 0 and 10080),
  recovery_time_target_minutes integer not null default 240 check (recovery_time_target_minutes between 1 and 10080),
  declared_by uuid not null references auth.users(id) on delete restrict,
  declared_at timestamptz not null default now(),
  mitigated_at timestamptz,
  resolved_at timestamptz,
  postmortem_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.platform_incidents(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('declared', 'status_changed', 'commander_assigned', 'note_added')),
  from_status text,
  to_status text,
  note text not null check (length(btrim(note)) between 3 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.restore_exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_type text not null check (exercise_type in ('database', 'storage', 'cloudflare_configuration', 'dns', 'full_service')),
  environment text not null check (environment in ('staging', 'recovery_sandbox')),
  status text not null check (status in ('passed', 'passed_with_actions', 'failed')),
  backup_point_at timestamptz not null,
  started_at timestamptz not null,
  completed_at timestamptz not null check (completed_at >= started_at),
  achieved_rpo_minutes integer not null check (achieved_rpo_minutes >= 0),
  achieved_rto_minutes integer not null check (achieved_rto_minutes >= 0),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 500),
  findings text not null check (length(btrim(findings)) between 3 and 4000),
  performed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists platform_incidents_status_idx on public.platform_incidents(status, severity, declared_at desc);
create index if not exists platform_incident_events_incident_idx on public.platform_incident_events(incident_id, created_at desc);
create index if not exists restore_exercises_type_idx on public.restore_exercises(exercise_type, completed_at desc);

alter table public.platform_incidents enable row level security;
alter table public.platform_incident_events enable row level security;
alter table public.restore_exercises enable row level security;

revoke all on public.platform_incidents, public.platform_incident_events, public.restore_exercises from public, anon, authenticated;
grant select on public.platform_incidents, public.platform_incident_events, public.restore_exercises to authenticated;

create policy platform_incidents_admin_read on public.platform_incidents
  for select to authenticated using ((select public.is_platform_admin()));
create policy platform_incident_events_admin_read on public.platform_incident_events
  for select to authenticated using ((select public.is_platform_admin()));
create policy restore_exercises_admin_read on public.restore_exercises
  for select to authenticated using ((select public.is_platform_admin()));

create or replace function private.validate_incident_transition(p_from text, p_to text)
returns boolean language sql immutable set search_path='' as $$
  select (p_from, p_to) in (
    ('declared', 'investigating'),
    ('declared', 'mitigated'),
    ('investigating', 'mitigated'),
    ('mitigated', 'monitoring'),
    ('monitoring', 'investigating'),
    ('monitoring', 'resolved'),
    ('resolved', 'postmortem_complete')
  );
$$;
revoke all on function private.validate_incident_transition(text, text) from public, anon, authenticated;

create or replace function public.admin_declare_incident(
  p_title text,
  p_summary text,
  p_affected_service text,
  p_severity text,
  p_customer_impact text default null,
  p_rpo_minutes integer default 1440,
  p_rto_minutes integer default 240
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  insert into public.platform_incidents(
    title, summary, affected_service, severity, customer_impact,
    recovery_point_target_minutes, recovery_time_target_minutes,
    declared_by, incident_commander, postmortem_due_at
  ) values (
    btrim(p_title), btrim(p_summary), btrim(p_affected_service), p_severity, nullif(btrim(p_customer_impact), ''),
    p_rpo_minutes, p_rto_minutes, auth.uid(), auth.uid(),
    case when p_severity in ('sev1', 'sev2') then now() + interval '5 days' else now() + interval '10 days' end
  ) returning id into v_id;
  insert into public.platform_incident_events(incident_id, actor_id, event_type, to_status, note)
  values(v_id, auth.uid(), 'declared', 'declared', 'Incident declared');
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'incident.declared', 'platform_incident', v_id::text, jsonb_build_object('severity', p_severity, 'service', btrim(p_affected_service)));
  return v_id;
end; $$;
revoke all on function public.admin_declare_incident(text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_declare_incident(text,text,text,text,text,integer,integer) to authenticated;

create or replace function public.admin_transition_incident(p_incident_id uuid, p_status text, p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_from text;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  if length(btrim(coalesce(p_note, ''))) not between 3 and 4000 then raise exception 'A transition note is required'; end if;
  select status into v_from from public.platform_incidents where id=p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  if not private.validate_incident_transition(v_from, p_status) then raise exception 'Invalid incident transition: % to %', v_from, p_status; end if;
  update public.platform_incidents set status=p_status, updated_at=now(),
    mitigated_at=case when p_status='mitigated' then now() else mitigated_at end,
    resolved_at=case when p_status='resolved' then now() else resolved_at end
  where id=p_incident_id;
  insert into public.platform_incident_events(incident_id, actor_id, event_type, from_status, to_status, note)
  values(p_incident_id, auth.uid(), 'status_changed', v_from, p_status, btrim(p_note));
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'incident.status_changed', 'platform_incident', p_incident_id::text, jsonb_build_object('from_status', v_from, 'to_status', p_status));
  return true;
end; $$;
revoke all on function public.admin_transition_incident(uuid,text,text) from public, anon;
grant execute on function public.admin_transition_incident(uuid,text,text) to authenticated;

create or replace function public.admin_record_restore_exercise(
  p_exercise_type text,
  p_environment text,
  p_status text,
  p_backup_point_at timestamptz,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_achieved_rpo_minutes integer,
  p_achieved_rto_minutes integer,
  p_evidence_reference text,
  p_findings text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  insert into public.restore_exercises(
    exercise_type, environment, status, backup_point_at, started_at, completed_at,
    achieved_rpo_minutes, achieved_rto_minutes, evidence_reference, findings, performed_by
  ) values (
    p_exercise_type, p_environment, p_status, p_backup_point_at, p_started_at, p_completed_at,
    p_achieved_rpo_minutes, p_achieved_rto_minutes, btrim(p_evidence_reference), btrim(p_findings), auth.uid()
  ) returning id into v_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'recovery.exercise_recorded', 'restore_exercise', v_id::text,
    jsonb_build_object('exercise_type', p_exercise_type, 'status', p_status, 'achieved_rpo_minutes', p_achieved_rpo_minutes, 'achieved_rto_minutes', p_achieved_rto_minutes));
  return v_id;
end; $$;
revoke all on function public.admin_record_restore_exercise(text,text,text,timestamptz,timestamptz,timestamptz,integer,integer,text,text) from public, anon;
grant execute on function public.admin_record_restore_exercise(text,text,text,timestamptz,timestamptz,timestamptz,integer,integer,text,text) to authenticated;

create or replace function public.admin_list_incidents(p_status text default null, p_limit integer default 100)
returns table(
  id uuid, reference text, title text, summary text, affected_service text, severity text, status text,
  customer_impact text, recovery_point_target_minutes integer, recovery_time_target_minutes integer,
  declared_at timestamptz, updated_at timestamptz, postmortem_due_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select i.id,i.reference,i.title,i.summary,i.affected_service,i.severity,i.status,i.customer_impact,
    i.recovery_point_target_minutes,i.recovery_time_target_minutes,i.declared_at,i.updated_at,i.postmortem_due_at
  from public.platform_incidents i
  where p_status is null or i.status=p_status
  order by case i.severity when 'sev1' then 0 when 'sev2' then 1 when 'sev3' then 2 else 3 end, i.declared_at desc
  limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_incidents(text,integer) from public, anon;
grant execute on function public.admin_list_incidents(text,integer) to authenticated;

create or replace function public.admin_list_restore_exercises(p_limit integer default 50)
returns table(
  id uuid, exercise_type text, environment text, status text, backup_point_at timestamptz,
  started_at timestamptz, completed_at timestamptz, achieved_rpo_minutes integer,
  achieved_rto_minutes integer, evidence_reference text, findings text
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select e.id,e.exercise_type,e.environment,e.status,e.backup_point_at,e.started_at,e.completed_at,
    e.achieved_rpo_minutes,e.achieved_rto_minutes,e.evidence_reference,e.findings
  from public.restore_exercises e order by e.completed_at desc limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_restore_exercises(integer) from public, anon;
grant execute on function public.admin_list_restore_exercises(integer) to authenticated;

commit;
