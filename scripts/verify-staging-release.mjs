import { pathToFileURL } from 'node:url';

// Read-only checks: no authentication, uploads, commands or email are executed.
export async function verifyStagingRelease({ baseUrl, expectedCommit, fetchImpl = fetch }) {
  const target = new URL(baseUrl);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('Staging URL must be an HTTPS origin without credentials, a path, query or fragment.');
  }
  if (!/^[a-f0-9]{40}$/.test(expectedCommit || '')) throw new Error('Expected release must be a full Git commit SHA.');
  const request = async (path, options = {}) => fetchImpl(new URL(path, target), {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(20_000),
  });
  const healthResponse = await request('/api/health');
  if (healthResponse.status !== 200) throw new Error('Staging health request failed.');
  const health = await healthResponse.json();
  if (health.status !== 'healthy' || health.environment !== 'staging' || health.release !== expectedCommit) {
    throw new Error('Staging health does not match the expected environment and commit.');
  }
  const releaseResponse = await request('/release.json');
  if (releaseResponse.status !== 200 || (await releaseResponse.json()).commit !== expectedCommit) {
    throw new Error('Staging frontend release identity is stale or unavailable.');
  }
  const checked = ['/api/health', '/release.json'];
  for (const path of ['/server.cjs', '/server.cjs.map']) {
    if ((await request(path)).status !== 404) throw new Error(`Backend artifact is exposed: ${path}`);
    checked.push(path);
  }
  for (const path of ['/api/commands', '/api/security/upload', '/api/gemini/generate']) {
    if ((await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status !== 401) {
      throw new Error(`Unauthenticated request was not denied: ${path}`);
    }
    checked.push(path);
  }
  return { environment: 'staging', commit: expectedCommit, checksPassed: checked.length, checked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await verifyStagingRelease({ baseUrl: process.env.STAGING_TARGET_URL, expectedCommit: process.env.EXPECTED_RELEASE_COMMIT }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Staging verification failed.');
    process.exitCode = 1;
  }
}
