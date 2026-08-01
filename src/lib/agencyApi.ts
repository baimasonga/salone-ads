import { fetchAdvertOrdersForOrganizations, type AdvertOrder } from './advertBillingApi';
import { supabase } from './supabaseClient';

export interface AgencyClient {
  id: string;
  agencyOrgId: string;
  clientOrgId: string;
  clientName: string;
  status: string;
  monthlyBudgetLimit: number | null;
  permissions: string[];
  reportAccessEnabled: boolean;
  createdAt: string;
}

export interface AgencyApproval {
  id: string;
  agencyClientId: string;
  campaignId: string | null;
  requestType: string;
  title: string;
  details: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

export async function fetchAgencyClients(orgId: string): Promise<AgencyClient[]> {
  const { data, error } = await supabase
    .from('agency_clients')
    .select('id, agency_org_id, client_org_id, status, monthly_budget_limit, permissions, report_access_enabled, created_at, organizations!agency_clients_client_org_id_fkey(name)')
    .or(`agency_org_id.eq.${orgId},client_org_id.eq.${orgId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    agencyOrgId: row.agency_org_id,
    clientOrgId: row.client_org_id,
    clientName: row.organizations?.name ?? 'Client organisation',
    status: row.status,
    monthlyBudgetLimit: row.monthly_budget_limit == null ? null : Number(row.monthly_budget_limit),
    permissions: row.permissions ?? [],
    reportAccessEnabled: row.report_access_enabled,
    createdAt: row.created_at,
  }));
}

export async function addAgencyClient(agencyOrgId: string, clientOrgId: string, budget: number | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const { error } = await supabase.from('agency_clients').insert({
    agency_org_id: agencyOrgId,
    client_org_id: clientOrgId,
    monthly_budget_limit: budget,
    invited_by: user.id,
  });
  if (error) throw error;
}

export async function updateAgencyClient(
  id: string,
  patch: { status?: string; permissions?: string[]; reportAccessEnabled?: boolean; monthlyBudgetLimit?: number | null },
): Promise<void> {
  const { error } = await supabase.from('agency_clients').update({
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.permissions !== undefined && { permissions: patch.permissions }),
    ...(patch.reportAccessEnabled !== undefined && { report_access_enabled: patch.reportAccessEnabled }),
    ...(patch.monthlyBudgetLimit !== undefined && { monthly_budget_limit: patch.monthlyBudgetLimit }),
    ...(patch.status === 'active' && { approved_at: new Date().toISOString() }),
  }).eq('id', id);
  if (error) throw error;
}

export async function fetchAgencyApprovals(clientIds: string[]): Promise<AgencyApproval[]> {
  if (!clientIds.length) return [];
  const { data, error } = await supabase
    .from('agency_approval_requests')
    .select('id, agency_client_id, campaign_id, request_type, title, details, status, decision_note, created_at')
    .in('agency_client_id', clientIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    agencyClientId: row.agency_client_id,
    campaignId: row.campaign_id ?? null,
    requestType: row.request_type,
    title: row.title,
    details: row.details,
    status: row.status,
    decisionNote: row.decision_note ?? null,
    createdAt: row.created_at,
  }));
}

export async function createAgencyApproval(clientId: string, title: string, details: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const { error } = await supabase.from('agency_approval_requests').insert({
    agency_client_id: clientId,
    request_type: 'campaign_submit',
    title,
    details,
    requested_by: user.id,
  });
  if (error) throw error;
}

export async function decideAgencyApproval(
  id: string,
  status: 'approved' | 'changes_requested',
  note: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('agency_approval_requests').update({
    status,
    decision_note: note || null,
    decided_by: user?.id ?? null,
    decided_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function saveAgencyProfile(
  orgId: string,
  input: { tradingName: string; reportBrandName: string; reportPrimaryColor: string; billingEmail: string },
): Promise<void> {
  const { error } = await supabase.from('agency_profiles').upsert({
    agency_org_id: orgId,
    trading_name: input.tradingName,
    report_brand_name: input.reportBrandName || null,
    report_primary_color: input.reportPrimaryColor,
    billing_email: input.billingEmail || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveAgencyBulkUpload(
  clientId: string,
  fileName: string,
  rows: Record<string, string>[],
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  if (!rows.length || rows.length > 500) throw new Error('Upload between 1 and 500 advert rows.');
  const { error } = await supabase.from('agency_bulk_uploads').insert({
    agency_client_id: clientId,
    file_name: fileName,
    row_count: rows.length,
    rows,
    status: 'review',
    uploaded_by: user.id,
  });
  if (error) throw error;
}

export async function fetchAgencyBilling(clientOrgIds: string[]): Promise<AdvertOrder[]> {
  return fetchAdvertOrdersForOrganizations(clientOrgIds);
}
