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
  | 'technical_support'
  | 'billing_support'
  | 'account_support'
  | 'tender_access_support'
  | 'data_correction'
  | 'feedback'
  | 'other';

export type SupportCategory = 'technical' | 'billing' | 'account' | 'tender_access' | 'data_correction' | 'feedback' | 'other';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ServiceRequestActivity {
  id: string;
  note: string;
  isInternal: boolean;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  ticketNumber: string;
  orgId: string;
  orgName?: string;
  serviceType: ServiceType;
  requestKind: 'support' | 'service';
  subject: string;
  category: string;
  priority: SupportPriority;
  channel: string;
  description: string;
  status: string;
  quoteAmount: number | null;
  quoteCurrency: string | null;
  slaDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  customerRating: number | null;
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

export async function createSupportTicket(orgId: string, input: { subject: string; description: string; category: SupportCategory; priority: SupportPriority }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const serviceType: ServiceType = input.category === 'technical' ? 'technical_support'
    : input.category === 'billing' ? 'billing_support'
    : input.category === 'account' ? 'account_support'
    : input.category === 'tender_access' ? 'tender_access_support'
    : input.category === 'data_correction' ? 'data_correction'
    : input.category === 'feedback' ? 'feedback' : 'other';
  const { error } = await supabase.from('service_requests').insert({
    org_id: orgId, requested_by: user.id, request_kind: 'support', service_type: serviceType,
    subject: input.subject.trim(), description: input.description.trim(), category: input.category,
    priority: input.priority, channel: 'web',
  });
  if (error) throw error;
}

export async function fetchMyServiceRequests(orgId: string): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, ticket_number, org_id, request_kind, service_type, subject, category, priority, channel, description, status, quote_amount, quote_currency, sla_due_at, first_responded_at, resolved_at, customer_rating, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapServiceRequest);
}

export async function fetchAllServiceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, ticket_number, org_id, request_kind, service_type, subject, category, priority, channel, description, status, quote_amount, quote_currency, sla_due_at, first_responded_at, resolved_at, customer_rating, created_at, organizations(name)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...mapServiceRequest(row), orgName: row.organizations?.name }));
}

function mapServiceRequest(row: any): ServiceRequest {
  return {
    id: row.id,
    ticketNumber: row.ticket_number ?? '',
    orgId: row.org_id,
    requestKind: row.request_kind ?? 'service',
    serviceType: row.service_type,
    subject: row.subject ?? row.service_type,
    category: row.category ?? 'managed_service',
    priority: row.priority ?? 'normal',
    channel: row.channel ?? 'web',
    description: row.description,
    status: row.status,
    quoteAmount: row.quote_amount !== null && row.quote_amount !== undefined ? Number(row.quote_amount) : null,
    quoteCurrency: row.quote_currency,
    slaDueAt: row.sla_due_at,
    firstRespondedAt: row.first_responded_at,
    resolvedAt: row.resolved_at,
    customerRating: row.customer_rating,
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

export async function rateServiceRequest(id: string, rating: number): Promise<void> {
  const { error } = await supabase.from('service_requests').update({ customer_rating: Math.max(1, Math.min(5, Math.round(rating))) }).eq('id', id);
  if (error) throw error;
}
