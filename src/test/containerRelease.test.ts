// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { releaseContainerId, validateStagingConfiguration } from '../../worker/releaseIdentity';
const sha = 'a'.repeat(40);
const staging = { MANOHUB_ENVIRONMENT: 'staging', RELEASE_VERSION: sha, VITE_SUPABASE_URL: 'https://isolated-staging.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-staging-key' };
describe('release-scoped container identity', () => {
  it('keeps secret publication on the build instance until a fresh ready identity is activated', () => {
    const build = { ...staging, CONTAINER_REVISION: `${sha}-build-40601614361-1` };
    const ready = { ...staging, CONTAINER_REVISION: `${sha}-ready-40601614361-1` };
    expect(releaseContainerId(build)).not.toBe(releaseContainerId(ready));
    expect(releaseContainerId({ ...build, RELEASE_VERSION: sha })).toBe(releaseContainerId(build));
    expect(releaseContainerId(ready)).not.toBe(releaseContainerId({ ...ready, CONTAINER_REVISION: `${sha}-ready-40601614361-2` }));
  });
  it('separates the build deployment from the final secret-configured release', () => {
    expect(releaseContainerId(staging)).not.toBe(releaseContainerId({ ...staging, RELEASE_VERSION: `${sha}-build` }));
  });
  it('separates staging from production for the same commit', () => {
    expect(releaseContainerId(staging)).not.toBe(releaseContainerId({ ...staging, MANOHUB_ENVIRONMENT: 'production' }));
  });
  it('does not collapse distinct commits with a common prefix', () => {
    expect(releaseContainerId(staging)).not.toBe(releaseContainerId({ ...staging, RELEASE_VERSION: 'a'.repeat(39) + 'b' }));
  });
  it('rejects missing and production Supabase configuration in staging', () => {
    expect(() => validateStagingConfiguration({ ...staging, VITE_SUPABASE_URL: '' })).toThrow('dedicated Supabase');
    expect(() => validateStagingConfiguration({ ...staging, VITE_SUPABASE_URL: 'https://rffjehmbrycztiekcyho.supabase.co' })).toThrow('isolated Supabase');
  });
  it('accepts dedicated staging configuration', () => {
    expect(() => validateStagingConfiguration(staging)).not.toThrow();
  });
});
