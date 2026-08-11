import { supabase } from './supabaseClient';

export interface AccountSession {
  id: string; createdAt: string; lastSeenAt: string; userAgent: string; ipAddress: string;
  assuranceLevel: string; current: boolean; unusual: boolean;
}

export interface AccountSecuritySnapshot {
  assuranceLevel: string; nextAssuranceLevel: string; mfaEnabled: boolean;
  sessions: AccountSession[]; recentLogins: AccountSession[];
}

const mapSession = (row: any): AccountSession => ({
  id: row.id, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt,
  userAgent: row.userAgent || 'Unknown device', ipAddress: row.ipAddress || 'Unavailable',
  assuranceLevel: row.assuranceLevel || 'aal1', current: !!row.current, unusual: !!row.unusual,
});

export async function observeAccountSession(): Promise<void> {
  const { error } = await supabase.rpc('observe_my_account_session');
  if (error) throw error;
}

export async function fetchAccountSecurity(): Promise<AccountSecuritySnapshot> {
  const [{ data, error }, assurance] = await Promise.all([
    supabase.rpc('get_my_account_security'),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (error) throw error;
  if (assurance.error) throw assurance.error;
  return {
    assuranceLevel: assurance.data.currentLevel ?? 'aal1',
    nextAssuranceLevel: assurance.data.nextLevel ?? 'aal1',
    mfaEnabled: data.mfaEnabled === true,
    sessions: (data.sessions ?? []).map(mapSession),
    recentLogins: (data.recentLogins ?? []).map(mapSession),
  };
}

export async function revokeAccountSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_my_account_session', { p_session_id: sessionId });
  if (error) throw error;
}

export async function beginTotpEnrollment(friendlyName: string) {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
  if (error) throw error;
  return data;
}

export async function verifyTotpFactor(factorId: string, code: string): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;
  const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
  if (verified.error) throw verified.error;
}

export async function verifyExistingTotp(code: string): Promise<void> {
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  const factor = factors.data.totp.find(item => item.status === 'verified');
  if (!factor) throw new Error('No verified authenticator is available.');
  await verifyTotpFactor(factor.id, code);
}

export async function removeTotpFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  await supabase.auth.refreshSession();
}
