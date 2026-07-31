import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/65_tenant_authorization_assurance.sql'),
  'utf8',
).toLowerCase();
const adminWorkspace = readFileSync(
  resolve(process.cwd(), 'src/modules/platform-admin/PlatformAdminWorkspace.tsx'),
  'utf8',
);
const assuranceWorkspace = readFileSync(
  resolve(process.cwd(), 'src/modules/platform-admin/AdminAuthorizationAssuranceWorkspace.tsx'),
  'utf8',
);

describe('tenant authorization assurance', () => {
  it('registers all commercially sensitive tenant domains', () => {
    for (const domain of ['campaign', 'advertising', 'agency', 'subscription', 'billing', 'usage', 'audit', 'procurement']) {
      expect(migration).toContain(`'${domain}'`);
    }
  });

  it('keeps authorization evidence behind platform-admin RLS', () => {
    expect(migration).toContain('authorization_denials_admin_read');
    expect(migration).toContain('(select public.is_platform_admin())');
    expect(migration).toContain('revoke all on public.authorization_denials from anon, authenticated');
  });

  it('centralizes the existing owner, admin and member permission model', () => {
    for (const role of ["when 'owner'", "when 'admin'", "when 'member'"]) expect(migration).toContain(role);
    expect(migration).toContain('private.org_role_permissions');
    expect(migration).toContain('public.check_org_permission');
  });

  it('records cross-tenant and insufficient-role denials without exposing the writer', () => {
    expect(migration).toContain("'not_a_member'");
    expect(migration).toContain("'insufficient_role'");
    expect(migration).toContain('revoke all on function private.record_authorization_denial');
  });

  it('automatically protects future public tables with RLS', () => {
    expect(migration).toContain('returns event_trigger');
    expect(migration).toContain('alter table if exists %s enable row level security');
    expect(migration).toContain('create event trigger manohub_auto_enable_public_rls');
  });

  it('provides an admin-only posture report', () => {
    expect(migration).toContain('admin_get_authorization_assurance');
    expect(migration).toContain('platform administrator access is required');
    expect(migration).toContain('unsafeanondefiners');
  });

  it('makes assurance visible from the existing Customer Requests hub', () => {
    expect(adminWorkspace).toContain("id: 'admin-authorization'");
    expect(adminWorkspace).toContain("title: 'Authorization assurance'");
    expect(assuranceWorkspace).toContain('Authorization Assurance');
    expect(assuranceWorkspace).toContain('Registered tenant resources');
  });
});
