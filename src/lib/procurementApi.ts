import { supabase } from './supabaseClient';
import { fetchMyOrganization } from './api';
import {
  OPPORTUNITY_LIST_SELECT,
  getOpportunityStatusId,
  mapOpportunityListItem,
  type OpportunityListItem,
} from './procurement/opportunityApi';

export * from './procurement/opportunityApi';

const MAX_ADVERT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ADVERT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// --- Opportunity ingestion and researcher workspace ---

export interface OpportunitySource {
  id: string;
  name: string;
  baseUrl: string | null;
  sourceKind: 'website' | 'document' | 'email' | 'manual';
  trustLevel: 'verified' | 'trusted' | 'unverified';
  status: 'active' | 'paused' | 'retired';
  lastCheckedAt: string | null;
  lastCheckStatus: 'success' | 'no_change' | 'blocked' | 'error' | null;
  consecutiveFailures: number;
  nextCheckAt: string | null;
}

export interface OpportunitySourceCheck {
  id: string;
  sourceId: string;
  status: 'success' | 'no_change' | 'blocked' | 'error';
  itemsFound: number;
  notes: string | null;
  checkedAt: string;
}

export interface OpportunityIngestionItem {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  title: string;
  buyerName: string;
  summary: string | null;
  submissionDeadline: string | null;
  status: 'draft' | 'ready_for_review' | 'promoted' | 'rejected';
  qualityScore: number;
  qualityIssues: string[];
  duplicateOpportunityId: string | null;
  opportunityId: string | null;
  extractionMethod: 'manual' | 'assisted_text';
  extractionConfidence: number | null;
  createdAt: string;
  sourcingTaskId: string | null;
}

export interface OpportunitySourcingTask {
  id: string;
  searchTerm: string;
  demandCount: number;
  latestSearchAt: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'in_progress' | 'candidate_found' | 'completed' | 'cancelled';
  assignedTo: string | null;
  dueAt: string | null;
  notes: string | null;
  sourceLinks: string[];
  matchedOpportunityId: string | null;
  createdAt: string;
}

export interface PlatformResearcher {
  id: string;
  fullName: string;
  platformRole: 'researcher' | 'admin';
}

export interface OpportunitySourcingTaskEvent {
  id: string;
  taskId: string;
  eventType: 'created' | 'assigned' | 'status_changed' | 'evidence_updated' | 'completed';
  previousStatus: string | null;
  nextStatus: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CreateOpportunitySourceInput {
  name: string;
  baseUrl?: string;
  sourceKind: OpportunitySource['sourceKind'];
  trustLevel: OpportunitySource['trustLevel'];
}

export interface CreateOpportunityIngestionInput {
  sourceId?: string;
  sourceUrl?: string;
  title: string;
  buyerName: string;
  summary?: string;
  description?: string;
  externalReference?: string;
  rawText?: string;
  extractionMethod?: 'manual' | 'assisted_text';
  extractionConfidence?: number;
  extractedFields?: string[];
  submissionDeadline?: string;
  status?: 'draft' | 'ready_for_review';
  sourcingTaskId?: string;
}

function mapOpportunitySource(row: any): OpportunitySource {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    sourceKind: row.source_kind,
    trustLevel: row.trust_level,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    lastCheckStatus: row.last_check_status,
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    nextCheckAt: row.next_check_at,
  };
}

function mapIngestionItem(row: any): OpportunityIngestionItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.opportunity_sources?.name ?? null,
    sourceUrl: row.source_url,
    title: row.title,
    buyerName: row.buyer_name,
    summary: row.summary,
    submissionDeadline: row.submission_deadline,
    status: row.status,
    qualityScore: Number(row.quality_score ?? 0),
    qualityIssues: Array.isArray(row.quality_issues) ? row.quality_issues : [],
    duplicateOpportunityId: row.duplicate_opportunity_id,
    opportunityId: row.opportunity_id,
    extractionMethod: row.extraction_method ?? 'manual',
    extractionConfidence: row.extraction_confidence == null ? null : Number(row.extraction_confidence),
    createdAt: row.created_at,
    sourcingTaskId: row.sourcing_task_id,
  };
}

