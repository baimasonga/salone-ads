import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'migrations/manohub-new-project/66_secure_backend_command_layer.sql'), 'utf8');
const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
const workspace = readFileSync(resolve(process.cwd(), 'src/modules/platform-admin/PlatformAdminWorkspace.tsx'), 'utf8');

describe('secure backend command layer', () => {
  it('uses a durable actor-scoped idempotency envelope', () => {
    expect(migration).toContain('unique (actor_id, command_name, idempotency_key)');
    expect(migration).toContain('claim_backend_command');
    expect(migration).toContain('for update');
    expect(migration).toContain("status='succeeded'");
  });

  it('keeps command execution user-scoped and allowlisted', () => {
    expect(server).toContain('userScopedSupabase(req)');
    expect(server).toContain('Authorization: `Bearer ${token}`');
    expect(server).toContain('const COMMANDS: Record');
    expect(server).toContain('app.post("/api/commands", requireUser');
  });

  it('does not grant direct command-record writes', () => {
    expect(migration).toContain('revoke all on public.backend_command_requests from anon, authenticated');
    expect(migration).not.toContain('grant insert on public.backend_command_requests');
    expect(migration).not.toContain('grant update on public.backend_command_requests');
  });

  it('makes operations visible from Customer Requests', () => {
    expect(workspace).toContain("id: 'admin-commands'");
    expect(workspace).toContain("title: 'Command operations'");
  });
});
