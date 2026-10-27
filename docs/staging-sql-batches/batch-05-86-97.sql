-- HYDERRA STAGING ONLY: project gknewzlxndmummwynuoa
-- Batch 5 of 5. Requires migrations through 85.
-- Original SQL follows unchanged; transactions are preserved.
-- On any error STOP. Earlier migrations may have committed.


-- ===== START 86_hyderra_brand_transition.sql =====
-- Hyderra customer-facing brand transition. Technical identifiers remain stable.
begin;

-- This is a platform-owned data rewrite, not an editorial action. Suppress row
-- workflow triggers only for this transaction; normal trigger behavior resumes
-- automatically at commit.
set local session_replication_role = replica;

update public.landing_content_blocks
set eyebrow = replace(replace(replace(eyebrow, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    title = replace(replace(replace(title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    body = replace(replace(replace(body, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    cta_label = replace(replace(replace(cta_label, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra')
where concat_ws(' ', eyebrow, title, body, cta_label) ~ 'MANOHUB|ManoHub|Manohub';

update public.advert_packages
set description = replace(replace(replace(description, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    updated_at = now()
where description ~ 'MANOHUB|ManoHub|Manohub';

update public.cms_content
set title = replace(replace(replace(title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    excerpt = replace(replace(replace(excerpt, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    body = replace(replace(replace(body, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    author_name = replace(replace(replace(author_name, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    seo_title = replace(replace(replace(seo_title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    seo_description = replace(replace(replace(seo_description, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    updated_at = now()
where concat_ws(' ', title, excerpt, body, author_name, seo_title, seo_description) ~ 'MANOHUB|ManoHub|Manohub';

alter table public.cms_content alter column author_name set default 'Hyderra Editorial';

update public.notifications
set title = replace(replace(replace(title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    body = replace(replace(replace(body, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra')
where concat_ws(' ', title, body) ~ 'MANOHUB|ManoHub|Manohub';

do $brand$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ 'MANOHUB|ManoHub|Manohub'
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(replace(replace(definition, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra');
    execute definition;
  end loop;
end;
$brand$;

commit;

-- ===== END 86_hyderra_brand_transition.sql =====

-- ===== START 87_tender_document_intelligence.sql =====
-- Subscriber-specific, evidence-backed tender document intelligence.
-- Analyses are advisory and isolated per user; source documents retain their existing access rules.

begin;

create table if not exists public.tender_document_analyses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  document_id uuid not null references public.opportunity_documents(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count is null or page_count between 1 and 10000),
  source_truncated boolean not null default false,
  model text not null check (char_length(model) between 1 and 100),
  analysis jsonb not null check (
    jsonb_typeof(analysis) = 'object'
    and jsonb_typeof(analysis->'keyDeadlines') = 'array'
    and jsonb_typeof(analysis->'eligibilityCriteria') = 'array'
    and jsonb_typeof(analysis->'submissionChecklist') = 'array'
    and jsonb_typeof(analysis->'financialRequirements') = 'array'
    and jsonb_typeof(analysis->'risks') = 'array'
    and jsonb_typeof(analysis->'contacts') = 'array'
    and jsonb_typeof(analysis->'limitations') = 'array'
  ),
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, document_id)
);

create index if not exists tender_document_analyses_opportunity_user_idx
  on public.tender_document_analyses(opportunity_id, user_id, analyzed_at desc);

alter table public.tender_document_analyses enable row level security;
revoke all on public.tender_document_analyses from public, anon;
grant select, insert, update, delete on public.tender_document_analyses to authenticated;
grant all on public.tender_document_analyses to service_role;

create or replace function public.can_access_tender_document_intelligence(
  p_opportunity_id uuid,
  p_document_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.opportunity_documents document
      join public.opportunities opportunity on opportunity.id = document.opportunity_id
      where document.id = p_document_id
        and opportunity.id = p_opportunity_id
        and (
          public.is_platform_admin()
          or (
            opportunity.buyer_org_id is not null
            and public.is_org_member(opportunity.buyer_org_id)
          )
          or (
            document.is_public
            and public.is_opportunity_publicly_visible(opportunity.id)
            and (
              public.user_has_tender_feature('tender_alerts_and_details')
              or public.user_has_tender_feature('tender_publishing')
            )
          )
        )
    );
$$;

revoke all on function public.can_access_tender_document_intelligence(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_access_tender_document_intelligence(uuid, uuid, uuid) to authenticated, service_role;

create policy tender_document_analyses_owner_select
on public.tender_document_analyses
for select to authenticated
using (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create policy tender_document_analyses_owner_insert
on public.tender_document_analyses
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create policy tender_document_analyses_owner_update
on public.tender_document_analyses
for update to authenticated
using (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
)
with check (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create policy tender_document_analyses_owner_delete
on public.tender_document_analyses
for delete to authenticated
using (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create or replace function public.protect_tender_document_analysis_identity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.document_id is distinct from old.document_id then
    raise exception 'Tender document analysis identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_tender_document_analysis_identity_trigger
  on public.tender_document_analyses;
create trigger protect_tender_document_analysis_identity_trigger
before update on public.tender_document_analyses
for each row execute function public.protect_tender_document_analysis_identity();

commit;

-- ===== END 87_tender_document_intelligence.sql =====

-- ===== START 88_advanced_tender_recommendations.sql =====
-- Explainable, multi-signal tender recommendations for entitled subscribers.

begin;

create or replace function public.get_advanced_tender_recommendations(
  p_org_id uuid,
  p_limit integer default 12
)
returns table(
  id uuid,
  slug text,
  title text,
  buyer_name text,
  submission_deadline timestamptz,
  estimated_value numeric,
  currency_code text,
  is_featured boolean,
  review_note text,
  view_count integer,
  sector text,
  district text,
  country text,
  opportunity_type text,
  status_code text,
  status_label text,
  recommendation_score integer,
  recommendation_reasons text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_org_member(p_org_id) then
    raise exception 'Organization membership required';
  end if;
  if not (
    public.user_has_tender_feature('tender_alerts_and_details')
    or public.user_has_tender_feature('tender_publishing')
    or public.is_platform_admin()
  ) then
    raise exception 'An active tender subscription is required';
  end if;
  if p_limit < 1 or p_limit > 30 then
    raise exception 'Recommendation limit must be between 1 and 30';
  end if;

  return query
  with signals as (
    select
      opportunity.*,
      exists (
        select 1 from public.supplier_sectors supplier_sector
        where supplier_sector.org_id = p_org_id
          and supplier_sector.sector_id = opportunity.sector_id
      ) as sector_match,
      exists (
        select 1 from public.followed_buyers followed
        where followed.user_id = (select auth.uid())
          and followed.buyer_org_id = opportunity.buyer_org_id
      ) as buyer_match,
      exists (
        select 1 from public.saved_searches saved
        where saved.user_id = (select auth.uid())
          and saved.is_active
          and saved.search_scope = 'tenders'
          and (saved.sector_id is null or saved.sector_id = opportunity.sector_id)
          and (saved.district_id is null or saved.district_id = opportunity.district_id)
          and (saved.country_id is null or saved.country_id = opportunity.country_id)
          and (saved.opportunity_type_id is null or saved.opportunity_type_id = opportunity.opportunity_type_id)
          and (
            nullif(btrim(saved.keyword), '') is null
            or opportunity.search_vector @@ plainto_tsquery('simple'::regconfig, saved.keyword)
          )
      ) as search_match,
      exists (
        select 1
        from public.pipeline_records history
        join public.opportunities previous on previous.id = history.opportunity_id
        where history.org_id = p_org_id
          and history.stage in ('go', 'preparing', 'submitted', 'won')
          and previous.sector_id = opportunity.sector_id
      ) as history_match
    from public.opportunities opportunity
    join public.opportunity_statuses status on status.id = opportunity.status_id
    where status.code in ('published', 'amended', 'deadline_extended')
      and opportunity.submission_deadline >= now()
      and not exists (
        select 1 from public.pipeline_records current_pipeline
        where current_pipeline.org_id = p_org_id
          and current_pipeline.opportunity_id = opportunity.id
      )
      and not exists (
        select 1 from public.saved_opportunities saved_opportunity
        where saved_opportunity.user_id = (select auth.uid())
          and saved_opportunity.opportunity_id = opportunity.id
      )
  ), ranked as (
    select
      signal.*,
      least(100, (
        case when signal.sector_match then 45 else 0 end
        + case when signal.buyer_match then 25 else 0 end
        + case when signal.search_match then 25 else 0 end
        + case when signal.history_match then 15 else 0 end
        + case when signal.publication_date >= current_date - 14 then 8 else 0 end
        + case when signal.submission_deadline <= now() + interval '14 days' then 5 else 0 end
        + case when signal.is_featured then 2 else 0 end
      ))::integer as score,
      array_remove(array[
        case when signal.sector_match then 'Matches your supplier sectors' end,
        case when signal.search_match then 'Matches a saved search' end,
        case when signal.buyer_match then 'Published by a buyer you follow' end,
        case when signal.history_match then 'Similar to tenders you previously pursued' end,
        case when signal.publication_date >= current_date - 14 then 'Recently published' end,
        case when signal.submission_deadline <= now() + interval '14 days' then 'Deadline approaching' end
      ], null)::text[] as reasons
    from signals signal
  )
  select
    ranked.id, ranked.slug, ranked.title, ranked.buyer_name,
    ranked.submission_deadline, ranked.estimated_value, ranked.currency_code,
    ranked.is_featured, ranked.review_note, ranked.view_count,
    sector.name, district.name, country.name, opportunity_type.label,
    status.code, status.label, ranked.score, ranked.reasons
  from ranked
  join public.opportunity_statuses status on status.id = ranked.status_id
  left join public.sectors sector on sector.id = ranked.sector_id
  left join public.districts district on district.id = ranked.district_id
  left join public.countries country on country.id = ranked.country_id
  left join public.opportunity_types opportunity_type on opportunity_type.id = ranked.opportunity_type_id
  where ranked.score > 0
  order by ranked.score desc, ranked.submission_deadline asc, ranked.id
  limit p_limit;
end;
$$;

revoke all on function public.get_advanced_tender_recommendations(uuid, integer) from public, anon;
grant execute on function public.get_advanced_tender_recommendations(uuid, integer) to authenticated, service_role;

commit;

-- ===== END 88_advanced_tender_recommendations.sql =====

-- ===== START 89_events_tourism_management.sql =====
-- Real, organization-scoped event and tourism inventory for the internal Hyderra team.

begin;

create table if not exists public.managed_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 180),
  description text not null default '' check (char_length(description) <= 5000),
  event_type text not null default 'community' check (event_type in ('conference', 'festival', 'concert', 'community', 'sports', 'other')),
  venue text not null default '' check (char_length(venue) <= 240),
  city text not null default '' check (char_length(city) <= 120),
  country text not null default 'Sierra Leone' check (char_length(country) <= 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_url text check (ticket_url is null or ticket_url ~ '^https?://'),
  capacity integer check (capacity is null or capacity >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed', 'archived')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.tourism_experiences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 180),
  description text not null default '' check (char_length(description) <= 5000),
  destination text not null check (char_length(btrim(destination)) between 2 and 180),
  district text not null default '' check (char_length(district) <= 120),
  category text not null default 'heritage' check (category in ('heritage', 'eco_tourism', 'beach', 'adventure', 'cultural', 'other')),
  duration_days integer not null default 1 check (duration_days between 1 and 365),
  price_from numeric check (price_from is null or price_from >= 0),
  currency_code text not null default 'SLE' check (currency_code ~ '^[A-Z]{3}$'),
  booking_url text check (booking_url is null or booking_url ~ '^https?://'),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'archived')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_events_org_schedule_idx on public.managed_events(org_id, starts_at desc);
create index if not exists tourism_experiences_org_status_idx on public.tourism_experiences(org_id, status, created_at desc);

alter table public.managed_events enable row level security;
alter table public.tourism_experiences enable row level security;
revoke all on public.managed_events, public.tourism_experiences from public, anon;
grant select, insert, update, delete on public.managed_events, public.tourism_experiences to authenticated;
grant all on public.managed_events, public.tourism_experiences to service_role;

create policy managed_events_admin_org_access on public.managed_events
for all to authenticated
using (public.is_platform_admin() and public.is_org_member(org_id))
with check (public.is_platform_admin() and public.is_org_member(org_id) and created_by = (select auth.uid()));

create policy tourism_experiences_admin_org_access on public.tourism_experiences
for all to authenticated
using (public.is_platform_admin() and public.is_org_member(org_id))
with check (public.is_platform_admin() and public.is_org_member(org_id) and created_by = (select auth.uid()));

create or replace function public.protect_managed_inventory_identity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.org_id is distinct from old.org_id or new.created_by is distinct from old.created_by then
    raise exception 'Managed inventory ownership is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_managed_events_identity on public.managed_events;
create trigger protect_managed_events_identity before update on public.managed_events
for each row execute function public.protect_managed_inventory_identity();
drop trigger if exists protect_tourism_experiences_identity on public.tourism_experiences;
create trigger protect_tourism_experiences_identity before update on public.tourism_experiences
for each row execute function public.protect_managed_inventory_identity();

commit;

-- ===== END 89_events_tourism_management.sql =====

-- ===== START 90_marketplace_expansion.sql =====
-- Rich directory and creator marketplace management for the internal platform team.

begin;

alter table public.directory_profiles
  add column if not exists website text,
  add column if not exists services text[] not null default '{}'::text[],
  add column if not exists contact_person text,
  add column if not exists status text not null default 'active',
  add column if not exists is_featured boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.directory_profiles
  drop constraint if exists directory_profiles_website_check,
  add constraint directory_profiles_website_check check (website is null or website ~ '^https?://'),
  drop constraint if exists directory_profiles_status_check,
  add constraint directory_profiles_status_check check (status in ('active', 'hidden', 'archived')),
  drop constraint if exists directory_profiles_services_check,
  add constraint directory_profiles_services_check check (cardinality(services) <= 20);

alter table public.influencer_profiles
  add column if not exists bio text not null default '',
  add column if not exists email text,
  add column if not exists whatsapp text,
  add column if not exists profile_url text,
  add column if not exists audience_count bigint,
  add column if not exists engagement_percent numeric,
  add column if not exists rate_min numeric,
  add column if not exists rate_max numeric,
  add column if not exists currency_code text not null default 'SLE',
  add column if not exists availability_status text not null default 'available',
  add column if not exists claimed_by_org_id uuid references public.organizations(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'active',
  add column if not exists is_featured boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.influencer_profiles
  drop constraint if exists influencer_profiles_profile_url_check,
  add constraint influencer_profiles_profile_url_check check (profile_url is null or profile_url ~ '^https?://'),
  drop constraint if exists influencer_profiles_audience_count_check,
  add constraint influencer_profiles_audience_count_check check (audience_count is null or audience_count >= 0),
  drop constraint if exists influencer_profiles_engagement_percent_check,
  add constraint influencer_profiles_engagement_percent_check check (engagement_percent is null or engagement_percent between 0 and 100),
  drop constraint if exists influencer_profiles_rates_check,
  add constraint influencer_profiles_rates_check check (rate_min is null or rate_min >= 0),
  drop constraint if exists influencer_profiles_rate_max_check,
  add constraint influencer_profiles_rate_max_check check (rate_max is null or rate_max >= coalesce(rate_min, 0)),
  drop constraint if exists influencer_profiles_currency_code_check,
  add constraint influencer_profiles_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  drop constraint if exists influencer_profiles_availability_check,
  add constraint influencer_profiles_availability_check check (availability_status in ('available', 'limited', 'unavailable')),
  drop constraint if exists influencer_profiles_status_check,
  add constraint influencer_profiles_status_check check (status in ('active', 'hidden', 'archived')),
  drop constraint if exists influencer_profiles_categories_check,
  add constraint influencer_profiles_categories_check check (cardinality(categories) <= 20),
  drop constraint if exists influencer_profiles_platforms_check,
  add constraint influencer_profiles_platforms_check check (cardinality(platforms) <= 12);

create index if not exists directory_profiles_management_idx on public.directory_profiles(status, is_featured desc, business_name);
create index if not exists influencer_profiles_management_idx on public.influencer_profiles(status, availability_status, is_featured desc, display_name);
create index if not exists influencer_profiles_claimed_org_idx on public.influencer_profiles(claimed_by_org_id) where claimed_by_org_id is not null;

create or replace function public.touch_marketplace_profile()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists directory_profiles_touch_updated_at on public.directory_profiles;
create trigger directory_profiles_touch_updated_at before update on public.directory_profiles
for each row execute function public.touch_marketplace_profile();
drop trigger if exists influencer_profiles_touch_updated_at on public.influencer_profiles;
create trigger influencer_profiles_touch_updated_at before update on public.influencer_profiles
for each row execute function public.touch_marketplace_profile();

commit;

-- ===== END 90_marketplace_expansion.sql =====

-- ===== START 91_customer_support_centre.sql =====
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

-- ===== END 91_customer_support_centre.sql =====

-- ===== START 92_complete_advert_attribution.sql =====
-- Privacy-preserving first/last/multi-touch attribution for advert outcomes.
begin;

alter table public.advert_outcomes
  add column if not exists first_touch_event_id uuid references public.advert_events(id) on delete set null,
  add column if not exists last_touch_event_id uuid references public.advert_events(id) on delete set null,
  add column if not exists attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 90);

create index if not exists advert_events_attribution_idx
  on public.advert_events(advert_id, visitor_token_hash, created_at desc)
  where visitor_token_hash is not null;

create or replace function private.attribute_advert_outcome()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_first uuid; v_last uuid;
begin
  select e.id into v_first from public.advert_events e
  where e.advert_id=new.advert_id and e.created_at between new.occurred_at-(new.attribution_window_days||' days')::interval and new.occurred_at
    and e.event_type in ('detail_view','cta_click')
  order by e.created_at asc limit 1;
  select e.id into v_last from public.advert_events e
  where e.advert_id=new.advert_id and e.created_at between new.occurred_at-(new.attribution_window_days||' days')::interval and new.occurred_at
    and e.event_type in ('detail_view','cta_click')
  order by e.created_at desc limit 1;
  new.first_touch_event_id:=coalesce(new.first_touch_event_id,v_first);
  new.last_touch_event_id:=coalesce(new.last_touch_event_id,v_last);
  return new;
end $$;
revoke all on function private.attribute_advert_outcome() from public,anon,authenticated;
drop trigger if exists advert_outcomes_attribute on public.advert_outcomes;
create trigger advert_outcomes_attribute before insert or update of occurred_at,attribution_window_days
on public.advert_outcomes for each row execute function private.attribute_advert_outcome();

create or replace function public.get_advert_attribution(p_advert_id uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_result jsonb;
begin
  if p_days not between 1 and 366 then raise exception 'Reporting period must be between 1 and 366 days'; end if;
  select org_id into v_org from public.adverts where id=p_advert_id;
  if v_org is null then raise exception 'Advert not found'; end if;
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_member(v_org)) then raise exception 'Advert reporting access required'; end if;
  with touches as (
    select coalesce(nullif(e.metadata->>'utm_campaign',''),nullif(e.source,''),'direct') campaign,
      coalesce(nullif(e.metadata->>'utm_medium',''),nullif(e.channel,''),'unknown') medium,
      e.event_type, e.id
    from public.advert_events e where e.advert_id=p_advert_id and e.created_at>=now()-(p_days||' days')::interval
  ), attributed as (
    select o.id,o.outcome_type,o.status,o.revenue_amount,
      coalesce(nullif(e.metadata->>'utm_campaign',''),nullif(e.source,''),'unattributed') campaign,
      coalesce(nullif(e.metadata->>'utm_medium',''),nullif(e.channel,''),'unknown') medium
    from public.advert_outcomes o left join public.advert_events e on e.id=o.last_touch_event_id
    where o.advert_id=p_advert_id and o.occurred_at>=now()-(p_days||' days')::interval
  ), grouped as (
    select campaign,medium,count(*) filter(where event_type='detail_view') views,count(*) filter(where event_type='cta_click') clicks,0 outcomes,0::numeric revenue from touches group by 1,2
    union all
    select campaign,medium,0,0,count(*) filter(where status='confirmed'),coalesce(sum(revenue_amount) filter(where status='confirmed'),0) from attributed group by 1,2
  )
  select jsonb_build_object('advert_id',p_advert_id,'period_days',p_days,'model','last_touch','rows',coalesce(jsonb_agg(jsonb_build_object(
    'campaign',campaign,'medium',medium,'views',views,'clicks',clicks,'outcomes',outcomes,'revenue',revenue) order by revenue desc,clicks desc),'[]'::jsonb))
  into v_result from (select campaign,medium,sum(views) views,sum(clicks) clicks,sum(outcomes) outcomes,sum(revenue) revenue from grouped group by 1,2) x;
  return v_result;
end $$;
revoke all on function public.get_advert_attribution(uuid,integer) from public,anon;
grant execute on function public.get_advert_attribution(uuid,integer) to authenticated;
commit;

-- ===== END 92_complete_advert_attribution.sql =====

-- ===== START 93_automated_subscription_billing.sql =====
-- Provider-neutral recurring invoices, charge attempts, dunning, receipts and refunds.
begin;

create table if not exists public.subscription_billing_profiles(
  subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check(provider in ('manual','mobile_money','card')),
  provider_customer_ref text,
  provider_mandate_ref text,
  automatic_collection boolean not null default false,
  retry_count integer not null default 0 check(retry_count between 0 and 12),
  next_retry_at timestamptz,
  last_charge_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.subscription_charge_attempts(
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  invoice_id uuid not null references public.commercial_invoices(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade,
  attempt_number integer not null check(attempt_number between 1 and 12), provider text not null,
  status text not null default 'queued' check(status in ('queued','processing','succeeded','failed','cancelled')),
  amount numeric(16,2) not null check(amount>0), currency_code text not null references public.currencies(code),
  provider_reference text, failure_code text, failure_message text, next_retry_at timestamptz,
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique(invoice_id,attempt_number)
);
create table if not exists public.commercial_receipts(
  id uuid primary key default gen_random_uuid(), receipt_number text not null unique,
  org_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid references public.commercial_invoices(id) on delete restrict,
  payment_id uuid references public.commercial_payments(id) on delete restrict,
  refund_id uuid references public.commercial_refunds(id) on delete restrict,
  receipt_type text not null check(receipt_type in ('payment','refund')),
  amount numeric(16,2) not null check(amount>0), currency_code text not null references public.currencies(code),
  issued_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
  check((receipt_type='payment' and payment_id is not null) or (receipt_type='refund' and refund_id is not null))
);
create index if not exists subscription_charge_queue_idx on public.subscription_charge_attempts(status,next_retry_at,created_at);
create index if not exists commercial_receipts_org_idx on public.commercial_receipts(org_id,issued_at desc);
create unique index if not exists commercial_receipts_payment_uidx on public.commercial_receipts(payment_id) where payment_id is not null;
create unique index if not exists commercial_receipts_refund_uidx on public.commercial_receipts(refund_id) where refund_id is not null;
alter table public.subscription_billing_profiles enable row level security;
alter table public.subscription_charge_attempts enable row level security;
alter table public.commercial_receipts enable row level security;
revoke all on public.subscription_billing_profiles,public.subscription_charge_attempts,public.commercial_receipts from public,anon,authenticated;
grant select on public.subscription_billing_profiles,public.subscription_charge_attempts,public.commercial_receipts to authenticated;
create policy subscription_billing_profiles_read on public.subscription_billing_profiles for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy subscription_charge_attempts_read on public.subscription_charge_attempts for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy commercial_receipts_read on public.commercial_receipts for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));

create or replace function private.process_subscription_billing(p_as_of date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s record; v_invoice uuid; v_amount numeric; v_created int:=0; v_queued int:=0;
begin
  for s in select sub.*,p.name plan_name,p.monthly_price,p.annual_price,p.currency_code,b.provider,b.automatic_collection
    from public.subscriptions sub join public.plans p on p.id=sub.plan_id
    left join public.subscription_billing_profiles b on b.subscription_id=sub.id
    where sub.status='active' and sub.current_period_end<=p_as_of and not sub.cancel_at_period_end
  loop
    v_amount:=case when s.billing_cycle='annual' then s.annual_price else s.monthly_price end;
    if v_amount is null or v_amount<=0 then continue; end if;
    select id into v_invoice from public.commercial_invoices where source_type='subscription' and source_id=s.id and status in ('issued','partially_paid','overdue') order by issued_at desc limit 1;
    if v_invoice is null then
      insert into public.commercial_invoices(org_id,invoice_number,source_type,source_id,currency_code,status,subtotal,due_at)
      values(s.org_id,'SUB-'||to_char(p_as_of,'YYYYMM')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),'subscription',s.id,s.currency_code,'issued',v_amount,p_as_of+7) returning id into v_invoice;
      insert into public.commercial_invoice_lines(invoice_id,description,quantity,unit_amount) values(v_invoice,s.plan_name||' subscription renewal ('||s.billing_cycle||')',1,v_amount);
      insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,metadata)
      values(s.org_id,'invoice','debit',v_amount,s.currency_code,'commercial_invoice',v_invoice,'Subscription renewal invoice',jsonb_build_object('subscription_id',s.id));
      v_created:=v_created+1;
    end if;
    if coalesce(s.automatic_collection,false) and not exists(select 1 from public.subscription_charge_attempts where invoice_id=v_invoice and status in ('queued','processing','succeeded')) then
      insert into public.subscription_charge_attempts(subscription_id,invoice_id,org_id,attempt_number,provider,amount,currency_code)
      values(s.id,v_invoice,s.org_id,1,s.provider,v_amount,s.currency_code); v_queued:=v_queued+1;
    end if;
  end loop;
  update public.commercial_invoices set status='overdue' where status in ('issued','partially_paid') and due_at<p_as_of;
  update public.subscriptions sub set status='past_due',grace_ends_at=p_as_of+7,updated_at=now()
    where status='active' and exists(select 1 from public.commercial_invoices i where i.source_type='subscription' and i.source_id=sub.id and i.status='overdue');
  return jsonb_build_object('invoices_created',v_created,'charges_queued',v_queued);
end $$;
revoke all on function private.process_subscription_billing(date) from public,anon,authenticated;

create or replace function private.issue_commercial_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_invoice uuid;
declare v_payment public.commercial_payments;
begin
 if tg_table_name='commercial_payment_allocations' then
  select * into v_payment from public.commercial_payments where id=new.payment_id;
  insert into public.commercial_receipts(receipt_number,org_id,invoice_id,payment_id,receipt_type,amount,currency_code)
  values('RCT-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_payment.org_id,new.invoice_id,new.payment_id,'payment',new.amount,v_payment.currency_code) on conflict(payment_id) where payment_id is not null do nothing;
 else
  insert into public.commercial_receipts(receipt_number,org_id,invoice_id,refund_id,receipt_type,amount,currency_code)
  values('RFD-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),new.org_id,new.invoice_id,new.id,'refund',new.amount,new.currency_code) on conflict(refund_id) where refund_id is not null do nothing;
 end if; return new;
end $$;
revoke all on function private.issue_commercial_receipt() from public,anon,authenticated;
drop trigger if exists commercial_payment_receipt on public.commercial_payment_allocations;
create trigger commercial_payment_receipt after insert on public.commercial_payment_allocations for each row execute function private.issue_commercial_receipt();
drop trigger if exists commercial_refund_receipt on public.commercial_refunds;
create trigger commercial_refund_receipt after insert on public.commercial_refunds for each row execute function private.issue_commercial_receipt();

create or replace function public.admin_process_subscription_billing(p_as_of date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 return private.process_subscription_billing(p_as_of); end $$;
revoke all on function public.admin_process_subscription_billing(date) from public,anon;
grant execute on function public.admin_process_subscription_billing(date) to authenticated;

create or replace function public.complete_subscription_charge(p_attempt_id uuid,p_success boolean,p_provider_reference text,p_failure_code text default null,p_failure_message text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.subscription_charge_attempts; v_payment uuid; v_receipt text; v_next timestamptz;
begin
 if auth.uid() is not null and not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 select * into a from public.subscription_charge_attempts where id=p_attempt_id for update; if not found then raise exception 'Charge attempt not found'; end if;
 if a.status not in ('queued','processing') then raise exception 'Charge attempt is already complete'; end if;
 if p_success then
  insert into public.commercial_payments(org_id,payment_reference,method,currency_code,amount,status)
  values(a.org_id,trim(p_provider_reference),case when a.provider='card' then 'card' else 'mobile_money' end,a.currency_code,a.amount,'verified') returning id into v_payment;
  insert into public.commercial_payment_allocations(payment_id,invoice_id,amount) values(v_payment,a.invoice_id,a.amount);
  update public.commercial_invoices set amount_paid=amount_paid+a.amount,status='paid' where id=a.invoice_id;
  update public.subscription_charge_attempts set status='succeeded',provider_reference=trim(p_provider_reference),completed_at=now() where id=a.id;
  update public.subscriptions set status='active',current_period_start=current_date,current_period_end=case when billing_cycle='annual' then (current_date+interval '1 year')::date else (current_date+interval '1 month')::date end,grace_ends_at=null,updated_at=now() where id=a.subscription_id;
  select receipt_number into v_receipt from public.commercial_receipts where payment_id=v_payment;
  return jsonb_build_object('status','succeeded','receipt_number',v_receipt);
 else
  v_next:=now()+case a.attempt_number when 1 then interval '1 day' when 2 then interval '3 days' else interval '7 days' end;
  update public.subscription_charge_attempts set status='failed',failure_code=left(p_failure_code,80),failure_message=left(p_failure_message,500),next_retry_at=v_next,completed_at=now() where id=a.id;
  if a.attempt_number<4 then insert into public.subscription_charge_attempts(subscription_id,invoice_id,org_id,attempt_number,provider,amount,currency_code,next_retry_at) values(a.subscription_id,a.invoice_id,a.org_id,a.attempt_number+1,a.provider,a.amount,a.currency_code,v_next); end if;
  update public.subscriptions set status=case when a.attempt_number>=4 then 'suspended' else 'past_due' end,grace_ends_at=current_date+7,suspension_reason=case when a.attempt_number>=4 then 'Automated payment recovery exhausted' else suspension_reason end,updated_at=now() where id=a.subscription_id;
  return jsonb_build_object('status','failed','next_retry_at',v_next,'attempt',a.attempt_number);
 end if;
end $$;
revoke all on function public.complete_subscription_charge(uuid,boolean,text,text,text) from public,anon;
grant execute on function public.complete_subscription_charge(uuid,boolean,text,text,text) to authenticated,service_role;

do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname='hyderra-subscription-billing';
  perform cron.schedule('hyderra-subscription-billing','15 1 * * *','select private.process_subscription_billing(current_date);');
 end if;
end $$;
commit;

-- ===== END 93_automated_subscription_billing.sql =====

-- ===== START 94_financial_documents.sql =====
-- Printable proforma, invoice and receipt document lifecycle.
begin;

create table if not exists public.commercial_proformas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  proforma_number text not null unique,
  currency_code text not null references public.currencies(code),
  status text not null default 'issued' check (status in ('draft','issued','accepted','converted','expired','void')),
  subtotal numeric(16,2) not null check (subtotal >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(16,2) generated always as (subtotal + tax_amount) stored,
  valid_until date not null,
  notes text,
  converted_invoice_id uuid references public.commercial_invoices(id) on delete restrict,
  issued_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_proforma_lines (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.commercial_proformas(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 2 and 500),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_amount numeric(16,2) not null check (unit_amount >= 0),
  line_total numeric(16,2) generated always as (quantity * unit_amount) stored,
  sort_order integer not null default 0 check (sort_order >= 0)
);

create index if not exists commercial_proformas_org_time_idx on public.commercial_proformas(org_id, issued_at desc);
create index if not exists commercial_proformas_status_valid_idx on public.commercial_proformas(status, valid_until);
create index if not exists commercial_proforma_lines_parent_idx on public.commercial_proforma_lines(proforma_id, sort_order);

alter table public.commercial_proformas enable row level security;
alter table public.commercial_proforma_lines enable row level security;
revoke all on public.commercial_proformas, public.commercial_proforma_lines from public, anon, authenticated;
grant select on public.commercial_proformas, public.commercial_proforma_lines to authenticated;

drop policy if exists commercial_proformas_read on public.commercial_proformas;
create policy commercial_proformas_read on public.commercial_proformas for select to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists commercial_proforma_lines_read on public.commercial_proforma_lines;
create policy commercial_proforma_lines_read on public.commercial_proforma_lines for select to authenticated
using (exists (
  select 1 from public.commercial_proformas p
  where p.id = proforma_id and (public.is_platform_admin() or public.is_org_member(p.org_id))
));

create or replace function public.admin_create_commercial_proforma(
  p_org_id uuid,
  p_currency_code text,
  p_valid_until date,
  p_notes text,
  p_tax_amount numeric,
  p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_number text;
  v_subtotal numeric(16,2);
  v_line jsonb;
  v_position integer := 0;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if not exists (select 1 from public.organizations where id = p_org_id and status = 'active') then
    raise exception 'An active customer organization is required';
  end if;
  if not exists (select 1 from public.currencies where code = upper(trim(p_currency_code))) then
    raise exception 'Unsupported currency';
  end if;
  if p_valid_until < current_date then raise exception 'Validity date cannot be in the past'; end if;
  if coalesce(p_tax_amount, 0) < 0 then raise exception 'Tax amount cannot be negative'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then
    raise exception 'Between 1 and 30 line items are required';
  end if;

  select sum((item->>'quantity')::numeric * (item->>'unit_amount')::numeric)
  into v_subtotal from jsonb_array_elements(p_lines) item;
  if v_subtotal is null or v_subtotal < 0 or v_subtotal > 1000000000 then
    raise exception 'Proforma subtotal is invalid';
  end if;

  v_number := 'PFI-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.commercial_proformas(
    org_id, proforma_number, currency_code, status, subtotal, tax_amount,
    valid_until, notes, created_by
  ) values (
    p_org_id, v_number, upper(trim(p_currency_code)), 'issued', v_subtotal,
    coalesce(p_tax_amount, 0), p_valid_until, nullif(left(trim(p_notes), 2000), ''), auth.uid()
  ) returning id into v_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if char_length(trim(v_line->>'description')) not between 2 and 500
      or (v_line->>'quantity')::numeric <= 0
      or (v_line->>'unit_amount')::numeric < 0 then
      raise exception 'A proforma line is invalid';
    end if;
    insert into public.commercial_proforma_lines(proforma_id, description, quantity, unit_amount, sort_order)
    values(v_id, trim(v_line->>'description'), (v_line->>'quantity')::numeric, (v_line->>'unit_amount')::numeric, v_position);
    v_position := v_position + 1;
  end loop;

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), p_org_id, 'billing.proforma_issued', 'commercial_proforma', v_id::text,
    jsonb_build_object('proforma_number', v_number, 'total', v_subtotal + coalesce(p_tax_amount,0), 'currency', upper(trim(p_currency_code))));
  return v_id;
end;
$$;
revoke all on function public.admin_create_commercial_proforma(uuid,text,date,text,numeric,jsonb) from public, anon;
grant execute on function public.admin_create_commercial_proforma(uuid,text,date,text,numeric,jsonb) to authenticated;

create or replace function public.admin_transition_commercial_proforma(p_proforma_id uuid, p_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.commercial_proformas;
  v_invoice_id uuid;
  v_invoice_number text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  select * into v_p from public.commercial_proformas where id = p_proforma_id for update;
  if not found then raise exception 'Proforma not found'; end if;

  if p_action = 'accept' then
    if v_p.status <> 'issued' then raise exception 'Only an issued proforma can be accepted'; end if;
    update public.commercial_proformas set status='accepted', accepted_at=now(), updated_at=now() where id=v_p.id;
  elsif p_action = 'void' then
    if v_p.status in ('converted','void') then raise exception 'This proforma can no longer be voided'; end if;
    update public.commercial_proformas set status='void', updated_at=now() where id=v_p.id;
  elsif p_action = 'convert' then
    if v_p.converted_invoice_id is not null then return v_p.converted_invoice_id; end if;
    if v_p.status not in ('issued','accepted') then raise exception 'Only an issued or accepted proforma can be converted'; end if;
    v_invoice_number := 'INV-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.commercial_invoices(
      org_id, invoice_number, source_type, source_id, currency_code, status,
      subtotal, tax_amount, due_at, created_by
    ) values (
      v_p.org_id, v_invoice_number, 'manual', v_p.id, v_p.currency_code, 'issued',
      v_p.subtotal, v_p.tax_amount, greatest(current_date, v_p.valid_until), auth.uid()
    ) returning id into v_invoice_id;
    insert into public.commercial_invoice_lines(invoice_id, description, quantity, unit_amount)
    select v_invoice_id, description, quantity, unit_amount
    from public.commercial_proforma_lines where proforma_id=v_p.id order by sort_order;
    insert into public.commercial_ledger_entries(
      org_id, entry_type, direction, amount, currency_code, reference_type,
      reference_id, description, actor_id, metadata
    ) values (
      v_p.org_id, 'invoice', 'debit', v_p.total_amount, v_p.currency_code,
      'commercial_invoice', v_invoice_id, 'Invoice converted from ' || v_p.proforma_number,
      auth.uid(), jsonb_build_object('proforma_id', v_p.id, 'proforma_number', v_p.proforma_number)
    );
    update public.commercial_proformas set status='converted', converted_invoice_id=v_invoice_id, updated_at=now() where id=v_p.id;
  else
    raise exception 'Unsupported proforma action';
  end if;

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), v_p.org_id, 'billing.proforma_' || p_action, 'commercial_proforma', v_p.id::text,
    jsonb_build_object('proforma_number', v_p.proforma_number, 'invoice_id', v_invoice_id));
  return coalesce(v_invoice_id, v_p.id);
end;
$$;
revoke all on function public.admin_transition_commercial_proforma(uuid,text) from public, anon;
grant execute on function public.admin_transition_commercial_proforma(uuid,text) to authenticated;

update public.commercial_proformas set status='expired', updated_at=now()
where status='issued' and valid_until < current_date;

commit;

-- ===== END 94_financial_documents.sql =====

-- ===== START 95_direct_financial_invoices.sql =====
-- Direct administrator invoice issuance for existing subscribed customers.
begin;

create or replace function public.admin_create_commercial_invoice(
  p_org_id uuid,
  p_currency_code text,
  p_due_at date,
  p_notes text default null,
  p_tax_amount numeric default 0,
  p_lines jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_number text;
  v_subtotal numeric(16,2);
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if not exists (
    select 1 from public.subscriptions s join public.organizations o on o.id=s.org_id
    where s.org_id=p_org_id and o.status='active'
      and s.status in ('trialing','active','past_due','grace_period','suspended')
  ) then raise exception 'Select an existing subscribed customer'; end if;
  if p_due_at < current_date then raise exception 'Invoice due date cannot be in the past'; end if;
  if upper(trim(p_currency_code)) not in (select code from public.currencies) then raise exception 'Unsupported currency'; end if;
  if p_tax_amount < 0 then raise exception 'Tax cannot be negative'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Between 1 and 30 line items are required'; end if;

  select sum((line->>'quantity')::numeric * (line->>'unit_amount')::numeric)
  into v_subtotal from jsonb_array_elements(p_lines) line;
  if v_subtotal is null or v_subtotal < 0 then raise exception 'Invoice lines are invalid'; end if;

  v_number := 'INV-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.commercial_invoices(org_id,invoice_number,source_type,currency_code,status,subtotal,tax_amount,due_at,created_by)
  values(p_org_id,v_number,'manual',upper(trim(p_currency_code)),'issued',v_subtotal,coalesce(p_tax_amount,0),p_due_at,auth.uid())
  returning id into v_id;

  insert into public.commercial_invoice_lines(invoice_id,description,quantity,unit_amount)
  select v_id,trim(line->>'description'),(line->>'quantity')::numeric,(line->>'unit_amount')::numeric
  from jsonb_array_elements(p_lines) with ordinality as item(line,position);

  insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,actor_id,metadata)
  values(p_org_id,'invoice','debit',v_subtotal+coalesce(p_tax_amount,0),upper(trim(p_currency_code)),'commercial_invoice',v_id,
    coalesce(nullif(trim(p_notes),''),'Direct invoice '||v_number),auth.uid(),jsonb_build_object('invoice_number',v_number));
  insert into public.audit_logs(actor_id,org_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),p_org_id,'billing.invoice_issued','commercial_invoice',v_id::text,jsonb_build_object('invoice_number',v_number,'total',v_subtotal+coalesce(p_tax_amount,0)));
  return v_id;
end;
$$;

revoke all on function public.admin_create_commercial_invoice(uuid,text,date,text,numeric,jsonb) from public,anon;
grant execute on function public.admin_create_commercial_invoice(uuid,text,date,text,numeric,jsonb) to authenticated;

commit;

-- ===== END 95_direct_financial_invoices.sql =====

-- ===== START 96_protected_storage_uploads.sql =====
begin;

-- Only the application server can authorize unpredictable destination names.
-- Existing permissive storage policies still enforce the caller's privileges.
create table public.protected_upload_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  unique (bucket_id, object_path)
);
alter table public.protected_upload_authorizations enable row level security;
revoke all on public.protected_upload_authorizations from public, anon, authenticated;
grant all on public.protected_upload_authorizations to service_role;

create or replace function public.has_protected_upload_authorization(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.protected_upload_authorizations
    where user_id = (select auth.uid()) and bucket_id = p_bucket
      and object_path = p_path and expires_at > now()
  );
$$;
revoke all on function public.has_protected_upload_authorization(text,text) from public;
grant execute on function public.has_protected_upload_authorization(text,text) to anon, authenticated;

create policy protected_storage_insert on storage.objects as restrictive for insert to public
with check (
  bucket_id not in ('advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs')
  or public.has_protected_upload_authorization(bucket_id, name)
);
-- Prevent an ordinary overwrite from replacing previously scanned bytes.
create policy protected_storage_update on storage.objects as restrictive for update to public
using (bucket_id not in ('advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs'))
with check (bucket_id not in ('advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs'));

commit;

-- ===== END 96_protected_storage_uploads.sql =====

-- ===== START 97_atomic_backend_commands.sql =====
begin;

-- The mutation and its cached result share one transaction. An interrupted
-- request either commits both or rolls back both; retries cannot replay a
-- committed effect with missing bookkeeping.
create or replace function public.execute_backend_command(
  p_command_name text, p_idempotency_key text, p_params jsonb, p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target_function text;
  command_row public.backend_command_requests;
  args text;
  signature_count integer;
  returns_void boolean;
  result_value jsonb;
  payload_hash text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._-]{8,128}$' then raise exception 'Invalid idempotency key'; end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object' then raise exception 'Command parameters must be an object'; end if;
  target_function := case p_command_name
    when 'organization.invite' then 'invite_team_member'
    when 'organization.transition' then 'admin_transition_organization'
    when 'organization.recovery.decide' then 'admin_decide_organization_recovery'
    when 'organization.purge' then 'admin_purge_subscriber'
    when 'subscription.transition' then 'transition_subscription'
    when 'advertising.order.create' then 'create_advert_order'
    when 'organization.verification.approve' then 'admin_approve_organization_verification'
    when 'procurement.ingestion.promote' then 'promote_opportunity_ingestion_item'
    when 'billing.payment.record' then 'record_commercial_payment'
    when 'billing.credit.issue' then 'issue_commercial_credit'
    when 'billing.refund.record' then 'record_commercial_refund'
    when 'billing.proforma.create' then 'admin_create_commercial_proforma'
    when 'billing.invoice.create' then 'admin_create_commercial_invoice'
    when 'billing.proforma.transition' then 'admin_transition_commercial_proforma'
    when 'platform_staff.update' then 'admin_update_platform_staff'
    when 'platform_intake_control.update' then 'admin_update_platform_intake_control'
    else null end;
  if target_function is null then raise exception 'Unsupported command'; end if;
  if p_command_name = any(array['organization.transition','organization.recovery.decide','organization.purge','subscription.transition','organization.verification.approve','billing.payment.record','billing.credit.issue','billing.refund.record','platform_staff.update','platform_intake_control.update','billing.proforma.create','billing.proforma.transition','billing.invoice.create'])
    and coalesce((select auth.jwt()->>'aal'),'aal1') <> 'aal2' then
    raise exception 'Additional verification is required before this sensitive action' using errcode='42501';
  end if;

  -- Resolve only an allowlisted public function with exactly these named
  -- parameters. Names and casts come from pg_catalog, never SQL supplied by
  -- a caller. Values are bound through USING.
  select count(*), bool_and(p.prorettype = 'pg_catalog.void'::regtype)
  into signature_count, returns_void
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=target_function
    and p.prokind='f' and p.proargmodes is null
    and cardinality(p.proargnames)=(select count(*) from jsonb_object_keys(p_params))
    and p.proargnames @> array(select jsonb_object_keys(p_params));
  if signature_count <> 1 then raise exception 'Invalid command parameters'; end if;
  select string_agg(format('%I => ($1 ->> %L)::%s', a.name, a.name, pg_catalog.format_type(a.type_oid,null)), ', ' order by a.position)
  into args
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  cross join lateral unnest(p.proargnames, p.proargtypes::oid[]) with ordinality a(name,type_oid,position)
  where n.nspname='public' and p.proname=target_function
    and p.prokind='f' and p.proargmodes is null
    and cardinality(p.proargnames)=(select count(*) from jsonb_object_keys(p_params))
    and p.proargnames @> array(select jsonb_object_keys(p_params));

  payload_hash := encode(sha256(convert_to(p_params::text,'UTF8')),'hex');
  insert into public.backend_command_requests(actor_id,command_name,idempotency_key,payload_hash,request_id)
  values(actor,p_command_name,p_idempotency_key,payload_hash,left(p_request_id,128))
  on conflict(actor_id,command_name,idempotency_key) do nothing
  returning * into command_row;
  if not found then
    select * into command_row from public.backend_command_requests
    where actor_id=actor and command_name=p_command_name and idempotency_key=p_idempotency_key
    for update;
    if command_row.payload_hash <> payload_hash then raise exception 'Idempotency key was already used with different input'; end if;
    if command_row.status='succeeded' then
      return jsonb_build_object('result',command_row.result,'cached',true,'commandId',command_row.id);
    end if;
    -- Old processing/failed records may already have committed their effect.
    -- They require reconciliation, never automatic replay.
    raise exception 'Legacy command outcome requires reconciliation; command is already processing or failed';
  end if;

  if returns_void then
    execute format('select public.%I(%s)', target_function, args) using p_params;
    result_value := null;
  else
    execute format('select to_jsonb(public.%I(%s))', target_function, args) into result_value using p_params;
  end if;
  update public.backend_command_requests set status='succeeded', result=result_value,
    completed_at=now(),updated_at=now(),error_code=null where id=command_row.id;
  return jsonb_build_object('result',result_value,'cached',false,'commandId',command_row.id);
end;
$$;
revoke all on function public.execute_backend_command(text,text,jsonb,text) from public,anon;
grant execute on function public.execute_backend_command(text,text,jsonb,text) to authenticated;
-- Only the transactional entry point may modify command outcomes now.
revoke execute on function public.claim_backend_command(text,text,text,text) from authenticated;
revoke execute on function public.complete_backend_command(uuid,jsonb) from authenticated;
revoke execute on function public.fail_backend_command(uuid,text) from authenticated;

commit;

-- ===== END 97_atomic_backend_commands.sql =====

select 'Batch 5/5 complete: migrations 86-97' as staging_migration_progress;
