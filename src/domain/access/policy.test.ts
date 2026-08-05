import { describe, expect, it } from 'vitest';
import { hasWorkspaceCapability } from './policy';
import type { AccessContext } from './policy';

const subscriber: AccessContext = {
  isPlatformAdmin: false,
  cmsRole: null,
  features: new Set(),
  organizationType: 'Business',
  subscriberType: 'viewer',
};

describe('workspace access policy', () => {
  it('keeps platform administration unavailable to subscribers', () => {
    expect(hasWorkspaceCapability(subscriber, 'platform:administer')).toBe(false);
  });

  it('allows ordinary subscribers to use procurement and organization settings', () => {
    expect(hasWorkspaceCapability(subscriber, 'procurement:use')).toBe(true);
    expect(hasWorkspaceCapability(subscriber, 'organization:manage')).toBe(true);
  });

  it('keeps advertiser-only accounts out of procurement workspaces', () => {
    expect(hasWorkspaceCapability({ ...subscriber, subscriberType: 'advertiser' }, 'procurement:use')).toBe(false);
    expect(hasWorkspaceCapability({ ...subscriber, subscriberType: 'advertiser' }, 'organization:manage')).toBe(true);
  });

  it('only exposes advertising when the organization has the entitlement', () => {
    expect(hasWorkspaceCapability(subscriber, 'advertising:manage')).toBe(false);
    expect(hasWorkspaceCapability({
      ...subscriber,
      features: new Set(['business_advertising']),
    }, 'advertising:manage')).toBe(true);
  });

  it('only exposes editorial tools to an assigned CMS role', () => {
    expect(hasWorkspaceCapability(subscriber, 'content:manage')).toBe(false);
    expect(hasWorkspaceCapability({
      ...subscriber,
      cmsRole: 'writer',
    }, 'content:manage')).toBe(true);
  });

  it('recognizes agency workspaces without depending on capitalization', () => {
    expect(hasWorkspaceCapability({
      ...subscriber,
      organizationType: 'Advertising Agency',
    }, 'agency:manage')).toBe(true);
  });

  it('keeps subscriber self-service workflows out of the platform admin workspace', () => {
    const administrator: AccessContext = {
      ...subscriber,
      isPlatformAdmin: true,
      cmsRole: 'administrator',
    };

    expect(hasWorkspaceCapability(administrator, 'platform:administer')).toBe(true);
    expect(hasWorkspaceCapability(administrator, 'content:manage')).toBe(true);
    expect(hasWorkspaceCapability(administrator, 'procurement:use')).toBe(false);
    expect(hasWorkspaceCapability(administrator, 'organization:manage')).toBe(false);
  });

  it('limits researchers to procurement operations', () => {
    const researcher: AccessContext = {
      ...subscriber,
      isPlatformResearcher: true,
    };
    expect(hasWorkspaceCapability(researcher, 'procurement:use')).toBe(true);
    expect(hasWorkspaceCapability(researcher, 'platform:administer')).toBe(false);
    expect(hasWorkspaceCapability(researcher, 'organization:manage')).toBe(false);
    expect(hasWorkspaceCapability(researcher, 'advertising:manage')).toBe(false);
  });
});
