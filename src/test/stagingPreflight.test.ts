// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyMigrationAcknowledgement, verifyStagingServiceKey } from '../../scripts/staging-preflight.mjs';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'staging-preflight-')); directories.push(cwd);
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Staging Test'); git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(cwd, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(cwd, 'supabase/migrations/001.sql'), 'select 1;');
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  return { cwd, git, commit, baseline: commit() };
}
describe('staging release preflight', () => {
  it('retains verified schema acknowledgement across non-migration changes', () => {
    const repo = repository(); writeFileSync(join(repo.cwd, 'logging.toml'), 'enabled=true');
    expect(() => verifyMigrationAcknowledgement(repo.baseline, repo.commit(), repo.cwd)).not.toThrow();
  });
  it.each(['supabase/migrations/001.sql', 'migrations/manohub-new-project/98.sql'])('rejects changed migration contents in %s', path => {
    const repo = repository(); mkdirSync(join(repo.cwd, 'migrations/manohub-new-project'), { recursive: true });
    writeFileSync(join(repo.cwd, path), 'select 2;');
    expect(() => verifyMigrationAcknowledgement(repo.baseline, repo.commit(), repo.cwd)).toThrow('Database migrations changed');
  });
  it('rejects non-ancestor acknowledgements and invalid refs', () => {
    const repo = repository(); writeFileSync(join(repo.cwd, 'later.txt'), 'later'); const next = repo.commit();
    expect(() => verifyMigrationAcknowledgement(next, repo.baseline, repo.cwd)).toThrow('ancestor');
    expect(() => verifyMigrationAcknowledgement('main', next, repo.cwd)).toThrow('full commit');
  });
  const key = (ref: string, role = 'service_role') => `header.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.signature`;
  it('rejects a different project or public role without making requests', async () => {
    const fetchImpl = vi.fn();
    for (const value of [key('production'), key('test', 'anon')]) {
      await expect(verifyStagingServiceKey('https://test.supabase.co', value, fetchImpl)).rejects.toThrow('different project');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('checks valid credentials against staging without reading rows', async () => {
    const fetchImpl = vi.fn(async (_input: URL, _options: RequestInit) => new Response('[]'));
    await verifyStagingServiceKey('https://test.supabase.co', key('test'), fetchImpl);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('limit=0');
  });
  it('rejects credentials denied by the target project', async () => {
    await expect(verifyStagingServiceKey('https://test.supabase.co', key('test'), async () => new Response('', { status: 401 }))).rejects.toThrow('HTTP 401');
  });
});
