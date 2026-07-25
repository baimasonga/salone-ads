-- Correct demo opportunity statuses if 04_demo_seed.sql was first applied
-- while the end-user workflow transition guard was active.

begin;

alter table public.opportunities disable trigger protect_opportunity_transition_trigger;

update public.opportunities
set status_id = (
      select id
      from public.opportunity_statuses
      where code = 'published'
    ),
    review_note = 'Fictional demonstration record approved for public display.',
    reviewed_at = now(),
    updated_at = now()
where slug like 'demo-%'
  and title like '[DEMO]%';

alter table public.opportunities enable trigger protect_opportunity_transition_trigger;

commit;
