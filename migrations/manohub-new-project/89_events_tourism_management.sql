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
