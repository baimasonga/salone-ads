import { supabase } from './supabaseClient';

export type CmsContentType = 'page' | 'post';
export type CmsContentStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';
export type CmsTeamRole = 'writer' | 'editor' | 'publisher' | 'administrator';

export interface CmsContent {
  id: string;
  contentType: CmsContentType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
  authorName: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  status: CmsContentStatus;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
  socialImageUrl: string;
  canonicalUrl: string;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  assignedTo: string | null;
  reviewNote: string;
  reviewRequestedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  lockedBy: string | null;
  lockedUntil: string | null;
  nativeAdvertId: string | null;
  emailCampaignId: string | null;
}

export interface CmsContentRevision {
  id: number;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

const mapContent = (row: any): CmsContent => ({
  id: row.id,
  contentType: row.content_type,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt ?? '',
  body: row.body ?? '',
  category: row.category ?? 'Market updates',
  tags: row.tags ?? [],
  authorName: row.author_name ?? 'Manohub Editorial',
  featuredImageUrl: row.featured_image_url ?? '',
  featuredImageAlt: row.featured_image_alt ?? '',
  status: row.status,
  isFeatured: row.is_featured ?? false,
  seoTitle: row.seo_title ?? '',
  seoDescription: row.seo_description ?? '',
  socialImageUrl: row.social_image_url ?? '',
  canonicalUrl: row.canonical_url ?? '',
  publishedAt: row.published_at ?? null,
  deletedAt: row.deleted_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by ?? null,
  assignedTo: row.assigned_to ?? null,
  reviewNote: row.review_note ?? '',
  reviewRequestedAt: row.review_requested_at ?? null,
  reviewedAt: row.reviewed_at ?? null,
  reviewedBy: row.reviewed_by ?? null,
  lockedBy: row.locked_by ?? null,
  lockedUntil: row.locked_until ?? null,
  nativeAdvertId: row.native_advert_id ?? null,
  emailCampaignId: row.email_campaign_id ?? null,
});

export interface CmsEditorialComment { id: string; body: string; authorId: string; createdAt: string }
export interface CmsContentAnalytics { views: number; ctaClicks: number; adImpressions: number; adClicks: number; subscriptions: number }
export interface CmsTeamMember { userId: string; fullName: string; email: string; role: CmsTeamRole }
export interface CmsProfileOption { id: string; fullName: string; email: string }
export interface CmsActivity {
  id: number;
  contentId: string | null;
  actorId: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export function cmsSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 180) || `content-${Date.now()}`;
}

export async function fetchPublishedCmsContent(type?: CmsContentType): Promise<CmsContent[]> {
  const now = new Date().toISOString();
  let query = supabase.from('cms_content').select('*')
    .is('deleted_at', null).eq('status', 'published')
    .or(`published_at.is.null,published_at.lte.${now}`)
    .order('is_featured', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false });
  if (type) query = query.eq('content_type', type);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapContent);
}

export async function fetchPublishedCmsItem(slug: string): Promise<CmsContent | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('cms_content').select('*')
    .eq('slug', slug).is('deleted_at', null).eq('status', 'published')
    .or(`published_at.is.null,published_at.lte.${now}`).maybeSingle();
  if (error) throw error;
  return data ? mapContent(data) : null;
}

export async function fetchCmsContentPreview(contentId: string): Promise<CmsContent | null> {
  const { data, error } = await supabase.from('cms_content').select('*')
    .eq('id', contentId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data ? mapContent(data) : null;
}

export async function fetchAllCmsContent(includeTrash = false): Promise<CmsContent[]> {
  let query = supabase.from('cms_content').select('*').order('updated_at', { ascending: false });
  query = includeTrash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapContent);
}

export async function createCmsContent(type: CmsContentType): Promise<CmsContent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const title = type === 'post' ? 'New insight' : 'New page';
  const { data, error } = await supabase.from('cms_content').insert({
    content_type: type,
    slug: `${cmsSlug(title)}-${Date.now().toString(36)}`,
    title,
    excerpt: '',
    body: '',
    status: 'draft',
    created_by: user.id,
    updated_by: user.id,
  }).select('*').single();
  if (error) throw error;
  return mapContent(data);
}

