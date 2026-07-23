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
  MediaAsset,
  TrackingLink,
  AudienceSegment,
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
    campaignId: row.campaign_id ?? null,
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
    createdAt: row.created_at,
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

// Brand kit + campaigns/content/leads/social connections are admin-only
// internal ad-platform tooling now (RLS requires is_platform_admin()) — for
// every other org these correctly come back empty, not an error. Use
// .maybeSingle() (not .single()) for brand_kits and fall back to a blank
// placeholder, since a non-admin org legitimately has zero accessible rows
// and can never reach the Brand Kit/Content Studio UI anyway (hidden from
// nav and blocked by RLS on any write).
const EMPTY_BRAND_KIT: BrandKit = {
  brandName: '',
  legalName: '',
  mission: '',
  tagline: '',
  primaryColor: '#10B981',
  secondaryColor: '#0F172A',
  fonts: '',
  toneOfVoice: '',
  prohibitedTerminology: [],
};

export async function fetchOrgBundle(orgId: string): Promise<OrgBundle> {
  const [orgRes, brandKitRes, campaignsRes, contentRes, leadsRes, socialRes] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('brand_kits').select('*').eq('org_id', orgId).maybeSingle(),
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
    brandKit: brandKitRes.data ? mapBrandKit(brandKitRes.data) : EMPTY_BRAND_KIT,
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

export async function updateCampaign(
  id: string,
  patch: Partial<Pick<Campaign, 'name' | 'description' | 'objective' | 'status' | 'totalBudget' | 'startDate' | 'endDate' | 'channels' | 'district' | 'diasporaMarket'>>
): Promise<Campaign> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.objective !== undefined) dbPatch.objective = patch.objective;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.totalBudget !== undefined) dbPatch.total_budget = patch.totalBudget;
  if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
  if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate;
  if (patch.channels !== undefined) dbPatch.channels = patch.channels;
  if (patch.district !== undefined) dbPatch.district = patch.district;
  if (patch.diasporaMarket !== undefined) dbPatch.diaspora_market = patch.diasporaMarket;
  const row = unwrap(
    await supabase.from('campaigns').update(dbPatch).eq('id', id).select('*').single()
  );
  return mapCampaign(row);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campaigns').delete().eq('id', id);
  if (error) throw error;
}

// Runs the real campaign-health sweep (stale-planning / ended-but-active /
// low-click-activity flags) on demand, admin-gated inside the RPC itself.
// Returns how many new notifications were created.
export async function runCampaignHealthCheck(): Promise<number> {
  const { data, error } = await supabase.rpc('run_campaign_health_check');
  if (error) throw error;
  return data as number;
}

// Real per-campaign activity counts (content pieces drafted, tracking
// links attached, total clicks across those links) -- computed from the
// new campaign_id linkage rather than shown as empty/fabricated numbers.
export interface CampaignActivity {
  campaignId: string;
  contentCount: number;
  trackingLinkCount: number;
  totalClicks: number;
}

export async function fetchCampaignActivity(orgId: string): Promise<Record<string, CampaignActivity>> {
  const [contentRes, linksRes] = await Promise.all([
    supabase.from('content_items').select('campaign_id').eq('org_id', orgId).not('campaign_id', 'is', null),
    supabase.from('tracking_links').select('campaign_id, click_count').eq('org_id', orgId).not('campaign_id', 'is', null),
  ]);
  if (contentRes.error) throw contentRes.error;
  if (linksRes.error) throw linksRes.error;

  const activity: Record<string, CampaignActivity> = {};
  const ensure = (campaignId: string) =>
    (activity[campaignId] ??= { campaignId, contentCount: 0, trackingLinkCount: 0, totalClicks: 0 });

  for (const row of contentRes.data ?? []) {
    if (row.campaign_id) ensure(row.campaign_id).contentCount += 1;
  }
  for (const row of linksRes.data ?? []) {
    if (row.campaign_id) {
      const a = ensure(row.campaign_id);
      a.trackingLinkCount += 1;
      a.totalClicks += row.click_count ?? 0;
    }
  }
  return activity;
}

export async function createContentItem(
  orgId: string,
  input: Pick<ContentItem, 'title' | 'contentType' | 'platform' | 'headline' | 'bodyText' | 'hashtags' | 'scheduledDate'> & { campaignId?: string | null }
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
        campaign_id: input.campaignId ?? null,
      })
      .select('*')
      .single()
  );
  return mapContentItem(row);
}

