-- Audience email campaigns, suppression-aware delivery queue and scheduling.
begin;

create table public.audience_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  subject text not null check (length(subject) between 1 and 180),
  preview_text text not null default '' check (length(preview_text) <= 220),
  body text not null check (length(body) between 1 and 12000),
  cta_label text not null default '' check (length(cta_label) <= 80),
  cta_href text not null default '' check (length(cta_href) <= 1000),
  target_interests text[] not null default '{}',
  target_locations text[] not null default '{}',
  target_frequencies text[] not null default '{urgent,daily,weekly}',
  status text not null default 'draft' check (status in ('draft','scheduled','queued','processing','sent','cancelled')),
  scheduled_at timestamptz,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.audience_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.audience_email_campaigns(id) on delete cascade,
  subscriber_id uuid not null references public.public_audience_subscribers(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','bounced','complained','suppressed','failed')),
  provider_message_id text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  event_at timestamptz,
  unique (campaign_id, subscriber_id)
);

create index audience_email_campaign_status_idx on public.audience_email_campaigns (status, scheduled_at);
create index audience_email_delivery_queue_idx on public.audience_email_deliveries (campaign_id, status, queued_at);
create index audience_email_delivery_provider_idx on public.audience_email_deliveries (provider_message_id) where provider_message_id is not null;
create index audience_email_delivery_subscriber_idx on public.audience_email_deliveries (subscriber_id);
create index audience_email_campaign_created_by_idx on public.audience_email_campaigns (created_by);

alter table public.audience_email_campaigns enable row level security;
alter table public.audience_email_deliveries enable row level security;

create policy audience_email_campaigns_admin
  on public.audience_email_campaigns for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy audience_email_deliveries_admin
  on public.audience_email_deliveries for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create or replace function public.queue_audience_email_campaign(p_campaign_id uuid)
returns integer
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public'
as $$
declare queued_total integer;
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Platform administrator access required';
  end if;

  insert into public.audience_email_deliveries (campaign_id, subscriber_id, recipient_email)
  select campaign.id, subscriber.id, subscriber.email
    from public.audience_email_campaigns campaign
    join public.public_audience_subscribers subscriber
      on subscriber.status = 'active'
     and subscriber.email is not null
     and subscriber.preferred_channels @> array['email']::text[]
     and (cardinality(campaign.target_interests) = 0 or subscriber.interests && campaign.target_interests)
     and (cardinality(campaign.target_locations) = 0 or subscriber.locations && campaign.target_locations)
     and subscriber.frequency = any(campaign.target_frequencies)
   where campaign.id = p_campaign_id
     and campaign.status in ('draft','scheduled')
  on conflict (campaign_id, subscriber_id) do nothing;

  select count(*) into queued_total
    from public.audience_email_deliveries
   where campaign_id = p_campaign_id;

  update public.audience_email_campaigns
     set queued_count = queued_total,
         status = case when scheduled_at is not null and scheduled_at > now() then 'scheduled' else 'queued' end,
         updated_at = now()
   where id = p_campaign_id
     and status in ('draft','scheduled');

  return queued_total;
end;
$$;

revoke all on public.audience_email_campaigns, public.audience_email_deliveries from public, anon;
grant select, insert, update, delete on public.audience_email_campaigns, public.audience_email_deliveries to authenticated;
grant all on public.audience_email_campaigns, public.audience_email_deliveries to service_role;
revoke all on function public.queue_audience_email_campaign(uuid) from public;
grant execute on function public.queue_audience_email_campaign(uuid) to authenticated, service_role;

commit;
