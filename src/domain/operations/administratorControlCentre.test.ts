import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/manohub-new-project/82_administrator_control_centre.sql','utf8');
const server=fs.readFileSync('server.ts','utf8');

describe('administrator control centre foundation',()=>{
  it('keeps operational controls private, audited and restricted to owner/administrator',()=>{
    expect(migration).toContain('private.platform_intake_controls');
    expect(migration).toContain("staff_role not in ('owner','administrator')");
    expect(migration).toContain("'platform_intake_control.updated'");
    expect(migration).toContain('revoke all on table private.platform_intake_controls from public, anon, authenticated');
  });

  it('enforces all four intake controls through the idempotent command boundary',()=>{
    for(const key of ['subscriber_onboarding','procurement_submissions','advertising_orders','service_requests']) expect(migration).toContain(key);
    expect(server).toContain("'platform_intake_control.update'");
    expect(migration).toContain("'platform_intake_control.update'");
  });
});
