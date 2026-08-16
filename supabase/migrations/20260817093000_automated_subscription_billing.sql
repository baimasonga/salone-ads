-- Provider-neutral recurring invoices, charge attempts, dunning, receipts and refunds.
begin;

create table if not exists public.subscription_billing_profiles(
  subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check(provider in ('manual','mobile_money','card')),
  provider_customer_ref text,
  provider_mandate_ref text,
  automatic_collection boolean not null default false,
  retry_count integer not null default 0 check(retry_count between 0 and 12),
  next_retry_at timestamptz,
  last_charge_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.subscription_charge_attempts(
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  invoice_id uuid not null references public.commercial_invoices(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade,
  attempt_number integer not null check(attempt_number between 1 and 12), provider text not null,
  status text not null default 'queued' check(status in ('queued','processing','succeeded','failed','cancelled')),
  amount numeric(16,2) not null check(amount>0), currency_code text not null references public.currencies(code),
  provider_reference text, failure_code text, failure_message text, next_retry_at timestamptz,
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique(invoice_id,attempt_number)
);
create table if not exists public.commercial_receipts(
  id uuid primary key default gen_random_uuid(), receipt_number text not null unique,
  org_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid references public.commercial_invoices(id) on delete restrict,
  payment_id uuid references public.commercial_payments(id) on delete restrict,
  refund_id uuid references public.commercial_refunds(id) on delete restrict,
  receipt_type text not null check(receipt_type in ('payment','refund')),
  amount numeric(16,2) not null check(amount>0), currency_code text not null references public.currencies(code),
  issued_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
  check((receipt_type='payment' and payment_id is not null) or (receipt_type='refund' and refund_id is not null))
);
create index if not exists subscription_charge_queue_idx on public.subscription_charge_attempts(status,next_retry_at,created_at);
create index if not exists commercial_receipts_org_idx on public.commercial_receipts(org_id,issued_at desc);
create unique index if not exists commercial_receipts_payment_uidx on public.commercial_receipts(payment_id) where payment_id is not null;
create unique index if not exists commercial_receipts_refund_uidx on public.commercial_receipts(refund_id) where refund_id is not null;
alter table public.subscription_billing_profiles enable row level security;
alter table public.subscription_charge_attempts enable row level security;
alter table public.commercial_receipts enable row level security;
revoke all on public.subscription_billing_profiles,public.subscription_charge_attempts,public.commercial_receipts from public,anon,authenticated;
grant select on public.subscription_billing_profiles,public.subscription_charge_attempts,public.commercial_receipts to authenticated;
create policy subscription_billing_profiles_read on public.subscription_billing_profiles for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy subscription_charge_attempts_read on public.subscription_charge_attempts for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy commercial_receipts_read on public.commercial_receipts for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));

create or replace function private.process_subscription_billing(p_as_of date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s record; v_invoice uuid; v_amount numeric; v_created int:=0; v_queued int:=0;
begin
  for s in select sub.*,p.name plan_name,p.monthly_price,p.annual_price,p.currency_code,b.provider,b.automatic_collection
    from public.subscriptions sub join public.plans p on p.id=sub.plan_id
    left join public.subscription_billing_profiles b on b.subscription_id=sub.id
    where sub.status='active' and sub.current_period_end<=p_as_of and not sub.cancel_at_period_end
  loop
    v_amount:=case when s.billing_cycle='annual' then s.annual_price else s.monthly_price end;
    if v_amount is null or v_amount<=0 then continue; end if;
    select id into v_invoice from public.commercial_invoices where source_type='subscription' and source_id=s.id and status in ('issued','partially_paid','overdue') order by issued_at desc limit 1;
    if v_invoice is null then
      insert into public.commercial_invoices(org_id,invoice_number,source_type,source_id,currency_code,status,subtotal,due_at)
      values(s.org_id,'SUB-'||to_char(p_as_of,'YYYYMM')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),'subscription',s.id,s.currency_code,'issued',v_amount,p_as_of+7) returning id into v_invoice;
      insert into public.commercial_invoice_lines(invoice_id,description,quantity,unit_amount) values(v_invoice,s.plan_name||' subscription renewal ('||s.billing_cycle||')',1,v_amount);
      insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,metadata)
      values(s.org_id,'invoice','debit',v_amount,s.currency_code,'commercial_invoice',v_invoice,'Subscription renewal invoice',jsonb_build_object('subscription_id',s.id));
      v_created:=v_created+1;
    end if;
    if coalesce(s.automatic_collection,false) and not exists(select 1 from public.subscription_charge_attempts where invoice_id=v_invoice and status in ('queued','processing','succeeded')) then
      insert into public.subscription_charge_attempts(subscription_id,invoice_id,org_id,attempt_number,provider,amount,currency_code)
      values(s.id,v_invoice,s.org_id,1,s.provider,v_amount,s.currency_code); v_queued:=v_queued+1;
    end if;
  end loop;
  update public.commercial_invoices set status='overdue' where status in ('issued','partially_paid') and due_at<p_as_of;
  update public.subscriptions sub set status='past_due',grace_ends_at=p_as_of+7,updated_at=now()
    where status='active' and exists(select 1 from public.commercial_invoices i where i.source_type='subscription' and i.source_id=sub.id and i.status='overdue');
  return jsonb_build_object('invoices_created',v_created,'charges_queued',v_queued);
