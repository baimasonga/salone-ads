import { supabase } from '../supabaseClient';
import {
  getPublicVisitorTokenHash,
  isLikelyAutomatedBrowser,
} from '../publicVisitor';

export interface TaxonomyOption {
  id: string;
  name: string;
  code?: string;
}

export interface OpportunityListItem {
  id: string;
  slug: string;
  title: string;
  buyerName: string;
  submissionDeadline: string;
  estimatedValue: number | null;
  currencyCode: string | null;
  isFeatured: boolean;
  sector: string | null;
  district: string | null;
  country: string | null;
  opportunityType: string | null;
  statusCode: string;
  statusLabel: string;
  reviewNote: string | null;
  viewCount: number;
  relevanceScore?: number;
  totalCount?: number;
  searchEventId?: string | null;
}

export interface OpportunityDetail extends OpportunityListItem {
  referenceNumber: string | null;
  summary: string | null;
  description: string | null;
  procurementMethod: string | null;
  city: string | null;
  fundingAgency: string | null;
  publicationDate: string | null;
  clarificationDeadline: string | null;
  openingDate: string | null;
  eligibilityRequirements: string | null;
  bidSecurity: string | null;
  applicationFee: string | null;
  contactDetails: string | null;
  submissionInstructions: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  buyerOrgId: string | null;
  // false means the description/eligibility/contact/apply fields above are
  // redacted (null) server-side by get_opportunity_detail() — the caller
  // isn't the buyer, an admin, or a subscriber. Teaser fields (title,
  // buyerName, sector, district, country, submissionDeadline, summary) are
  // always populated regardless.
  hasFullAccess: boolean;
}

export interface OpportunityDocument {
  id: string;
  fileName: string;
  storagePath: string;
  fileSize: number | null;
  isPublic: boolean;
}

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — keep uploads reasonable on slow connections.
export const OPPORTUNITY_LIST_SELECT = `
  id, slug, title, buyer_name, submission_deadline, estimated_value, currency_code, is_featured, review_note, view_count,
  sectors(name), districts(name), countries(name), opportunity_types(label), opportunity_statuses(code, label)
`;

export function mapOpportunityListItem(row: any): OpportunityListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    buyerName: row.buyer_name,
    submissionDeadline: row.submission_deadline,
    estimatedValue: row.estimated_value !== null && row.estimated_value !== undefined ? Number(row.estimated_value) : null,
    currencyCode: row.currency_code ?? null,
    isFeatured: row.is_featured,
    sector: row.sectors?.name ?? null,
    district: row.districts?.name ?? null,
    country: row.countries?.name ?? null,
    opportunityType: row.opportunity_types?.label ?? null,
    statusCode: row.opportunity_statuses?.code ?? 'published',
    statusLabel: row.opportunity_statuses?.label ?? 'Published',
    reviewNote: row.review_note ?? null,
    viewCount: row.view_count ?? 0,
    relevanceScore: row.relevance_score !== undefined ? Number(row.relevance_score) : undefined,
    totalCount: row.total_count !== undefined ? Number(row.total_count) : undefined,
    searchEventId: row.search_event_id ?? null,
  };
}

export interface OpportunitySearchFilters {
  keyword?: string;
  sectorId?: string;
  countryId?: string;
  districtId?: string;
  opportunityTypeId?: string;
  status?: 'all' | 'open' | 'closing' | 'featured';
  sort?: 'relevance' | 'deadline' | 'newest';
}

