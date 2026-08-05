import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('migrations/manohub-new-project/73_unified_subscriber_administration.sql');
const periodTypeFix = read('migrations/manohub-new-project/74_fix_subscriber_admin_period_type.sql');
const workspace = read('src/modules/platform-admin/AdminOrganizationLifecycleWorkspace.tsx');
const server = read('server.ts');

describe('unified subscriber administration boundary', () => {
  it('lists rich subscriber records only for platform administrators', () => {
    expect(migration).toContain('admin_list_subscribers');
    expect(migration).toContain('not public.is_platform_admin()');
    expect(migration).toContain('owner_email text');
    expect(migration).toContain('subscriber_details jsonb');
    expect(migration).toContain('count(*) over()');
    expect(migration).toContain('limit p_limit offset p_offset');
    expect(periodTypeFix).toContain('current_period_end date');
  });

  it('supports filtering, pagination, details and complete CSV export', () => {
    for (const marker of ['All subscriber types','All statuses','Export filtered subscribers','Page {page + 1}','Registration details']) {
      expect(workspace).toContain(marker);
    }
  });

  it('revokes sessions whenever an organization is restricted', () => {
    expect(migration).toContain('revoke_restricted_organization_sessions');
    expect(migration).toContain("new.status in ('suspended','closed','purged')");
    expect(migration).toContain('delete from auth.sessions');
  });

  it('requires closure, recovery expiry, exact confirmation and a reason before purge', () => {
    expect(migration).toContain("target.status <> 'closed'");
    expect(migration).toContain('target.recoverable_until > now()');
    expect(migration).toContain('p_confirmation <> target.name');
    expect(migration).toContain("action,entity_type,entity_id,metadata");
    expect(migration).toContain("'subscriber.purged'");
  });

  it('retains anonymous ledgers while removing access and blocking re-registration', () => {
    expect(migration).toContain('private.blocked_subscriber_users');
    expect(migration).toContain('delete from public.organization_members');
    expect(migration).toContain("name='Deleted subscriber '");
    expect(migration).not.toContain('delete from public.organizations');
  });

  it('routes purge through the protected idempotent backend command layer', () => {
    expect(server).toContain("'organization.purge': { rpc: 'admin_purge_subscriber'");
    expect(migration).toContain("'organization.recovery.decide','organization.purge'");
  });
});
