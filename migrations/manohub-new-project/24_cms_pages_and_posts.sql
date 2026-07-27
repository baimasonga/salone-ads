-- SEO-ready pages and posts with taxonomy, scheduling, revisions and recoverable deletion.
begin;

create table public.cms_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null default 'post' check (content_type in ('page', 'post')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 180),
  title text not null check (length(title) between 1 and 220),
  excerpt text not null default '' check (length(excerpt) <= 500),
  body text not null default '' check (length(body) <= 100000),
  category text not null default 'Market updates' check (length(category) <= 100),
  tags text[] not null default '{}',
  author_name text not null default 'Manohub Editorial' check (length(author_name) <= 120),
  featured_image_url text,
  featured_image_alt text not null default '' check (length(featured_image_alt) <= 240),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  is_featured boolean not null default false,
  seo_title text not null default '' check (length(seo_title) <= 70),
  seo_description text not null default '' check (length(seo_description) <= 180),
  social_image_url text,
  canonical_url text,
  published_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(tags) <= 20)
);

create table public.cms_content_revisions (
  id bigint generated always as identity primary key,
  content_id uuid not null references public.cms_content(id) on delete cascade,
  revision_number integer not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_id, revision_number)
);

create index cms_content_public_idx
  on public.cms_content (content_type, status, published_at desc)
  where deleted_at is null;
create index cms_content_category_idx
  on public.cms_content (category, published_at desc)
  where deleted_at is null;
create index cms_content_tags_idx on public.cms_content using gin (tags);
create index cms_content_trash_idx
  on public.cms_content (deleted_at desc)
  where deleted_at is not null;
create index cms_content_revisions_idx
  on public.cms_content_revisions (content_id, revision_number desc);

create or replace function private.capture_cms_content_revision()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare next_revision integer;
begin
  select coalesce(max(revision_number), 0) + 1
    into next_revision
    from public.cms_content_revisions
   where content_id = old.id;
  insert into public.cms_content_revisions (content_id, revision_number, snapshot, changed_by)
  values (old.id, next_revision, to_jsonb(old), auth.uid());
  return new;
end;
$$;

create trigger capture_cms_content_revision
  before update on public.cms_content
  for each row execute function private.capture_cms_content_revision();

alter table public.cms_content enable row level security;
alter table public.cms_content_revisions enable row level security;

create policy cms_content_public_read
  on public.cms_content for select
  to anon, authenticated
  using (
    deleted_at is null
    and status = 'published'
    and (published_at is null or published_at <= now())
  );
create policy cms_content_admin_manage
  on public.cms_content for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy cms_content_revisions_admin_read
  on public.cms_content_revisions for select
  to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.cms_content, public.cms_content_revisions from public, anon, authenticated;
grant select on public.cms_content to anon;
grant select, insert, update, delete on public.cms_content to authenticated;
grant select on public.cms_content_revisions to authenticated;
grant all on public.cms_content, public.cms_content_revisions to service_role;
grant usage, select on sequence public.cms_content_revisions_id_seq to service_role;
revoke all on function private.capture_cms_content_revision() from public, anon, authenticated;

commit;
