-- Correctness fixes for the workflow state machines, quota enforcement,
-- organization recovery and lifecycle automation introduced in 42-49.
-- Apply after 50_incident_response_and_recovery.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Complete the workflow transition catalogue.
--
-- Migration 47 began enforcing a whitelist on tenders, campaigns, editorial
-- content and subscriptions. Three vocabularies were incomplete, so legitimate
-- transitions that the application and the automation already perform were
-- rejected at the trigger.
-- ---------------------------------------------------------------------------
insert into public.workflow_transition_rules(domain,from_status,to_status,requires_reason,to_is_terminal,description) values
-- Tenders: the seeded status vocabulary also contains approved, scheduled and
-- archived, which had no rules at all.
('tender','awaiting_review','approved',false,false,'Approve without publishing yet'),
('tender','approved','scheduled',false,false,'Schedule approved tender for publication'),
('tender','approved','published',false,false,'Publish approved tender'),
('tender','approved','needs_correction',true,false,'Request correction after approval'),
('tender','approved','cancelled',false,true,'Cancel approved tender'),
('tender','scheduled','published',false,false,'Publish scheduled tender'),
('tender','scheduled','cancelled',false,true,'Cancel scheduled tender'),
('tender','published','archived',false,true,'Archive published tender'),
('tender','closed','archived',false,true,'Archive closed tender'),
('tender','awarded','archived',false,true,'Archive awarded tender'),
('tender','cancelled','archived',false,true,'Archive cancelled tender'),
('tender','rejected','archived',false,true,'Archive rejected tender'),
-- Campaigns: returning an approved campaign for further work, and withdrawing
-- a submission, are ordinary operations the review queue needs.
('campaign','submitted','draft',false,false,'Withdraw campaign submission'),
('campaign','approved','draft',false,false,'Return approved campaign to draft'),
('campaign','approved','submitted',false,false,'Send approved campaign back for review'),
('campaign','approved','rejected',true,true,'Revoke campaign approval'),
-- Subscriptions: transition_subscription accepts 'cancel' from every state
-- except 'cancelled', and lifecycle automation reaches this pair whenever a
-- scheduled cancellation outlives the subscription's expiry.
('subscription','expired','cancelled',false,true,'Cancel an expired subscription')
on conflict(domain,from_status,to_status) do update set
 requires_reason=excluded.requires_reason,to_is_terminal=excluded.to_is_terminal,
 description=excluded.description,enabled=true;

