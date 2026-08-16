import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/91_customer_support_centre.sql', 'utf8');
const api = readFileSync('src/lib/procurement/serviceRequestApi.ts', 'utf8');
const subscriber = readFileSync('src/modules/service-requests/SubscriberServiceRequestsWorkspace.tsx', 'utf8');
const admin = readFileSync('src/modules/service-requests/AdminServiceRequestsWorkspace.tsx', 'utf8');

describe('customer support centre', () => {
  it('extends the existing secure request queue into support tickets', () => {
    expect(migration).toContain("request_kind in ('support', 'service')");
    expect(migration).toContain("category in ('technical', 'billing', 'account', 'tender_access'");
    expect(migration).toContain("priority in ('low', 'normal', 'high', 'urgent')");
    expect(migration).toContain('ticket_number');
  });

  it('records SLA, response, resolution and customer satisfaction timestamps', () => {
    expect(migration).toContain("when 'urgent' then interval '4 hours'");
    expect(migration).toContain('first_responded_at = coalesce(first_responded_at, now())');
    expect(migration).toContain("new.status = 'completed'");
    expect(migration).toContain('customer_rating between 1 and 5');
  });

  it('prevents subscribers from rewriting operational ticket fields', () => {
    expect(migration).toContain('new.priority := old.priority');
    expect(migration).toContain('new.sla_due_at := old.sla_due_at');
    expect(migration).toContain('new.first_responded_at := old.first_responded_at');
    expect(migration).toContain("new.status <> 'cancelled'");
  });

  it('connects customer and staff experiences through the focused API', () => {
    expect(api).toContain('function createSupportTicket');
    expect(api).toContain('function rateServiceRequest');
    expect(subscriber).toContain('Customer Support Centre');
    expect(subscriber).toContain('Create Support Ticket');
    expect(admin).toContain('SLA overdue');
    expect(admin).toContain('Search support tickets');
  });
});
