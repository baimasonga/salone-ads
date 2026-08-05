import { supabase } from './supabaseClient';

export type BackendCommand =
  | 'organization.invite' | 'organization.transition' | 'organization.recovery.decide' | 'organization.purge'
  | 'subscription.transition' | 'advertising.order.create'
  | 'organization.verification.approve' | 'procurement.ingestion.promote'
  | 'billing.payment.record' | 'billing.credit.issue' | 'billing.refund.record';

export async function executeBackendCommand<T = unknown>(command: BackendCommand, payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const response = await fetch('/api/commands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ command, payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'The command could not be completed.');
  return body.result as T;
}
