import { supabase } from './supabaseClient';
import { executeBackendCommand } from './commandApi';

export type SubscriptionStatus =
  | 'pending' | 'trialing' | 'active' | 'past_due' | 'grace_period'
  | 'suspended' | 'cancelled' | 'expired';

export type SubscriptionAction =
  | 'start_trial' | 'activate' | 'renew' | 'mark_past_due' | 'start_grace'
  | 'suspend' | 'resume' | 'schedule_cancel' | 'cancel' | 'expire';

export interface ManagedSubscription {
  id: string;
  orgId: string;
  orgName: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: 'monthly' | 'annual';
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  suspensionReason: string | null;
  billingContactEmail: string | null;
  createdAt: string;
}

export async function fetchManagedSubscriptions(): Promise<ManagedSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, org_id, status, billing_cycle, current_period_end, trial_ends_at, grace_ends_at, cancel_at_period_end, suspension_reason, billing_contact_email, created_at, plans(name), organizations(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    orgName: row.organizations?.name ?? 'Unknown organization',
    planName: row.plans?.name ?? 'Unknown plan',
    status: row.status,
    billingCycle: row.billing_cycle,
    currentPeriodEnd: row.current_period_end,
    trialEndsAt: row.trial_ends_at,
    graceEndsAt: row.grace_ends_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    suspensionReason: row.suspension_reason,
    billingContactEmail: row.billing_contact_email,
    createdAt: row.created_at,
  }));
}

export async function transitionSubscription(
  subscriptionId: string,
  action: SubscriptionAction,
  reason = '',
): Promise<void> {
  await executeBackendCommand('subscription.transition', { subscriptionId, action, reason });
}
