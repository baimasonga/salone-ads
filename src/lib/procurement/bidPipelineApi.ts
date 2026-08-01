import {
  OPPORTUNITY_LIST_SELECT,
  mapOpportunityListItem,
  type OpportunityListItem,
} from './opportunityApi';
import { supabase } from '../supabaseClient';

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
    { onConflict: 'org_id,opportunity_id', ignoreDuplicates: true },
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
    .select(OPPORTUNITY_LIST_SELECT)
    .in('sector_id', sectorIds)
    .order('submission_deadline', { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(mapOpportunityListItem);
}
