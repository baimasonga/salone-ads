import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/64_platform_audit_and_usage_coverage.sql'),
  'utf8',
);
const adminWorkspace = readFileSync(
  resolve(process.cwd(), 'src/modules/platform-admin/PlatformAdminWorkspace.tsx'),
  'utf8',
);
const usageWorkspace = readFileSync(
  resolve(process.cwd(), 'src/modules/platform-admin/AdminUsageMeteringWorkspace.tsx'),
  'utf8',
);
const auditWorkspace = readFileSync(
  resolve(process.cwd(), 'src/modules/platform-admin/AdminAuditLogWorkspace.tsx'),
  'utf8',
);

describe('platform audit and usage coverage', () => {
  it('bridges core SaaS domains into the central immutable audit log', () => {
    for (const trigger of [
      'subscription_events_central_audit',
      'cms_content_central_audit',
      'organization_members_central_audit',
      'agency_clients_central_audit_usage',
      'ad_campaigns_central_audit_usage',
      'advert_orders_central_audit_usage',
    ]) expect(migration).toContain(trigger);
    expect(migration).toContain('insert into public.audit_logs');
  });

  it('enriches metering events and protects their organization visibility', () => {
    expect(migration).toContain('add column if not exists actor_id');
    expect(migration).toContain('private.record_org_usage_event');
    expect(migration).toContain('create policy usage_events_read');
    expect(migration).toContain('public.is_org_member(org_id)');
  });

  it('provides an administrator usage summary with bounded date windows', () => {
    expect(migration).toContain('admin_get_usage_metering_summary');
    expect(migration).toContain("p_days < 1 or p_days > 366");
    expect(migration).toContain('not public.is_platform_admin()');
  });

  it('makes audit and usage operations visible without duplicating advert analytics', () => {
    expect(adminWorkspace).toContain("id: 'admin-audit-log'");
    expect(adminWorkspace).toContain("id: 'admin-usage'");
    expect(usageWorkspace).toContain('Advertising performance remains in its dedicated analytics workspace.');
    expect(auditWorkspace).toContain("'billing.refund_recorded'");
  });
});
