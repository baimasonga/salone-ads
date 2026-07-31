import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/63_commercial_billing_operations.sql'),
  'utf8',
);

describe('commercial billing operations', () => {
  it('tracks credits and refunds separately from immutable ledger entries', () => {
    expect(sql).toContain('commercial_credit_notes');
    expect(sql).toContain('commercial_refunds');
    expect(sql).toContain("'refund', 'debit'");
    expect(sql).toContain("'credit', 'credit'");
  });

  it('prevents overpayment, over-crediting and over-refunding', () => {
    expect(sql).toContain('Payment exceeds outstanding balance');
    expect(sql).toContain('Credit exceeds outstanding balance');
    expect(sql).toContain('Refund exceeds the refundable amount');
  });

  it('guards all billing mutations with platform-admin authorization', () => {
    expect(sql.match(/not public\.is_platform_admin\(\)/g)).toHaveLength(4);
    expect(sql).toContain('revoke all on function public.issue_commercial_credit');
    expect(sql).toContain('revoke all on function public.record_commercial_refund');
  });

  it('automates overdue status with notifications and audit evidence', () => {
    expect(sql).toContain('process_commercial_invoice_overdue');
    expect(sql).toContain("'billing.invoice_overdue'");
    expect(sql).toContain("'invoice-overdue:'");
    expect(sql).toContain("'manohub-commercial-invoice-overdue'");
  });
});
