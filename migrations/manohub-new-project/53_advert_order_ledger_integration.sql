-- Manohub: join advert sales to the financial ledger.
--
-- THE GAP THIS CLOSES
-- 14_advert_packages_and_payments.sql created self-serve advert purchasing
-- (advert_orders). 45/51 created the financial ledger (commercial_invoices,
-- commercial_payments, commercial_payment_allocations,
-- commercial_ledger_entries). Nothing connected them:
--
--   * no trigger or function referenced advert_orders outside migrations 14/15;
--   * nothing anywhere ran `insert into public.commercial_invoices`, so the
--     ledger had no inflow at all;
--   * orders were marked paid by a raw client-side UPDATE
--     (procurementApi.confirmAdvertOrder), which posted nothing, wrote no audit
--     trail, and generated the receipt number in the browser.
--
-- Result: every advert sale was invisible to the ledger, so revenue reporting
-- under-reported by the entire self-serve advertising business.
--
-- commercial_invoices was already designed to receive these rows — it has
-- source_type 'advertising' and a source_id column. This migration supplies the
-- missing link as a single atomic, admin-only, idempotent RPC.
--
-- Idempotent. Safe to run more than once.

begin;

-- Find an advert order's invoice quickly, and stop the same order being
-- invoiced twice even if two admins confirm concurrently.
create unique index if not exists commercial_invoices_advertising_source_uidx
  on public.commercial_invoices (source_id)
  where source_type = 'advertising' and source_id is not null;