export async function saveCmsContent(content: CmsContent): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const publishedAt = content.status === 'published' ? content.publishedAt || new Date().toISOString() : null;
  const { error } = await supabase.from('cms_content').update({
    content_type: content.contentType,
    slug: cmsSlug(content.slug),
    title: content.title.trim(),
    excerpt: content.excerpt.trim(),
    body: content.body,
    category: content.category.trim() || 'Market updates',
    tags: content.tags,
    author_name: content.authorName.trim() || 'Manohub Editorial',
    featured_image_url: content.featuredImageUrl || null,
    featured_image_alt: content.featuredImageAlt,
    status: content.status,
    is_featured: content.isFeatured,
    seo_title: content.seoTitle.trim(),
    seo_description: content.seoDescription.trim(),
    social_image_url: content.socialImageUrl || null,
    canonical_url: content.canonicalUrl || null,
    review_note: content.reviewNote,
    review_requested_at: content.status === 'review' ? content.reviewRequestedAt || new Date().toISOString() : content.reviewRequestedAt,
    reviewed_at: content.reviewedAt,
    reviewed_by: content.reviewedBy,
    assigned_to: content.assignedTo,
    native_advert_id: content.nativeAdvertId,
    published_at: publishedAt,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq('id', content.id);
  if (error) throw error;
}

export async function fetchCmsCurrentRole(): Promise<CmsTeamRole | null> {
  const { data, error } = await supabase.rpc('cms_current_role');
  if (error) throw error;
  return (data as CmsTeamRole | null) ?? null;
}

export async function fetchCmsTeam(): Promise<{ members: CmsTeamMember[]; profiles: CmsProfileOption[] }> {
  const [{ data: memberRows, error: memberError }, { data: profileRows, error: profileError }] = await Promise.all([
    supabase.from('cms_team_members').select('user_id,role').order('created_at'),
    supabase.from('profiles').select('id,full_name,email').order('full_name'),
  ]);
  if (memberError) throw memberError;
  if (profileError) throw profileError;
  const profiles = (profileRows ?? []).map((row: any) => ({ id: row.id, fullName: row.full_name || '', email: row.email || '' }));
  const byId = new Map(profiles.map(profile => [profile.id, profile]));
  return {
    profiles,
    members: (memberRows ?? []).map((row: any) => ({
      userId: row.user_id,
      role: row.role,
      fullName: byId.get(row.user_id)?.fullName || '',
      email: byId.get(row.user_id)?.email || '',
    })),
  };
}

export async function saveCmsTeamMember(userId: string, role: CmsTeamRole): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const { error } = await supabase.from('cms_team_members').upsert({
    user_id: userId,
    role,
    added_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function removeCmsTeamMember(userId: string): Promise<void> {
  const { error } = await supabase.from('cms_team_members').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function assignCmsContent(contentId: string, userId: string | null): Promise<void> {
  const { error } = await supabase.from('cms_content').update({
    assigned_to: userId,
    updated_at: new Date().toISOString(),
  }).eq('id', contentId);
  if (error) throw error;
}

export async function transitionCmsContent(contentId: string, status: CmsContentStatus, reviewNote: string, publishedAt?: string): Promise<void> {
  const values: Record<string, unknown> = {
    status,
    review_note: reviewNote.trim(),
    updated_at: new Date().toISOString(),
  };
  if (status === 'published') values.published_at = publishedAt || new Date().toISOString();
  const { error } = await supabase.from('cms_content').update(values).eq('id', contentId);
  if (error) throw error;
}

export async function fetchCmsActivity(contentId?: string): Promise<CmsActivity[]> {
  let query = supabase.from('cms_activity_log')
    .select('id,content_id,actor_id,action,from_status,to_status,details,created_at')
    .order('created_at', { ascending: false }).limit(contentId ? 50 : 100);
  if (contentId) query = query.eq('content_id', contentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: Number(row.id),
    contentId: row.content_id,
    actorId: row.actor_id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    details: row.details ?? {},
    createdAt: row.created_at,
  }));
}

export async function addCmsEditorialComment(contentId: string, body: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const { error } = await supabase.from('cms_editorial_comments').insert({ content_id: contentId, body: body.trim(), author_id: user.id });
  if (error) throw error;
}

export async function fetchCmsEditorialComments(contentId: string): Promise<CmsEditorialComment[]> {
  const { data, error } = await supabase.from('cms_editorial_comments').select('id,body,author_id,created_at').eq('content_id', contentId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, body: row.body, authorId: row.author_id, createdAt: row.created_at }));
}

