import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/34_public_measurement_abuse_protection.sql'),
  'utf8',
).toLowerCase();
const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');

describe('public measurement abuse protection', () => {
  it('requires privacy-safe visitor hashes for tender and redirect metrics', () => {
    expect(migration).toContain('function public.increment_opportunity_view(');
    expect(migration).toContain('function public.resolve_tracking_link(');
    expect(migration.match(/\^\[0-9a-f\]\{64\}\$/g)).toHaveLength(4);
    expect(migration).not.toContain('ip_address');
  });

  it('deduplicates and rate-limits public measurements', () => {
    expect(migration).toContain("viewed_at >= now() - interval '30 minutes'");
    expect(migration).toContain("clicked_at >= now() - interval '10 minutes'");
    expect(migration).toContain('recent_count >= 60');
    expect(migration).toContain('recent_count >= 100');
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('aggregates rejections and bounds raw-event retention', () => {
    expect(migration).toContain('measurement_rejection_rollups');
    expect(migration).toContain("viewed_at < now() - interval '90 days'");
    expect(migration).toContain("created_at < now() - interval '400 days'");
    expect(migration).toContain("clicked_at < now() - interval '400 days'");
    expect(migration).toContain('limit 5000');
  });

  it('adds server-side redirect throttling and strips full referrers', () => {
    expect(server).toContain('const redirectRateLimiter = rateLimit({');
    expect(server).toContain('app.get("/r/:code", redirectRateLimiter');
    expect(server).toContain('p_referrer_host: safeReferrerHost');
    expect(server).toContain('p_visitor_token_hash: redirectVisitorToken');
  });
});
