begin;

create table if not exists public.upload_security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 240),
  file_kind text not null check (file_kind in ('image','document','receipt','csv')),
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 10485760),
  verdict text not null check (verdict in ('clean','blocked','error')),
  threat_detail text,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.upload_security_events enable row level security;
revoke all on table public.upload_security_events from public, anon, authenticated;
revoke all on sequence public.upload_security_events_id_seq from public, anon, authenticated;
grant insert, select on table public.upload_security_events to service_role;
grant usage, select on sequence public.upload_security_events_id_seq to service_role;

create index if not exists upload_security_events_created_at_idx on public.upload_security_events (created_at desc);
create index if not exists upload_security_events_blocked_idx on public.upload_security_events (created_at desc) where verdict = 'blocked';

create or replace function public.admin_upload_security_events(p_limit integer default 50)
returns table (id bigint, file_name text, file_kind text, mime_type text, file_size bigint, verdict text, threat_detail text, request_id text, created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select role into caller_role from public.platform_staff_members where user_id = auth.uid() and status = 'active';
  if caller_role not in ('owner','administrator','auditor','support') then raise exception 'Security event access denied' using errcode = '42501'; end if;
  return query select e.id,e.file_name,e.file_kind,e.mime_type,e.file_size,e.verdict,e.threat_detail,e.request_id,e.created_at
    from public.upload_security_events e order by e.created_at desc limit least(greatest(coalesce(p_limit,50),1),200);
end;
$$;

revoke all on function public.admin_upload_security_events(integer) from public, anon;
grant execute on function public.admin_upload_security_events(integer) to authenticated;

update storage.buckets set file_size_limit = 10485760 where id in (
  'advert-creatives','landing-cms-media','media-assets','private-documents','public-assets','bid-submissions','subscription-payment-proofs'
);

commit;
