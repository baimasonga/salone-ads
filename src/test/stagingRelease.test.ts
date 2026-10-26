// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { verifyStagingRelease } from '../../scripts/verify-staging-release.mjs';
const commit = 'a'.repeat(40);
function fixture(options: { environment?: string; release?: string; artifactStatus?: number; apiStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === '/api/health') return Response.json({ status: 'healthy', environment: options.environment ?? 'staging', release: options.release ?? commit });
    if (path === '/release.json') return Response.json({ commit });
    if (path.endsWith('.cjs') || path.endsWith('.map')) return new Response('', { status: options.artifactStatus ?? 404 });
    return new Response('', { status: options.apiStatus ?? 401 });
  });
}
describe('staging release verification', () => {
  it('verifies exact release identity and public boundaries using unauthenticated probes', async () => {
    const fetchImpl = fixture();
    const result = await verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl });
    expect(result.checksPassed).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.redirect).toBe('manual');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    }
  });
  it.each([{ environment: 'production' }, { release: 'b'.repeat(40) }])('rejects a wrong environment or stale release: %j', async options => {
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl: fixture(options) })).rejects.toThrow('expected environment and commit');
  });
  it('rejects exposed backend source', async () => {
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl: fixture({ artifactStatus: 200 }) })).rejects.toThrow('exposed');
  });
  it('rejects missing authentication boundaries', async () => {
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl: fixture({ apiStatus: 200 }) })).rejects.toThrow('not denied');
  });
  it('rejects redirects rather than silently following them to another environment', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://production.example.com' } }));
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl })).rejects.toThrow('health request failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid targets before making any requests', async () => {
    const fetchImpl = fixture();
    await expect(verifyStagingRelease({ baseUrl: 'http://staging.example.com', expectedCommit: commit, fetchImpl })).rejects.toThrow('HTTPS origin');
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: 'main', fetchImpl })).rejects.toThrow('full Git commit');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
