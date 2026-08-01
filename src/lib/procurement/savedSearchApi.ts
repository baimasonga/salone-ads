import { supabase } from '../supabaseClient';

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
