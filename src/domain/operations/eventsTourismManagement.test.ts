import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/89_events_tourism_management.sql', 'utf8');
const api = readFileSync('src/lib/eventsTourismApi.ts', 'utf8');
const workspace = readFileSync('src/modules/marketing/EventsTourismWorkspace.tsx', 'utf8');
const shell = readFileSync('src/components/Workspaces.tsx', 'utf8');

describe('events and tourism management', () => {
  it('persists real event and tourism inventories with bounded lifecycle values', () => {
    expect(migration).toContain('create table if not exists public.managed_events');
    expect(migration).toContain('create table if not exists public.tourism_experiences');
    expect(migration).toContain("status in ('draft', 'published', 'cancelled', 'completed', 'archived')");
    expect(migration).toContain("status in ('draft', 'published', 'paused', 'archived')");
  });

  it('keeps the pivoted tooling private to platform admins in their organization', () => {
    expect(migration).toContain('public.is_platform_admin() and public.is_org_member(org_id)');
    expect(migration).toContain('revoke all on public.managed_events, public.tourism_experiences from public, anon');
    expect(migration).toContain('Managed inventory ownership is immutable');
  });

  it('provides create, update and delete operations for both record types', () => {
    for (const operation of ['fetchManagedEvents', 'saveManagedEvent', 'deleteManagedEvent', 'fetchTourismExperiences', 'saveTourismExperience', 'deleteTourismExperience']) {
      expect(api).toContain(`function ${operation}`);
    }
  });

  it('replaces hardcoded cards and connects records to promotion and tracking tools', () => {
    expect(shell).toContain('<EventsTourismWorkspace organization={activeOrg} mode="events" />');
    expect(shell).toContain('<EventsTourismWorkspace organization={activeOrg} mode="tourism" />');
    expect(workspace).toContain('createContentItem');
    expect(workspace).toContain('createTrackingLink');
    expect(shell).not.toContain('Freetown December Music Fest 2026');
    expect(shell).not.toContain('Bunce Island Historical Exploration');
  });
});
