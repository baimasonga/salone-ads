import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/53_advert_order_ledger_integration.sql'),
  'utf8',
);
const orders = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/14_advert_packages_and_payments.sql'),
  'utf8',
);
const ledger = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/45_platform_financial_ledger.sql'),
  'utf8',
);

describe('advert order to ledger integration', () => {
  it('runs atomically', () => {
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('restricts confirmation to platform administrators', () => {
    expect(sql).toContain('confirm_advert_order');
    expect(sql).toContain('not public.is_platform_admin()');
    expect(sql).toContain('revoke all on function public.confirm_advert_order(uuid, text) from public, anon;');
  });

  it('locks the order so concurrent confirmations cannot both post', () => {
    expect(sql).toContain('for update');
    expect(sql).toMatch(/has already been confirmed/);
  });

  it('issues an invoice against the order and posts both ledger legs', () => {
    expect(sql).toContain('insert into public.commercial_invoices');
    expect(sql).toContain("'advertising'");
    expect(sql).toContain('insert into public.commercial_invoice_lines');
    expect(sql).toContain("'invoice', 'debit'");
    expect(sql).toContain("'payment', 'credit'");
  });

  it('prevents the same order being invoiced twice', () => {
    expect(sql).toContain('commercial_invoices_advertising_source_uidx');
  });

  it('issues the receipt number server-side', () => {
    expect(sql).toContain('gen_random_uuid()');
    expect(sql).toMatch(/v_receipt\s*:=/);
  });

  // Regression guard: advert_orders.payment_method and
  // commercial_payments.method use different, non-overlapping vocabularies.
  // Passing the order's value straight through violates the check constraint
  // for orange_money, afrimoney and agency_credit.
  it('maps every advert payment method to a ledger method', () => {
    const orderMethods = orders.match(/payment_method\s+text\s+not\s+null\s+check\s*\(\s*payment_method\s+in\s*\(([^)]+)\)/);
    const ledgerMethods = ledger.match(/\bmethod\s+text\s+not\s+null\s+check\s*\(\s*method\s+in\s*\(([^)]+)\)/);
    expect(orderMethods).not.toBeNull();
    expect(ledgerMethods).not.toBeNull();

    const parse = (m: RegExpMatchArray) =>
      Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map((x) => x[1]);
    const allowedLedger = new Set(parse(ledgerMethods!));

    for (const method of parse(orderMethods!)) {
      const mapping = sql.match(new RegExp(`when '${method}'\\s*then '([a-z_]+)'`));
      expect(mapping, `no mapping for advert payment method '${method}'`).not.toBeNull();
      expect(
        allowedLedger.has(mapping![1]),
        `'${method}' maps to '${mapping![1]}', which commercial_payments.method rejects`,
      ).toBe(true);
    }
  });

  it('fails readably instead of hitting raw constraint violations', () => {
    expect(sql).toContain('not registered in public.currencies');
    expect(sql).toContain('has already been recorded for this organisation');
    expect(sql).toContain('has no ledger equivalent');
  });

  it('documents how to reconcile orders paid before this migration', () => {
    expect(sql).toContain('paid_orders_without_invoice');
  });
});
