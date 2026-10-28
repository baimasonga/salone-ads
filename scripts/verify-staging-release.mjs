import { pathToFileURL } from 'node:url';

// Read-only checks: no authentication, uploads, commands or email are executed.
export async function verifyStagingRelease({ baseUrl, expectedCommit, fetchImpl = fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)), propagationAttempts = 1 }) {
  const target = new URL(baseUrl);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('Staging URL must be an HTTPS origin without credentials, a path, query or fragment.');
  }
  if (!/^[a-f0-9]{40}$/.test(expectedCommit || '')) throw new Error('Expected release must be a full Git commit SHA.');
  const request = async (path, options = {}) => fetchImpl(new URL(path, target), {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(30_000),
  });
  // A new release starts a fresh container, including the antivirus service.
  // Retry startup transport failures. The CLI additionally allows bounded
  // release propagation; wrong environments and security failures stay fatal.
  let healthResponse;
  let lastStartupError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      healthResponse = await request('/api/health');
      if (![502, 503, 504].includes(healthResponse.status)) break;
      lastStartupError = `HTTP ${healthResponse.status}`;
      await healthResponse.body?.cancel();
    } catch (error) {
      lastStartupError = error instanceof Error ? error.message : 'network error';
    }
    if (attempt === 6) {
      throw new Error(`Staging /api/health unavailable after 6 startup attempts: ${lastStartupError}`);
    }
    await sleepImpl(5_000);
  }
  if (healthResponse.status !== 200) throw new Error('Staging health request failed.');
  let health = await healthResponse.json();
  for (let attempt = 1; ; attempt++) {
    if (health.status !== 'healthy' || health.environment !== 'staging') throw new Error('Staging health does not match the expected environment and commit.');
    if (health.release === expectedCommit) break;
    if (attempt >= propagationAttempts) throw new Error('Staging health does not match the expected environment and commit.');
    await sleepImpl(5_000);
    const refreshed = await request('/api/health');
    if (refreshed.status !== 200) throw new Error('Staging health request failed.');
    health = await refreshed.json();
  }
  for (let attempt = 1; ; attempt++) {
    const releaseResponse = await request('/release.json');
    if (releaseResponse.status === 200 && (await releaseResponse.json()).commit === expectedCommit) break;
    if (attempt >= propagationAttempts) throw new Error('Staging frontend release identity is stale or unavailable.');
    await sleepImpl(5_000);
  }
  const checked = ['/api/health', '/release.json'];
  for (const path of ['/server.cjs', '/server.cjs.map']) {
    if ((await request(path)).status !== 404) throw new Error(`Backend artifact is exposed: ${path}`);
    checked.push(path);
  }
  for (const path of ['/api/commands', '/api/security/upload', '/api/gemini/generate', '/api/internal/email/send']) {
    if ((await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status !== 401) {
      throw new Error(`Unauthenticated request was not denied: ${path}`);
    }
    checked.push(path);
  }
  return { environment: 'staging', commit: expectedCommit, checksPassed: checked.length, checked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await verifyStagingRelease({ baseUrl: process.env.STAGING_TARGET_URL, expectedCommit: process.env.EXPECTED_RELEASE_COMMIT, propagationAttempts: 12 }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Staging verification failed.');
    process.exitCode = 1;
  }
}
