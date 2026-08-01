import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/58_tender_alert_email_delivery.sql'),
  'utf8',
).toLowerCase();
const emailModule = readFileSync(resolve(process.cwd(), 'server/email/audienceEmail.ts'), 'utf8');
const resendProvider = readFileSync(resolve(process.cwd(), 'server/email/resendProvider.ts'), 'utf8');

describe('tender alert delivery foundation', () => {
  it('queues immediate and digest matches through durable jobs', () => {
    expect(migration).toContain('public.enqueue_due_tender_alert_jobs');
    expect(migration).toContain("'tender.alert.dispatch'");
    expect(migration).toContain("ss.frequency = 'immediate'");
    expect(migration).toContain("ss.frequency = 'daily'");
    expect(migration).toContain("ss.frequency = 'weekly'");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it('tracks delivery, provider events and suppression evidence', () => {
    expect(migration).toContain('public.tender_alert_deliveries');
    expect(migration).toContain('public.tender_alert_email_events');
    expect(migration).toContain('public.tender_alert_email_suppressions');
    expect(migration).toContain('enable row level security');
  });

  it('uses verified webhooks and deterministic idempotency', () => {
    expect(emailModule).toContain('manohub-tender-alert-${delivery.id}');
    expect(emailModule).toContain('tender_alert_email_events');
    expect(emailModule).toContain('tender_alert_email_suppressions');
    expect(emailModule).toContain('email.complained');
    expect(emailModule).toContain('email.bounced');
    expect(resendProvider).toContain('webhooks.verify');
  });
});
