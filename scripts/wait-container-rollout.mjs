import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

export function imageFromDeploymentLog(log) {
  const plain = log.replace(/\u001b\[[0-9;]*m/g, '');
  const matches = [...plain.matchAll(/\+ image = "([^"\s]+@sha256:[a-f0-9]{64})"/g)];
  if (!matches.length) throw new Error('Deployment did not report an exact new image digest; refusing to infer readiness from older metadata.');
  return matches.at(-1)[1];
}

export async function waitForContainerRollout({ accountId, token, applicationName, expectedImage,
  fetchImpl = fetch, sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxAttempts = 36 }) {
  if (!accountId || !token || !expectedImage || !['manohub-staging-container-manohubcontainer', 'manohub-container-manohubcontainer'].includes(applicationName)) {
    throw new Error('Container rollout requires credentials and a known application name.');
  }
  const get = async path => {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/containers${path}`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Container rollout metadata request failed: HTTP ${response.status}.`);
    const body = await response.json();
    return body.result ?? body;
  };
  const list = await get('/applications');
  const applications = Array.isArray(list) ? list : list.data ?? list.applications ?? [];
  const application = applications.find(item => item.name === applicationName);
  if (!application) throw new Error('The deployed container application was not found.');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const app = await get(`/applications/${encodeURIComponent(application.id)}`);
    const response = await get(`/applications/${encodeURIComponent(application.id)}/deployments`);
    const deployments = Array.isArray(response) ? response : response.data ?? response.deployments ?? [];
    const current = deployments.filter(item => item.image === app.configuration?.image && item.app_version === app.version);
    if (app.configuration?.image === expectedImage && current.length && current.length === deployments.length
      && current.every(item => item.current_placement?.status?.health === 'running')) {
      return { application: applicationName, version: app.version, readyPlacements: current.length };
    }
    if (attempt < maxAttempts) await sleepImpl(5_000);
  }
  throw new Error('Container image placements did not become ready before the rollout deadline. Final release was not activated.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await waitForContainerRollout({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN, applicationName: process.env.CONTAINER_APPLICATION_NAME,
      expectedImage: imageFromDeploymentLog(readFileSync(process.env.CONTAINER_DEPLOY_LOG, 'utf8')) })));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Container rollout failed.');
    process.exitCode = 1;
  }
}
