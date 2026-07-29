import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy-containers.yml'), 'utf8');
const staging = readFileSync(resolve(process.cwd(), 'wrangler.staging.toml'), 'utf8');
const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');

describe('controlled release workflow', () => {
  it('gates production behind validation and optional staging', () => {
    expect(workflow).toContain('needs: [validate, staging]');
    expect(workflow).toContain("needs.staging.result == 'success'");
    expect(workflow).toContain("needs.staging.result == 'skipped'");
  });

  it('deploys staging with isolated Cloudflare and Supabase configuration', () => {
    expect(staging).toContain('name = "manohub-staging-container"');
    expect(staging).toContain('MANOHUB_ENVIRONMENT = "staging"');
    expect(staging).toContain('STAGING_SUPABASE_URL');
    expect(workflow).toContain('MANOHUB_STAGING_URL');
  });

  it('runs post-deployment health checks', () => {
    expect(workflow).toContain('/api/health');
    expect(workflow).toContain('Verify staging health');
    expect(workflow).toContain('Verify production health');
    expect(server).toContain('MANOHUB_ENVIRONMENT');
  });

  it('publishes release and rollback metadata', () => {
    expect(workflow).toContain('release-manifest.json');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('rollback_commit');
  });
});
