import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  resolve(process.cwd(), 'src/components/Workspaces.tsx'),
  'utf8',
);
const delegatedRoutes = readFileSync(
  resolve(process.cwd(), 'src/components/WorkspaceRouteResolver.tsx'),
  'utf8',
);
const subscriberAdvertising = readFileSync(
  resolve(process.cwd(), 'src/components/SubscriberAdvertisingWorkspace.tsx'),
  'utf8',
);
const adminAdvertisingQueue = readFileSync(
  resolve(process.cwd(), 'src/components/AdminAdvertisingRequestQueue.tsx'),
  'utf8',
);

describe('workspace source integrity', () => {
  it('retains early, middle and late workspace implementations', () => {
    expect(delegatedRoutes).toContain("activeTab === 'notifications'");
    expect(delegatedRoutes).toContain("activeTab === 'campaign-builder'");
    expect(workspaceSource).toContain("activeTab === 'admin'");
    expect(workspaceSource).toContain('Workspace Pending Initialization');
  });

  it('retains the complete workspace source rather than a partial publish', () => {
    expect(workspaceSource.split('\n').length).toBeGreaterThan(5_400);
    expect((workspaceSource + delegatedRoutes + subscriberAdvertising + adminAdvertisingQueue).split('\n').length).toBeGreaterThan(5_800);
    expect(workspaceSource.trimEnd().endsWith('}')).toBe(true);
  });

  it('keeps delegated route selection out of the state-heavy workspace component', () => {
    expect(workspaceSource).toContain('resolveDelegatedWorkspaceRoute');
    expect(workspaceSource).not.toContain("if (activeTab === 'notifications')");
    expect(delegatedRoutes).toContain("activeTab === 'admin-subscriptions'");
    expect(delegatedRoutes).toContain("activeTab === 'campaign-performance'");
  });

  it('keeps subscriber advertising visible while isolating its rendering', () => {
    expect(workspaceSource).toContain('<SubscriberAdvertisingWorkspace');
    expect(workspaceSource).not.toContain("<h3 className=\"font-display font-bold text-slate-900 text-lg\">My Adverts</h3>");
    expect(subscriberAdvertising).toContain('My Adverts');
    expect(subscriberAdvertising).toContain('Your Requests');
    expect(subscriberAdvertising).toContain('Advertising is available on the Business plan and above.');
  });

  it('isolates the visible admin fulfilment queue without duplicating campaign management', () => {
    expect(workspaceSource).toContain('<AdminAdvertisingRequestQueue');
    expect(adminAdvertisingQueue).toContain('Advertising Requests');
    expect(adminAdvertisingQueue).toContain('Load into publisher');
    expect(adminAdvertisingQueue).toContain('No advertising requests yet.');
    expect(adminAdvertisingQueue).not.toContain('Campaigns');
  });
});
