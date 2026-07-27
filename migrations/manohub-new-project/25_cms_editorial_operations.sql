-- Editorial review, collaboration, native monetisation and content analytics.
begin;

alter table public.cms_content
  add column review_note text not null default '' check (length(review_note) <= 2000),
  add column review_requested_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column locked_by uuid references auth.users(id) on delete set null,
  add column locked_until timestamptz,
  add column native_advert_id uuid references public.adverts(id) on delete set null,
  add column email_campaign_id uuid references public.audience_email_campaigns(id) on delete set null;

create table public.cms_editorial_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.cms_content(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  author_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.cms_content_events (
  id bigint generated always as identity primary key,
  content_id uuid not null references public.cms_content(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'cta_click', 'ad_impression', 'ad_click', 'subscription')),
  session_id text not null check (length(session_id) between 16 and 120),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (content_id, event_type, session_id)
);

create index cms_comments_content_idx on public.cms_editorial_comments (content_id, created_at desc);
create index cms_events_content_idx on public.cms_content_events (content_id, event_type, created_at desc);
create index cms_content_calendar_idx on public.cms_content (published_at) where deleted_at is null;
create index cms_content_native_advert_idx on public.cms_content (native_advert_id) where native_advert_id is not null;

alter table public.cms_editorial_comments enable row level security;
alter table public.cms_content_events enable row level security;

create policy cms_comments_admin_manage on public.cms_editorial_comments for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()) and author_id = (select auth.uid()));
create policy cms_events_public_insert on public.cms_content_events for insert to anon, authenticated
  with check (exists (
    select 1 from public.cms_content content
    where content.id = content_id
      and content.deleted_at is null
      and content.status = 'published'
      and (content.published_at is null or content.published_at <= now())
  ));
create policy cms_events_admin_read on public.cms_content_events for select to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.cms_editorial_comments, public.cms_content_events from public, anon, authenticated;
grant select, insert, update, delete on public.cms_editorial_comments to authenticated;
grant insert on public.cms_content_events to anon, authenticated;
grant select on public.cms_content_events to authenticated;
grant all on public.cms_editorial_comments, public.cms_content_events to service_role;
grant usage, select on sequence public.cms_content_events_id_seq to anon, authenticated, service_role;

commit;
