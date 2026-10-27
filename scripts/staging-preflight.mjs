import { execFileSync } from 'node:child_process';

export function verifyMigrationAcknowledgement(acknowledgedCommit, releaseCommit, cwd = process.cwd()) {
  if (![acknowledgedCommit, releaseCommit].every(value => /^[a-f0-9]{40}$/.test(value || ''))) {
    throw new Error('Migration acknowledgement and release must be full commit SHAs.');
  }
  const git = args => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  try { git(['merge-base', '--is-ancestor', acknowledgedCommit, releaseCommit]); }
  catch { throw new Error('Migration acknowledgement must identify an ancestor of this release.'); }
  // UI, logging and workflow-only fixes do not change the applied schema.
  // Any change to either migration directory requires a new acknowledgement.
  try {
    git(['diff', '--exit-code', acknowledgedCommit, releaseCommit, '--',
      'migrations/manohub-new-project', 'supabase/migrations']);
  } catch { throw new Error('Database migrations changed: apply and verify them, then update STAGING_DATABASE_MIGRATIONS_COMMIT.'); }
}

export async function verifyStagingServiceKey(url, key, fetchImpl = fetch) {
  if (!key) throw new Error('Staging service key is not configured.');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname === 'rffjehmbrycztiekcyho.supabase.co'
    || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('A separate HTTPS staging Supabase origin is required.');
  }
  if (key.split('.').length === 3) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); }
    catch { throw new Error('The staging service credential is malformed.'); }
    if (claims.role !== 'service_role' || `${claims.ref}.supabase.co` !== target.hostname) {
      throw new Error('STAGING_SUPABASE_SERVICE_ROLE_KEY belongs to a different project or is not a service-role key.');
    }
  }
  const response = await fetchImpl(new URL('/rest/v1/protected_upload_authorizations?select=id&limit=0', target), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Staging upload authorization preflight failed: HTTP ${response.status}.`);
  await response.body?.cancel();
}
