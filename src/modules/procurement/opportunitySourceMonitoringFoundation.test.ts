import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/56_opportunity_source_monitoring.sql'),
  'utf8',
).toLowerCase();

describe('opportunity source monitoring foundation', () => {
  it('keeps source checks restricted to research staff', () => {
    expect(migration).toContain('alter table public.opportunity_source_checks enable row level security');
    expect(migration).toContain('revoke all on public.opportunity_source_checks from anon');
    expect(migration).toContain('grant select, insert on public.opportunity_source_checks to authenticated');
    expect(migration).toContain('public.is_opportunity_researcher()');
  });

  it('records provenance without automated publication', () => {
    expect(migration).toContain('extraction_method');
    expect(migration).toContain('extraction_confidence');
    expect(migration).toContain('extracted_fields');
    expect(migration).not.toContain("where code = 'published'");
  });

  it('covers each new foreign key with an index', () => {
    expect(migration).toContain('opportunity_source_checks_source_time_idx');
    expect(migration).toContain('opportunity_source_checks_checked_by_idx');
  });
});
