import { supabase } from './supabaseClient';
import { scanFileBeforeUpload } from './fileSecurity';

const MAX_ADVERT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ADVERT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'advert';
}

// Tighten raw advert input into a punchy { headline, body } for the creative.
export async function aiPolishAdvertCopy(input: {
  businessName?: string;
  category?: string;
  subject: string;
  description?: string;
}): Promise<{ headline: string; body: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/gemini/advert-copy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'AI copy assist failed.');
  return { headline: data.headline || input.subject, body: data.body || input.description || '' };
}

// --- Advertiser subscribers: "My Adverts" (submit + read-only report) ---
//
// This is deliberately narrow. An Advertiser-tier subscriber never gets
// directory/event-promotion browsing UI -- they submit what they want
// advertised, admins design/run it (same admin-only ad-platform tooling
// used for everything else), and this table is the read-only report of
// what actually happened: platform it ran on, how many times, and reach.
// INSERT is entitlement-gated by org_has_feature(org_id, 'business_advertising')
// via RLS; UPDATE is admin-only (no self-service edits after submission).

export type AdvertisementCategory = 'business' | 'event' | 'goods' | 'service';
export type AdvertisementStatus = 'submitted' | 'in_production' | 'live' | 'completed' | 'cancelled';

export interface AdvertisementRequest {
  id: string;
  orgId: string;
  orgName?: string;
  category: AdvertisementCategory;
  subject: string;
  description: string;
  status: AdvertisementStatus;
  platform: string | null;
  mediaUrl: string | null;
  reachCount: number | null;
  runCount: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const AD_REQUEST_SELECT =
  'id, org_id, category, subject, description, status, platform, media_url, reach_count, run_count, start_date, end_date, created_at';

function mapAdvertisementRequest(row: any): AdvertisementRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status,
    platform: row.platform,
    mediaUrl: row.media_url ?? null,
    reachCount: row.reach_count,
    runCount: row.run_count,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

export async function submitAdvertisementRequest(
  orgId: string,
  input: { category: AdvertisementCategory; subject: string; description: string; mediaUrl?: string | null }
): Promise<AdvertisementRequest> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('advertisement_requests')
    .insert({
      org_id: orgId,
      requested_by: user.id,
      category: input.category,
      subject: input.subject,
      description: input.description,
      media_url: input.mediaUrl ?? null,
    })
    .select(AD_REQUEST_SELECT)
    .single();
  if (error) throw error;
  return mapAdvertisementRequest(data);
}

export async function fetchMyAdvertisements(orgId: string): Promise<AdvertisementRequest[]> {
  const { data, error } = await supabase
    .from('advertisement_requests')
    .select(AD_REQUEST_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAdvertisementRequest);
}

// Admin fulfillment queue -- every org's requests, since admins aren't
// members of every org and RLS grants them SELECT via is_platform_admin().
export async function fetchAllAdvertisementRequests(): Promise<AdvertisementRequest[]> {
  const { data, error } = await supabase
    .from('advertisement_requests')
    .select(`${AD_REQUEST_SELECT}, organizations(name)`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...mapAdvertisementRequest(row), orgName: row.organizations?.name }));
}

export interface UpdateAdvertisementReportInput {
  status?: AdvertisementStatus;
  platform?: string | null;
  reachCount?: number | null;
  runCount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export async function updateAdvertisementReport(id: string, updates: UpdateAdvertisementReportInput): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.platform !== undefined) patch.platform = updates.platform;
  if (updates.reachCount !== undefined) patch.reach_count = updates.reachCount;
  if (updates.runCount !== undefined) patch.run_count = updates.runCount;
  if (updates.startDate !== undefined) patch.start_date = updates.startDate;
  if (updates.endDate !== undefined) patch.end_date = updates.endDate;
  const { error } = await supabase.from('advertisement_requests').update(patch).eq('id', id);
  if (error) throw error;
}

// ── Public adverts (shown on the site) ──────────────────────────────────────
// Hyderra is the source of truth: an admin authors the advert here and stores
// the social post URL once it's live. Public visitors can read status='live'
// rows only (RLS); the detail page links out to the social platform.
export type AdvertStatus = 'draft' | 'live' | 'archived';

