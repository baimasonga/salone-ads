import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const workspace = readSource('src/components/Workspaces.tsx');
const subscriberWorkspace = readSource('src/modules/service-requests/SubscriberServiceRequestsWorkspace.tsx');
const adminWorkspace = readSource('src/modules/service-requests/AdminServiceRequestsWorkspace.tsx');
const labels = readSource('src/modules/service-requests/serviceRequestLabels.ts');

describe('service request workspace boundary', () => {
  it('keeps route ownership in the main workspace and behavior in focused modules', () => {
    expect(workspace).toContain("activeTab === 'services'");
    expect(workspace).toContain("activeTab === 'admin-services'");
    expect(workspace).toContain('<SubscriberServiceRequestsWorkspace');
    expect(workspace).toContain('<AdminServiceRequestsWorkspace');
    expect(workspace).not.toContain('fetchServiceRequestActivities');
  });

  it('uses the focused service-request API rather than the compatibility facade', () => {
    for (const source of [subscriberWorkspace, adminWorkspace]) {
      expect(source).toContain("../../lib/procurement/serviceRequestApi");
      expect(source).not.toContain("../../lib/procurementApi");
    }
  });

  it('preserves subscriber submission and customer-visible activity behavior', () => {
    expect(subscriberWorkspace).toContain('createServiceRequest(orgId, serviceType, description)');
    expect(subscriberWorkspace).toContain('fetchMyServiceRequests(orgId)');
    expect(subscriberWorkspace).toContain('fetchServiceRequestActivities(requestId)');
    expect(subscriberWorkspace).not.toContain('addServiceRequestNote');
  });

  it('preserves administrator fulfilment operations and shared service labels', () => {
    expect(adminWorkspace).toContain('addServiceRequestNote(requestId, note, internal)');
    expect(adminWorkspace).toContain("quoteServiceRequest(requestId, Number(amount), 'SLE')");
    expect(adminWorkspace).toContain('updateServiceRequestStatus(requestId, status)');
    expect(subscriberWorkspace).toContain("./serviceRequestLabels");
    expect(adminWorkspace).toContain("./serviceRequestLabels");
    expect(labels).toContain('bid_readiness_review');
    expect(labels).toContain('featured_placement');
  });
});
