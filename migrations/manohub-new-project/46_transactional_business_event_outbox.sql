-- Transactional business-event outbox integrated with the durable job queue.
begin;

create table if not exists public.business_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check(event_type ~ '^[A-Z][A-Za-z0-9]{2,79}$'),
  aggregate_type text not null check(aggregate_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  aggregate_id text not null,
  org_id uuid references public.organizations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid references public.business_events(id) on delete set null,
  idempotency_key text not null,
  status text not null default 'pending' check(status in ('pending','processing','processed','failed','dead_letter')),
  attempts integer not null default 0 check(attempts>=0),
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz, locked_by text, processed_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_type,idempotency_key)
);
create table if not exists public.business_event_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.business_events(id) on delete cascade,
  attempt_number integer not null, worker_id text not null, outcome text not null check(outcome in ('claimed','processed','failed')),
  error_message text, created_at timestamptz not null default now()
);
create index if not exists business_events_claim_idx on public.business_events(available_at,created_at) where status in ('pending','failed');
create index if not exists business_events_admin_idx on public.business_events(status,updated_at desc);
alter table public.business_events enable row level security; alter table public.business_event_attempts enable row level security;
revoke all on public.business_events,public.business_event_attempts from public,anon,authenticated;
grant select on public.business_events,public.business_event_attempts to authenticated;
drop policy if exists business_events_admin_read on public.business_events;
create policy business_events_admin_read on public.business_events for select to authenticated using(public.is_platform_admin());
drop policy if exists business_event_attempts_admin_read on public.business_event_attempts;
create policy business_event_attempts_admin_read on public.business_event_attempts for select to authenticated using(public.is_platform_admin());