export interface Advert {
  id: string;
  slug: string;
  title: string;
  category: string;
  businessName: string;
  summary: string | null;
  content: string;
  mediaUrl: string | null;
  socialPlatform: string | null;
  socialUrl: string | null;
  creativeUrl: string | null;
  ogImageUrl: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  theme: 'dark' | 'light';
  format: 'square' | 'story' | 'landscape' | 'banner' | 'editorial';
  withPhoto: boolean;
  viewCount: number;
  clickCount: number;
  campaignId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: AdvertStatus;
  publishedAt: string | null;
  createdAt: string;
}

export const ADVERT_SELECT =
  'id, slug, title, category, business_name, summary, content, media_url, social_platform, social_url, creative_url, og_image_url, accent_color, logo_url, theme, format, with_photo, view_count, click_count, campaign_id, starts_at, ends_at, status, published_at, created_at';

export function mapAdvert(row: any): Advert {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    businessName: row.business_name,
    summary: row.summary ?? null,
    content: row.content ?? '',
    mediaUrl: row.media_url ?? null,
    socialPlatform: row.social_platform ?? null,
    socialUrl: row.social_url ?? null,
    creativeUrl: row.creative_url ?? null,
    ogImageUrl: row.og_image_url ?? null,
    accentColor: row.accent_color ?? null,
    logoUrl: row.logo_url ?? null,
    theme: row.theme ?? 'dark',
    format: row.format ?? 'square',
    withPhoto: row.with_photo ?? true,
    viewCount: row.view_count ?? 0,
    clickCount: row.click_count ?? 0,
    campaignId: row.campaign_id ?? null,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    status: row.status,
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
  };
}