function mapSourcingTask(row: any): OpportunitySourcingTask {
  return {
    id: row.id,
    searchTerm: row.search_term,
    demandCount: Number(row.demand_count ?? 0),
    latestSearchAt: row.latest_search_at,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    notes: row.notes,
    sourceLinks: Array.isArray(row.source_links) ? row.source_links : [],
    matchedOpportunityId: row.matched_opportunity_id,
    createdAt: row.created_at,
  };
}

export async function fetchOpportunitySourcingTasks(): Promise<OpportunitySourcingTask[]> {
  const { data, error } = await supabase
    .from('opportunity_sourcing_tasks')
    .select('id,search_term,demand_count,latest_search_at,priority,status,assigned_to,due_at,notes,source_links,matched_opportunity_id,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSourcingTask);
}

export async function fetchOpportunitySourcingTaskEvents(): Promise<OpportunitySourcingTaskEvent[]> {
  const { data, error } = await supabase
    .from('opportunity_sourcing_task_events')
    .select('id,task_id,event_type,previous_status,next_status,details,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    details: row.details && typeof row.details === 'object' ? row.details : {},
    createdAt: row.created_at,
  }));
}

export async function fetchPlatformResearchers(): Promise<PlatformResearcher[]> {
  const { data, error } = await supabase.rpc('list_opportunity_researchers');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name || 'Unnamed staff member',
    platformRole: row.platform_role,
  }));
}

