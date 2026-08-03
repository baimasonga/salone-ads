import { useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Bell, FileText, Trash2, Upload } from 'lucide-react';
import {
  cancelOpportunity,
  closeOpportunity,
  deleteOpportunityDocument,
  extendDeadline,
  fetchMyOpportunities,
  fetchOpportunityDocuments,
  getOpportunityDocumentUrl,
  recordAward,
  resubmitForReview,
  uploadOpportunityDocument,
  type OpportunityDocument,
  type OpportunityListItem,
} from '../../lib/procurement/opportunityApi';
import { fetchOpportunityResponses, type OpportunityResponse } from '../../lib/procurement/responseApi';
import { fetchTenderBidSubmissions, getBidDocumentUrl, type BidSubmission } from '../../lib/procurement/bidSubmissionApi';
import { ProcurementActionDialog } from './ProcurementActionDialog';

type ManagementDialogType = 'cancel' | 'close' | 'deadline' | 'award';

interface ManagementDialog {
  type: ManagementDialogType;
  opportunityId: string;
  opportunityTitle: string;
}

interface TenderManagementPanelProps {
  organizationId: string;
  opportunities: OpportunityListItem[];
  setOpportunities: Dispatch<SetStateAction<OpportunityListItem[]>>;
  loading: boolean;
  onFeedback: (message: string) => void;
}