// Upload an exported creative PNG (data URL) to the public advert-creatives
// bucket and return its public URL — for social/print hand-off.
export async function uploadAdvertCreative(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.size > MAX_ADVERT_IMAGE_SIZE_BYTES) {
    throw new Error('Creative is too large — please keep images under 10MB.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in before uploading a creative.');
  await scanFileBeforeUpload(blob, 'image', 'generated-creative.png');
  const path = `${user.id}/generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage.from('advert-creatives').upload(path, blob, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  return supabase.storage.from('advert-creatives').getPublicUrl(path).data.publicUrl;
}

// Upload an advert photo or logo (a real image file) to the public
// advert-creatives bucket and return its public URL. Used by the advert forms
// so advertisers can add an image without hosting one themselves.
export async function uploadAdvertImage(file: File, kind: 'photo' | 'logo' = 'photo'): Promise<string> {
  if (file.size > MAX_ADVERT_IMAGE_SIZE_BYTES) {
    throw new Error('Image is too large — please keep images under 10MB.');
  }
  if (!ALLOWED_ADVERT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in before uploading an image.');
  await scanFileBeforeUpload(file, 'image');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${user.id}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('advert-creatives').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return supabase.storage.from('advert-creatives').getPublicUrl(path).data.publicUrl;
}

// Public: live adverts for the homepage banner (anon-readable via RLS).
export async function fetchLiveAdverts(limit = 20): Promise<Advert[]> {
  const { data, error } = await supabase
    .from('adverts')
    .select(ADVERT_SELECT)
    .eq('status', 'live')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapAdvert);
}

// Public: single advert detail by slug (only resolves if live, per RLS).
export async function fetchAdvertBySlug(slug: string): Promise<Advert | null> {
  const { data, error } = await supabase
    .from('adverts')
    .select(ADVERT_SELECT)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAdvert(data) : null;
}

// Public analytics: count a detail-page view / a "view on social" click.
// Best-effort — failures are swallowed so they never break the page.
export async function trackAdvertView(slug: string): Promise<void> {
  try { await supabase.rpc('track_advert_view', { p_slug: slug }); } catch { /* ignore */ }
}
export async function trackAdvertClick(id: string): Promise<void> {
  try { await supabase.rpc('track_advert_click', { p_id: id }); } catch { /* ignore */ }
}

export interface AdvertAnalyticsSummary {
  viewsTotal: number;
  clicksTotal: number;
  liveCount: number;
  views7d: number;
  clicks7d: number;
  views30d: number;
  clicks30d: number;
}

// Admin-only: lifetime + last 7/30 day view & click totals across all adverts.
export async function fetchAdvertAnalyticsSummary(): Promise<AdvertAnalyticsSummary> {
  const { data, error } = await supabase.rpc('get_advert_analytics_summary');
  if (error) throw error;
  const d = (data ?? {}) as any;
  return {
    viewsTotal: Number(d.views_total ?? 0),
    clicksTotal: Number(d.clicks_total ?? 0),
    liveCount: Number(d.live_count ?? 0),
    views7d: Number(d.views_7d ?? 0),
    clicks7d: Number(d.clicks_7d ?? 0),
    views30d: Number(d.views_30d ?? 0),
    clicks30d: Number(d.clicks_30d ?? 0),
  };
}

// Ready-to-paste social captions for a published advert, each ending with the
// advert's public Hyderra page — the source-of-truth hand-off (no platform API
// keys). Shared by the admin publisher and the public detail page.
export function buildAdvertSharePack(adv: Advert): { key: string; label: string; text: string }[] {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://manohub.com';
  const url = `${base}/adverts/${adv.slug}`;
  const title = adv.title.trim();
  const biz = adv.businessName.trim();
  const summary = (adv.summary || adv.content || '').trim();
  const catTag = adv.category ? `#${adv.category.replace(/[^a-zA-Z0-9]+/g, '')}` : '';
  const tags = [catTag, '#Hyderra', '#SierraLeone', '#Liberia'].filter(Boolean).join(' ');
  const wa = `📣 ${title}\n\n${summary}\n\n— ${biz}\n👉 Details & contact: ${url}`;
  const fb = `${title}\n\n${summary}\n\nBrought to you by ${biz} on Hyderra.\nFull details 👉 ${url}\n\n${tags}`;
  const ig = `${title} ✨\n${summary}\n\n${biz} — see the full advert 👉 ${url}\n(link in bio)\n\n${tags} #ManoRiver`;
  let x = `${title} — ${biz}. ${url} ${catTag} #Hyderra`.trim();
  if (x.length > 280) x = `${title.slice(0, 180)}… ${url} #Hyderra`;
  return [
    { key: 'whatsapp', label: 'WhatsApp', text: wa },
    { key: 'facebook', label: 'Facebook', text: fb },
    { key: 'instagram', label: 'Instagram', text: ig },
    { key: 'x', label: 'X / Twitter', text: x },
  ];
}

// The public URL of an advert's Hyderra page.
export function advertPublicUrl(adv: Advert): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://manohub.com';
  return `${base}/adverts/${adv.slug}`;
}

// One-click distribution: platform share-intent links that open each app's
// composer with the caption + advert link pre-filled, so posting is one tap.
export function buildAdvertShareIntents(adv: Advert): { key: string; label: string; href: string }[] {
  const url = advertPublicUrl(adv);
  const short = `${adv.title} — ${adv.businessName}`;
  const u = encodeURIComponent(url);
  const waText = encodeURIComponent(`${short}\n${url}`);
  const xText = encodeURIComponent(short);
  const tgText = encodeURIComponent(short);
  return [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${waText}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${xText}&url=${u}` },
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${tgText}` },
  ];
}

// Admin: every advert (draft/live/archived) for the fulfillment/publish queue.
export async function fetchAllAdverts(): Promise<Advert[]> {
  const { data, error } = await supabase
    .from('adverts')
    .select(ADVERT_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAdvert);
}

export interface CreateAdvertInput {
  title: string;
  category: string;
  businessName: string;
  summary?: string | null;
  content: string;
  mediaUrl?: string | null;
  socialPlatform?: string | null;
  socialUrl?: string | null;
  creativeUrl?: string | null;
  ogImageUrl?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  theme?: 'dark' | 'light';
  format?: 'square' | 'story' | 'landscape' | 'banner' | 'editorial';
  withPhoto?: boolean;
  campaignId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: AdvertStatus;
  orgId?: string | null;
  requestId?: string | null;
}