create or replace function public.confirm_advert_order(
  p_order_id uuid,
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order       public.advert_orders;
  v_reference   text;
  v_receipt     text;
  v_invoice_id  uuid;
  v_payment_id  uuid;
  v_method      text;
begin
  -- Only platform administrators verify money in. Enforced in the function so
  -- the EXECUTE grant can stay broad, matching record_commercial_payment.
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;

  -- Lock the order so two concurrent confirmations cannot both post.
  select * into v_order
  from public.advert_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Advert order not found';
  end if;

  if v_order.status = 'paid' then
    raise exception 'Order % has already been confirmed', v_order.order_number;
  end if;

  if v_order.status not in ('pending_payment', 'payment_review') then
    raise exception 'Order % cannot be confirmed while it is %',
      v_order.order_number, v_order.status;
  end if;

  -- A paid order must carry a payment reference. Accept one supplied at
  -- confirmation time, otherwise require the buyer to have already provided it.
  v_reference := coalesce(nullif(trim(p_payment_reference), ''), v_order.payment_reference);
  if v_order.total_amount > 0 and v_reference is null then
    raise exception 'A payment reference is required to confirm order %', v_order.order_number;
  end if;

  -- commercial_invoices.currency_code is a foreign key to currencies;
  -- advert_orders.currency_code is not. Fail with something readable rather
  -- than a raw constraint violation.
  if not exists (select 1 from public.currencies where code = v_order.currency_code) then
    raise exception 'Order % uses currency %, which is not registered in public.currencies',
      v_order.order_number, v_order.currency_code;
  end if;

  -- The two tables use different payment-method vocabularies, and they do not
  -- overlap: advert_orders allows orange_money/afrimoney/mobile_money/card/
  -- agency_credit, while commercial_payments.method only allows bank_transfer/
  -- mobile_money/card/cash/credit. Passing the order's value straight through
  -- would violate the check constraint for three of the five methods.
  v_method := case v_order.payment_method
    when 'orange_money'  then 'mobile_money'
    when 'afrimoney'     then 'mobile_money'
    when 'mobile_money'  then 'mobile_money'
    when 'card'          then 'card'
    when 'agency_credit' then 'credit'
  end;
  if v_method is null then
    raise exception 'Payment method % on order % has no ledger equivalent',
      v_order.payment_method, v_order.order_number;
  end if;

  -- commercial_payments enforces unique(org_id, payment_reference). Fail with a
  -- readable message rather than a raw unique violation.
  if v_order.total_amount > 0 and exists (
    select 1 from public.commercial_payments
    where org_id = v_order.org_id and payment_reference = v_reference
  ) then
    raise exception 'Payment reference % has already been recorded for this organisation', v_reference;
  end if;

  -- Server-issued receipt number. Previously generated in the browser, which
  -- made a financial identifier client-controlled.
  v_receipt := 'RCT-' || to_char(now(), 'YYYY') || '-' ||
               upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  update public.advert_orders
  set status          = 'paid',
      payment_reference = v_reference,
      receipt_number  = v_receipt,
      paid_at         = now(),
      verified_by     = auth.uid(),
      updated_at      = now()
  where id = v_order.id;

  -- 1. Issue the invoice. total_amount on commercial_invoices is generated from
  --    subtotal + tax_amount, so only subtotal is supplied. The order's own
  --    invoice_number is reused so the two systems share one human reference.
  insert into public.commercial_invoices (
    org_id, invoice_number, source_type, source_id, currency_code,
    status, subtotal, tax_amount, issued_at, created_by
  ) values (
    v_order.org_id, v_order.invoice_number, 'advertising', v_order.id,
    v_order.currency_code, 'issued', v_order.total_amount, 0, now(), auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.commercial_invoice_lines (
    invoice_id, description, quantity, unit_amount
  )
  select
    v_invoice_id,
    coalesce(p.name, 'Advertising package') || ' (' || v_order.billing_period || ')',
    v_order.quantity,
    case when v_order.quantity > 0
      then round(v_order.total_amount / v_order.quantity, 2)
      else v_order.total_amount
    end
  from public.advert_packages p
  where p.id = v_order.package_id;

  insert into public.commercial_ledger_entries (
    org_id, entry_type, direction, amount, currency_code,
    reference_type, reference_id, description, actor_id, metadata
  ) values (
    v_order.org_id, 'invoice', 'debit', v_order.total_amount, v_order.currency_code,
    'commercial_invoice', v_invoice_id,
    'Advertising invoice ' || v_order.invoice_number, auth.uid(),
    jsonb_build_object('advert_order_id', v_order.id, 'order_number', v_order.order_number)
  );

  -- 2. Settle it. A zero-value order (fully discounted or a comped package) is
  --    invoiced and marked paid without a payment row.
  if v_order.total_amount > 0 then
    insert into public.commercial_payments (
      org_id, payment_reference, method, currency_code, amount, verified_by
    ) values (
      v_order.org_id, v_reference, v_method,
      v_order.currency_code, v_order.total_amount, auth.uid()
    )
    returning id into v_payment_id;

    insert into public.commercial_payment_allocations (
      payment_id, invoice_id, amount, created_at
    ) values (
      v_payment_id, v_invoice_id, v_order.total_amount, now()
    );

    insert into public.commercial_ledger_entries (
      org_id, entry_type, direction, amount, currency_code,
      reference_type, reference_id, description, actor_id, metadata
    ) values (
      v_order.org_id, 'payment', 'credit', v_order.total_amount, v_order.currency_code,
      'commercial_payment', v_payment_id,
      'Advertising payment ' || v_reference, auth.uid(),
      jsonb_build_object('advert_order_id', v_order.id, 'receipt_number', v_receipt)
    );
  end if;

  update public.commercial_invoices
  set amount_paid = v_order.total_amount,
      status      = 'paid'
  where id = v_invoice_id;

  return v_invoice_id;
end;
$function$;

revoke all on function public.confirm_advert_order(uuid, text) from public, anon;
grant execute on function public.confirm_advert_order(uuid, text) to authenticated;

-- Confirmation now happens only through the RPC above. Organisations keep the
-- narrow UPDATE that lets a buyer move their own order from 'pending_payment'
-- to 'payment_review' after paying (policy advert_orders_org_update_reference
-- from migration 14); that is unchanged.
--
-- Backfill note: any order already sitting in 'paid' before this migration has
-- no invoice and no ledger entries. Those cannot be reconstructed
-- automatically, because the receipt number, verifier and payment timestamp
-- were written client-side. Reconcile them manually:
--
--   select o.order_number, o.invoice_number, o.total_amount, o.currency_code,
--          o.paid_at, o.payment_reference
--   from public.advert_orders o
--   left join public.commercial_invoices i
--     on i.source_type = 'advertising' and i.source_id = o.id
--   where o.status = 'paid' and i.id is null
--   order by o.paid_at;

commit;

-- Verification:
--
--   -- every paid order should have exactly one invoice
--   select count(*) as paid_orders_without_invoice
--   from public.advert_orders o
--   left join public.commercial_invoices i
--     on i.source_type = 'advertising' and i.source_id = o.id
--   where o.status = 'paid' and i.id is null;
--
--   -- ledger should balance against invoiced advertising revenue
--   select
--     (select coalesce(sum(total_amount), 0) from public.commercial_invoices
--        where source_type = 'advertising')                        as invoiced,
--     (select coalesce(sum(amount), 0) from public.commercial_ledger_entries
--        where entry_type = 'invoice'
--          and reference_type = 'commercial_invoice')              as ledger_debits;
