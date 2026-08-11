import { supabase } from './supabaseClient';

export type DiscoveryResultType = 'tender' | 'award' | 'project' | 'advert' | 'service' | 'business' | 'influencer';
export type DiscoverySort = 'relevance' | 'newest' | 'value_high' | 'value_low';

export interface DiscoveryFilters {
  query?: string;
  resultTypes?: DiscoveryResultType[];
  district?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  minValue?: number;
  maxValue?: number;
  sort?: DiscoverySort;
  limit?: number;
  offset?: number;
}

export interface DiscoveryResult {
  resultType: DiscoveryResultType;
  id: string;
  href: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  district: string | null;
  publishedOn: string | null;
  amount: number | null;
  currencyCode: string | null;
  isVerified: boolean;
  isSponsored: boolean;
  districtMatch: boolean;
  contactEmail: string | null;
  contactWhatsapp: string | null;
  relevance: number;
  totalCount: number;
}

export interface DiscoverySavedSearch {
  id: string;
  name: string;
  keyword: string | null;
  filters: DiscoveryFilters;
  createdAt: string;
}

const VISITOR_STORAGE_KEY = 'manohub.discovery.visitor';

async function visitorHash(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  let token = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (!token) {
    token = window.crypto.randomUUID();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, token);
  }
  const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

function rpcParams(filters: DiscoveryFilters, hash: string | null) {
  return {
    p_query: filters.query?.trim() || null,
    p_result_types: filters.resultTypes?.length ? filters.resultTypes : null,
    p_district: filters.district?.trim() || null,
    p_category: filters.category?.trim() || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_min_value: filters.minValue ?? null,
    p_max_value: filters.maxValue ?? null,
    p_sort: filters.sort ?? 'relevance',
    p_visitor_hash: hash,
    p_limit: filters.limit ?? 30,
    p_offset: filters.offset ?? 0,
  };
}

export async function searchDiscovery(filters: DiscoveryFilters): Promise<DiscoveryResult[]> {
  const hash = await visitorHash();
  const { data, error } = await supabase.rpc('search_discovery', rpcParams(filters, hash));
  if (error) throw error;
  const rows = (data ?? []).map((row: any): DiscoveryResult => ({
    resultType: row.result_type,
    id: row.result_id,
    href: row.href,
    title: row.title,
    summary: row.summary,
    category: row.category,
    district: row.district,
    publishedOn: row.published_on,
    amount: row.amount == null ? null : Number(row.amount),
    currencyCode: row.currency_code,
    isVerified: !!row.is_verified,
    isSponsored: !!row.is_sponsored,
    districtMatch: !!row.district_match,
    contactEmail: row.contact_email,
    contactWhatsapp: row.contact_whatsapp,
    relevance: Number(row.relevance ?? 0),
    totalCount: Number(row.total_count ?? 0),
  }));
  const query = filters.query?.trim();
  if (query) {
    const total = rows[0]?.totalCount ?? 0;
    void supabase.rpc('record_discovery_search', {
      p_query: query,
      p_filters: {
        result_types: filters.resultTypes ?? null,
        district: filters.district || null,
        category: filters.category || null,
        date_from: filters.dateFrom || null,
        date_to: filters.dateTo || null,
        min_value: filters.minValue ?? null,
        max_value: filters.maxValue ?? null,
      },
      p_sort: filters.sort ?? 'relevance',
      p_result_count: total,
      p_visitor_hash: hash,
    });
  }
  return rows;
}

export async function fetchDiscoverySuggestions(query: string): Promise<Array<{ term: string; resultType: DiscoveryResultType }>> {
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('search_discovery_suggestions', { p_query: query.trim(), p_limit: 8 });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ term: row.term, resultType: row.result_type }));
}

export async function fetchDiscoveryTrends(): Promise<Array<{ term: string; searches: number }>> {
  const { data, error } = await supabase.rpc('get_discovery_trends', { p_limit: 8 });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ term: row.term, searches: Number(row.searches) }));
}

export async function fetchDiscoverySavedSearches(): Promise<DiscoverySavedSearch[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('saved_searches')
    .select('id,name,keyword,filters,created_at')
    .eq('user_id', user.id)
    .eq('search_scope', 'discovery')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, name: row.name, keyword: row.keyword, filters: row.filters ?? {}, createdAt: row.created_at }));
}

export async function saveDiscoverySearch(name: string, filters: DiscoveryFilters): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to save this search.');
  const { error } = await supabase.from('saved_searches').insert({
    user_id: user.id,
    name: name.trim(),
    keyword: filters.query?.trim() || null,
    search_scope: 'discovery',
    filters,
  });
  if (error) throw error;
}

export async function deleteDiscoverySavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id).eq('search_scope', 'discovery');
  if (error) throw error;
}
