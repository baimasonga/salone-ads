-- Procurement-grade saved-search matching and durable alert evidence.
-- Matches only reviewed opportunities when they enter a public status.

begin;

alter table public.saved_searches
  add column if not exists country_id uuid references public.countries(id) on delete set null,
  add column if not exists frequency text not null default 'immediate'
    check (frequency in ('immediate', 'daily', 'weekly')),
  add column if not exists is_active boolean not null default true,
  add column if not exists last_matched_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists saved_searches_country_id_idx
  on public.saved_searches(country_id);
create index if not exists saved_searches_active_user_idx
  on public.saved_searches(user_id, is_active, created_at desc);

create table if not exists public.saved_search_matches (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_score integer not null check (match_score between 0 and 100),
  match_reasons jsonb not null default '{}'::jsonb
    check (jsonb_typeof(match_reasons) = 'object'),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'notified', 'dismissed')),
  matched_at timestamptz not null default now(),
  notified_at timestamptz,
  unique(saved_search_id, opportunity_id)
);

create index if not exists saved_search_matches_search_time_idx
  on public.saved_search_matches(saved_search_id, matched_at desc);
create index if not exists saved_search_matches_opportunity_idx
  on public.saved_search_matches(opportunity_id);
create index if not exists saved_search_matches_user_status_idx
  on public.saved_search_matches(user_id, delivery_status, matched_at desc);

alter table public.saved_searches enable row level security;
alter table public.saved_search_matches enable row level security;

revoke all on public.saved_searches, public.saved_search_matches from anon;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select on public.saved_search_matches to authenticated;
grant update(delivery_status) on public.saved_search_matches to authenticated;

drop policy if exists "Users manage their own saved searches" on public.saved_searches;
drop policy if exists saved_searches_owner_read on public.saved_searches;
drop policy if exists saved_searches_owner_insert on public.saved_searches;
drop policy if exists saved_searches_owner_update on public.saved_searches;
drop policy if exists saved_searches_owner_delete on public.saved_searches;

create policy saved_searches_owner_read
on public.saved_searches for select to authenticated
using (user_id = (select auth.uid()));
create policy saved_searches_owner_insert
on public.saved_searches for insert to authenticated
with check (user_id = (select auth.uid()));
create policy saved_searches_owner_update
on public.saved_searches for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy saved_searches_owner_delete
on public.saved_searches for delete to authenticated
using (user_id = (select auth.uid()));

create policy saved_search_matches_owner_read
on public.saved_search_matches for select to authenticated
using (user_id = (select auth.uid()));
create policy saved_search_matches_owner_update
on public.saved_search_matches for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.notify_matching_users_on_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  public_status text;
  saved record;
  inserted_match_id uuid;
  calculated_score integer;
  reasons jsonb;
begin
  if tg_op = 'UPDATE' and old.status_id is not distinct from new.status_id then
    return new;
  end if;

  select code into public_status
  from public.opportunity_statuses
  where id = new.status_id;
  if public_status not in ('published', 'amended') then
    return new;
  end if;

  for saved in
    select ss.*
    from public.saved_searches ss
    where ss.is_active
      and (ss.country_id is null or ss.country_id = new.country_id)
      and (ss.sector_id is null or ss.sector_id = new.sector_id)
      and (ss.district_id is null or ss.district_id = new.district_id)
      and (ss.opportunity_type_id is null or ss.opportunity_type_id = new.opportunity_type_id)
      and (
        nullif(btrim(coalesce(ss.keyword, '')), '') is null
        or strpos(
          lower(concat_ws(' ', new.title, new.summary, new.description, new.buyer_name)),
          lower(btrim(ss.keyword))
        ) > 0
      )
      and (new.submission_deadline is null or new.submission_deadline > now())
  loop
    calculated_score := 50
      + case when saved.keyword is not null then 20 else 0 end
      + case when saved.sector_id is not null then 10 else 0 end
      + case when saved.country_id is not null then 10 else 0 end
      + case when saved.district_id is not null then 5 else 0 end
      + case when saved.opportunity_type_id is not null then 5 else 0 end;
    reasons := jsonb_strip_nulls(jsonb_build_object(
      'keyword', case when saved.keyword is not null then saved.keyword end,
      'sector', case when saved.sector_id is not null then true end,
      'country', case when saved.country_id is not null then true end,
      'district', case when saved.district_id is not null then true end,
      'opportunity_type', case when saved.opportunity_type_id is not null then true end
    ));

    inserted_match_id := null;
    insert into public.saved_search_matches (
      saved_search_id, opportunity_id, user_id, match_score, match_reasons
    ) values (
      saved.id, new.id, saved.user_id, least(calculated_score, 100), reasons
    )
    on conflict (saved_search_id, opportunity_id) do nothing
    returning id into inserted_match_id;

    if inserted_match_id is not null then
      update public.saved_searches
      set last_matched_at = now(), updated_at = now()
      where id = saved.id;

      if saved.frequency = 'immediate' then
        insert into public.notifications (
          user_id, category, title, body, link_url, channel, priority,
          action_label, workspace_target, metadata
        ) values (
          saved.user_id,
          'saved_search_match',
          'New tender matches ' || saved.name,
          new.title,
          '/tenders/' || new.slug,
          'in_app',
          case when new.submission_deadline is not null
                    and new.submission_deadline < now() + interval '7 days'
               then 'high' else 'normal' end,
          'View tender',
          'tenders',
          jsonb_build_object(
            'opportunity_id', new.id,
            'saved_search_id', saved.id,
            'match_id', inserted_match_id,
            'match_score', least(calculated_score, 100)
          )
        );
        update public.saved_search_matches
        set delivery_status = 'notified', notified_at = now()
        where id = inserted_match_id;
      end if;
    end if;
  end loop;

  if new.buyer_org_id is not null then
    insert into public.notifications (
      user_id, category, title, body, link_url, channel, metadata
    )
    select
      fb.user_id, 'followed_buyer', 'New tender from a buyer you follow',
      new.title, '/tenders/' || new.slug, 'in_app',
      jsonb_build_object('opportunity_id', new.id)
    from public.followed_buyers fb
    where fb.buyer_org_id = new.buyer_org_id
      and not exists (
        select 1 from public.notifications n
        where n.user_id = fb.user_id
          and n.category = 'followed_buyer'
          and n.metadata->>'opportunity_id' = new.id::text
      );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_matching_users_on_publish() from public, anon, authenticated;

drop trigger if exists notify_matching_users_on_publish_trigger on public.opportunities;
create trigger notify_matching_users_on_publish_trigger
after insert or update of status_id on public.opportunities
for each row execute function public.notify_matching_users_on_publish();

commit;
