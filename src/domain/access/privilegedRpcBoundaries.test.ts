import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/36_harden_privileged_rpc_boundaries.sql'),
  'utf8',
).toLowerCase();

describe('privileged RPC boundaries', () => {
  it('prevents browser clients from fabricating audit evidence', () => {
    expect(migration).toContain(
      'revoke all on function public.log_audit_event(text, text, text, uuid, jsonb)',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });

  it('requires owner authority before granting owner access', () => {
    expect(migration).toContain("if p_role = 'owner' and caller_role <> 'owner'");
    expect(migration).toContain(
      "raise exception 'only an organization owner can grant owner access'",
    );
  });

  it('retains authenticated invitation access without anonymous execution', () => {
    expect(migration).toContain(
      'revoke all on function public.invite_team_member(uuid, text, text)',
    );
    expect(migration).toContain('to authenticated, service_role');
  });

  it('uses a bounded email input and hardened function search path', () => {
    expect(migration).toContain("set search_path to 'pg_catalog', 'public'");
    expect(migration).toContain('length(normalized_email) > 320');
    expect(migration).toContain("normalized_email !~ '^[^[:space:]@]+");
  });
});
