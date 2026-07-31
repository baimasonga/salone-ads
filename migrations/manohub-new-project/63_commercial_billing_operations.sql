-- Complete core commercial billing operations with credits, refunds and
-- deterministic overdue processing on top of the append-only ledger.
begin;

alter table public.commercial_invoices
  add column if not exists amount_credited numeric(16,2) not null default 0
    check (amount_credited >= 0);

alter table public.commercial_payments
  add column if not exists refunded_amount numeric(16,2) not null default 0
    check (refunded_amount >= 0 and refunded_amount <= amount);

create table if not exists public.commercial_credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.commercial_invoices(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  credit_number text not null unique,
  currency_code text not null references public.currencies(code),
  amount numeric(16,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now()
);

create table if not exists public.commercial_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.commercial_payments(id) on delete restrict,
  invoice_id uuid not null references public.commercial_invoices(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  refund_reference text not null,
  currency_code text not null references public.currencies(code),
  amount numeric(16,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (org_id, refund_reference)
);

create index if not exists commercial_credit_notes_invoice_idx
  on public.commercial_credit_notes(invoice_id, issued_at desc);
create index if not exists commercial_refunds_payment_idx
  on public.commercial_refunds(payment_id, recorded_at desc);

alter table public.commercial_credit_notes enable row level security;
alter table public.commercial_refunds enable row level security;
revoke all on public.commercial_credit_notes, public.commercial_refunds
  from public, anon, authenticated;
grant select on public.commercial_credit_notes, public.commercial_refunds
  to authenticated;

drop policy if exists commercial_credit_notes_read on public.commercial_credit_notes;
create policy commercial_credit_notes_read on public.commercial_credit_notes
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists commercial_refunds_read on public.commercial_refunds;
create policy commercial_refunds_read on public.commercial_refunds
  for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

create or replace function public.record_commercial_payment(
  p_invoice_id uuid,
  p_reference text,
  p_method text,
  p_amount numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.commercial_invoices;
  v_payment_id uuid;
  v_outstanding numeric(16,2);
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if nullif(trim(coalesce(p_reference, '')), '') is null
     or length(trim(p_reference)) > 200 then
    raise exception 'A valid payment reference is required';
  end if;
  if p_method not in ('bank_transfer','mobile_money','card','cash','credit') then
    raise exception 'Unsupported payment method';
  end if;

  select * into v_invoice
  from public.commercial_invoices
  where id = p_invoice_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'void' then raise exception 'A void invoice cannot receive payment'; end if;

  v_outstanding := greatest(
    v_invoice.total_amount - v_invoice.amount_paid - v_invoice.amount_credited,
    0
  );
  if p_amount <= 0 or p_amount > v_outstanding then
    raise exception 'Payment exceeds outstanding balance';
  end if;

  insert into public.commercial_payments(
    org_id, payment_reference, method, currency_code, amount, verified_by
  ) values (
    v_invoice.org_id, trim(p_reference), p_method,
    v_invoice.currency_code, p_amount, (select auth.uid())
  ) returning id into v_payment_id;

  insert into public.commercial_payment_allocations(payment_id, invoice_id, amount)
  values (v_payment_id, v_invoice.id, p_amount);

  update public.commercial_invoices
  set amount_paid = amount_paid + p_amount,
      status = case
        when amount_paid + amount_credited + p_amount >= total_amount then 'paid'
        else 'partially_paid'
      end
  where id = v_invoice.id;

  insert into public.commercial_ledger_entries(
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id
  ) values (
    v_invoice.org_id, 'payment', 'credit', p_amount, v_invoice.currency_code,
    'commercial_payment', v_payment_id, 'Payment ' || trim(p_reference),
    (select auth.uid())
  );

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), v_invoice.org_id, 'billing.payment_recorded',
    'commercial_invoice', v_invoice.id::text,
    jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount,
      'currency', v_invoice.currency_code, 'reference', trim(p_reference))
  );

  return v_payment_id;
end;
$$;

revoke all on function public.record_commercial_payment(uuid,text,text,numeric)
  from public, anon;
grant execute on function public.record_commercial_payment(uuid,text,text,numeric)
  to authenticated;

