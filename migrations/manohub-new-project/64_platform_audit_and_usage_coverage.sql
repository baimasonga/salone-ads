-- Bridge major SaaS domains into the central immutable audit log and enrich
-- organization usage metering without duplicating advertising analytics.
begin;

alter table public.organization_usage_events
  add column if not exists actor_id uuid references auth.users(id) on delete set null,
  add column if not exists event_type text not null default 'consumed',
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists source text not null default 'application',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_event_type_check;
alter table public.organization_usage_events
  add constraint organization_usage_events_event_type_check
  check (event_type ~ '^[a-z][a-z0-9_]{1,79}$');
alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_source_check;
alter table public.organization_usage_events
  add constraint organization_usage_events_source_check
  check (source in ('application','database_trigger','automation','import','administrator'));
alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_metadata_check;
alter table public.organization_usage_events
  add constraint organization_usage_events_metadata_check
  check (jsonb_typeof(metadata) = 'object');

create index if not exists organization_usage_events_org_created_idx
  on public.organization_usage_events(org_id, created_at desc);
create index if not exists organization_usage_events_meter_created_idx
  on public.organization_usage_events(meter_key, created_at desc);

grant select on public.organization_usage_events to authenticated;
drop policy if exists usage_events_read on public.organization_usage_events;
create policy usage_events_read on public.organization_usage_events
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

