import { supabase } from './supabaseClient';
import { executeBackendCommand } from './commandApi';

export interface FinanceLine { description: string; quantity: number; unitAmount: number; total: number }
export interface FinanceReceipt { id: string; number: string; type: 'payment' | 'refund'; amount: number; currency: string; issuedAt: string }
export interface FinancePayment { id: string; reference: string; amount: number; refunded: number; status: string }
export interface FinanceInvoice {
  id: string; orgId: string; number: string; orgName: string; sourceType: string; currency: string;
  subtotal: number; tax: number; total: number; paid: number; credited: number; outstanding: number;
  status: string; dueAt: string | null; issuedAt: string; lines: FinanceLine[];
  payments: FinancePayment[]; receipts: FinanceReceipt[];
}
export interface FinanceProforma {
  id: string; orgId: string; number: string; orgName: string; currency: string; subtotal: number;
  tax: number; total: number; status: string; validUntil: string; issuedAt: string; notes: string;
  convertedInvoiceId: string | null; lines: FinanceLine[];
}
export interface FinanceOrganization { id: string; name: string; planName: string; subscriptionStatus: string }
export interface ProformaLineInput { description: string; quantity: number; unitAmount: number }

export async function fetchFinanceInvoices(orgId?: string): Promise<FinanceInvoice[]> {
  let query = supabase.from('commercial_invoices').select('id,org_id,invoice_number,source_type,currency_code,subtotal,tax_amount,total_amount,amount_paid,amount_credited,status,due_at,issued_at,organizations(name),commercial_invoice_lines(description,quantity,unit_amount,line_total),commercial_payment_allocations(commercial_payments(id,payment_reference,amount,refunded_amount,status)),commercial_receipts(id,receipt_number,receipt_type,amount,currency_code,issued_at)').order('issued_at', { ascending: false });
  if (orgId) query = query.eq('org_id', orgId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const total = Number(row.total_amount), paid = Number(row.amount_paid), credited = Number(row.amount_credited ?? 0);
    return {
      id: row.id, orgId: row.org_id, number: row.invoice_number, orgName: row.organizations?.name ?? 'Unknown', sourceType: row.source_type,
      currency: row.currency_code, subtotal: Number(row.subtotal), tax: Number(row.tax_amount), total, paid, credited,
      outstanding: Math.max(0, total - paid - credited), status: row.status, dueAt: row.due_at, issuedAt: row.issued_at,
      lines: (row.commercial_invoice_lines ?? []).map((line: any) => ({ description: line.description, quantity: Number(line.quantity), unitAmount: Number(line.unit_amount), total: Number(line.line_total) })),
      payments: (row.commercial_payment_allocations ?? []).map((allocation: any) => allocation.commercial_payments).filter(Boolean).map((payment: any) => ({ id: payment.id, reference: payment.payment_reference, amount: Number(payment.amount), refunded: Number(payment.refunded_amount ?? 0), status: payment.status })),
      receipts: (row.commercial_receipts ?? []).map((receipt: any) => ({ id: receipt.id, number: receipt.receipt_number, type: receipt.receipt_type, amount: Number(receipt.amount), currency: receipt.currency_code, issuedAt: receipt.issued_at })),
    };
  });
}

export async function fetchFinanceProformas(orgId?: string): Promise<FinanceProforma[]> {
  let query = supabase.from('commercial_proformas').select('id,org_id,proforma_number,currency_code,subtotal,tax_amount,total_amount,status,valid_until,issued_at,notes,converted_invoice_id,organizations(name),commercial_proforma_lines(description,quantity,unit_amount,line_total,sort_order)').order('issued_at', { ascending: false });
  if (orgId) query = query.eq('org_id', orgId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id, orgId: row.org_id, number: row.proforma_number, orgName: row.organizations?.name ?? 'Unknown', currency: row.currency_code,
    subtotal: Number(row.subtotal), tax: Number(row.tax_amount), total: Number(row.total_amount), status: row.status,
    validUntil: row.valid_until, issuedAt: row.issued_at, notes: row.notes ?? '', convertedInvoiceId: row.converted_invoice_id,
    lines: (row.commercial_proforma_lines ?? []).sort((a: any,b: any) => a.sort_order-b.sort_order).map((line: any) => ({ description: line.description, quantity: Number(line.quantity), unitAmount: Number(line.unit_amount), total: Number(line.line_total) })),
  }));
}

export async function fetchFinanceOrganizations(): Promise<FinanceOrganization[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('org_id,status,created_at,organizations!inner(id,name,status),plans(name)')
    .in('status', ['trialing', 'active', 'past_due', 'grace_period', 'suspended'])
    .eq('organizations.status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const customers = new Map<string, FinanceOrganization>();
  for (const row of data ?? []) {
    const organization = (row as any).organizations;
    if (organization && !customers.has(organization.id)) customers.set(organization.id, {
      id: organization.id,
      name: organization.name,
      planName: (row as any).plans?.name ?? 'Subscription',
      subscriptionStatus: (row as any).status,
    });
  }
  return [...customers.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function createFinanceProforma(input: { orgId: string; currencyCode: string; validUntil: string; notes: string; taxAmount: number; lines: ProformaLineInput[] }) { return executeBackendCommand<string>('billing.proforma.create', input); }
export async function createFinanceInvoice(input: { orgId: string; currencyCode: string; dueAt: string; notes: string; taxAmount: number; lines: ProformaLineInput[] }) { return executeBackendCommand<string>('billing.invoice.create', input); }
export async function transitionFinanceProforma(proformaId: string, action: 'accept'|'convert'|'void') { return executeBackendCommand<string>('billing.proforma.transition', { proformaId, action }); }
export async function recordFinancePayment(invoiceId: string, reference: string, method: string, amount: number) { await executeBackendCommand('billing.payment.record', { invoiceId, reference, method, amount }); }
export async function issueFinanceCredit(invoiceId: string, creditNumber: string, amount: number, reason: string) { await executeBackendCommand('billing.credit.issue', { invoiceId, creditNumber, amount, reason }); }
export async function recordFinanceRefund(paymentId: string, refundReference: string, amount: number, reason: string) { await executeBackendCommand('billing.refund.record', { paymentId, refundReference, amount, reason }); }
export async function processOverdueInvoices(): Promise<number> { const { data, error } = await supabase.rpc('admin_process_commercial_invoice_overdue'); if (error) throw error; return Number(data ?? 0); }
