-- Formal organization subscription lifecycle, immutable history and guarded transitions.

begin;

alter table public.subscriptions
  add column if not exists trial_ends_at date,
  add column if not exists grace_ends_at date,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_contact_email text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'trialing', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled', 'expired'));
alter table public.subscriptions drop constraint if exists subscriptions_billing_contact_email_check;
alter table public.subscriptions add constraint subscriptions_billing_contact_email_check
  check (billing_contact_email is null or length(billing_contact_email) <= 254);
alter table public.subscriptions drop constraint if exists subscriptions_suspension_reason_check;
alter table public.subscriptions add constraint subscriptions_suspension_reason_check
  check (suspension_reason is null or length(suspension_reason) <= 1000);

create unique index if not exists subscriptions_one_current_per_org_idx
  on public.subscriptions (org_id)
  where status in ('trialing', 'active', 'past_due', 'grace_period', 'suspended');
create index if not exists subscriptions_lifecycle_queue_idx
  on public.subscriptions (status, current_period_end, grace_ends_at);

create table if not exists public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_events_type_check check (
    event_type in ('requested', 'trial_started', 'activated', 'renewed', 'past_due', 'grace_started',
      'suspended', 'resumed', 'cancel_scheduled', 'cancelled', 'expired', 'plan_changed', 'billing_contact_updated')
  ),
  constraint subscription_events_reason_check check (reason is null or length(reason) <= 1000)
);

alter table public.subscription_events enable row level security;
revoke insert, update, delete, truncate on public.subscription_events from anon, authenticated;
grant select on public.subscription_events to authenticated;

drop policy if exists subscription_events_admin_read on public.subscription_events;
create policy subscription_events_admin_read on public.subscription_events
  for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists subscription_events_org_read on public.subscription_events;
create policy subscription_events_org_read on public.subscription_events
  for select to authenticated using ((select public.is_org_member(org_id)));

create or replace function public.transition_subscription(
  p_subscription_id uuid,
  p_action text,
  p_reason text default null,
  p_effective_date date default current_date
) returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_from_status text;
  v_to_status text;
  v_event_type text;
  v_period_end date;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if length(coalesce(p_reason, '')) > 1000 then
    raise exception 'Reason must not exceed 1000 characters';
  end if;

  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;
  if not found then raise exception 'Subscription not found'; end if;
  v_from_status := v_subscription.status;

  if p_action = 'start_trial' and v_from_status = 'pending' then
    v_to_status := 'trialing'; v_event_type := 'trial_started';
    update public.subscriptions set status = v_to_status, trial_ends_at = p_effective_date + 14,
      current_period_start = p_effective_date, current_period_end = p_effective_date + 14,
      approved_by = (select auth.uid()), approved_at = now(), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action in ('activate', 'resume') and v_from_status in ('pending', 'trialing', 'past_due', 'grace_period', 'suspended') then
    v_to_status := 'active';
    v_event_type := case when p_action = 'resume' then 'resumed' else 'activated' end;
    v_period_end := case when v_subscription.billing_cycle = 'annual'
      then (p_effective_date + interval '1 year')::date else (p_effective_date + interval '1 month')::date end;
    update public.subscriptions set status = v_to_status, current_period_start = p_effective_date,
      current_period_end = v_period_end, grace_ends_at = null, suspended_at = null,
      suspension_reason = null, cancel_at_period_end = false,
      approved_by = (select auth.uid()), approved_at = coalesce(approved_at, now()), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'renew' and v_from_status in ('active', 'past_due', 'grace_period') then
    v_to_status := 'active'; v_event_type := 'renewed';
    v_period_end := case when v_subscription.billing_cycle = 'annual'
      then (greatest(p_effective_date, coalesce(v_subscription.current_period_end, p_effective_date)) + interval '1 year')::date
      else (greatest(p_effective_date, coalesce(v_subscription.current_period_end, p_effective_date)) + interval '1 month')::date end;
    update public.subscriptions set status = v_to_status, current_period_end = v_period_end,
      grace_ends_at = null, cancel_at_period_end = false, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'mark_past_due' and v_from_status = 'active' then
    v_to_status := 'past_due'; v_event_type := 'past_due';
    update public.subscriptions set status = v_to_status, grace_ends_at = p_effective_date + 7, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'start_grace' and v_from_status = 'past_due' then
    v_to_status := 'grace_period'; v_event_type := 'grace_started';
    update public.subscriptions set status = v_to_status, grace_ends_at = coalesce(grace_ends_at, p_effective_date + 7), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'suspend' and v_from_status in ('active', 'past_due', 'grace_period') then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A suspension reason is required'; end if;
    v_to_status := 'suspended'; v_event_type := 'suspended';
    update public.subscriptions set status = v_to_status, suspended_at = now(),
      suspension_reason = trim(p_reason), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'schedule_cancel' and v_from_status in ('trialing', 'active', 'past_due', 'grace_period') then
    v_to_status := v_from_status; v_event_type := 'cancel_scheduled';
    update public.subscriptions set cancel_at_period_end = true, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'cancel' and v_from_status <> 'cancelled' then
    v_to_status := 'cancelled'; v_event_type := 'cancelled';
    update public.subscriptions set status = v_to_status, cancelled_at = now(),
      cancel_at_period_end = false, notes = coalesce(nullif(trim(p_reason), ''), notes), updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  elsif p_action = 'expire' and v_from_status in ('trialing', 'active', 'past_due', 'grace_period', 'suspended') then
    v_to_status := 'expired'; v_event_type := 'expired';
    update public.subscriptions set status = v_to_status, updated_at = now()
    where id = p_subscription_id returning * into v_subscription;
  else
    raise exception 'Invalid subscription transition: % from %', p_action, v_from_status;
  end if;

  insert into public.subscription_events
    (subscription_id, org_id, actor_id, event_type, from_status, to_status, reason)
  values
    (v_subscription.id, v_subscription.org_id, (select auth.uid()), v_event_type, v_from_status, v_to_status, nullif(trim(p_reason), ''));

  insert into public.notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
  select om.user_id, v_subscription.org_id, 'subscriptions',
    'Subscription ' || replace(v_event_type, '_', ' '),
    'Your organization subscription is now ' || replace(v_subscription.status, '_', ' ') || '.',
    'workspace:billing', 'in_app', jsonb_build_object('subscription_id', v_subscription.id, 'event_type', v_event_type)
  from public.organization_members om
  where om.org_id = v_subscription.org_id and om.role in ('owner', 'admin');

  return v_subscription;
end;
$$;

revoke all on function public.transition_subscription(uuid, text, text, date) from public, anon;
grant execute on function public.transition_subscription(uuid, text, text, date) to authenticated;

create or replace function private.capture_subscription_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscription_events
    (subscription_id, org_id, actor_id, event_type, to_status, reason)
  values (new.id, new.org_id, (select auth.uid()), 'requested', new.status, new.notes);
  return new;
end;
$$;
revoke all on function private.capture_subscription_request() from public, anon, authenticated;
drop trigger if exists subscriptions_capture_request on public.subscriptions;
create trigger subscriptions_capture_request after insert on public.subscriptions
for each row execute function private.capture_subscription_request();

-- Browser clients may request plans and update payment/billing contact details,
-- but lifecycle fields are changed only by the guarded transition function.
revoke update on public.subscriptions from authenticated;
grant select, insert on public.subscriptions to authenticated;
grant update (notes, billing_contact_name, billing_contact_email) on public.subscriptions to authenticated;

commit;
