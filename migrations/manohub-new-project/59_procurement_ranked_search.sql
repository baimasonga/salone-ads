-- Ranked procurement discovery with server-side filters and privacy-conscious
-- search analytics. Public search is explicitly restricted to public statuses.

begin;

alter table public.opportunities
  add column if not exists search_vector tsvector;

create or replace function public.refresh_opportunity_search_vector()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple'::regconfig, coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.reference_number, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.buyer_name, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.summary, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.description, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.eligibility_requirements, '')), 'C');
  return new;
end;
$$;

update public.opportunities
set search_vector =
      setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(reference_number, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(buyer_name, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(summary, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(description, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, coalesce(eligibility_requirements, '')), 'C')
where search_vector is null;

alter table public.opportunities
  alter column search_vector set default ''::tsvector,
  alter column search_vector set not null;

drop trigger if exists opportunities_refresh_search_vector on public.opportunities;
create trigger opportunities_refresh_search_vector
before insert or update of title, reference_number, buyer_name, summary, description, eligibility_requirements
on public.opportunities
for each row execute function public.refresh_opportunity_search_vector();

create index if not exists opportunities_search_vector_idx
  on public.opportunities using gin(search_vector);
create index if not exists opportunities_public_discovery_idx
  on public.opportunities(status_id, is_featured desc, submission_deadline, publication_date desc);

create table if not exists public.procurement_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_hash text check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$'),
  search_term text,
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  sort_mode text not null check (sort_mode in ('relevance', 'deadline', 'newest')),
  result_count integer not null default 0 check (result_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists procurement_search_events_created_idx
  on public.procurement_search_events(created_at desc);
create index if not exists procurement_search_events_term_idx
  on public.procurement_search_events(lower(search_term), created_at desc)
  where search_term is not null;
create index if not exists procurement_search_events_user_idx
  on public.procurement_search_events(user_id, created_at desc)
  where user_id is not null;

alter table public.procurement_search_events enable row level security;
revoke all on public.procurement_search_events from public, anon, authenticated;
grant select, insert, update, delete on public.procurement_search_events to service_role;

create or replace function public.search_public_opportunities(
  p_query text default null,
  p_sector_id uuid default null,
  p_country_id uuid default null,
  p_district_id uuid default null,
  p_opportunity_type_id uuid default null,
  p_status_filter text default 'all',
  p_sort text default 'relevance',
  p_visitor_hash text default null,
  p_limit integer default 50
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
  relevance_score real,
  total_count bigint,
  search_event_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_query text := nullif(left(btrim(coalesce(p_query, '')), 120), '');
  search_query tsquery;
  analytics_id uuid;
  filters_json jsonb;
begin
  if p_status_filter not in ('all', 'open', 'closing', 'featured') then
    raise exception 'Unsupported tender status filter';
  end if;
  if p_sort not in ('relevance', 'deadline', 'newest') then
    raise exception 'Unsupported tender sort mode';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Search limit must be between 1 and 100';
  end if;
  if p_visitor_hash is not null and p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor token';
  end if;

  if normalized_query is not null then
    search_query := websearch_to_tsquery('simple'::regconfig, normalized_query);
  end if;
  filters_json := jsonb_strip_nulls(jsonb_build_object(
    'sector_id', p_sector_id,
    'country_id', p_country_id,
    'district_id', p_district_id,
    'opportunity_type_id', p_opportunity_type_id,
    'status', p_status_filter
  ));

  insert into public.procurement_search_events(
    user_id, visitor_hash, search_term, filters, sort_mode
  )
  select auth.uid(), p_visitor_hash, lower(normalized_query), filters_json, p_sort
  where not exists (
    select 1
    from public.procurement_search_events previous
    where previous.created_at >= now() - interval '1 minute'
      and previous.user_id is not distinct from auth.uid()
      and previous.visitor_hash is not distinct from p_visitor_hash
      and previous.search_term is not distinct from lower(normalized_query)
      and previous.filters = filters_json
      and previous.sort_mode = p_sort
  )
  returning public.procurement_search_events.id into analytics_id;

  if analytics_id is null then
    select previous.id into analytics_id
    from public.procurement_search_events previous
    where previous.created_at >= now() - interval '1 minute'
      and previous.user_id is not distinct from auth.uid()
      and previous.visitor_hash is not distinct from p_visitor_hash
      and previous.search_term is not distinct from lower(normalized_query)
      and previous.filters = filters_json
      and previous.sort_mode = p_sort
    order by previous.created_at desc
    limit 1;
  end if;

  return query
  with ranked as (
    select
      opportunity.id,
      opportunity.slug,
      opportunity.title,
      opportunity.buyer_name,
      opportunity.publication_date,
      opportunity.submission_deadline,
      opportunity.estimated_value,
      opportunity.currency_code,
      opportunity.is_featured,
      opportunity.review_note,
      opportunity.view_count,
      sector.name as sector,
      district.name as district,
      country.name as country,
      opportunity_type.label as opportunity_type,
      status.code as status_code,
      status.label as status_label,
      (
        case when search_query is null then 0
          else ts_rank_cd(opportunity.search_vector, search_query, 32) * 100
        end
        + case when opportunity.is_featured then 4 else 0 end
        + case when opportunity.publication_date >= current_date - 14 then 2 else 0 end
      )::real as relevance_score
    from public.opportunities opportunity
    join public.opportunity_statuses status on status.id = opportunity.status_id
    left join public.sectors sector on sector.id = opportunity.sector_id
    left join public.districts district on district.id = opportunity.district_id
    left join public.countries country on country.id = opportunity.country_id
    left join public.opportunity_types opportunity_type on opportunity_type.id = opportunity.opportunity_type_id
    where status.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded')
      and (search_query is null or opportunity.search_vector @@ search_query)
      and (p_sector_id is null or opportunity.sector_id = p_sector_id)
      and (p_country_id is null or opportunity.country_id = p_country_id)
      and (p_district_id is null or opportunity.district_id = p_district_id)
      and (p_opportunity_type_id is null or opportunity.opportunity_type_id = p_opportunity_type_id)
      and (
        p_status_filter = 'all'
        or (p_status_filter = 'open' and opportunity.submission_deadline >= now())
        or (p_status_filter = 'closing' and opportunity.submission_deadline between now() and now() + interval '7 days')
        or (p_status_filter = 'featured' and opportunity.is_featured)
      )
  ),
  measured as (
    select ranked.*, count(*) over() as total_count
    from ranked
  )
  select
    measured.id, measured.slug, measured.title, measured.buyer_name,
    measured.submission_deadline, measured.estimated_value, measured.currency_code,
    measured.is_featured, measured.review_note, measured.view_count,
    measured.sector, measured.district, measured.country, measured.opportunity_type,
    measured.status_code, measured.status_label, measured.relevance_score,
    measured.total_count, analytics_id
  from measured
  order by
    case when p_sort = 'relevance' then measured.relevance_score end desc,
    case when p_sort = 'newest' then measured.publication_date end desc,
    case when p_sort = 'deadline' then measured.submission_deadline end asc,
    measured.is_featured desc,
    measured.submission_deadline asc,
    measured.id
  limit p_limit;

  update public.procurement_search_events event
  set result_count = coalesce((
    select count(*)::integer
    from public.opportunities opportunity
    join public.opportunity_statuses status on status.id = opportunity.status_id
    where status.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded')
      and (search_query is null or opportunity.search_vector @@ search_query)
      and (p_sector_id is null or opportunity.sector_id = p_sector_id)
      and (p_country_id is null or opportunity.country_id = p_country_id)
      and (p_district_id is null or opportunity.district_id = p_district_id)
      and (p_opportunity_type_id is null or opportunity.opportunity_type_id = p_opportunity_type_id)
      and (
        p_status_filter = 'all'
        or (p_status_filter = 'open' and opportunity.submission_deadline >= now())
        or (p_status_filter = 'closing' and opportunity.submission_deadline between now() and now() + interval '7 days')
        or (p_status_filter = 'featured' and opportunity.is_featured)
      )
  ), 0)
  where event.id = analytics_id;
end;
$$;

create or replace function public.admin_get_procurement_search_insights(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;
  if p_days < 1 or p_days > 365 then
    raise exception 'Insight window must be between 1 and 365 days';
  end if;
  return jsonb_build_object(
    'searches', (select count(*) from public.procurement_search_events where created_at >= now() - make_interval(days => p_days)),
    'zero_result_searches', (select count(*) from public.procurement_search_events where created_at >= now() - make_interval(days => p_days) and result_count = 0),
    'top_terms', coalesce((
      select jsonb_agg(to_jsonb(term_row))
      from (
        select search_term as term, count(*) as searches, round(avg(result_count), 1) as average_results
        from public.procurement_search_events
        where created_at >= now() - make_interval(days => p_days) and search_term is not null
        group by search_term order by count(*) desc, search_term limit 10
      ) term_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.refresh_opportunity_search_vector() from public, anon, authenticated;
revoke all on function public.search_public_opportunities(text, uuid, uuid, uuid, uuid, text, text, text, integer) from public;
revoke all on function public.admin_get_procurement_search_insights(integer) from public, anon;
grant execute on function public.search_public_opportunities(text, uuid, uuid, uuid, uuid, text, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.admin_get_procurement_search_insights(integer) to authenticated, service_role;

commit;