create or replace function public.issue_commercial_credit(
  p_invoice_id uuid,
  p_credit_number text,
  p_amount numeric,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.commercial_invoices;
  v_credit_id uuid;
  v_outstanding numeric(16,2);
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if nullif(trim(coalesce(p_credit_number, '')), '') is null
     or length(trim(p_credit_number)) > 200 then
    raise exception 'A valid credit-note number is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Credit reason must contain 3 to 1000 characters';
  end if;

  select * into v_invoice from public.commercial_invoices
  where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'void' then raise exception 'A void invoice cannot be credited'; end if;

  v_outstanding := greatest(
    v_invoice.total_amount - v_invoice.amount_paid - v_invoice.amount_credited,
    0
  );
  if p_amount <= 0 or p_amount > v_outstanding then
    raise exception 'Credit exceeds outstanding balance';
  end if;

  insert into public.commercial_credit_notes(
    invoice_id, org_id, credit_number, currency_code, amount, reason, issued_by
  ) values (
    v_invoice.id, v_invoice.org_id, trim(p_credit_number),
    v_invoice.currency_code, p_amount, trim(p_reason), (select auth.uid())
  ) returning id into v_credit_id;

  update public.commercial_invoices
  set amount_credited = amount_credited + p_amount,
      status = case
        when amount_paid + amount_credited + p_amount >= total_amount then 'paid'
        when amount_paid > 0 then 'partially_paid'
        when due_at is not null and due_at < current_date then 'overdue'
        else 'issued'
      end
  where id = v_invoice.id;

  insert into public.commercial_ledger_entries(
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id, metadata
  ) values (
    v_invoice.org_id, 'credit', 'credit', p_amount, v_invoice.currency_code,
    'commercial_credit_note', v_credit_id,
    'Credit note ' || trim(p_credit_number), (select auth.uid()),
    jsonb_build_object('invoice_id', v_invoice.id, 'reason', trim(p_reason))
  );

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), v_invoice.org_id, 'billing.credit_issued',
    'commercial_invoice', v_invoice.id::text,
    jsonb_build_object('credit_id', v_credit_id, 'amount', p_amount,
      'currency', v_invoice.currency_code, 'reason', trim(p_reason))
  );

  return v_credit_id;
end;
$$;

revoke all on function public.issue_commercial_credit(uuid,text,numeric,text)
  from public, anon;
grant execute on function public.issue_commercial_credit(uuid,text,numeric,text)
  to authenticated;

create or replace function public.record_commercial_refund(
  p_payment_id uuid,
  p_refund_reference text,
  p_amount numeric,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.commercial_payments;
  v_allocation public.commercial_payment_allocations;
  v_invoice public.commercial_invoices;
  v_refund_id uuid;
  v_available numeric(16,2);
  v_next_paid numeric(16,2);
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if nullif(trim(coalesce(p_refund_reference, '')), '') is null
     or length(trim(p_refund_reference)) > 200 then
    raise exception 'A valid refund reference is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Refund reason must contain 3 to 1000 characters';
  end if;

  select * into v_payment from public.commercial_payments
  where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status not in ('verified','reversed') then
    raise exception 'Only verified payments can be refunded';
  end if;

  select * into v_allocation from public.commercial_payment_allocations
  where payment_id = p_payment_id
  order by created_at
  limit 1;
  if not found then raise exception 'Payment allocation not found'; end if;

  select * into v_invoice from public.commercial_invoices
  where id = v_allocation.invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;

  v_available := v_payment.amount - v_payment.refunded_amount;
  if p_amount <= 0 or p_amount > v_available
     or p_amount > v_invoice.amount_paid then
    raise exception 'Refund exceeds the refundable amount';
  end if;
  v_next_paid := v_invoice.amount_paid - p_amount;

  insert into public.commercial_refunds(
    payment_id, invoice_id, org_id, refund_reference,
    currency_code, amount, reason, recorded_by
  ) values (
    v_payment.id, v_invoice.id, v_invoice.org_id, trim(p_refund_reference),
    v_invoice.currency_code, p_amount, trim(p_reason), (select auth.uid())
  ) returning id into v_refund_id;

  update public.commercial_payments
  set refunded_amount = refunded_amount + p_amount,
      status = case when refunded_amount + p_amount >= amount then 'reversed' else 'verified' end
  where id = v_payment.id;

  update public.commercial_invoices
  set amount_paid = v_next_paid,
      status = case
        when v_next_paid + amount_credited >= total_amount then 'paid'
        when due_at is not null and due_at < current_date then 'overdue'
        when v_next_paid > 0 then 'partially_paid'
        else 'issued'
      end
  where id = v_invoice.id;

  insert into public.commercial_ledger_entries(
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id, metadata
  ) values (
    v_invoice.org_id, 'refund', 'debit', p_amount, v_invoice.currency_code,
    'commercial_refund', v_refund_id,
    'Refund ' || trim(p_refund_reference), (select auth.uid()),
    jsonb_build_object('invoice_id', v_invoice.id, 'payment_id', v_payment.id,
      'reason', trim(p_reason))
  );

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), v_invoice.org_id, 'billing.refund_recorded',
    'commercial_invoice', v_invoice.id::text,
    jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment.id,
      'amount', p_amount, 'currency', v_invoice.currency_code,
      'reason', trim(p_reason))
  );

  return v_refund_id;
