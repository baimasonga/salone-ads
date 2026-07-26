import { supabase } from './supabaseClient';

export type PublicAdvertEventType =
  | 'impression'
  | 'detail_view'
  | 'cta_click'
  | 'share'
  | 'download';

export type AdvertAction =
  | 'advert_card'
  | 'whatsapp'
  | 'phone'
  | 'website'
  | 'social'
  | 'native_share'
  | 'copy_link'
  | 'download';

export interface AdvertEventInput {
  advertId: string;
  eventType: PublicAdvertEventType;
  action?: AdvertAction;
  channel?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AdvertPerformance {
  advertId: string;
  periodDays: number;
  impressions: number;
  uniqueViewers: number;
  detailViews: number;
  ctaClicks: number;
  shares: number;
  downloads: number;
  actions: Record<string, number>;
}

export interface AdvertTimeSeriesPoint {
  period: string;
  impressions: number;
  uniqueViewers: number;
  detailViews: number;
  ctaClicks: number;
  shares: number;
  downloads: number;
}

export interface AdvertBreakdownItem {
  label: string;
  value: number;
}

export interface AdvertPerformanceReport extends AdvertPerformance {
  granularity: 'day' | 'week' | 'month';
  timeSeries: AdvertTimeSeriesPoint[];
  sources: AdvertBreakdownItem[];
  devices: AdvertBreakdownItem[];
}

export interface AdvertCampaignPerformance extends AdvertPerformanceReport {
  title: string;
  category: string;
  businessName: string;
  summary: string | null;
  creativeUrl: string | null;
  accentColor: string | null;
  status: 'draft' | 'live' | 'archived';
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
}

const VISITOR_TOKEN_KEY = 'manohub.analytics.visitor';
const MAX_METADATA_ENTRIES = 12;

function getOrCreateVisitorToken(): string {
  if (typeof window === 'undefined') return crypto.randomUUID();

  try {
    const existing = window.localStorage.getItem(VISITOR_TOKEN_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_TOKEN_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function detectDeviceClass(): 'mobile' | 'tablet' | 'desktop' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const agent = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(agent)) return 'tablet';
  if (/android|iphone|ipod|mobile/.test(agent)) return 'mobile';
  return /windows|macintosh|linux|cros/.test(agent) ? 'desktop' : 'other';
}

function safeReferrerHost(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).hostname.slice(0, 255);
  } catch {
    return null;
  }
}

function sourceFromLocation(): string {
  if (typeof window === 'undefined') return 'direct';
  const params = new URLSearchParams(window.location.search);
  const tagged = params.get('utm_source')?.trim().toLowerCase();
  if (tagged) return tagged.slice(0, 80);
  return safeReferrerHost() || 'direct';
}

function cleanMetadata(
  metadata: AdvertEventInput['metadata']
): Record<string, string | number | boolean | null> {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) =>
        !['email', 'phone', 'telephone', 'whatsapp', 'name', 'address', 'ip', 'user_id'].includes(
          key.toLowerCase()
        ) &&
        (value === null || ['string', 'number', 'boolean'].includes(typeof value))
      )
      .slice(0, MAX_METADATA_ENTRIES)
  );
}

function dedupeWindow(eventType: PublicAdvertEventType): number {
  if (eventType === 'impression' || eventType === 'detail_view') return 30 * 60_000;
  return 10_000;
}

export async function trackAdvertEvent(input: AdvertEventInput): Promise<boolean> {
  try {
    const visitorTokenHash = await sha256(getOrCreateVisitorToken());
    const bucket = Math.floor(Date.now() / dedupeWindow(input.eventType));
    const dedupeKey = await sha256(
      [input.advertId, input.eventType, input.action || '', visitorTokenHash, bucket].join(':')
    );

    const { data, error } = await supabase.rpc('track_advert_event', {
      p_advert_id: input.advertId,
      p_event_type: input.eventType,
      p_visitor_token_hash: visitorTokenHash,
      p_action: input.action ?? null,
      p_source: sourceFromLocation(),
      p_channel: input.channel?.slice(0, 40) ?? null,
      p_referrer_host: safeReferrerHost(),
      p_device_class: detectDeviceClass(),
      p_country_code: null,
      p_district: null,
      p_dedupe_key: dedupeKey,
      p_metadata: cleanMetadata(input.metadata),
    });

    if (error) return false;
    return data === true;
  } catch {
    // Analytics is best-effort and must never block advert discovery or CTAs.
    return false;
  }
}

