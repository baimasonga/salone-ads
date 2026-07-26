-- Verified provider events, campaign engagement metrics and automatic suppression.
begin;

alter table public.audience_email_campaigns
  add column delivered_count integer not null default 0,
  add column opened_count integer not null default 0,
  add column clicked_count integer not null default 0,
  add column bounced_count integer not null default 0,
  add column complained_count integer not null default 0,
  add column suppressed_count integer not null default 0;

create table public.audience_email_events (
  id bigint generated always as identity primary key,
  provider_event_id text not null unique,
  delivery_id uuid not null references public.audience_email_deliveries(id) on delete cascade,
  campaign_id uuid not null references public.audience_email_campaigns(id) on delete cascade,
  event_type text not null check (event_type in (
    'email.sent',
    'email.scheduled',
    'email.delivered',
    'email.delivery_delayed',
    'email.complained',
    'email.bounced',
    'email.opened',
    'email.clicked',
    'email.failed',
    'email.suppressed'
  )),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audience_email_event_campaign_idx
  on public.audience_email_events (campaign_id, event_type, occurred_at desc);
create index audience_email_event_delivery_idx
  on public.audience_email_events (delivery_id, occurred_at desc);

alter table public.audience_email_events enable row level security;

create policy audience_email_events_admin
  on public.audience_email_events for select
  to authenticated
  using ((select public.is_platform_admin()));

create or replace function private.process_audience_email_event()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
begin
  update public.audience_email_deliveries
     set status = case new.event_type
           when 'email.delivered' then 'delivered'
           when 'email.bounced' then 'bounced'
           when 'email.complained' then 'complained'
           when 'email.suppressed' then 'suppressed'
           when 'email.failed' then 'failed'
           else status
         end,
         error_message = case
           when new.event_type in ('email.bounced', 'email.suppressed', 'email.failed')
             then nullif(new.metadata ->> 'reason', '')
           else error_message
         end,
         event_at = greatest(coalesce(event_at, new.occurred_at), new.occurred_at)
   where id = new.delivery_id;

  if new.event_type in ('email.bounced', 'email.suppressed') then
    update public.public_audience_subscribers subscriber
       set status = 'suppressed',
           updated_at = now()
      from public.audience_email_deliveries delivery
     where delivery.id = new.delivery_id
       and subscriber.id = delivery.subscriber_id
       and subscriber.status <> 'unsubscribed';
  elsif new.event_type = 'email.complained' then
    update public.public_audience_subscribers subscriber
       set status = 'unsubscribed',
           unsubscribed_at = coalesce(subscriber.unsubscribed_at, new.occurred_at),
           updated_at = now()
      from public.audience_email_deliveries delivery
     where delivery.id = new.delivery_id
       and subscriber.id = delivery.subscriber_id;
  end if;

  update public.audience_email_campaigns campaign
     set delivered_count = (
           select count(distinct event.delivery_id)
             from public.audience_email_events event
            where event.campaign_id = new.campaign_id
              and event.event_type = 'email.delivered'
         ),
         opened_count = (
           select count(distinct event.delivery_id)
             from public.audience_email_events event
            where event.campaign_id = new.campaign_id
              and event.event_type = 'email.opened'
         ),
         clicked_count = (
           select count(distinct event.delivery_id)
             from public.audience_email_events event
            where event.campaign_id = new.campaign_id
              and event.event_type = 'email.clicked'
         ),
         bounced_count = (
           select count(distinct event.delivery_id)
             from public.audience_email_events event
            where event.campaign_id = new.campaign_id
              and event.event_type = 'email.bounced'
         ),
         complained_count = (
           select count(distinct event.delivery_id)
             from public.audience_email_events event
            where event.campaign_id = new.campaign_id
              and event.event_type = 'email.complained'
         ),
         suppressed_count = (
           select count(distinct event.delivery_id)
             from public.audience_email_events event
            where event.campaign_id = new.campaign_id
              and event.event_type = 'email.suppressed'
         ),
         failed_count = (
           select count(*)
             from public.audience_email_deliveries delivery
            where delivery.campaign_id = new.campaign_id
              and delivery.status in ('failed', 'bounced', 'complained', 'suppressed')
         ),
         updated_at = now()
   where campaign.id = new.campaign_id;

  return new;
end;
$$;

create trigger process_audience_email_event
  after insert on public.audience_email_events
  for each row execute function private.process_audience_email_event();

revoke all on public.audience_email_events from public, anon, authenticated;
grant select on public.audience_email_events to authenticated;
grant all on public.audience_email_events to service_role;
grant usage, select on sequence public.audience_email_events_id_seq to service_role;
revoke all on function private.process_audience_email_event() from public;

commit;
