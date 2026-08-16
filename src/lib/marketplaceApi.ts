import { supabase } from './supabaseClient';

export type MarketplaceStatus = 'active' | 'hidden' | 'archived';

export interface BusinessDirectoryRecord {
  id: string; businessName: string; category: string; description: string; district: string; city: string;
  whatsapp: string; email: string; website: string; services: string[]; contactPerson: string;
  isVerified: boolean; diasporaSupport: boolean; isFeatured: boolean; status: MarketplaceStatus;
}

export interface CreatorMarketplaceRecord {
  id: string; displayName: string; location: string; district: string; categories: string[]; platforms: string[];
  bio: string; email: string; whatsapp: string; profileUrl: string; audienceCount: number | null;
  engagementPercent: number | null; rateMin: number | null; rateMax: number | null; currencyCode: string;
  availabilityStatus: 'available' | 'limited' | 'unavailable'; isVerified: boolean; isFeatured: boolean; status: MarketplaceStatus;
}

const mapBusiness = (row: any): BusinessDirectoryRecord => ({
  id: row.id, businessName: row.business_name, category: row.category ?? '', description: row.description ?? '',
  district: row.district ?? '', city: row.city ?? '', whatsapp: row.whatsapp ?? '', email: row.email ?? '',
  website: row.website ?? '', services: row.services ?? [], contactPerson: row.contact_person ?? '',
  isVerified: !!row.is_verified, diasporaSupport: !!row.diaspora_support, isFeatured: !!row.is_featured, status: row.status,
});

const mapCreator = (row: any): CreatorMarketplaceRecord => ({
  id: row.id, displayName: row.display_name, location: row.location ?? '', district: row.district ?? '',
  categories: row.categories ?? [], platforms: row.platforms ?? [], bio: row.bio ?? '', email: row.email ?? '',
  whatsapp: row.whatsapp ?? '', profileUrl: row.profile_url ?? '', audienceCount: row.audience_count == null ? null : Number(row.audience_count),
  engagementPercent: row.engagement_percent == null ? null : Number(row.engagement_percent), rateMin: row.rate_min == null ? null : Number(row.rate_min),
  rateMax: row.rate_max == null ? null : Number(row.rate_max), currencyCode: row.currency_code ?? 'SLE',
  availabilityStatus: row.availability_status, isVerified: !!row.is_verified, isFeatured: !!row.is_featured, status: row.status,
});

export async function fetchBusinessDirectoryRecords(): Promise<BusinessDirectoryRecord[]> {
  const { data, error } = await supabase.from('directory_profiles').select('*').order('is_featured', { ascending: false }).order('business_name');
  if (error) throw error;
  return (data ?? []).map(mapBusiness);
}

export async function saveBusinessDirectoryRecord(orgId: string, input: Omit<BusinessDirectoryRecord, 'id'>, id?: string): Promise<BusinessDirectoryRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required.');
  const payload = { business_name: input.businessName.trim(), category: input.category.trim(), description: input.description.trim(),
    district: input.district.trim(), city: input.city.trim(), whatsapp: input.whatsapp.trim(), email: input.email.trim() || null,
    website: input.website.trim() || null, services: input.services, contact_person: input.contactPerson.trim() || null,
    is_verified: input.isVerified, diaspora_support: input.diasporaSupport, is_featured: input.isFeatured, status: input.status,
    claimed_by_org_id: orgId };
  const query = id ? supabase.from('directory_profiles').update(payload).eq('id', id) : supabase.from('directory_profiles').insert({ ...payload, created_by: user.id });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapBusiness(data);
}

export async function deleteBusinessDirectoryRecord(id: string): Promise<void> {
  const { error } = await supabase.from('directory_profiles').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchCreatorMarketplaceRecords(): Promise<CreatorMarketplaceRecord[]> {
  const { data, error } = await supabase.from('influencer_profiles').select('*').order('is_featured', { ascending: false }).order('display_name');
  if (error) throw error;
  return (data ?? []).map(mapCreator);
}

export async function saveCreatorMarketplaceRecord(orgId: string, input: Omit<CreatorMarketplaceRecord, 'id'>, id?: string): Promise<CreatorMarketplaceRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required.');
  const payload = { display_name: input.displayName.trim(), location: input.location.trim(), district: input.district.trim(),
    categories: input.categories, platforms: input.platforms, bio: input.bio.trim(), email: input.email.trim() || null,
    whatsapp: input.whatsapp.trim() || null, profile_url: input.profileUrl.trim() || null, audience_count: input.audienceCount,
    audience_size: input.audienceCount == null ? '' : input.audienceCount.toLocaleString('en'), engagement_percent: input.engagementPercent,
    engagement_rate: input.engagementPercent == null ? '' : `${input.engagementPercent}%`, rate_min: input.rateMin, rate_max: input.rateMax,
    rate_range: input.rateMin == null ? '' : `${input.currencyCode} ${input.rateMin.toLocaleString()}${input.rateMax == null ? '' : `–${input.rateMax.toLocaleString()}`}`,
    currency_code: input.currencyCode.toUpperCase(), availability_status: input.availabilityStatus, is_verified: input.isVerified,
    is_featured: input.isFeatured, status: input.status, claimed_by_org_id: orgId };
  const query = id ? supabase.from('influencer_profiles').update(payload).eq('id', id) : supabase.from('influencer_profiles').insert({ ...payload, created_by: user.id });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapCreator(data);
}

export async function deleteCreatorMarketplaceRecord(id: string): Promise<void> {
  const { error } = await supabase.from('influencer_profiles').delete().eq('id', id);
  if (error) throw error;
}
