-- Privacy-preserving first/last/multi-touch attribution for advert outcomes.
begin;

alter table public.advert_outcomes
  add column if not exists first_touch_event_id uuid references public.advert_events(id) on delete set null,
  add column if not exists last_touch_event_id uuid references public.advert_events(id) on delete set null,
  add column if not exists attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 90);

create index if not exists advert_events_attribution_idx
  on public.advert_events(advert_id, visitor_token_hash, created_at desc)
  where visitor_token_hash is not null;

create or replace function private.attribute_advert_outcome()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_first uuid; v_last uuid;
begin
  select e.id into v_first from public.advert_events e
  where e.advert_id=new.advert_id and e.created_at between new.occurred_at-(new.attribution_window_days||' days')::interval and new.occurred_at
    and e.event_type in ('detail_view','cta_click')
  order by e.created_at asc limit 1;
  select e.id into v_last from public.advert_events e
  where e.advert_id=new.advert_id and e.created_at between new.occurred_at-(new.attribution_window_days||' days')::interval and new.occurred_at
    and e.event_type in ('detail_view','cta_click')
  order by e.created_at desc limit 1;
  new.first_touch_event_id:=coalesce(new.first_touch_event_id,v_first);
  new.last_touch_event_id:=coalesce(new.last_touch_event_id,v_last);
  return new;
end $$;
revoke all on function private.attribute_advert_outcome() from public,anon,authenticated;
drop trigger if exists advert_outcomes_attribute on public.advert_outcomes;
create trigger advert_outcomes_attribute before insert or update of occurred_at,attribution_window_days
on public.advert_outcomes for each row execute function private.attribute_advert_outcome();

create or replace function public.get_advert_attribution(p_advert_id uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_result jsonb;
begin
  if p_days not between 1 and 366 then raise exception 'Reporting period must be between 1 and 366 days'; end if;
  select org_id into v_org from public.adverts where id=p_advert_id;
  if v_org is null then raise exception 'Advert not found'; end if;
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_member(v_org)) then raise exception 'Advert reporting access required'; end if;
  with touches as (
    select coalesce(nullif(e.metadata->>'utm_campaign',''),nullif(e.source,''),'direct') campaign,
      coalesce(nullif(e.metadata->>'utm_medium',''),nullif(e.channel,''),'unknown') medium,
      e.event_type, e.id
    from public.advert_events e where e.advert_id=p_advert_id and e.created_at>=now()-(p_days||' days')::interval
  ), attributed as (
    select o.id,o.outcome_type,o.status,o.revenue_amount,
      coalesce(nullif(e.metadata->>'utm_campaign',''),nullif(e.source,''),'unattributed') campaign,
      coalesce(nullif(e.metadata->>'utm_medium',''),nullif(e.channel,''),'unknown') medium
    from public.advert_outcomes o left join public.advert_events e on e.id=o.last_touch_event_id
    where o.advert_id=p_advert_id and o.occurred_at>=now()-(p_days||' days')::interval
  ), grouped as (
    select campaign,medium,count(*) filter(where event_type='detail_view') views,count(*) filter(where event_type='cta_click') clicks,0 outcomes,0::numeric revenue from touches group by 1,2
    union all
    select campaign,medium,0,0,count(*) filter(where status='confirmed'),coalesce(sum(revenue_amount) filter(where status='confirmed'),0) from attributed group by 1,2
  )
  select jsonb_build_object('advert_id',p_advert_id,'period_days',p_days,'model','last_touch','rows',coalesce(jsonb_agg(jsonb_build_object(
    'campaign',campaign,'medium',medium,'views',views,'clicks',clicks,'outcomes',outcomes,'revenue',revenue) order by revenue desc,clicks desc),'[]'::jsonb))
  into v_result from (select campaign,medium,sum(views) views,sum(clicks) clicks,sum(outcomes) outcomes,sum(revenue) revenue from grouped group by 1,2) x;
  return v_result;
end $$;
revoke all on function public.get_advert_attribution(uuid,integer) from public,anon;
grant execute on function public.get_advert_attribution(uuid,integer) to authenticated;
commit;
