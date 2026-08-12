-- Verified backup runs and disaster-recovery readiness evidence.
begin;

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  run_reference text not null unique,
  backup_kind text not null check (backup_kind in ('database','storage','configuration','full')),
  trigger_source text not null check (trigger_source in ('schedule','manual','restore_exercise')),
  status text not null check (status in ('running','succeeded','failed','verified')),
  backup_point_at timestamptz not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  object_count bigint check (object_count is null or object_count >= 0),
  byte_count bigint check (byte_count is null or byte_count >= 0),
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[a-f0-9]{64}$'),
  offsite_reference text,
  workflow_run_url text,
  failure_summary text,
  created_at timestamptz not null default now(),
  check ((status='running' and completed_at is null) or (status<>'running' and completed_at is not null)),
  check (status<>'failed' or length(btrim(coalesce(failure_summary,''))) between 3 and 1000)
);

create index if not exists backup_runs_status_started_idx on public.backup_runs(status, started_at desc);
create index if not exists backup_runs_kind_started_idx on public.backup_runs(backup_kind, started_at desc);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from public, anon, authenticated;

create table if not exists private.recovery_control_state (
  singleton boolean primary key default true check (singleton),
  database_method text not null default 'logical_export' check (database_method in ('logical_export','scheduled_backup','pitr')),
  storage_method text not null default 'encrypted_offsite_copy' check (storage_method='encrypted_offsite_copy'),
  target_rpo_minutes integer not null default 1440 check (target_rpo_minutes between 1 and 10080),
  target_rto_minutes integer not null default 240 check (target_rto_minutes between 1 and 10080),
  pitr_status text not null default 'unavailable' check (pitr_status in ('unavailable','configured','restore_verified')),
  schedule text not null default 'daily 02:17 UTC',
  updated_at timestamptz not null default now()
);
insert into private.recovery_control_state(singleton) values(true) on conflict(singleton) do nothing;
revoke all on private.recovery_control_state from public, anon, authenticated;

create or replace function private.record_backup_run(
  p_run_reference text, p_backup_kind text, p_trigger_source text, p_status text,
  p_backup_point_at timestamptz, p_started_at timestamptz, p_completed_at timestamptz,
  p_object_count bigint, p_byte_count bigint, p_manifest_sha256 text,
  p_offsite_reference text, p_workflow_run_url text, p_failure_summary text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if current_user not in ('postgres','supabase_admin') then raise exception 'Backup recorder role required'; end if;
  insert into public.backup_runs(run_reference,backup_kind,trigger_source,status,backup_point_at,started_at,completed_at,
    object_count,byte_count,manifest_sha256,offsite_reference,workflow_run_url,failure_summary)
  values(btrim(p_run_reference),p_backup_kind,p_trigger_source,p_status,p_backup_point_at,p_started_at,p_completed_at,
    p_object_count,p_byte_count,nullif(lower(btrim(p_manifest_sha256)),''),nullif(btrim(p_offsite_reference),''),
    nullif(btrim(p_workflow_run_url),''),nullif(btrim(p_failure_summary),''))
  on conflict(run_reference) do update set status=excluded.status,completed_at=excluded.completed_at,
    object_count=coalesce(excluded.object_count,backup_runs.object_count),byte_count=coalesce(excluded.byte_count,backup_runs.byte_count),
    manifest_sha256=coalesce(excluded.manifest_sha256,backup_runs.manifest_sha256),
    offsite_reference=coalesce(excluded.offsite_reference,backup_runs.offsite_reference),
    workflow_run_url=excluded.workflow_run_url,failure_summary=excluded.failure_summary
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function private.record_backup_run(text,text,text,text,timestamptz,timestamptz,timestamptz,bigint,bigint,text,text,text,text) from public, anon, authenticated;

create or replace function public.admin_list_backup_runs(p_limit integer default 50)
returns table(id uuid,run_reference text,backup_kind text,trigger_source text,status text,backup_point_at timestamptz,
  started_at timestamptz,completed_at timestamptz,object_count bigint,byte_count bigint,manifest_sha256 text,
  offsite_reference text,workflow_run_url text,failure_summary text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select r.id,r.run_reference,r.backup_kind,r.trigger_source,r.status,r.backup_point_at,r.started_at,
    r.completed_at,r.object_count,r.byte_count,r.manifest_sha256,r.offsite_reference,r.workflow_run_url,r.failure_summary
  from public.backup_runs r order by r.started_at desc limit least(greatest(p_limit,1),200);
end; $$;
revoke all on function public.admin_list_backup_runs(integer) from public, anon;
grant execute on function public.admin_list_backup_runs(integer) to authenticated;

create or replace function public.admin_get_recovery_readiness()
returns table(database_method text,storage_method text,target_rpo_minutes integer,target_rto_minutes integer,
  pitr_status text,schedule text,last_success_at timestamptz,last_verified_restore_at timestamptz,backup_overdue boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  return query select c.database_method,c.storage_method,c.target_rpo_minutes,c.target_rto_minutes,c.pitr_status,c.schedule,
    (select max(r.completed_at) from public.backup_runs r where r.status in ('succeeded','verified')),
    (select max(e.completed_at) from public.restore_exercises e where e.status in ('passed','passed_with_actions')),
    coalesce((select max(r.completed_at) < now()-(c.target_rpo_minutes||' minutes')::interval
      from public.backup_runs r where r.status in ('succeeded','verified')),true)
  from private.recovery_control_state c where c.singleton;
end; $$;
revoke all on function public.admin_get_recovery_readiness() from public, anon;
grant execute on function public.admin_get_recovery_readiness() to authenticated;

commit;
