import { useEffect, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import {
  createBidDraft,
  deleteBidDocument,
  fetchMyBidSubmission,
  submitBid,
  uploadBidDocument,
  withdrawBid,
  type BidSubmission,
} from '../../lib/procurement/bidSubmissionApi';

interface Props { opportunityId: string; responseId: string; orgId: string; closed: boolean; }

export function BidSubmissionPanel({ opportunityId, responseId, orgId, closed }: Props) {
  const [submission, setSubmission] = useState<BidSubmission | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => { void fetchMyBidSubmission(responseId).then((value) => { setSubmission(value); setCoverNote(value?.coverNote ?? ''); }).catch(() => setFeedback('Could not load your bid documents.')); }, [responseId]);

  const ensureDraft = async () => {
    if (submission?.status === 'draft') return submission;
    const draft = await createBidDraft(opportunityId, responseId, orgId);
    setSubmission(draft);
    return draft;
  };

  const upload = async (file?: File) => {
    if (!file || closed) return;
    setBusy(true); setFeedback('');
    try { const draft = await ensureDraft(); const document = await uploadBidDocument(draft, file); setSubmission({ ...draft, documents: [...draft.documents, document] }); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not upload the document.'); }
    finally { setBusy(false); }
  };

  const remove = async (documentId: string) => {
    if (!submission) return;
    const document = submission.documents.find((item) => item.id === documentId);
    if (!document) return;
    setBusy(true);
    try { await deleteBidDocument(document); setSubmission({ ...submission, documents: submission.documents.filter((item) => item.id !== documentId) }); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not remove the document.'); }
    finally { setBusy(false); }
  };

  const finalize = async () => {
    if (!submission || submission.documents.length === 0) { setFeedback('Upload at least one document before submitting your bid.'); return; }
    setBusy(true); setFeedback('');
    try { await submitBid(submission.id, coverNote); setSubmission({ ...submission, status: 'submitted', coverNote, submittedAt: new Date().toISOString() }); setFeedback('Bid submitted securely to the buyer.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not submit the bid.'); }
    finally { setBusy(false); }
  };

  const withdraw = async () => {
    if (!submission || !window.confirm('Withdraw this submitted bid? You may prepare a new version before the deadline.')) return;
    setBusy(true);
    try { await withdrawBid(submission.id); setSubmission({ ...submission, status: 'withdrawn' }); setFeedback('Bid withdrawn. You can prepare a new version before the deadline.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not withdraw the bid.'); }
    finally { setBusy(false); }
  };

  return <section className="mt-5 border-t-2 border-slate-900 pt-4">
    <h3 className="font-display text-sm font-bold uppercase">Confidential bid documents</h3>
    <p className="mt-1 text-xs text-slate-500">Files are private and visible only to your organisation, the tender buyer and platform administrators.</p>
    {feedback && <p role="status" className="mt-3 border border-slate-200 bg-slate-50 p-2 text-xs">{feedback}</p>}
    {submission?.documents.map((document) => <div key={document.id} className="mt-2 flex items-center justify-between border bg-white p-2 text-xs"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0"/><span className="truncate">{document.fileName}</span></span>{submission.status === 'draft' && <button aria-label={`Remove ${document.fileName}`} disabled={busy} onClick={() => void remove(document.id)}><Trash2 className="h-4 w-4 text-red-600"/></button>}</div>)}
    {submission?.status === 'submitted' ? <div className="mt-3"><p className="text-sm font-semibold text-emerald-700">Version {submission.version} submitted.</p>{!closed && <button disabled={busy} onClick={() => void withdraw()} className="mt-2 border px-3 py-2 text-xs font-bold">Withdraw and replace</button>}</div> : <>
      <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 border-2 border-slate-900 px-3 py-2 text-xs font-bold ${closed ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-4 w-4"/>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Upload document'}<input className="hidden" type="file" disabled={busy || closed} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }}/></label>
      {submission && <><textarea value={coverNote} onChange={(event) => setCoverNote(event.target.value)} rows={2} maxLength={1000} placeholder="Optional cover note to the buyer" className="mt-3 w-full border p-3 text-sm"/><button disabled={busy || closed} onClick={() => void finalize()} className="mt-2 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Submit bid securely</button></>}
    </>}
  </section>;
}
