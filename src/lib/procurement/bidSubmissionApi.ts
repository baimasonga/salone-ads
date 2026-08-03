import { supabase } from '../supabaseClient';

const BUCKET = 'bid-submissions';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface BidDocument { id: string; submissionId: string; fileName: string; storagePath: string; fileSize: number; mimeType: string | null; }
export interface BidSubmission { id: string; opportunityId: string; responseId: string; orgId: string; status: 'draft' | 'submitted' | 'withdrawn'; version: number; coverNote: string | null; submittedAt: string | null; documents: BidDocument[]; }

const mapDocument = (row: any): BidDocument => ({ id: row.id, submissionId: row.submission_id, fileName: row.file_name, storagePath: row.storage_path, fileSize: row.file_size, mimeType: row.mime_type ?? null });
const mapSubmission = (row: any): BidSubmission => ({ id: row.id, opportunityId: row.opportunity_id, responseId: row.response_id, orgId: row.org_id, status: row.status, version: row.version, coverNote: row.cover_note ?? null, submittedAt: row.submitted_at ?? null, documents: (row.bid_submission_documents ?? []).map(mapDocument) });

export async function fetchMyBidSubmission(responseId: string): Promise<BidSubmission | null> {
  const { data, error } = await supabase.from('bid_submissions').select('id,opportunity_id,response_id,org_id,status,version,cover_note,submitted_at,bid_submission_documents(id,submission_id,file_name,storage_path,file_size,mime_type)').eq('response_id', responseId).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapSubmission(data) : null;
}

export async function createBidDraft(opportunityId: string, responseId: string, orgId: string): Promise<BidSubmission> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to prepare a bid.');
  const existing = await fetchMyBidSubmission(responseId);
  if (existing && existing.status !== 'withdrawn') return existing;
  const version = existing ? existing.version + 1 : 1;
  const { data, error } = await supabase.from('bid_submissions').insert({ opportunity_id: opportunityId, response_id: responseId, org_id: orgId, submitted_by: user.id, version }).select('id,opportunity_id,response_id,org_id,status,version,cover_note,submitted_at').single();
  if (error) throw error;
  return mapSubmission({ ...data, bid_submission_documents: [] });
}

export async function uploadBidDocument(submission: BidSubmission, file: File): Promise<BidDocument> {
  if (submission.status !== 'draft') throw new Error('Submitted bids cannot be changed. Withdraw and create a new version.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Each bid document must be 10MB or smaller.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload bid documents.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${submission.orgId}/bids/${submission.opportunityId}/${submission.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('bid_submission_documents').insert({ submission_id: submission.id, storage_path: storagePath, file_name: file.name, file_size: file.size, mime_type: file.type || null, uploaded_by: user.id }).select('id,submission_id,file_name,storage_path,file_size,mime_type').single();
  if (error) { await supabase.storage.from(BUCKET).remove([storagePath]); throw error; }
  return mapDocument(data);
}

export async function deleteBidDocument(document: BidDocument): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([document.storagePath]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('bid_submission_documents').delete().eq('id', document.id);
  if (error) throw error;
}

export async function submitBid(submissionId: string, coverNote: string): Promise<void> {
  const { error } = await supabase.from('bid_submissions').update({ status: 'submitted', cover_note: coverNote.trim() || null, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', submissionId);
  if (error) throw error;
}

export async function withdrawBid(submissionId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('bid_submissions').update({ status: 'withdrawn', withdrawn_at: now, updated_at: now }).eq('id', submissionId);
  if (error) throw error;
}

export async function fetchTenderBidSubmissions(opportunityId: string): Promise<BidSubmission[]> {
  const { data, error } = await supabase.from('bid_submissions').select('id,opportunity_id,response_id,org_id,status,version,cover_note,submitted_at,bid_submission_documents(id,submission_id,file_name,storage_path,file_size,mime_type)').eq('opportunity_id', opportunityId).eq('status', 'submitted').order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSubmission);
}

export async function getBidDocumentUrl(document: BidDocument): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(document.storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}
