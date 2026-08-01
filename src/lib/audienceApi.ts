import { supabase } from './supabaseClient';

export interface PublicAudienceSubscriber {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  interests: string[];
  locations: string[];
  preferredChannels: string[];
  frequency: 'urgent' | 'daily' | 'weekly';
  status: 'active' | 'suppressed' | 'unsubscribed';
  consentAt: string;
  consentSource: string;
  createdAt: string;
}

const mapPublicAudienceSubscriber = (row: any): PublicAudienceSubscriber => ({
  id: row.id,
  fullName: row.full_name ?? '',
  email: row.email ?? null,
  phone: row.phone ?? null,
  interests: row.interests ?? [],
  locations: row.locations ?? [],
  preferredChannels: row.preferred_channels ?? [],
  frequency: row.frequency,
  status: row.status,
  consentAt: row.consent_at,
  consentSource: row.consent_source,
  createdAt: row.created_at,
});

export async function subscribePublicAudience(input: {
  fullName: string;
  email: string;
  phone: string;
  interests: string[];
  locations: string[];
  preferredChannels: string[];
  frequency: 'urgent' | 'daily' | 'weekly';
}): Promise<void> {
  const email = input.email.trim().toLowerCase() || null;
  const phone = input.phone.trim() || null;
  if (!email && !phone) throw new Error('Enter an email address or WhatsApp number.');
  if (!input.interests.length) throw new Error('Choose at least one interest.');
  const { error } = await supabase.from('public_audience_subscribers').insert({
    full_name: input.fullName.trim(),
    email,
    phone,
    interests: input.interests,
    locations: input.locations,
    preferred_channels: input.preferredChannels,
    frequency: input.frequency,
    status: 'active',
    consent_given: true,
    consent_source: 'manohub_homepage',
  });
  if (error?.code === '23505') throw new Error('This email address or phone number is already subscribed.');
  if (error) throw error;
}

export async function unsubscribePublicAudience(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unsubscribe_public_audience', { p_token: token });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchPublicAudienceSubscribers(): Promise<PublicAudienceSubscriber[]> {
  const { data, error } = await supabase.from('public_audience_subscribers')
    .select('id, full_name, email, phone, interests, locations, preferred_channels, frequency, status, consent_at, consent_source, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPublicAudienceSubscriber);
}

export async function updatePublicAudienceSubscriberStatus(
  id: string,
  status: PublicAudienceSubscriber['status'],
): Promise<void> {
  const { error } = await supabase.from('public_audience_subscribers').update({
    status,
    unsubscribed_at: status === 'unsubscribed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export interface AudienceEmailCampaign {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  targetInterests: string[];
  targetLocations: string[];
  targetFrequencies: string[];
  status: 'draft' | 'scheduled' | 'queued' | 'processing' | 'sent' | 'cancelled';
  scheduledAt: string | null;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  complainedCount: number;
  suppressedCount: number;
  createdAt: string;
}

const mapAudienceEmailCampaign = (row: any): AudienceEmailCampaign => ({
  id: row.id,
  name: row.name,
  subject: row.subject,
  previewText: row.preview_text ?? '',
  body: row.body,
  ctaLabel: row.cta_label ?? '',
  ctaHref: row.cta_href ?? '',
  targetInterests: row.target_interests ?? [],
  targetLocations: row.target_locations ?? [],
  targetFrequencies: row.target_frequencies ?? [],
  status: row.status,
  scheduledAt: row.scheduled_at ?? null,
  queuedCount: row.queued_count ?? 0,
  sentCount: row.sent_count ?? 0,
  failedCount: row.failed_count ?? 0,
  deliveredCount: row.delivered_count ?? 0,
  openedCount: row.opened_count ?? 0,
  clickedCount: row.clicked_count ?? 0,
  bouncedCount: row.bounced_count ?? 0,
  complainedCount: row.complained_count ?? 0,
  suppressedCount: row.suppressed_count ?? 0,
  createdAt: row.created_at,
});

export async function fetchAudienceEmailCampaigns(): Promise<AudienceEmailCampaign[]> {
  const { data, error } = await supabase.from('audience_email_campaigns').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAudienceEmailCampaign);
}

export async function createAudienceEmailCampaign(input: {
  name: string;
  subject: string;
  previewText: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  targetInterests: string[];
  targetLocations: string[];
  targetFrequencies: string[];
  scheduledAt: string | null;
}): Promise<AudienceEmailCampaign> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('audience_email_campaigns').insert({
    name: input.name.trim(),
    subject: input.subject.trim(),
    preview_text: input.previewText.trim(),
    body: input.body.trim(),
    cta_label: input.ctaLabel.trim(),
    cta_href: input.ctaHref.trim(),
    target_interests: input.targetInterests,
    target_locations: input.targetLocations,
    target_frequencies: input.targetFrequencies,
    scheduled_at: input.scheduledAt,
    created_by: user?.id ?? null,
  }).select('*').single();
  if (error) throw error;
  return mapAudienceEmailCampaign(data);
}

export async function queueAudienceEmailCampaign(campaignId: string): Promise<number> {
  const { data, error } = await supabase.rpc('queue_audience_email_campaign', { p_campaign_id: campaignId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function cancelAudienceEmailCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase.from('audience_email_campaigns').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId).in('status', ['draft', 'scheduled', 'queued']);
  if (error) throw error;
}

async function authenticatedEmailRequest(path: string, payload: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? 'Email delivery request failed.');
}

export async function sendAudienceEmailTest(input: { to: string; subject: string; previewText: string; body: string; ctaLabel: string; ctaHref: string }): Promise<void> {
  await authenticatedEmailRequest('/api/audience-email/test', input);
}

export async function dispatchAudienceEmailCampaign(campaignId: string): Promise<void> {
  await authenticatedEmailRequest(`/api/audience-email/dispatch/${campaignId}`, {});
}
