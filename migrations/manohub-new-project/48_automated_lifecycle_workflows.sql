-- Idempotent lifecycle automation using the existing state machines,
-- notification centre, audit log, outbox and pg_cron scheduler.
create unique index if not exists notifications_automation_key_idx
  on public.notifications(user_id,(metadata->>'automation_key'))
  where metadata ? 'automation_key';

create table if not exists public.lifecycle_automation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check(status in ('running','completed','failed')),
  tenders_closed integer not null default 0,
  reminders_created integer not null default 0,
  campaigns_activated integer not null default 0,
  campaigns_completed integer not null default 0,
  subscriptions_changed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.lifecycle_automation_runs enable row level security;
revoke all on public.lifecycle_automation_runs from public,anon,authenticated;
grant select on public.lifecycle_automation_runs to authenticated;
create policy lifecycle_automation_runs_admin_read on public.lifecycle_automation_runs
  for select to authenticated using(public.is_platform_admin());

create or replace function private.create_lifecycle_notification(
  p_user_id uuid,p_org_id uuid,p_category text,p_title text,p_body text,
  p_workspace_target text,p_action_label text,p_automation_key text,p_metadata jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 insert into public.notifications(
   user_id,org_id,category,title,body,link_url,channel,status,priority,
   workspace_target,action_label,metadata
 ) values(
   p_user_id,p_org_id,p_category,p_title,p_body,null,'in_app','pending','high',
   p_workspace_target,p_action_label,
   coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('automation_key',p_automation_key)
 ) on conflict do nothing;
 get diagnostics v_count=row_count;
 return v_count=1;
end; $$;
revoke all on function private.create_lifecycle_notification(uuid,uuid,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;

create or replace function private.run_lifecycle_automation()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_run_id uuid; v_tenders integer:=0; v_reminders integer:=0;
 v_activated integer:=0; v_completed integer:=0; v_subscriptions integer:=0;
 v_row record; v_user record; v_event text; v_from text; v_to text; v_reason text;
begin
 insert into public.lifecycle_automation_runs default values returning id into v_run_id;
 begin

 -- Notify saved-tender watchers at seven, three and one day, with a unique key
 -- per deadline version so a later deadline extension can notify again.
 for v_row in
   select o.id,o.slug,o.title,o.buyer_org_id,o.submission_deadline,
     (o.submission_deadline::date-current_date)::integer days_left
   from public.opportunities o join public.opportunity_statuses s on s.id=o.status_id
   where s.code in ('published','amended','deadline_extended')
     and o.submission_deadline::date-current_date in (7,3,1)
 loop
   for v_user in
     select distinct recipients.user_id from (
       select so.user_id from public.saved_opportunities so where so.opportunity_id=v_row.id
       union
       select om.user_id from public.organization_members om
       where om.org_id=v_row.buyer_org_id and om.role in ('owner','admin')
     ) recipients
   loop
     if private.create_lifecycle_notification(
       v_user.user_id,v_row.buyer_org_id,'deadline_reminder',
       case when v_row.days_left=1 then 'Tender deadline tomorrow: ' else 'Tender deadline approaching: ' end||v_row.title,
       'Submission closes on '||to_char(v_row.submission_deadline,'DD Mon YYYY HH24:MI')||'.',
       'tenders','View tender',
       'tender:'||v_row.id::text||':deadline:'||v_row.submission_deadline::text||':'||v_row.days_left::text,
       jsonb_build_object('opportunity_id',v_row.id,'days_left',v_row.days_left)
     ) then v_reminders:=v_reminders+1; end if;
   end loop;
 end loop;

 -- Closing through a normal status update invokes migration 47's state machine,
 -- immutable transition history, audit entry and outbox event.
 update public.opportunities o set status_id=s_closed.id
 from public.opportunity_statuses s_current,public.opportunity_statuses s_closed
 where o.status_id=s_current.id and s_closed.code='closed'
   and s_current.code in ('published','amended','deadline_extended')
   and o.submission_deadline<now();
 get diagnostics v_tenders=row_count;

 -- Reuse the existing proven campaign scheduler. Its updates are now also
 -- validated and recorded by the central campaign state machine.
 select activated,completed into v_activated,v_completed
 from private.run_ad_campaign_schedule();

 -- Subscription reminders go to organization owners/admins and are deduplicated
 -- by subscription, milestone and current period/trial date.
 for v_row in
   select s.id,s.org_id,s.status,s.trial_ends_at,s.current_period_end,s.grace_ends_at
   from public.subscriptions s
   where (s.status='trialing' and s.trial_ends_at-current_date in (7,3,1))
      or (s.status='active' and s.current_period_end-current_date in (7,3,1))
      or (s.status='grace_period' and s.grace_ends_at-current_date in (3,1))
 loop
   for v_user in select user_id from public.organization_members
     where org_id=v_row.org_id and role in ('owner','admin')
   loop
     if private.create_lifecycle_notification(
       v_user.user_id,v_row.org_id,'subscriptions',
       case v_row.status when 'trialing' then 'Trial ending soon'
         when 'grace_period' then 'Subscription suspension approaching'
         else 'Subscription renewal approaching' end,
       case v_row.status when 'trialing' then 'Your trial ends on '||to_char(v_row.trial_ends_at,'DD Mon YYYY')||'.'
         when 'grace_period' then 'Your grace period ends on '||to_char(v_row.grace_ends_at,'DD Mon YYYY')||'.'
         else 'Your current subscription period ends on '||to_char(v_row.current_period_end,'DD Mon YYYY')||'.' end,
       'billing','Review subscription',
       'subscription:'||v_row.id::text||':'||v_row.status||':'||
         coalesce(v_row.trial_ends_at,v_row.grace_ends_at,v_row.current_period_end)::text,
       jsonb_build_object('subscription_id',v_row.id,'milestone',v_row.status)
     ) then v_reminders:=v_reminders+1; end if;
   end loop;
 end loop;

 -- Apply automated subscription transitions in deterministic order and retain
 -- the existing domain-specific subscription events used by the outbox.
 for v_row in
   select * from public.subscriptions
   where cancel_at_period_end and current_period_end<current_date
      or status='trialing' and trial_ends_at<current_date
      or status='active' and current_period_end<current_date
      or status='grace_period' and grace_ends_at<current_date
   order by created_at for update
 loop
   v_from:=v_row.status; v_reason:=null;
   if v_row.cancel_at_period_end and v_row.current_period_end<current_date then
     v_to:='cancelled'; v_event:='cancelled'; v_reason:='Scheduled cancellation reached its effective date';
     update public.subscriptions set status=v_to,cancel_at_period_end=false,cancelled_at=now(),
       notes=coalesce(notes,v_reason),updated_at=now() where id=v_row.id;
   elsif v_row.status='trialing' and v_row.trial_ends_at<current_date then
     v_to:='expired'; v_event:='expired'; v_reason:='Trial period ended';
     update public.subscriptions set status=v_to,updated_at=now() where id=v_row.id;
   elsif v_row.status='active' and v_row.current_period_end<current_date then
     v_to:='past_due'; v_event:='past_due'; v_reason:='Subscription period ended without renewal';
     update public.subscriptions set status=v_to,grace_ends_at=current_date+7,updated_at=now() where id=v_row.id;
   else
     v_to:='suspended'; v_event:='suspended'; v_reason:='Automatic suspension after grace period';
     update public.subscriptions set status=v_to,suspended_at=now(),suspension_reason=v_reason,updated_at=now()
     where id=v_row.id;
   end if;
   insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason,metadata)
   values(v_row.id,v_row.org_id,v_event,v_from,v_to,v_reason,jsonb_build_object('source','lifecycle_automation','run_id',v_run_id));
   v_subscriptions:=v_subscriptions+1;
 end loop;

 update public.lifecycle_automation_runs set status='completed',tenders_closed=v_tenders,
   reminders_created=v_reminders,campaigns_activated=coalesce(v_activated,0),
   campaigns_completed=coalesce(v_completed,0),subscriptions_changed=v_subscriptions,
   completed_at=now() where id=v_run_id;
 return jsonb_build_object('run_id',v_run_id,'tenders_closed',v_tenders,'reminders_created',v_reminders,
   'campaigns_activated',coalesce(v_activated,0),'campaigns_completed',coalesce(v_completed,0),
   'subscriptions_changed',v_subscriptions);
exception when others then
 update public.lifecycle_automation_runs set status='failed',error_message=left(sqlerrm,2000),completed_at=now()
 where id=v_run_id;
 return jsonb_build_object('run_id',v_run_id,'status','failed','error',sqlerrm);
 end;
end; $$;
revoke all on function private.run_lifecycle_automation() from public,anon,authenticated;
grant execute on function private.run_lifecycle_automation() to service_role;

create or replace function public.admin_list_lifecycle_automation_runs(p_limit integer default 25)
returns setof public.lifecycle_automation_runs language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 return query select * from public.lifecycle_automation_runs order by started_at desc
 limit least(greatest(p_limit,1),100);
end; $$;
revoke all on function public.admin_list_lifecycle_automation_runs(integer) from public,anon;
grant execute on function public.admin_list_lifecycle_automation_runs(integer) to authenticated;

do $$
declare v_job bigint;
begin
 select jobid into v_job from cron.job where jobname='manohub-lifecycle-automation' limit 1;
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule('manohub-lifecycle-automation','15 * * * *','select private.run_lifecycle_automation();');
end; $$;
