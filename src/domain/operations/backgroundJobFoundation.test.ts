import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/37_durable_background_job_foundation.sql'),
  'utf8',
).toLowerCase();

describe('durable background job foundation', () => {
  it('provides idempotent queue storage with bounded lifecycle states', () => {
    expect(migration).toContain('unique (job_type, idempotency_key)');
    expect(migration).toContain("'queued', 'processing', 'completed', 'dead_letter'");
    expect(migration).toContain('on conflict (job_type, idempotency_key)');
  });

  it('claims work safely across concurrent workers', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("status = 'processing'");
    expect(migration).toContain('attempts = j.attempts + 1');
    expect(migration).toContain('locked_by = btrim(p_worker_id)');
  });

  it('supports retries, dead letters and stalled lease recovery', () => {
    expect(migration).toContain("then 'dead_letter' else 'queued'");
    expect(migration).toContain('private.fail_background_job');
    expect(migration).toContain('private.recover_stalled_background_jobs');
    expect(migration).toContain('make_interval(secs => least(3600');
  });

  it('keeps queue operations outside browser roles', () => {
    expect(migration).toContain(
      'revoke all on table private.background_jobs from public, anon, authenticated',
    );
    expect(migration).toContain(
      'revoke all on function private.enqueue_background_job',
    );
    expect(migration).toContain('to service_role');
  });

  it('provides admin monitoring and dead-letter replay', () => {
    expect(migration).toContain('public.get_background_job_summary');
    expect(migration).toContain('public.admin_replay_background_job');
    expect(migration).toContain("raise exception 'admin access required'");
  });
});
