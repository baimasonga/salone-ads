-- Manohub post-baseline security and performance hardening.
-- Apply after full_setup.sql. Safe to run more than once.

begin;

-- Keep extension objects out of the exposed public schema.
alter extension pg_trgm set schema extensions;

-- Public buckets serve known object URLs without a broad SELECT policy.
drop policy if exists "Public read for public-assets" on storage.objects;
drop policy if exists advert_creatives_read on storage.objects;

-- Enforce upload limits at Storage, not only in the browser.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'advert-creatives';

update storage.buckets
set file_size_limit = 10485760
where id in ('media-assets', 'private-documents', 'public-assets');

-- Advert uploads must be placed under the signed-in user's own folder.
drop policy if exists advert_creatives_insert on storage.objects;
create policy advert_creatives_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'advert-creatives'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Prevent callers from writing audit events against unrelated organisations.
create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_org_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_org_id is not null
     and not public.is_org_member(p_org_id)
     and not public.is_platform_admin() then
    raise exception 'Organization access required';
  end if;
  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_org_id, p_action, p_entity_type, p_entity_id, p_metadata);
end;
$function$;

-- Entitlement details may only be queried for the caller's organisation.
create or replace function public.get_org_feature_limit(
  p_org_id uuid,
  p_feature_key text
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  result integer;
begin
  if not public.is_org_member(p_org_id) and not public.is_platform_admin() then
    raise exception 'Organization access required';
  end if;

  select pf.limit_value into result
  from public.subscriptions s
  join public.plan_features pf
    on pf.plan_id = s.plan_id and pf.feature_key = p_feature_key
  where s.org_id = p_org_id and s.status = 'active'
  order by s.created_at desc
  limit 1;

  if found then
    return result;
  end if;

  select pf.limit_value into result
  from public.plans p
  join public.plan_features pf
    on pf.plan_id = p.id and pf.feature_key = p_feature_key
  where p.code = 'free';
  return result;
end;
$function$;

-- This RPC intentionally exposes only an aggregate social-proof count.
grant execute on function public.get_opportunity_response_count(uuid) to anon;

-- Cache auth.uid()/auth.jwt() once per statement inside RLS policies.
do $rls$
declare
  policy_row record;
  using_expression text;
  check_expression text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ 'auth\.(uid|jwt)\(\)'
        or coalesce(with_check, '') ~ 'auth\.(uid|jwt)\(\)'
      )
  loop
    using_expression := replace(
      replace(policy_row.qual, 'auth.uid()', '(select auth.uid())'),
      'auth.jwt()', '(select auth.jwt())'
    );
    check_expression := replace(
      replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())'),
      'auth.jwt()', '(select auth.jwt())'
    );

    if policy_row.qual is not null and policy_row.with_check is not null then
      execute format(
        'alter policy %I on %I.%I using (%s) with check (%s)',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename,
        using_expression, check_expression
      );
    elsif policy_row.qual is not null then
      execute format(
        'alter policy %I on %I.%I using (%s)',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename,
        using_expression
      );
    elsif policy_row.with_check is not null then
      execute format(
        'alter policy %I on %I.%I with check (%s)',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename,
        check_expression
      );
    end if;
  end loop;
end;
$rls$;

