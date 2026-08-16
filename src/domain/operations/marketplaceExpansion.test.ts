import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/90_marketplace_expansion.sql', 'utf8');
const api = readFileSync('src/lib/marketplaceApi.ts', 'utf8');
const workspace = readFileSync('src/modules/marketing/MarketplaceExpansionWorkspace.tsx', 'utf8');
const shell = readFileSync('src/components/Workspaces.tsx', 'utf8');

describe('business directory and influencer marketplace expansion', () => {
  it('adds bounded commercial and discovery fields without replacing existing profiles', () => {
    expect(migration).toContain('alter table public.directory_profiles');
    expect(migration).toContain('add column if not exists services text[]');
    expect(migration).toContain('alter table public.influencer_profiles');
    expect(migration).toContain('add column if not exists audience_count bigint');
    expect(migration).toContain('engagement_percent between 0 and 100');
    expect(migration).toContain("availability_status in ('available', 'limited', 'unavailable')");
  });

  it('provides complete CRUD boundaries for both marketplace types', () => {
    for (const operation of ['fetchBusinessDirectoryRecords', 'saveBusinessDirectoryRecord', 'deleteBusinessDirectoryRecord', 'fetchCreatorMarketplaceRecords', 'saveCreatorMarketplaceRecord', 'deleteCreatorMarketplaceRecord']) {
      expect(api).toContain(`function ${operation}`);
    }
  });

  it('supports search, lifecycle filters, verification evidence and CRM conversion', () => {
    expect(workspace).toContain('Search marketplace');
    expect(workspace).toContain('Filter profile status');
    expect(workspace).toContain("'Verification Documents'");
    expect(workspace).toContain("source: 'Influencer Marketplace'");
    expect(workspace).toContain('Create CRM opportunity');
  });

  it('routes the admin discovery tabs to the expanded workspace', () => {
    expect(shell).toContain('<MarketplaceExpansionWorkspace organization={activeOrg} mode="influencers" />');
    expect(shell).toContain('<MarketplaceExpansionWorkspace organization={activeOrg} mode="directory" />');
  });
});
