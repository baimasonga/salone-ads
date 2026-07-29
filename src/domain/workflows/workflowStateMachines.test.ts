import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/47_central_workflow_state_machines.sql'),
  'utf8',
);

describe('central workflow state machines', () => {
  it('catalogues the critical workflow domains', () => {
    for (const domain of ["'tender'", "'campaign'", "'cms_content'", "'subscription'"]) {
      expect(sql).toContain(domain);
    }
  });

  it('rejects transitions that are not explicitly enabled', () => {
    expect(sql).toContain('Invalid % transition: % -> %');
    expect(sql).toContain('workflow_transition_rules');
    expect(sql).toContain('and enabled');
  });

  it('records immutable history, audit context, and internal events', () => {
    for (const marker of [
      'workflow_transition_history',
      'public.audit_logs',
      'WorkflowTransitioned',
      'correlation_id',
    ]) expect(sql).toContain(marker);
  });

  it('enforces every existing critical workflow table', () => {
    for (const table of ['public.opportunities', 'public.ad_campaigns', 'public.cms_content', 'public.subscriptions']) {
      expect(sql).toContain(table);
    }
  });

  it('keeps transition administration guarded', () => {
    expect(sql).toContain('admin_list_workflow_transitions');
    expect(sql).toContain('not public.is_platform_admin()');
    expect(sql).toContain('revoke all');
  });
});
