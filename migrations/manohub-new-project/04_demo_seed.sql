-- Manohub production demo content.
-- Apply after 03_security_hardening.sql.
-- All records are fictional, clearly labelled, and safe to rerun.

begin;

insert into public.categories (sector_id, name, slug, sort_order)
select s.id, seed.name, seed.slug, seed.sort_order
from (
  values
    ('agriculture', 'Farm inputs and equipment', 'demo-farm-inputs-equipment', 10),
    ('construction-infrastructure', 'Civil works', 'demo-civil-works', 20),
    ('telecommunications-ict', 'Software and IT services', 'demo-software-it-services', 30),
    ('health', 'Medical supplies', 'demo-medical-supplies', 40),
    ('education', 'Learning materials', 'demo-learning-materials', 50),
    ('energy-utilities', 'Renewable energy', 'demo-renewable-energy', 60),
    ('transport-logistics', 'Fleet and logistics', 'demo-fleet-logistics', 70),
    ('consulting-professional-services', 'Professional consulting', 'demo-professional-consulting', 80)
) as seed(sector_slug, name, slug, sort_order)
join public.sectors s on s.slug = seed.sector_slug
on conflict (slug) do update
set name = excluded.name,
    sector_id = excluded.sector_id,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.funding_agencies (name, website)
select seed.name, seed.website
from (
  values
    ('Manohub Demo Development Fund', 'https://fund.example'),
    ('West Africa Demo Growth Facility', 'https://growth.example')
) as seed(name, website)
where not exists (
  select 1 from public.funding_agencies existing where existing.name = seed.name
);

insert into public.organizations (
  name, type, country, district, primary_objective,
  monthly_budget, is_buyer, is_supplier, buyer_verified
)
select seed.name, seed.type, seed.country, seed.district, seed.primary_objective,
       seed.monthly_budget, seed.is_buyer, seed.is_supplier, seed.buyer_verified
from (
  values
    ('Demo Salone Agriculture Agency', 'Government / Public Sector', 'Sierra Leone', 'Western Area Urban', 'Procurement', 'Demo only', true, false, true),
    ('Demo Community Health Initiative', 'NGO / Development Partner', 'Sierra Leone', 'Bo', 'Procurement', 'Demo only', true, false, true),
    ('Demo Mano River Enterprise', 'Small Business', 'Sierra Leone', 'Kambia', 'Business growth', 'Demo only', false, true, false),
    ('Demo Freetown Digital Studio', 'Small Business', 'Sierra Leone', 'Western Area Urban', 'Advertising', 'Demo only', false, true, false)
) as seed(name, type, country, district, primary_objective, monthly_budget, is_buyer, is_supplier, buyer_verified)
where not exists (
  select 1 from public.organizations existing where existing.name = seed.name
);

insert into public.buyer_profiles (org_id, description, website)
select o.id, seed.description, seed.website
from (
  values
    ('Demo Salone Agriculture Agency', 'Fictional buyer profile used to demonstrate public procurement workflows.', 'https://agriculture.example'),
    ('Demo Community Health Initiative', 'Fictional development organization used for platform demonstrations.', 'https://health.example')
) as seed(org_name, description, website)
join public.organizations o on o.name = seed.org_name
on conflict (org_id) do update
set description = excluded.description,
    website = excluded.website,
    updated_at = now();

-- Administrative seed publishing must bypass the end-user workflow guard.
-- The trigger is re-enabled within this same transaction.
alter table public.opportunities disable trigger protect_opportunity_transition_trigger;

insert into public.opportunities (
  slug, title, reference_number, summary, description,
  opportunity_type_id, procurement_method_id, sector_id, country_id, district_id,
  city, buyer_org_id, buyer_name, funding_agency_id,
  publication_date, clarification_deadline, submission_deadline, opening_date,
  estimated_value, currency_code, eligibility_requirements, bid_security,
  application_fee, contact_details, submission_instructions,
  source_name, source_url, source_type, status_id,
  is_featured, data_confidence, view_count
)
select
  seed.slug,
  seed.title,
  seed.reference_number,
  seed.summary,
  seed.description,
  ot.id,
  pm.id,
  s.id,
  c.id,
  d.id,
  seed.city,
  o.id,
  seed.buyer_name,
  fa.id,
  current_date,
  now() + seed.clarification_days * interval '1 day',
  now() + seed.deadline_days * interval '1 day',
  now() + (seed.deadline_days * interval '1 day') + interval '2 hours',
  seed.estimated_value,
  seed.currency_code,
  seed.eligibility_requirements,
  'Not applicable — demonstration record',
  'No fee — demonstration record',
  'Demo contact only. Do not submit a real bid.',
  'This is fictional demo content. Explore the workflow but do not submit real documents.',
  'Manohub demonstration dataset',
  seed.source_url,
  'admin_entry',
  os.id,
  seed.is_featured,
  'high',
  seed.view_count
