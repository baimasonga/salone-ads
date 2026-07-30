-- Opportunity inventory engine: source registry, researcher queue and safe
-- promotion into the existing administrator tender-review workflow.
-- Apply after 53_advert_order_ledger_integration.sql.

begin;

create or replace function public.is_opportunity_researcher()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and platform_role in ('researcher', 'admin')
  );
$$;
revoke all on function public.is_opportunity_researcher() from public, anon;
grant execute on function public.is_opportunity_researcher() to authenticated;

create table if not exists public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text,
  source_kind text not null default 'website'
    check (source_kind in ('website', 'document', 'email', 'manual')),
  country_id uuid references public.countries(id) on delete set null,
  trust_level text not null default 'unverified'
    check (trust_level in ('verified', 'trusted', 'unverified')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'retired')),
  check_frequency_hours integer not null default 24
    check (check_frequency_hours between 1 and 720),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists opportunity_sources_name_unique_idx
  on public.opportunity_sources (lower(name));
create index if not exists opportunity_sources_status_next_check_idx
  on public.opportunity_sources (status, next_check_at)
  where status = 'active';

create table if not exists public.opportunity_ingestion_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.opportunity_sources(id) on delete set null,
  source_url text,
  external_reference text,
  title text not null default '',
  buyer_name text not null default '',
  summary text,
  description text,
  publication_date date,
  submission_deadline timestamptz,
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  currency_code text references public.currencies(code),
  sector_id uuid references public.sectors(id),
  country_id uuid references public.countries(id),
  district_id uuid references public.districts(id),
  opportunity_type_id uuid references public.opportunity_types(id),
  contact_details text,
  raw_text text,
  status text not null default 'draft'
    check (status in ('draft', 'ready_for_review', 'promoted', 'rejected')),
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  quality_issues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(quality_issues) = 'array'),
  duplicate_opportunity_id uuid references public.opportunities(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  opportunity_id uuid unique references public.opportunities(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunity_ingestion_status_created_idx
  on public.opportunity_ingestion_items (status, created_at desc);
create index if not exists opportunity_ingestion_assigned_status_idx
  on public.opportunity_ingestion_items (assigned_to, status, updated_at desc)
  where assigned_to is not null;
create index if not exists opportunity_ingestion_source_idx
  on public.opportunity_ingestion_items (source_id, created_at desc)
  where source_id is not null;

create or replace function public.refresh_opportunity_ingestion_quality()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  issues jsonb := '[]'::jsonb;
  score integer := 100;
  normalized_title text;
begin
  new.title := btrim(coalesce(new.title, ''));
  new.buyer_name := btrim(coalesce(new.buyer_name, ''));
  new.source_url := nullif(btrim(coalesce(new.source_url, '')), '');
  new.updated_at := now();

  if new.title = '' then
    issues := issues || '"Title is required"'::jsonb;
    score := score - 30;
  end if;
  if new.buyer_name = '' then
    issues := issues || '"Buyer name is required"'::jsonb;
    score := score - 20;
  end if;
  if new.submission_deadline is null then
    issues := issues || '"Submission deadline is required"'::jsonb;
    score := score - 25;
  elsif new.submission_deadline <= now() then
    issues := issues || '"Submission deadline has passed"'::jsonb;
    score := score - 25;
  end if;
  if new.source_url is null and new.source_id is null then
    issues := issues || '"A source record or source URL is required"'::jsonb;
    score := score - 15;
  end if;
  if nullif(btrim(coalesce(new.summary, '')), '') is null
     and nullif(btrim(coalesce(new.description, '')), '') is null then
    issues := issues || '"Add a summary or description"'::jsonb;
    score := score - 10;
  end if;

  normalized_title := lower(regexp_replace(new.title, '[^a-z0-9]+', '', 'g'));
  if normalized_title <> '' then
    select o.id
      into new.duplicate_opportunity_id
    from public.opportunities o
    where lower(regexp_replace(o.title, '[^a-z0-9]+', '', 'g')) = normalized_title
    order by o.created_at desc
    limit 1;
  else
    new.duplicate_opportunity_id := null;
  end if;

  if new.duplicate_opportunity_id is not null then
    issues := issues || '"An opportunity with the same normalized title already exists"'::jsonb;
  end if;

  new.quality_score := greatest(0, score);
  new.quality_issues := issues;

  if new.status = 'ready_for_review'
     and (new.quality_score < 75 or new.duplicate_opportunity_id is not null) then
    raise exception 'Resolve quality and duplicate checks before submitting for review';
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_ingestion_quality_refresh on public.opportunity_ingestion_items;
create trigger opportunity_ingestion_quality_refresh
before insert or update on public.opportunity_ingestion_items
for each row execute function public.refresh_opportunity_ingestion_quality();

create or replace function public.protect_opportunity_ingestion_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not (select public.is_opportunity_researcher()) then
    raise exception 'Researcher access required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.opportunity_id := null;
    if new.status not in ('draft', 'ready_for_review') then new.status := 'draft'; end if;
    return new;
  end if;

  if not (select public.is_platform_admin()) then
    new.created_by := old.created_by;
    if old.status in ('promoted', 'rejected') then
      raise exception 'Completed ingestion records are immutable';
    end if;
    if new.status = 'promoted'
       and old.status = 'ready_for_review'
       and new.opportunity_id is not null
       and exists (
         select 1 from public.opportunities
         where id = new.opportunity_id and created_by = (select auth.uid())
       ) then
      return new;
    end if;
    new.opportunity_id := old.opportunity_id;
    if new.status not in ('draft', 'ready_for_review') then new.status := old.status; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_ingestion_field_protection on public.opportunity_ingestion_items;
create trigger opportunity_ingestion_field_protection
before insert or update on public.opportunity_ingestion_items
for each row execute function public.protect_opportunity_ingestion_fields();

alter table public.opportunity_sources enable row level security;
alter table public.opportunity_ingestion_items enable row level security;

revoke all on public.opportunity_sources, public.opportunity_ingestion_items from anon;
grant select, insert, update on public.opportunity_sources, public.opportunity_ingestion_items to authenticated;
grant delete on public.opportunity_sources, public.opportunity_ingestion_items to authenticated;

create policy opportunity_sources_staff_read
on public.opportunity_sources for select to authenticated
using ((select public.is_opportunity_researcher()));
create policy opportunity_sources_staff_insert
on public.opportunity_sources for insert to authenticated
with check ((select public.is_opportunity_researcher()) and created_by = (select auth.uid()));
create policy opportunity_sources_staff_update
on public.opportunity_sources for update to authenticated
using ((select public.is_opportunity_researcher()))
with check ((select public.is_opportunity_researcher()));
create policy opportunity_sources_admin_delete
on public.opportunity_sources for delete to authenticated
using ((select public.is_platform_admin()));

create policy opportunity_ingestion_staff_read
on public.opportunity_ingestion_items for select to authenticated
using ((select public.is_opportunity_researcher()));
create policy opportunity_ingestion_staff_insert
on public.opportunity_ingestion_items for insert to authenticated
with check ((select public.is_opportunity_researcher()) and created_by = (select auth.uid()));
create policy opportunity_ingestion_staff_update
on public.opportunity_ingestion_items for update to authenticated
using ((select public.is_opportunity_researcher()))
with check ((select public.is_opportunity_researcher()));
create policy opportunity_ingestion_admin_delete
on public.opportunity_ingestion_items for delete to authenticated
using ((select public.is_platform_admin()));

create or replace function public.promote_opportunity_ingestion_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item public.opportunity_ingestion_items%rowtype;
  source public.opportunity_sources%rowtype;
  awaiting_review_id uuid;
  new_opportunity_id uuid;
  source_type_value text;
begin
  if (select auth.uid()) is null or not (select public.is_opportunity_researcher()) then
    raise exception 'Researcher access required';
  end if;

  select * into item
  from public.opportunity_ingestion_items
  where id = p_item_id
  for update;
  if not found then raise exception 'Ingestion record not found'; end if;
  if item.status <> 'ready_for_review' then
    raise exception 'Record must be ready for review';
  end if;
  if item.quality_score < 75 or item.duplicate_opportunity_id is not null then
    raise exception 'Record has unresolved quality or duplicate issues';
  end if;

  if item.source_id is not null then
    select * into source from public.opportunity_sources where id = item.source_id;
  end if;
  source_type_value := case source.source_kind
    when 'website' then 'website_ingestion'
    when 'document' then 'document_extraction'
    else 'admin_entry'
  end;
  select id into awaiting_review_id
  from public.opportunity_statuses where code = 'awaiting_review';

  insert into public.opportunities (
    slug, title, summary, description, opportunity_type_id, sector_id,
    country_id, district_id, buyer_name, publication_date,
    submission_deadline, estimated_value, currency_code, contact_details,
    source_name, source_url, source_type, status_id, data_confidence, created_by
  )
  values (
    regexp_replace(lower(item.title), '[^a-z0-9]+', '-', 'g')
      || '-' || substr(item.id::text, 1, 8),
    item.title, item.summary, item.description, item.opportunity_type_id,
    item.sector_id, item.country_id, item.district_id, item.buyer_name,
    item.publication_date, item.submission_deadline, item.estimated_value,
    item.currency_code, item.contact_details, source.name, item.source_url,
    source_type_value, awaiting_review_id,
    case source.trust_level when 'verified' then 'high' when 'trusted' then 'medium' else 'low' end,
    (select auth.uid())
  )
  returning id into new_opportunity_id;

  update public.opportunity_ingestion_items
  set status = 'promoted', opportunity_id = new_opportunity_id, updated_at = now()
  where id = p_item_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    (select auth.uid()),
    'opportunity_ingestion.promoted',
    'opportunity_ingestion_item',
    p_item_id::text,
    jsonb_build_object('opportunity_id', new_opportunity_id, 'quality_score', item.quality_score)
  );
  return new_opportunity_id;
end;
$$;
revoke all on function public.promote_opportunity_ingestion_item(uuid) from public, anon;
grant execute on function public.promote_opportunity_ingestion_item(uuid) to authenticated;

commit;
