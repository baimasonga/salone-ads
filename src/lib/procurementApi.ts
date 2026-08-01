import { supabase } from './supabaseClient';
import {
  getOpportunityStatusId,
} from './procurement/opportunityApi';

export * from './procurement/opportunityApi';

const MAX_ADVERT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ADVERT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export * from './procurement/sourcingApi';
export * from './procurement/supplierVerificationApi';
export * from './procurement/savedSearchApi';
export * from './procurement/responseApi';
export * from './procurement/bidPipelineApi';

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

// --- Notifications ---

export * from './procurement/notificationApi';

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