create or replace function private.record_org_usage_event(
  p_org_id uuid,
  p_meter_key text,
  p_amount integer,
  p_idempotency_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_source text default 'database_trigger',
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if p_org_id is null or not exists(select 1 from public.organizations where id = p_org_id) then
    raise exception 'Valid organization is required';
  end if;
  if p_meter_key !~ '^[a-z][a-z0-9_]{1,79}$'
     or p_event_type !~ '^[a-z][a-z0-9_]{1,79}$' then
    raise exception 'Invalid usage meter or event type';
  end if;
  if p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid usage amount'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'An idempotency key is required';
  end if;
  if p_source not in ('application','database_trigger','automation','import','administrator') then
    raise exception 'Invalid usage source';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Usage metadata must be an object';
  end if;

  insert into public.organization_usage_events(
    org_id, meter_key, amount, idempotency_key, actor_id, event_type,
    entity_type, entity_id, source, metadata
  ) values (
    p_org_id, p_meter_key, p_amount, trim(p_idempotency_key),
    (select auth.uid()), p_event_type, nullif(trim(p_entity_type), ''),
    nullif(trim(p_entity_id), ''), p_source, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict(org_id, meter_key, idempotency_key) do nothing;

  if not found then
    select current_value into v_value
    from public.organization_usage_meters
    where org_id = p_org_id and meter_key = p_meter_key
      and period_start = v_period_start;
    return coalesce(v_value, 0);
  end if;

  insert into public.organization_usage_meters(
    org_id, meter_key, period_start, period_end, current_value
  ) values (
    p_org_id, p_meter_key, v_period_start, v_period_end, p_amount
  )
  on conflict(org_id, meter_key, period_start) do update
  set current_value = public.organization_usage_meters.current_value + p_amount,
      updated_at = now()
  returning current_value into v_value;
  return v_value;
end;
$$;

revoke all on function private.record_org_usage_event(
  uuid,text,integer,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function private.record_org_usage_event(
  uuid,text,integer,text,text,text,text,text,jsonb
) to service_role;

create or replace function private.capture_subscription_central_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    new.actor_id, new.org_id, 'subscription.' || new.event_type,
    'subscription', new.subscription_id::text,
    jsonb_build_object(
      'from_status', new.from_status,
      'to_status', new.to_status,
      'reason', new.reason,
      'source', 'subscription_events',
      'event_id', new.id
    )
  );
  return new;
end;
$$;
revoke all on function private.capture_subscription_central_audit()
  from public, anon, authenticated;
drop trigger if exists subscription_events_central_audit on public.subscription_events;
create trigger subscription_events_central_audit
after insert on public.subscription_events
for each row execute function private.capture_subscription_central_audit();

create or replace function private.capture_cms_central_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_actor uuid;
begin
  v_actor := coalesce(new.updated_by, new.created_by, (select auth.uid()));
  if tg_op = 'INSERT' then
    v_action := 'content.created';
  elsif new.deleted_at is distinct from old.deleted_at then
    v_action := case when new.deleted_at is null then 'content.restored' else 'content.deleted' end;
  elsif new.status is distinct from old.status then
    v_action := 'content.' || replace(new.status, '_', '.');
  else
    return new;
  end if;

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor, v_action, 'cms_content', new.id::text,
    jsonb_build_object(
      'content_type', new.content_type,
      'title', new.title,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', new.status,
      'source', 'database_trigger'
    )
  );
  return new;
end;
$$;
revoke all on function private.capture_cms_central_audit()
  from public, anon, authenticated;
drop trigger if exists cms_content_central_audit on public.cms_content;
create trigger cms_content_central_audit
after insert or update on public.cms_content
for each row execute function private.capture_cms_central_audit();

create or replace function private.capture_membership_central_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := coalesce(new.org_id, old.org_id);
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'membership.added';
  elsif tg_op = 'DELETE' then
    v_action := 'membership.removed';
  elsif new.role is distinct from old.role then
    v_action := 'membership.role_changed';
  else
    return coalesce(new, old);
  end if;

  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    (select auth.uid()), v_org_id, v_action, 'organization_member',
    v_user_id::text,
    jsonb_build_object(
      'previous_role', case when tg_op <> 'INSERT' then old.role end,
      'new_role', case when tg_op <> 'DELETE' then new.role end,
      'source', 'database_trigger'
    )
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.capture_membership_central_audit()
  from public, anon, authenticated;
drop trigger if exists organization_members_central_audit on public.organization_members;
create trigger organization_members_central_audit
after insert or update or delete on public.organization_members
for each row execute function private.capture_membership_central_audit();

create or replace function private.capture_agency_central_audit_and_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.agency_clients;
  v_action text;
begin
  v_row := coalesce(new, old);
  if tg_op = 'INSERT' then
    v_action := 'agency.client_invited';
    perform private.record_org_usage_event(
      v_row.agency_org_id, 'agency_client_links', 1,
      'agency-client:' || v_row.id::text, 'client_invited',
      'agency_client', v_row.id::text, 'database_trigger',
      jsonb_build_object('client_org_id', v_row.client_org_id)
    );
  elsif tg_op = 'DELETE' then
    v_action := 'agency.client_removed';
  elsif new.status is distinct from old.status then
    v_action := 'agency.client_status_changed';
  else
    return coalesce(new, old);
  end if;

  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    (select auth.uid()), v_row.agency_org_id, v_action, 'agency_client',
    v_row.id::text,
    jsonb_build_object(
      'client_org_id', v_row.client_org_id,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', case when tg_op <> 'DELETE' then new.status end,
      'source', 'database_trigger'
    )
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.capture_agency_central_audit_and_usage()
  from public, anon, authenticated;
drop trigger if exists agency_clients_central_audit_usage on public.agency_clients;
create trigger agency_clients_central_audit_usage
after insert or update or delete on public.agency_clients
for each row execute function private.capture_agency_central_audit_and_usage();

create or replace function private.capture_campaign_central_audit_and_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(
      actor_id, org_id, action, entity_type, entity_id, metadata
    ) values (
      coalesce(new.created_by, (select auth.uid())), new.org_id,
      'campaign.created', 'ad_campaign', new.id::text,
      jsonb_build_object('name', new.name, 'status', new.status, 'source', 'database_trigger')
    );
    perform private.record_org_usage_event(
      new.org_id, 'campaigns_created', 1, 'campaign:' || new.id::text,
      'campaign_created', 'ad_campaign', new.id::text, 'database_trigger',
      jsonb_build_object('status', new.status)
    );
  elsif new.status is distinct from old.status and new.status = 'active' then
    perform private.record_org_usage_event(
      new.org_id, 'campaign_activations', 1,
      'campaign-activated:' || new.id::text || ':' || coalesce(new.updated_at::text, now()::text),
      'campaign_activated', 'ad_campaign', new.id::text, 'database_trigger',
      jsonb_build_object('previous_status', old.status)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.capture_campaign_central_audit_and_usage()
  from public, anon, authenticated;
drop trigger if exists ad_campaigns_central_audit_usage on public.ad_campaigns;
create trigger ad_campaigns_central_audit_usage
after insert or update of status on public.ad_campaigns
for each row execute function private.capture_campaign_central_audit_and_usage();

create or replace function private.capture_advert_order_central_audit_and_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'advertising.order_created';
    perform private.record_org_usage_event(
      new.org_id, 'advert_orders_created', 1, 'advert-order:' || new.id::text,
      'order_created', 'advert_order', new.id::text, 'database_trigger',
      jsonb_build_object('currency', new.currency_code, 'total_amount', new.total_amount)
    );
  elsif new.status is distinct from old.status then
    v_action := 'advertising.order_status_changed';
    if new.status = 'paid' then
      perform private.record_org_usage_event(
        new.org_id, 'advert_orders_paid', 1,
        'advert-order-paid:' || new.id::text, 'order_paid',
        'advert_order', new.id::text, 'database_trigger',
        jsonb_build_object('currency', new.currency_code, 'total_amount', new.total_amount)
      );
    end if;
  else
    return new;
  end if;

  insert into public.audit_logs(
    actor_id, org_id, action, entity_type, entity_id, metadata
  ) values (
    coalesce(new.verified_by, new.created_by, (select auth.uid())), new.org_id,
    v_action, 'advert_order', new.id::text,
    jsonb_build_object(
      'order_number', new.order_number,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', new.status,
      'currency', new.currency_code,
      'total_amount', new.total_amount,
      'source', 'database_trigger'
    )
  );
  return new;
end;
$$;
revoke all on function private.capture_advert_order_central_audit_and_usage()
  from public, anon, authenticated;
drop trigger if exists advert_orders_central_audit_usage on public.advert_orders;
create trigger advert_orders_central_audit_usage
after insert or update of status on public.advert_orders
for each row execute function private.capture_advert_order_central_audit_and_usage();

create or replace function public.admin_get_usage_metering_summary(
  p_days integer default 30
) returns table(
  org_id uuid,
  org_name text,
  meter_key text,
  total_amount bigint,
  event_count bigint,
  last_event_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_days < 1 or p_days > 366 then raise exception 'Days must be between 1 and 366'; end if;

  return query
  select e.org_id, o.name, e.meter_key, sum(e.amount)::bigint,
    count(*)::bigint, max(e.created_at)
  from public.organization_usage_events e
  join public.organizations o on o.id = e.org_id
  where e.created_at >= now() - make_interval(days => p_days)
  group by e.org_id, o.name, e.meter_key
  order by max(e.created_at) desc, o.name, e.meter_key;
end;
$$;

revoke all on function public.admin_get_usage_metering_summary(integer)
  from public, anon;
grant execute on function public.admin_get_usage_metering_summary(integer)
  to authenticated;

commit;
