-- Immutable procurement audit trail and least-privilege audit access.
-- Apply after 28_cms_role_indexes.sql.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_org_created_at_idx
  on public.audit_logs (org_id, created_at desc)
  where org_id is not null;
create index if not exists audit_logs_entity_created_at_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_action_created_at_idx
  on public.audit_logs (action, created_at desc);

revoke insert, update, delete, truncate on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;
revoke all on table public.audit_logs from anon;

-- Preserve historical identifiers instead of allowing ON DELETE SET NULL
-- foreign keys to rewrite immutable evidence.
alter table public.audit_logs
  drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs
  drop constraint if exists audit_logs_org_id_fkey;

drop policy if exists "Admins can view all audit logs" on public.audit_logs;
drop policy if exists "Org members can view their org audit logs" on public.audit_logs;
create policy audit_logs_platform_admin_read
on public.audit_logs
for select
to authenticated
using ((select public.is_platform_admin()));
create policy audit_logs_org_member_read
on public.audit_logs
for select
to authenticated
using (
  org_id is not null
  and (select public.is_org_member(org_id))
);

create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_org_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if nullif(btrim(p_action), '') is null
     or nullif(btrim(p_entity_type), '') is null
     or nullif(btrim(p_entity_id), '') is null then
    raise exception 'Action, entity type and entity ID are required';
  end if;
  if length(p_action) > 120 or length(p_entity_type) > 80 or length(p_entity_id) > 200 then
    raise exception 'Audit event identifier exceeds the allowed length';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Audit metadata must be a JSON object';
  end if;
  if p_org_id is null and not (select public.is_platform_admin()) then
    raise exception 'Organization context required';
  end if;
  if p_org_id is not null
     and not (select public.is_org_member(p_org_id))
     and not (select public.is_platform_admin()) then
    raise exception 'Organization access required';
  end if;

  insert into public.audit_logs (
    actor_id,
    org_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    (select auth.uid()),
    p_org_id,
    btrim(p_action),
    btrim(p_entity_type),
    btrim(p_entity_id),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.log_audit_event(text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, uuid, jsonb) to authenticated;

create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'Audit logs are immutable';
end;
$function$;

revoke all on function private.prevent_audit_log_mutation() from public, anon, authenticated;

drop trigger if exists audit_logs_prevent_mutation on public.audit_logs;
create trigger audit_logs_prevent_mutation
before update or delete on public.audit_logs
for each row execute function private.prevent_audit_log_mutation();

create or replace function private.capture_opportunity_audit()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  previous_status text;
  next_status text;
  audit_action text;
begin
  if tg_op = 'INSERT' then
    select code into next_status
    from public.opportunity_statuses
    where id = new.status_id;

    insert into public.audit_logs (
      actor_id, org_id, action, entity_type, entity_id, metadata
    )
    values (
      (select auth.uid()),
      new.buyer_org_id,
      'tender.submitted',
      'opportunity',
      new.id::text,
      jsonb_build_object(
        'new_state', jsonb_build_object(
          'status', next_status,
          'title', new.title,
          'submission_deadline', new.submission_deadline,
          'is_featured', new.is_featured
        ),
        'source', 'database_trigger'
      )
    );
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    select code into previous_status
    from public.opportunity_statuses
    where id = old.status_id;
    select code into next_status
    from public.opportunity_statuses
    where id = new.status_id;

    audit_action := case next_status
      when 'published' then 'tender.approved'
      when 'needs_correction' then 'tender.correction_requested'
      when 'rejected' then 'tender.rejected'
      when 'closed' then 'tender.closed'
      when 'cancelled' then 'tender.cancelled'
      when 'deadline_extended' then 'tender.deadline_extended'
      when 'awarded' then 'tender.awarded'
      when 'awaiting_review' then 'tender.resubmitted'
      else 'tender.status_changed'
    end;

    insert into public.audit_logs (
      actor_id, org_id, action, entity_type, entity_id, metadata
    )
    values (
      (select auth.uid()),
      new.buyer_org_id,
      audit_action,
      'opportunity',
      new.id::text,
      jsonb_build_object(
        'previous_state', jsonb_build_object(
          'status', previous_status,
          'submission_deadline', old.submission_deadline,
          'is_featured', old.is_featured
        ),
        'new_state', jsonb_build_object(
          'status', next_status,
          'submission_deadline', new.submission_deadline,
          'is_featured', new.is_featured
        ),
        'reason', new.review_note,
        'source', 'database_trigger'
      )
    );
  end if;

  if new.is_featured is distinct from old.is_featured then
    insert into public.audit_logs (
      actor_id, org_id, action, entity_type, entity_id, metadata
    )
    values (
      (select auth.uid()),
      new.buyer_org_id,
      case when new.is_featured then 'tender.featured' else 'tender.unfeatured' end,
      'opportunity',
      new.id::text,
      jsonb_build_object(
        'previous_state', jsonb_build_object('is_featured', old.is_featured),
        'new_state', jsonb_build_object('is_featured', new.is_featured),
        'source', 'database_trigger'
      )
    );
  end if;

  if new.submission_deadline is distinct from old.submission_deadline
     and new.status_id is not distinct from old.status_id then
    insert into public.audit_logs (
      actor_id, org_id, action, entity_type, entity_id, metadata
    )
    values (
      (select auth.uid()),
      new.buyer_org_id,
      'tender.deadline_changed',
      'opportunity',
      new.id::text,
      jsonb_build_object(
        'previous_state', jsonb_build_object(
          'submission_deadline', old.submission_deadline
        ),
        'new_state', jsonb_build_object(
          'submission_deadline', new.submission_deadline
        ),
        'source', 'database_trigger'
      )
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.capture_opportunity_audit() from public, anon, authenticated;

drop trigger if exists opportunities_capture_audit on public.opportunities;
create trigger opportunities_capture_audit
after insert or update of status_id, submission_deadline, is_featured, review_note
on public.opportunities
for each row execute function private.capture_opportunity_audit();

commit;
