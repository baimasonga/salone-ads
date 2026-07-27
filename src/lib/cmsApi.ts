import { supabase } from './supabaseClient';

export type CmsContentType = 'page' | 'post';
export type CmsContentStatus = 'draft' | 'review' | 'published' | 'archived';

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
});

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
    published_at: publishedAt,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq('id', content.id);
  if (error) throw error;
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
