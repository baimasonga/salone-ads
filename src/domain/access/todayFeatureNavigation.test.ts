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
  it('exposes the retained directory, billing, attribution and support operations to administrators', () => {
    const navigation = labels({ ...base, isPlatformAdmin: true, cmsRole: 'administrator' });
    expect(navigation).toEqual(expect.arrayContaining([
      'directory:Business Directory',
      'admin-subscriptions:Automated Subscription Billing',
      'campaign-performance:Performance & Attribution',
      'operations-hub:Customer Support Centre',
    ]));
  });

  it('has one support entry for administrators and preserves the restricted support-staff entry', () => {
    expect(labels({ ...base, isPlatformAdmin: true }).filter(label => label.includes('Customer Support Centre'))).toEqual(['operations-hub:Customer Support Centre']);
    expect(labels({ ...base, platformStaffRole: 'support' })).toContain('admin-services:Customer Support Centre');
    expect(labels({ ...base, platformStaffRole: 'support' })).not.toContain('operations-hub:Customer Support Centre');
  });

  it('omits retired features for every role', () => {
    for (const context of [base, { ...base, isPlatformAdmin: true }, ...(['finance', 'editorial', 'support', 'auditor'] as const).map(platformStaffRole => ({ ...base, platformStaffRole }))]) {
      expect(buildWorkspaceNavigation(context).flatMap(group => group.items.map(item => item.id))).not.toEqual(expect.arrayContaining(['influencers']));
      expect(buildWorkspaceNavigation(context).flatMap(group => group.items.map(item => item.id))).not.toEqual(expect.arrayContaining(['events']));
      expect(buildWorkspaceNavigation(context).flatMap(group => group.items.map(item => item.id))).not.toEqual(expect.arrayContaining(['tourism']));
    }
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
