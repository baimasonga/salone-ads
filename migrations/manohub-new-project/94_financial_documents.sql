-- Printable proforma, invoice and receipt document lifecycle.
begin;

create table if not exists public.commercial_proformas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  proforma_number text not null unique,
  currency_code text not null references public.currencies(code),
  status text not null default 'issued' check (status in ('draft','issued','accepted','converted','expired','void')),
  subtotal numeric(16,2) not null check (subtotal >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(16,2) generated always as (subtotal + tax_amount) stored,
  valid_until date not null,
  notes text,
  converted_invoice_id uuid references public.commercial_invoices(id) on delete restrict,
  issued_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_proforma_lines (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.commercial_proformas(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 2 and 500),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_amount numeric(16,2) not null check (unit_amount >= 0),
  line_total numeric(16,2) generated always as (quantity * unit_amount) stored,
  sort_order integer not null default 0 check (sort_order >= 0)
);

create index if not exists commercial_proformas_org_time_idx on public.commercial_proformas(org_id, issued_at desc);
create index if not exists commercial_proformas_status_valid_idx on public.commercial_proformas(status, valid_until);
create index if not exists commercial_proforma_lines_parent_idx on public.commercial_proforma_lines(proforma_id, sort_order);

alter table public.commercial_proformas enable row level security;
alter table public.commercial_proforma_lines enable row level security;
revoke all on public.commercial_proformas, public.commercial_proforma_lines from public, anon, authenticated;
grant select on public.commercial_proformas, public.commercial_proforma_lines to authenticated;

drop policy if exists commercial_proformas_read on public.commercial_proformas;
create policy commercial_proformas_read on public.commercial_proformas for select to authenticated
using (public.is_platform_admin() or public.is_org_member(org_id));

drop policy if exists commercial_proforma_lines_read on public.commercial_proforma_lines;
create policy commercial_proforma_lines_read on public.commercial_proforma_lines for select to authenticated
using (exists (
  select 1 from public.commercial_proformas p
  where p.id = proforma_id and (public.is_platform_admin() or public.is_org_member(p.org_id))
));

create or replace function public.admin_create_commercial_proforma(
  p_org_id uuid,
  p_currency_code text,
  p_valid_until date,
  p_notes text,
  p_tax_amount numeric,
  p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_number text;
  v_subtotal numeric(16,2);
  v_line jsonb;
  v_position integer := 0;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if not exists (select 1 from public.organizations where id = p_org_id and status = 'active') then
    raise exception 'An active customer organization is required';
  end if;
  if not exists (select 1 from public.currencies where code = upper(trim(p_currency_code))) then
    raise exception 'Unsupported currency';
  end if;
  if p_valid_until < current_date then raise exception 'Validity date cannot be in the past'; end if;
  if coalesce(p_tax_amount, 0) < 0 then raise exception 'Tax amount cannot be negative'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then
    raise exception 'Between 1 and 30 line items are required';
  end if;

  select sum((item->>'quantity')::numeric * (item->>'unit_amount')::numeric)
  into v_subtotal from jsonb_array_elements(p_lines) item;
  if v_subtotal is null or v_subtotal < 0 or v_subtotal > 1000000000 then
    raise exception 'Proforma subtotal is invalid';
  end if;

  v_number := 'PFI-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.commercial_proformas(
    org_id, proforma_number, currency_code, status, subtotal, tax_amount,
    valid_until, notes, created_by
  ) values (
    p_org_id, v_number, upper(trim(p_currency_code)), 'issued', v_subtotal,
    coalesce(p_tax_amount, 0), p_valid_until, nullif(left(trim(p_notes), 2000), ''), auth.uid()
  ) returning id into v_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if char_length(trim(v_line->>'description')) not between 2 and 500
      or (v_line->>'quantity')::numeric <= 0
      or (v_line->>'unit_amount')::numeric < 0 then
      raise exception 'A proforma line is invalid';
    end if;
    insert into public.commercial_proforma_lines(proforma_id, description, quantity, unit_amount, sort_order)
    values(v_id, trim(v_line->>'description'), (v_line->>'quantity')::numeric, (v_line->>'unit_amount')::numeric, v_position);
    v_position := v_position + 1;
  end loop;

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), p_org_id, 'billing.proforma_issued', 'commercial_proforma', v_id::text,
    jsonb_build_object('proforma_number', v_number, 'total', v_subtotal + coalesce(p_tax_amount,0), 'currency', upper(trim(p_currency_code))));
  return v_id;
