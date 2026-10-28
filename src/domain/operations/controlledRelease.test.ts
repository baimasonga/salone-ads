import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy-containers.yml'), 'utf8');
const staging = readFileSync(resolve(process.cwd(), 'wrangler.staging.toml'), 'utf8');
const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');

describe('controlled release workflow', () => {
  it('gates production behind validation and successful staging', () => {
    expect(workflow).toContain('needs: [validate, staging]');
    expect(workflow).toContain("needs.staging.result == 'success'");
    expect(workflow).not.toContain("needs.staging.result == 'skipped'");
    expect(workflow).toContain("!inputs.staging_only");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("STAGING_DATABASE_MIGRATIONS_COMMIT");
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

  it('installs the image before a secret update activates the release identity', () => {
    expect(workflow.indexOf('- name: Deploy production container'))
      .toBeLessThan(workflow.indexOf('- name: Set optional Gemini secret'));
  });

  it('publishes release and rollback metadata', () => {
    expect(workflow).toContain('release-manifest.json');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('rollback_commit');
  });
});
