import { supabase } from './supabaseClient';
import {
  getPublicVisitorTokenHash,
  isLikelyAutomatedBrowser,
} from './publicVisitor';
import { fetchMyOrganization } from './api';
import { ADVERT_SELECT, mapAdvert, type Advert } from './advertisingApi';

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
const LIST_SELECT = `
  id, slug, title, buyer_name, submission_deadline, estimated_value, currency_code, is_featured, review_note, view_count,
  sectors(name), districts(name), countries(name), opportunity_types(label), opportunity_statuses(code, label)
`;

function mapListItem(row: any): OpportunityListItem {
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
  return (data ?? []).map(mapListItem);
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
    .select(LIST_SELECT)
    .eq('buyer_org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapListItem);
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

async function getStatusId(code: string): Promise<string> {
  const { data, error } = await supabase.from('opportunity_statuses').select('id').eq('code', code).single();
  if (error) throw error;
  return data.id;
}

// Submits a tender for admin review. The database enforces this regardless
// of what status is requested here (see protect_opportunity_transition) --
// a buyer can never publish directly.
export async function createOpportunity(orgId: string, orgName: string, input: CreateOpportunityInput): Promise<OpportunityListItem> {
  const awaitingReviewId = await getStatusId('awaiting_review');

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
    .select(LIST_SELECT)
    .single();
  if (error) throw error;
  return mapListItem(data);
}

export async function closeOpportunity(id: string): Promise<void> {
  const closedId = await getStatusId('closed');
  const { error } = await supabase.from('opportunities').update({ status_id: closedId }).eq('id', id);
  if (error) throw error;
}

export async function resubmitForReview(id: string): Promise<void> {
  const awaitingReviewId = await getStatusId('awaiting_review');
  const { error } = await supabase.from('opportunities').update({ status_id: awaitingReviewId }).eq('id', id);
  if (error) throw error;
}

export async function cancelOpportunity(id: string, reason: string): Promise<void> {
  const cancelledId = await getStatusId('cancelled');
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

  const deadlineExtendedId = await getStatusId('deadline_extended');
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

  const amendedId = await getStatusId('amended');
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
  const awardedId = await getStatusId('awarded');
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
    .select(`${LIST_SELECT}, created_at`)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => ({ ...mapListItem(row), createdAt: row.created_at }))
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

// --- Opportunity ingestion and researcher workspace ---

export interface OpportunitySource {
  id: string;
  name: string;
  baseUrl: string | null;
  sourceKind: 'website' | 'document' | 'email' | 'manual';
  trustLevel: 'verified' | 'trusted' | 'unverified';
  status: 'active' | 'paused' | 'retired';
  lastCheckedAt: string | null;
  lastCheckStatus: 'success' | 'no_change' | 'blocked' | 'error' | null;
  consecutiveFailures: number;
  nextCheckAt: string | null;
}

export interface OpportunitySourceCheck {
  id: string;
  sourceId: string;
  status: 'success' | 'no_change' | 'blocked' | 'error';
  itemsFound: number;
  notes: string | null;
  checkedAt: string;
}

export interface OpportunityIngestionItem {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  title: string;
  buyerName: string;
  summary: string | null;
  submissionDeadline: string | null;
  status: 'draft' | 'ready_for_review' | 'promoted' | 'rejected';
  qualityScore: number;
  qualityIssues: string[];
  duplicateOpportunityId: string | null;
  opportunityId: string | null;
  extractionMethod: 'manual' | 'assisted_text';
  extractionConfidence: number | null;
  createdAt: string;
  sourcingTaskId: string | null;
}

export interface OpportunitySourcingTask {
  id: string;
  searchTerm: string;
  demandCount: number;
  latestSearchAt: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'in_progress' | 'candidate_found' | 'completed' | 'cancelled';
  assignedTo: string | null;
  dueAt: string | null;
  notes: string | null;
  sourceLinks: string[];
  matchedOpportunityId: string | null;
  createdAt: string;
}

export interface PlatformResearcher {
  id: string;
  fullName: string;
  platformRole: 'researcher' | 'admin';
}

export interface OpportunitySourcingTaskEvent {
  id: string;
  taskId: string;
  eventType: 'created' | 'assigned' | 'status_changed' | 'evidence_updated' | 'completed';
  previousStatus: string | null;
  nextStatus: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CreateOpportunitySourceInput {
  name: string;
  baseUrl?: string;
  sourceKind: OpportunitySource['sourceKind'];
  trustLevel: OpportunitySource['trustLevel'];
}

export interface CreateOpportunityIngestionInput {
  sourceId?: string;
  sourceUrl?: string;
  title: string;
  buyerName: string;
  summary?: string;
  description?: string;
  externalReference?: string;
  rawText?: string;
  extractionMethod?: 'manual' | 'assisted_text';
  extractionConfidence?: number;
  extractedFields?: string[];
  submissionDeadline?: string;
  status?: 'draft' | 'ready_for_review';
  sourcingTaskId?: string;
}

function mapOpportunitySource(row: any): OpportunitySource {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    sourceKind: row.source_kind,
    trustLevel: row.trust_level,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    lastCheckStatus: row.last_check_status,
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    nextCheckAt: row.next_check_at,
  };
}

function mapIngestionItem(row: any): OpportunityIngestionItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.opportunity_sources?.name ?? null,
    sourceUrl: row.source_url,
    title: row.title,
    buyerName: row.buyer_name,
    summary: row.summary,
    submissionDeadline: row.submission_deadline,
    status: row.status,
    qualityScore: Number(row.quality_score ?? 0),
    qualityIssues: Array.isArray(row.quality_issues) ? row.quality_issues : [],
    duplicateOpportunityId: row.duplicate_opportunity_id,
    opportunityId: row.opportunity_id,
    extractionMethod: row.extraction_method ?? 'manual',
    extractionConfidence: row.extraction_confidence == null ? null : Number(row.extraction_confidence),
    createdAt: row.created_at,
    sourcingTaskId: row.sourcing_task_id,
  };
}