end $$;
revoke all on function private.process_subscription_billing(date) from public,anon,authenticated;

create or replace function private.issue_commercial_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_invoice uuid;
declare v_payment public.commercial_payments;
begin
 if tg_table_name='commercial_payment_allocations' then
  select * into v_payment from public.commercial_payments where id=new.payment_id;
  insert into public.commercial_receipts(receipt_number,org_id,invoice_id,payment_id,receipt_type,amount,currency_code)
  values('RCT-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_payment.org_id,new.invoice_id,new.payment_id,'payment',new.amount,v_payment.currency_code) on conflict(payment_id) where payment_id is not null do nothing;
 else
  insert into public.commercial_receipts(receipt_number,org_id,invoice_id,refund_id,receipt_type,amount,currency_code)
  values('RFD-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),new.org_id,new.invoice_id,new.id,'refund',new.amount,new.currency_code) on conflict(refund_id) where refund_id is not null do nothing;
 end if; return new;
end $$;
revoke all on function private.issue_commercial_receipt() from public,anon,authenticated;
drop trigger if exists commercial_payment_receipt on public.commercial_payment_allocations;
create trigger commercial_payment_receipt after insert on public.commercial_payment_allocations for each row execute function private.issue_commercial_receipt();
drop trigger if exists commercial_refund_receipt on public.commercial_refunds;
create trigger commercial_refund_receipt after insert on public.commercial_refunds for each row execute function private.issue_commercial_receipt();

create or replace function public.admin_process_subscription_billing(p_as_of date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 return private.process_subscription_billing(p_as_of); end $$;
revoke all on function public.admin_process_subscription_billing(date) from public,anon;
grant execute on function public.admin_process_subscription_billing(date) to authenticated;

create or replace function public.complete_subscription_charge(p_attempt_id uuid,p_success boolean,p_provider_reference text,p_failure_code text default null,p_failure_message text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.subscription_charge_attempts; v_payment uuid; v_receipt text; v_next timestamptz;
begin
 if auth.uid() is not null and not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 select * into a from public.subscription_charge_attempts where id=p_attempt_id for update; if not found then raise exception 'Charge attempt not found'; end if;
 if a.status not in ('queued','processing') then raise exception 'Charge attempt is already complete'; end if;
 if p_success then
  insert into public.commercial_payments(org_id,payment_reference,method,currency_code,amount,status)
  values(a.org_id,trim(p_provider_reference),case when a.provider='card' then 'card' else 'mobile_money' end,a.currency_code,a.amount,'verified') returning id into v_payment;
  insert into public.commercial_payment_allocations(payment_id,invoice_id,amount) values(v_payment,a.invoice_id,a.amount);
  update public.commercial_invoices set amount_paid=amount_paid+a.amount,status='paid' where id=a.invoice_id;
  update public.subscription_charge_attempts set status='succeeded',provider_reference=trim(p_provider_reference),completed_at=now() where id=a.id;
  update public.subscriptions set status='active',current_period_start=current_date,current_period_end=case when billing_cycle='annual' then (current_date+interval '1 year')::date else (current_date+interval '1 month')::date end,grace_ends_at=null,updated_at=now() where id=a.subscription_id;
  select receipt_number into v_receipt from public.commercial_receipts where payment_id=v_payment;
  return jsonb_build_object('status','succeeded','receipt_number',v_receipt);
 else
  v_next:=now()+case a.attempt_number when 1 then interval '1 day' when 2 then interval '3 days' else interval '7 days' end;
  update public.subscription_charge_attempts set status='failed',failure_code=left(p_failure_code,80),failure_message=left(p_failure_message,500),next_retry_at=v_next,completed_at=now() where id=a.id;
  if a.attempt_number<4 then insert into public.subscription_charge_attempts(subscription_id,invoice_id,org_id,attempt_number,provider,amount,currency_code,next_retry_at) values(a.subscription_id,a.invoice_id,a.org_id,a.attempt_number+1,a.provider,a.amount,a.currency_code,v_next); end if;
  update public.subscriptions set status=case when a.attempt_number>=4 then 'suspended' else 'past_due' end,grace_ends_at=current_date+7,suspension_reason=case when a.attempt_number>=4 then 'Automated payment recovery exhausted' else suspension_reason end,updated_at=now() where id=a.subscription_id;
  return jsonb_build_object('status','failed','next_retry_at',v_next,'attempt',a.attempt_number);
 end if;
end $$;
revoke all on function public.complete_subscription_charge(uuid,boolean,text,text,text) from public,anon;
grant execute on function public.complete_subscription_charge(uuid,boolean,text,text,text) to authenticated,service_role;

do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname='hyderra-subscription-billing';
  perform cron.schedule('hyderra-subscription-billing','15 1 * * *','select private.process_subscription_billing(current_date);');
 end if;
end $$;
commit;
