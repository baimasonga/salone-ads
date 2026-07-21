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
  id, slug, title, buyer_name, submission_deadline, estimated_value, currency_code, is_featured,
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

export async function createOpportunity(orgId: string, orgName: string, input: CreateOpportunityInput): Promise<OpportunityListItem> {
  const { data: publishedStatus, error: statusError } = await supabase
    .from('opportunity_statuses')
    .select('id')
    .eq('code', 'published')
    .single();
  if (statusError) throw statusError;

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
      status_id: publishedStatus.id,
    })
    .select(LIST_SELECT)
    .single();
  if (error) throw error;
  return mapListItem(data);
}

export async function closeOpportunity(id: string): Promise<void> {
  const { data: closedStatus, error: statusError } = await supabase
    .from('opportunity_statuses')
    .select('id')
    .eq('code', 'closed')
    .single();
  if (statusError) throw statusError;
  const { error } = await supabase.from('opportunities').update({ status_id: closedStatus.id }).eq('id', id);
  if (error) throw error;
}
