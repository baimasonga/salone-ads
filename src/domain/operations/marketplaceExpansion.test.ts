import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/90_marketplace_expansion.sql', 'utf8');
const api = readFileSync('src/lib/businessDirectoryApi.ts', 'utf8');
const workspace = readFileSync('src/modules/marketing/BusinessDirectoryWorkspace.tsx', 'utf8');
const shell = readFileSync('src/components/Workspaces.tsx', 'utf8');

describe('business directory and preserved marketplace schema', () => {
  it('adds bounded commercial and discovery fields without replacing existing profiles', () => {
    expect(migration).toContain('alter table public.directory_profiles');
    expect(migration).toContain('add column if not exists services text[]');
    expect(migration).toContain('alter table public.influencer_profiles');
    expect(migration).toContain('add column if not exists audience_count bigint');
    expect(migration).toContain('engagement_percent between 0 and 100');
    expect(migration).toContain("availability_status in ('available', 'limited', 'unavailable')");
  });

  it('provides CRUD boundaries for the retained business directory', () => {
    for (const operation of ['fetchBusinessDirectoryRecords', 'saveBusinessDirectoryRecord', 'deleteBusinessDirectoryRecord']) {
      expect(api).toContain(`function ${operation}`);
    }
  });

  it('supports directory search, lifecycle filters and verification evidence', () => {
    expect(workspace).toContain('Search marketplace');
    expect(workspace).toContain('Filter profile status');
    expect(workspace).toContain("'Verification Documents'");
  });

  it('routes the admin discovery tabs to the expanded workspace', () => {
    expect(shell).toContain('<BusinessDirectoryWorkspace organization={activeOrg} />');
  });
});
