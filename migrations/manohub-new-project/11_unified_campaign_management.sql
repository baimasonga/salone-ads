-- Enhancement 2: one campaign identity for Manohub and social-media delivery.
-- Historical social campaign rows are preserved in ad_campaigns before the
-- retired campaigns table is removed.

alter table public.ad_campaigns
  add column if not exists channels text[] not null default array['manohub']::text[],
  add column if not exists legacy_campaign_id uuid;

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_channels_check,
  add constraint ad_campaigns_channels_check
    check (
      cardinality(channels) > 0
      and channels <@ array[
        'manohub', 'facebook', 'instagram', 'whatsapp',
        'tiktok', 'youtube', 'linkedin', 'x'
      ]::text[]
    );

create unique index if not exists ad_campaigns_legacy_campaign_id_idx
  on public.ad_campaigns (legacy_campaign_id)
  where legacy_campaign_id is not null;

insert into public.ad_campaigns (
  org_id,
  name,
  business_name,
  description,
  objective,
  start_date,
  end_date,
  total_budget,
  currency_code,
  location_targets,
  channels,
  status,
  submitted_at,
  approved_at,
  legacy_campaign_id,
  created_at,
  updated_at
)
select
  c.org_id,
  c.name,
  coalesce(o.name, ''),
  c.description,
  case
    when lower(c.objective) like '%sale%' or lower(c.objective) like '%booking%' then 'sales'
    when lower(c.objective) like '%lead%' or lower(c.objective) like '%enquir%' then 'leads'
    when lower(c.objective) like '%traffic%' then 'traffic'
    else 'awareness'
  end,
  c.start_date,
  c.end_date,
  nullif(c.total_budget, 0),
  'SLE',
  array_remove(array[c.district, c.diaspora_market], null),
  case
    when cardinality(c.channels) = 0 then array['manohub']::text[]
    else array(
      select distinct mapped.channel
      from unnest(c.channels) source(channel)
      cross join lateral (
        select case
          when lower(source.channel) like '%facebook%' then 'facebook'
          when lower(source.channel) like '%instagram%' then 'instagram'
          when lower(source.channel) like '%whatsapp%' then 'whatsapp'
          when lower(source.channel) like '%tiktok%' then 'tiktok'
          when lower(source.channel) like '%youtube%' then 'youtube'
          when lower(source.channel) like '%linkedin%' then 'linkedin'
          when lower(source.channel) in ('x', 'twitter') or lower(source.channel) like '%twitter%' then 'x'
          else 'manohub'
        end as channel
      ) mapped
    )
  end,
  case c.status
    when 'Draft' then 'draft'
    when 'Planning' then 'submitted'
    when 'Approved' then 'approved'
    when 'Scheduled' then 'approved'
    when 'Active' then 'active'
    when 'Completed' then 'completed'
    when 'Failed' then 'rejected'
    else 'draft'
  end,
  case when c.status in ('Planning', 'Approved', 'Scheduled', 'Active', 'Completed') then c.created_at end,
  case when c.status in ('Approved', 'Scheduled', 'Active', 'Completed') then c.created_at end,
  c.id,
  c.created_at,
  c.created_at
from public.campaigns c
left join public.organizations o on o.id = c.org_id
on conflict (legacy_campaign_id) where legacy_campaign_id is not null do nothing;

alter table public.content_items
  drop constraint if exists content_items_campaign_id_fkey;
alter table public.tracking_links
  drop constraint if exists tracking_links_campaign_id_fkey;

update public.content_items ci
set campaign_id = unified.id
from public.ad_campaigns unified
where unified.legacy_campaign_id = ci.campaign_id;

update public.tracking_links tl
set campaign_id = unified.id
from public.ad_campaigns unified
where unified.legacy_campaign_id = tl.campaign_id;

alter table public.content_items
  add constraint content_items_campaign_id_fkey
    foreign key (campaign_id) references public.ad_campaigns(id) on delete set null;
alter table public.tracking_links
  add constraint tracking_links_campaign_id_fkey
    foreign key (campaign_id) references public.ad_campaigns(id) on delete set null;

create or replace function public.run_campaign_health_sweep()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  affected integer := 0;
  rec record;
  admin_id uuid;
begin
  for rec in
    select c.id, c.org_id, c.name
    from ad_campaigns c
    where c.status in ('draft', 'submitted')
      and c.created_at < now() - interval '7 days'
      and not exists (select 1 from content_items ci where ci.campaign_id = c.id)
  loop
    for admin_id in select id from profiles where platform_role = 'admin' loop
      if not exists (
        select 1 from notifications n
        where n.user_id = admin_id and n.category = 'campaign_health'
          and n.metadata->>'campaign_id' = rec.id::text and n.metadata->>'flag' = 'no_content'
      ) then
        insert into notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
        values (admin_id, rec.org_id, 'campaign_health', 'No content drafted yet: ' || rec.name,
          'This campaign has been in planning for over a week with no content drafted.',
          null, 'in_app', jsonb_build_object('campaign_id', rec.id, 'flag', 'no_content'));
        affected := affected + 1;
      end if;
    end loop;
  end loop;

  for rec in
    select c.id, c.org_id, c.name
    from ad_campaigns c
    where c.status = 'active' and c.end_date is not null and c.end_date < current_date
  loop
    for admin_id in select id from profiles where platform_role = 'admin' loop
      if not exists (
        select 1 from notifications n
        where n.user_id = admin_id and n.category = 'campaign_health'
          and n.metadata->>'campaign_id' = rec.id::text and n.metadata->>'flag' = 'ended_but_active'
      ) then
        insert into notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
        values (admin_id, rec.org_id, 'campaign_health', 'Campaign end date has passed: ' || rec.name,
          'This campaign''s end date has passed but it is still marked active.',
          null, 'in_app', jsonb_build_object('campaign_id', rec.id, 'flag', 'ended_but_active'));
        affected := affected + 1;
      end if;
    end loop;
  end loop;

  for rec in
    select c.id, c.org_id, c.name
    from ad_campaigns c
    where c.status = 'active'
      and c.created_at < now() - interval '7 days'
      and exists (select 1 from tracking_links tl where tl.campaign_id = c.id)
      and not exists (
        select 1
        from tracking_links tl
        join tracking_link_clicks tlc on tlc.tracking_link_id = tl.id
        where tl.campaign_id = c.id and tlc.clicked_at > now() - interval '7 days'
      )
  loop
    for admin_id in select id from profiles where platform_role = 'admin' loop
      if not exists (
        select 1 from notifications n
        where n.user_id = admin_id and n.category = 'campaign_health'
          and n.metadata->>'campaign_id' = rec.id::text and n.metadata->>'flag' = 'low_activity'
      ) then
        insert into notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
        values (admin_id, rec.org_id, 'campaign_health', 'Low click activity: ' || rec.name,
          'This active campaign has had no tracking-link clicks in the last 7 days.',
          null, 'in_app', jsonb_build_object('campaign_id', rec.id, 'flag', 'low_activity'));
        affected := affected + 1;
      end if;
    end loop;
  end loop;

  return affected;
end;
$function$;

drop table public.campaigns;

revoke all on table public.ad_campaigns from anon;
grant select, insert, update, delete on table public.ad_campaigns to authenticated;
grant all on table public.ad_campaigns to service_role;

