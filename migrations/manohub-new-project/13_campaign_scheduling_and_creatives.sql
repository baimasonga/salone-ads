-- Enhancement 2 completion: scheduled campaign lifecycle, creative visibility,
-- and automatic expiry. The scheduler is internal and cannot be called through
-- the Data API.

begin;

create schema if not exists private;

-- Advertisers may inspect creatives assigned to campaigns owned by their
-- organisation. Creative authoring and reassignment remain admin-only.
drop policy if exists adverts_campaign_org_read on public.adverts;
create policy adverts_campaign_org_read
  on public.adverts
  for select
  to authenticated
  using (
    campaign_id is not null
    and exists (
      select 1
      from public.ad_campaigns c
      where c.id = adverts.campaign_id
        and c.org_id is not null
        and (select public.is_org_member(c.org_id))
        and (select public.org_has_feature(c.org_id, 'business_advertising'))
    )
  );

create or replace function private.run_ad_campaign_schedule()
returns table (activated integer, completed integer)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  activated_count integer := 0;
  completed_count integer := 0;
begin
  -- Approved campaigns wait until their start date. A missing start date means
  -- "start as soon as approved".
  update public.ad_campaigns
  set status = 'active', updated_at = now()
  where status = 'approved'
    and (start_date is null or start_date <= current_date)
    and (end_date is null or end_date >= current_date);
  get diagnostics activated_count = row_count;

  update public.adverts a
  set status = 'live',
      starts_at = coalesce(a.starts_at, c.start_date::timestamp at time zone 'Africa/Freetown'),
      ends_at = coalesce(a.ends_at, (c.end_date + 1)::timestamp at time zone 'Africa/Freetown' - interval '1 second'),
      published_at = coalesce(a.published_at, now())
  from public.ad_campaigns c
  where a.campaign_id = c.id
    and c.status = 'active'
    and a.status in ('draft', 'archived');

  update public.ad_campaigns
  set status = 'completed', updated_at = now()
  where status in ('approved', 'active')
    and end_date is not null
    and end_date < current_date;
  get diagnostics completed_count = row_count;

  update public.adverts a
  set status = 'archived'
  from public.ad_campaigns c
  where a.campaign_id = c.id
    and c.status = 'completed'
    and a.status = 'live';

  return query select activated_count, completed_count;
end;
$function$;

revoke all on function private.run_ad_campaign_schedule() from public, anon, authenticated;
grant execute on function private.run_ad_campaign_schedule() to service_role;

-- Supabase Cron uses pg_cron. Installation is deliberately conditional so the
-- migration remains portable to local/test databases without the extension.
do $block$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into existing_job from cron.job where jobname = 'manohub-ad-campaign-schedule' limit 1;
    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;
    perform cron.schedule(
      'manohub-ad-campaign-schedule',
      '*/5 * * * *',
      'select * from private.run_ad_campaign_schedule();'
    );
  end if;
end;
$block$;

commit;
