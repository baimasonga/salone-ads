import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const server = readFileSync('server.ts', 'utf8');
const docker = readFileSync('Dockerfile', 'utf8');
const migration = readFileSync('supabase/migrations/20260811235500_upload_endpoint_protection.sql', 'utf8');

describe('upload and endpoint protection', () => {
  it('requires authenticated rate-limited ClamAV scanning before upload', () => {
    expect(server).toContain("app.post('/api/security/scan', scanRateLimiter, requireUser");
    expect(server).toContain("spawn('clamscan'");
    expect(docker).toContain('clamav');
  });

  it('keeps scan evidence private and limits privileged review', () => {
    expect(migration).toContain('alter table public.upload_security_events enable row level security');
    expect(migration).toContain('revoke all on table public.upload_security_events from public, anon, authenticated');
    expect(migration).toContain("caller_role not in ('owner','administrator','auditor','support')");
  });
});
