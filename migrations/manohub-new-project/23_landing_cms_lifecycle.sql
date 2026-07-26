-- Complete landing CMS lifecycle: scheduling, media, recoverable deletion and preview-safe reads.
begin;

alter table public.landing_content_blocks
  add column media_url text,
  add column media_alt text not null default '' check (length(media_alt) <= 240),
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;

create index landing_content_publication_idx
  on public.landing_content_blocks (status, published_at, sort_order)
  where deleted_at is null;
create index landing_content_trash_idx
  on public.landing_content_blocks (deleted_at desc)
  where deleted_at is not null;

drop policy if exists landing_blocks_public_read on public.landing_content_blocks;
create policy landing_blocks_public_read
  on public.landing_content_blocks for select
  to anon, authenticated
  using (
    deleted_at is null
    and status = 'published'
    and (published_at is null or published_at <= now())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-cms-media',
  'landing-cms-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists landing_cms_media_admin_insert on storage.objects;
drop policy if exists landing_cms_media_admin_update on storage.objects;
drop policy if exists landing_cms_media_admin_delete on storage.objects;

create policy landing_cms_media_admin_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_platform_admin())
  );
create policy landing_cms_media_admin_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_platform_admin())
  )
  with check (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_platform_admin())
  );
create policy landing_cms_media_admin_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'landing-cms-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_platform_admin())
  );

revoke all on public.landing_content_blocks from public, anon, authenticated;
grant select on public.landing_content_blocks to anon;
grant select, insert, update, delete on public.landing_content_blocks to authenticated;
grant all on public.landing_content_blocks to service_role;

revoke all on public.landing_content_revisions from public, anon, authenticated;
grant select on public.landing_content_revisions to authenticated;
grant all on public.landing_content_revisions to service_role;

commit;