function mapSourcingTask(row: any): OpportunitySourcingTask {
  return {
    id: row.id,
    searchTerm: row.search_term,
    demandCount: Number(row.demand_count ?? 0),
    latestSearchAt: row.latest_search_at,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    notes: row.notes,
    sourceLinks: Array.isArray(row.source_links) ? row.source_links : [],
    matchedOpportunityId: row.matched_opportunity_id,
    createdAt: row.created_at,
  };
}

export async function fetchOpportunitySourcingTasks(): Promise<OpportunitySourcingTask[]> {
  const { data, error } = await supabase
    .from('opportunity_sourcing_tasks')
    .select('id,search_term,demand_count,latest_search_at,priority,status,assigned_to,due_at,notes,source_links,matched_opportunity_id,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSourcingTask);
}

export async function fetchOpportunitySourcingTaskEvents(): Promise<OpportunitySourcingTaskEvent[]> {
  const { data, error } = await supabase
    .from('opportunity_sourcing_task_events')
    .select('id,task_id,event_type,previous_status,next_status,details,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    details: row.details && typeof row.details === 'object' ? row.details : {},
    createdAt: row.created_at,
  }));
}

export async function fetchPlatformResearchers(): Promise<PlatformResearcher[]> {
  const { data, error } = await supabase.rpc('list_opportunity_researchers');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name || 'Unnamed staff member',
    platformRole: row.platform_role,
  }));
}