export function TenderManagementPanel({
  organizationId,
  opportunities,
  setOpportunities,
  loading,
  onFeedback,
}: TenderManagementPanelProps) {
  const [expandedDocumentsId, setExpandedDocumentsId] = useState<string | null>(null);
  const [documentsByOpportunity, setDocumentsByOpportunity] = useState<Record<string, OpportunityDocument[]>>({});
  const [documentsArePublic, setDocumentsArePublic] = useState(true);
  const [uploadingDocumentFor, setUploadingDocumentFor] = useState<string | null>(null);
  const [expandedResponsesId, setExpandedResponsesId] = useState<string | null>(null);
  const [responsesByOpportunity, setResponsesByOpportunity] = useState<Record<string, OpportunityResponse[]>>({});
  const [bidsByOpportunity, setBidsByOpportunity] = useState<Record<string, BidSubmission[]>>({});
  const [dialog, setDialog] = useState<ManagementDialog | null>(null);
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [dialogNote, setDialogNote] = useState('');
  const [dialogDeadline, setDialogDeadline] = useState('');
  const [awardSupplierName, setAwardSupplierName] = useState('');
  const [awardValue, setAwardValue] = useState('');

  const reportFeedback = (message: string, duration = 5000) => {
    onFeedback(message);
    window.setTimeout(() => onFeedback(''), duration);
  };

  const refreshOpportunities = async () => {
    setOpportunities(await fetchMyOpportunities(organizationId));
  };

  const toggleResponsesPanel = async (opportunityId: string) => {
    if (expandedResponsesId === opportunityId) {
      setExpandedResponsesId(null);
      return;
    }

    setExpandedResponsesId(opportunityId);
    if (responsesByOpportunity[opportunityId]) return;

    try {
      const responses = await fetchOpportunityResponses(opportunityId);
      setResponsesByOpportunity((current) => ({ ...current, [opportunityId]: responses }));
      const bids = await fetchTenderBidSubmissions(opportunityId);
      setBidsByOpportunity((current) => ({ ...current, [opportunityId]: bids }));
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not load responses.'}`);
    }
  };

  const toggleDocumentsPanel = async (opportunityId: string) => {
    if (expandedDocumentsId === opportunityId) {
      setExpandedDocumentsId(null);
      return;
    }

    setExpandedDocumentsId(opportunityId);
    if (documentsByOpportunity[opportunityId]) return;

    try {
      const documents = await fetchOpportunityDocuments(opportunityId);
      setDocumentsByOpportunity((current) => ({ ...current, [opportunityId]: documents }));
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not load documents.'}`);
    }
  };

  const handleUploadDocument = async (opportunityId: string, file?: File) => {
    if (!file) return;

    setUploadingDocumentFor(opportunityId);
    try {
      const document = await uploadOpportunityDocument(
        organizationId,
        opportunityId,
        file,
        documentsArePublic,
      );
      setDocumentsByOpportunity((current) => ({
        ...current,
        [opportunityId]: [...(current[opportunityId] ?? []), document],
      }));
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not upload document.'}`);
    } finally {
      setUploadingDocumentFor(null);
    }
  };

  const handleDeleteDocument = async (opportunityId: string, document: OpportunityDocument) => {
    const previous = documentsByOpportunity[opportunityId] ?? [];
    setDocumentsByOpportunity((current) => ({
      ...current,
      [opportunityId]: previous.filter((item) => item.id !== document.id),
    }));
    try {
      await deleteOpportunityDocument(document);
    } catch (error) {
      setDocumentsByOpportunity((current) => ({ ...current, [opportunityId]: previous }));
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not delete document.'}`);
    }
  };

  const handleDownloadDocument = async (document: OpportunityDocument) => {
    try {
      const url = await getOpportunityDocumentUrl(document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not open document.'}`);
    }
  };

  const handleResubmit = async (id: string) => {
    try {
      await resubmitForReview(id);
      await refreshOpportunities();
      reportFeedback('Resubmitted for admin review.', 4000);
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not resubmit tender.'}`, 4000);
    }
  };

  const openDialog = (type: ManagementDialogType, opportunity: OpportunityListItem) => {
    setDialog({
      type,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
    });
    setDialogNote('');
    setDialogDeadline('');
    setAwardSupplierName('');
    setAwardValue('');
  };

  const handleDialogSubmit = async () => {
    if (!dialog) return;
    setDialogSubmitting(true);

    try {
      if (dialog.type === 'cancel') {
        await cancelOpportunity(dialog.opportunityId, dialogNote);
        await refreshOpportunities();
        reportFeedback('Tender cancelled.', 4000);
      } else if (dialog.type === 'close') {
        await closeOpportunity(dialog.opportunityId);
        setOpportunities((current) => current.map((opportunity) => (
          opportunity.id === dialog.opportunityId
            ? { ...opportunity, statusCode: 'closed', statusLabel: 'Closed' }
            : opportunity
        )));
        reportFeedback('Tender closed.', 4000);
      } else if (dialog.type === 'deadline') {
        await extendDeadline(dialog.opportunityId, new Date(dialogDeadline).toISOString(), dialogNote);
        await refreshOpportunities();
        reportFeedback('Deadline extended.', 4000);
      } else {
        await recordAward(dialog.opportunityId, {
          winningSupplierName: awardSupplierName,
          awardedValue: awardValue ? Number(awardValue) : undefined,
        });
        await refreshOpportunities();
        reportFeedback('Contract award published.', 4000);
      }
      setDialog(null);
    } catch (error) {
      const fallback = dialog.type === 'cancel'
        ? 'Could not cancel tender.'
        : dialog.type === 'close'
          ? 'Could not close tender.'
          : dialog.type === 'deadline'
            ? 'Could not extend deadline.'
            : 'Could not record award.';
      reportFeedback(`Error: ${error instanceof Error ? error.message : fallback}`, 4000);
    } finally {
      setDialogSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
      <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Your Tenders</h4>
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : opportunities.length === 0 ? (
        <p className="text-xs text-slate-400">No tenders submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opportunity) => {
            const canManage = ['published', 'amended', 'deadline_extended'].includes(opportunity.statusCode);
            return (
              <div key={opportunity.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Link to={`/tenders/${opportunity.slug}`} target="_blank" className="font-semibold text-slate-800 text-sm hover:underline">{opportunity.title}</Link>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">Deadline: {new Date(opportunity.submissionDeadline).toLocaleDateString('en-GB')}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                    opportunity.statusCode === 'awaiting_review' ? 'bg-blue-100 text-blue-800' :
                    opportunity.statusCode === 'needs_correction' || opportunity.statusCode === 'rejected' ? 'bg-red-100 text-red-800' :
                    opportunity.statusCode === 'awarded' ? 'bg-purple-100 text-purple-800' :
                    opportunity.statusCode === 'cancelled' || opportunity.statusCode === 'closed' ? 'bg-slate-200 text-slate-600' :
                    'bg-emerald-100 text-emerald-800'
                  }`}>{opportunity.statusLabel}</span>
                </div>

                {opportunity.reviewNote && (opportunity.statusCode === 'needs_correction' || opportunity.statusCode === 'rejected') ? (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2 mt-2">
                    Admin feedback: {opportunity.reviewNote}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-4 mt-3">
                  {opportunity.statusCode === 'needs_correction' ? (
                    <button onClick={() => handleResubmit(opportunity.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Resubmit for Review</button>
                  ) : null}
                  {canManage ? (
                    <>
                      <button onClick={() => openDialog('deadline', opportunity)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Extend Deadline</button>
                      <button onClick={() => openDialog('award', opportunity)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Record Award</button>
                      <button onClick={() => openDialog('close', opportunity)} className="text-xs text-slate-500 hover:underline cursor-pointer">Close</button>
                      <button onClick={() => openDialog('cancel', opportunity)} className="text-xs text-red-600 hover:underline cursor-pointer">Cancel</button>
                    </>
                  ) : null}
                  {opportunity.statusCode === 'closed' ? (
                    <button onClick={() => openDialog('award', opportunity)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Record Award</button>
                  ) : null}
                  <button onClick={() => toggleDocumentsPanel(opportunity.id)} className="text-xs text-slate-500 hover:underline cursor-pointer flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Documents ({documentsByOpportunity[opportunity.id]?.length ?? '…'})
                  </button>
                  <button onClick={() => toggleResponsesPanel(opportunity.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer flex items-center gap-1">
                    <Bell className="h-3 w-3" /> Responses ({responsesByOpportunity[opportunity.id]?.length ?? '…'})
                  </button>
                </div>

                {expandedResponsesId === opportunity.id ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {(responsesByOpportunity[opportunity.id] ?? []).length === 0 ? (
                      <p className="text-xs text-slate-400">No supplier responses yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {(responsesByOpportunity[opportunity.id] ?? []).map((response) => (
                          <div key={response.id} className="flex items-start justify-between gap-3 text-xs bg-slate-50 rounded-lg px-3 py-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-800">{response.orgName || 'A supplier'}</span>
                              {response.note ? <p className="text-slate-500 mt-0.5 italic truncate">“{response.note}”</p> : null}
                            </div>
                            <span className={`shrink-0 font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${response.kind === 'intent_to_bid' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-white border-slate-200'}`}>
                              {response.kind === 'intent_to_bid' ? 'Intent to bid' : 'Interested'}
                            </span>
                          </div>
                        ))}
                        {(bidsByOpportunity[opportunity.id] ?? []).map((bid) => (
                          <div key={bid.id} className="border-2 border-slate-900 bg-white p-3 text-xs">
                            <p className="font-bold">Confidential bid · version {bid.version}</p>
                            {bid.coverNote ? <p className="mt-1 text-slate-600">{bid.coverNote}</p> : null}
                            <div className="mt-2 flex flex-wrap gap-2">{bid.documents.map((document) => <button key={document.id} onClick={async () => window.open(await getBidDocumentUrl(document), '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 border px-2 py-1 font-semibold"><FileText className="h-3 w-3"/>{document.fileName}</button>)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {expandedDocumentsId === opportunity.id ? (
                  <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                    {(documentsByOpportunity[opportunity.id] ?? []).map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <button onClick={() => handleDownloadDocument(document)} className="flex items-center gap-2 text-slate-700 hover:underline cursor-pointer truncate">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{document.fileName}</span>
                          {!document.isPublic ? <span className="text-[9px] uppercase text-amber-600 font-bold shrink-0">Private</span> : null}
                        </button>
                        <button
                          aria-label={`Delete ${document.fileName}`}
                          onClick={() => handleDeleteDocument(opportunity.id, document)}
                          className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={documentsArePublic} onChange={(event) => setDocumentsArePublic(event.target.checked)} />
                        Public (visible to anyone viewing this tender)
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600 hover:underline cursor-pointer w-fit">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingDocumentFor === opportunity.id ? 'Uploading…' : 'Upload Document'}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingDocumentFor === opportunity.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          handleUploadDocument(opportunity.id, file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {dialog ? (
        <ProcurementActionDialog
          title={
            dialog.type === 'cancel' ? 'Cancel tender' :
            dialog.type === 'close' ? 'Close tender' :
            dialog.type === 'deadline' ? 'Extend submission deadline' :
            'Record contract award'
          }
          description={
            dialog.type === 'cancel'
              ? `Cancel “${dialog.opportunityTitle}”. This removes it from active procurement.`
              : dialog.type === 'close'
                ? `Close “${dialog.opportunityTitle}” to stop accepting new responses.`
                : dialog.type === 'deadline'
                  ? `Set a new submission deadline for “${dialog.opportunityTitle}”.`
                  : `Publish the winning supplier for “${dialog.opportunityTitle}”.`
          }
          submitLabel={
            dialog.type === 'cancel' ? 'Cancel tender' :
            dialog.type === 'close' ? 'Close tender' :
            dialog.type === 'deadline' ? 'Extend deadline' :
            'Publish award'
          }
          tone={dialog.type === 'cancel' ? 'danger' : 'primary'}
          submitting={dialogSubmitting}
          onClose={() => setDialog(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void handleDialogSubmit();
          }}
        >
          {dialog.type === 'cancel' ? (
            <div>
              <label htmlFor="tender-cancellation-reason" className="block text-xs font-bold uppercase text-slate-500">Cancellation reason</label>
              <textarea
                id="tender-cancellation-reason"
                required
                rows={4}
                value={dialogNote}
                onChange={(event) => setDialogNote(event.target.value)}
                placeholder="Explain why this tender is being cancelled"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
          ) : dialog.type === 'close' ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Existing tender records and responses will remain available, but suppliers will no longer be able to respond.
            </p>
          ) : dialog.type === 'deadline' ? (
            <>
              <div>
                <label htmlFor="extended-tender-deadline" className="block text-xs font-bold uppercase text-slate-500">New deadline</label>
                <input
                  id="extended-tender-deadline"
                  type="datetime-local"
                  required
                  value={dialogDeadline}
                  onChange={(event) => setDialogDeadline(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="deadline-extension-note" className="block text-xs font-bold uppercase text-slate-500">Reason or note</label>
                <textarea
                  id="deadline-extension-note"
                  rows={3}
                  value={dialogNote}
                  onChange={(event) => setDialogNote(event.target.value)}
                  placeholder="Optional explanation for suppliers"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="award-supplier-name" className="block text-xs font-bold uppercase text-slate-500">Winning supplier or contractor</label>
                <input
                  id="award-supplier-name"
                  type="text"
                  required
                  value={awardSupplierName}
                  onChange={(event) => setAwardSupplierName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="award-value" className="block text-xs font-bold uppercase text-slate-500">Awarded value</label>
                <input
                  id="award-value"
                  type="number"
                  min="0"
                  step="any"
                  value={awardValue}
                  onChange={(event) => setAwardValue(event.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
            </>
          )}
        </ProcurementActionDialog>
      ) : null}
    </div>
  );
}
