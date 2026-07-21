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
  opportunityType: string | null;
  statusCode: string;
  statusLabel: string;
  reviewNote: string | null;
}

export interface OpportunityDetail extends OpportunityListItem {
  referenceNumber: string | null;
  summary: string | null;
  description: string | null;
  procurementMethod: string | null;
  country: string | null;
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
}

export interface OpportunityDocument {
  id: string;
  fileName: string;
  storagePath: string;
  fileSize: number | null;
}

const LIST_SELECT = `
  id, slug, title, buyer_name, submission_deadline, estimated_value, currency_code, is_featured, review_note,
  sectors(name), districts(name), opportunity_types(label), opportunity_statuses(code, label)
`;

const DETAIL_SELECT = `
  ${LIST_SELECT},
  reference_number, summary, description, country_id, city, buyer_org_id,
  publication_date, clarification_deadline, opening_date,
  eligibility_requirements, bid_security, application_fee, contact_details, submission_instructions,
  source_name, source_url,
  procurement_methods(label), countries(name), funding_agencies(name)
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
    opportunityType: row.opportunity_types?.label ?? null,
    statusCode: row.opportunity_statuses?.code ?? 'published',
    statusLabel: row.opportunity_statuses?.label ?? 'Published',
    reviewNote: row.review_note ?? null,
  };
}

function mapDetail(row: any): OpportunityDetail {
  return {
    ...mapListItem(row),
    referenceNumber: row.reference_number ?? null,
    summary: row.summary ?? null,
    description: row.description ?? null,
    procurementMethod: row.procurement_methods?.label ?? null,
    country: row.countries?.name ?? null,
    city: row.city ?? null,
    fundingAgency: row.funding_agencies?.name ?? null,
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
  };
}

export interface OpportunitySearchFilters {
  keyword?: string;
  sectorId?: string;
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
  if (filters.districtId) query = query.eq('district_id', filters.districtId);
  if (filters.opportunityTypeId) query = query.eq('opportunity_type_id', filters.opportunityTypeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapListItem);
}

export async function fetchOpportunityBySlug(slug: string): Promise<OpportunityDetail | null> {
  const { data, error } = await supabase.from('opportunities').select(DETAIL_SELECT).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapDetail(data);
}

export async function fetchOpportunityDocuments(opportunityId: string): Promise<OpportunityDocument[]> {
  const { data, error } = await supabase
    .from('opportunity_documents')
    .select('id, file_name, storage_path, file_size')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileSize: row.file_size ?? null,
  }));
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

export async function fetchDistricts(): Promise<TaxonomyOption[]> {
  const { data, error } = await supabase.from('districts').select('id, name').eq('is_active', true).order('sort_order');
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

export async function enableBuyerMode(orgId: string): Promise<void> {
  const { error } = await supabase.from('organizations').update({ is_buyer: true }).eq('id', orgId);
  if (error) throw error;
}

export interface CreateOpportunityInput {
  title: string;
  summary: string;
  description: string;
  opportunityTypeId: string;
  sectorId: string;
  districtId: string;
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
      district_id: input.districtId || null,
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