export async function createSourcingTaskFromGap(
  term: string,
  priority: OpportunitySourcingTask['priority'] = 'medium',
): Promise<string> {
  const { data, error } = await supabase.rpc('create_sourcing_task_from_gap', {
    p_term: term,
    p_priority: priority,
    p_due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  if (error) throw error;
  return data as string;
}

export async function assignOpportunitySourcingTask(input: {
  taskId: string;
  assignedTo: string;
  priority: OpportunitySourcingTask['priority'];
  dueAt?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('assign_opportunity_sourcing_task', {
    p_task_id: input.taskId,
    p_assigned_to: input.assignedTo,
    p_priority: input.priority,
    p_due_at: input.dueAt || null,
  });
  if (error) throw error;
}

export async function updateOpportunitySourcingTask(input: {
  taskId: string;
  status: Exclude<OpportunitySourcingTask['status'], 'open' | 'completed'>;
  notes?: string;
  sourceLinks?: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('update_opportunity_sourcing_task', {
    p_task_id: input.taskId,
    p_status: input.status,
    p_notes: input.notes || null,
    p_source_links: input.sourceLinks ?? [],
  });
  if (error) throw error;
}

export async function fetchOpportunitySources(): Promise<OpportunitySource[]> {
  const { data, error } = await supabase
    .from('opportunity_sources')
    .select('id,name,base_url,source_kind,trust_level,status,last_checked_at,last_check_status,consecutive_failures,next_check_at')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(mapOpportunitySource);
}

export async function createOpportunitySource(input: CreateOpportunitySourceInput): Promise<OpportunitySource> {
  const { data, error } = await supabase
    .from('opportunity_sources')
    .insert({
      name: input.name,
      base_url: input.baseUrl || null,
      source_kind: input.sourceKind,
      trust_level: input.trustLevel,
      next_check_at: new Date().toISOString(),
    })
    .select('id,name,base_url,source_kind,trust_level,status,last_checked_at,last_check_status,consecutive_failures,next_check_at')
    .single();
  if (error) throw error;
  return mapOpportunitySource(data);
}

export async function fetchOpportunityIngestionItems(): Promise<OpportunityIngestionItem[]> {
  const { data, error } = await supabase
    .from('opportunity_ingestion_items')
    .select('id,source_id,source_url,title,buyer_name,summary,submission_deadline,status,quality_score,quality_issues,duplicate_opportunity_id,opportunity_id,extraction_method,extraction_confidence,created_at,sourcing_task_id,opportunity_sources(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(mapIngestionItem);
}

export async function createOpportunityIngestionItem(
  input: CreateOpportunityIngestionInput,
): Promise<OpportunityIngestionItem> {
  const { data, error } = await supabase
    .from('opportunity_ingestion_items')
    .insert({
      source_id: input.sourceId || null,
      source_url: input.sourceUrl || null,
      title: input.title,
      buyer_name: input.buyerName,
      summary: input.summary || null,
      description: input.description || null,
      external_reference: input.externalReference || null,
      raw_text: input.rawText || null,
      extraction_method: input.extractionMethod ?? 'manual',
      extraction_confidence: input.extractionConfidence ?? null,
      extracted_fields: Object.fromEntries((input.extractedFields ?? []).map((field) => [field, true])),
      submission_deadline: input.submissionDeadline || null,
      status: input.status ?? 'draft',
      sourcing_task_id: input.sourcingTaskId || null,
    })
    .select('id,source_id,source_url,title,buyer_name,summary,submission_deadline,status,quality_score,quality_issues,duplicate_opportunity_id,opportunity_id,extraction_method,extraction_confidence,created_at,sourcing_task_id,opportunity_sources(name)')
    .single();
  if (error) throw error;
  return mapIngestionItem(data);
}

export async function submitOpportunityIngestionItem(id: string): Promise<OpportunityIngestionItem> {
  const { data, error } = await supabase
    .from('opportunity_ingestion_items')
    .update({ status: 'ready_for_review' })
    .eq('id', id)
    .select('id,source_id,source_url,title,buyer_name,summary,submission_deadline,status,quality_score,quality_issues,duplicate_opportunity_id,opportunity_id,extraction_method,extraction_confidence,created_at,sourcing_task_id,opportunity_sources(name)')
    .single();
  if (error) throw error;
  return mapIngestionItem(data);
}

export async function promoteOpportunityIngestionItem(id: string): Promise<string> {
  const { executeBackendCommand } = await import('./commandApi');
  return executeBackendCommand<string>('procurement.ingestion.promote', { itemId: id });
}

export async function recordOpportunitySourceCheck(input: {
  sourceId: string;
  status: OpportunitySourceCheck['status'];
  itemsFound?: number;
  notes?: string;
}): Promise<OpportunitySourceCheck> {
  const { data, error } = await supabase
    .from('opportunity_source_checks')
    .insert({
      source_id: input.sourceId,
      status: input.status,
      items_found: input.itemsFound ?? 0,
      notes: input.notes || null,
    })
    .select('id,source_id,status,items_found,notes,checked_at')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    sourceId: data.source_id,
    status: data.status,
    itemsFound: Number(data.items_found ?? 0),
    notes: data.notes,
    checkedAt: data.checked_at,
  };
}

export async function approveOpportunity(id: string): Promise<void> {
  const publishedId = await getStatusId('published');
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
  const needsCorrectionId = await getStatusId('needs_correction');
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
  const rejectedId = await getStatusId('rejected');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('opportunities')
    .update({ status_id: rejectedId, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), review_note: note })
    .eq('id', id);
  if (error) throw error;
}

// --- Supplier profiles & verification ---

export interface SupplierProfile {
  tradingName: string;
  registrationNumber: string;
  taxIdentificationNumber: string;
  description: string;
  website: string;
  yearEstablished: number | null;
  employeeCount: string;
  geographicCoverage: string;
  certifications: string;
  majorClients: string;
}

const EMPTY_SUPPLIER_PROFILE: SupplierProfile = {
  tradingName: '',
  registrationNumber: '',
  taxIdentificationNumber: '',
  description: '',
  website: '',
  yearEstablished: null,
  employeeCount: '',
  geographicCoverage: '',
  certifications: '',
  majorClients: '',
};

export async function enableSupplierMode(orgId: string): Promise<void> {
  const { error: orgError } = await supabase.from('organizations').update({ is_supplier: true }).eq('id', orgId);
  if (orgError) throw orgError;
  const { error: profileError } = await supabase
    .from('supplier_profiles')
    .upsert({ org_id: orgId }, { onConflict: 'org_id', ignoreDuplicates: true });
  if (profileError) throw profileError;
}

export async function fetchSupplierProfile(orgId: string): Promise<SupplierProfile> {
  const { data, error } = await supabase
    .from('supplier_profiles')
    .select('trading_name, registration_number, tax_identification_number, description, website, year_established, employee_count, geographic_coverage, certifications, major_clients')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_SUPPLIER_PROFILE;
  return {
    tradingName: data.trading_name ?? '',
    registrationNumber: data.registration_number ?? '',
    taxIdentificationNumber: data.tax_identification_number ?? '',
    description: data.description ?? '',
    website: data.website ?? '',
    yearEstablished: data.year_established,
    employeeCount: data.employee_count ?? '',
    geographicCoverage: data.geographic_coverage ?? '',
    certifications: data.certifications ?? '',
    majorClients: data.major_clients ?? '',
  };
}

export async function saveSupplierProfile(orgId: string, profile: SupplierProfile): Promise<void> {
  const { error } = await supabase
    .from('supplier_profiles')
    .update({
      trading_name: profile.tradingName,
      registration_number: profile.registrationNumber,
      tax_identification_number: profile.taxIdentificationNumber,
      description: profile.description,
      website: profile.website,
      year_established: profile.yearEstablished,
      employee_count: profile.employeeCount,
      geographic_coverage: profile.geographicCoverage,
      certifications: profile.certifications,
      major_clients: profile.majorClients,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId);
  if (error) throw error;
}

export interface VerificationRequest {
  id: string;
  requestType: string;
  status: string;
  notes: string | null;
  reviewerNote: string | null;
  submittedAt: string;
}

export async function submitVerificationRequest(orgId: string, requestType: 'supplier' | 'buyer', notes: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('verification_requests').insert({
    org_id: orgId,
    request_type: requestType,
    notes,
    submitted_by: user.id,
  });
  if (error) throw error;
}

export async function fetchMyVerificationRequests(orgId: string): Promise<VerificationRequest[]> {
  const { data, error } = await supabase
    .from('verification_requests')
    .select('id, request_type, status, notes, reviewer_note, submitted_at')
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    notes: row.notes,
    reviewerNote: row.reviewer_note,
    submittedAt: row.submitted_at,
  }));
}

export interface VerificationQueueItem extends VerificationRequest {
  orgName: string;
  orgId: string;
}

export async function fetchVerificationQueue(): Promise<VerificationQueueItem[]> {
  const { data, error } = await supabase
    .from('verification_requests')
    .select('id, request_type, status, notes, reviewer_note, submitted_at, org_id, organizations(name)')
    .in('status', ['submitted', 'under_review', 'additional_info_required'])
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    notes: row.notes,
    reviewerNote: row.reviewer_note,
    submittedAt: row.submitted_at,
    orgId: row.org_id,
    orgName: row.organizations?.name ?? 'Unknown organization',
  }));
}

