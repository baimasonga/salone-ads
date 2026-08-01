import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = readSource('src/lib/procurementApi.ts');
const savedSearchApi = readSource('src/lib/procurement/savedSearchApi.ts');

const directConsumers = [
  'src/components/TenderDetailPage.tsx',
  'src/components/TenderSearchPage.tsx',
  'src/components/WorkspaceRouteResolver.tsx',
  'src/components/Workspaces.tsx',
  'src/modules/procurement/ProcurementOverview.tsx',
  'src/modules/procurement/useProcurementOverview.ts',
  'src/modules/procurement/useTenderWorkspace.ts',
];

describe('saved search and buyer following API boundary', () => {
  it('keeps compatibility exports while the focused module owns the implementation', () => {
    expect(facade).toContain("export * from './procurement/savedSearchApi'");
    expect(facade).not.toContain('export async function fetchSavedSearches');
    expect(facade).not.toContain('export async function createSavedSearch');
    expect(facade).not.toContain('export async function setFollowingBuyer');

    expect(savedSearchApi).toContain('export async function fetchSavedSearches');
    expect(savedSearchApi).toContain('export async function createSavedSearch');
    expect(savedSearchApi).toContain('export async function setFollowingBuyer');
  });

  it('routes saved-search and buyer-following consumers through the focused module', () => {
    for (const consumer of directConsumers) {
      expect(readSource(consumer), consumer).toContain('lib/procurement/savedSearchApi');
    }
  });

  it('preserves persisted alert delivery and authenticated buyer follows', () => {
    expect(savedSearchApi).toContain(".from('saved_search_matches')");
    expect(savedSearchApi).toContain(".from('followed_buyers')");
    expect(savedSearchApi).toContain('supabase.auth.getUser()');
  });
});