end;
$$;
revoke all on function public.admin_create_commercial_proforma(uuid,text,date,text,numeric,jsonb) from public, anon;
grant execute on function public.admin_create_commercial_proforma(uuid,text,date,text,numeric,jsonb) to authenticated;

create or replace function public.admin_transition_commercial_proforma(p_proforma_id uuid, p_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.commercial_proformas;
  v_invoice_id uuid;
  v_invoice_number text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  select * into v_p from public.commercial_proformas where id = p_proforma_id for update;
  if not found then raise exception 'Proforma not found'; end if;

  if p_action = 'accept' then
    if v_p.status <> 'issued' then raise exception 'Only an issued proforma can be accepted'; end if;
    update public.commercial_proformas set status='accepted', accepted_at=now(), updated_at=now() where id=v_p.id;
  elsif p_action = 'void' then
    if v_p.status in ('converted','void') then raise exception 'This proforma can no longer be voided'; end if;
    update public.commercial_proformas set status='void', updated_at=now() where id=v_p.id;
  elsif p_action = 'convert' then
    if v_p.converted_invoice_id is not null then return v_p.converted_invoice_id; end if;
    if v_p.status not in ('issued','accepted') then raise exception 'Only an issued or accepted proforma can be converted'; end if;
    v_invoice_number := 'INV-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.commercial_invoices(
      org_id, invoice_number, source_type, source_id, currency_code, status,
      subtotal, tax_amount, due_at, created_by
    ) values (
      v_p.org_id, v_invoice_number, 'manual', v_p.id, v_p.currency_code, 'issued',
      v_p.subtotal, v_p.tax_amount, greatest(current_date, v_p.valid_until), auth.uid()
    ) returning id into v_invoice_id;
    insert into public.commercial_invoice_lines(invoice_id, description, quantity, unit_amount)
    select v_invoice_id, description, quantity, unit_amount
    from public.commercial_proforma_lines where proforma_id=v_p.id order by sort_order;
    insert into public.commercial_ledger_entries(
      org_id, entry_type, direction, amount, currency_code, reference_type,
      reference_id, description, actor_id, metadata
    ) values (
      v_p.org_id, 'invoice', 'debit', v_p.total_amount, v_p.currency_code,
      'commercial_invoice', v_invoice_id, 'Invoice converted from ' || v_p.proforma_number,
      auth.uid(), jsonb_build_object('proforma_id', v_p.id, 'proforma_number', v_p.proforma_number)
    );
    update public.commercial_proformas set status='converted', converted_invoice_id=v_invoice_id, updated_at=now() where id=v_p.id;
  else
    raise exception 'Unsupported proforma action';
  end if;

  insert into public.audit_logs(actor_id, org_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), v_p.org_id, 'billing.proforma_' || p_action, 'commercial_proforma', v_p.id::text,
    jsonb_build_object('proforma_number', v_p.proforma_number, 'invoice_id', v_invoice_id));
  return coalesce(v_invoice_id, v_p.id);
end;
$$;
revoke all on function public.admin_transition_commercial_proforma(uuid,text) from public, anon;
grant execute on function public.admin_transition_commercial_proforma(uuid,text) to authenticated;

update public.commercial_proformas set status='expired', updated_at=now()
where status='issued' and valid_until < current_date;

commit;