export async function updateContentItem(
  id: string,
  patch: Partial<Pick<ContentItem, 'title' | 'contentType' | 'platform' | 'headline' | 'bodyText' | 'hashtags' | 'scheduledDate' | 'status'>> & { version: number }
): Promise<ContentItem> {
  const dbPatch: Record<string, unknown> = { version: patch.version };
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.contentType !== undefined) dbPatch.content_type = patch.contentType;
  if (patch.platform !== undefined) dbPatch.platform = patch.platform;
  if (patch.headline !== undefined) dbPatch.headline = patch.headline;
  if (patch.bodyText !== undefined) dbPatch.body_text = patch.bodyText;
  if (patch.hashtags !== undefined) dbPatch.hashtags = patch.hashtags;
  if (patch.scheduledDate !== undefined) dbPatch.scheduled_date = patch.scheduledDate;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  const row = unwrap(
    await supabase.from('content_items').update(dbPatch).eq('id', id).select('*').single()
  );
  return mapContentItem(row);
}

export async function deleteContentItem(id: string): Promise<void> {
  const { error } = await supabase.from('content_items').delete().eq('id', id);
  if (error) throw error;
}

export async function updateLeadStatus(leadId: string, status: Lead['status']): Promise<Lead> {
  const row = unwrap(
    await supabase.from('leads').update({ status }).eq('id', leadId).select('*').single()
  );
  return mapLead(row);
}

export async function createLead(
  orgId: string,
  input: Pick<Lead, 'name' | 'source'> & Partial<Pick<Lead, 'email' | 'telephone' | 'whatsapp' | 'district' | 'estimatedValue'>>
): Promise<Lead> {
  const row = unwrap(
    await supabase
      .from('leads')
      .insert({
        org_id: orgId,
        name: input.name,
        email: input.email ?? '',
        telephone: input.telephone ?? '',
        whatsapp: input.whatsapp ?? '',
        district: input.district,
        source: input.source,
        status: 'New',
        estimated_value: input.estimatedValue ?? 0,
      })
      .select('*')
      .single()
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

// No official Meta/WhatsApp Business API OAuth integration exists (would
// need the org's own developer app credentials to build for real) -- this is
// real, manually-entered channel tracking instead of a fake "connect" button
// pretending to run an OAuth handshake it can't actually perform.
export async function createSocialConnection(
  orgId: string,
  input: Pick<SocialConnection, 'platform' | 'accountName' | 'status' | 'connectionHealth'>
): Promise<SocialConnection> {
  const row = unwrap(
    await supabase
      .from('social_connections')
      .insert({
        org_id: orgId,
        platform: input.platform,
        account_name: input.accountName,
        status: input.status,
        connection_health: input.connectionHealth,
      })
      .select('*')
      .single()
  );
  return mapSocialConnection(row);
}

export async function updateSocialConnection(
  id: string,
  patch: Partial<Pick<SocialConnection, 'platform' | 'accountName' | 'status' | 'connectionHealth'>>
): Promise<SocialConnection> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.platform !== undefined) dbPatch.platform = patch.platform;
  if (patch.accountName !== undefined) dbPatch.account_name = patch.accountName;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.connectionHealth !== undefined) dbPatch.connection_health = patch.connectionHealth;
  const row = unwrap(
    await supabase.from('social_connections').update(dbPatch).eq('id', id).select('*').single()
  );
  return mapSocialConnection(row);
}