export async function fetchCmsContentAnalytics(contentId: string): Promise<CmsContentAnalytics> {
  const { data, error } = await supabase.from('cms_content_events').select('event_type').eq('content_id', contentId);
  if (error) throw error;
  const types = (data ?? []).map(row => row.event_type);
  return {
    views: types.filter(type => type === 'view').length,
    ctaClicks: types.filter(type => type === 'cta_click').length,
    adImpressions: types.filter(type => type === 'ad_impression').length,
    adClicks: types.filter(type => type === 'ad_click').length,
    subscriptions: types.filter(type => type === 'subscription').length,
  };
}

export async function trackCmsContentEvent(contentId: string, eventType: 'view' | 'cta_click' | 'ad_impression' | 'ad_click' | 'subscription'): Promise<void> {
  let sessionId = '';
  try {
    sessionId = localStorage.getItem('manohub.cms.session') || '';
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('manohub.cms.session', sessionId);
    }
  } catch {
    sessionId = crypto.randomUUID();
  }
  await supabase.from('cms_content_events').insert({ content_id: contentId, event_type: eventType, session_id: sessionId });
}

export async function acquireCmsContentLock(contentId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('cms_content').update({
    locked_by: user.id, locked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }).eq('id', contentId).or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()},locked_by.eq.${user.id}`);
  if (error) throw error;
}

export async function releaseCmsContentLock(contentId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('cms_content').update({ locked_by: null, locked_until: null }).eq('id', contentId).eq('locked_by', user.id);
}

export async function createCmsEmailDraft(content: CmsContent): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const href = `${window.location.origin}/${content.contentType === 'post' ? 'insights' : 'pages'}/${content.slug}`;
  const { data, error } = await supabase.from('audience_email_campaigns').insert({
    name: `Content: ${content.title}`,
    subject: content.title,
    preview_text: content.excerpt.slice(0, 220),
    body: `${content.excerpt}\n\n${content.body.split('\n').filter(Boolean).slice(0, 3).join('\n\n')}`,
    cta_label: 'Read on Manohub',
    cta_href: href,
    status: 'draft',
    created_by: user.id,
  }).select('id').single();
  if (error) throw error;
  await supabase.from('cms_content').update({ email_campaign_id: data.id, updated_at: new Date().toISOString() }).eq('id', content.id);
  return data.id;
}

export async function fetchCmsRevisions(contentId: string): Promise<CmsContentRevision[]> {
  const { data, error } = await supabase.from('cms_content_revisions')
    .select('id, revision_number, snapshot, created_at').eq('content_id', contentId)
    .order('revision_number', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: Number(row.id), revisionNumber: row.revision_number, snapshot: row.snapshot ?? {}, createdAt: row.created_at,
  }));
}

export async function restoreCmsRevision(contentId: string, revision: CmsContentRevision): Promise<void> {
  const snapshot = revision.snapshot as Record<string, any>;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('cms_content').update({
    content_type: snapshot.content_type ?? 'post',
    slug: snapshot.slug,
    title: snapshot.title,
    excerpt: snapshot.excerpt ?? '',
    body: snapshot.body ?? '',
    category: snapshot.category ?? 'Market updates',
    tags: snapshot.tags ?? [],
    author_name: snapshot.author_name ?? 'Manohub Editorial',
    featured_image_url: snapshot.featured_image_url ?? null,
    featured_image_alt: snapshot.featured_image_alt ?? '',
    is_featured: snapshot.is_featured ?? false,
    seo_title: snapshot.seo_title ?? '',
    seo_description: snapshot.seo_description ?? '',
    social_image_url: snapshot.social_image_url ?? null,
    canonical_url: snapshot.canonical_url ?? null,
    status: 'draft',
    published_at: null,
    deleted_at: null,
    deleted_by: null,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', contentId);
  if (error) throw error;
}

export async function moveCmsContentToTrash(contentId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('cms_content').update({
    deleted_at: new Date().toISOString(),
    deleted_by: user?.id ?? null,
    status: 'archived',
    published_at: null,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', contentId).is('deleted_at', null);
  if (error) throw error;
}

export async function restoreCmsContentFromTrash(contentId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('cms_content').update({
    deleted_at: null, deleted_by: null, status: 'draft', published_at: null,
    updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
  }).eq('id', contentId);
  if (error) throw error;
}

export async function permanentlyDeleteCmsContent(contentId: string): Promise<void> {
  const { error } = await supabase.from('cms_content').delete().eq('id', contentId).not('deleted_at', 'is', null);
  if (error) throw error;
}

export async function uploadCmsContentImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Keep CMS images under 10MB.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('landing-cms-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from('landing-cms-media').getPublicUrl(path).data.publicUrl;
}
