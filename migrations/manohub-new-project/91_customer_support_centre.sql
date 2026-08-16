-- Unified customer support tickets and paid service requests on one secure queue.

begin;

alter table public.service_requests
  add column if not exists ticket_number text,
  add column if not exists request_kind text not null default 'service',
  add column if not exists subject text,
  add column if not exists category text not null default 'managed_service',
  add column if not exists priority text not null default 'normal',
  add column if not exists channel text not null default 'web',
  add column if not exists sla_due_at timestamptz,
  add column if not exists first_responded_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists customer_rating integer;

update public.service_requests
set ticket_number = 'HYD-' || upper(substr(replace(id::text, '-', ''), 1, 10)),
    subject = initcap(replace(service_type, '_', ' ')),
    sla_due_at = coalesce(sla_due_at, created_at + interval '24 hours')
where ticket_number is null or subject is null or sla_due_at is null;

alter table public.service_requests
  alter column ticket_number set not null,
  alter column subject set not null,
  drop constraint if exists service_requests_ticket_number_key,
  add constraint service_requests_ticket_number_key unique(ticket_number),
  drop constraint if exists service_requests_request_kind_check,
  add constraint service_requests_request_kind_check check (request_kind in ('support', 'service')),
  drop constraint if exists service_requests_category_check,
  add constraint service_requests_category_check check (category in ('technical', 'billing', 'account', 'tender_access', 'data_correction', 'feedback', 'managed_service', 'other')),
  drop constraint if exists service_requests_priority_check,
  add constraint service_requests_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  drop constraint if exists service_requests_channel_check,
  add constraint service_requests_channel_check check (channel in ('web', 'email', 'phone', 'whatsapp')),
  drop constraint if exists service_requests_customer_rating_check,
  add constraint service_requests_customer_rating_check check (customer_rating is null or customer_rating between 1 and 5);

alter table public.service_requests drop constraint if exists service_requests_service_type_check;
alter table public.service_requests add constraint service_requests_service_type_check check (service_type in (
  'document_retrieval', 'tender_clarification', 'eligibility_assessment', 'bid_readiness_review',
  'proposal_review', 'company_profile_prep', 'supplier_registration_assistance', 'featured_placement',
  'technical_support', 'billing_support', 'account_support', 'tender_access_support', 'data_correction', 'feedback', 'other'
));

create index if not exists service_requests_support_queue_idx on public.service_requests(request_kind, status, priority, sla_due_at);
create index if not exists service_requests_ticket_number_idx on public.service_requests(ticket_number);

create or replace function public.prepare_customer_support_ticket()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.ticket_number := coalesce(new.ticket_number, 'HYD-' || upper(substr(replace(new.id::text, '-', ''), 1, 10)));
  new.subject := left(btrim(coalesce(new.subject, replace(new.service_type, '_', ' '))), 180);
  new.sla_due_at := coalesce(new.sla_due_at, now() + case new.priority
    when 'urgent' then interval '4 hours'
    when 'high' then interval '8 hours'
    when 'low' then interval '48 hours'
    else interval '24 hours'
  end);
  return new;
end;
$$;

drop trigger if exists prepare_customer_support_ticket_trigger on public.service_requests;
create trigger prepare_customer_support_ticket_trigger before insert on public.service_requests
for each row execute function public.prepare_customer_support_ticket();

create or replace function public.track_customer_support_response()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if public.is_platform_admin() and not new.is_internal then
    update public.service_requests
    set first_responded_at = coalesce(first_responded_at, now()), updated_at = now()
    where id = new.request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists track_customer_support_response_trigger on public.service_request_activities;
create trigger track_customer_support_response_trigger after insert on public.service_request_activities
for each row execute function public.track_customer_support_response();

create or replace function public.protect_service_request_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_platform_admin() then
    if new.status is distinct from old.status and new.status <> 'cancelled' then new.status := old.status; end if;
    new.org_id := old.org_id;
    new.requested_by := old.requested_by;
    new.service_type := old.service_type;
    new.related_opportunity_id := old.related_opportunity_id;
    new.request_kind := old.request_kind;
    new.ticket_number := old.ticket_number;
    new.subject := old.subject;
    new.category := old.category;
    new.priority := old.priority;
    new.channel := old.channel;
    new.description := old.description;
    new.quote_amount := old.quote_amount;
    new.quote_currency := old.quote_currency;
    new.assigned_to := old.assigned_to;
    new.sla_due_at := old.sla_due_at;
    new.first_responded_at := old.first_responded_at;
    new.resolved_at := old.resolved_at;
  end if;
  return new;
end;
$$;

create or replace function public.track_customer_support_resolution()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then new.resolved_at := now(); end if;
  if new.status <> 'completed' then new.resolved_at := null; end if;
  return new;
end;
$$;

drop trigger if exists track_customer_support_resolution_trigger on public.service_requests;
create trigger track_customer_support_resolution_trigger before update of status on public.service_requests
for each row execute function public.track_customer_support_resolution();

commit;