-- Cover every foreign key used by joins, deletes, and RLS lookups.
create index if not exists ad_campaigns_created_by_fkey_idx on public.ad_campaigns (created_by);
create index if not exists ad_campaigns_org_id_fkey_idx on public.ad_campaigns (org_id);
create index if not exists advertisement_requests_org_id_fkey_idx on public.advertisement_requests (org_id);
create index if not exists advertisement_requests_requested_by_fkey_idx on public.advertisement_requests (requested_by);
create index if not exists adverts_org_id_fkey_idx on public.adverts (org_id);
create index if not exists adverts_request_id_fkey_idx on public.adverts (request_id);
create index if not exists audience_segments_created_by_fkey_idx on public.audience_segments (created_by);
create index if not exists audience_segments_org_id_fkey_idx on public.audience_segments (org_id);
create index if not exists countries_currency_code_fkey_idx on public.countries (currency_code);
create index if not exists directory_profiles_created_by_fkey_idx on public.directory_profiles (created_by);
create index if not exists followed_buyers_buyer_org_id_fkey_idx on public.followed_buyers (buyer_org_id);
create index if not exists followed_sectors_sector_id_fkey_idx on public.followed_sectors (sector_id);
create index if not exists media_assets_uploaded_by_fkey_idx on public.media_assets (uploaded_by);
create index if not exists notification_preferences_org_id_fkey_idx on public.notification_preferences (org_id);
create index if not exists notifications_org_id_fkey_idx on public.notifications (org_id);
create index if not exists opportunities_country_id_fkey_idx on public.opportunities (country_id);
create index if not exists opportunities_created_by_fkey_idx on public.opportunities (created_by);
create index if not exists opportunities_currency_code_fkey_idx on public.opportunities (currency_code);
create index if not exists opportunities_funding_agency_id_fkey_idx on public.opportunities (funding_agency_id);
create index if not exists opportunities_opportunity_type_id_fkey_idx on public.opportunities (opportunity_type_id);
create index if not exists opportunities_procurement_method_id_fkey_idx on public.opportunities (procurement_method_id);
create index if not exists opportunities_reviewed_by_fkey_idx on public.opportunities (reviewed_by);
create index if not exists opportunity_amendments_created_by_fkey_idx on public.opportunity_amendments (created_by);
create index if not exists opportunity_awards_created_by_fkey_idx on public.opportunity_awards (created_by);
create index if not exists opportunity_awards_currency_code_fkey_idx on public.opportunity_awards (currency_code);
create index if not exists opportunity_categories_category_id_fkey_idx on public.opportunity_categories (category_id);
create index if not exists opportunity_documents_uploaded_by_fkey_idx on public.opportunity_documents (uploaded_by);
create index if not exists opportunity_responses_user_id_fkey_idx on public.opportunity_responses (user_id);
create index if not exists organizations_created_by_fkey_idx on public.organizations (created_by);
create index if not exists pipeline_records_opportunity_id_fkey_idx on public.pipeline_records (opportunity_id);
create index if not exists plans_currency_code_fkey_idx on public.plans (currency_code);
create index if not exists saved_opportunities_opportunity_id_fkey_idx on public.saved_opportunities (opportunity_id);
create index if not exists saved_searches_district_id_fkey_idx on public.saved_searches (district_id);
create index if not exists saved_searches_opportunity_type_id_fkey_idx on public.saved_searches (opportunity_type_id);
create index if not exists saved_searches_sector_id_fkey_idx on public.saved_searches (sector_id);
create index if not exists service_request_activities_author_id_fkey_idx on public.service_request_activities (author_id);
create index if not exists service_requests_assigned_to_fkey_idx on public.service_requests (assigned_to);
create index if not exists service_requests_quote_currency_fkey_idx on public.service_requests (quote_currency);
create index if not exists service_requests_related_opportunity_id_fkey_idx on public.service_requests (related_opportunity_id);
create index if not exists service_requests_requested_by_fkey_idx on public.service_requests (requested_by);
create index if not exists subscriptions_approved_by_fkey_idx on public.subscriptions (approved_by);
create index if not exists subscriptions_plan_id_fkey_idx on public.subscriptions (plan_id);
create index if not exists supplier_sectors_sector_id_fkey_idx on public.supplier_sectors (sector_id);
create index if not exists tracking_links_created_by_fkey_idx on public.tracking_links (created_by);
create index if not exists verification_requests_reviewed_by_fkey_idx on public.verification_requests (reviewed_by);
create index if not exists verification_requests_submitted_by_fkey_idx on public.verification_requests (submitted_by);

commit;
