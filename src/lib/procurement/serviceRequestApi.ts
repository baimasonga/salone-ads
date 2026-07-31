import { supabase } from '../supabaseClient';

// --- Service requests ---

export type ServiceType =
  | 'document_retrieval'
  | 'tender_clarification'
  | 'eligibility_assessment'
  | 'bid_readiness_review'
  | 'proposal_review'
  | 'company_profile_prep'
  | 'supplier_registration_assistance'
  | 'featured_placement'
  | 'other';

export interface ServiceRequestActivity {
  id: string;
  note: string;
  isInternal: boolean;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  orgId: string;
  orgName?: string;
  serviceType: ServiceType;
  description: string;
  status: string;
  quoteAmount: number | null;
  quoteCurrency: string | null;
  createdAt: string;
}

export async function createServiceRequest(orgId: string, serviceType: ServiceType, description: string, relatedOpportunityId?: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('service_requests').insert({
    org_id: orgId,
    requested_by: user.id,
    service_type: serviceType,
    description,
    related_opportunity_id: relatedOpportunityId || null,
  });
  if (error) throw error;
}

export async function fetchMyServiceRequests(orgId: string): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, org_id, service_type, description, status, quote_amount, quote_currency, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapServiceRequest);
}

export async function fetchAllServiceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, org_id, service_type, description, status, quote_amount, quote_currency, created_at, organizations(name)')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...mapServiceRequest(row), orgName: row.organizations?.name }));
}

function mapServiceRequest(row: any): ServiceRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    serviceType: row.service_type,
    description: row.description,
    status: row.status,
    quoteAmount: row.quote_amount !== null && row.quote_amount !== undefined ? Number(row.quote_amount) : null,
    quoteCurrency: row.quote_currency,
    createdAt: row.created_at,
  };
}

export async function fetchServiceRequestActivities(requestId: string): Promise<ServiceRequestActivity[]> {
  const { data, error } = await supabase
    .from('service_request_activities')
    .select('id, note, is_internal, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, note: row.note, isInternal: row.is_internal, createdAt: row.created_at }));
}

export async function addServiceRequestNote(requestId: string, note: string, isInternal: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('service_request_activities').insert({
    request_id: requestId,
    author_id: user.id,
    note,
    is_internal: isInternal,
  });
  if (error) throw error;
}

export async function updateServiceRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('service_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function quoteServiceRequest(id: string, amount: number, currencyCode: string): Promise<void> {
  const { error } = await supabase
    .from('service_requests')
    .update({ status: 'quoted', quote_amount: amount, quote_currency: currencyCode, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

