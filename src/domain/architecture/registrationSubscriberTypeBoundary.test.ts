import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('registration subscriber type boundary', () => {
  it('persists the selection through auth metadata and atomic onboarding', () => {
    const auth = read('src/components/AuthScreens.tsx');
    const api = read('src/lib/api.ts');
    expect(auth).toContain('subscriber_type: subscriberType');
    expect(api).toContain("rpc('create_subscriber_organization'");
    expect(auth).toContain('SUBSCRIBER_TYPES.map');
  });

  it('keeps advertiser entitlements separate from tender publishing', () => {
    const migration = read('migrations/manohub-new-project/68_registration_subscriber_types.sql');
    expect(migration).toContain("'advertiser'");
    expect(migration).toContain("('business_advertising', 'Business Advertising Requests', 1)");
    expect(migration).toContain("('tender_publishing', 'Publish Tenders', 0)");
    expect(migration).toContain("'pending', 'monthly', 'manual_bank_transfer'");
  });

  it('expands the organization row before assigning the composite result', () => {
    const migration = read('migrations/manohub-new-project/69_fix_subscriber_organization_composite_assignment.sql');
    expect(migration).toContain('select *\n  into new_org\n  from public.create_organization');
    expect(migration).not.toContain('select public.create_organization');
  });
});
