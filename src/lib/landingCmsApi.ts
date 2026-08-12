import { ADVERT_SELECT, mapAdvert, type Advert } from './advertisingApi';
import { supabase } from './supabaseClient';
import { scanFileBeforeUpload } from './fileSecurity';

export interface LandingContentBlock {
  id: string; blockKey: string; section: string; eyebrow: string; title: string; body: string;
  ctaLabel: string; ctaHref: string; accentColor: string; surfaceColor: string; status: string; sortOrder: number;
  mediaUrl: string; mediaAlt: string; publishedAt: string | null; updatedAt: string; deletedAt: string | null;
}
export interface LandingContentRevision {
  id: number; blockId: string; revisionNumber: number; snapshot: Record<string, unknown>;
  changedBy: string | null; createdAt: string;
}
const mapLandingBlock = (row: any): LandingContentBlock => ({
  id: row.id, blockKey: row.block_key, section: row.section, eyebrow: row.eyebrow ?? '',
  title: row.title, body: row.body, ctaLabel: row.cta_label ?? '', ctaHref: row.cta_href ?? '',
  accentColor: row.accent_color, surfaceColor: row.surface_color, status: row.status, sortOrder: row.sort_order,
  mediaUrl: row.media_url ?? '', mediaAlt: row.media_alt ?? '', publishedAt: row.published_at ?? null,
  updatedAt: row.updated_at, deletedAt: row.deleted_at ?? null,
});
export async function fetchLandingContent(): Promise<LandingContentBlock[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('landing_content_blocks').select('*')
    .is('deleted_at', null).eq('status', 'published')
    .or(`published_at.is.null,published_at.lte.${now}`)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map(mapLandingBlock);
}
export async function fetchAllLandingContent(): Promise<LandingContentBlock[]> {
  const { data, error } = await supabase.from('landing_content_blocks').select('*').is('deleted_at', null).order('sort_order');
  if (error) throw error;
  return (data ?? []).map(mapLandingBlock);
}
export async function createLandingContentBlock(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const createdAt = new Date();
  const { error } = await supabase.from('landing_content_blocks').insert({
    block_key: `editorial_${createdAt.getTime()}`,
    section: 'editorial',
    eyebrow: 'Featured story',
    title: 'New editorial block',
    body: 'Add the story, offer or announcement you want visitors to discover.',
    cta_label: 'Learn more',
    cta_href: '/',
    accent_color: '#F97316',
    surface_color: '#FFF7ED',
    status: 'draft',
    sort_order: createdAt.getTime(),
    updated_by: user?.id ?? null,
  });
  if (error) throw error;
}
export async function updateLandingContent(block: LandingContentBlock): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const publishedAt = block.status === 'published'
    ? block.publishedAt || new Date().toISOString()
    : null;
  const { error } = await supabase.from('landing_content_blocks').update({
    section:block.section,eyebrow:block.eyebrow,title:block.title,body:block.body,cta_label:block.ctaLabel,cta_href:block.ctaHref,
    accent_color:block.accentColor,surface_color:block.surfaceColor,status:block.status,sort_order:block.sortOrder,
    media_url:block.mediaUrl||null,media_alt:block.mediaAlt,published_at:publishedAt,
    updated_by:user?.id??null,updated_at:new Date().toISOString(),
  }).eq('id',block.id);
  if(error) throw error;
}
export async function fetchLandingContentPreview(blockId: string): Promise<LandingContentBlock | null> {
  const { data, error } = await supabase.from('landing_content_blocks').select('*').eq('id', blockId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data ? mapLandingBlock(data) : null;
}
export async function fetchLandingContentRevisions(blockId: string): Promise<LandingContentRevision[]> {
  const { data, error } = await supabase.from('landing_content_revisions')
    .select('id, block_id, revision_number, snapshot, changed_by, created_at')
    .eq('block_id', blockId).order('revision_number', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: Number(row.id), blockId: row.block_id, revisionNumber: row.revision_number,
    snapshot: row.snapshot ?? {}, changedBy: row.changed_by ?? null, createdAt: row.created_at,
  }));
}
export async function restoreLandingContentRevision(blockId: string, revision: LandingContentRevision): Promise<void> {
  const snapshot = revision.snapshot as Record<string, any>;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('landing_content_blocks').update({
    section: snapshot.section ?? 'editorial',
    eyebrow: snapshot.eyebrow ?? '',
    title: snapshot.title ?? 'Restored content',
    body: snapshot.body ?? '',
    cta_label: snapshot.cta_label ?? '',
    cta_href: snapshot.cta_href ?? '',
    accent_color: snapshot.accent_color ?? '#F97316',
    surface_color: snapshot.surface_color ?? '#FFF7ED',
    media_url: snapshot.media_url ?? null,
    media_alt: snapshot.media_alt ?? '',
    status: 'draft',
    published_at: null,
    sort_order: Number(snapshot.sort_order ?? 0),
    deleted_at: null,
    deleted_by: null,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', blockId);
  if (error) throw error;
}
export async function moveLandingContentToTrash(blockId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('landing_content_blocks').update({
    deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null,
    status: 'archived', published_at: null, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
  }).eq('id', blockId).is('deleted_at', null);
  if (error) throw error;
}
export async function fetchLandingContentTrash(): Promise<LandingContentBlock[]> {
  const { data, error } = await supabase.from('landing_content_blocks').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLandingBlock);
}
export async function restoreLandingContentFromTrash(blockId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('landing_content_blocks').update({
    deleted_at: null, deleted_by: null, status: 'draft', published_at: null,
    updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
  }).eq('id', blockId);
  if (error) throw error;
}
export async function permanentlyDeleteLandingContent(blockId: string): Promise<void> {
  const { error } = await supabase.from('landing_content_blocks').delete().eq('id', blockId).not('deleted_at', 'is', null);
  if (error) throw error;
}
export async function uploadLandingContentMedia(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Keep landing-page images under 10MB.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in.');
  await scanFileBeforeUpload(file, 'image');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('landing-cms-media').upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('landing-cms-media').getPublicUrl(path).data.publicUrl;
}
export interface LandingAdvertPlacement {
  assignmentId: string; placementId: string; placementCode: string; placementName: string;
  priority: number; weight: number; sessionFrequencyCap: number;
  startsAt: string | null; endsAt: string | null; isActive: boolean; advert: Advert;
}
export async function fetchLandingAdvertPlacements(): Promise<LandingAdvertPlacement[]> {
  const { data, error } = await supabase.from('landing_ad_assignments').select(
    `id, placement_id, priority, weight, session_frequency_cap, starts_at, ends_at, is_active,
     landing_ad_placements!inner(code, name),
     adverts!inner(${ADVERT_SELECT})`
  ).order('priority',{ascending:false});
  if(error) throw error;
  return (data??[]).map((row:any)=>({
    assignmentId:row.id,placementId:row.placement_id,placementCode:row.landing_ad_placements.code,
    placementName:row.landing_ad_placements.name,priority:row.priority,weight:row.weight,
    sessionFrequencyCap:row.session_frequency_cap,startsAt:row.starts_at??null,endsAt:row.ends_at??null,
    isActive:row.is_active,advert:mapAdvert(row.adverts),
  }));
}
export async function assignLandingAdvert(placementId:string,advertId:string):Promise<void>{
  const {error}=await supabase.from('landing_ad_assignments').upsert({placement_id:placementId,advert_id:advertId,is_active:true},{onConflict:'placement_id,advert_id'});
  if(error) throw error;
}
export async function updateLandingAdvertAssignment(
  assignmentId: string,
  patch: Pick<LandingAdvertPlacement, 'priority' | 'weight' | 'sessionFrequencyCap' | 'startsAt' | 'endsAt' | 'isActive'>,
): Promise<void> {
  const { error } = await supabase.from('landing_ad_assignments').update({
    priority: patch.priority,
    weight: patch.weight,
    session_frequency_cap: patch.sessionFrequencyCap,
    starts_at: patch.startsAt || null,
    ends_at: patch.endsAt || null,
    is_active: patch.isActive,
  }).eq('id', assignmentId);
  if (error) throw error;
}
export async function removeLandingAdvertAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('landing_ad_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}
export async function fetchLandingPlacementOptions():Promise<Array<{id:string;code:string;name:string}>>{
  const {data,error}=await supabase.from('landing_ad_placements').select('id,code,name').order('sort_order');
  if(error) throw error; return data??[];
}
