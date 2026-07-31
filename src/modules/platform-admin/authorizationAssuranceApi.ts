export interface AuthorizationAssuranceSummary {
  publicTables: number;
  rlsProtectedTables: number;
  registeredResources: number;
  passingResources: number;
  unsafeAnonDefiners: number;
  authorizationDenials: number;
  crossTenantDenials: number;
  roleDenials: number;
}

export interface AuthorizationResourcePosture {
  tableName: string;
  domain: string;
  classification: 'internal' | 'confidential' | 'restricted';
  rlsEnabled: boolean;
  hasPolicy: boolean;
  hasTenantGuard: boolean;
  status: 'pass' | 'attention';
}

export interface AuthorizationDenial {
  occurredAt: string;
  permission: string;
  resourceType: string;
  reasonCode: string;
  orgId: string | null;
}

export interface AuthorizationAssuranceReport {
  generatedAt: string;
  windowDays: number;
  summary: AuthorizationAssuranceSummary;
  resources: AuthorizationResourcePosture[];
  recentDenials: AuthorizationDenial[];
}

async function getSupabase() {
  return (await import('../../lib/supabaseClient')).supabase;
}

export async function fetchAuthorizationAssurance(days: number): Promise<AuthorizationAssuranceReport> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('admin_get_authorization_assurance', { p_days: days });
  if (error) throw new Error(error.message);
  return data as AuthorizationAssuranceReport;
}
