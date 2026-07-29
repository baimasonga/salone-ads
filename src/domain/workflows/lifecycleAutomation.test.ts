import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/48_automated_lifecycle_workflows.sql'),
  'utf8',
);

describe('automated lifecycle workflows', () => {
  it('reuses the existing campaign scheduler and centralized state machines', () => {
    expect(sql).toContain('private.run_ad_campaign_schedule()');
    expect(sql).toContain("s_current.code in ('published','amended','deadline_extended')");
    expect(sql).toContain("s_closed.code='closed'");
  });

  it('deduplicates actionable reminders', () => {
    expect(sql).toContain('notifications_automation_key_idx');
    expect(sql).toContain("'automation_key'");
    expect(sql).toContain('on conflict do nothing');
  });

  it('covers tender and subscription deadline milestones', () => {
    for (const marker of [
      "in (7,3,1)",
      "'Trial ending soon'",
      "'Subscription renewal approaching'",
      "'Subscription suspension approaching'",
    ]) expect(sql).toContain(marker);
  });

  it('records subscription automation through domain events', () => {
    expect(sql).toContain('public.subscription_events');
    expect(sql).toContain("'lifecycle_automation'");
    expect(sql).toContain("'Automatic suspension after grace period'");
  });

  it('runs hourly and exposes guarded operational history', () => {
    expect(sql).toContain("'15 * * * *'");
    expect(sql).toContain('admin_list_lifecycle_automation_runs');
    expect(sql).toContain('not public.is_platform_admin()');
  });
});
