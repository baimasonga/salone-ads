import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(resolve(process.cwd(),'migrations/manohub-new-project/44_central_usage_quotas.sql'),'utf8');
describe('central usage quotas', () => {
  it('provides overrides, meters and organization snapshots', () => {
    expect(sql).toContain('organization_quota_overrides');
    expect(sql).toContain('organization_usage_meters');
    expect(sql).toContain('get_org_quota_snapshot');
  });
  it('guards consumption atomically and rolls back over-limit increments', () => {
    expect(sql).toContain('on conflict(org_id,meter_key,period_start) do update');
    expect(sql).toContain('on conflict(org_id,meter_key,idempotency_key) do nothing');
    expect(sql).toContain("raise exception 'Quota exceeded");
    expect(sql).toContain('get_effective_org_quota');
  });
  it('restricts overrides to platform administrators', () => {
    expect(sql).toContain('set_org_quota_override');
    expect(sql).toContain('not public.is_platform_admin()');
    expect(sql).toContain('revoke all on public.organization_quota_overrides');
  });
});
