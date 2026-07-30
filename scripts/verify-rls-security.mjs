const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for the RLS security gate.');

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
const failures = [];

async function assertAdminRpcDenied(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const payload = await response.text();
  if (response.ok || !/(admin access required|platform administrator access is required|permission denied|not authenticated)/i.test(payload)) {
    failures.push(`${name}: expected authorization denial, received HTTP ${response.status}`);
  }
}

async function assertProtectedTableEmpty(table, column = 'id') {
  const response = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, { headers });
  const payload = await response.text();
  if (!response.ok) {
    if (response.status === 401 && /(permission denied|42501)/i.test(payload)) return;
    failures.push(`${table}: unexpected security response HTTP ${response.status}`);
    return;
  }
  try {
    const rows = JSON.parse(payload);
    if (!Array.isArray(rows) || rows.length !== 0) failures.push(`${table}: anonymous role could read protected rows`);
  } catch {
    failures.push(`${table}: returned an invalid response`);
  }
}

// Anonymous access is only half the boundary. The higher-value check is that a
// signed-in user cannot reach another tenant's rows or the admin surface, so
// probe that too whenever a non-admin CI account is configured.
async function signIn(email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`RLS probe sign-in failed: HTTP ${response.status}`);
  const { access_token: token } = await response.json();
  if (!token) throw new Error('RLS probe sign-in returned no access token.');
  return token;
}

async function assertAuthenticatedBoundaries(token) {
  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  for (const name of ['admin_list_incidents', 'admin_list_organizations', 'admin_list_business_events']) {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ p_limit: 1 }),
    });
    const payload = await response.text();
    if (response.ok || !/(admin access required|permission denied|platform administrator)/i.test(payload)) {
      failures.push(`${name}: a non-admin authenticated user was not denied (HTTP ${response.status})`);
    }
  }

  // Admin-only tables must return nothing for an ordinary signed-in user.
  for (const table of ['platform_incidents', 'restore_exercises', 'business_events', 'workflow_transition_history']) {
    const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers: authHeaders });
    const payload = await response.text();
    if (!response.ok) {
      if (/(permission denied|42501)/i.test(payload)) continue;
      failures.push(`${table}: unexpected authenticated response HTTP ${response.status}`);
      continue;
    }
    try {
      const rows = JSON.parse(payload);
      if (!Array.isArray(rows) || rows.length !== 0) {
        failures.push(`${table}: a non-admin authenticated user could read admin rows`);
      }
    } catch {
      failures.push(`${table}: returned an invalid authenticated response`);
    }
  }

  // Every organization row the probe can see must be one it belongs to.
  const memberships = await fetch(`${url}/rest/v1/organization_members?select=org_id`, { headers: authHeaders });
  const visibleOrgs = await fetch(`${url}/rest/v1/organizations?select=id`, { headers: authHeaders });
  if (memberships.ok && visibleOrgs.ok) {
    const own = new Set((await memberships.json()).map((row) => row.org_id));
    const leaked = (await visibleOrgs.json()).filter((row) => !own.has(row.id));
    if (leaked.length > 0) {
      failures.push(`organizations: ${leaked.length} row(s) visible outside the probe's memberships`);
    }
  }
}

await Promise.all([
  assertAdminRpcDenied('admin_list_incidents', { p_status: null, p_limit: 1 }),
  assertAdminRpcDenied('admin_list_organizations', { p_status: null, p_search: null, p_limit: 1 }),
  assertAdminRpcDenied('admin_list_business_events', { p_status: null, p_limit: 1 }),
  assertAdminRpcDenied('get_background_job_summary', {}),
  ...[
    ['platform_incidents', 'id'],
    ['restore_exercises', 'id'],
    ['business_events', 'id'],
    ['audit_logs', 'id'],
    ['organization_members', 'org_id'],
  ].map(([table, column]) => assertProtectedTableEmpty(table, column)),
]);

const probeEmail = process.env.RLS_PROBE_EMAIL;
const probePassword = process.env.RLS_PROBE_PASSWORD;
if (probeEmail && probePassword) {
  await assertAuthenticatedBoundaries(await signIn(probeEmail, probePassword));
} else {
  process.stdout.write(
    'Note: RLS_PROBE_EMAIL/RLS_PROBE_PASSWORD are unset, so the authenticated '
    + 'cross-tenant checks were skipped. Configure a non-admin CI account to enable them.\n',
  );
}

if (failures.length) throw new Error(`RLS security gate failed:\n- ${failures.join('\n- ')}`);
process.stdout.write(
  'RLS security gate passed: anonymous access is denied at all tested administrative boundaries'
  + `${probeEmail && probePassword ? ', and an authenticated non-admin cannot reach admin data or other tenants' : ''}.\n`,
);