export async function approveVerification(requestId: string, orgId: string, requestType: 'supplier' | 'buyer'): Promise<void> {
  const { executeBackendCommand } = await import('./commandApi');
  await executeBackendCommand('organization.verification.approve', { requestId, orgId, requestType });
}

export async function rejectVerification(requestId: string, note: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('verification_requests')
    .update({ status: 'rejected', reviewer_note: note, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

// --- Saved searches & follows (alerts) ---

export interface SavedSearch {
  id: string;
  name: string;
  keyword: string | null;
  sectorId: string | null;
  countryId: string | null;
  districtId: string | null;
  opportunityTypeId: string | null;
  frequency: 'immediate' | 'daily' | 'weekly';
  isActive: boolean;
  lastMatchedAt: string | null;
}

export interface SavedSearchMatch {
  id: string;
  savedSearchId: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunitySlug: string;
  matchScore: number;
  deliveryStatus: 'pending' | 'notified' | 'dismissed';
  matchedAt: string;
}

function mapSavedSearch(row: any): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    keyword: row.keyword,
    sectorId: row.sector_id,
    countryId: row.country_id,
    districtId: row.district_id,
    opportunityTypeId: row.opportunity_type_id,
    frequency: row.frequency ?? 'immediate',
    isActive: row.is_active ?? true,
    lastMatchedAt: row.last_matched_at,
  };
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id,name,keyword,sector_id,country_id,district_id,opportunity_type_id,frequency,is_active,last_matched_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSavedSearch);
}

