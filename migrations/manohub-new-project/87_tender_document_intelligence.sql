-- Subscriber-specific, evidence-backed tender document intelligence.
-- Analyses are advisory and isolated per user; source documents retain their existing access rules.

begin;

create table if not exists public.tender_document_analyses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  document_id uuid not null references public.opportunity_documents(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count is null or page_count between 1 and 10000),
  source_truncated boolean not null default false,
  model text not null check (char_length(model) between 1 and 100),
  analysis jsonb not null check (
    jsonb_typeof(analysis) = 'object'
    and jsonb_typeof(analysis->'keyDeadlines') = 'array'
    and jsonb_typeof(analysis->'eligibilityCriteria') = 'array'
    and jsonb_typeof(analysis->'submissionChecklist') = 'array'
    and jsonb_typeof(analysis->'financialRequirements') = 'array'
    and jsonb_typeof(analysis->'risks') = 'array'
    and jsonb_typeof(analysis->'contacts') = 'array'
    and jsonb_typeof(analysis->'limitations') = 'array'
  ),
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, document_id)
);

create index if not exists tender_document_analyses_opportunity_user_idx
  on public.tender_document_analyses(opportunity_id, user_id, analyzed_at desc);

alter table public.tender_document_analyses enable row level security;
revoke all on public.tender_document_analyses from public, anon;
grant select, insert, update, delete on public.tender_document_analyses to authenticated;
grant all on public.tender_document_analyses to service_role;

create or replace function public.can_access_tender_document_intelligence(
  p_opportunity_id uuid,
  p_document_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.opportunity_documents document
      join public.opportunities opportunity on opportunity.id = document.opportunity_id
      where document.id = p_document_id
        and opportunity.id = p_opportunity_id
        and (
          public.is_platform_admin()
          or (
            opportunity.buyer_org_id is not null
            and public.is_org_member(opportunity.buyer_org_id)
          )
          or (
            document.is_public
            and public.is_opportunity_publicly_visible(opportunity.id)
            and (
              public.user_has_tender_feature('tender_alerts_and_details')
              or public.user_has_tender_feature('tender_publishing')
            )
          )
        )
    );
$$;

revoke all on function public.can_access_tender_document_intelligence(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_access_tender_document_intelligence(uuid, uuid, uuid) to authenticated, service_role;

create policy tender_document_analyses_owner_select
on public.tender_document_analyses
for select to authenticated
using (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create policy tender_document_analyses_owner_insert
on public.tender_document_analyses
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create policy tender_document_analyses_owner_update
on public.tender_document_analyses
for update to authenticated
using (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
)
with check (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create policy tender_document_analyses_owner_delete
on public.tender_document_analyses
for delete to authenticated
using (
  user_id = (select auth.uid())
  and public.can_access_tender_document_intelligence(opportunity_id, document_id, user_id)
);

create or replace function public.protect_tender_document_analysis_identity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.document_id is distinct from old.document_id then
    raise exception 'Tender document analysis identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_tender_document_analysis_identity_trigger
  on public.tender_document_analyses;
create trigger protect_tender_document_analysis_identity_trigger
before update on public.tender_document_analyses
for each row execute function public.protect_tender_document_analysis_identity();

commit;