export async function createSourcingTaskFromGap(
  term: string,
  priority: OpportunitySourcingTask['priority'] = 'medium',
): Promise<string> {
  const { data, error } = await supabase.rpc('create_sourcing_task_from_gap', {
    p_term: term,
    p_priority: priority,
    p_due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  if (error) throw error;
  return data as string;
}

export async function assignOpportunitySourcingTask(input: {
  taskId: string;
  assignedTo: string;
  priority: OpportunitySourcingTask['priority'];
  dueAt?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('assign_opportunity_sourcing_task', {
    p_task_id: input.taskId,
    p_assigned_to: input.assignedTo,
    p_priority: input.priority,
    p_due_at: input.dueAt || null,
  });
  if (error) throw error;
}

export async function updateOpportunitySourcingTask(input: {
  taskId: string;
  status: Exclude<OpportunitySourcingTask['status'], 'open' | 'completed'>;
  notes?: string;
  sourceLinks?: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('update_opportunity_sourcing_task', {
    p_task_id: input.taskId,
    p_status: input.status,
    p_notes: input.notes || null,
    p_source_links: input.sourceLinks ?? [],
  });
  if (error) throw error;
}

export async function fetchOpportunitySources(): Promise<OpportunitySource[]> {
  const { data, error } = await supabase
    .from('opportunity_sources')
    .select('id,name,base_url,source_kind,trust_level,status,last_checked_at,last_check_status,consecutive_failures,next_check_at')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(mapOpportunitySource);
}

export async function createOpportunitySource(input: CreateOpportunitySourceInput): Promise<OpportunitySource> {
  const { data, error } = await supabase
    .from('opportunity_sources')
    .insert({
      name: input.name,
      base_url: input.baseUrl || null,
      source_kind: input.sourceKind,
      trust_level: input.trustLevel,
      next_check_at: new Date().toISOString(),
    })
    .select('id,name,base_url,source_kind,trust_level,status,last_checked_at,last_check_status,consecutive_failures,next_check_at')
    .single();
  if (error) throw error;
  return mapOpportunitySource(data);
}

export async function fetchOpportunityIngestionItems(): Promise<OpportunityIngestionItem[]> {
  const { data, error } = await supabase
    .from('opportunity_ingestion_items')
    .select('id,source_id,source_url,title,buyer_name,summary,submission_deadline,status,quality_score,quality_issues,duplicate_opportunity_id,opportunity_id,extraction_method,extraction_confidence,created_at,sourcing_task_id,opportunity_sources(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(mapIngestionItem);
}

export async function createOpportunityIngestionItem(
  input: CreateOpportunityIngestionInput,
): Promise<OpportunityIngestionItem> {
  const { data, error } = await supabase
    .from('opportunity_ingestion_items')
    .insert({
      source_id: input.sourceId || null,
      source_url: input.sourceUrl || null,
      title: input.title,
      buyer_name: input.buyerName,
      summary: input.summary || null,
      description: input.description || null,
      external_reference: input.externalReference || null,
      raw_text: input.rawText || null,
      extraction_method: input.extractionMethod ?? 'manual',
      extraction_confidence: input.extractionConfidence ?? null,
      extracted_fields: Object.fromEntries((input.extractedFields ?? []).map((field) => [field, true])),
      submission_deadline: input.submissionDeadline || null,
      status: input.status ?? 'draft',
      sourcing_task_id: input.sourcingTaskId || null,
    })
    .select('id,source_id,source_url,title,buyer_name,summary,submission_deadline,status,quality_score,quality_issues,duplicate_opportunity_id,opportunity_id,extraction_method,extraction_confidence,created_at,sourcing_task_id,opportunity_sources(name)')
    .single();
  if (error) throw error;
  return mapIngestionItem(data);
}

export async function submitOpportunityIngestionItem(id: string): Promise<OpportunityIngestionItem> {
  const { data, error } = await supabase
    .from('opportunity_ingestion_items')
    .update({ status: 'ready_for_review' })
    .eq('id', id)
    .select('id,source_id,source_url,title,buyer_name,summary,submission_deadline,status,quality_score,quality_issues,duplicate_opportunity_id,opportunity_id,extraction_method,extraction_confidence,created_at,sourcing_task_id,opportunity_sources(name)')
    .single();
  if (error) throw error;
  return mapIngestionItem(data);
}

export async function promoteOpportunityIngestionItem(id: string): Promise<string> {
  const { executeBackendCommand } = await import('./commandApi');
  return executeBackendCommand<string>('procurement.ingestion.promote', { itemId: id });
}

export async function recordOpportunitySourceCheck(input: {
  sourceId: string;
  status: OpportunitySourceCheck['status'];
  itemsFound?: number;
  notes?: string;
}): Promise<OpportunitySourceCheck> {
  const { data, error } = await supabase
    .from('opportunity_source_checks')
    .insert({
      source_id: input.sourceId,
      status: input.status,
      items_found: input.itemsFound ?? 0,
      notes: input.notes || null,
    })
    .select('id,source_id,status,items_found,notes,checked_at')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    sourceId: data.source_id,
    status: data.status,
    itemsFound: Number(data.items_found ?? 0),
    notes: data.notes,
    checkedAt: data.checked_at,
  };
}

export async function approveOpportunity(id: string): Promise<void> {
  const publishedId = await getOpportunityStatusId('published');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: publishedId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: null })
    .eq('id', id);
  if (error) throw error;
}

export async function requestCorrection(id: string, note: string): Promise<void> {
  const needsCorrectionId = await getOpportunityStatusId('needs_correction');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: needsCorrectionId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: note })
    .eq('id', id);
  if (error) throw error;
}

export async function rejectOpportunity(id: string, note: string): Promise<void> {
  const rejectedId = await getOpportunityStatusId('rejected');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: rejectedId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: note })
    .eq('id', id);
  if (error) throw error;
}

// --- Supplier profiles & verification ---

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
  const { executeBackendCommand } = await import('./commandApi');
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

// --- Saved searches & follows (alerts) ---

export interface SavedSearch {
  id: string;
  name: string;
  keyword: string | null;
  sectorId: string | null;
  countryId: string | null;
  districtId: string | null;
  opportunityTypeId: string | null;
  frequency: 'immediate' | 'daily' | 'weekly';
  isActive: boolean;
  lastMatchedAt: string | null;
}

