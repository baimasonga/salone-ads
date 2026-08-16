import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('customer support production deployment', () => {
  it('uses the dedicated replacement container identity', () => {
    expect(read('worker/index.ts')).toContain('production-customer-support-centre-v18');
  });

  it('rejects a deployment that serves a stale navigation bundle', () => {
    const workflow = read('.github/workflows/deploy-containers.yml');
    expect(workflow).toContain('Verify deployed customer support navigation');
    expect(workflow).toContain("grep -Fq 'Customer Support Centre'");
  });
});
