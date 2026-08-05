import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/71_explicit_internal_table_denials.sql'),
  'utf8',
);

describe('internal operational table API boundary', () => {
  it.each([
    'private.background_jobs',
    'public.procurement_search_events',
    'public.tender_alert_deliveries',
    'public.tender_alert_email_events',
    'public.tender_alert_email_suppressions',
  ])('explicitly denies direct API access to %s', (table) => {
    expect(migration).toContain(`on ${table}`);
  });

  it('denies every operation to both API client roles', () => {
    expect(migration.match(/for all/g)).toHaveLength(5);
    expect(migration.match(/to anon, authenticated/g)).toHaveLength(5);
    expect(migration.match(/using \(false\)/g)).toHaveLength(5);
    expect(migration.match(/with check \(false\)/g)).toHaveLength(5);
  });
});
