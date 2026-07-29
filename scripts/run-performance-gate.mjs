import { writeFile } from 'node:fs/promises';

const target = new URL(process.env.PERFORMANCE_TARGET_URL || 'http://127.0.0.1:3000');
const profile = process.env.PERFORMANCE_PROFILE || 'ci';
const outputPath = process.env.PERFORMANCE_REPORT_PATH || 'performance-report.json';

const profiles = {
  ci: {
    requestsPerScenario: 100,
    concurrency: 20,
    maxErrorRate: 0,
    scenarios: [
      { name: 'health', path: '/api/health', p95Ms: 500 },
      { name: 'landing', path: '/', p95Ms: 1_500 },
      { name: 'tender-search', path: '/tenders?country=Sierra%20Leone', p95Ms: 1_500 },
    ],
  },
  production: {
    requestsPerScenario: 20,
    concurrency: 5,
    maxErrorRate: 0,
    scenarios: [
      { name: 'health', path: '/api/health', p95Ms: 1_500 },
      { name: 'landing', path: '/', p95Ms: 2_500 },
      { name: 'tender-search', path: '/tenders?country=Sierra%20Leone', p95Ms: 2_500 },
    ],
  },
};

const selected = profiles[profile];
if (!selected) throw new Error(`Unknown PERFORMANCE_PROFILE "${profile}". Use ci or production.`);
if (!['http:', 'https:'].includes(target.protocol)) throw new Error('PERFORMANCE_TARGET_URL must use HTTP or HTTPS.');

function percentile(values, percentage) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(percentage * ordered.length) - 1)];
}

async function request(path) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, target), {
      headers: { accept: path === '/api/health' ? 'application/json' : 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, durationMs: performance.now() - started };
  } catch (error) {
    return { ok: false, status: 0, durationMs: performance.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runScenario(scenario) {
  for (let index = 0; index < 3; index += 1) await request(scenario.path);

  const results = [];
  let nextRequest = 0;
  async function worker() {
    while (nextRequest < selected.requestsPerScenario) {
      nextRequest += 1;
      results.push(await request(scenario.path));
    }
  }
  await Promise.all(Array.from({ length: selected.concurrency }, () => worker()));

  const durations = results.map((result) => result.durationMs);
  const failures = results.filter((result) => !result.ok);
  return {
    name: scenario.name,
    path: scenario.path,
    requests: results.length,
    concurrency: selected.concurrency,
    successful: results.length - failures.length,
    failed: failures.length,
    errorRate: failures.length / results.length,
    minMs: Math.round(Math.min(...durations)),
    medianMs: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(...durations)),
    thresholdP95Ms: scenario.p95Ms,
    statuses: Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length])),
    sampleErrors: failures.slice(0, 3).map(({ status, error }) => ({ status, error })),
  };
}

const startedAt = new Date().toISOString();
const scenarios = [];
for (const scenario of selected.scenarios) scenarios.push(await runScenario(scenario));

const failures = scenarios.flatMap((scenario) => {
  const messages = [];
  if (scenario.errorRate > selected.maxErrorRate) messages.push(`${scenario.name}: error rate ${(scenario.errorRate * 100).toFixed(2)}% exceeds ${(selected.maxErrorRate * 100).toFixed(2)}%`);
  if (scenario.p95Ms > scenario.thresholdP95Ms) messages.push(`${scenario.name}: p95 ${scenario.p95Ms}ms exceeds ${scenario.thresholdP95Ms}ms`);
  return messages;
});

const report = {
  schemaVersion: 1,
  profile,
  target: target.origin,
  startedAt,
  completedAt: new Date().toISOString(),
  thresholds: { maxErrorRate: selected.maxErrorRate },
  scenarios,
  passed: failures.length === 0,
  failures,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

for (const scenario of scenarios) {
  process.stdout.write(`${scenario.name}: ${scenario.successful}/${scenario.requests} successful, p95=${scenario.p95Ms}ms (limit ${scenario.thresholdP95Ms}ms)\n`);
}
if (failures.length) throw new Error(`Performance gate failed:\n- ${failures.join('\n- ')}`);
process.stdout.write(`Performance gate passed using the ${profile} profile.\n`);
