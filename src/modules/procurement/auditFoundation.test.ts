import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/29_procurement_audit_foundation.sql'),
  'utf8',
).toLowerCase();

describe('procurement audit migration', () => {
  it('makes audit rows immutable and removes client write privileges', () => {
    expect(migration).toContain('revoke insert, update, delete, truncate');
    expect(migration).toContain('before update or delete on public.audit_logs');
    expect(migration).toContain("raise exception 'audit logs are immutable'");
    expect(migration).toContain('drop constraint if exists audit_logs_actor_id_fkey');
    expect(migration).toContain('drop constraint if exists audit_logs_org_id_fkey');
  });

  it('uses authenticated-only read policies and indexed access paths', () => {
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('audit_logs_org_created_at_idx');
    expect(migration).toContain('audit_logs_entity_created_at_idx');
    expect(migration).toContain('audit_logs_action_created_at_idx');
  });

  it('captures tender lifecycle and featured changes at the database boundary', () => {
    expect(migration).toContain('opportunities_capture_audit');
    expect(migration).toContain("'tender.approved'");
    expect(migration).toContain("'tender.rejected'");
    expect(migration).toContain("'tender.cancelled'");
    expect(migration).toContain("'tender.awarded'");
    expect(migration).toContain("'tender.featured'");
    expect(migration).toContain("'tender.deadline_changed'");
  });
});