export async function fetchAdvertPerformance(
  advertId: string,
  periodDays = 30
): Promise<AdvertPerformance> {
  const { data, error } = await supabase.rpc('get_advert_performance', {
    p_advert_id: advertId,
    p_days: periodDays,
  });
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    advertId: String(result.advert_id ?? advertId),
    periodDays: Number(result.period_days ?? periodDays),
    impressions: Number(result.impressions ?? 0),
    uniqueViewers: Number(result.unique_viewers ?? 0),
    detailViews: Number(result.detail_views ?? 0),
    ctaClicks: Number(result.cta_clicks ?? 0),
    shares: Number(result.shares ?? 0),
    downloads: Number(result.downloads ?? 0),
    actions: (result.actions ?? {}) as Record<string, number>,
  };
}

function breakdown(value: unknown): AdvertBreakdownItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return { label: String(row.label ?? 'other'), value: Number(row.value ?? 0) };
  });
}

function timeSeries(value: unknown): AdvertTimeSeriesPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      period: String(row.period ?? ''),
      impressions: Number(row.impressions ?? 0),
      uniqueViewers: Number(row.unique_viewers ?? 0),
      detailViews: Number(row.detail_views ?? 0),
      ctaClicks: Number(row.cta_clicks ?? 0),
      shares: Number(row.shares ?? 0),
      downloads: Number(row.downloads ?? 0),
    };
  });
}

export async function fetchAdvertPerformanceReport(
  advertId: string,
  periodDays = 30
): Promise<AdvertPerformanceReport> {
  const { data, error } = await supabase.rpc('get_advert_performance_report', {
    p_advert_id: advertId,
    p_days: periodDays,
  });
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    advertId: String(result.advert_id ?? advertId),
    periodDays: Number(result.period_days ?? periodDays),
    granularity: (result.granularity ?? 'day') as AdvertPerformanceReport['granularity'],
    impressions: Number(result.impressions ?? 0),
    uniqueViewers: Number(result.unique_viewers ?? 0),
    detailViews: Number(result.detail_views ?? 0),
    ctaClicks: Number(result.cta_clicks ?? 0),
    shares: Number(result.shares ?? 0),
    downloads: Number(result.downloads ?? 0),
    actions: (result.actions ?? {}) as Record<string, number>,
    timeSeries: timeSeries(result.time_series),
    sources: breakdown(result.sources),
    devices: breakdown(result.devices),
  };
}

export async function fetchOrganizationAdvertPerformance(
  organizationId: string,
  periodDays = 30
): Promise<AdvertCampaignPerformance[]> {
  const { data: adverts, error } = await supabase
    .from('adverts')
    .select(
      'id, title, category, business_name, summary, creative_url, og_image_url, accent_color, status, starts_at, ends_at, published_at'
    )
    .eq('org_id', organizationId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return Promise.all(
    (adverts ?? []).map(async (advert) => {
      const performance = await fetchAdvertPerformanceReport(advert.id, periodDays);
      return {
        ...performance,
        title: advert.title,
        category: advert.category,
        businessName: advert.business_name,
        summary: advert.summary ?? null,
        creativeUrl: advert.creative_url ?? advert.og_image_url ?? null,
        accentColor: advert.accent_color ?? null,
        status: advert.status,
        startsAt: advert.starts_at ?? null,
        endsAt: advert.ends_at ?? null,
        publishedAt: advert.published_at ?? null,
      } as AdvertCampaignPerformance;
    })
  );
}