end;
$$;

revoke all on function public.record_commercial_refund(uuid,text,numeric,text)
  from public, anon;
grant execute on function public.record_commercial_refund(uuid,text,numeric,text)
  to authenticated;

create or replace function private.process_commercial_invoice_overdue(
  p_as_of date default current_date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice record;
  v_user record;
  v_count integer := 0;
begin
  for v_invoice in
    update public.commercial_invoices
    set status = 'overdue'
    where status in ('issued','partially_paid')
      and due_at is not null
      and due_at < p_as_of
      and total_amount > amount_paid + amount_credited
    returning id, org_id, invoice_number, due_at, currency_code,
      total_amount - amount_paid - amount_credited as outstanding
  loop
    v_count := v_count + 1;

    insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
    values (
      (select auth.uid()), v_invoice.org_id, 'billing.invoice_overdue',
      'commercial_invoice', v_invoice.id::text,
      jsonb_build_object('invoice_number', v_invoice.invoice_number,
        'due_at', v_invoice.due_at, 'outstanding', v_invoice.outstanding,
        'currency', v_invoice.currency_code, 'source', 'billing_automation')
    );

    for v_user in
      select user_id from public.organization_members
      where org_id = v_invoice.org_id and role in ('owner','admin')
    loop
      insert into public.notifications(
        user_id, org_id, category, title, body, channel, status, priority,
        workspace_target, action_label, metadata
      ) values (
        v_user.user_id, v_invoice.org_id, 'billing',
        'Invoice overdue: ' || v_invoice.invoice_number,
        'Payment was due on ' || to_char(v_invoice.due_at, 'DD Mon YYYY') ||
          '. Outstanding: ' || v_invoice.currency_code || ' ' ||
          to_char(v_invoice.outstanding, 'FM999999999999990.00') || '.',
        'in_app', 'pending', 'high', 'billing', 'Review invoice',
        jsonb_build_object('invoice_id', v_invoice.id,
          'automation_key', 'invoice-overdue:' || v_invoice.id::text)
      ) on conflict do nothing;
    end loop;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.process_commercial_invoice_overdue(date)
  from public, anon, authenticated;
grant execute on function private.process_commercial_invoice_overdue(date)
  to service_role;

create or replace function public.admin_process_commercial_invoice_overdue(
  p_as_of date default current_date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  return private.process_commercial_invoice_overdue(p_as_of);
end;
$$;

revoke all on function public.admin_process_commercial_invoice_overdue(date)
  from public, anon;
grant execute on function public.admin_process_commercial_invoice_overdue(date)
  to authenticated;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job
  where jobname = 'manohub-commercial-invoice-overdue'
  limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'manohub-commercial-invoice-overdue',
    '25 1 * * *',
    'select private.process_commercial_invoice_overdue(current_date);'
  );
end;
$$;

commit;