from (
  values
    (
      'demo-solar-cold-storage-kambia',
      '[DEMO] Solar Cold-Storage Units for Farming Cooperatives',
      'DEMO/AGR/2026/001',
      'Supply and install modular solar cold-storage systems for demonstration cooperatives.',
      'This fictional tender demonstrates opportunity discovery, saving, sharing, and supplier intent-to-bid workflows.',
      'itb', 'ncb', 'agriculture', 'SL', 'Kambia', 'Kambia',
      'Demo Salone Agriculture Agency', 'Demo Salone Agriculture Agency',
      'Manohub Demo Development Fund', 12, 35, 850000.00, 'SLE',
      'Registered suppliers with renewable-energy installation experience.',
      'https://tenders.example/demo-solar-cold-storage', true, 248
    ),
    (
      'demo-school-connectivity-bo',
      '[DEMO] Connectivity and Computer Labs for Rural Schools',
      'DEMO/EDU/2026/002',
      'Design and equip six demonstration school computer labs with connectivity and training.',
      'A fictional request for proposal showing a multi-lot ICT and education procurement opportunity.',
      'rfp', 'ncb', 'telecommunications-ict', 'SL', 'Bo', 'Bo',
      'Demo Community Health Initiative', 'Demo Learning Access Programme',
      'West Africa Demo Growth Facility', 10, 30, 1250000.00, 'SLE',
      'ICT firms or joint ventures with education-sector implementation capacity.',
      'https://tenders.example/demo-school-connectivity', true, 194
    ),
    (
      'demo-medical-supply-framework-freetown',
      '[DEMO] Framework Agreement for Essential Medical Supplies',
      'DEMO/HLT/2026/003',
      'Establish a demonstration framework for essential clinic consumables.',
      'This fictional RFQ illustrates recurring procurement, deadlines, and public tender details.',
      'rfq', 'framework', 'health', 'SL', 'Western Area Urban', 'Freetown',
      'Demo Community Health Initiative', 'Demo Community Health Initiative',
      'Manohub Demo Development Fund', 8, 24, 480000.00, 'SLE',
      'Licensed suppliers able to demonstrate product traceability and quality control.',
      'https://tenders.example/demo-medical-supplies', false, 132
    ),
    (
      'demo-feeder-road-supervision-port-loko',
      '[DEMO] Consultancy for Feeder-Road Works Supervision',
      'DEMO/INF/2026/004',
      'Consulting services for quality assurance and supervision of demonstration feeder-road works.',
      'A fictional expression of interest for engineering and infrastructure consultants.',
      'eoi', 'ncb', 'consulting-professional-services', 'SL', 'Port Loko', 'Port Loko',
      'Demo Salone Agriculture Agency', 'Demo Rural Infrastructure Unit',
      'West Africa Demo Growth Facility', 14, 40, 620000.00, 'SLE',
      'Consulting firms with civil-works supervision and safeguards specialists.',
      'https://tenders.example/demo-road-supervision', false, 101
    ),
    (
      'demo-fleet-tracking-mano-river',
      '[DEMO] Fleet Tracking and Maintenance Information System',
      'DEMO/ICT/2026/005',
      'Supply a demonstration GPS fleet-management platform with maintenance analytics.',
      'This fictional procurement shows how technology suppliers can discover and track opportunities.',
      'rfp', 'ncb', 'transport-logistics', 'SL', 'Western Area Urban', 'Freetown',
      'Demo Salone Agriculture Agency', 'Demo Public Transport Programme',
      'Manohub Demo Development Fund', 9, 28, 710000.00, 'SLE',
      'Technology providers with GPS integration, support, and data-protection experience.',
      'https://tenders.example/demo-fleet-tracking', true, 286
    ),
    (
      'demo-liberia-agro-processing-grant',
      '[DEMO] Innovation Grants for Women-Led Agro-Processors',
      'DEMO/LR/2026/006',
      'Fictional grant call for small women-led agro-processing enterprises in Liberia.',
      'A demonstration cross-border opportunity showing Manohub coverage beyond Sierra Leone.',
      'grant', 'rfq', 'agriculture', 'LR', 'Montserrado', 'Monrovia',
      null, 'Demo Mano River Growth Programme',
      'West Africa Demo Growth Facility', 16, 45, 150000.00, 'USD',
      'Eligible women-led enterprises operating in the target value chains.',
      'https://grants.example/demo-agro-processing', false, 89
    )
) as seed(
  slug, title, reference_number, summary, description,
  type_code, method_code, sector_slug, country_code, district_name, city,
  buyer_org_name, buyer_name, funding_agency_name,
  clarification_days, deadline_days, estimated_value, currency_code,
  eligibility_requirements, source_url, is_featured, view_count
)
join public.opportunity_types ot on ot.code = seed.type_code
join public.procurement_methods pm on pm.code = seed.method_code
join public.sectors s on s.slug = seed.sector_slug
join public.countries c on c.code = seed.country_code
join public.districts d on d.country_id = c.id and d.name = seed.district_name
left join public.organizations o on o.name = seed.buyer_org_name
left join public.funding_agencies fa on fa.name = seed.funding_agency_name
join public.opportunity_statuses os on os.code = 'published'
on conflict (slug) do update
set title = excluded.title,
    reference_number = excluded.reference_number,
    summary = excluded.summary,
    description = excluded.description,
    submission_deadline = excluded.submission_deadline,
    clarification_deadline = excluded.clarification_deadline,
    opening_date = excluded.opening_date,
    estimated_value = excluded.estimated_value,
    status_id = excluded.status_id,
    is_featured = excluded.is_featured,
    updated_at = now();

