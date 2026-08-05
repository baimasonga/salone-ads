import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('registration subscriber type boundary', () => {
  it('selects the subscriber type once and persists it through atomic onboarding', () => {
    const auth = read('src/components/AuthScreens.tsx');
    const api = read('src/lib/api.ts');
    expect(auth).not.toContain('subscriber_type: subscriberType');
    expect(api).toContain("rpc('create_subscriber_organization'");
    expect(auth).toContain('SUBSCRIBER_TYPES.map');
    expect(auth).toContain('subscriberDetails: subscriberType');
    expect(auth).toContain("subscriberType === 'advertiser'");
  });

  it('stores durable subscriber identity and creates the matching profile and subscription state', () => {
    const migration = read('migrations/manohub-new-project/72_subscriber_workspace_profiles.sql');
    expect(migration).toContain("subscriber_type in ('free', 'viewer', 'publisher', 'advertiser')");
    expect(migration).toContain("v_type = 'viewer', v_type = 'publisher'");
    expect(migration).toContain('insert into public.supplier_profiles');
    expect(migration).toContain('insert into public.buyer_profiles');
    expect(migration).toContain("case when v_type = 'free' then 'active' else 'pending' end");
    expect(migration).toContain('grant execute on function public.update_subscriber_organization_profile');
  });

  it('routes each subscriber to an appropriate overview and editable profile', () => {
    const resolver = read('src/components/WorkspaceRouteResolver.tsx');
    const navigation = read('src/config/workspaceNavigation.ts');
    const profile = read('src/components/OrganizationProfilePage.tsx');
    expect(resolver).toContain("activeOrg.subscriberType === 'advertiser'");
    expect(resolver).toContain('<AdvertisingSubscriberOverview');
    expect(resolver).toContain("activeTab === 'org-profile'");
    expect(navigation).toContain('subscriber.profileLabel');
    expect(profile).toContain("org.subscriberType === 'viewer'");
    expect(profile).toContain("org.subscriberType === 'publisher'");
    expect(profile).toContain("org.subscriberType === 'advertiser'");
    expect(profile).toContain("org.subscriberType === 'free'");
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
