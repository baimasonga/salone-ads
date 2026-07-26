-- Landing CMS revision history and managed advertising inventory.
begin;
create table if not exists public.landing_content_revisions (
  id bigint generated always as identity primary key,
  block_id uuid not null references public.landing_content_blocks(id) on delete cascade,
  revision_number integer not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(block_id,revision_number)
);
create table if not exists public.landing_ad_placements (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  description text not null default '', is_active boolean not null default true, sort_order integer not null default 0
);
create table if not exists public.landing_ad_assignments (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.landing_ad_placements(id) on delete cascade,
  advert_id uuid not null references public.adverts(id) on delete cascade,
  priority integer not null default 0, weight integer not null default 1 check(weight between 1 and 100),
  session_frequency_cap integer not null default 3 check(session_frequency_cap between 1 and 20),
  starts_at timestamptz, ends_at timestamptz, is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(placement_id,advert_id)
);
create index if not exists landing_assignments_delivery_idx on public.landing_ad_assignments(placement_id,is_active,priority desc);

create or replace function private.capture_landing_content_revision() returns trigger language plpgsql security definer
set search_path='pg_catalog','public' as $$
declare next_revision integer;
begin
 select coalesce(max(revision_number),0)+1 into next_revision from public.landing_content_revisions where block_id=old.id;
 insert into public.landing_content_revisions(block_id,revision_number,snapshot,changed_by)
 values(old.id,next_revision,to_jsonb(old),auth.uid());
 return new;
end $$;
revoke all on function private.capture_landing_content_revision() from public,anon,authenticated;
drop trigger if exists capture_landing_content_revision on public.landing_content_blocks;
create trigger capture_landing_content_revision before update on public.landing_content_blocks
for each row execute function private.capture_landing_content_revision();

alter table public.landing_content_revisions enable row level security;
alter table public.landing_ad_placements enable row level security;
alter table public.landing_ad_assignments enable row level security;
create policy landing_revisions_admin on public.landing_content_revisions for select to authenticated using((select public.is_platform_admin()));
create policy landing_placements_public on public.landing_ad_placements for select to anon,authenticated using(is_active);
create policy landing_placements_admin on public.landing_ad_placements for all to authenticated using((select public.is_platform_admin())) with check((select public.is_platform_admin()));
create policy landing_assignments_public on public.landing_ad_assignments for select to anon,authenticated using(
 is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now())
);
create policy landing_assignments_admin on public.landing_ad_assignments for all to authenticated using((select public.is_platform_admin())) with check((select public.is_platform_admin()));
grant select on public.landing_ad_placements,public.landing_ad_assignments to anon,authenticated;
grant select on public.landing_content_revisions to authenticated;
grant insert,update,delete on public.landing_ad_placements,public.landing_ad_assignments to authenticated;
grant all on public.landing_content_revisions,public.landing_ad_placements,public.landing_ad_assignments to service_role;
insert into public.landing_ad_placements(code,name,description,sort_order) values
('homepage_spotlight','Homepage Spotlight','Primary high-impact advert below the hero.',10),
('marketplace_strip','Marketplace Strip','Rotating adverts in the public marketplace section.',20),
('tender_feed','Tender Feed Native','Contextual advert between public opportunities.',30)
on conflict(code) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order;
commit;
