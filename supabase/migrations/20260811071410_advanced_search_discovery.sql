-- Unified, permission-aware discovery across Manohub's existing public records.
begin;

alter table public.saved_searches
  add column if not exists search_scope text not null default 'tenders',
  add column if not exists filters jsonb not null default '{}'::jsonb;

alter table public.saved_searches
  drop constraint if exists saved_searches_search_scope_check;
alter table public.saved_searches
  add constraint saved_searches_search_scope_check
  check (search_scope in ('tenders', 'discovery'));

alter table public.saved_searches
  drop constraint if exists saved_searches_filters_object_check;
alter table public.saved_searches
  add constraint saved_searches_filters_object_check
  check (jsonb_typeof(filters) = 'object');

create index if not exists opportunities_title_trgm_idx
  on public.opportunities using gin (lower(title) gin_trgm_ops);
create index if not exists adverts_title_trgm_idx
  on public.adverts using gin (lower(title) gin_trgm_ops);
create index if not exists directory_profiles_name_trgm_idx
  on public.directory_profiles using gin (lower(business_name) gin_trgm_ops);
create index if not exists influencer_profiles_name_trgm_idx
  on public.influencer_profiles using gin (lower(display_name) gin_trgm_ops);
create index if not exists plans_name_trgm_idx
  on public.plans using gin (lower(name) gin_trgm_ops);

