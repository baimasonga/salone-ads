begin;

create or replace function public.admin_list_background_jobs(
  p_status text default null,
  p_limit integer default 50
)
returns table(
  id uuid,
  job_type text,
  status text,
  attempts integer,
  max_attempts integer,
  available_at timestamptz,
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Admin access required';
  end if;
  if p_status is not null and p_status not in ('queued', 'processing', 'completed', 'dead_letter') then
    raise exception 'Invalid job status';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Limit must be between 1 and 200';
  end if;

  return query
  select
    j.id,
    j.job_type,
    j.status,
    j.attempts,
    j.max_attempts,
    j.available_at,
    j.locked_at,
    j.completed_at,
    j.last_error,
    j.created_at,
    j.updated_at
  from private.background_jobs j
  where p_status is null or j.status = p_status
  order by
    case j.status
      when 'dead_letter' then 0
      when 'processing' then 1
      when 'queued' then 2
      else 3
    end,
    j.updated_at desc
  limit p_limit;
end;
$$;

revoke all on function public.admin_list_background_jobs(text, integer) from public, anon;
grant execute on function public.admin_list_background_jobs(text, integer) to authenticated;

commit;
