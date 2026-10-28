import { supabase } from './supabaseClient';

export type MarketplaceStatus = 'active' | 'hidden' | 'archived';

export interface BusinessDirectoryRecord {
  id: string; businessName: string; category: string; description: string; district: string; city: string;
  whatsapp: string; email: string; website: string; services: string[]; contactPerson: string;
  isVerified: boolean; diasporaSupport: boolean; isFeatured: boolean; status: MarketplaceStatus;
}

const mapBusiness = (row: any): BusinessDirectoryRecord => ({
  id: row.id, businessName: row.business_name, category: row.category ?? '', description: row.description ?? '',
  district: row.district ?? '', city: row.city ?? '', whatsapp: row.whatsapp ?? '', email: row.email ?? '',
  website: row.website ?? '', services: row.services ?? [], contactPerson: row.contact_person ?? '',
  isVerified: !!row.is_verified, diasporaSupport: !!row.diaspora_support, isFeatured: !!row.is_featured, status: row.status,
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
