export type CmsRole = 'writer' | 'editor' | 'publisher' | 'administrator' | null;

export type WorkspaceCapability =
  | 'platform:administer'
  | 'finance:manage'
  | 'support:manage'
  | 'audit:read'
  | 'content:manage'
  | 'advertising:manage'
  | 'agency:manage'
  | 'procurement:use'
  | 'organization:manage';

export interface AccessContext {
  isPlatformAdmin: boolean;
  platformStaffRole?: import('../../lib/platformStaffApi').PlatformStaffRole | null;
  isPlatformResearcher?: boolean;
  cmsRole: CmsRole;
  features: ReadonlySet<string>;
  organizationType: string;
  subscriberType: import('../subscriptions/subscriberTypes').SubscriberType;
}

export function hasWorkspaceCapability(
  context: AccessContext,
  capability: WorkspaceCapability,
): boolean {
  if (context.isPlatformAdmin) {
    return capability !== 'procurement:use' && capability !== 'organization:manage';
  }

  if (context.isPlatformResearcher) {
    return capability === 'procurement:use';
  }

  if (context.platformStaffRole === 'finance') return capability === 'finance:manage';
  if (context.platformStaffRole === 'editorial') return capability === 'content:manage';
  if (context.platformStaffRole === 'support') return capability === 'support:manage';
  if (context.platformStaffRole === 'auditor') return capability === 'audit:read';

  switch (capability) {
    case 'platform:administer':
      return false;
    case 'finance:manage':
    case 'support:manage':
    case 'audit:read':
      return false;
    case 'content:manage':
      return context.cmsRole !== null;
    case 'advertising:manage':
      return context.features.has('business_advertising');
    case 'agency:manage':
      return context.organizationType.trim().toLowerCase().includes('agency');
    case 'procurement:use':
      return context.subscriberType !== 'advertiser';
    case 'organization:manage':
      return true;
  }
}
