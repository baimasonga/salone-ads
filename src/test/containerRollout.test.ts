// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { imageFromDeploymentLog, waitForContainerRollout } from '../../scripts/wait-container-rollout.mjs';

const name = 'manohub-staging-container-manohubcontainer';
const app = { id: 'app-id', name, version: 8, configuration: { image: 'registry/image@sha256:latest' } };
const ready = { app_version: 8, image: app.configuration.image, current_placement: { status: { health: 'running', container_status: 'stopped' } } };
function fixture(attempts: unknown[][]) {
  let call = 0;
  return vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
    if (String(input).endsWith('/applications')) return Response.json([app]);
    if (String(input).endsWith('/deployments')) return Response.json(attempts[Math.min(call++, attempts.length - 1)]);
    return Response.json(app);
  });
}
describe('container rollout readiness', () => {
  it('extracts the new digest and never selects the removed image', () => {
    const old = 'a'.repeat(64), next = 'b'.repeat(64);
    expect(imageFromDeploymentLog(`- image = "registry/image@sha256:${old}"\n+ image = "registry/image@sha256:${next}"`)).toBe(`registry/image@sha256:${next}`);
    expect(() => imageFromDeploymentLog('No image change reported')).toThrow('refusing to infer');
  });
  it('does not accept ready placements for stale application metadata', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/applications')) return Response.json([app]);
      if (String(input).endsWith('/deployments')) return Response.json([{ ...ready, image: 'old' }]);
      return Response.json({ ...app, configuration: { image: 'old' } });
    });
    await expect(waitForContainerRollout({ expectedImage: app.configuration.image, accountId: 'account', token: 'test-token', applicationName: name,
      fetchImpl, sleepImpl: async () => {}, maxAttempts: 2 })).rejects.toThrow('Final release was not activated');
  });
  it('waits for the new image and placement before activating a final identity', async () => {
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = fixture([
      [{ ...ready, image: 'old-image' }],
      [{ ...ready, current_placement: { status: { health: 'placed' } } }],
      [ready, ready],
    ]);
    await expect(waitForContainerRollout({ expectedImage: app.configuration.image, accountId: 'account', token: 'test-token', applicationName: name, fetchImpl, sleepImpl }))
      .resolves.toEqual({ application: name, version: 8, readyPlacements: 2 });
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchImpl.mock.calls) expect(options?.redirect).toBe('error');
  });
  it.each([[], [{ ...ready, app_version: 7 }], [{ ...ready, current_placement: { status: { health: 'failed' } } }]].map(deployments => ({ deployments })))('refuses an incomplete rollout %j', async ({ deployments }) => {
    const sleepImpl = vi.fn(async () => {});
    await expect(waitForContainerRollout({ expectedImage: app.configuration.image, accountId: 'account', token: 'test-token', applicationName: name,
      fetchImpl: fixture([deployments]), sleepImpl, maxAttempts: 2 })).rejects.toThrow('Final release was not activated');
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });
  it('fails on denied metadata access rather than assuming readiness', async () => {
    await expect(waitForContainerRollout({ expectedImage: app.configuration.image, accountId: 'account', token: 'test-token', applicationName: name,
      fetchImpl: async () => new Response('', { status: 403 }) })).rejects.toThrow('HTTP 403');
  });
});
