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

if (failures.length) throw new Error(`RLS security gate failed:\n- ${failures.join('\n- ')}`);
process.stdout.write('RLS security gate passed: anonymous access is denied at all tested administrative boundaries.\n');
