import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('customer support production deployment', () => {
  it('uses a commit-specific container identity', () => {
    expect(read('worker/index.ts')).toContain('env.RELEASE_VERSION');
    expect(read('wrangler.containers.toml')).toContain('RELEASE_VERSION');
  });

  it('rejects a deployment that serves a stale navigation bundle', () => {
    const workflow = read('.github/workflows/deploy-containers.yml');
    expect(workflow).toContain('Verify deployed customer support navigation');
    expect(workflow).toContain("grep -Fq 'Customer Support Centre'");
    expect(workflow).toContain('Verify deployed release identity');
    expect(workflow).toContain('r.commit===process.env.GITHUB_SHA');
    expect(workflow).toContain('for attempt in {1..120}');
  });
});
