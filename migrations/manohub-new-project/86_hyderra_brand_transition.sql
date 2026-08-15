-- Hyderra customer-facing brand transition. Technical identifiers remain stable.
begin;

-- This is a platform-owned data rewrite, not an editorial action. Suppress row
-- workflow triggers only for this transaction; normal trigger behavior resumes
-- automatically at commit.
set local session_replication_role = replica;

update public.landing_content_blocks
set eyebrow = replace(replace(replace(eyebrow, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    title = replace(replace(replace(title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    body = replace(replace(replace(body, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    cta_label = replace(replace(replace(cta_label, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra')
where concat_ws(' ', eyebrow, title, body, cta_label) ~ 'MANOHUB|ManoHub|Manohub';

update public.advert_packages
set description = replace(replace(replace(description, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    updated_at = now()
where description ~ 'MANOHUB|ManoHub|Manohub';

update public.cms_content
set title = replace(replace(replace(title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    excerpt = replace(replace(replace(excerpt, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    body = replace(replace(replace(body, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    author_name = replace(replace(replace(author_name, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    seo_title = replace(replace(replace(seo_title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    seo_description = replace(replace(replace(seo_description, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    updated_at = now()
where concat_ws(' ', title, excerpt, body, author_name, seo_title, seo_description) ~ 'MANOHUB|ManoHub|Manohub';

alter table public.cms_content alter column author_name set default 'Hyderra Editorial';

update public.notifications
set title = replace(replace(replace(title, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra'),
    body = replace(replace(replace(body, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra')
where concat_ws(' ', title, body) ~ 'MANOHUB|ManoHub|Manohub';

do $brand$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ 'MANOHUB|ManoHub|Manohub'
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(replace(replace(definition, 'MANOHUB', 'HYDERRA'), 'ManoHub', 'Hyderra'), 'Manohub', 'Hyderra');
    execute definition;
  end loop;
end;
$brand$;

commit;
