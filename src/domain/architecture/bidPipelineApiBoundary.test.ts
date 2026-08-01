import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = readSource('src/lib/procurementApi.ts');
const responseApi = readSource('src/lib/procurement/responseApi.ts');
const bidPipelineApi = readSource('src/lib/procurement/bidPipelineApi.ts');

describe('opportunity response and bid pipeline API boundaries', () => {
  it('keeps compatibility exports while focused modules own the implementations', () => {
    expect(facade).toContain("export * from './procurement/responseApi'");
    expect(facade).toContain("export * from './procurement/bidPipelineApi'");
    expect(facade).not.toContain('export async function submitResponse');
    expect(facade).not.toContain('export async function fetchPipeline');
    expect(facade).not.toContain('export async function fetchRecommendedOpportunities');

    expect(responseApi).toContain('export async function submitResponse');
    expect(responseApi).toContain('export async function fetchOpportunityResponses');
    expect(bidPipelineApi).toContain('export async function fetchPipeline');
    expect(bidPipelineApi).toContain('export async function fetchRecommendedOpportunities');
  });

  it('routes existing response consumers through the focused response module', () => {
    for (const consumer of [
      'src/components/TenderDetailPage.tsx',
      'src/modules/procurement/TenderManagementPanel.tsx',
      'src/modules/procurement/TenderManagementPanel.test.tsx',
    ]) {
      expect(readSource(consumer), consumer).toContain('lib/procurement/responseApi');
    }
  });

  it('routes existing pipeline consumers through the focused pipeline module', () => {
    for (const consumer of [
      'src/components/Workspaces.tsx',
      'src/modules/procurement/useProcurementOverview.ts',
    ]) {
      expect(readSource(consumer), consumer).toContain('lib/procurement/bidPipelineApi');
    }
  });

  it('preserves tenant-scoped records and persisted pipeline tasks', () => {
    expect(responseApi).toContain(".from('opportunity_responses')");
    expect(responseApi).toContain('fetchMyOrganization()');
    expect(bidPipelineApi).toContain(".from('pipeline_records')");
    expect(bidPipelineApi).toContain(".from('pipeline_tasks')");
    expect(bidPipelineApi).toContain(".from('supplier_sectors')");
  });
});