-- ---------------------------------------------------------------------------
-- 2. Entitlements must follow the subscription lifecycle.
--
-- 42 introduced trialing/past_due/grace_period, but this helper still matched
-- only 'active' and therefore silently downgraded paying organizations to the
-- free plan. get_org_quota_snapshot already treats all four as current, so the
-- quota panel and the enforcement path disagreed.
-- ---------------------------------------------------------------------------
create or replace function public.get_org_feature_limit(
  p_org_id uuid,
  p_feature_key text
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  result integer;
begin
  if not public.is_org_member(p_org_id) and not public.is_platform_admin() then
    raise exception 'Organization access required';
  end if;

  -- A NULL limit_value on a matched row means "unlimited" and must be returned
  -- as-is; only a missing row falls through to the free plan.
  select pf.limit_value into result
  from public.subscriptions s
  join public.plan_features pf
    on pf.plan_id = s.plan_id and pf.feature_key = p_feature_key
  where s.org_id = p_org_id
    and s.status in ('trialing', 'active', 'past_due', 'grace_period')
  order by
    case s.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      else 3
    end,
    s.created_at desc
  limit 1;

  if found then
    return result;
  end if;

  select pf.limit_value into result
  from public.plans p
  join public.plan_features pf
    on pf.plan_id = p.id and pf.feature_key = p_feature_key
  where p.code = 'free';
  return result;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. An unlimited quota is not an unknown quota.
--
-- get_effective_org_quota returns NULL both for "this plan grants the feature
-- without a ceiling" and for "no such feature". consume_org_quota treated both
-- as an error, so every metered action failed on plans with unlimited features.
-- ---------------------------------------------------------------------------
create or replace function public.consume_org_quota(p_org_id uuid, p_meter_key text, p_amount integer default 1, p_idempotency_key text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer; v_value bigint; v_defined boolean;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if (select auth.uid()) is null or not (public.is_platform_admin() or public.is_org_member(p_org_id)) then raise exception 'Organization access is required'; end if;
  if p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid usage amount'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')), '') is null then raise exception 'An idempotency key is required'; end if;

  v_defined :=
    exists(select 1 from public.organization_quota_overrides qo
            where qo.org_id = p_org_id and qo.feature_key = p_meter_key
              and (qo.expires_at is null or qo.expires_at > now()))
    or exists(select 1 from public.plan_features pf where pf.feature_key = p_meter_key);
  if not v_defined then raise exception 'Unknown quota meter: %', p_meter_key; end if;

  -- NULL from here means the feature is granted without a ceiling.
  v_limit := public.get_effective_org_quota(p_org_id, p_meter_key);

  insert into public.organization_usage_events(org_id,meter_key,amount,idempotency_key)
  values(p_org_id,p_meter_key,p_amount,trim(p_idempotency_key))
  on conflict(org_id,meter_key,idempotency_key) do nothing;
  if not found then
    select current_value into v_value from public.organization_usage_meters
      where org_id=p_org_id and meter_key=p_meter_key and period_start=v_period_start;
    return coalesce(v_value,0);
  end if;
  insert into public.organization_usage_meters(org_id,meter_key,period_start,period_end,current_value)
  values(p_org_id,p_meter_key,v_period_start,v_period_end,p_amount)
  on conflict(org_id,meter_key,period_start) do update set current_value=public.organization_usage_meters.current_value+p_amount,updated_at=now()
  returning current_value into v_value;
  if v_limit is not null and v_value > v_limit then
    raise exception 'Quota exceeded for % (% of %)', p_meter_key, v_value, v_limit;
  end if;
  return v_value;
end; $$;
revoke all on function public.consume_org_quota(uuid,text,integer,text) from public, anon;
grant execute on function public.consume_org_quota(uuid,text,integer,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rejecting a recovery request must not resurrect a closed organization.
--
-- The reject path forced every organization to 'suspended' and cleared
-- closed_at/recoverable_until, which discarded the 30-day closure deadline and
-- let an owner re-request recovery indefinitely.
-- ---------------------------------------------------------------------------
alter table public.organization_recovery_requests
  add column if not exists previous_status text;

create or replace function public.request_organization_recovery(p_org_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.organization_members where org_id=p_org_id and user_id=auth.uid() and role='owner')
   then raise exception 'Organization owner access required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
   raise exception 'Recovery reason must be between 10 and 1000 characters'; end if;
 select status into v_status from public.organizations where id=p_org_id for update;
 if v_status not in ('suspended','closed') then raise exception 'Organization is not eligible for recovery'; end if;
 if v_status='closed' and (select recoverable_until<now() from public.organizations where id=p_org_id)
   then raise exception 'The recovery period has expired'; end if;
 insert into public.organization_recovery_requests(org_id,requested_by,reason,previous_status)
 values(p_org_id,auth.uid(),trim(p_reason),v_status) returning id into v_id;
 perform set_config('app.organization_lifecycle_override','on',true);
 update public.organizations set status='recovery_pending',updated_at=now() where id=p_org_id;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason,metadata)
 values(p_org_id,auth.uid(),'recovery_requested',v_status,'recovery_pending',trim(p_reason),jsonb_build_object('request_id',v_id));
 return v_id;
end; $$;
revoke all on function public.request_organization_recovery(uuid,text) from public,anon;
grant execute on function public.request_organization_recovery(uuid,text) to authenticated;

