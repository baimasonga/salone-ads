import { supabase } from './supabaseClient';
import {
  Organization,
  BrandKit,
  Campaign,
  ContentItem,
  Lead,
  DirectoryProfile,
  InfluencerProfile,
  SocialConnection,
} from '../types';

export interface OrgBundle {
  organization: Organization;
  brandKit: BrandKit;
  campaigns: Campaign[];
  contentItems: ContentItem[];
  leads: Lead[];
  socialConnections: SocialConnection[];
}

export interface OnboardingInput {
  orgName: string;
  orgType: string;
  country: string;
  district: string;
  primaryObjective: string;
  monthlyBudget: string;
}

// --- row -> app type mappers (DB is snake_case, app types are camelCase) ---

function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    country: row.country,
    district: row.district ?? undefined,
    primaryObjective: row.primary_objective ?? '',
    monthlyBudget: row.monthly_budget ?? '',
    isBuyer: !!row.is_buyer,
    isSupplier: !!row.is_supplier,
    buyerVerified: !!row.buyer_verified,
    supplierVerifiedUntil: row.supplier_verified_until ?? null,
  };
}

function mapBrandKit(row: any): BrandKit {
  return {
    brandName: row.brand_name,
    legalName: row.legal_name,
    mission: row.mission,
    tagline: row.tagline,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    fonts: row.fonts,
    toneOfVoice: row.tone_of_voice,
    prohibitedTerminology: row.prohibited_terminology ?? [],
  };
}

function mapCampaign(row: any): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    objective: row.objective ?? '',
    status: row.status,
    totalBudget: Number(row.total_budget) || 0,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    channels: row.channels ?? [],
    district: row.district ?? undefined,
    diasporaMarket: row.diaspora_market ?? undefined,
  };
}

function mapContentItem(row: any): ContentItem {
  return {
    id: row.id,
    title: row.title,
    contentType: row.content_type,
    platform: row.platform ?? '',
    headline: row.headline ?? '',
    bodyText: row.body_text ?? '',
    hashtags: row.hashtags ?? [],
    scheduledDate: row.scheduled_date ?? '',
    status: row.status,
    version: row.version,
  };
}

function mapLead(row: any): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    telephone: row.telephone ?? '',
    whatsapp: row.whatsapp ?? '',
    district: row.district ?? undefined,
    source: row.source ?? '',
    status: row.status,
    estimatedValue: Number(row.estimated_value) || 0,
  };
}

function mapDirectoryProfile(row: any): DirectoryProfile {
  return {
    id: row.id,
    businessName: row.business_name,
    category: row.category ?? '',
    description: row.description ?? '',
    district: row.district ?? '',
    city: row.city ?? '',
    whatsapp: row.whatsapp ?? '',
    email: row.email ?? '',
    isVerified: row.is_verified,
    diasporaSupport: row.diaspora_support,
  };
}

function mapInfluencerProfile(row: any): InfluencerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    location: row.location ?? '',
    district: row.district ?? undefined,
    categories: row.categories ?? [],
    platforms: row.platforms ?? [],
    audienceSize: row.audience_size ?? '',
    engagementRate: row.engagement_rate ?? '',
    rateRange: row.rate_range ?? '',
    isVerified: row.is_verified,
  };
}

function mapSocialConnection(row: any): SocialConnection {
  return {
    id: row.id,
    platform: row.platform,
    accountName: row.account_name ?? '',
    status: row.status,
    connectionHealth: row.connection_health,
  };
}

function unwrap<T>({ data, error }: { data: T | null; error: any }): T {
  if (error) throw error;
  if (data === null) throw new Error('No data returned from Supabase.');
  return data;
}

// --- fetchers ---

export async function fetchMyOrganization(): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organizations(*)')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.organizations) return null;
  return mapOrganization(data.organizations);
}

export async function fetchMyPlatformRole(): Promise<'user' | 'researcher' | 'admin'> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'user';
  const { data, error } = await supabase.from('profiles').select('platform_role').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return (data?.platform_role as 'user' | 'researcher' | 'admin') ?? 'user';
}

export async function fetchOrgBundle(orgId: string): Promise<OrgBundle> {
  const [orgRes, brandKitRes, campaignsRes, contentRes, leadsRes, socialRes] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('brand_kits').select('*').eq('org_id', orgId).single(),
    supabase.from('campaigns').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('content_items').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('leads').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('social_connections').select('*').eq('org_id', orgId).order('created_at', { ascending: true }),
  ]);

  if (orgRes.error) throw orgRes.error;
  if (brandKitRes.error) throw brandKitRes.error;
  if (campaignsRes.error) throw campaignsRes.error;
  if (contentRes.error) throw contentRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (socialRes.error) throw socialRes.error;

  return {
    organization: mapOrganization(orgRes.data),
    brandKit: mapBrandKit(brandKitRes.data),
    campaigns: (campaignsRes.data ?? []).map(mapCampaign),
    contentItems: (contentRes.data ?? []).map(mapContentItem),
    leads: (leadsRes.data ?? []).map(mapLead),
    socialConnections: (socialRes.data ?? []).map(mapSocialConnection),
  };
}

