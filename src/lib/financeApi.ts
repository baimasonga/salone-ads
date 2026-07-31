import { supabase } from './supabaseClient';
export interface FinancePayment {
  id: string;
  reference: string;
  amount: number;
  refunded: number;
  status: string;
}

export interface FinanceInvoice {
  id: string;
  number: string;
  orgName: string;
  sourceType: string;
  currency: string;
  total: number;
  paid: number;
  credited: number;
  outstanding: number;
  status: string;
  dueAt: string | null;
  payments: FinancePayment[];
}

export async function fetchFinanceInvoices(): Promise<FinanceInvoice[]> {
  const { data, error } = await supabase
    .from('commercial_invoices')
    .select('id,invoice_number,source_type,currency_code,total_amount,amount_paid,amount_credited,status,due_at,organizations(name),commercial_payment_allocations(commercial_payments(id,payment_reference,amount,refunded_amount,status))')
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const total = Number(row.total_amount);
    const paid = Number(row.amount_paid);
    const credited = Number(row.amount_credited ?? 0);
    const payments = (row.commercial_payment_allocations ?? [])
      .map((allocation: any) => allocation.commercial_payments)
      .filter(Boolean)
      .map((payment: any) => ({
        id: payment.id,
        reference: payment.payment_reference,
        amount: Number(payment.amount),
        refunded: Number(payment.refunded_amount ?? 0),
        status: payment.status,
      }));
    return {
      id: row.id,
      number: row.invoice_number,
      orgName: row.organizations?.name ?? 'Unknown',
      sourceType: row.source_type,
      currency: row.currency_code,
      total,
      paid,
      credited,
      outstanding: Math.max(0, total - paid - credited),
      status: row.status,
      dueAt: row.due_at,
      payments,
    };
  });
}

export async function recordFinancePayment(
  invoiceId: string,
  reference: string,
  method: string,
  amount: number,
) {
  const { error } = await supabase.rpc('record_commercial_payment', {
    p_invoice_id: invoiceId,
    p_reference: reference,
    p_method: method,
    p_amount: amount,
  });
  if (error) throw error;
}

export async function issueFinanceCredit(
  invoiceId: string,
  creditNumber: string,
  amount: number,
  reason: string,
) {
  const { error } = await supabase.rpc('issue_commercial_credit', {
    p_invoice_id: invoiceId,
    p_credit_number: creditNumber,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function recordFinanceRefund(
  paymentId: string,
  refundReference: string,
  amount: number,
  reason: string,
) {
  const { error } = await supabase.rpc('record_commercial_refund', {
    p_payment_id: paymentId,
    p_refund_reference: refundReference,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function processOverdueInvoices(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_process_commercial_invoice_overdue');
  if (error) throw error;
  return Number(data ?? 0);
}
