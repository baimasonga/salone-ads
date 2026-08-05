import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const sql=fs.readFileSync('migrations/manohub-new-project/78_platform_staff_capability_enforcement.sql','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const navigation=fs.readFileSync('src/config/workspaceNavigation.ts','utf8');

describe('platform staff capability enforcement',()=>{
  it('keeps department capabilities separate from platform administration',()=>{
    for(const capability of ['finance:manage','editorial:manage','support:manage','audit:read']) expect(sql).toContain(capability);
    expect(sql).toContain("s.role in ('owner','administrator')");
    expect(sql).not.toContain("s.role in ('owner','administrator','finance','editorial','support','auditor')");
  });
  it('enforces read-only auditor and scoped finance/support policies',()=>{
    expect(sql).toContain("has_platform_capability('audit:read')");
    expect(sql).toContain("'not public.has_platform_capability(''finance:manage'')'");
    expect(sql).toContain("has_platform_capability('support:manage')");
  });
  it('lets staff without subscriber organizations enter an internal context',()=>{
    expect(app).toContain('PLATFORM_CONTEXT_ORG');
    expect(app).toContain('if (activeStaffRole)');
  });
  it('provides department-specific navigation',()=>{
    for(const role of ['finance','editorial','support','auditor']) expect(navigation).toContain(`platformStaffRole === '${role}'`);
  });
});