export async function searchOpportunities(filters: OpportunitySearchFilters): Promise<OpportunityListItem[]> {
  const visitorHash = isLikelyAutomatedBrowser() ? null : await getPublicVisitorTokenHash();
  const { data, error } = await supabase.rpc('search_public_opportunities', {
    p_query: filters.keyword?.trim() || null,
    p_sector_id: filters.sectorId || null,
    p_country_id: filters.countryId || null,
    p_district_id: filters.districtId || null,
    p_opportunity_type_id: filters.opportunityTypeId || null,
    p_status_filter: filters.status ?? 'all',
    p_sort: filters.sort ?? 'relevance',
    p_visitor_hash: visitorHash,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []).map(mapOpportunityListItem);
}

// Uses the get_opportunity_detail() RPC rather than a direct table select —
// the raw opportunities row is still fully public per RLS (draft/published
// visibility is the only row-level gate), so column-level redaction of the
// non-subscriber fields (description, eligibility, contact, apply
// instructions) has to happen server-side in the RPC. A direct select here
// would leak everything regardless of subscription status.
export async function fetchOpportunityBySlug(slug: string): Promise<OpportunityDetail | null> {
  const { data, error } = await supabase.rpc('get_opportunity_detail', { p_slug: slug });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    buyerName: row.buyer_name,
    submissionDeadline: row.submission_deadline,
    estimatedValue: row.estimated_value !== null && row.estimated_value !== undefined ? Number(row.estimated_value) : null,
    currencyCode: row.currency_code ?? null,
    isFeatured: row.is_featured,
    sector: row.sector ?? null,
    district: row.district ?? null,
    country: row.country ?? null,
    opportunityType: row.opportunity_type ?? null,
    statusCode: row.status_code ?? 'published',
    statusLabel: row.status_label ?? 'Published',
    reviewNote: row.review_note ?? null,
    referenceNumber: row.reference_number ?? null,
    summary: row.summary ?? null,
    description: row.description ?? null,
    procurementMethod: row.procurement_method ?? null,
    city: row.city ?? null,
    fundingAgency: row.funding_agency ?? null,
    publicationDate: row.publication_date ?? null,
    clarificationDeadline: row.clarification_deadline ?? null,
    openingDate: row.opening_date ?? null,
    eligibilityRequirements: row.eligibility_requirements ?? null,
    bidSecurity: row.bid_security ?? null,
    applicationFee: row.application_fee ?? null,
    contactDetails: row.contact_details ?? null,
    submissionInstructions: row.submission_instructions ?? null,
    sourceName: row.source_name ?? null,
    sourceUrl: row.source_url ?? null,
    buyerOrgId: row.buyer_org_id ?? null,
    viewCount: row.view_count ?? 0,
    hasFullAccess: row.has_full_access,
  };
}

// Whether the signed-in user has a Viewer or Publisher tender subscription
// on any of their orgs — used to gate documents/alerts UI and to decide
// whether to show a "Subscribe to view" prompt before the buyer-publish form.
export async function userHasTenderSubscription(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const [viewer, publisher] = await Promise.all([
    supabase.rpc('user_has_tender_feature', { p_feature_key: 'tender_alerts_and_details' }),
    supabase.rpc('user_has_tender_feature', { p_feature_key: 'tender_publishing' }),
  ]);
  if (viewer.error) throw viewer.error;
  if (publisher.error) throw publisher.error;
  return !!viewer.data || !!publisher.data;
}

export async function fetchOpportunityDocuments(opportunityId: string): Promise<OpportunityDocument[]> {
  const { data, error } = await supabase
    .from('opportunity_documents')
    .select('id, file_name, storage_path, file_size, is_public')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileSize: row.file_size ?? null,
    isPublic: row.is_public,
  }));
}

function documentBucket(isPublic: boolean): 'public-assets' | 'private-documents' {
  return isPublic ? 'public-assets' : 'private-documents';
}

