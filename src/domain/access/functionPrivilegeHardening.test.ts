import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/30_function_privilege_hardening.sql'),
  'utf8',
).toLowerCase();

describe('function privilege hardening migration', () => {
  it('does not make blanket privilege changes to unrelated functions', () => {
    expect(migration).not.toContain('revoke execute on all functions');
    expect(migration).not.toContain('alter default privileges');
  });

  it('moves privileged authorization checks behind the private schema', () => {
    expect(migration).toContain('function private.is_platform_admin()');
    expect(migration).toContain('function private.is_org_member(target_org_id uuid)');
    expect(migration).toContain('function private.user_has_tender_feature(p_feature_key text)');
    expect(migration).toContain("security definer\nset search_path to 'pg_catalog'");
  });

  it('keeps public policy helpers as security-invoker functions', () => {
    expect(migration).toContain('function public.is_platform_admin()');
    expect(migration).toContain('function public.is_org_member(target_org_id uuid)');
    expect(migration).toContain('function public.user_has_tender_feature(p_feature_key text)');
    expect(migration.match(/security invoker/g)).toHaveLength(3);
    expect(migration).toContain('select private.user_has_tender_feature(p_feature_key)');
  });
});
