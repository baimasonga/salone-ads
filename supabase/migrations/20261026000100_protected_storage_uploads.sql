begin;

-- Only the application server can authorize unpredictable destination names.
-- Existing permissive storage policies still enforce the caller's privileges.
create table public.protected_upload_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  unique (bucket_id, object_path)
);
alter table public.protected_upload_authorizations enable row level security;
revoke all on public.protected_upload_authorizations from public, anon, authenticated;
grant all on public.protected_upload_authorizations to service_role;

create or replace function public.has_protected_upload_authorization(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.protected_upload_authorizations
    where user_id = (select auth.uid()) and bucket_id = p_bucket
      and object_path = p_path and expires_at > now()
  );
$$;
revoke all on function public.has_protected_upload_authorization(text,text) from public;
grant execute on function public.has_protected_upload_authorization(text,text) to anon, authenticated;

create policy protected_storage_insert on storage.objects as restrictive for insert to public
with check (
  bucket_id not in ('advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs')
  or public.has_protected_upload_authorization(bucket_id, name)
);
-- Prevent an ordinary overwrite from replacing previously scanned bytes.
create policy protected_storage_update on storage.objects as restrictive for update to public
using (bucket_id not in ('advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs'))
with check (bucket_id not in ('advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs'));

commit;
