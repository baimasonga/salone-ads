-- Manohub: remove the demonstration content added by 04_demo_seed.sql
-- (and published by 05_publish_demo_seed.sql).
--
-- Run this once you have real tenders and adverts and no longer want fictional
-- records visible to the public. It is OPTIONAL and is NOT part of the
-- numbered migration chain.
--
-- Scope: it only ever touches rows carrying the seed's own markers —
--   opportunities        slug like 'demo-%'  AND title like '[DEMO]%'
--   adverts              slug like 'demo-%'  AND title like '[DEMO]%'
--   organizations        name like 'Demo %'
--   directory_profiles   business_name like 'Demo %'
--   influencer_profiles  display_name like 'Demo %'
--   categories           slug like 'demo-%'
--   funding_agencies     the two named demo funds
-- Nothing else is deleted. Idempotent — safe to run more than once.
--
-- SAFETY: run the AUDIT block at the bottom FIRST and read the counts. If any
-- number looks wrong, stop; do not run the deletes.

begin;

-- ---------------------------------------------------------------------------
-- Guard: refuse to run if a real (non-demo) user has been attached to a demo
-- organisation. That would mean the demo org is in genuine use and deleting it
-- would cascade into real member/subscription data.
-- ---------------------------------------------------------------------------
do $$
declare
  attached integer;
begin
  select count(*) into attached
  from public.organization_members om
  join public.organizations o on o.id = om.org_id
  where o.name like 'Demo %';

  if attached > 0 then
    raise exception
      'Aborting: % user(s) are members of a Demo organisation. Reassign or remove them first.', attached;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Children first where the foreign key does not cascade on its own.
-- ---------------------------------------------------------------------------

-- Junction rows for demo opportunities (also covered by the FK cascade, but
-- explicit here so the row counts below are meaningful).
delete from public.opportunity_categories oc
using public.opportunities o
where oc.opportunity_id = o.id
  and o.slug like 'demo-%'
  and o.title like '[DEMO]%';

-- Advert measurement rows for demo adverts (advert_events cascades from
-- adverts, but the commercial tables may not exist on every project).
delete from public.advert_events ae
using public.adverts a
where ae.advert_id = a.id
  and a.slug like 'demo-%'
  and a.title like '[DEMO]%';

-- ---------------------------------------------------------------------------
-- The demo content itself.
-- ---------------------------------------------------------------------------

-- Opportunities: amendments, awards, documents, saves and responses all
-- cascade from public.opportunities.
delete from public.opportunities
where slug like 'demo-%'
  and title like '[DEMO]%';

delete from public.adverts
where slug like 'demo-%'
  and title like '[DEMO]%';

delete from public.directory_profiles
where business_name like 'Demo %';

delete from public.influencer_profiles
where display_name like 'Demo %';

-- Organisations last: buyer_profiles, brand_kits, social_connections,
-- subscriptions, advertisement_requests and organization_members all cascade.
-- The guard above has already proven no real user is attached.
delete from public.organizations
where name like 'Demo %';

delete from public.funding_agencies
where name in (
  'Manohub Demo Development Fund',
  'West Africa Demo Growth Facility'
);

-- Demo taxonomy rows. Deleted last so any opportunity still referencing them
-- is already gone; the FK is ON DELETE CASCADE for the junction table.
delete from public.categories
where slug like 'demo-%';

commit;

-- ---------------------------------------------------------------------------
-- AUDIT — run this BEFORE the deletes to preview scope, and again AFTER to
-- confirm. Every count should be 0 afterwards.
-- ---------------------------------------------------------------------------
--
-- select
--   (select count(*) from public.opportunities
--      where slug like 'demo-%' and title like '[DEMO]%')      as demo_opportunities,
--   (select count(*) from public.adverts
--      where slug like 'demo-%' and title like '[DEMO]%')      as demo_adverts,
--   (select count(*) from public.organizations
--      where name like 'Demo %')                               as demo_orgs,
--   (select count(*) from public.directory_profiles
--      where business_name like 'Demo %')                      as demo_directory,
--   (select count(*) from public.influencer_profiles
--      where display_name like 'Demo %')                       as demo_influencers,
--   (select count(*) from public.categories
--      where slug like 'demo-%')                               as demo_categories,
--   (select count(*) from public.funding_agencies
--      where name like '%Demo%')                               as demo_funders,
--   (select count(*) from public.organization_members om
--      join public.organizations o on o.id = om.org_id
--      where o.name like 'Demo %')                             as real_users_in_demo_orgs;
--
-- `real_users_in_demo_orgs` must be 0 or the guard will abort the script.