export async function createSavedSearch(input: {
  name: string;
  keyword?: string | null;
  sectorId?: string | null;
  countryId?: string | null;
  districtId?: string | null;
  opportunityTypeId?: string | null;
  frequency?: SavedSearch['frequency'];
}): Promise<SavedSearch> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to save searches.');
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: user.id,
      name: input.name,
      keyword: input.keyword || null,
      sector_id: input.sectorId || null,
      country_id: input.countryId || null,
      district_id: input.districtId || null,
      opportunity_type_id: input.opportunityTypeId || null,
      frequency: input.frequency ?? 'immediate',
    })
    .select('id,name,keyword,sector_id,country_id,district_id,opportunity_type_id,frequency,is_active,last_matched_at')
    .single();
  if (error) throw error;
  return mapSavedSearch(data);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw error;
}

export async function updateSavedSearchDelivery(
  id: string,
  input: { frequency?: SavedSearch['frequency']; isActive?: boolean },
): Promise<SavedSearch> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.frequency) update.frequency = input.frequency;
  if (input.isActive != null) update.is_active = input.isActive;
  const { data, error } = await supabase
    .from('saved_searches')
    .update(update)
    .eq('id', id)
    .select('id,name,keyword,sector_id,country_id,district_id,opportunity_type_id,frequency,is_active,last_matched_at')
    .single();
  if (error) throw error;
  return mapSavedSearch(data);
}

export async function fetchSavedSearchMatches(limit = 50): Promise<SavedSearchMatch[]> {
  const { data, error } = await supabase
    .from('saved_search_matches')
    .select('id,saved_search_id,opportunity_id,match_score,delivery_status,matched_at,opportunities(title,slug)')
    .order('matched_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    savedSearchId: row.saved_search_id,
    opportunityId: row.opportunity_id,
    opportunityTitle: row.opportunities?.title ?? 'Tender opportunity',
    opportunitySlug: row.opportunities?.slug ?? '',
    matchScore: Number(row.match_score),
    deliveryStatus: row.delivery_status,
    matchedAt: row.matched_at,
  }));
}

