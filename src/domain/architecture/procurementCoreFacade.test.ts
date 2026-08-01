import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = readSource('src/lib/procurementApi.ts');
const insightsApi = readSource('src/lib/procurement/insightsApi.ts');
const entitlementAssistApi = readSource('src/lib/procurement/entitlementAssistApi.ts');

describe('final procurement core facade', () => {
  it('contains compatibility exports without service implementations', () => {
    expect(facade).not.toContain('export async function');
    expect(facade).not.toContain('supabase');
    expect(facade).toContain("export * from './procurement/insightsApi'");
    expect(facade).toContain("export * from './procurement/entitlementAssistApi'");
  });

  it('moves analytics and alert reporting to the focused insights module', () => {
    expect(insightsApi).toContain('export async function fetchAdminAnalytics');
    expect(insightsApi).toContain('export async function fetchProcurementSearchInsights');
    expect(insightsApi).toContain('export async function fetchTenderAlertDeliverySummary');
    expect(readSource('src/components/Workspaces.tsx')).toContain('lib/procurement/insightsApi');
    expect(readSource('src/components/AudienceEmailCampaignsPage.tsx')).toContain('lib/procurement/insightsApi');
  });

  it('moves entitlement and AI consumers to the focused assistance module', () => {
    expect(entitlementAssistApi).toContain('export async function hasFeature');
    expect(entitlementAssistApi).toContain('export async function aiSuggestSector');
    expect(entitlementAssistApi).toContain('export async function aiExplainTender');
    for (const consumer of [
      'src/App.tsx',
      'src/components/TenderDetailPage.tsx',
      'src/components/Workspaces.tsx',
      'src/modules/procurement/TenderCreationForm.tsx',
      'src/modules/procurement/useProcurementOverview.ts',
      'src/modules/procurement/useTenderWorkspace.ts',
    ]) {
      expect(readSource(consumer), consumer).toContain('lib/procurement/entitlementAssistApi');
    }
  });
});
