import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/production-monitoring.yml', 'utf8');

describe('production monitoring', () => {
  it('checks health, branding, bundle freshness and response time every fifteen minutes', () => {
    expect(workflow).toContain("cron: '*/15 * * * *'");
    expect(workflow).toContain('/api/health');
    expect(workflow).toContain('/hyderra-favicon.svg?v=2');
    expect(workflow).toContain('/hyderra-horizontal.svg?v=2');
    expect(workflow).toContain('observed > 5.0');
  });
});