create or replace function private.emit_business_event(p_event_type text,p_aggregate_type text,p_aggregate_id text,p_org_id uuid,p_payload jsonb,p_idempotency_key text,p_correlation_id uuid default gen_random_uuid(),p_causation_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid; begin
 insert into public.business_events(event_type,aggregate_type,aggregate_id,org_id,payload,idempotency_key,correlation_id,causation_id)
 values(p_event_type,p_aggregate_type,p_aggregate_id,p_org_id,coalesce(p_payload,'{}'),p_idempotency_key,p_correlation_id,p_causation_id)
 on conflict(event_type,idempotency_key) do update set updated_at=public.business_events.updated_at returning id into v_id;
 perform private.enqueue_background_job('business_event.dispatch',jsonb_build_object('event_id',v_id),v_id::text,now(),5,10::smallint);
 return v_id; end; $$;
revoke all on function private.emit_business_event(text,text,text,uuid,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.emit_business_event(text,text,text,uuid,jsonb,text,uuid,uuid) to service_role;

create or replace function private.claim_business_event(p_event_id uuid,p_worker_id text)
returns jsonb language plpgsql security definer set search_path='' as $$ declare v_event public.business_events%rowtype; begin
 if nullif(trim(p_worker_id),'') is null then raise exception 'Worker id is required'; end if;
 select * into v_event from public.business_events where id=p_event_id and status in ('pending','failed') and available_at<=now() for update skip locked;
 if not found then return null; end if;
 update public.business_events set status='processing',attempts=attempts+1,locked_at=now(),locked_by=p_worker_id,last_error=null,updated_at=now() where id=p_event_id returning * into v_event;
 insert into public.business_event_attempts(event_id,attempt_number,worker_id,outcome) values(v_event.id,v_event.attempts,p_worker_id,'claimed');
 return jsonb_build_object('id',v_event.id,'event_type',v_event.event_type,'aggregate_type',v_event.aggregate_type,'aggregate_id',v_event.aggregate_id,'org_id',v_event.org_id,'payload',v_event.payload,'correlation_id',v_event.correlation_id,'causation_id',v_event.causation_id,'attempt',v_event.attempts,'max_attempts',v_event.max_attempts);
end; $$;
revoke all on function private.claim_business_event(uuid,text) from public,anon,authenticated;
grant execute on function private.claim_business_event(uuid,text) to service_role;

create or replace function private.complete_business_event(p_event_id uuid,p_worker_id text)
returns boolean language plpgsql security definer set search_path='' as $$ declare v_attempt integer; begin
 update public.business_events set status='processed',processed_at=now(),locked_at=null,locked_by=null,last_error=null,updated_at=now()
 where id=p_event_id and status='processing' and locked_by=p_worker_id returning attempts into v_attempt;
 if not found then return false; end if;
 insert into public.business_event_attempts(event_id,attempt_number,worker_id,outcome) values(p_event_id,v_attempt,p_worker_id,'processed');
 return true;
end; $$;
revoke all on function private.complete_business_event(uuid,text) from public,anon,authenticated;
grant execute on function private.complete_business_event(uuid,text) to service_role;

create or replace function private.fail_business_event(p_event_id uuid,p_worker_id text,p_error text)
returns text language plpgsql security definer set search_path='' as $$ declare v_attempt integer; v_max_attempts integer; v_status text; begin
 select attempts,max_attempts into v_attempt,v_max_attempts from public.business_events
 where id=p_event_id and status='processing' and locked_by=p_worker_id for update;
 if not found then return null; end if;
 v_status:=case when v_attempt>=v_max_attempts then 'dead_letter' else 'failed' end;
 update public.business_events set status=v_status,
   available_at=case when v_status='failed' then now()+make_interval(secs=>least(3600,30*power(2,greatest(v_attempt-1,0)))::integer) else available_at end,
   locked_at=null,locked_by=null,last_error=left(coalesce(p_error,'Unknown dispatch error'),4000),updated_at=now()
 where id=p_event_id;
 insert into public.business_event_attempts(event_id,attempt_number,worker_id,outcome,error_message)
 values(p_event_id,v_attempt,p_worker_id,'failed',left(coalesce(p_error,'Unknown dispatch error'),4000));
 return v_status;
end; $$;
revoke all on function private.fail_business_event(uuid,text,text) from public,anon,authenticated;
grant execute on function private.fail_business_event(uuid,text,text) to service_role;

create or replace function private.capture_subscription_business_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform private.emit_business_event(case new.event_type when 'activated' then 'SubscriptionActivated' when 'renewed' then 'SubscriptionRenewed' when 'suspended' then 'SubscriptionSuspended' when 'cancelled' then 'SubscriptionCancelled' else 'SubscriptionChanged' end,'subscription',new.subscription_id::text,new.org_id,jsonb_build_object('event_type',new.event_type,'from_status',new.from_status,'to_status',new.to_status),new.id::text,gen_random_uuid(),null); return new; end; $$;
revoke all on function private.capture_subscription_business_event() from public,anon,authenticated;
drop trigger if exists subscription_events_emit_business_event on public.subscription_events;
create trigger subscription_events_emit_business_event after insert on public.subscription_events for each row execute function private.capture_subscription_business_event();

create or replace function private.capture_financial_business_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform private.emit_business_event(case new.entry_type when 'payment' then 'PaymentReceived' when 'invoice' then 'InvoiceIssued' when 'refund' then 'RefundRecorded' else 'LedgerEntryRecorded' end,'ledger_entry',new.id::text,new.org_id,jsonb_build_object('entry_type',new.entry_type,'direction',new.direction,'amount',new.amount,'currency',new.currency_code),new.id::text,gen_random_uuid(),null); return new; end; $$;
revoke all on function private.capture_financial_business_event() from public,anon,authenticated;
drop trigger if exists commercial_ledger_emit_business_event on public.commercial_ledger_entries;
create trigger commercial_ledger_emit_business_event after insert on public.commercial_ledger_entries for each row execute function private.capture_financial_business_event();

create or replace function public.admin_list_business_events(p_status text default null,p_limit integer default 50)
returns table(id uuid,event_type text,aggregate_type text,aggregate_id text,status text,attempts integer,max_attempts integer,correlation_id uuid,last_error text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 return query select e.id,e.event_type,e.aggregate_type,e.aggregate_id,e.status,e.attempts,e.max_attempts,e.correlation_id,e.last_error,e.created_at,e.updated_at from public.business_events e where p_status is null or e.status=p_status order by case e.status when 'dead_letter' then 0 when 'failed' then 1 when 'processing' then 2 else 3 end,e.updated_at desc limit least(greatest(p_limit,1),200); end; $$;
revoke all on function public.admin_list_business_events(text,integer) from public,anon; grant execute on function public.admin_list_business_events(text,integer) to authenticated;
create or replace function public.admin_replay_business_event(p_event_id uuid) returns boolean language plpgsql security definer set search_path='' as $$ declare n integer; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Admin access required'; end if;
 update public.business_events set status='pending',attempts=0,available_at=now(),locked_at=null,locked_by=null,last_error=null,updated_at=now() where id=p_event_id and status in ('failed','dead_letter'); get diagnostics n=row_count;
 if n=1 then perform private.enqueue_background_job('business_event.dispatch',jsonb_build_object('event_id',p_event_id),'replay:'||p_event_id::text||':'||extract(epoch from now())::bigint,now(),5,10::smallint); end if; return n=1; end; $$;
revoke all on function public.admin_replay_business_event(uuid) from public,anon; grant execute on function public.admin_replay_business_event(uuid) to authenticated;

commit;
