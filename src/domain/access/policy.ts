export type CmsRole = 'writer' | 'editor' | 'publisher' | 'administrator' | null;

export type WorkspaceCapability =
  | 'platform:administer'
  | 'content:manage'
  | 'advertising:manage'
  | 'agency:manage'
  | 'procurement:use'
  | 'organization:manage';

export interface AccessContext {
  isPlatformAdmin: boolean;
  cmsRole: CmsRole;
  features: ReadonlySet<string>;
  organizationType: string;
}

export function hasWorkspaceCapability(
  context: AccessContext,
  capability: WorkspaceCapability,
): boolean {
  if (context.isPlatformAdmin) {
    return capability !== 'procurement:use' && capability !== 'organization:manage';
  }

  switch (capability) {
    case 'platform:administer':
      return false;
    case 'content:manage':
      return context.cmsRole !== null;
    case 'advertising:manage':
      return context.features.has('business_advertising');
    case 'agency:manage':
      return context.organizationType.trim().toLowerCase().includes('agency');
    case 'procurement:use':
    case 'organization:manage':
      return true;
  }
}

