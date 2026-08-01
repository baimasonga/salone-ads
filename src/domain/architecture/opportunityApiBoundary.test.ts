import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = readSource('src/lib/procurementApi.ts');
const opportunityApi = readSource('src/lib/procurement/opportunityApi.ts');
const bidPipelineApi = readSource('src/lib/procurement/bidPipelineApi.ts');

const directConsumers = [
  'src/components/LandingPage.tsx',
  'src/components/PublicSubscriptionSection.tsx',
  'src/components/TenderDetailPage.tsx',
  'src/components/TenderSearchPage.tsx',
  'src/components/Workspaces.tsx',
  'src/modules/procurement/AdminTenderReviewWorkspace.tsx',
  'src/modules/procurement/TenderCreationForm.tsx',
  'src/modules/procurement/TenderManagementPanel.tsx',
  'src/modules/procurement/tenderSubmission.ts',
  'src/modules/procurement/useProcurementOverview.ts',
  'src/modules/procurement/useTenderWorkspace.ts',
];

describe('opportunity lifecycle API boundary', () => {
  it('keeps the compatibility facade while moving lifecycle ownership to the focused module', () => {
    expect(facade).toContain("export * from './procurement/opportunityApi'");
    expect(facade).not.toMatch(/export async function createOpportunity\s*\(/);
    expect(facade).not.toMatch(/export async function fetchOpportunityBySlug\s*\(/);
    expect(facade).not.toMatch(/export async function incrementOpportunityView\s*\(/);

    expect(opportunityApi).toContain('export async function createOpportunity');
    expect(opportunityApi).toContain('export async function fetchOpportunityBySlug');
    expect(opportunityApi).toContain('export async function fetchOpportunitiesForReview');
    expect(opportunityApi).toContain('export async function incrementOpportunityView');
    expect(opportunityApi).toContain('export async function approveOpportunity');
    expect(opportunityApi).toContain('export async function setOpportunityFeatured');
  });

  it('shares the opportunity list contract with adjacent procurement services', () => {
    expect(opportunityApi).toContain('export const OPPORTUNITY_LIST_SELECT');
    expect(opportunityApi).toContain('export function mapOpportunityListItem');
    expect(opportunityApi).toContain('export async function getOpportunityStatusId');
    expect(bidPipelineApi).toContain('OPPORTUNITY_LIST_SELECT');
    expect(bidPipelineApi).toContain('mapOpportunityListItem');
    expect(facade).toContain("export * from './procurement/opportunityApi'");
  });

  it('routes lifecycle consumers through the focused boundary', () => {
    for (const consumer of directConsumers) {
      expect(readSource(consumer), consumer).toContain('lib/procurement/opportunityApi');
    }
  });
});
