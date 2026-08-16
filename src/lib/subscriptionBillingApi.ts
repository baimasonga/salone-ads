import { supabase } from './supabaseClient';

export interface SubscriptionBillingSummary {
  openInvoices: number;
  queuedCharges: number;
  failedCharges: number;
  receipts: number;
}

export async function fetchSubscriptionBillingSummary(): Promise<SubscriptionBillingSummary> {
  const [invoices, queued, failed, receipts] = await Promise.all([
    supabase.from('commercial_invoices').select('id', { count: 'exact', head: true }).eq('source_type', 'subscription').in('status', ['issued', 'partially_paid', 'overdue']),
    supabase.from('subscription_charge_attempts').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing']),
    supabase.from('subscription_charge_attempts').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('commercial_receipts').select('id', { count: 'exact', head: true }),
  ]);
  const error = invoices.error || queued.error || failed.error || receipts.error;
  if (error) throw error;
  return { openInvoices: invoices.count ?? 0, queuedCharges: queued.count ?? 0, failedCharges: failed.count ?? 0, receipts: receipts.count ?? 0 };
}

export async function processSubscriptionBilling(): Promise<{ invoicesCreated: number; chargesQueued: number }> {
  const { data, error } = await supabase.rpc('admin_process_subscription_billing', { p_as_of: new Date().toISOString().slice(0, 10) });
  if (error) throw error;
  return { invoicesCreated: Number((data as any)?.invoices_created ?? 0), chargesQueued: Number((data as any)?.charges_queued ?? 0) };
}