alter table public.opportunities enable trigger protect_opportunity_transition_trigger;

insert into public.opportunity_categories (opportunity_id, category_id)
select o.id, c.id
from (
  values
    ('demo-solar-cold-storage-kambia', 'demo-renewable-energy'),
    ('demo-solar-cold-storage-kambia', 'demo-farm-inputs-equipment'),
    ('demo-school-connectivity-bo', 'demo-software-it-services'),
    ('demo-school-connectivity-bo', 'demo-learning-materials'),
    ('demo-medical-supply-framework-freetown', 'demo-medical-supplies'),
    ('demo-feeder-road-supervision-port-loko', 'demo-professional-consulting'),
    ('demo-fleet-tracking-mano-river', 'demo-fleet-logistics'),
    ('demo-fleet-tracking-mano-river', 'demo-software-it-services'),
    ('demo-liberia-agro-processing-grant', 'demo-farm-inputs-equipment')
) as seed(opportunity_slug, category_slug)
join public.opportunities o on o.slug = seed.opportunity_slug
join public.categories c on c.slug = seed.category_slug
on conflict do nothing;

insert into public.adverts (
  slug, title, category, business_name, summary, content,
  social_platform, social_url, status, org_id, published_at,
  accent_color, theme, format, with_photo,
  view_count, click_count, starts_at, ends_at
)
select
  seed.slug, seed.title, seed.category, seed.business_name, seed.summary, seed.content,
  seed.social_platform, seed.social_url, 'live', o.id, now(),
  seed.accent_color, seed.theme, seed.format, false,
  seed.view_count, seed.click_count, now() - interval '1 day', now() + interval '90 days'
