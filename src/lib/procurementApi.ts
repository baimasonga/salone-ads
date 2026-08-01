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

export * from './procurement/sourcingApi';
export * from './procurement/supplierVerificationApi';

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
