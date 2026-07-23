import { supabase } from './supabaseClient';

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
  };
}

export interface OpportunitySearchFilters {
  keyword?: string;
  sectorId?: string;
  countryId?: string;
  districtId?: string;
  opportunityTypeId?: string;
}

export async function searchOpportunities(filters: OpportunitySearchFilters): Promise<OpportunityListItem[]> {
  let query = supabase
    .from('opportunities')
    .select(LIST_SELECT)
    .order('is_featured', { ascending: false })
    .order('submission_deadline', { ascending: true })
    .limit(50);

  if (filters.keyword) query = query.ilike('title', `%${filters.keyword}%`);
  if (filters.sectorId) query = query.eq('sector_id', filters.sectorId);
  if (filters.countryId) query = query.eq('country_id', filters.countryId);
  if (filters.districtId) query = query.eq('district_id', filters.districtId);
  if (filters.opportunityTypeId) query = query.eq('opportunity_type_id', filters.opportunityTypeId);

  const { data, error } = await query;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: reqError } = await supabase
    .from('verification_requests')
    .update({ status: 'verified', reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (reqError) throw reqError;

  // Admins aren't members of every org, so this goes through a scoped RPC
  // rather than a direct table update (which RLS would reject).
  const { error } = await supabase.rpc('admin_set_organization_verification', {
    p_org_id: orgId,
    p_request_type: requestType,
    p_verified: true,
  });
  if (error) throw error;
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
  districtId: string | null;
  opportunityTypeId: string | null;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, name, keyword, sector_id, district_id, opportunity_type_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    keyword: row.keyword,
    sectorId: row.sector_id,
    districtId: row.district_id,
    opportunityTypeId: row.opportunity_type_id,
  }));
}

export async function createSavedSearch(input: Omit<SavedSearch, 'id'>): Promise<SavedSearch> {
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
      district_id: input.districtId || null,
      opportunity_type_id: input.opportunityTypeId || null,
    })
    .select('id, name, keyword, sector_id, district_id, opportunity_type_id')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    keyword: data.keyword,
    sectorId: data.sector_id,
    districtId: data.district_id,
    opportunityTypeId: data.opportunity_type_id,
  };
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw error;
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

export interface AppNotification {
  id: string;
  category: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  status: string;
  createdAt: string;
}

export async function fetchMyNotifications(): Promise<AppNotification[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, category, title, body, link_url, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// --- Team accounts ---

export interface TeamMember {
  userId: string;
  role: string;
  fullName: string;
  email: string;
}

export async function fetchTeamMembers(orgId: string): Promise<TeamMember[]> {
  // organization_members.user_id and profiles.id both reference auth.users
  // as siblings -- there's no direct FK between the two tables, so this
  // can't be a single embedded PostgREST select. Two round trips instead.
  const { data: members, error: membersError } = await supabase
    .from('organization_members')
    .select('user_id, role, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in(
      'id',
      members.map((m: any) => m.user_id)
    );
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return members.map((m: any) => {
    const profile = profileById.get(m.user_id);
    return {
      userId: m.user_id,
      role: m.role,
      fullName: profile?.full_name ?? '',
      email: profile?.email ?? '',
    };
  });
}

export async function fetchTeamMemberLimit(orgId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_org_feature_limit', { p_org_id: orgId, p_feature_key: 'max_team_members' });
  if (error) throw error;
  return data ?? null;
}

export async function inviteTeamMember(orgId: string, email: string, role: 'owner' | 'admin' | 'member'): Promise<void> {
  const { error } = await supabase.rpc('invite_team_member', { p_org_id: orgId, p_email: email, p_role: role });
  if (error) throw error;
}

export async function removeTeamMember(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId);
  if (error) throw error;
}

// --- Subscriptions & billing ---

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currencyCode: string;
}

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('id, code, name, description, monthly_price, annual_price, currency_code')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    monthlyPrice: row.monthly_price !== null ? Number(row.monthly_price) : null,
    annualPrice: row.annual_price !== null ? Number(row.annual_price) : null,
    currencyCode: row.currency_code,
  }));
}

export interface OrgSubscription {
  id: string;
  planCode: string;
  planName: string;
  status: string;
  billingCycle: string;
  paymentMethod: string;
  notes: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export async function fetchMySubscriptions(orgId: string): Promise<OrgSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, billing_cycle, payment_method, notes, current_period_end, created_at, plans(code, name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    planCode: row.plans?.code ?? '',
    planName: row.plans?.name ?? 'Unknown plan',
    status: row.status,
    billingCycle: row.billing_cycle,
    paymentMethod: row.payment_method,
    notes: row.notes,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  }));
}

export async function requestSubscription(orgId: string, planId: string, billingCycle: 'monthly' | 'annual', notes: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').insert({
    org_id: orgId,
    plan_id: planId,
    billing_cycle: billingCycle,
    payment_method: 'manual_bank_transfer',
    notes,
  });
  if (error) throw error;
}

