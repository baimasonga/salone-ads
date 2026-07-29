import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const probe = readFileSync(resolve(root, 'scripts/run-performance-gate.mjs'), 'utf8');
const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const deploy = readFileSync(resolve(root, '.github/workflows/deploy-containers.yml'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('load and performance readiness', () => {
  it('covers health, landing, and tender discovery traffic', () => {
    for (const path of ['/api/health', "'/'", '/tenders?country=Sierra%20Leone']) expect(probe).toContain(path);
  });

  it('enforces error-rate and p95 latency thresholds', () => {
    expect(probe).toContain('maxErrorRate');
    expect(probe).toContain('thresholdP95Ms');
    expect(probe).toContain('Performance gate failed');
  });

  it('uses a heavier CI profile and a gentle production profile', () => {
    expect(probe).toContain('requestsPerScenario: 100');
    expect(probe).toContain('requestsPerScenario: 20');
    expect(probe).toContain('concurrency: 20');
    expect(probe).toContain('concurrency: 5');
  });

  it('runs before release and after production deployment', () => {
    expect(packageJson.scripts['test:performance']).toBe('node scripts/run-performance-gate.mjs');
    expect(ci).toContain('npm run test:performance');
    expect(deploy).toContain('PERFORMANCE_PROFILE: production');
    expect(deploy).toContain('performance-report-production.json');
    expect(deploy).toContain('wrangler-production-deploy.log');
    expect(deploy).toContain('steps.production-url.outputs.url');
    expect(deploy).not.toContain('Report missing production smoke URL');
  });
});
