import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('migrations/manohub-new-project/80_agency_workspace_authorization_hardening.sql');
const productionMigration = read('supabase/migrations/20260811034834_agency_workspace_authorization_hardening.sql');
const agencyApi = read('src/lib/agencyApi.ts');
const agencyWorkspace = read('src/components/AgencyWorkspacePage.tsx');
const navigation = read('src/config/workspaceNavigation.ts');

describe('agency workspace authorization hardening', () => {
  it('keeps the new-project and production migrations byte-identical', () => {
    expect(productionMigration).toBe(migration);
  });

  it('makes client relationship identity and approval evidence immutable', () => {
    for (const evidence of [
      'Agency relationship identity is immutable',
      'Only the client organisation can manage delegated agency access',
      'Agency approval evidence is server-owned',
      'Agency approval decisions are immutable',
    ]) expect(migration).toContain(evidence);
    expect(migration).toContain('create policy agency_clients_client_control');
    expect(migration).toContain("status = 'pending'");
  });

  it('keeps anonymous callers outside every agency table', () => {
    for (const table of ['agency_profiles','agency_clients','agency_approval_requests','agency_bulk_uploads']) {
      expect(migration).toContain(`revoke all on table public.${table} from anon`);
    }
  });

  it('records relationship and decision evidence in database triggers only', () => {
    expect(agencyApi).not.toContain('approved_at: new Date()');
    expect(agencyApi).not.toContain('decided_at: new Date()');
    expect(migration).toContain('new.approved_by := auth.uid()');
    expect(migration).toContain('new.decided_by := auth.uid()');
  });

  it('exposes one workspace to agencies, clients, and platform oversight', () => {
    expect(navigation).toContain("label: 'Agency Oversight'");
    expect(navigation).toContain("label: 'Agency Access'");
    expect(navigation).toContain("label: 'Client Workspace'");
    expect(agencyWorkspace).toContain('const canControl=isPlatformAdmin||c.clientOrgId===activeOrg.id');
    expect(agencyWorkspace).toContain('Only the client organisation can approve, suspend, restore or end agency access');
  });
});
