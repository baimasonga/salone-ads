-- Public landing CMS: small, cache-friendly published payload with admin editing.
begin;
create table if not exists public.landing_content_blocks (
  id uuid primary key default gen_random_uuid(),
  block_key text not null unique,
  section text not null,
  eyebrow text,
  title text not null,
  body text not null default '',
  cta_label text,
  cta_href text,
  accent_color text not null default '#10B981' check(accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  surface_color text not null default '#FFFFFF' check(surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  sort_order integer not null default 0,
  published_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.landing_content_blocks enable row level security;
create policy landing_blocks_public_read on public.landing_content_blocks for select to anon,authenticated
  using(status='published' and (published_at is null or published_at<=now()));
create policy landing_blocks_admin_manage on public.landing_content_blocks for all to authenticated
  using((select public.is_platform_admin())) with check((select public.is_platform_admin()));
grant select on public.landing_content_blocks to anon,authenticated;
grant insert,update,delete on public.landing_content_blocks to authenticated;
grant all on public.landing_content_blocks to service_role;
insert into public.landing_content_blocks(block_key,section,eyebrow,title,body,cta_label,cta_href,accent_color,surface_color,status,sort_order,published_at) values
('hero','hero','LIVE PROCUREMENT & ADVERTISING','Every public tender and trusted business advert in one place.','Discover opportunities, promote businesses and reach audiences across the Mano River region.','Explore Manohub','/tenders','#10B981','#0F172A','published',10,now()),
('advert_marketplace','advertise','MANOHUB MARKETPLACE','Discover businesses worth knowing.','Campaigns published on Manohub also travel across social media, giving advertisers one campaign with two connected channels.','Advertise your business','?auth=signup','#FF6B35','#FFF7ED','published',20,now())
on conflict(block_key) do nothing;
commit;
