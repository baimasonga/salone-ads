-- Durable email delivery for immediate, daily and weekly saved-search matches.
-- Uses the existing private background-job queue and Resend worker endpoint.

begin;

alter table public.saved_search_matches
  add column if not exists email_status text not null default 'pending'
    check (email_status in ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed')),
  add column if not exists email_delivery_id uuid;

create table if not exists public.tender_alert_email_suppressions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('bounced', 'complained', 'suppressed', 'manual')),
  provider_event_id text,
  suppressed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tender_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  frequency text not null check (frequency in ('immediate', 'daily', 'weekly')),
  match_ids uuid[] not null check (cardinality(match_ids) between 1 and 100),
  match_count integer not null check (match_count between 1 and 100),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'suppressed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  provider_message_id text,
  error_message text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_search_matches
  drop constraint if exists saved_search_matches_email_delivery_id_fkey;
alter table public.saved_search_matches
  add constraint saved_search_matches_email_delivery_id_fkey
  foreign key (email_delivery_id) references public.tender_alert_deliveries(id) on delete set null;

create index if not exists tender_alert_deliveries_queue_idx
  on public.tender_alert_deliveries(status, scheduled_at, created_at);
create unique index if not exists tender_alert_deliveries_provider_idx
  on public.tender_alert_deliveries(provider_message_id)
  where provider_message_id is not null;
create index if not exists tender_alert_deliveries_user_time_idx
  on public.tender_alert_deliveries(user_id, created_at desc);
create index if not exists saved_search_matches_email_delivery_idx
  on public.saved_search_matches(email_delivery_id)
  where email_delivery_id is not null;

create table if not exists public.tender_alert_email_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  delivery_id uuid not null references public.tender_alert_deliveries(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tender_alert_email_events_delivery_idx
  on public.tender_alert_email_events(delivery_id, occurred_at desc);

alter table public.tender_alert_deliveries enable row level security;
alter table public.tender_alert_email_events enable row level security;
alter table public.tender_alert_email_suppressions enable row level security;
revoke all on public.tender_alert_deliveries, public.tender_alert_email_events,
  public.tender_alert_email_suppressions from public, anon, authenticated;
grant select, insert, update, delete on public.tender_alert_deliveries,
  public.tender_alert_email_events, public.tender_alert_email_suppressions to service_role;

create or replace function public.enqueue_due_tender_alert_jobs(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate record;
  delivery_id uuid;
  queued_count integer := 0;
begin
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Enqueue limit must be between 1 and 200';
  end if;

  -- The scheduler can overlap during container restarts. Serialise selection
  -- and claiming so the same pending matches cannot enter two digests.
  perform pg_advisory_xact_lock(hashtext('enqueue_due_tender_alert_jobs'));

  for candidate in
    select
      m.user_id,
      ss.frequency,
      p.email,
      (array_agg(m.id order by m.matched_at))[1:100] as match_ids
    from public.saved_search_matches m
    join public.saved_searches ss on ss.id = m.saved_search_id
    join public.profiles p on p.id = m.user_id
    left join public.tender_alert_email_suppressions suppression on suppression.user_id = m.user_id
    where m.email_status = 'pending'
      and ss.is_active
      and nullif(btrim(coalesce(p.email, '')), '') is not null
      and suppression.user_id is null
      and (
        ss.frequency = 'immediate'
        or (
          ss.frequency = 'daily'
          and now() >= date_trunc('day', now()) + interval '7 hours'
          and m.matched_at < date_trunc('day', now()) + interval '7 hours'
        )
        or (
          ss.frequency = 'weekly'
          and extract(isodow from now()) = 1
          and now() >= date_trunc('day', now()) + interval '7 hours'
          and m.matched_at < date_trunc('day', now()) + interval '7 hours'
        )
      )
    group by m.user_id, ss.frequency, p.email
    order by min(m.matched_at)
    limit p_limit
  loop
    insert into public.tender_alert_deliveries (
      user_id, recipient_email, frequency, match_ids, match_count
    ) values (
      candidate.user_id,
      lower(btrim(candidate.email)),
      candidate.frequency,
      candidate.match_ids,
      cardinality(candidate.match_ids)
    )
    returning id into delivery_id;

    update public.saved_search_matches
    set email_status = 'queued', email_delivery_id = delivery_id
    where id = any(candidate.match_ids);

    perform private.enqueue_background_job(
      'tender.alert.dispatch',
      jsonb_build_object('delivery_id', delivery_id),
      delivery_id::text,
      now(),
      8,
      (case candidate.frequency when 'immediate' then 60 else 30 end)::smallint
    );
    queued_count := queued_count + 1;
  end loop;
  return queued_count;
end;
$$;

create or replace function public.admin_get_tender_alert_delivery_summary()
returns table(
  queued bigint, sent bigint, delivered bigint, failed bigint,
  suppressed bigint, deliveries_24h bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  return query
  select
    count(*) filter (where d.status in ('queued', 'sending')),
    count(*) filter (where d.status = 'sent'),
    count(*) filter (where d.status = 'delivered'),
    count(*) filter (where d.status in ('failed', 'bounced', 'complained')),
    count(*) filter (where d.status = 'suppressed'),
    count(*) filter (where d.created_at >= now() - interval '24 hours')
  from public.tender_alert_deliveries d;
end;
$$;

revoke all on function public.enqueue_due_tender_alert_jobs(integer) from public, anon, authenticated;
revoke all on function public.admin_get_tender_alert_delivery_summary() from public, anon;
grant execute on function public.enqueue_due_tender_alert_jobs(integer) to service_role;
grant execute on function public.admin_get_tender_alert_delivery_summary() to authenticated, service_role;

commit;
