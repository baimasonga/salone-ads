import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Contact, FileSearch, Loader2, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import type { OpportunityDocument } from '../../lib/procurement/opportunityApi';
import {
  analyzeTenderDocument,
  fetchMyTenderDocumentAnalyses,
  type SavedTenderDocumentAnalysis,
} from '../../lib/procurement/documentIntelligenceApi';

interface Props {
  opportunityId: string;
  documents: OpportunityDocument[];
}

const severityStyle = {
  high: 'border-red-200 bg-red-50 text-red-900',
  medium: 'border-amber-200 bg-amber-50 text-amber-900',
  low: 'border-sky-200 bg-sky-50 text-sky-900',
};

export function TenderDocumentIntelligencePanel({ opportunityId, documents }: Props) {
  const [analyses, setAnalyses] = useState<SavedTenderDocumentAnalysis[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(documents[0]?.id ?? '');
  const [busyDocumentId, setBusyDocumentId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyTenderDocumentAnalyses(opportunityId).then(setAnalyses).catch(() => setAnalyses([]));
  }, [opportunityId]);

  useEffect(() => {
    if (!documents.some((doc) => doc.id === selectedDocumentId)) setSelectedDocumentId(documents[0]?.id ?? '');
  }, [documents, selectedDocumentId]);

  const selectedDocument = documents.find((doc) => doc.id === selectedDocumentId) ?? documents[0];
  const analysis = useMemo(
    () => analyses.find((item) => item.documentId === selectedDocument?.id) ?? null,
    [analyses, selectedDocument?.id],
  );

  const runAnalysis = async () => {
    if (!selectedDocument) return;
    setBusyDocumentId(selectedDocument.id);
    setError('');
    try {
      const result = await analyzeTenderDocument(opportunityId, selectedDocument);
      setAnalyses((current) => [result, ...current.filter((item) => item.documentId !== result.documentId)]);
    } catch (err: any) {
      setError(err.message || 'The document could not be analysed.');
    } finally {
      setBusyDocumentId('');
    }
  };

  return (
    <section className="border-2 border-slate-900 bg-white" aria-labelledby="document-intelligence-title">
      <div className="flex flex-col gap-4 border-b-2 border-slate-900 bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Subscriber intelligence</p>
          <h2 id="document-intelligence-title" className="mt-1 flex items-center gap-2 font-display text-lg font-extrabold">
            <FileSearch className="h-5 w-5" /> Tender Document Intelligence
          </h2>
          <p className="mt-1 text-xs text-slate-300">Extract key requirements before deciding whether to bid.</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <select
            value={selectedDocument?.id ?? ''}
            onChange={(event) => setSelectedDocumentId(event.target.value)}
            className="max-w-full border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
            aria-label="Tender document to analyse"
          >
            {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.fileName}</option>)}
          </select>
          <button
            onClick={() => void runAnalysis()}
            disabled={!selectedDocument || !!busyDocumentId}
            className="inline-flex items-center justify-center gap-2 bg-emerald-500 px-4 py-2 text-xs font-extrabold uppercase text-slate-950 disabled:opacity-50"
          >
            {busyDocumentId ? <Loader2 className="h-4 w-4 animate-spin" /> : analysis ? <RefreshCw className="h-4 w-4" /> : <FileSearch className="h-4 w-4" />}
            {busyDocumentId ? 'Reading document…' : analysis ? 'Refresh analysis' : 'Analyse document'}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {!analysis && !busyDocumentId && (
        <div className="p-6 text-sm text-slate-600">
          Choose a readable PDF, DOCX or text document. Hyderra will identify deadlines, eligibility, submission items, financial requirements and possible bid risks.
        </div>
      )}

      {analysis && (
        <div className="space-y-6 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border border-slate-200 p-3"><span className="font-mono text-[10px] uppercase text-slate-500">Confidence</span><strong className="block text-2xl text-slate-950">{analysis.confidence}%</strong></div>
            <div className="border border-slate-200 p-3"><span className="font-mono text-[10px] uppercase text-slate-500">Pages</span><strong className="block text-2xl text-slate-950">{analysis.pageCount ?? '—'}</strong></div>
            <div className="border border-slate-200 p-3"><span className="font-mono text-[10px] uppercase text-slate-500">Analysed</span><strong className="block text-sm text-slate-950">{new Date(analysis.analyzedAt).toLocaleString('en-GB')}</strong></div>
          </div>

          <div>
            <h3 className="font-display text-sm font-extrabold uppercase text-slate-950">Executive summary</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{analysis.executiveSummary || 'No summary was generated.'}</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <InsightList icon={CalendarClock} title="Key deadlines" empty="No deadlines detected." items={analysis.keyDeadlines.map((item) => ({ title: item.label, detail: item.date, evidence: item.evidence }))} />
            <InsightList icon={ShieldCheck} title="Eligibility criteria" empty="No eligibility criteria detected." items={analysis.eligibilityCriteria.map((item) => ({ title: item.requirement, detail: item.mandatory ? 'Marked mandatory' : 'Confirm whether mandatory', evidence: item.evidence }))} />
            <InsightList icon={CheckCircle2} title="Submission checklist" empty="No checklist items detected." items={analysis.submissionChecklist.map((item) => ({ title: item.item, detail: item.category, evidence: item.evidence }))} />
            <InsightList icon={WalletCards} title="Financial requirements" empty="No financial requirements detected." items={analysis.financialRequirements.map((item) => ({ title: item.type, detail: [item.amount, item.currency].filter(Boolean).join(' '), evidence: item.evidence }))} />
          </div>

          <div>
            <h3 className="flex items-center gap-2 font-display text-sm font-extrabold uppercase text-slate-950"><AlertTriangle className="h-4 w-4" /> Bid risks and actions</h3>
            {analysis.risks.length === 0 ? <p className="mt-2 text-sm text-slate-500">No explicit risks were detected. Still review the original document.</p> : (
              <div className="mt-3 space-y-2">{analysis.risks.map((risk, index) => (
                <div key={`${risk.issue}-${index}`} className={`border p-3 ${severityStyle[risk.severity]}`}>
                  <div className="font-mono text-[10px] font-bold uppercase">{risk.severity} risk</div>
                  <p className="mt-1 text-sm font-bold">{risk.issue}</p>
                  {risk.action && <p className="mt-1 text-xs">Action: {risk.action}</p>}
                  {risk.evidence && <p className="mt-2 text-[11px] opacity-75">Evidence: {risk.evidence}</p>}
                </div>
              ))}</div>
            )}
          </div>

          {analysis.contacts.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-display text-sm font-extrabold uppercase text-slate-950"><Contact className="h-4 w-4" /> Tender contacts</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{analysis.contacts.map((contact, index) => (
                <div key={`${contact.email}-${contact.phone}-${index}`} className="border border-slate-200 p-3 text-sm">
                  <p className="font-bold text-slate-900">{contact.name || contact.role || 'Tender contact'}</p>
                  {contact.name && contact.role && <p className="text-xs text-slate-500">{contact.role}</p>}
                  {contact.email && <a href={`mailto:${contact.email}`} className="mt-2 block break-all text-emerald-700 underline">{contact.email}</a>}
                  {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="mt-1 block text-emerald-700 underline">{contact.phone}</a>}
                </div>
              ))}</div>
            </div>
          )}

          {(analysis.sourceTruncated || analysis.limitations.length > 0) && (
            <div className="border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <strong>Limitations:</strong>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {analysis.sourceTruncated && <li>Only the first 30,000 extracted characters were analysed.</li>}
                {analysis.limitations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-slate-500">Advisory analysis only. Verify every deadline, requirement and amount against the original tender document. Hyderra does not guarantee eligibility or award success.</p>
        </div>
      )}
    </section>
  );
}

function InsightList({ icon: Icon, title, items, empty }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: Array<{ title: string; detail: string; evidence: string }>;
  empty: string;
}) {
  return (
    <div className="border border-slate-200 p-4">
      <h3 className="flex items-center gap-2 font-display text-sm font-extrabold uppercase text-slate-950"><Icon className="h-4 w-4 text-emerald-700" /> {title}</h3>
      {items.length === 0 ? <p className="mt-3 text-sm text-slate-500">{empty}</p> : <ul className="mt-3 space-y-3">{items.map((item, index) => (
        <li key={`${item.title}-${index}`} className="border-l-2 border-emerald-500 pl-3">
          <p className="text-sm font-bold text-slate-900">{item.title}</p>
          {item.detail && <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>}
          {item.evidence && <p className="mt-1 text-[11px] text-slate-400">Evidence: {item.evidence}</p>}
        </li>
      ))}</ul>}
    </div>
  );
}