export interface SavedSearchMatch {
  id: string;
  savedSearchId: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunitySlug: string;
  matchScore: number;
  deliveryStatus: 'pending' | 'notified' | 'dismissed';
  matchedAt: string;
}

function mapSavedSearch(row: any): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    keyword: row.keyword,
    sectorId: row.sector_id,
    countryId: row.country_id,
    districtId: row.district_id,
    opportunityTypeId: row.opportunity_type_id,
    frequency: row.frequency ?? 'immediate',
    isActive: row.is_active ?? true,
    lastMatchedAt: row.last_matched_at,
  };
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id,name,keyword,sector_id,country_id,district_id,opportunity_type_id,frequency,is_active,last_matched_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSavedSearch);
}

export async function createSavedSearch(input: {
  name: string;
  keyword?: string | null;
  sectorId?: string | null;
  countryId?: string | null;
  districtId?: string | null;
  opportunityTypeId?: string | null;
  frequency?: SavedSearch['frequency'];
}): Promise<SavedSearch> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to save searches.');
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: user.id,
      name: input.name,
      keyword: input.keyword || null,
      sector_id: input.sectorId || null,
      country_id: input.countryId || null,
      district_id: input.districtId || null,
      opportunity_type_id: input.opportunityTypeId || null,
      frequency: input.frequency ?? 'immediate',
    })
    .select('id,name,keyword,sector_id,country_id,district_id,opportunity_type_id,frequency,is_active,last_matched_at')
    .single();
  if (error) throw error;
  return mapSavedSearch(data);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw error;
}

export async function updateSavedSearchDelivery(
  id: string,
  input: { frequency?: SavedSearch['frequency']; isActive?: boolean },
): Promise<SavedSearch> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.frequency) update.frequency = input.frequency;
  if (input.isActive != null) update.is_active = input.isActive;
  const { data, error } = await supabase
    .from('saved_searches')
    .update(update)
    .eq('id', id)
    .select('id,name,keyword,sector_id,country_id,district_id,opportunity_type_id,frequency,is_active,last_matched_at')
    .single();
  if (error) throw error;
  return mapSavedSearch(data);
}

export async function fetchSavedSearchMatches(limit = 50): Promise<SavedSearchMatch[]> {
  const { data, error } = await supabase
    .from('saved_search_matches')
    .select('id,saved_search_id,opportunity_id,match_score,delivery_status,matched_at,opportunities(title,slug)')
    .order('matched_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    savedSearchId: row.saved_search_id,
    opportunityId: row.opportunity_id,
    opportunityTitle: row.opportunities?.title ?? 'Tender opportunity',
    opportunitySlug: row.opportunities?.slug ?? '',
    matchScore: Number(row.match_score),
    deliveryStatus: row.delivery_status,
    matchedAt: row.matched_at,
  }));
}

