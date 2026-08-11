import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const migration=read('migrations/manohub-new-project/83_account_session_security.sql').toLowerCase();
const app=read('src/App.tsx');
const page=read('src/components/AccountSecurityPage.tsx');
const server=read('server.ts');

describe('account and session security boundary',()=>{
  it('uses Supabase MFA and blocks opted-in sessions before workspace hydration',()=>{
    expect(app).toContain('getAuthenticatorAssuranceLevel');
    expect(app).toContain('nextLevel === \'aal2\'');
    expect(app).toContain('<MfaChallengeScreen');
    for(const marker of ['mfa.enroll','mfa.challenge','mfa.verify','mfa.unenroll']) expect(read('src/lib/accountSecurityApi.ts')).toContain(marker);
  });

  it('keeps session evidence private and limits every RPC to its owner',()=>{
    expect(migration).toContain('private.account_session_events');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table private.account_session_events from public,anon,authenticated');
    expect(migration).toContain('where s.id=p_session_id and s.user_id=actor');
    expect(migration).toContain("p_session_id=current_sid");
  });

  it('alerts on a new device or network without exposing the history table',()=>{
    expect(migration).toContain("category='security'");
    expect(migration).toContain("'new sign-in detected'");
    expect(page).toContain('New device or network');
    expect(page).toContain('Recent sign-ins');
  });

  it('enforces AAL2 for sensitive commands at both API and database boundaries',()=>{
    expect(server).toContain('STEP_UP_COMMANDS');
    expect(server).toContain('MFA_STEP_UP_REQUIRED');
    expect(migration).toContain('enforce_sensitive_command_step_up');
    expect(migration).toContain("auth.jwt()->>'aal'");
  });

  it('keeps production and new-project migrations byte-identical',()=>{
    expect(read('supabase/migrations/20260811222327_account_session_security.sql')).toBe(read('migrations/manohub-new-project/83_account_session_security.sql'));
  });
});
