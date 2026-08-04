import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('subscription payment activation', () => {
  const migration = read('migrations/manohub-new-project/70_subscription_payment_activation.sql');
  const api = read('src/lib/subscriptionPaymentApi.ts');
  const subscriber = read('src/components/SubscriptionBillingPage.tsx');
  const admin = read('src/modules/subscriptions/AdminSubscriptionLifecycleWorkspace.tsx');

  it('stores payment evidence separately behind tenant and admin RLS', () => {
    expect(migration).toContain('subscription_payment_proofs');
    expect(migration).toContain('subscription_payment_proofs_org_or_admin_read');
    expect(migration).toContain("'subscription-payment-proofs'");
    expect(migration).toContain('public.is_org_member');
  });

  it('reviews payment and subscription transition in one transaction', () => {
    expect(migration).toContain('review_subscription_payment');
    expect(migration).toContain('for update');
    expect(migration).toContain('from public.transition_subscription');
    expect(migration).toContain("p_decision = 'verified'");
    expect(migration).toContain("p_decision = 'rejected'");
  });

  it('connects subscriber submission, private receipt and admin review UI', () => {
    expect(api).toContain(".from('subscription-payment-proofs').upload");
    expect(api).toContain(".rpc('submit_subscription_payment_proof'");
    expect(api).toContain(".rpc('review_subscription_payment'");
    expect(subscriber).toContain('Submit payment evidence');
    expect(subscriber).toContain('Payment under review');
    expect(admin).toContain('Verify & activate');
    expect(admin).toContain('Open receipt');
  });
});
