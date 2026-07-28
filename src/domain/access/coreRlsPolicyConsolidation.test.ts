import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/33_core_rls_policy_consolidation.sql'),
  'utf8',
).toLowerCase();

describe('core RLS policy consolidation', () => {
  it('removes anonymous write and administrative table privileges', () => {
    expect(migration).toContain('revoke all on table public.subscriptions from anon, authenticated');
    expect(migration).toContain('grant select, insert, update, delete on table public.subscriptions to authenticated');
    expect(migration).toContain('grant select on table public.supplier_profiles to anon');
    expect(migration).not.toContain('grant insert, update, delete on table public.supplier_profiles to anon');
  });

  it('defines one explicit subscription policy per command', () => {
    expect(migration).toContain('create policy subscriptions_read');
    expect(migration).toContain('create policy subscriptions_create');
    expect(migration).toContain('create policy subscriptions_update');
    expect(migration).toContain('create policy subscriptions_delete');
    expect(migration).toContain('to authenticated');
  });

  it('locks subscription approval and commercial fields for members', () => {
    expect(migration).toContain('new.org_id := old.org_id');
    expect(migration).toContain('new.plan_id := old.plan_id');
    expect(migration).toContain("new.status in ('pending', 'cancelled')");
    expect(migration).toContain('new.approved_by := old.approved_by');
  });

  it('separates anonymous visibility from authenticated supplier management', () => {
    expect(migration).toContain('create policy supplier_profiles_anon_read');
    expect(migration).toContain('create policy supplier_profiles_authenticated_read');
    expect(migration).toContain('create policy supplier_sectors_anon_read');
    expect(migration).toContain('create policy supplier_sectors_member_delete');
  });
});
