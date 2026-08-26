import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/94_financial_documents.sql', 'utf8');
const server = readFileSync('server.ts', 'utf8');
const panel = readFileSync('src/modules/finance/FinancialDocumentsPanel.tsx', 'utf8');
const subscriberBilling = readFileSync('src/components/SubscriptionBillingPage.tsx', 'utf8');
const print = readFileSync('src/lib/financialDocumentPrint.ts', 'utf8');

describe('financial document lifecycle', () => {
  it('protects proformas with tenant RLS and restricted grants', () => {
    expect(migration).toContain('create table if not exists public.commercial_proformas');
    expect(migration).toContain('alter table public.commercial_proformas enable row level security');
    expect(migration).toContain('revoke all on public.commercial_proformas, public.commercial_proforma_lines from public, anon, authenticated');
    expect(migration).toContain('public.is_platform_admin() or public.is_org_member(org_id)');
  });

  it('supports admin issuance and controlled conversion into ledger invoices', () => {
    expect(migration).toContain('admin_create_commercial_proforma');
    expect(migration).toContain('admin_transition_commercial_proforma');
    expect(migration).toContain("if v_p.status not in ('issued','accepted')");
    expect(migration).toContain('insert into public.commercial_ledger_entries');
    expect(server).toContain("'billing.proforma.create'");
    expect(server).toContain("'billing.proforma.transition'");
  });

  it('exposes printable proformas, invoices and receipts to subscribers', () => {
    expect(panel).toContain('Proformas, invoices & receipts');
    expect(panel).toContain('printProforma(item)');
    expect(panel).toContain('printInvoice(item)');
    expect(panel).toContain('printReceipt(item,receipt)');
    expect(subscriberBilling).toContain('<FinancialDocumentsPanel orgId={activeOrg.id} />');
    expect(print).toContain('Print / Save as PDF');
  });
});
