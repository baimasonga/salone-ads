import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const probe=readFileSync(resolve(process.cwd(),'scripts/verify-rls-security.mjs'),'utf8');
const ci=readFileSync(resolve(process.cwd(),'.github/workflows/ci.yml'),'utf8');
const deploy=readFileSync(resolve(process.cwd(),'.github/workflows/deploy-containers.yml'),'utf8');
const playwright=readFileSync(resolve(process.cwd(),'playwright.config.ts'),'utf8');

describe('runtime security and journey gates',()=>{
  it('probes anonymous access to protected operational data',()=>{for(const table of['platform_incidents','restore_exercises','business_events','audit_logs','organization_members'])expect(probe).toContain(`'${table}'`)});
  it('probes privileged RPC authorization boundaries',()=>{for(const rpc of['admin_list_incidents','admin_list_organizations','admin_list_business_events','get_background_job_summary'])expect(probe).toContain(`'${rpc}'`)});
  it('runs the RLS gate in CI and before production deployment',()=>{expect(ci).toContain('npm run test:rls');expect(deploy).toContain('npm run test:rls')});
  it('runs browser journeys for desktop and mobile',()=>{expect(playwright).toContain('desktop-chromium');expect(playwright).toContain('mobile-chromium');expect(ci).toContain('npm run test:e2e');expect(deploy).toContain('npm run test:e2e')});
});