export async function isFollowingBuyer(buyerOrgId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('followed_buyers')
    .select('buyer_org_id')
    .eq('buyer_org_id', buyerOrgId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function setFollowingBuyer(buyerOrgId: string, following: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to follow buyers.');
  if (following) {
    const { error } = await supabase.from('followed_buyers').insert({ buyer_org_id: buyerOrgId, user_id: user.id });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('followed_buyers').delete().eq('buyer_org_id', buyerOrgId).eq('user_id', user.id);
    if (error) throw error;
  }
}

// --- Notifications ---

export * from './procurement/notificationApi';

// --- Tender responses: suppliers express interest / intent to bid ---

export type ResponseKind = 'interest' | 'intent_to_bid';

export interface OpportunityResponse {
  id: string;
  opportunityId: string;
  orgId: string;
  orgName?: string;
  kind: ResponseKind;
  note: string | null;
  status: 'active' | 'withdrawn';
  createdAt: string;
}

function mapResponse(row: any): OpportunityResponse {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    orgId: row.org_id,
    orgName: row.organizations?.name,
    kind: row.kind,
    note: row.note ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Use the same verified, persisted organization context as the dashboard.
// fetchMyOrganization validates the stored id against the current user's
// visible memberships before returning it.
export async function fetchMyOrgId(): Promise<string | null> {
  const organization = await fetchMyOrganization();
  return organization?.id ?? null;
}

// Public social-proof count of active responders on a tender.
export async function fetchResponseCount(opportunityId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_opportunity_response_count', { p_opportunity_id: opportunityId });
  if (error) return 0;
  return Number(data ?? 0);
}

// The current org's response to a tender, if any.
export async function fetchMyResponse(opportunityId: string, orgId: string): Promise<OpportunityResponse | null> {
  const { data, error } = await supabase
    .from('opportunity_responses')
    .select('id, opportunity_id, org_id, kind, note, status, created_at')
    .eq('opportunity_id', opportunityId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapResponse(data) : null;
}

// Create or update this org's response (upsert on the unique pair).
export async function submitResponse(input: { opportunityId: string; orgId: string; kind: ResponseKind; note?: string | null }): Promise<OpportunityResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('opportunity_responses')
    .upsert(
      {
        opportunity_id: input.opportunityId,
        org_id: input.orgId,
        user_id: user?.id ?? null,
        kind: input.kind,
        note: input.note ?? null,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'opportunity_id,org_id' },
    )
    .select('id, opportunity_id, org_id, kind, note, status, created_at')
    .single();
  if (error) throw error;
  return mapResponse(data);
}

export async function withdrawResponse(id: string): Promise<void> {
  const { error } = await supabase.from('opportunity_responses').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// Buyer view: all active responses to one of their tenders (with org names).
export async function fetchOpportunityResponses(opportunityId: string): Promise<OpportunityResponse[]> {
  const { data, error } = await supabase
    .from('opportunity_responses')
    .select('id, opportunity_id, org_id, kind, note, status, created_at, organizations(name)')
    .eq('opportunity_id', opportunityId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapResponse);
}

// --- Team accounts ---

export * from './procurement/teamApi';

// --- Subscriptions & billing ---

export * from './procurement/subscriptionRequestApi';

// --- Featured tender placement (admin only, enforced by RLS) ---

export async function setOpportunityFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase.from('opportunities').update({ is_featured: featured }).eq('id', id);
  if (error) throw error;
}

// --- Service requests ---

export * from './procurement/serviceRequestApi';

// --- Supplier opportunity pipeline (strictly private -- see RLS) ---

export type PipelineStage = 'saved' | 'reviewing' | 'interested' | 'go' | 'no_go' | 'preparing' | 'submitted' | 'won' | 'lost' | 'withdrawn' | 'archived';

export interface PipelineRecord {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunitySlug: string;
  submissionDeadline: string;
  stage: PipelineStage;
  bidValue: number | null;
  probability: number | null;
  internalDeadline: string | null;
  lossReason: string | null;
  notes: string | null;
}

export async function fetchPipeline(orgId: string): Promise<PipelineRecord[]> {
  const { data, error } = await supabase
    .from('pipeline_records')
    .select('id, opportunity_id, stage, bid_value, probability, internal_deadline, loss_reason, notes, opportunities(title, slug, submission_deadline)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunityTitle: row.opportunities?.title ?? 'Unknown tender',
    opportunitySlug: row.opportunities?.slug ?? '',
    submissionDeadline: row.opportunities?.submission_deadline ?? '',
    stage: row.stage,
    bidValue: row.bid_value !== null ? Number(row.bid_value) : null,
    probability: row.probability,
    internalDeadline: row.internal_deadline,
    lossReason: row.loss_reason,
    notes: row.notes,
  }));
}

export async function addToPipeline(orgId: string, opportunityId: string): Promise<void> {
  const { error } = await supabase.from('pipeline_records').upsert(
    { org_id: orgId, opportunity_id: opportunityId },
    { onConflict: 'org_id,opportunity_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}

export interface UpdatePipelineInput {
  stage?: PipelineStage;
  bidValue?: number | null;
  probability?: number | null;
  internalDeadline?: string | null;
  lossReason?: string | null;
  notes?: string | null;
}

export async function updatePipelineRecord(id: string, updates: UpdatePipelineInput): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.stage !== undefined) patch.stage = updates.stage;
  if (updates.bidValue !== undefined) patch.bid_value = updates.bidValue;
  if (updates.probability !== undefined) patch.probability = updates.probability;
  if (updates.internalDeadline !== undefined) patch.internal_deadline = updates.internalDeadline;
  if (updates.lossReason !== undefined) patch.loss_reason = updates.lossReason;
  if (updates.notes !== undefined) patch.notes = updates.notes;
  const { error } = await supabase.from('pipeline_records').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeFromPipeline(id: string): Promise<void> {
  const { error } = await supabase.from('pipeline_records').delete().eq('id', id);
  if (error) throw error;
}

export interface PipelineTask {
  id: string;
  title: string;
  isDone: boolean;
}

export async function fetchPipelineTasks(pipelineRecordId: string): Promise<PipelineTask[]> {
  const { data, error } = await supabase
    .from('pipeline_tasks')
    .select('id, title, is_done')
    .eq('pipeline_record_id', pipelineRecordId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, title: row.title, isDone: row.is_done }));
}

export async function addPipelineTask(pipelineRecordId: string, title: string): Promise<void> {
  const { error } = await supabase.from('pipeline_tasks').insert({ pipeline_record_id: pipelineRecordId, title });
  if (error) throw error;
}

export async function togglePipelineTask(id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase.from('pipeline_tasks').update({ is_done: isDone }).eq('id', id);
  if (error) throw error;
}

// --- Supplier sector tagging (drives recommendations) ---

export async function fetchSupplierSectorIds(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.from('supplier_sectors').select('sector_id').eq('org_id', orgId);
  if (error) throw error;
  return (data ?? []).map((row: any) => row.sector_id);
}

export async function setSupplierSectorIds(orgId: string, sectorIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('supplier_sectors').delete().eq('org_id', orgId);
  if (deleteError) throw deleteError;
  if (sectorIds.length === 0) return;
  const { error: insertError } = await supabase.from('supplier_sectors').insert(sectorIds.map((sectorId) => ({ org_id: orgId, sector_id: sectorId })));
  if (insertError) throw insertError;
}

export async function fetchRecommendedOpportunities(orgId: string): Promise<OpportunityListItem[]> {
  const sectorIds = await fetchSupplierSectorIds(orgId);
  if (sectorIds.length === 0) return [];
  const { data, error } = await supabase
    .from('opportunities')
    .select(LIST_SELECT)
    .in('sector_id', sectorIds)
    .order('submission_deadline', { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(mapListItem);
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

// --- Admin analytics ---

export interface AnalyticsStat {
  label: string;
  count: number;
  total_value?: number;
}

export interface AdminAnalyticsSummary {
  opportunities_by_status: AnalyticsStat[];
  opportunities_by_sector: AnalyticsStat[];
  opportunities_by_district: AnalyticsStat[];
  most_viewed: { title: string; slug: string; value: number }[];
  most_saved: { title: string; slug: string; value: number }[];
  most_followed_buyers: AnalyticsStat[];
  subscriptions_by_plan: AnalyticsStat[];
  awards_by_sector: AnalyticsStat[];
  total_organizations: number;
  total_suppliers: number;
  total_verified_suppliers: number;
  total_buyers: number;
}

export async function fetchAdminAnalytics(): Promise<AdminAnalyticsSummary> {
  const { data, error } = await supabase.rpc('get_admin_analytics_summary');
  if (error) throw error;
  return data as AdminAnalyticsSummary;
}

export interface ProcurementSearchInsights {
  periodDays: number;
  searches: number;
  uniqueSearchers: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  averageResults: number;
  dailyTrend: { date: string; searches: number; zeroResults: number }[];
  topTerms: { term: string; searches: number; averageResults: number; zeroResultRate: number }[];
  contentGaps: { term: string; searches: number; latestSearchAt: string }[];
  sectorDemand: { label: string; searches: number }[];
  countryDemand: { label: string; searches: number }[];
  districtDemand: { label: string; searches: number }[];
}

export async function fetchProcurementSearchInsights(days = 30): Promise<ProcurementSearchInsights> {
  const { data, error } = await supabase.rpc('admin_get_procurement_search_insights', { p_days: days });
  if (error) throw error;
  const insight = data ?? {};
  return {
    periodDays: Number(insight.period_days ?? days),
    searches: Number(insight.searches ?? 0),
    uniqueSearchers: Number(insight.unique_searchers ?? 0),
    zeroResultSearches: Number(insight.zero_result_searches ?? 0),
    zeroResultRate: Number(insight.zero_result_rate ?? 0),
    averageResults: Number(insight.average_results ?? 0),
    dailyTrend: (insight.daily_trend ?? []).map((row: any) => ({
      date: row.search_date,
      searches: Number(row.searches ?? 0),
      zeroResults: Number(row.zero_results ?? 0),
    })),
    topTerms: (insight.top_terms ?? []).map((row: any) => ({
      term: row.term,
      searches: Number(row.searches ?? 0),
      averageResults: Number(row.average_results ?? 0),
      zeroResultRate: Number(row.zero_result_rate ?? 0),
    })),
    contentGaps: (insight.content_gaps ?? []).map((row: any) => ({
      term: row.term,
      searches: Number(row.searches ?? 0),
      latestSearchAt: row.latest_search_at,
    })),
    sectorDemand: (insight.sector_demand ?? []).map((row: any) => ({ label: row.label, searches: Number(row.searches ?? 0) })),
    countryDemand: (insight.country_demand ?? []).map((row: any) => ({ label: row.label, searches: Number(row.searches ?? 0) })),
    districtDemand: (insight.district_demand ?? []).map((row: any) => ({ label: row.label, searches: Number(row.searches ?? 0) })),
  };
}

// --- Feature entitlement check (generic) ---

export async function hasFeature(orgId: string, featureKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_org_feature_limit', { p_org_id: orgId, p_feature_key: featureKey });
  if (error) throw error;
  return data === null || data > 0;
}

// --- AI assist (procurement domain, separate from the ad-copywriting endpoint) ---

async function callProcurementAI(mode: 'suggest_sector' | 'explain_tender', text: string, sectorNames?: string[]): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch('/api/gemini/procurement-assist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ mode, text, sectorNames }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'AI assist failed.');
  return data.text || '';
}

export async function aiSuggestSector(titleAndDescription: string, sectorNames: string[]): Promise<string> {
  return callProcurementAI('suggest_sector', titleAndDescription, sectorNames);
}

export async function aiExplainTender(tenderText: string): Promise<string> {
  return callProcurementAI('explain_tender', tenderText);
}

// Advertising requests, publisher operations, creatives, analytics and
// campaign management now live in a focused domain module. Re-exporting keeps
// existing consumers compatible while they migrate to the direct import.
export * from './advertisingApi';

// Agency and advertising billing operations live in focused domain modules.
// Re-exports preserve compatibility while remaining consumers migrate.
export * from './advertBillingApi';
export * from './agencyApi';

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

export interface TenderAlertDeliverySummary {
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  suppressed: number;
  deliveries24h: number;
}

export async function fetchTenderAlertDeliverySummary(): Promise<TenderAlertDeliverySummary> {
  const { data, error } = await supabase.rpc('admin_get_tender_alert_delivery_summary');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    queued: Number(row?.queued ?? 0),
    sent: Number(row?.sent ?? 0),
    delivered: Number(row?.delivered ?? 0),
    failed: Number(row?.failed ?? 0),
    suppressed: Number(row?.suppressed ?? 0),
    deliveries24h: Number(row?.deliveries_24h ?? 0),
  };
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