// Documents are stored under {org_id}/{opportunity_id}/... — storage RLS only lets
// members of that org read/write their own folder (see Phase 1 bucket policies).
export async function uploadOpportunityDocument(
  orgId: string,
  opportunityId: string,
  file: File,
  isPublic: boolean
): Promise<OpportunityDocument> {
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error('File is too large — please keep documents under 10MB.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload documents.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${orgId}/${opportunityId}/${Date.now()}-${safeName}`;
  const bucket = documentBucket(isPublic);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('opportunity_documents')
    .insert({
      opportunity_id: opportunityId,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      is_public: isPublic,
      uploaded_by: user.id,
    })
    .select('id, file_name, storage_path, file_size, is_public')
    .single();
  if (error) {
    await supabase.storage.from(bucket).remove([storagePath]);
    throw error;
  }

  return {
    id: data.id,
    fileName: data.file_name,
    storagePath: data.storage_path,
    fileSize: data.file_size ?? null,
    isPublic: data.is_public,
  };
}

export async function deleteOpportunityDocument(doc: OpportunityDocument): Promise<void> {
  const { error: storageError } = await supabase.storage.from(documentBucket(doc.isPublic)).remove([doc.storagePath]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('opportunity_documents').delete().eq('id', doc.id);
  if (error) throw error;
}

export async function getOpportunityDocumentUrl(doc: OpportunityDocument): Promise<string> {
  const bucket = documentBucket(doc.isPublic);
  if (doc.isPublic) {
    return supabase.storage.from(bucket).getPublicUrl(doc.storagePath).data.publicUrl;
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(doc.storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function isOpportunitySaved(opportunityId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('saved_opportunities')
    .select('opportunity_id')
    .eq('opportunity_id', opportunityId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function setOpportunitySaved(opportunityId: string, saved: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to save opportunities.');
  if (saved) {
    const { error } = await supabase.from('saved_opportunities').insert({ opportunity_id: opportunityId, user_id: user.id });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('saved_opportunities')
      .delete()
      .eq('opportunity_id', opportunityId)
      .eq('user_id', user.id);
    if (error) throw error;
  }
}

export async function fetchSectors(): Promise<TaxonomyOption[]> {
  const { data, error } = await supabase.from('sectors').select('id, name').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function fetchDistricts(countryId?: string): Promise<TaxonomyOption[]> {
  let query = supabase.from('districts').select('id, name').eq('is_active', true).order('sort_order');
  if (countryId) query = query.eq('country_id', countryId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCountries(): Promise<TaxonomyOption[]> {
  const { data, error } = await supabase.from('countries').select('id, name, code').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

export async function fetchCurrencies(): Promise<CurrencyOption[]> {
  const { data, error } = await supabase.from('currencies').select('code, name, symbol').eq('is_active', true).order('code');
  if (error) throw error;
  return data ?? [];
}

export async function fetchOpportunityTypes(): Promise<TaxonomyOption[]> {
  const { data, error } = await supabase
    .from('opportunity_types')
    .select('id, name:label, code')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

// --- Buyer publishing (dashboard) ---

export async function fetchMyOpportunities(orgId: string): Promise<OpportunityListItem[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(OPPORTUNITY_LIST_SELECT)
    .eq('buyer_org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOpportunityListItem);
}

// Returns whether buyer mode actually activated. protect_buyer_mode_activation_trigger
// silently reverts is_buyer back to false (no error) if the org doesn't have
// the tender_publishing entitlement — same "revert rather than error" idiom
// the rest of this schema's protective triggers use — so the caller has to
// check the returned row's actual state rather than assume the update took.
export async function enableBuyerMode(orgId: string): Promise<boolean> {
  const { data, error } = await supabase.from('organizations').update({ is_buyer: true }).eq('id', orgId).select('is_buyer').single();
  if (error) throw error;
  return data.is_buyer;
}

export interface CreateOpportunityInput {
  title: string;
  summary: string;
  description: string;
  opportunityTypeId: string;
  sectorId: string;
  countryId: string;
  districtId: string;
  estimatedValue?: number;
  currencyCode?: string;
  submissionDeadline: string;
  contactDetails: string;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'tender'}-${Date.now().toString(36)}`;
}

export async function getOpportunityStatusId(code: string): Promise<string> {
  const { data, error } = await supabase.from('opportunity_statuses').select('id').eq('code', code).single();
  if (error) throw error;
  return data.id;
}

// Submits a tender for admin review. The database enforces this regardless
// of what status is requested here (see protect_opportunity_transition) --
// a buyer can never publish directly.
export async function createOpportunity(orgId: string, orgName: string, input: CreateOpportunityInput): Promise<OpportunityListItem> {
  const awaitingReviewId = await getOpportunityStatusId('awaiting_review');

  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      slug: slugify(input.title),
      title: input.title,
      summary: input.summary,
      description: input.description,
      opportunity_type_id: input.opportunityTypeId || null,
      sector_id: input.sectorId || null,
      country_id: input.countryId || null,
      district_id: input.districtId || null,
      estimated_value: input.estimatedValue ?? null,
      currency_code: input.currencyCode ?? null,
      submission_deadline: input.submissionDeadline,
      contact_details: input.contactDetails,
      buyer_org_id: orgId,
      buyer_name: orgName,
      source_type: 'buyer_submission',
      status_id: awaitingReviewId,
    })
    .select(OPPORTUNITY_LIST_SELECT)
    .single();
  if (error) throw error;
  return mapOpportunityListItem(data);
}

export async function closeOpportunity(id: string): Promise<void> {
  const closedId = await getOpportunityStatusId('closed');
  const { error } = await supabase.from('opportunities').update({ status_id: closedId }).eq('id', id);
  if (error) throw error;
}

export async function resubmitForReview(id: string): Promise<void> {
  const awaitingReviewId = await getOpportunityStatusId('awaiting_review');
  const { error } = await supabase.from('opportunities').update({ status_id: awaitingReviewId }).eq('id', id);
  if (error) throw error;
}

export async function cancelOpportunity(id: string, reason: string): Promise<void> {
  const cancelledId = await getOpportunityStatusId('cancelled');
  const { error } = await supabase.from('opportunities').update({ status_id: cancelledId }).eq('id', id);
  if (error) throw error;
  await supabase.from('opportunity_amendments').insert({
    opportunity_id: id,
    amendment_type: 'cancellation',
    summary: reason || 'Tender cancelled by buyer.',
  });
}

export async function extendDeadline(id: string, newDeadline: string, note: string): Promise<void> {
  const { data: current, error: fetchError } = await supabase
    .from('opportunities')
    .select('submission_deadline')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;

  const deadlineExtendedId = await getOpportunityStatusId('deadline_extended');
  const { error } = await supabase
    .from('opportunities')
    .update({ submission_deadline: newDeadline, status_id: deadlineExtendedId })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('opportunity_amendments').insert({
    opportunity_id: id,
    amendment_type: 'deadline_extension',
    summary: note || `Deadline extended to ${new Date(newDeadline).toLocaleDateString()}.`,
    previous_values: { submission_deadline: current.submission_deadline },
  });
}

export interface AmendOpportunityInput {
  title?: string;
  summary?: string;
  description?: string;
}

export async function amendOpportunity(id: string, updates: AmendOpportunityInput, summary: string): Promise<void> {
  const { data: current, error: fetchError } = await supabase
    .from('opportunities')
    .select('title, summary, description')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;

  const amendedId = await getOpportunityStatusId('amended');
  const { error } = await supabase
    .from('opportunities')
    .update({ ...updates, status_id: amendedId })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('opportunity_amendments').insert({
    opportunity_id: id,
    amendment_type: 'content_update',
    summary,
    previous_values: current,
  });
}

export interface OpportunityAmendment {
  id: string;
  amendmentType: string;
  summary: string;
  createdAt: string;
}

export async function fetchAmendments(opportunityId: string): Promise<OpportunityAmendment[]> {
  const { data, error } = await supabase
    .from('opportunity_amendments')
    .select('id, amendment_type, summary, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    amendmentType: row.amendment_type,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

export interface RecordAwardInput {
  winningSupplierName: string;
  awardedValue?: number;
  currencyCode?: string;
  awardDate?: string;
  notes?: string;
}

export interface OpportunityAward extends RecordAwardInput {
  id: string;
}

export async function recordAward(opportunityId: string, input: RecordAwardInput): Promise<void> {
  const awardedId = await getOpportunityStatusId('awarded');
  const { error: upsertError } = await supabase.from('opportunity_awards').upsert(
    {
      opportunity_id: opportunityId,
      winning_supplier_name: input.winningSupplierName,
      awarded_value: input.awardedValue ?? null,
      currency_code: input.currencyCode ?? null,
      award_date: input.awardDate ?? null,
      notes: input.notes ?? null,
    },
    { onConflict: 'opportunity_id' }
  );
  if (upsertError) throw upsertError;

  const { error } = await supabase.from('opportunities').update({ status_id: awardedId }).eq('id', opportunityId);
  if (error) throw error;
}

export async function fetchAward(opportunityId: string): Promise<OpportunityAward | null> {
  const { data, error } = await supabase
    .from('opportunity_awards')
    .select('id, winning_supplier_name, awarded_value, currency_code, award_date, notes')
    .eq('opportunity_id', opportunityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    winningSupplierName: data.winning_supplier_name,
    awardedValue: data.awarded_value ?? undefined,
    currencyCode: data.currency_code ?? undefined,
    awardDate: data.award_date ?? undefined,
    notes: data.notes ?? undefined,
  };
}

// --- Platform admin: tender review queue ---

export interface ReviewQueueItem extends OpportunityListItem {
  createdAt: string;
}

// Admins see every opportunity via RLS regardless of status; the review-queue
// filter is applied client-side rather than via a PostgREST embedded-column
// filter, which needs an explicit inner-join modifier to behave predictably.
export async function fetchOpportunitiesForReview(): Promise<ReviewQueueItem[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(`${OPPORTUNITY_LIST_SELECT}, created_at`)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => ({ ...mapOpportunityListItem(row), createdAt: row.created_at }))
    .filter((row) => row.statusCode === 'awaiting_review' || row.statusCode === 'needs_correction');
}

export async function findSimilarTitledOpportunities(title: string, excludeId: string): Promise<string[]> {
  const words = title.split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
  if (words.length === 0) return [];
  const orFilter = words.map((w) => `title.ilike.%${w}%`).join(',');
  const { data, error } = await supabase.from('opportunities').select('title').or(orFilter).neq('id', excludeId).limit(5);
  if (error) return [];
  return (data ?? []).map((row: any) => row.title);
}

// --- View tracking ---

export async function incrementOpportunityView(opportunityId: string): Promise<void> {
  try {
    if (isLikelyAutomatedBrowser()) return;
    const visitorTokenHash = await getPublicVisitorTokenHash();
    const { error } = await supabase.rpc('increment_opportunity_view', {
      p_opportunity_id: opportunityId,
      p_visitor_token_hash: visitorTokenHash,
    });
    if (error) {
      /* view counting is best-effort, never block the page on it */
      console.warn('Could not record tender view', error.message);
    }
  } catch {
    /* privacy-safe analytics must never block tender discovery */
  }
}

export async function approveOpportunity(id: string): Promise<void> {
  const publishedId = await getOpportunityStatusId('published');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: publishedId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: null })
    .eq('id', id);
  if (error) throw error;
}

export async function requestCorrection(id: string, note: string): Promise<void> {
  const needsCorrectionId = await getOpportunityStatusId('needs_correction');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: needsCorrectionId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: note })
    .eq('id', id);
  if (error) throw error;
}

export async function rejectOpportunity(id: string, note: string): Promise<void> {
  const rejectedId = await getOpportunityStatusId('rejected');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: rejectedId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: note })
    .eq('id', id);
  if (error) throw error;
}

export async function setOpportunityFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase.from('opportunities').update({ is_featured: featured }).eq('id', id);
  if (error) throw error;
}
