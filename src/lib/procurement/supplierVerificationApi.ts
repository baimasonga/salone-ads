import { supabase } from '../supabaseClient';

export interface SupplierProfile {
  tradingName: string;
  registrationNumber: string;
  taxIdentificationNumber: string;
  description: string;
  website: string;
  yearEstablished: number | null;
  employeeCount: string;
  geographicCoverage: string;
  certifications: string;
  majorClients: string;
}

const EMPTY_SUPPLIER_PROFILE: SupplierProfile = {
  tradingName: '',
  registrationNumber: '',
  taxIdentificationNumber: '',
  description: '',
  website: '',
  yearEstablished: null,
  employeeCount: '',
  geographicCoverage: '',
  certifications: '',
  majorClients: '',
};

export async function enableSupplierMode(orgId: string): Promise<void> {
  const { error: orgError } = await supabase.from('organizations').update({ is_supplier: true }).eq('id', orgId);
  if (orgError) throw orgError;
  const { error: profileError } = await supabase
    .from('supplier_profiles')
    .upsert({ org_id: orgId }, { onConflict: 'org_id', ignoreDuplicates: true });
  if (profileError) throw profileError;
}

export async function fetchSupplierProfile(orgId: string): Promise<SupplierProfile> {
  const { data, error } = await supabase
    .from('supplier_profiles')
    .select('trading_name, registration_number, tax_identification_number, description, website, year_established, employee_count, geographic_coverage, certifications, major_clients')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_SUPPLIER_PROFILE;
  return {
    tradingName: data.trading_name ?? '',
    registrationNumber: data.registration_number ?? '',
    taxIdentificationNumber: data.tax_identification_number ?? '',
    description: data.description ?? '',
    website: data.website ?? '',
    yearEstablished: data.year_established,
    employeeCount: data.employee_count ?? '',
    geographicCoverage: data.geographic_coverage ?? '',
    certifications: data.certifications ?? '',
    majorClients: data.major_clients ?? '',
  };
}

export async function saveSupplierProfile(orgId: string, profile: SupplierProfile): Promise<void> {
  const { error } = await supabase
    .from('supplier_profiles')
    .update({
      trading_name: profile.tradingName,
      registration_number: profile.registrationNumber,
      tax_identification_number: profile.taxIdentificationNumber,
      description: profile.description,
      website: profile.website,
      year_established: profile.yearEstablished,
      employee_count: profile.employeeCount,
      geographic_coverage: profile.geographicCoverage,
      certifications: profile.certifications,
      major_clients: profile.majorClients,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId);
  if (error) throw error;
}

export interface VerificationRequest {
  id: string;
  requestType: string;
  status: string;
  notes: string | null;
  reviewerNote: string | null;
  submittedAt: string;
}

export async function submitVerificationRequest(orgId: string, requestType: 'supplier' | 'buyer', notes: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('verification_requests').insert({
    org_id: orgId,
    request_type: requestType,
    notes,
    submitted_by: user.id,
  });
  if (error) throw error;
}

export async function fetchMyVerificationRequests(orgId: string): Promise<VerificationRequest[]> {
  const { data, error } = await supabase
    .from('verification_requests')
    .select('id, request_type, status, notes, reviewer_note, submitted_at')
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    notes: row.notes,
    reviewerNote: row.reviewer_note,
    submittedAt: row.submitted_at,
  }));
}

export interface VerificationQueueItem extends VerificationRequest {
  orgName: string;
  orgId: string;
}

export async function fetchVerificationQueue(): Promise<VerificationQueueItem[]> {
  const { data, error } = await supabase
    .from('verification_requests')
    .select('id, request_type, status, notes, reviewer_note, submitted_at, org_id, organizations(name)')
    .in('status', ['submitted', 'under_review', 'additional_info_required'])
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    notes: row.notes,
    reviewerNote: row.reviewer_note,
    submittedAt: row.submitted_at,
    orgId: row.org_id,
    orgName: row.organizations?.name ?? 'Unknown organization',
  }));
}

export async function approveVerification(requestId: string, orgId: string, requestType: 'supplier' | 'buyer'): Promise<void> {
  const { executeBackendCommand } = await import('../commandApi');
  await executeBackendCommand('organization.verification.approve', { requestId, orgId, requestType });
}

export async function rejectVerification(requestId: string, note: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('verification_requests')
    .update({ status: 'rejected', reviewer_note: note, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}
