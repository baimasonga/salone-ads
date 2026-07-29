-- Unified append-only ledger for subscriptions, advertising and managed services.
create table if not exists public.commercial_invoices (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete restrict,
  invoice_number text not null unique, source_type text not null check(source_type in ('subscription','advertising','managed_service','manual')),
  source_id uuid, currency_code text not null references public.currencies(code), status text not null default 'issued'
    check(status in ('draft','issued','partially_paid','paid','void','overdue')),
  subtotal numeric(16,2) not null check(subtotal>=0), tax_amount numeric(16,2) not null default 0 check(tax_amount>=0),
  total_amount numeric(16,2) generated always as (subtotal+tax_amount) stored,
  amount_paid numeric(16,2) not null default 0 check(amount_paid>=0), due_at date, issued_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.commercial_invoice_lines (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.commercial_invoices(id) on delete cascade,
  description text not null, quantity numeric(12,2) not null default 1 check(quantity>0), unit_amount numeric(16,2) not null check(unit_amount>=0),
  line_total numeric(16,2) generated always as (quantity*unit_amount) stored
);
create table if not exists public.commercial_payments (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete restrict,
  payment_reference text not null, method text not null check(method in ('bank_transfer','mobile_money','card','cash','credit')),
  currency_code text not null references public.currencies(code), amount numeric(16,2) not null check(amount>0),
  status text not null default 'verified' check(status in ('pending','verified','reversed')),
  received_at timestamptz not null default now(), verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), unique(org_id,payment_reference)
);
create table if not exists public.commercial_payment_allocations (
  payment_id uuid not null references public.commercial_payments(id) on delete restrict,
  invoice_id uuid not null references public.commercial_invoices(id) on delete restrict,
  amount numeric(16,2) not null check(amount>0), created_at timestamptz not null default now(),
  primary key(payment_id,invoice_id)
);
create table if not exists public.commercial_ledger_entries (
  id bigint generated always as identity primary key, org_id uuid not null references public.organizations(id) on delete restrict,
  entry_type text not null check(entry_type in ('invoice','payment','credit','refund','adjustment','reversal')),
  direction text not null check(direction in ('debit','credit')), amount numeric(16,2) not null check(amount>0),
  currency_code text not null references public.currencies(code), reference_type text not null, reference_id uuid,
  description text not null, occurred_at timestamptz not null default now(), actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists commercial_ledger_org_time_idx on public.commercial_ledger_entries(org_id,occurred_at desc);
create index if not exists commercial_invoices_status_due_idx on public.commercial_invoices(status,due_at);
alter table public.commercial_invoices enable row level security; alter table public.commercial_invoice_lines enable row level security;
alter table public.commercial_payments enable row level security; alter table public.commercial_payment_allocations enable row level security;
alter table public.commercial_ledger_entries enable row level security;
revoke all on public.commercial_invoices,public.commercial_invoice_lines,public.commercial_payments,public.commercial_payment_allocations,public.commercial_ledger_entries from public,anon,authenticated;
grant select on public.commercial_invoices,public.commercial_invoice_lines,public.commercial_payments,public.commercial_payment_allocations,public.commercial_ledger_entries to authenticated;
create policy commercial_invoices_read on public.commercial_invoices for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy commercial_payments_read on public.commercial_payments for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy commercial_ledger_read on public.commercial_ledger_entries for select to authenticated using(public.is_platform_admin() or public.is_org_member(org_id));
create policy commercial_lines_read on public.commercial_invoice_lines for select to authenticated using(exists(select 1 from public.commercial_invoices i where i.id=invoice_id and (public.is_platform_admin() or public.is_org_member(i.org_id))));
create policy commercial_allocations_read on public.commercial_payment_allocations for select to authenticated using(exists(select 1 from public.commercial_invoices i where i.id=invoice_id and (public.is_platform_admin() or public.is_org_member(i.org_id))));
create or replace function private.prevent_commercial_ledger_mutation() returns trigger language plpgsql security definer set search_path='' as $$ begin raise exception 'Commercial ledger entries are immutable'; end; $$;
revoke all on function private.prevent_commercial_ledger_mutation() from public,anon,authenticated;
create trigger commercial_ledger_immutable before update or delete on public.commercial_ledger_entries for each row execute function private.prevent_commercial_ledger_mutation();
create or replace function public.record_commercial_payment(p_invoice_id uuid,p_reference text,p_method text,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$ declare v_i public.commercial_invoices; v_payment uuid; v_paid numeric; begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
 select * into v_i from public.commercial_invoices where id=p_invoice_id for update; if not found then raise exception 'Invoice not found'; end if;
 if p_amount<=0 or v_i.amount_paid+p_amount>v_i.total_amount then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.commercial_payments(org_id,payment_reference,method,currency_code,amount,verified_by) values(v_i.org_id,trim(p_reference),p_method,v_i.currency_code,p_amount,auth.uid()) returning id into v_payment;
 insert into public.commercial_payment_allocations values(v_payment,v_i.id,p_amount,now());
 update public.commercial_invoices set amount_paid=amount_paid+p_amount,status=case when amount_paid+p_amount=total_amount then 'paid' else 'partially_paid' end where id=v_i.id;
 insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,actor_id) values(v_i.org_id,'payment','credit',p_amount,v_i.currency_code,'commercial_payment',v_payment,'Payment '||trim(p_reference),auth.uid());
 return v_payment; end; $$;
revoke all on function public.record_commercial_payment(uuid,text,text,numeric) from public,anon; grant execute on function public.record_commercial_payment(uuid,text,text,numeric) to authenticated;

