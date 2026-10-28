import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/89_events_tourism_management.sql', 'utf8');

describe('preserved events and tourism database schema', () => {
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

});
