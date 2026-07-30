import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/manohub-new-project/54_opportunity_ingestion_workspace.sql'),
  'utf8',
).toLowerCase();

describe('opportunity ingestion foundation', () => {
  it('keeps researcher and administrator access explicit', () => {
    expect(migration).toContain("platform_role in ('researcher', 'admin')");
    expect(migration).toContain('alter table public.opportunity_sources enable row level security');
    expect(migration).toContain('alter table public.opportunity_ingestion_items enable row level security');
    expect(migration).toContain('opportunity_ingestion_admin_delete');
  });

  it('enforces quality and duplicate controls in the database', () => {
    expect(migration).toContain('refresh_opportunity_ingestion_quality');
    expect(migration).toContain('quality_score < 75');
    expect(migration).toContain('duplicate_opportunity_id');
    expect(migration).toContain('resolve quality and duplicate checks');
  });

  it('promotes records only into the existing administrator review queue', () => {
    expect(migration).toContain('promote_opportunity_ingestion_item');
    expect(migration).toContain("where code = 'awaiting_review'");
    expect(migration).toContain("'opportunity_ingestion.promoted'");
    expect(migration).not.toContain("where code = 'published'");
  });
});
