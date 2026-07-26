-- Consent-aware public audience subscriptions and token-based unsubscribe.
begin;

create table if not exists public.public_audience_subscribers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  email text,
  phone text,
  interests text[] not null default '{}',
  locations text[] not null default '{}',
  preferred_channels text[] not null default '{email}',
  frequency text not null default 'weekly' check (frequency in ('urgent', 'daily', 'weekly')),
  status text not null default 'active' check (status in ('active', 'suppressed', 'unsubscribed')),
  consent_given boolean not null,
  consent_source text not null default 'manohub_homepage',
  consent_at timestamptz not null default now(),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null),
  check (length(full_name) <= 120),
  check (email is null or length(email) <= 254),
  check (phone is null or length(phone) <= 40),
  check (cardinality(interests) between 1 and 12),
  check (cardinality(locations) <= 20),
  check (cardinality(preferred_channels) between 1 and 2),
  check (preferred_channels <@ array['email','whatsapp']::text[])
);

create unique index if not exists public_audience_email_unique
  on public.public_audience_subscribers (lower(email))
  where email is not null and status <> 'unsubscribed';
create unique index if not exists public_audience_phone_unique
  on public.public_audience_subscribers (phone)
  where phone is not null and status <> 'unsubscribed';
create index if not exists public_audience_status_created_idx
  on public.public_audience_subscribers (status, created_at desc);
create index if not exists public_audience_interests_idx
  on public.public_audience_subscribers using gin (interests);
create index if not exists public_audience_locations_idx
  on public.public_audience_subscribers using gin (locations);

alter table public.public_audience_subscribers enable row level security;

create policy public_audience_signup
  on public.public_audience_subscribers for insert
  to anon, authenticated
  with check (
    consent_given
    and status = 'active'
    and consent_source = 'manohub_homepage'
    and cardinality(interests) between 1 and 12
  );
create policy public_audience_admin_manage
  on public.public_audience_subscribers for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create or replace function private.unsubscribe_public_audience(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare affected integer;
declare already_unsubscribed boolean;
begin
  update public.public_audience_subscribers
     set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
   where unsubscribe_token = p_token
     and status <> 'unsubscribed';
  get diagnostics affected = row_count;
  if affected = 1 then
    return true;
  end if;
  select exists (
    select 1
      from public.public_audience_subscribers
     where unsubscribe_token = p_token
       and status = 'unsubscribed'
  ) into already_unsubscribed;
  return already_unsubscribed;
end;
$$;

revoke all on function private.unsubscribe_public_audience(uuid) from public;
grant execute on function private.unsubscribe_public_audience(uuid) to anon, authenticated;
grant usage on schema private to anon, authenticated;

create or replace function public.unsubscribe_public_audience(p_token uuid)
returns boolean
language sql
security invoker
set search_path = 'pg_catalog', 'public', 'private'
as $$
  select private.unsubscribe_public_audience(p_token);
$$;

revoke all on function public.unsubscribe_public_audience(uuid) from public;
grant execute on function public.unsubscribe_public_audience(uuid) to anon, authenticated;

grant insert on public.public_audience_subscribers to anon, authenticated;
grant select, update, delete on public.public_audience_subscribers to authenticated;
grant all on public.public_audience_subscribers to service_role;

commit;
