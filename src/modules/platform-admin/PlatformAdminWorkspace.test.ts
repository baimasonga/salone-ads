import { describe, expect, it } from 'vitest';
import { isPlatformAdminWorkspaceTab } from './PlatformAdminWorkspace';

describe('platform administration workspace routing', () => {
  it.each(['overview', 'audience-hub', 'operations-hub'])('owns the %s tab', (tab) => {
    expect(isPlatformAdminWorkspaceTab(tab)).toBe(true);
  });

  it.each(['tenders', 'campaign-builder', 'content-cms', 'billing'])('does not claim the %s domain tab', (tab) => {
    expect(isPlatformAdminWorkspaceTab(tab)).toBe(false);
  });
});