export async function deleteSocialConnection(id: string): Promise<void> {
  const { error } = await supabase.from('social_connections').delete().eq('id', id);
  if (error) throw error;
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

// --- Media Library (admin-only, mirrors the private-documents storage pattern) ---

const MEDIA_ASSET_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, same ceiling as tender documents.
const MEDIA_ASSETS_BUCKET = 'media-assets';

function mapMediaAsset(row: any): MediaAsset {
  return {
    id: row.id,
    folder: row.folder,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileSize: row.file_size ?? null,
    mimeType: row.mime_type ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchMediaAssets(orgId: string): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from('media_assets')
    .select('id, folder, file_name, storage_path, file_size, mime_type, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapMediaAsset);
}

export async function uploadMediaAsset(orgId: string, file: File, folder: string): Promise<MediaAsset> {
  if (file.size > MEDIA_ASSET_MAX_SIZE_BYTES) {
    throw new Error('File is too large — please keep media assets under 10MB.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload media assets.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${orgId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(MEDIA_ASSETS_BUCKET).upload(storagePath, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      org_id: orgId,
      folder: folder || 'General',
      file_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: user.id,
    })
    .select('id, folder, file_name, storage_path, file_size, mime_type, created_at')
    .single();
  if (error) {
    await supabase.storage.from(MEDIA_ASSETS_BUCKET).remove([storagePath]);
    throw error;
  }
  return mapMediaAsset(data);
}

export async function deleteMediaAsset(asset: MediaAsset): Promise<void> {
  const { error: storageError } = await supabase.storage.from(MEDIA_ASSETS_BUCKET).remove([asset.storagePath]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('media_assets').delete().eq('id', asset.id);
  if (error) throw error;
}

export async function getMediaAssetUrl(asset: MediaAsset): Promise<string> {
  const { data, error } = await supabase.storage.from(MEDIA_ASSETS_BUCKET).createSignedUrl(asset.storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

// --- Tracking links (admin-only) ---
// Real short links: /r/{code} is resolved server-side by server.ts, which
// calls the resolve_tracking_link() RPC (logs the click, then redirects) —
// see docs/procurement-expansion-assessment.md for why this needed a real
// server route rather than a client-side SPA route.

function mapTrackingLink(row: any): TrackingLink {
  return {
    id: row.id,
    label: row.label,
    targetUrl: row.target_url,
    shortCode: row.short_code,
    clickCount: row.click_count,
    createdAt: row.created_at,
    campaignId: row.campaign_id ?? null,
  };
}

function generateShortCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

const TRACKING_LINK_SELECT = 'id, label, target_url, short_code, click_count, created_at, campaign_id';

export async function fetchTrackingLinks(orgId: string): Promise<TrackingLink[]> {
  const { data, error } = await supabase
    .from('tracking_links')
    .select(TRACKING_LINK_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTrackingLink);
}

export async function createTrackingLink(orgId: string, label: string, targetUrl: string, campaignId?: string | null): Promise<TrackingLink> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('tracking_links')
    .insert({
      org_id: orgId,
      label,
      target_url: targetUrl,
      short_code: generateShortCode(),
      created_by: user.id,
      campaign_id: campaignId ?? null,
    })
    .select(TRACKING_LINK_SELECT)
    .single();
  if (error) throw error;
  return mapTrackingLink(data);
}

export async function deleteTrackingLink(id: string): Promise<void> {
  const { error } = await supabase.from('tracking_links').delete().eq('id', id);
  if (error) throw error;
}

export interface ClickSeriesPoint {
  date: string;
  count: number;
}

// Groups the org's raw click timestamps into a real daily series for the
// last `days` days — replaces the previous hardcoded bar-chart array.
export async function fetchClickSeries(orgId: string, days: number): Promise<ClickSeriesPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('tracking_link_clicks')
    .select('clicked_at')
    .eq('org_id', orgId)
    .gte('clicked_at', since.toISOString());
  if (error) throw error;

  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    counts.set(d.toISOString().split('T')[0], 0);
  }
  for (const row of data ?? []) {
    const day = new Date(row.clicked_at).toISOString().split('T')[0];
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

export interface WeekdayClickPoint {
  weekday: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
  count: number;
}

// Real click-count-by-weekday over the last `days` days -- surfaces which
// day of the week actually gets engagement, computed from raw
// tracking_link_clicks timestamps rather than shown as a guess.
export async function fetchClicksByWeekday(orgId: string, days = 90): Promise<WeekdayClickPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('tracking_link_clicks')
    .select('clicked_at')
    .eq('org_id', orgId)
    .gte('clicked_at', since.toISOString());
  if (error) throw error;

  const labels: WeekdayClickPoint['weekday'][] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = labels.map((weekday) => ({ weekday, count: 0 }));
  for (const row of data ?? []) {
    const dayIndex = new Date(row.clicked_at).getDay();
    counts[dayIndex].count += 1;
  }
  return counts;
}

function mapAudienceSegment(row: any): AudienceSegment {
  return {
    id: row.id,
    name: row.name,
    districts: row.districts ?? [],
    diasporaMarkets: row.diaspora_markets ?? [],
    interests: row.interests ?? [],
    createdAt: row.created_at,
  };
}

export async function fetchAudienceSegments(orgId: string): Promise<AudienceSegment[]> {
  const { data, error } = await supabase
    .from('audience_segments')
    .select('id, name, districts, diaspora_markets, interests, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAudienceSegment);
}

export async function createAudienceSegment(
  orgId: string,
  input: { name: string; districts: string[]; diasporaMarkets: string[]; interests: string[] }
): Promise<AudienceSegment> {
  const row = unwrap(
    await supabase
      .from('audience_segments')
      .insert({
        org_id: orgId,
        name: input.name,
        districts: input.districts,
        diaspora_markets: input.diasporaMarkets,
        interests: input.interests,
      })
      .select('*')
      .single()
  );
  return mapAudienceSegment(row);
}

export async function deleteAudienceSegment(id: string): Promise<void> {
  const { error } = await supabase.from('audience_segments').delete().eq('id', id);
  if (error) throw error;
}
