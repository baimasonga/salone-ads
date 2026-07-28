-- Cover the remaining editorial-team foreign key reported by the database advisor.
begin;

create index cms_team_members_added_by_idx
  on public.cms_team_members (added_by)
  where added_by is not null;

commit;
