import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  resolve(process.cwd(), 'src/components/Workspaces.tsx'),
  'utf8',
);

describe('workspace source integrity', () => {
  it('retains early, middle and late workspace implementations', () => {
    expect(workspaceSource).toContain("activeTab === 'notifications'");
    expect(workspaceSource).toContain("activeTab === 'campaign-builder'");
    expect(workspaceSource).toContain("activeTab === 'admin'");
    expect(workspaceSource).toContain('Workspace Pending Initialization');
  });

  it('retains the complete workspace source rather than a partial publish', () => {
    expect(workspaceSource.split('\n').length).toBeGreaterThan(5_700);
    expect(workspaceSource.trimEnd().endsWith('}')).toBe(true);
  });
});
