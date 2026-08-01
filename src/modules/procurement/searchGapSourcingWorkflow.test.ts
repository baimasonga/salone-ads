import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('migrations/manohub-new-project/61_search_gap_sourcing_workflow.sql', 'utf8');
const operationsMigration = readFileSync('migrations/manohub-new-project/62_sourcing_task_operations.sql', 'utf8');
const api = readFileSync('src/lib/procurement/sourcingApi.ts', 'utf8');
const analytics = readFileSync('src/components/Workspaces.tsx', 'utf8');
const workspace = readFileSync('src/modules/procurement/OpportunityIngestionWorkspace.tsx', 'utf8');

describe('search-gap sourcing workflow', () => {
  it('keeps task mutations behind role-checked RPCs and RLS', () => {
    expect(migration).toContain('alter table public.opportunity_sourcing_tasks enable row level security');
    expect(migration).toContain('revoke all on public.opportunity_sourcing_tasks from public, anon, authenticated');
    expect(migration).toContain('if not public.is_platform_admin()');
    expect(migration).toContain('task.assigned_to = auth.uid()');
  });

  it('notifies assignments, audits changes and completes only on publication', () => {
    expect(migration).toContain("'sourcing_task.assigned'");
    expect(migration).toContain("'sourcing_task.completed'");
    expect(migration).toContain('insert into public.notifications');
    expect(migration).toContain("status.code in ('published', 'amended', 'deadline_extended')");
    expect(migration).toContain('completion occurs automatically when a matching tender is published');
  });

  it('connects analytics demand to a linked ingestion capture', () => {
    expect(api).toContain("supabase.rpc('create_sourcing_task_from_gap'");
    expect(api).toContain('sourcing_task_id: input.sourcingTaskId || null');
    expect(analytics).toContain('Create task');
    expect(workspace).toContain('Search-gap sourcing tasks');
    expect(workspace).toContain('Use for capture');
  });

  it('provides operational filters, evidence and immutable event history', () => {
    expect(operationsMigration).toContain('opportunity_sourcing_task_events');
    expect(operationsMigration).toContain('revoke all on public.opportunity_sourcing_task_events from public, anon, authenticated');
    expect(operationsMigration).toContain('opportunity_sourcing_task_event_capture');
    expect(api).toContain('fetchOpportunitySourcingTaskEvents');
    expect(workspace).toContain('Overdue ${taskCounts.overdue}');
    expect(workspace).toContain('Add evidence URL');
    expect(workspace).toContain('History ({events.length})');
  });
});
