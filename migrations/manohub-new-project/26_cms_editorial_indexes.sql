-- Cover editorial-operation foreign keys used by collaboration and distribution queries.
begin;

create index cms_content_email_campaign_idx
  on public.cms_content (email_campaign_id)
  where email_campaign_id is not null;
create index cms_content_locked_by_idx
  on public.cms_content (locked_by)
  where locked_by is not null;
create index cms_content_reviewed_by_idx
  on public.cms_content (reviewed_by)
  where reviewed_by is not null;
create index cms_comments_author_idx
  on public.cms_editorial_comments (author_id, created_at desc);

commit;