// Admin: create an advert. Generates a unique slug from the title.
export async function createAdvert(input: CreateAdvertInput): Promise<Advert> {
  const { data: { user } } = await supabase.auth.getUser();
  const base = slugify(input.title);
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  const status = input.status ?? 'draft';
  const { data, error } = await supabase
    .from('adverts')
    .insert({
      slug,
      title: input.title,
      category: input.category,
      business_name: input.businessName,
      summary: input.summary ?? null,
      content: input.content,
      media_url: input.mediaUrl ?? null,
      social_platform: input.socialPlatform ?? null,
      social_url: input.socialUrl ?? null,
      creative_url: input.creativeUrl ?? null,
      og_image_url: input.ogImageUrl ?? null,
      accent_color: input.accentColor ?? null,
      logo_url: input.logoUrl ?? null,
      theme: input.theme ?? 'dark',
      format: input.format ?? 'square',
      with_photo: input.withPhoto ?? true,
      campaign_id: input.campaignId ?? null,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      status,
      org_id: input.orgId ?? null,
      request_id: input.requestId ?? null,
      created_by: user?.id ?? null,
      published_at: status === 'live' ? new Date().toISOString() : null,
    })
    .select(ADVERT_SELECT)
    .single();
  if (error) throw error;
  return mapAdvert(data);
}

export interface UpdateAdvertInput {
  title?: string;
  category?: string;
  businessName?: string;
  summary?: string | null;
  content?: string;
  mediaUrl?: string | null;
  socialPlatform?: string | null;
  socialUrl?: string | null;
  creativeUrl?: string | null;
  ogImageUrl?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  theme?: 'dark' | 'light';
  format?: 'square' | 'story' | 'landscape' | 'banner' | 'editorial';
  withPhoto?: boolean;
  campaignId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: AdvertStatus;
}

export async function updateAdvert(id: string, updates: UpdateAdvertInput): Promise<Advert> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.businessName !== undefined) patch.business_name = updates.businessName;
  if (updates.summary !== undefined) patch.summary = updates.summary;
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.mediaUrl !== undefined) patch.media_url = updates.mediaUrl;
  if (updates.socialPlatform !== undefined) patch.social_platform = updates.socialPlatform;
  if (updates.socialUrl !== undefined) patch.social_url = updates.socialUrl;
  if (updates.creativeUrl !== undefined) patch.creative_url = updates.creativeUrl;
  if (updates.ogImageUrl !== undefined) patch.og_image_url = updates.ogImageUrl;
  if (updates.accentColor !== undefined) patch.accent_color = updates.accentColor;
  if (updates.logoUrl !== undefined) patch.logo_url = updates.logoUrl;
  if (updates.theme !== undefined) patch.theme = updates.theme;
  if (updates.format !== undefined) patch.format = updates.format;
  if (updates.withPhoto !== undefined) patch.with_photo = updates.withPhoto;
  if (updates.campaignId !== undefined) patch.campaign_id = updates.campaignId;
  if (updates.startsAt !== undefined) patch.starts_at = updates.startsAt;
  if (updates.endsAt !== undefined) patch.ends_at = updates.endsAt;
  if (updates.status !== undefined) {
    patch.status = updates.status;
    if (updates.status === 'live') patch.published_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from('adverts').update(patch).eq('id', id).select(ADVERT_SELECT).single();
  if (error) throw error;
  return mapAdvert(data);
}

