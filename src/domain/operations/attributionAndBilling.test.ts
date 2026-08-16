import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('complete attribution and automated subscription billing', () => {
  it('captures campaign parameters and reports attributed outcomes', () => {
    const api = read('src/lib/advertAnalytics.ts');
    const migration = read('migrations/manohub-new-project/92_complete_advert_attribution.sql');
    expect(api).toContain('utm_campaign');
    expect(api).toContain('get_advert_attribution');
    expect(migration).toContain('first_touch_event_id');
    expect(migration).toContain('last_touch_event_id');
  });

  it('creates invoices, queues collections, retries failures and issues receipts', () => {
    const migration = read('migrations/manohub-new-project/93_automated_subscription_billing.sql');
    expect(migration).toContain('subscription_charge_attempts');
    expect(migration).toContain('process_subscription_billing');
    expect(migration).toContain("status='failed'");
    expect(migration).toContain('commercial_receipts');
  });

  it('exposes billing operations in the subscription administration workspace', () => {
    const workspace = read('src/modules/subscriptions/AdminSubscriptionLifecycleWorkspace.tsx');
    expect(workspace).toContain('Automated subscription billing');
    expect(workspace).toContain('Run billing now');
  });
});