create or replace function public.search_discovery(
  p_query text default null,
  p_result_types text[] default null,
  p_district text default null,
  p_category text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_sort text default 'relevance',
  p_visitor_hash text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  result_type text,
  result_id uuid,
  href text,
  title text,
  summary text,
  category text,
  district text,
  published_on date,
  amount numeric,
  currency_code text,
  is_verified boolean,
  is_sponsored boolean,
  district_match boolean,
  contact_email text,
  contact_whatsapp text,
  relevance double precision,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_query text := nullif(left(btrim(coalesce(p_query, '')), 120), '');
  normalized_district text := nullif(left(btrim(coalesce(p_district, '')), 80), '');
  normalized_category text := nullif(left(btrim(coalesce(p_category, '')), 80), '');
begin
  if p_sort not in ('relevance', 'newest', 'value_high', 'value_low') then
    raise exception 'Unsupported discovery sort mode';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 5000 then
    raise exception 'Invalid discovery result window';
  end if;
  if p_min_value is not null and p_max_value is not null and p_min_value > p_max_value then
    raise exception 'Minimum value cannot exceed maximum value';
  end if;
  if p_visitor_hash is not null and p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor token';
  end if;
  if p_result_types is not null and not (p_result_types <@ array['tender','award','project','advert','service','business','influencer']::text[]) then
    raise exception 'Unsupported discovery result type';
  end if;

  return query
  with public_records as (
    select
      case when opportunity_type.code = 'procurement_plan' then 'project' else 'tender' end::text as record_type,
      opportunity.id as record_id,
      '/tenders/' || opportunity.slug as record_href,
      opportunity.title as record_title,
      coalesce(opportunity.summary, opportunity.buyer_name) as record_summary,
      coalesce(sector.name, opportunity_type.label) as record_category,
      district_row.name as record_district,
      opportunity.publication_date as record_date,
      opportunity.estimated_value as record_amount,
      opportunity.currency_code as record_currency,
      true as record_verified,
      opportunity.is_featured as record_sponsored,
      concat_ws(' ', opportunity.title, opportunity.reference_number, opportunity.buyer_name,
        opportunity.summary, opportunity.description, sector.name, district_row.name, opportunity_type.label) as search_text
    from public.opportunities opportunity
    join public.opportunity_statuses opportunity_status on opportunity_status.id = opportunity.status_id
    left join public.opportunity_types opportunity_type on opportunity_type.id = opportunity.opportunity_type_id
    left join public.sectors sector on sector.id = opportunity.sector_id
    left join public.districts district_row on district_row.id = opportunity.district_id
    where opportunity_status.code in ('published','amended','deadline_extended','closed','awarded')
      and coalesce(opportunity_type.code, '') <> 'contract_award'

    union all

    select 'award', award.id, '/tenders/' || opportunity.slug,
      opportunity.title || ' — awarded to ' || award.winning_supplier_name,
      coalesce(award.notes, opportunity.summary, opportunity.buyer_name),
      coalesce(sector.name, 'Contract award'), district_row.name, award.award_date,
      award.awarded_value, coalesce(award.currency_code, opportunity.currency_code), true, false,
      concat_ws(' ', opportunity.title, opportunity.reference_number, opportunity.buyer_name,
        award.winning_supplier_name, award.notes, sector.name, district_row.name)
    from public.opportunity_awards award
    join public.opportunities opportunity on opportunity.id = award.opportunity_id
    join public.opportunity_statuses opportunity_status on opportunity_status.id = opportunity.status_id
    left join public.sectors sector on sector.id = opportunity.sector_id
    left join public.districts district_row on district_row.id = opportunity.district_id
    where opportunity_status.code in ('published','amended','deadline_extended','closed','awarded')

    union all

    select 'advert', advert.id, '/adverts/' || advert.slug, advert.title,
      coalesce(advert.summary, advert.business_name), advert.category, null::text,
      coalesce(advert.published_at::date, advert.created_at::date), null::numeric, null::text,
      true, true, concat_ws(' ', advert.title, advert.business_name, advert.summary, advert.content, advert.category)
    from public.adverts advert
    left join public.organizations advert_org on advert_org.id = advert.org_id
    where advert.status = 'live'
      and (advert.starts_at is null or advert.starts_at <= now())
      and (advert.ends_at is null or advert.ends_at >= now())
      and coalesce(advert_org.is_demo, false) = false
      and coalesce(advert_org.status, 'active') = 'active'

    union all

    select 'service', plan.id, null::text, plan.name, plan.description, 'Manohub service', null::text,
      plan.created_at::date, plan.monthly_price, plan.currency_code, true, false,
      concat_ws(' ', plan.name, plan.description, plan.code)
    from public.plans plan
    where plan.is_active

    union all

    select 'business', business.id, null::text, business.business_name, business.description,
      business.category, coalesce(business.district, business.city), business.created_at::date,
      null::numeric, null::text, business.is_verified, false,
      concat_ws(' ', business.business_name, business.category, business.description, business.district, business.city)
    from public.directory_profiles business
    left join public.organizations business_org on business_org.id = business.claimed_by_org_id
    where business.is_verified
      and coalesce(business_org.is_demo, false) = false
      and coalesce(business_org.status, 'active') = 'active'

    union all

    select 'influencer', influencer.id, null::text, influencer.display_name,
      concat_ws(' · ', influencer.audience_size, influencer.engagement_rate),
      array_to_string(influencer.categories, ', '), coalesce(influencer.district, influencer.location),
      influencer.created_at::date, null::numeric, null::text, influencer.is_verified, false,
      concat_ws(' ', influencer.display_name, influencer.location, influencer.district,
        array_to_string(influencer.categories, ' '), array_to_string(influencer.platforms, ' '))
    from public.influencer_profiles influencer
    where influencer.is_verified
  ), filtered as (
    select record.*,
      case when normalized_query is null then 0.0
        else greatest(
          extensions.similarity(lower(record.record_title), lower(normalized_query)) * 100,
          extensions.word_similarity(lower(normalized_query), lower(record.search_text)) * 90
        )
      end
      + case when record.record_verified then 4 else 0 end
      + case when record.record_sponsored then 1 else 0 end as score
    from public_records record
    where (p_result_types is null or record.record_type = any(p_result_types))
      and (normalized_query is null
        or extensions.word_similarity(lower(normalized_query), lower(record.search_text)) >= 0.3
        or lower(record.search_text) like '%' || lower(normalized_query) || '%')
      and (normalized_district is null or lower(record.record_district) = lower(normalized_district))
      and (normalized_category is null or lower(record.record_category) like '%' || lower(normalized_category) || '%')
      and (p_date_from is null or record.record_date >= p_date_from)
      and (p_date_to is null or record.record_date <= p_date_to)
      and (p_min_value is null or record.record_amount >= p_min_value)
      and (p_max_value is null or record.record_amount <= p_max_value)
  ), measured as (
    select filtered.*, count(*) over() as measured_total
    from filtered
  )
  select measured.record_type, measured.record_id, measured.record_href, measured.record_title,
    measured.record_summary, measured.record_category, measured.record_district, measured.record_date,
    measured.record_amount, measured.record_currency, measured.record_verified, measured.record_sponsored,
    (normalized_district is not null and lower(measured.record_district) = lower(normalized_district)),
    case when auth.uid() is not null and measured.record_type = 'business' then business.email else null end,
    case when auth.uid() is not null and measured.record_type = 'business' then business.whatsapp else null end,
    measured.score, measured.measured_total
  from measured
  left join public.directory_profiles business
    on measured.record_type = 'business' and business.id = measured.record_id
  order by
    case when p_sort = 'relevance' then measured.score end desc,
    case when p_sort = 'newest' then measured.record_date end desc nulls last,
    case when p_sort = 'value_high' then measured.record_amount end desc nulls last,
    case when p_sort = 'value_low' then measured.record_amount end asc nulls last,
    measured.record_verified desc, measured.record_sponsored desc, measured.record_title
  limit p_limit offset p_offset;

end;
$$;

create or replace function public.record_discovery_search(
  p_query text,
  p_filters jsonb,
  p_sort text,
  p_result_count integer,
  p_visitor_hash text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_query text := nullif(left(btrim(coalesce(p_query, '')), 120), '');
  safe_filters jsonb := coalesce(p_filters, '{}'::jsonb) || jsonb_build_object('scope', 'discovery');
begin
  if normalized_query is null then return; end if;
  if jsonb_typeof(safe_filters) <> 'object' or pg_column_size(safe_filters) > 4096 then
    raise exception 'Invalid discovery filters';
  end if;
  if p_sort not in ('relevance', 'newest', 'value_high', 'value_low') then
    raise exception 'Unsupported discovery sort mode';
  end if;
  if p_result_count < 0 or p_result_count > 100000 then
    raise exception 'Invalid discovery result count';
  end if;
  if p_visitor_hash is not null and p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor token';
  end if;

  insert into public.procurement_search_events(user_id, visitor_hash, search_term, filters, sort_mode, result_count)
  select auth.uid(), p_visitor_hash, lower(normalized_query), safe_filters,
    case when p_sort in ('relevance', 'newest') then p_sort else 'relevance' end,
    p_result_count
  where not exists (
    select 1 from public.procurement_search_events previous
    where previous.created_at >= now() - interval '1 minute'
      and previous.user_id is not distinct from auth.uid()
      and previous.visitor_hash is not distinct from p_visitor_hash
      and previous.search_term = lower(normalized_query)
      and previous.filters = safe_filters
  );
end;
$$;

create or replace function public.search_discovery_suggestions(p_query text, p_limit integer default 8)
returns table(term text, result_type text)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select candidate.title, candidate.result_type
  from public.search_discovery(p_query, null, null, null, null, null, null, null, 'relevance', null, least(greatest(p_limit, 1), 12), 0) candidate
  order by candidate.relevance desc, candidate.title
  limit least(greatest(p_limit, 1), 12)
$$;

create or replace function public.get_discovery_trends(p_limit integer default 8)
returns table(term text, searches bigint)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select event.search_term, count(*)
  from public.procurement_search_events event
  where event.created_at >= now() - interval '30 days'
    and event.filters->>'scope' = 'discovery'
    and event.search_term is not null
  group by event.search_term
  having count(*) >= 3
  order by count(*) desc, max(event.created_at) desc, event.search_term
  limit least(greatest(p_limit, 1), 20)
$$;

revoke all on function public.search_discovery(text,text[],text,text,date,date,numeric,numeric,text,text,integer,integer) from public;
revoke all on function public.record_discovery_search(text,jsonb,text,integer,text) from public;
revoke all on function public.search_discovery_suggestions(text,integer) from public;
revoke all on function public.get_discovery_trends(integer) from public;
grant execute on function public.search_discovery(text,text[],text,text,date,date,numeric,numeric,text,text,integer,integer) to anon, authenticated, service_role;
grant execute on function public.record_discovery_search(text,jsonb,text,integer,text) to anon, authenticated, service_role;
grant execute on function public.search_discovery_suggestions(text,integer) to anon, authenticated, service_role;
grant execute on function public.get_discovery_trends(integer) to anon, authenticated, service_role;

commit;
