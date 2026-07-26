-- Correct campaign-management authorization and RPC exposure for databases
-- that already applied migrations 10 and 11.

begin;

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
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;

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

revoke all on function public.run_campaign_health_sweep() from public, anon, authenticated;
grant execute on function public.run_campaign_health_sweep() to authenticated, service_role;

commit;
