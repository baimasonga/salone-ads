import { supabase } from '../supabaseClient';
import type { OpportunityDocument } from './opportunityApi';
import { extractTenderDocumentText } from './documentTextExtraction';
import {
  normalizeTenderDocumentIntelligence,
  type TenderDocumentIntelligence,
} from './documentIntelligenceModel';

export interface SavedTenderDocumentAnalysis extends TenderDocumentIntelligence {
  id: string;
  opportunityId: string;
  documentId: string;
  sourceSha256: string;
  pageCount: number | null;
  sourceTruncated: boolean;
  model: string;
  analyzedAt: string;
}

function mapAnalysis(row: any): SavedTenderDocumentAnalysis {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    documentId: row.document_id,
    sourceSha256: row.source_sha256,
    pageCount: row.page_count ?? null,
    sourceTruncated: !!row.source_truncated,
    model: row.model,
    analyzedAt: row.analyzed_at,
    ...normalizeTenderDocumentIntelligence(row.analysis),
  };
}

export async function fetchMyTenderDocumentAnalyses(opportunityId: string): Promise<SavedTenderDocumentAnalysis[]> {
  const { data, error } = await supabase
    .from('tender_document_analyses')
    .select('id,opportunity_id,document_id,source_sha256,page_count,source_truncated,model,analysis,analyzed_at')
    .eq('opportunity_id', opportunityId)
    .order('analyzed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAnalysis);
}

export async function analyzeTenderDocument(
  opportunityId: string,
  document: OpportunityDocument,
): Promise<SavedTenderDocumentAnalysis> {
  const extracted = await extractTenderDocumentText(document);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in with a Tender Viewer or Publisher account to analyse documents.');
  const response = await fetch('/api/gemini/procurement-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      mode: 'analyze_document',
      text: extracted.text,
      documentName: document.fileName,
      sourceTruncated: extracted.truncated,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error?.message || 'Document analysis failed.');
  const analysis = normalizeTenderDocumentIntelligence(payload.analysis);
  const { data, error } = await supabase.from('tender_document_analyses').upsert({
    opportunity_id: opportunityId,
    document_id: document.id,
    user_id: session.user.id,
    source_sha256: extracted.sourceSha256,
    page_count: extracted.pageCount,
    source_truncated: extracted.truncated,
    model: payload.model || 'local-deterministic-v1',
    analysis,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,document_id' })
    .select('id,opportunity_id,document_id,source_sha256,page_count,source_truncated,model,analysis,analyzed_at')
    .single();
  if (error) throw error;
  return mapAnalysis(data);
}
