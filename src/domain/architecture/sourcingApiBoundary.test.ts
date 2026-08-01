import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = readSource('src/lib/procurementApi.ts');
const sourcingApi = readSource('src/lib/procurement/sourcingApi.ts');

describe('opportunity sourcing API boundary', () => {
  it('keeps compatibility exports while focused sourcing owns the implementation', () => {
    expect(facade).toContain("export * from './procurement/sourcingApi'");
    expect(facade).not.toContain('export async function fetchOpportunitySources');
    expect(facade).not.toContain('export async function createOpportunityIngestionItem');
    expect(facade).not.toContain('export async function assignOpportunitySourcingTask');

    expect(sourcingApi).toContain('export async function fetchOpportunitySources');
    expect(sourcingApi).toContain('export async function createOpportunityIngestionItem');
    expect(sourcingApi).toContain('export async function assignOpportunitySourcingTask');
  });

  it('routes sourcing consumers through the focused module', () => {
    expect(readSource('src/modules/procurement/OpportunityIngestionWorkspace.tsx'))
      .toContain('lib/procurement/sourcingApi');
    expect(readSource('src/components/Workspaces.tsx'))
      .toContain('lib/procurement/sourcingApi');
    expect(readSource('src/components/WorkspaceRouteResolver.tsx'))
      .toContain("import('../modules/procurement/OpportunityIngestionWorkspace')");
  });

  it('keeps promotion behind the secure backend command boundary', () => {
    expect(sourcingApi).toContain("executeBackendCommand<string>('procurement.ingestion.promote'");
    expect(sourcingApi).toContain("import('../commandApi')");
  });
});