create or replace function public.admin_decide_organization_recovery(p_request_id uuid,p_approve boolean,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_req public.organization_recovery_requests; v_from text; v_to text; v_event text; v_sub record;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_note,''))) not between 5 and 1000 then raise exception 'Decision note is required'; end if;
 select * into v_req from public.organization_recovery_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'Pending recovery request not found'; end if;
 select status into v_from from public.organizations where id=v_req.org_id for update;
 -- A rejected request returns the organization to the state it was in before
 -- the request, preserving an existing closure and its recovery deadline.
 v_to:=case when p_approve then 'active' else coalesce(v_req.previous_status,'suspended') end;
 v_event:=case when p_approve then 'recovery_approved' else 'recovery_rejected' end;
 update public.organization_recovery_requests set status=case when p_approve then 'approved' else 'rejected' end,
   decided_by=auth.uid(),decision_note=trim(p_note),decided_at=now() where id=p_request_id;
 perform set_config('app.organization_lifecycle_override','on',true);
 if p_approve then
   update public.organizations set status=v_to,status_reason=null,suspended_at=null,suspended_by=null,
     closed_at=null,recoverable_until=null,updated_at=now() where id=v_req.org_id;
 else
   update public.organizations set status=v_to,status_reason=trim(p_note),
     suspended_at=case when v_to='suspended' then coalesce(suspended_at,now()) else suspended_at end,
     suspended_by=case when v_to='suspended' then coalesce(suspended_by,auth.uid()) else suspended_by end,
     updated_at=now() where id=v_req.org_id;
 end if;
 if p_approve then
   for v_sub in select id from public.subscriptions where org_id=v_req.org_id and status='suspended'
     and suspension_reason like 'Organization suspended:%' for update
   loop
     update public.subscriptions set status='active',suspended_at=null,suspension_reason=null,updated_at=now()
     where id=v_sub.id;
     insert into public.subscription_events(subscription_id,org_id,event_type,from_status,to_status,reason)
     values(v_sub.id,v_req.org_id,'resumed','suspended','active','Organization recovery approved');
   end loop;
 end if;
 insert into public.organization_lifecycle_events(org_id,actor_id,event_type,from_status,to_status,reason,metadata)
 values(v_req.org_id,auth.uid(),v_event,v_from,v_to,trim(p_note),jsonb_build_object('request_id',p_request_id));
 return true;
