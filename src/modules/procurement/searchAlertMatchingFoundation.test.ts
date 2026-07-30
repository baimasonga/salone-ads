import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/57_procurement_search_alert_matching.sql'),
  'utf8',
).toLowerCase();

describe('procurement search and alert matching foundation', () => {
  it('matches all supported criteria including keyword and country', () => {
    expect(migration).toContain('ss.country_id = new.country_id');
    expect(migration).toContain('ss.sector_id = new.sector_id');
    expect(migration).toContain('ss.district_id = new.district_id');
    expect(migration).toContain('ss.opportunity_type_id = new.opportunity_type_id');
    expect(migration).toContain('strpos(');
    expect(migration).toContain('new.submission_deadline > now()');
  });

  it('records durable matches before creating immediate notifications', () => {
    expect(migration).toContain('create table if not exists public.saved_search_matches');
    expect(migration).toContain("saved.frequency = 'immediate'");
    expect(migration).toContain("'match_id', inserted_match_id");
    expect(migration).toContain("delivery_status = 'notified'");
  });

  it('keeps saved searches and match evidence owner-scoped', () => {
    expect(migration).toContain('alter table public.saved_search_matches enable row level security');
    expect(migration).toContain('user_id = (select auth.uid())');
    expect(migration).toContain('revoke all on function public.notify_matching_users_on_publish() from public, anon, authenticated');
  });
});
