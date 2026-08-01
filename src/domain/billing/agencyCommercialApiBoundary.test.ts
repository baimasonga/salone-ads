import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const procurementApi = read('src/lib/procurementApi.ts');
const agencyApi = read('src/lib/agencyApi.ts');
const advertBillingApi = read('src/lib/advertBillingApi.ts');
const agencyWorkspace = read('src/components/AgencyWorkspacePage.tsx');
const advertBillingPage = read('src/components/AdvertBillingPage.tsx');

describe('agency and commercial API boundaries', () => {
  it('gives the agency module ownership of client delegation and approvals', () => {
    for (const operation of [
      'fetchAgencyClients',
      'updateAgencyClient',
      'fetchAgencyApprovals',
      'createAgencyApproval',
      'saveAgencyProfile',
      'saveAgencyBulkUpload',
    ]) {
      expect(agencyApi).toContain(`function ${operation}`);
      expect(procurementApi).not.toContain(`function ${operation}`);
    }
  });

  it('gives the advertising billing module ownership of packages and ledger-backed orders', () => {
    for (const operation of [
      'fetchAdvertPackages',
      'fetchAdvertOrders',
      'createAdvertOrder',
      'confirmAdvertOrder',
    ]) {
      expect(advertBillingApi).toContain(`function ${operation}`);
      expect(procurementApi).not.toContain(`function ${operation}`);
    }
    expect(advertBillingApi).toContain("executeBackendCommand('advertising.order.create'");
    expect(advertBillingApi).toContain("supabase.rpc('confirm_advert_order'");
  });

  it('keeps one shared advert-order mapper for agency and direct billing views', () => {
    expect(advertBillingApi).toContain('function mapAdvertOrder');
    expect(advertBillingApi).toContain('fetchAdvertOrdersForOrganizations');
    expect(agencyApi).toContain('fetchAdvertOrdersForOrganizations(clientOrgIds)');
  });

  it('routes the focused consumers directly while retaining compatibility exports', () => {
    expect(agencyWorkspace).toContain("from '../lib/agencyApi'");
    expect(advertBillingPage).toContain("from '../lib/advertBillingApi'");
    expect(procurementApi).toContain("export * from './agencyApi'");
    expect(procurementApi).toContain("export * from './advertBillingApi'");
    expect(procurementApi.split('\n').length).toBeLessThan(2_200);
  });
});
