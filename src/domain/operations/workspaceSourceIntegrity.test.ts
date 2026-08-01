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
const adminAdvertCreativeEditor = readFileSync(
  resolve(process.cwd(), 'src/components/AdminAdvertCreativeEditor.tsx'),
  'utf8',
);
const adminAdvertPublisherPanel = readFileSync(
  resolve(process.cwd(), 'src/components/AdminAdvertPublisherPanel.tsx'),
  'utf8',
);
const subscriberServiceRequests = readFileSync(
  resolve(process.cwd(), 'src/modules/service-requests/SubscriberServiceRequestsWorkspace.tsx'),
  'utf8',
);
const adminServiceRequests = readFileSync(
  resolve(process.cwd(), 'src/modules/service-requests/AdminServiceRequestsWorkspace.tsx'),
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
    expect(workspaceSource.split('\n').length).toBeGreaterThan(5_000);
    expect((workspaceSource + delegatedRoutes + subscriberAdvertising + adminAdvertisingQueue + adminAdvertCreativeEditor + adminAdvertPublisherPanel + subscriberServiceRequests + adminServiceRequests).split('\n').length).toBeGreaterThan(6_000);
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

  it('isolates the admin creative editor while retaining every export format', () => {
    expect(workspaceSource).toContain('<AdminAdvertCreativeEditor');
    expect(workspaceSource).not.toContain('<CreativeScaler');
    expect(adminAdvertCreativeEditor).toContain('Auto-generated creative');
    expect(adminAdvertCreativeEditor).toContain('Download PNG');
    expect(adminAdvertCreativeEditor).toContain('Save for social');
    expect(adminAdvertCreativeEditor).toContain('Download the kit (all 5 sizes · ZIP)');
    expect(adminAdvertCreativeEditor).toContain('format="landscape"');
  });

  it('isolates the complete admin advert publisher workflow', () => {
    expect(workspaceSource).toContain('<AdminAdvertPublisherPanel');
    expect(workspaceSource).not.toContain('id="advert-publisher"');
    expect(adminAdvertPublisherPanel).toContain('id="advert-publisher"');
    expect(adminAdvertPublisherPanel).toContain('Adverts on the site');
    expect(adminAdvertPublisherPanel).toContain('Polish copy with AI');
    expect(adminAdvertPublisherPanel).toContain('No adverts published yet.');
    expect(adminAdvertPublisherPanel).toContain('Share pack');
    expect(adminAdvertPublisherPanel).not.toContain('Campaign Management');
  });

  it('isolates subscriber and administrator service requests without duplicating routes', () => {
    expect(workspaceSource).toContain('<SubscriberServiceRequestsWorkspace');
    expect(workspaceSource).toContain('<AdminServiceRequestsWorkspace');
    expect(workspaceSource).not.toContain('createServiceRequest');
    expect(workspaceSource).not.toContain('fetchAllServiceRequests');
    expect(subscriberServiceRequests).toContain('Support Services');
    expect(subscriberServiceRequests).toContain('Your Requests');
    expect(subscriberServiceRequests).toContain('Submit Request');
    expect(adminServiceRequests).toContain('Service Requests');
    expect(adminServiceRequests).toContain('Message Customer');
    expect(adminServiceRequests).toContain('Internal Note');
    expect(adminServiceRequests).toContain('Add Quote');
  });
});
