create table if not exists public.bid_submissions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  response_id uuid not null references public.opportunity_responses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'withdrawn')),
  version integer not null default 1 check (version > 0),
  cover_note text,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (response_id, version)
);

create table if not exists public.bid_submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.bid_submissions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  mime_type text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists bid_submissions_opportunity_idx on public.bid_submissions(opportunity_id, status);
create index if not exists bid_submissions_org_idx on public.bid_submissions(org_id, updated_at desc);
create index if not exists bid_submission_documents_submission_idx on public.bid_submission_documents(submission_id);

create or replace function public.guard_bid_submission_transition()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if new.opportunity_id <> old.opportunity_id or new.response_id <> old.response_id
     or new.org_id <> old.org_id or new.submitted_by <> old.submitted_by
     or new.version <> old.version or new.created_at <> old.created_at then
    raise exception 'Bid submission identity and version are immutable';
  end if;
  if old.status = 'draft' and new.status = 'submitted' then
    if not exists (
      select 1 from public.opportunities o join public.opportunity_statuses s on s.id = o.status_id
      where o.id = old.opportunity_id and s.code in ('published', 'amended', 'deadline_extended')
        and (o.submission_deadline is null or o.submission_deadline >= now())
    ) then
      raise exception 'The tender is not accepting bid submissions';
    end if;
    if not exists (select 1 from public.bid_submission_documents d where d.submission_id = old.id) then
      raise exception 'Upload at least one document before submitting a bid';
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  elsif old.status = 'submitted' and new.status = 'withdrawn' then
    if exists (select 1 from public.opportunities o where o.id = old.opportunity_id and o.submission_deadline < now()) then
      raise exception 'The submission deadline has passed';
    end if;
    new.withdrawn_at := coalesce(new.withdrawn_at, now());
  elsif new.status <> old.status then
    raise exception 'Invalid bid submission status transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_bid_submission_transition() from public, anon, authenticated;
drop trigger if exists guard_bid_submission_transition on public.bid_submissions;
create trigger guard_bid_submission_transition before update on public.bid_submissions
for each row execute function public.guard_bid_submission_transition();

alter table public.bid_submissions enable row level security;
alter table public.bid_submission_documents enable row level security;

create policy bid_submissions_supplier_select on public.bid_submissions for select to authenticated
using (public.is_org_member(org_id));
create policy bid_submissions_buyer_select on public.bid_submissions for select to authenticated
using (exists (select 1 from public.opportunities o where o.id = opportunity_id and public.is_org_member(o.buyer_org_id)));
create policy bid_submissions_admin_select on public.bid_submissions for select to authenticated
using (public.is_platform_admin());
create policy bid_submissions_supplier_insert on public.bid_submissions for insert to authenticated
with check (
  public.is_org_member(org_id)
  and submitted_by = (select auth.uid())
  and exists (
    select 1 from public.opportunity_responses r
    join public.opportunities o on o.id = r.opportunity_id
    join public.opportunity_statuses s on s.id = o.status_id
    where r.id = response_id and r.opportunity_id = opportunity_id and r.org_id = org_id
      and r.status = 'active' and r.kind = 'intent_to_bid'
      and s.code in ('published', 'amended', 'deadline_extended')
      and (o.submission_deadline is null or o.submission_deadline >= now())
  )
);
create policy bid_submissions_supplier_update on public.bid_submissions for update to authenticated
using (public.is_org_member(org_id) and status in ('draft', 'submitted'))
with check (public.is_org_member(org_id) and submitted_by = (select auth.uid()));

create policy bid_documents_visible_with_submission on public.bid_submission_documents for select to authenticated
using (exists (select 1 from public.bid_submissions b where b.id = submission_id));
create policy bid_documents_supplier_insert on public.bid_submission_documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (select 1 from public.bid_submissions b where b.id = submission_id and b.status = 'draft' and public.is_org_member(b.org_id))
);
create policy bid_documents_supplier_delete on public.bid_submission_documents for delete to authenticated
using (exists (select 1 from public.bid_submissions b where b.id = submission_id and b.status = 'draft' and public.is_org_member(b.org_id)));

insert into storage.buckets (id, name, public, file_size_limit)
values ('bid-submissions', 'bid-submissions', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy bid_storage_supplier_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'bid-submissions'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.bid_submissions b
    where b.id = ((storage.foldername(name))[4])::uuid
      and b.org_id = ((storage.foldername(name))[1])::uuid
      and b.opportunity_id = ((storage.foldername(name))[3])::uuid
      and b.status = 'draft'
  )
);
create policy bid_storage_authorized_read on storage.objects for select to authenticated
using (
  bucket_id = 'bid-submissions'
  and exists (
    select 1 from public.bid_submission_documents d
    join public.bid_submissions b on b.id = d.submission_id
    join public.opportunities o on o.id = b.opportunity_id
    where d.storage_path = name
      and (public.is_org_member(b.org_id) or public.is_org_member(o.buyer_org_id) or public.is_platform_admin())
  )
);
create policy bid_storage_supplier_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'bid-submissions'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and exists (
    select 1 from public.bid_submissions b
    where b.id = ((storage.foldername(name))[4])::uuid
      and b.org_id = ((storage.foldername(name))[1])::uuid
      and b.opportunity_id = ((storage.foldername(name))[3])::uuid
      and b.status = 'draft'
  )
);

grant select, insert, update on public.bid_submissions to authenticated;
grant select, insert, delete on public.bid_submission_documents to authenticated;
