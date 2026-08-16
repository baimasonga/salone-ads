import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/manohub-new-project/88_advanced_tender_recommendations.sql', 'utf8');
const api = readFileSync('src/lib/procurement/bidPipelineApi.ts', 'utf8');
const overview = readFileSync('src/modules/procurement/ProcurementOverview.tsx', 'utf8');

describe('advanced tender recommendations', () => {
  it('uses an authenticated, entitled, organization-scoped RPC boundary', () => {
    expect(migration).toContain('public.is_org_member(p_org_id)');
    expect(migration).toContain("public.user_has_tender_feature('tender_alerts_and_details')");
    expect(migration).toContain('revoke all on function public.get_advanced_tender_recommendations');
  });

  it('ranks only open recommendations using multiple first-party signals', () => {
    expect(migration).toContain('supplier_sectors');
    expect(migration).toContain('saved_searches');
    expect(migration).toContain('followed_buyers');
    expect(migration).toContain('pipeline_records history');
    expect(migration).toContain('opportunity.submission_deadline >= now()');
  });

  it('does not recommend tenders already saved or in the organization pipeline', () => {
    expect(migration).toContain('current_pipeline.opportunity_id = opportunity.id');
    expect(migration).toContain('saved_opportunity.opportunity_id = opportunity.id');
  });

  it('returns explainable scores through the subscriber UI', () => {
    expect(api).toContain(".rpc('get_advanced_tender_recommendations'");
    expect(api).toContain('recommendationReasons');
    expect(overview).toContain('opportunity.recommendationReasons');
    expect(overview).toContain('opportunity.recommendationScore');
  });
});
