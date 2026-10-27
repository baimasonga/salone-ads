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
  it('waits for cold-start timeouts and temporary gateway failures before checking the release', async () => {
    const ready = fixture();
    let attempts = 0;
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input)).pathname === '/api/health') {
        attempts++;
        if (attempts === 1) throw new DOMException('Timed out', 'TimeoutError');
        if (attempts === 2) return new Response('', { status: 503 });
      }
      return ready(input, init);
    });
    const result = await verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl, sleepImpl });
    expect(result.checksPassed).toBe(7);
    expect(attempts).toBe(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });
  it('stops after six startup failures and reports the failing endpoint', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('Timed out'); });
    const sleepImpl = vi.fn(async () => {});
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl, sleepImpl }))
      .rejects.toThrow('/api/health unavailable after 6 startup attempts: Timed out');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(sleepImpl).toHaveBeenCalledTimes(5);
  });
  it('does not retry or accept a wrong release after a temporary startup failure', async () => {
    const fetchImpl = fixture({ release: 'b'.repeat(40) });
    fetchImpl.mockRejectedValueOnce(new Error('Timed out'));
    await expect(verifyStagingRelease({ baseUrl: 'https://staging.example.com', expectedCommit: commit, fetchImpl, sleepImpl: async () => {} }))
      .rejects.toThrow('expected environment and commit');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
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