export async function deleteAdvert(id: string): Promise<void> {
  const { error } = await supabase.from('adverts').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────── Ad campaigns ───────────────────────────
// A campaign groups several advert creatives, gives them a run window and a
// reach goal; its creatives rotate through the marquee/feed while it is active.

export type CampaignStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'paused'
  | 'completed';

export type AdCampaignObjective = 'awareness' | 'traffic' | 'leads' | 'sales';
export type AdCampaignDevice = 'mobile' | 'desktop' | 'tablet';
export type AdCampaignChannel = 'manohub' | 'facebook' | 'instagram' | 'whatsapp' | 'tiktok' | 'youtube' | 'linkedin' | 'x';

export interface AdCampaign {
  id: string;
  orgId: string | null;
  name: string;
  businessName: string;
  description: string;
  objective: AdCampaignObjective;
  startDate: string | null;
  endDate: string | null;
  reachGoal: number | null;
  totalBudget: number | null;
  dailyBudget: number | null;
  currencyCode: string;
  locationTargets: string[];
  categoryTargets: string[];
  deviceTargets: AdCampaignDevice[];
  channels: AdCampaignChannel[];
  status: CampaignStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignReach { adverts: number; views: number; clicks: number }

const CAMPAIGN_SELECT = [
  'id', 'org_id', 'name', 'business_name', 'description', 'objective',
  'start_date', 'end_date', 'reach_goal', 'total_budget', 'daily_budget',
  'currency_code', 'location_targets', 'category_targets', 'device_targets',
  'channels', 'status', 'rejection_reason', 'submitted_at', 'approved_at', 'created_at', 'updated_at',
].join(', ');

function mapCampaign(row: any): AdCampaign {
  return {
    id: row.id,
    orgId: row.org_id ?? null,
    name: row.name,
    businessName: row.business_name ?? '',
    description: row.description ?? '',
    objective: row.objective ?? 'awareness',
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    reachGoal: row.reach_goal ?? null,
    totalBudget: row.total_budget === null || row.total_budget === undefined ? null : Number(row.total_budget),
    dailyBudget: row.daily_budget === null || row.daily_budget === undefined ? null : Number(row.daily_budget),
    currencyCode: row.currency_code ?? 'SLE',
    locationTargets: row.location_targets ?? [],
    categoryTargets: row.category_targets ?? [],
    deviceTargets: row.device_targets ?? [],
    channels: row.channels ?? ['manohub'],
    status: row.status,
    rejectionReason: row.rejection_reason ?? null,
    submittedAt: row.submitted_at ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchAllCampaigns(): Promise<AdCampaign[]> {
  const { data, error } = await supabase.from('ad_campaigns').select(CAMPAIGN_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCampaign);
}

// Reach summary keyed by campaign id: member count + summed views/clicks.
export async function fetchCampaignReach(): Promise<Record<string, CampaignReach>> {
  const { data, error } = await supabase.rpc('get_campaign_reach');
  if (error) throw error;
  return (data ?? {}) as Record<string, CampaignReach>;
}

export interface CreateCampaignInput {
  name: string;
  businessName?: string;
  description?: string;
  objective?: AdCampaignObjective;
  startDate?: string | null;
  endDate?: string | null;
  reachGoal?: number | null;
  totalBudget?: number | null;
  dailyBudget?: number | null;
  currencyCode?: string;
  locationTargets?: string[];
  categoryTargets?: string[];
  deviceTargets?: AdCampaignDevice[];
  channels?: AdCampaignChannel[];
  status?: Extract<CampaignStatus, 'draft' | 'submitted' | 'active'>;
  orgId?: string | null;
}

export async function createCampaign(input: CreateCampaignInput): Promise<AdCampaign> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('ad_campaigns')
    .insert({
      name: input.name,
      business_name: input.businessName ?? '',
      description: input.description ?? '',
      objective: input.objective ?? 'awareness',
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      reach_goal: input.reachGoal ?? null,
      total_budget: input.totalBudget ?? null,
      daily_budget: input.dailyBudget ?? null,
      currency_code: input.currencyCode ?? 'SLE',
      location_targets: input.locationTargets ?? [],
      category_targets: input.categoryTargets ?? [],
      device_targets: input.deviceTargets ?? [],
      channels: input.channels ?? ['manohub'],
      status: input.status ?? 'draft',
      submitted_at: input.status === 'submitted' ? new Date().toISOString() : null,
      org_id: input.orgId ?? null,
      created_by: user?.id ?? null,
    })
    .select(CAMPAIGN_SELECT)
    .single();
  if (error) throw error;
  return mapCampaign(data);
}

export async function fetchCampaignsForWorkspace(orgId: string, isPlatformAdmin: boolean): Promise<AdCampaign[]> {
  let query = supabase.from('ad_campaigns').select(CAMPAIGN_SELECT);
  if (!isPlatformAdmin) query = query.eq('org_id', orgId);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCampaign);
}

export async function fetchCampaignCreatives(campaignIds: string[]): Promise<Record<string, Advert[]>> {
  if (campaignIds.length === 0) return {};
  const { data, error } = await supabase
    .from('adverts')
    .select(ADVERT_SELECT)
    .in('campaign_id', campaignIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).reduce<Record<string, Advert[]>>((grouped, row) => {
    const advert = mapAdvert(row);
    if (!advert.campaignId) return grouped;
    (grouped[advert.campaignId] ??= []).push(advert);
    return grouped;
  }, {});
}

export async function updateAdCampaign(
  id: string,
  input: Omit<CreateCampaignInput, 'orgId' | 'status'>,
  status: Extract<CampaignStatus, 'draft' | 'submitted'> = 'draft'
): Promise<AdCampaign> {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .update({
      name: input.name,
      business_name: input.businessName ?? '',
      description: input.description ?? '',
      objective: input.objective ?? 'awareness',
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      reach_goal: input.reachGoal ?? null,
      total_budget: input.totalBudget ?? null,
      daily_budget: input.dailyBudget ?? null,
      currency_code: input.currencyCode ?? 'SLE',
      location_targets: input.locationTargets ?? [],
      category_targets: input.categoryTargets ?? [],
      device_targets: input.deviceTargets ?? [],
      channels: input.channels ?? ['manohub'],
      status,
      submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(CAMPAIGN_SELECT)
    .single();
  if (error) throw error;
  return mapCampaign(data);
}

// Pause/resume a campaign. Pausing archives its still-live creatives; resuming
// re-lives them — so a paused campaign disappears from the site regardless of
// its window, and the RLS window handles start/end automatically.
export async function setCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  const { error } = await supabase.from('ad_campaigns').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  if (status === 'paused') {
    await supabase.from('adverts').update({ status: 'archived' }).eq('campaign_id', id).eq('status', 'live');
  } else if (status === 'active') {
    await supabase.from('adverts').update({ status: 'live' }).eq('campaign_id', id).eq('status', 'archived');
  }
}

export async function reviewCampaign(id: string, decision: 'approved' | 'rejected', rejectionReason?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const patch = decision === 'approved'
    ? { status: 'approved', approved_at: now, reviewed_by: user?.id ?? null, rejection_reason: null, updated_at: now }
    : { status: 'rejected', approved_at: null, reviewed_by: user?.id ?? null, rejection_reason: rejectionReason?.trim() || 'Changes requested by Hyderra.', updated_at: now };
  const { error } = await supabase.from('ad_campaigns').update(patch).eq('id', id).eq('status', 'submitted');
  if (error) throw error;
}

export async function duplicateCampaign(campaign: AdCampaign): Promise<AdCampaign> {
  return createCampaign({
    orgId: campaign.orgId,
    name: `${campaign.name} (copy)`,
    businessName: campaign.businessName,
    description: campaign.description,
    objective: campaign.objective,
    startDate: null,
    endDate: null,
    reachGoal: campaign.reachGoal,
    totalBudget: campaign.totalBudget,
    dailyBudget: campaign.dailyBudget,
    currencyCode: campaign.currencyCode,
    locationTargets: campaign.locationTargets,
    categoryTargets: campaign.categoryTargets,
    deviceTargets: campaign.deviceTargets,
    channels: campaign.channels,
    status: 'draft',
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  // adverts.campaign_id is ON DELETE SET NULL — creatives survive, unlinked.
  const { error } = await supabase.from('ad_campaigns').delete().eq('id', id);
  if (error) throw error;
}