export async function fetchDirectoryProfiles(): Promise<DirectoryProfile[]> {
  const { data, error } = await supabase
    .from('directory_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDirectoryProfile);
}

export async function fetchInfluencerProfiles(): Promise<InfluencerProfile[]> {
  const { data, error } = await supabase
    .from('influencer_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapInfluencerProfile);
}

// --- mutations ---

export async function createOrganization(input: OnboardingInput): Promise<Organization> {
  const { data, error } = await supabase.rpc('create_organization', {
    org_name: input.orgName,
    org_type: input.orgType,
    org_country: input.country,
    org_district: input.district,
    org_primary_objective: input.primaryObjective,
    org_monthly_budget: input.monthlyBudget,
  });
  if (error) throw error;
  return mapOrganization(data);
}

export async function createCampaign(
  orgId: string,
  input: Pick<Campaign, 'name' | 'description' | 'objective' | 'totalBudget' | 'startDate' | 'endDate' | 'channels' | 'district' | 'diasporaMarket'>
): Promise<Campaign> {
  const row = unwrap(
    await supabase
      .from('campaigns')
      .insert({
        org_id: orgId,
        name: input.name,
        description: input.description,
        objective: input.objective,
        status: 'Planning',
        total_budget: input.totalBudget,
        start_date: input.startDate,
        end_date: input.endDate,
        channels: input.channels,
        district: input.district,
        diaspora_market: input.diasporaMarket,
      })
      .select('*')
      .single()
  );
  return mapCampaign(row);
}

export async function createContentItem(
  orgId: string,
  input: Pick<ContentItem, 'title' | 'contentType' | 'platform' | 'headline' | 'bodyText' | 'hashtags' | 'scheduledDate'>
): Promise<ContentItem> {
  const row = unwrap(
    await supabase
      .from('content_items')
      .insert({
        org_id: orgId,
        title: input.title,
        content_type: input.contentType,
        platform: input.platform,
        headline: input.headline,
        body_text: input.bodyText,
        hashtags: input.hashtags,
        scheduled_date: input.scheduledDate,
        status: 'Draft',
        version: 1,
      })
      .select('*')
      .single()
  );
  return mapContentItem(row);
}

export async function updateLeadStatus(leadId: string, status: Lead['status']): Promise<Lead> {
  const row = unwrap(
    await supabase.from('leads').update({ status }).eq('id', leadId).select('*').single()
  );
  return mapLead(row);
}

export async function createDirectoryListing(
  orgId: string,
  businessName: string
): Promise<DirectoryProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row = unwrap(
    await supabase
      .from('directory_profiles')
      .insert({
        business_name: businessName,
        category: 'Retail',
        description: 'Direct corporate listing added by workspace administrator.',
        district: 'Western Area Urban',
        city: 'Freetown',
        whatsapp: '+232 76 000 000',
        email: 'corporate@salonemail.com',
        is_verified: false,
        diaspora_support: true,
        claimed_by_org_id: orgId,
        created_by: user.id,
      })
      .select('*')
      .single()
  );
  return mapDirectoryProfile(row);
}

export async function claimDirectoryListing(id: string, orgId: string): Promise<DirectoryProfile> {
  const row = unwrap(
    await supabase
      .from('directory_profiles')
      .update({ is_verified: true, claimed_by_org_id: orgId })
      .eq('id', id)
      .select('*')
      .single()
  );
  return mapDirectoryProfile(row);
}

export async function toggleSocialConnectionStatus(
  id: string,
  newStatus: SocialConnection['status']
): Promise<SocialConnection> {
  const row = unwrap(
    await supabase
      .from('social_connections')
      .update({ status: newStatus })
      .eq('id', id)
      .select('*')
      .single()
  );
  return mapSocialConnection(row);
}

export async function saveBrandKit(orgId: string, brandKit: BrandKit): Promise<BrandKit> {
  const row = unwrap(
    await supabase
      .from('brand_kits')
      .update({
        brand_name: brandKit.brandName,
        legal_name: brandKit.legalName,
        mission: brandKit.mission,
        tagline: brandKit.tagline,
        primary_color: brandKit.primaryColor,
        secondary_color: brandKit.secondaryColor,
        fonts: brandKit.fonts,
        tone_of_voice: brandKit.toneOfVoice,
        prohibited_terminology: brandKit.prohibitedTerminology,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .select('*')
      .single()
  );
  return mapBrandKit(row);
}
