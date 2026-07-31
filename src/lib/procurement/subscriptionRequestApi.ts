import { supabase } from '../supabaseClient';

// --- Subscriptions & billing ---

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currencyCode: string;
}

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('id, code, name, description, monthly_price, annual_price, currency_code')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    monthlyPrice: row.monthly_price !== null ? Number(row.monthly_price) : null,
    annualPrice: row.annual_price !== null ? Number(row.annual_price) : null,
    currencyCode: row.currency_code,
  }));
}

export interface OrgSubscription {
  id: string;
  planCode: string;
  planName: string;
  status: string;
  billingCycle: string;
  paymentMethod: string;
  notes: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export async function fetchMySubscriptions(orgId: string): Promise<OrgSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, billing_cycle, payment_method, notes, current_period_end, created_at, plans(code, name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    planCode: row.plans?.code ?? '',
    planName: row.plans?.name ?? 'Unknown plan',
    status: row.status,
    billingCycle: row.billing_cycle,
    paymentMethod: row.payment_method,
    notes: row.notes,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  }));
}

export async function requestSubscription(orgId: string, planId: string, billingCycle: 'monthly' | 'annual', notes: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').insert({
    org_id: orgId,
    plan_id: planId,
    billing_cycle: billingCycle,
    payment_method: 'manual_bank_transfer',
    notes,
  });
  if (error) throw error;
}

export async function updateSubscriptionNotes(subscriptionId: string, notes: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ notes }).eq('id', subscriptionId);
  if (error) throw error;
}

export interface PendingSubscription extends OrgSubscription {
  orgId: string;
  orgName: string;
}

export async function fetchPendingSubscriptions(): Promise<PendingSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, billing_cycle, payment_method, notes, current_period_end, created_at, org_id, plans(code, name), organizations(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    planCode: row.plans?.code ?? '',
    planName: row.plans?.name ?? 'Unknown plan',
    status: row.status,
    billingCycle: row.billing_cycle,
    paymentMethod: row.payment_method,
    notes: row.notes,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
    orgId: row.org_id,
    orgName: row.organizations?.name ?? 'Unknown organization',
  }));
}

export async function activateSubscription(subscriptionId: string, billingCycle: 'monthly' | 'annual'): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const periodEnd = new Date();
  if (billingCycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq('id', subscriptionId);
  if (error) throw error;
}

export async function cancelSubscriptionRequest(subscriptionId: string, note: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ status: 'cancelled', notes: note }).eq('id', subscriptionId);
  if (error) throw error;
}