end; $$;
revoke all on function public.admin_decide_organization_recovery(uuid,boolean,text) from public,anon;
grant execute on function public.admin_decide_organization_recovery(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Only payable invoices accept payments.
-- ---------------------------------------------------------------------------
create or replace function public.record_commercial_payment(p_invoice_id uuid,p_reference text,p_method text,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$ declare v_i public.commercial_invoices; v_payment uuid; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 select * into v_i from public.commercial_invoices where id=p_invoice_id for update; if not found then raise exception 'Invoice not found'; end if;
 if v_i.status not in ('issued','partially_paid','overdue') then
   raise exception 'Invoice % cannot accept payments while it is %', v_i.invoice_number, v_i.status; end if;
 if p_amount<=0 or v_i.amount_paid+p_amount>v_i.total_amount then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.commercial_payments(org_id,payment_reference,method,currency_code,amount,verified_by) values(v_i.org_id,trim(p_reference),p_method,v_i.currency_code,p_amount,auth.uid()) returning id into v_payment;
 insert into public.commercial_payment_allocations values(v_payment,v_i.id,p_amount,now());
 update public.commercial_invoices set amount_paid=amount_paid+p_amount,status=case when amount_paid+p_amount=total_amount then 'paid' else 'partially_paid' end where id=v_i.id;
 insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,actor_id) values(v_i.org_id,'payment','credit',p_amount,v_i.currency_code,'commercial_payment',v_payment,'Payment '||trim(p_reference),auth.uid());
 return v_payment; end; $$;
revoke all on function public.record_commercial_payment(uuid,text,text,numeric) from public,anon;
grant execute on function public.record_commercial_payment(uuid,text,text,numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notification self-service is limited to read/archive.
--
-- 41 granted a direct column UPDATE so the RPCs could run as invoker. The
-- policy allowed any status value, including resurrecting a row as 'pending'.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status in ('read','archived'));

-- ---------------------------------------------------------------------------
-- 7. Lifecycle automation must survive a single bad row.
--
-- Every workload shared one savepoint, so one rejected transition rolled back
-- the deadline reminders, tender closures, campaign scheduling and every
-- subscription change in the same hourly run — permanently, because the same
-- row was retried on the next run.
-- ---------------------------------------------------------------------------
alter table public.lifecycle_automation_runs drop constraint if exists lifecycle_automation_runs_status_check;
alter table public.lifecycle_automation_runs add constraint lifecycle_automation_runs_status_check
  check(status in ('running','completed','completed_with_errors','failed'));

create or replace function private.run_lifecycle_automation()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_run_id uuid; v_tenders integer:=0; v_reminders integer:=0;
 v_activated integer:=0; v_completed integer:=0; v_subscriptions integer:=0;
 v_row record; v_user record; v_event text; v_from text; v_to text; v_reason text;
 v_errors text[]:=array[]::text[];
begin
 -- The run row is inserted outside the catch-all block so that its own
 -- savepoint cannot roll the record away before the handler updates it.
 insert into public.lifecycle_automation_runs default values returning id into v_run_id;
 begin

 -- Notify saved-tender watchers at seven, three and one day, with a unique key
 -- per deadline version so a later deadline extension can notify again.
 begin
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
 exception when others then
   v_errors:=v_errors||('tender_reminders: '||left(sqlerrm,300));
 end;

 -- Closing through a normal status update invokes migration 47's state machine,
 -- immutable transition history, audit entry and outbox event.
 begin
   update public.opportunities o set status_id=s_closed.id
   from public.opportunity_statuses s_current,public.opportunity_statuses s_closed
   where o.status_id=s_current.id and s_closed.code='closed'
     and s_current.code in ('published','amended','deadline_extended')
     and o.submission_deadline<now();
   get diagnostics v_tenders=row_count;
 exception when others then
   v_tenders:=0;
   v_errors:=v_errors||('tender_close: '||left(sqlerrm,300));
 end;

 -- Reuse the existing proven campaign scheduler. Its updates are now also
 -- validated and recorded by the central campaign state machine.
 begin
   select activated,completed into v_activated,v_completed
   from private.run_ad_campaign_schedule();
 exception when others then
   v_activated:=0; v_completed:=0;
   v_errors:=v_errors||('campaign_schedule: '||left(sqlerrm,300));
 end;

 -- Subscription reminders go to organization owners/admins and are deduplicated
 -- by subscription, milestone and current period/trial date.
 begin
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
 exception when others then
   v_errors:=v_errors||('subscription_reminders: '||left(sqlerrm,300));
 end;

 -- Apply automated subscription transitions in deterministic order. Each row is
 -- isolated so an unexpected rejection cannot discard the rest of the batch.
 -- The scheduled-cancellation branch covers every state the state machine can
 -- still leave for 'cancelled', which includes 'expired' and 'suspended' — both
 -- retain cancel_at_period_end, so excluding them would strand the flag forever.
 for v_row in
   select * from public.subscriptions
   where (cancel_at_period_end and current_period_end<current_date
           and status <> 'cancelled')
      or (status='trialing' and trial_ends_at<current_date)
      or (status='active' and current_period_end<current_date)
      or (status='grace_period' and grace_ends_at<current_date)
   order by created_at
 loop
   begin
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
   exception when others then
     v_errors:=v_errors||('subscription:'||v_row.id::text||': '||left(sqlerrm,300));
   end;
 end loop;

 update public.lifecycle_automation_runs
 set status=case when cardinality(v_errors)>0 then 'completed_with_errors' else 'completed' end,
   tenders_closed=v_tenders,reminders_created=v_reminders,
   campaigns_activated=coalesce(v_activated,0),campaigns_completed=coalesce(v_completed,0),
   subscriptions_changed=v_subscriptions,
   error_message=case when cardinality(v_errors)>0 then left(array_to_string(v_errors,E'\n'),2000) else null end,
   completed_at=now()
 where id=v_run_id;

 return jsonb_build_object('run_id',v_run_id,'tenders_closed',v_tenders,'reminders_created',v_reminders,
   'campaigns_activated',coalesce(v_activated,0),'campaigns_completed',coalesce(v_completed,0),
   'subscriptions_changed',v_subscriptions,'errors',to_jsonb(v_errors));
exception when others then
 update public.lifecycle_automation_runs set status='failed',error_message=left(sqlerrm,2000),completed_at=now()
 where id=v_run_id;
 return jsonb_build_object('run_id',v_run_id,'status','failed','error',sqlerrm);
 end;
end; $$;
revoke all on function private.run_lifecycle_automation() from public,anon,authenticated;
grant execute on function private.run_lifecycle_automation() to service_role;

commit;