export async function updateSubscriptionNotes(subscriptionId: string, notes: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ notes }).eq('id', subscriptionId);
  if (error) throw error;
}

export interface PendingSubscription extends OrgSubscription {
  orgId: string;
  orgName: string;
}

export async function fetchPendingSubscriptions(): Promise<PendingSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, billing_cycle, payment_method, notes, current_period_end, created_at, org_id, plans(code, name), organizations(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    planCode: row.plans?.code ?? '',
    planName: row.plans?.name ?? 'Unknown plan',
    status: row.status,
    billingCycle: row.billing_cycle,
    paymentMethod: row.payment_method,
    notes: row.notes,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
    orgId: row.org_id,
    orgName: row.organizations?.name ?? 'Unknown organization',
  }));
}

export async function activateSubscription(subscriptionId: string, billingCycle: 'monthly' | 'annual'): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const periodEnd = new Date();
  if (billingCycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq('id', subscriptionId);
  if (error) throw error;
}

export async function cancelSubscriptionRequest(subscriptionId: string, note: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ status: 'cancelled', notes: note }).eq('id', subscriptionId);
  if (error) throw error;
}

// --- Featured tender placement (admin only, enforced by RLS) ---

export async function setOpportunityFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase.from('opportunities').update({ is_featured: featured }).eq('id', id);
  if (error) throw error;
}

// --- Service requests ---

export type ServiceType =
  | 'document_retrieval'
  | 'tender_clarification'
  | 'eligibility_assessment'
  | 'bid_readiness_review'
  | 'proposal_review'
  | 'company_profile_prep'
  | 'supplier_registration_assistance'
  | 'featured_placement'
  | 'other';

export interface ServiceRequestActivity {
  id: string;
  note: string;
  isInternal: boolean;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  orgId: string;
  orgName?: string;
  serviceType: ServiceType;
  description: string;
  status: string;
  quoteAmount: number | null;
  quoteCurrency: string | null;
  createdAt: string;
}

export async function createServiceRequest(orgId: string, serviceType: ServiceType, description: string, relatedOpportunityId?: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('service_requests').insert({
    org_id: orgId,
    requested_by: user.id,
    service_type: serviceType,
    description,
    related_opportunity_id: relatedOpportunityId || null,
  });
  if (error) throw error;
}

export async function fetchMyServiceRequests(orgId: string): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, org_id, service_type, description, status, quote_amount, quote_currency, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapServiceRequest);
}

export async function fetchAllServiceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, org_id, service_type, description, status, quote_amount, quote_currency, created_at, organizations(name)')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...mapServiceRequest(row), orgName: row.organizations?.name }));
}

function mapServiceRequest(row: any): ServiceRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    serviceType: row.service_type,
    description: row.description,
    status: row.status,
    quoteAmount: row.quote_amount !== null && row.quote_amount !== undefined ? Number(row.quote_amount) : null,
    quoteCurrency: row.quote_currency,
    createdAt: row.created_at,
  };
}

export async function fetchServiceRequestActivities(requestId: string): Promise<ServiceRequestActivity[]> {
  const { data, error } = await supabase
    .from('service_request_activities')
    .select('id, note, is_internal, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, note: row.note, isInternal: row.is_internal, createdAt: row.created_at }));
}

export async function addServiceRequestNote(requestId: string, note: string, isInternal: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('service_request_activities').insert({
    request_id: requestId,
    author_id: user.id,
    note,
    is_internal: isInternal,
  });
  if (error) throw error;
}

export async function updateServiceRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('service_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function quoteServiceRequest(id: string, amount: number, currencyCode: string): Promise<void> {
  const { error } = await supabase
    .from('service_requests')
    .update({ status: 'quoted', quote_amount: amount, quote_currency: currencyCode, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

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
  const { error } = await supabase.rpc('increment_opportunity_view', { p_opportunity_id: opportunityId });
  if (error) {
    /* view counting is best-effort, never block the page on it */
    console.warn('Could not record tender view', error.message);
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
  reachCount: number | null;
  runCount: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

function mapAdvertisementRequest(row: any): AdvertisementRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status,
    platform: row.platform,
    reachCount: row.reach_count,
    runCount: row.run_count,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

export async function submitAdvertisementRequest(
  orgId: string,
  input: { category: AdvertisementCategory; subject: string; description: string }
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
    })
    .select('id, org_id, category, subject, description, status, platform, reach_count, run_count, start_date, end_date, created_at')
    .single();
  if (error) throw error;
  return mapAdvertisementRequest(data);
}

export async function fetchMyAdvertisements(orgId: string): Promise<AdvertisementRequest[]> {
  const { data, error } = await supabase
    .from('advertisement_requests')
    .select('id, org_id, category, subject, description, status, platform, reach_count, run_count, start_date, end_date, created_at')
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
    .select('id, org_id, category, subject, description, status, platform, reach_count, run_count, start_date, end_date, created_at, organizations(name)')
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
