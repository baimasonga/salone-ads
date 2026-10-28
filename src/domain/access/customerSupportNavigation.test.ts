import { describe, expect, it } from 'vitest';
import { buildWorkspaceNavigation, isWorkspaceNavigationItemActive } from '../../config/workspaceNavigation';
import type { AccessContext } from './policy';

const context = (subscriberType: AccessContext['subscriberType']): AccessContext => ({
  isPlatformAdmin: false,
  cmsRole: null,
  features: new Set(),
  organizationType: 'Business',
  subscriberType,
});

const items = (access: AccessContext) => buildWorkspaceNavigation(access).flatMap(group => group.items);

describe('customer support centre navigation', () => {
  it.each(['free', 'viewer', 'publisher', 'advertiser'] as const)('is visible to %s customers', subscriberType => {
    expect(items(context(subscriberType))).toContainEqual(expect.objectContaining({ id: 'services', label: 'Customer Support Centre' }));
  });

  it('highlights the support centre while working in its operational subviews', () => {
    expect(isWorkspaceNavigationItemActive('operations-hub', 'admin-verification')).toBe(true);
    expect(isWorkspaceNavigationItemActive('operations-hub', 'admin-services')).toBe(true);
    expect(isWorkspaceNavigationItemActive('operations-hub', 'admin-finance')).toBe(false);
    expect(isWorkspaceNavigationItemActive('admin-services', 'admin-services')).toBe(true);
  });

  it('is visible to platform administrators and support staff', () => {
    expect(items({ ...context('viewer'), isPlatformAdmin: true, cmsRole: 'administrator' }))
      .toContainEqual(expect.objectContaining({ id: 'operations-hub', label: 'Customer Support Centre' }));
    expect(items({ ...context('viewer'), platformStaffRole: 'support' }))
      .toContainEqual(expect.objectContaining({ id: 'admin-services', label: 'Customer Support Centre' }));
  });
});