from (
  values
    (
      'demo-business-visibility-package',
      '[DEMO] Put Your Business in Front of New Customers',
      'business',
      'Demo Freetown Digital Studio',
      'A fictional campaign demonstrating Manohub advertising placements.',
      'Demo content: promote services across digital channels with a simple, measurable campaign.',
      'facebook', 'https://social.example/demo-visibility', '#10b981', 'dark', 'landscape', 1820, 96
    ),
    (
      'demo-mano-river-marketplace',
      '[DEMO] Locally Made Products, Ready for New Markets',
      'marketplace',
      'Demo Mano River Enterprise',
      'A fictional marketplace promotion for Sierra Leonean products.',
      'Demo content: discover locally produced foods, crafts, and business supplies.',
      'instagram', 'https://social.example/demo-marketplace', '#f59e0b', 'light', 'square', 1340, 73
    ),
    (
      'demo-agritech-open-day',
      '[DEMO] Agritech Open Day in Kambia',
      'event',
      'Demo Salone Agriculture Agency',
      'A fictional event advert for testing sharing and engagement tracking.',
      'Demo content: explore solar irrigation, storage, and farm-management technologies.',
      'whatsapp', 'https://events.example/demo-agritech', '#22c55e', 'dark', 'story', 905, 61
    ),
    (
      'demo-digital-skills-workshop',
      '[DEMO] Practical Digital Skills for Small Businesses',
      'training',
      'Demo Freetown Digital Studio',
      'A fictional training advert for entrepreneurs and small teams.',
      'Demo content: learn social media planning, basic analytics, and online customer service.',
      'facebook', 'https://training.example/demo-digital-skills', '#0ea5e9', 'light', 'banner', 1160, 84
    )
) as seed(
  slug, title, category, business_name, summary, content,
  social_platform, social_url, accent_color, theme, format, view_count, click_count
)
left join public.organizations o on o.name = seed.business_name
on conflict (slug) do update
set title = excluded.title,
    summary = excluded.summary,
    content = excluded.content,
    status = 'live',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now();

insert into public.directory_profiles (
  business_name, category, description, district, city, email,
  is_verified, diaspora_support, claimed_by_org_id
)
select seed.business_name, seed.category, seed.description, seed.district, seed.city,
       seed.email, seed.is_verified, seed.diaspora_support, o.id
from (
  values
    ('Demo Mano River Enterprise', 'Agriculture and trade', 'Fictional directory listing for product demonstrations.', 'Kambia', 'Kambia', 'hello@mano-river.example', true, true),
    ('Demo Freetown Digital Studio', 'Marketing and technology', 'Fictional creative-services listing for product demonstrations.', 'Western Area Urban', 'Freetown', 'hello@freetown-digital.example', true, false),
    ('Demo Bo Solar Services', 'Renewable energy', 'Fictional solar installer profile for product demonstrations.', 'Bo', 'Bo', 'hello@bo-solar.example', false, false),
    ('Demo Salone Logistics', 'Transport and logistics', 'Fictional logistics provider profile for product demonstrations.', 'Port Loko', 'Lungi', 'hello@salone-logistics.example', true, true)
) as seed(business_name, category, description, district, city, email, is_verified, diaspora_support)
left join public.organizations o on o.name = seed.business_name
where not exists (
  select 1 from public.directory_profiles existing where existing.business_name = seed.business_name
);

insert into public.influencer_profiles (
  display_name, location, district, categories, platforms,
  audience_size, engagement_rate, rate_range, is_verified
)
select seed.display_name, seed.location, seed.district, seed.categories, seed.platforms,
       seed.audience_size, seed.engagement_rate, seed.rate_range, seed.is_verified
from (
  values
    ('Demo Freetown Food Guide', 'Freetown, Sierra Leone', 'Western Area Urban', array['Food', 'Tourism'], array['Instagram', 'TikTok'], '25K demo followers', '5.8% demo rate', 'Demo pricing', true),
    ('Demo Salone Tech Voice', 'Bo, Sierra Leone', 'Bo', array['Technology', 'Education'], array['YouTube', 'Facebook'], '18K demo followers', '4.9% demo rate', 'Demo pricing', true),
    ('Demo Northern Farm Stories', 'Makeni, Sierra Leone', 'Bombali', array['Agriculture', 'Community'], array['Facebook', 'TikTok'], '12K demo followers', '6.2% demo rate', 'Demo pricing', false)
) as seed(display_name, location, district, categories, platforms, audience_size, engagement_rate, rate_range, is_verified)
where not exists (
  select 1 from public.influencer_profiles existing where existing.display_name = seed.display_name
);

commit;
