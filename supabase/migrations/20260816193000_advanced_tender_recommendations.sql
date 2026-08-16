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
