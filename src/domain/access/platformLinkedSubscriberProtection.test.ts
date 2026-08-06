import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/202608050002_protect_platform_linked_subscribers.sql','utf8');
const api = fs.readFileSync('src/modules/platform-admin/organizationAdminApi.ts','utf8');
const workspace = fs.readFileSync('src/modules/platform-admin/AdminOrganizationLifecycleWorkspace.tsx','utf8');

describe('platform-linked subscriber protection',()=>{
  it('blocks restrictive lifecycle transitions on the server',()=>{
    expect(migration).toContain("new.status in ('suspended','closed','purged')");
    expect(migration).toContain('private.organization_has_protected_staff(old.id)');
    expect(migration).toContain('before update of status on public.organizations');
  });
  it('exposes protected organization ids only to authenticated administrators',()=>{
    expect(migration).toContain('public.admin_list_protected_organization_ids()');
    expect(migration).toContain("not public.is_platform_admin()");
    expect(migration).toContain('grant execute on function public.admin_list_protected_organization_ids() to authenticated');
  });
  it('removes lifecycle controls for protected records in the UI',()=>{
    expect(api).toContain("supabase.rpc('admin_list_protected_organization_ids')");
    expect(workspace).toContain('Platform-linked · protected');
    expect(workspace).toContain('!item.isProtected');
  });
});
