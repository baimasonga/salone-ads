-- Human-supervised source monitoring and deterministic extraction provenance.
-- No source is fetched and no opportunity is published automatically.

begin;

alter table public.opportunity_sources
  add column if not exists last_check_status text
    check (last_check_status is null or last_check_status in ('success', 'no_change', 'blocked', 'error')),
  add column if not exists consecutive_failures integer not null default 0
    check (consecutive_failures >= 0);

alter table public.opportunity_ingestion_items
  add column if not exists extraction_method text not null default 'manual'
    check (extraction_method in ('manual', 'assisted_text')),
  add column if not exists extraction_confidence integer
    check (extraction_confidence is null or extraction_confidence between 0 and 100),
  add column if not exists extracted_fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extracted_fields) = 'object');

create table if not exists public.opportunity_source_checks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.opportunity_sources(id) on delete cascade,
  status text not null check (status in ('success', 'no_change', 'blocked', 'error')),
  items_found integer not null default 0 check (items_found >= 0),
  notes text,
  checked_by uuid not null default auth.uid() references public.profiles(id),
  checked_at timestamptz not null default now()
);

create index if not exists opportunity_source_checks_source_time_idx
  on public.opportunity_source_checks(source_id, checked_at desc);
create index if not exists opportunity_source_checks_checked_by_idx
  on public.opportunity_source_checks(checked_by);

create or replace function public.refresh_opportunity_source_monitoring()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not (select public.is_opportunity_researcher()) then
    raise exception 'Researcher access required';
  end if;

  new.checked_by := (select auth.uid());
  update public.opportunity_sources
  set last_checked_at = new.checked_at,
      last_check_status = new.status,
      consecutive_failures = case
        when new.status in ('blocked', 'error') then consecutive_failures + 1
        else 0
      end,
      next_check_at = new.checked_at + make_interval(hours => check_frequency_hours),
      updated_at = now()
  where id = new.source_id;
  return new;
end;
$$;

drop trigger if exists opportunity_source_check_refresh on public.opportunity_source_checks;
create trigger opportunity_source_check_refresh
before insert on public.opportunity_source_checks
for each row execute function public.refresh_opportunity_source_monitoring();

alter table public.opportunity_source_checks enable row level security;
revoke all on public.opportunity_source_checks from anon;
grant select, insert on public.opportunity_source_checks to authenticated;

create policy opportunity_source_checks_staff_read
on public.opportunity_source_checks for select to authenticated
using ((select public.is_opportunity_researcher()));

create policy opportunity_source_checks_staff_insert
on public.opportunity_source_checks for insert to authenticated
with check (
  (select public.is_opportunity_researcher())
  and checked_by = (select auth.uid())
);

commit;
