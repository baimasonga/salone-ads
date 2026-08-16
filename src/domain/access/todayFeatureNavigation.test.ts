import { describe, expect, it } from 'vitest';
import { buildWorkspaceNavigation } from '../../config/workspaceNavigation';
import type { AccessContext } from './policy';

const base: AccessContext = {
  isPlatformAdmin: false,
  cmsRole: null,
  features: new Set(['business_advertising']),
  organizationType: 'Business',
  subscriberType: 'viewer',
};
const labels = (context: AccessContext) => buildWorkspaceNavigation(context).flatMap(group => group.items.map(item => `${item.id}:${item.label}`));

describe('today feature navigation', () => {
  it('exposes internal marketplace, tourism, billing, attribution and support operations to administrators', () => {
    const navigation = labels({ ...base, isPlatformAdmin: true, cmsRole: 'administrator' });
    expect(navigation).toEqual(expect.arrayContaining([
      'directory:Business Directory',
      'influencers:Influencer Marketplace',
      'events:Events Management',
      'tourism:Tourism Management',
      'admin-subscriptions:Automated Subscription Billing',
      'campaign-performance:Performance & Attribution',
      'admin-services:Customer Support Centre',
    ]));
  });

  it('makes subscriber intelligence, recommendations, attribution, billing and support discoverable', () => {
    expect(labels(base)).toEqual(expect.arrayContaining([
      'tenders:Tenders & Document Intelligence',
      'pipeline:Pipeline & Recommendations',
      'campaign-performance:Performance & Attribution',
      'billing:Billing & Renewals',
      'services:Customer Support Centre',
    ]));
  });
});