export async function isFollowingBuyer(buyerOrgId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('followed_buyers')
    .select('buyer_org_id')
    .eq('buyer_org_id', buyerOrgId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function setFollowingBuyer(buyerOrgId: string, following: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to follow buyers.');
  if (following) {
    const { error } = await supabase.from('followed_buyers').insert({ buyer_org_id: buyerOrgId, user_id: user.id });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('followed_buyers').delete().eq('buyer_org_id', buyerOrgId).eq('user_id', user.id);
    if (error) throw error;
  }
}

// --- Notifications ---

export * from './procurement/notificationApi';

// --- Tender responses: suppliers express interest / intent to bid ---

export type ResponseKind = 'interest' | 'intent_to_bid';

export interface OpportunityResponse {
  id: string;
  opportunityId: string;
  orgId: string;
  orgName?: string;
  kind: ResponseKind;
  note: string | null;
  status: 'active' | 'withdrawn';
  createdAt: string;
}

function mapResponse(row: any): OpportunityResponse {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    orgId: row.org_id,
    orgName: row.organizations?.name,
    kind: row.kind,
    note: row.note ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Use the same verified, persisted organization context as the dashboard.
// fetchMyOrganization validates the stored id against the current user's
// visible memberships before returning it.
export async function fetchMyOrgId(): Promise<string | null> {
  const organization = await fetchMyOrganization();
  return organization?.id ?? null;
}

// Public social-proof count of active responders on a tender.
export async function fetchResponseCount(opportunityId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_opportunity_response_count', { p_opportunity_id: opportunityId });
  if (error) return 0;
  return Number(data ?? 0);
}

// The current org's response to a tender, if any.
export async function fetchMyResponse(opportunityId: string, orgId: string): Promise<OpportunityResponse | null> {
  const { data, error } = await supabase
    .from('opportunity_responses')
    .select('id, opportunity_id, org_id, kind, note, status, created_at')
    .eq('opportunity_id', opportunityId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapResponse(data) : null;
}

// Create or update this org's response (upsert on the unique pair).
export async function submitResponse(input: { opportunityId: string; orgId: string; kind: ResponseKind; note?: string | null }): Promise<OpportunityResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('opportunity_responses')
    .upsert(
      {
        opportunity_id: input.opportunityId,
        org_id: input.orgId,
        user_id: user?.id ?? null,
        kind: input.kind,
        note: input.note ?? null,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'opportunity_id,org_id' },
    )
    .select('id, opportunity_id, org_id, kind, note, status, created_at')
    .single();
  if (error) throw error;
  return mapResponse(data);
}

export async function withdrawResponse(id: string): Promise<void> {
  const { error } = await supabase.from('opportunity_responses').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// Buyer view: all active responses to one of their tenders (with org names).
export async function fetchOpportunityResponses(opportunityId: string): Promise<OpportunityResponse[]> {
  const { data, error } = await supabase
    .from('opportunity_responses')
    .select('id, opportunity_id, org_id, kind, note, status, created_at, organizations(name)')
    .eq('opportunity_id', opportunityId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapResponse);
}

// --- Team accounts ---

export * from './procurement/teamApi';

// --- Subscriptions & billing ---

export * from './procurement/subscriptionRequestApi';

// --- Featured tender placement (admin only, enforced by RLS) ---

export async function setOpportunityFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase.from('opportunities').update({ is_featured: featured }).eq('id', id);
  if (error) throw error;
}

// --- Service requests ---

export * from './procurement/serviceRequestApi';

// --- Supplier opportunity pipeline (strictly private -- see RLS) ---

export type PipelineStage = 'saved' | 'reviewing' | 'interested' | 'go' | 'no_go' | 'preparing' | 'submitted' | 'won' | 'lost' | 'withdrawn' | 'archived';

export interface PipelineRecord {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunitySlug: string;
  submissionDeadline: string;
  stage: PipelineStage;
  bidValue: number | null;
  probability: number | null;
  internalDeadline: string | null;
  lossReason: string | null;
  notes: string | null;
}

export async function fetchPipeline(orgId: string): Promise<PipelineRecord[]> {
  const { data, error } = await supabase
    .from('pipeline_records')
    .select('id, opportunity_id, stage, bid_value, probability, internal_deadline, loss_reason, notes, opportunities(title, slug, submission_deadline)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunityTitle: row.opportunities?.title ?? 'Unknown tender',
    opportunitySlug: row.opportunities?.slug ?? '',
    submissionDeadline: row.opportunities?.submission_deadline ?? '',
    stage: row.stage,
    bidValue: row.bid_value !== null ? Number(row.bid_value) : null,
    probability: row.probability,
    internalDeadline: row.internal_deadline,
    lossReason: row.loss_reason,
    notes: row.notes,
  }));
}

export async function addToPipeline(orgId: string, opportunityId: string): Promise<void> {
  const { error } = await supabase.from('pipeline_records').upsert(
    { org_id: orgId, opportunity_id: opportunityId },
    { onConflict: 'org_id,opportunity_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}

export interface UpdatePipelineInput {
  stage?: PipelineStage;
  bidValue?: number | null;
  probability?: number | null;
  internalDeadline?: string | null;
  lossReason?: string | null;
  notes?: string | null;
}

export async function updatePipelineRecord(id: string, updates: UpdatePipelineInput): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.stage !== undefined) patch.stage = updates.stage;
  if (updates.bidValue !== undefined) patch.bid_value = updates.bidValue;
  if (updates.probability !== undefined) patch.probability = updates.probability;
  if (updates.internalDeadline !== undefined) patch.internal_deadline = updates.internalDeadline;
  if (updates.lossReason !== undefined) patch.loss_reason = updates.lossReason;
  if (updates.notes !== undefined) patch.notes = updates.notes;
  const { error } = await supabase.from('pipeline_records').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeFromPipeline(id: string): Promise<void> {
  const { error } = await supabase.from('pipeline_records').delete().eq('id', id);
  if (error) throw error;
}

export interface PipelineTask {
  id: string;
  title: string;
  isDone: boolean;
}

export async function fetchPipelineTasks(pipelineRecordId: string): Promise<PipelineTask[]> {
  const { data, error } = await supabase
    .from('pipeline_tasks')
    .select('id, title, is_done')
    .eq('pipeline_record_id', pipelineRecordId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, title: row.title, isDone: row.is_done }));
}

export async function addPipelineTask(pipelineRecordId: string, title: string): Promise<void> {
  const { error } = await supabase.from('pipeline_tasks').insert({ pipeline_record_id: pipelineRecordId, title });
  if (error) throw error;
}

export async function togglePipelineTask(id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase.from('pipeline_tasks').update({ is_done: isDone }).eq('id', id);
  if (error) throw error;
}

// --- Supplier sector tagging (drives recommendations) ---

export async function fetchSupplierSectorIds(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.from('supplier_sectors').select('sector_id').eq('org_id', orgId);
  if (error) throw error;
  return (data ?? []).map((row: any) => row.sector_id);
}

export async function setSupplierSectorIds(orgId: string, sectorIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('supplier_sectors').delete().eq('org_id', orgId);
  if (deleteError) throw deleteError;
  if (sectorIds.length === 0) return;
  const { error: insertError } = await supabase.from('supplier_sectors').insert(sectorIds.map((sectorId) => ({ org_id: orgId, sector_id: sectorId })));
  if (insertError) throw insertError;
}

export async function fetchRecommendedOpportunities(orgId: string): Promise<OpportunityListItem[]> {
  const sectorIds = await fetchSupplierSectorIds(orgId);
  if (sectorIds.length === 0) return [];
  const { data, error } = await supabase
    .from('opportunities')
    .select(OPPORTUNITY_LIST_SELECT)
    .in('sector_id', sectorIds)
    .order('submission_deadline', { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(mapOpportunityListItem);
}

// --- Admin analytics ---

export interface AnalyticsStat {
  label: string;
  count: number;
  total_value?: number;
}

export interface AdminAnalyticsSummary {
  opportunities_by_status: AnalyticsStat[];
  opportunities_by_sector: AnalyticsStat[];
  opportunities_by_district: AnalyticsStat[];
  most_viewed: { title: string; slug: string; value: number }[];
  most_saved: { title: string; slug: string; value: number }[];
  most_followed_buyers: AnalyticsStat[];
  subscriptions_by_plan: AnalyticsStat[];
  awards_by_sector: AnalyticsStat[];
  total_organizations: number;
  total_suppliers: number;
  total_verified_suppliers: number;
  total_buyers: number;
}

export async function fetchAdminAnalytics(): Promise<AdminAnalyticsSummary> {
  const { data, error } = await supabase.rpc('get_admin_analytics_summary');
  if (error) throw error;
  return data as AdminAnalyticsSummary;
}

export interface ProcurementSearchInsights {
  periodDays: number;
  searches: number;
  uniqueSearchers: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  averageResults: number;
  dailyTrend: { date: string; searches: number; zeroResults: number }[];
  topTerms: { term: string; searches: number; averageResults: number; zeroResultRate: number }[];
  contentGaps: { term: string; searches: number; latestSearchAt: string }[];
  sectorDemand: { label: string; searches: number }[];
  countryDemand: { label: string; searches: number }[];
  districtDemand: { label: string; searches: number }[];
}

export async function fetchProcurementSearchInsights(days = 30): Promise<ProcurementSearchInsights> {
  const { data, error } = await supabase.rpc('admin_get_procurement_search_insights', { p_days: days });
  if (error) throw error;
  const insight = data ?? {};
  return {
    periodDays: Number(insight.period_days ?? days),
    searches: Number(insight.searches ?? 0),
    uniqueSearchers: Number(insight.unique_searchers ?? 0),
    zeroResultSearches: Number(insight.zero_result_searches ?? 0),
    zeroResultRate: Number(insight.zero_result_rate ?? 0),
    averageResults: Number(insight.average_results ?? 0),
    dailyTrend: (insight.daily_trend ?? []).map((row: any) => ({
      date: row.search_date,
      searches: Number(row.searches ?? 0),
      zeroResults: Number(row.zero_results ?? 0),
    })),
    topTerms: (insight.top_terms ?? []).map((row: any) => ({
      term: row.term,
      searches: Number(row.searches ?? 0),
      averageResults: Number(row.average_results ?? 0),
      zeroResultRate: Number(row.zero_result_rate ?? 0),
    })),
    contentGaps: (insight.content_gaps ?? []).map((row: any) => ({
      term: row.term,
      searches: Number(row.searches ?? 0),
      latestSearchAt: row.latest_search_at,
    })),
    sectorDemand: (insight.sector_demand ?? []).map((row: any) => ({ label: row.label, searches: Number(row.searches ?? 0) })),
    countryDemand: (insight.country_demand ?? []).map((row: any) => ({ label: row.label, searches: Number(row.searches ?? 0) })),
    districtDemand: (insight.district_demand ?? []).map((row: any) => ({ label: row.label, searches: Number(row.searches ?? 0) })),
  };
}

// --- Feature entitlement check (generic) ---

export async function hasFeature(orgId: string, featureKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_org_feature_limit', { p_org_id: orgId, p_feature_key: featureKey });
  if (error) throw error;
  return data === null || data > 0;
}

// --- AI assist (procurement domain, separate from the ad-copywriting endpoint) ---

async function callProcurementAI(mode: 'suggest_sector' | 'explain_tender', text: string, sectorNames?: string[]): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch('/api/gemini/procurement-assist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ mode, text, sectorNames }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'AI assist failed.');
  return data.text || '';
}

export async function aiSuggestSector(titleAndDescription: string, sectorNames: string[]): Promise<string> {
  return callProcurementAI('suggest_sector', titleAndDescription, sectorNames);
}

export async function aiExplainTender(tenderText: string): Promise<string> {
  return callProcurementAI('explain_tender', tenderText);
}

// Advertising requests, publisher operations, creatives, analytics and
// campaign management now live in a focused domain module. Re-exporting keeps
// existing consumers compatible while they migrate to the direct import.
export * from './advertisingApi';

// Agency and advertising billing operations live in focused domain modules.
// Re-exports preserve compatibility while remaining consumers migrate.
export * from './advertBillingApi';
export * from './agencyApi';

// Landing-page publishing and audience communication now have focused domain
// modules. Compatibility exports remain while legacy imports migrate.
export * from './landingCmsApi';
export * from './audienceApi';


export interface TenderAlertDeliverySummary {
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  suppressed: number;
  deliveries24h: number;
}

export async function fetchTenderAlertDeliverySummary(): Promise<TenderAlertDeliverySummary> {
  const { data, error } = await supabase.rpc('admin_get_tender_alert_delivery_summary');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    queued: Number(row?.queued ?? 0),
    sent: Number(row?.sent ?? 0),
    delivered: Number(row?.delivered ?? 0),
    failed: Number(row?.failed ?? 0),
    suppressed: Number(row?.suppressed ?? 0),
    deliveries24h: Number(row?.deliveries_24h ?? 0),
  };
}
