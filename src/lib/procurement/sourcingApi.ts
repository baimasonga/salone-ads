import { supabase } from '../supabaseClient';

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
  const { executeBackendCommand } = await import('../commandApi');
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
