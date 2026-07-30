import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/60_procurement_search_intelligence.sql'),
  'utf8',
).toLowerCase();
const api = readFileSync(resolve(process.cwd(), 'src/lib/procurementApi.ts'), 'utf8');
const workspace = readFileSync(resolve(process.cwd(), 'src/components/Workspaces.tsx'), 'utf8');

describe('procurement search intelligence', () => {
  it('keeps insights platform-admin-only and contains no visitor identities', () => {
    expect(migration).toContain('if not public.is_platform_admin()');
    expect(migration).toContain('revoke all on function public.admin_get_procurement_search_insights(integer) from public, anon');
    expect(migration).not.toContain("'visitor_hash'");
    expect(migration).not.toContain("'user_id'");
  });

  it('reports trends, demand and actionable content gaps', () => {
    for (const signal of ['daily_trend', 'top_terms', 'content_gaps', 'sector_demand', 'country_demand', 'district_demand']) {
      expect(migration).toContain(`'${signal}'`);
    }
    expect(migration).toContain("'zero_result_rate'");
  });

  it('maps search insights into the existing platform analytics workspace', () => {
    expect(api).toContain("supabase.rpc('admin_get_procurement_search_insights'");
    expect(workspace).toContain('What users are looking for');
    expect(workspace).toContain('Content gaps to address');
    expect(workspace).toContain('Demand by sector');
    expect(workspace).toContain('Demand by location');
    expect(workspace).toContain('anonymous or signed-in visitors');
  });
});
