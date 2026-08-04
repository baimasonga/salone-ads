import { supabase } from './supabaseClient';

export type SubscriptionPaymentMethod = 'bank_transfer' | 'mobile_money';
export type SubscriptionPaymentStatus = 'pending' | 'verified' | 'rejected';

export interface SubscriptionPaymentProof {
  id: string;
  subscriptionId: string;
  orgId: string;
  orgName: string;
  planName: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentReference: string;
  amount: number | null;
  currencyCode: string;
  payerName: string | null;
  receiptObjectPath: string | null;
  status: SubscriptionPaymentStatus;
  reviewNote: string | null;
  createdAt: string;
}

const PROOF_FIELDS = 'id, subscription_id, org_id, payment_method, payment_reference, amount, currency_code, payer_name, receipt_object_path, status, review_note, created_at, organizations(name), subscriptions(plans(name))';

function mapProof(row: any): SubscriptionPaymentProof {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    orgId: row.org_id,
    orgName: row.organizations?.name ?? 'Unknown organization',
    planName: row.subscriptions?.plans?.name ?? 'Unknown plan',
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    amount: row.amount == null ? null : Number(row.amount),
    currencyCode: row.currency_code,
    payerName: row.payer_name ?? null,
    receiptObjectPath: row.receipt_object_path ?? null,
    status: row.status,
    reviewNote: row.review_note ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchSubscriptionPaymentProof(subscriptionId: string): Promise<SubscriptionPaymentProof | null> {
  const { data, error } = await supabase.from('subscription_payment_proofs').select(PROOF_FIELDS)
    .eq('subscription_id', subscriptionId).maybeSingle();
  if (error) throw error;
  return data ? mapProof(data) : null;
}

export async function fetchPendingSubscriptionPaymentProofs(): Promise<SubscriptionPaymentProof[]> {
  const { data, error } = await supabase.from('subscription_payment_proofs').select(PROOF_FIELDS)
    .eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProof);
}

export async function uploadSubscriptionReceipt(orgId: string, subscriptionId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${orgId}/${subscriptionId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('subscription-payment-proofs').upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function submitSubscriptionPaymentProof(input: {
  subscriptionId: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentReference: string;
  amount: number | null;
  payerName: string;
  receiptObjectPath: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_subscription_payment_proof', {
    p_subscription_id: input.subscriptionId,
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference.trim(),
    p_amount: input.amount,
    p_payer_name: input.payerName.trim() || null,
    p_receipt_object_path: input.receiptObjectPath,
  });
  if (error) throw error;
}

export async function createSubscriptionReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('subscription-payment-proofs').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewSubscriptionPayment(proofId: string, decision: 'verified' | 'rejected', note: string): Promise<void> {
  const { error } = await supabase.rpc('review_subscription_payment', {
    p_proof_id: proofId,
    p_decision: decision,
    p_review_note: note.trim() || null,
  });
  if (error) throw error;
}
