-- Starter editorial modules for the public Manohub discovery experience.
begin;

insert into public.landing_content_blocks (
  block_key, section, eyebrow, title, body, cta_label, cta_href,
  accent_color, surface_color, status, sort_order, published_at
) values
  (
    'editorial_local_business',
    'editorial',
    'Local marketplace',
    'Discover businesses built for everyday Sierra Leone',
    'Explore trusted products, services, events and organisations promoting what they offer through Manohub.',
    'Browse adverts',
    '/adverts',
    '#047857',
    '#D1FAE5',
    'published',
    110,
    now()
  ),
  (
    'editorial_opportunity_intelligence',
    'editorial',
    'Market intelligence',
    'See opportunities before the deadline gets close',
    'Search current tenders, compare requirements and keep your team focused on opportunities worth pursuing.',
    'Explore tenders',
    '/tenders',
    '#C2410C',
    '#FFEDD5',
    'published',
    120,
    now()
  ),
  (
    'editorial_two_way_reach',
    'editorial',
    'Two-way advertising',
    'Reach audiences on Manohub and across social media',
    'Run one coordinated campaign across Manohub placements and supported social channels, with delivery activity in one workspace.',
    'See advertising',
    '/adverts',
    '#1D4ED8',
    '#DBEAFE',
    'published',
    130,
    now()
  )
on conflict (block_key) do update set
  section = excluded.section,
  eyebrow = excluded.eyebrow,
  title = excluded.title,
  body = excluded.body,
  cta_label = excluded.cta_label,
  cta_href = excluded.cta_href,
  accent_color = excluded.accent_color,
  surface_color = excluded.surface_color,
  status = excluded.status,
  sort_order = excluded.sort_order,
  published_at = coalesce(public.landing_content_blocks.published_at, excluded.published_at);

commit;
