import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/59_procurement_ranked_search.sql'),
  'utf8',
).toLowerCase();
const api = readFileSync(resolve(process.cwd(), 'src/lib/procurementApi.ts'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'src/components/TenderSearchPage.tsx'), 'utf8');

describe('ranked procurement search foundation', () => {
  it('indexes weighted procurement content and uses full-text ranking', () => {
    expect(migration).toContain('opportunities_search_vector_idx');
    expect(migration).toContain("setweight(to_tsvector('simple'::regconfig");
    expect(migration).toContain('ts_rank_cd');
    expect(migration).toContain('websearch_to_tsquery');
  });

  it('keeps the public RPC restricted to public tender statuses', () => {
    expect(migration).toContain("status.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded')");
    expect(migration).toContain('grant execute on function public.search_public_opportunities');
    expect(migration).toContain('to anon, authenticated, service_role');
  });

  it('moves filters and sorting to the ranked server search', () => {
    expect(api).toContain("supabase.rpc('search_public_opportunities'");
    expect(api).not.toContain("query.ilike('title'");
    expect(page).toContain('Most relevant');
    expect(page).toContain('resultCount');
  });

  it('records protected search analytics without granting table access', () => {
    expect(migration).toContain('public.procurement_search_events');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on public.procurement_search_events from public, anon, authenticated');
    expect(migration).toContain('admin_get_procurement_search_insights');
  });
});
