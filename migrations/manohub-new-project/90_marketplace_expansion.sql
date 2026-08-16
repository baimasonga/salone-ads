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
