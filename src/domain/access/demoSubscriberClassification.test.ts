import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/202608060001_classify_demo_organizations.sql','utf8');
const api = fs.readFileSync('src/modules/platform-admin/organizationAdminApi.ts','utf8');
const workspace = fs.readFileSync('src/modules/platform-admin/AdminOrganizationLifecycleWorkspace.tsx','utf8');

describe('demo subscriber classification',()=>{
  it('uses an explicit non-destructive organization flag',()=>{
    expect(migration).toContain('add column if not exists is_demo boolean not null default false');
    expect(migration).toContain('and not exists (');
    expect(migration).not.toContain('delete from public.organizations');
  });
  it('excludes demos from genuine subscriber totals by default',()=>{
    expect(migration).toContain('p_include_demo boolean default false');
    expect(migration).toContain('p_include_demo or not o.is_demo');
    expect(api).toContain('p_include_demo: filters.includeDemo');
  });
  it('makes demo records opt-in and visibly labelled',()=>{
    expect(workspace).toContain('Include demo records');
    expect(workspace).toContain('Demo record · excluded from genuine totals');
    expect(workspace).toContain("includeDemo ? 'All filtered records' : 'Genuine subscribers'");
  });
  it('prevents ordinary subscribers changing classification',()=>{
    expect(migration).toContain('protect_organization_demo_classification');
    expect(migration).toContain('Only a platform administrator can change demo classification');
  });
});
