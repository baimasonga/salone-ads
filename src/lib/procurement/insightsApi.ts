import { supabase } from '../supabaseClient';

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
