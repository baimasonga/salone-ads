import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/42_subscription_lifecycle_foundation.sql'),
  'utf8',
);
const grantHardening = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/43_subscription_event_grant_hardening.sql'),
  'utf8',
);

describe('subscription lifecycle foundation', () => {
  it('defines the complete commercial lifecycle and one current subscription per organization', () => {
    for (const status of ['trialing', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled', 'expired']) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain('subscriptions_one_current_per_org_idx');
    expect(migration).toContain('cancel_at_period_end');
    expect(migration).toContain('billing_contact_email');
  });

  it('moves lifecycle transitions behind an authenticated administrator RPC', () => {
    expect(migration).toContain('create or replace function public.transition_subscription');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('not public.is_platform_admin()');
    expect(migration).toContain('revoke all on function public.transition_subscription');
    expect(migration).toContain('grant execute on function public.transition_subscription');
  });

  it('keeps an immutable event history and notifies organization administrators', () => {
    expect(migration).toContain('create table if not exists public.subscription_events');
    expect(migration).toContain('revoke insert, update, delete, truncate on public.subscription_events');
    expect(migration).toContain("event_type := 'renewed'");
    expect(migration).toContain("om.role in ('owner', 'admin')");
    expect(grantHardening).toContain('revoke all on table public.subscription_events from public, anon, authenticated');
    expect(grantHardening).toContain('grant select on table public.subscription_events to authenticated');
  });

  it('limits browser updates to billing details rather than lifecycle fields', () => {
    expect(migration).toContain('revoke update on public.subscriptions from authenticated');
    expect(migration).toContain('grant update (notes, billing_contact_name, billing_contact_email)');
  });
});
