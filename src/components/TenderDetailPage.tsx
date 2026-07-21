import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Bookmark, BookmarkCheck, FileText, ExternalLink } from 'lucide-react';
import {
  fetchOpportunityBySlug,
  fetchOpportunityDocuments,
  isOpportunitySaved,
  setOpportunitySaved,
  OpportunityDetail,
  OpportunityDocument,
} from '../lib/procurementApi';
import { supabase } from '../lib/supabaseClient';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function TenderDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [documents, setDocuments] = useState<OpportunityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    fetchOpportunityBySlug(slug)
      .then(async (op) => {
        if (!op) {
          setError('This tender could not be found, or is no longer public.');
          return;
        }
        setOpportunity(op);
        const [docs, session] = await Promise.all([
          fetchOpportunityDocuments(op.id),
          supabase.auth.getSession(),
        ]);
        setDocuments(docs);
        const authed = !!session.data.session;
        setIsAuthed(authed);
        if (authed) {
          setSaved(await isOpportunitySaved(op.id));
        }
      })
      .catch((err: any) => setError(err.message || 'Could not load this tender.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleSave = async () => {
    if (!opportunity || !isAuthed) return;
    setSavingToggle(true);
    const next = !saved;
    try {
      await setOpportunitySaved(opportunity.id, next);
      setSaved(next);
    } catch {
      /* keep prior state on failure */
    } finally {
      setSavingToggle(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] border-4 md:border-8 border-[#0F172A]">
      <header className="bg-white border-b border-[#0F172A] px-6 py-4 flex items-center justify-between">
        <Link to="/tenders" className="flex items-center gap-2 text-[#0F172A] font-display font-black tracking-widest uppercase text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to Tenders
        </Link>
        <Link to="/" className="text-xs font-mono uppercase tracking-widest text-emerald-700 hover:underline">
          Sign In / Get Started
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 text-left">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading tender…
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4">{error}</div>
        )}

        {!loading && opportunity && (
          <div className="space-y-6">
            <div className="bg-white border border-[#0F172A] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="bg-[#0F172A] text-white text-[10px] font-mono font-bold px-2.5 py-1 uppercase tracking-wider">
                    {opportunity.statusLabel}
                  </span>
                  <h1 className="font-display font-black text-xl text-[#0F172A] mt-3">{opportunity.title}</h1>
                  <p className="text-sm text-slate-500 mt-1">{opportunity.buyerName}</p>
                </div>
                {isAuthed && (
                  <button
                    onClick={toggleSave}
                    disabled={savingToggle}
                    className="btn-geometric-secondary flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    {saved ? 'Saved' : 'Save'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-xs font-mono">
                <div>
                  <span className="text-slate-400 uppercase block">Reference</span>
                  <span className="text-slate-700">{opportunity.referenceNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">Notice Type</span>
                  <span className="text-slate-700">{opportunity.opportunityType || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">Procurement Method</span>
                  <span className="text-slate-700">{opportunity.procurementMethod || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">Sector</span>
                  <span className="text-slate-700">{opportunity.sector || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">Location</span>
                  <span className="text-slate-700">{[opportunity.district, opportunity.country].filter(Boolean).join(', ') || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">Submission Deadline</span>
                  <span className="text-red-700 font-bold">{formatDate(opportunity.submissionDeadline)}</span>
                </div>
              </div>
            </div>

            {opportunity.summary && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-2">Summary</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{opportunity.summary}</p>
              </div>
            )}

            {opportunity.description && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-2">Description</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{opportunity.description}</p>
              </div>
            )}

            {(opportunity.eligibilityRequirements || opportunity.bidSecurity || opportunity.applicationFee) && (
              <div className="bg-white border border-slate-200 p-6 space-y-3">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase">Eligibility & Requirements</h2>
                {opportunity.eligibilityRequirements && <p className="text-sm text-slate-700">{opportunity.eligibilityRequirements}</p>}
                {opportunity.bidSecurity && <p className="text-xs text-slate-500 font-mono">Bid Security: {opportunity.bidSecurity}</p>}
                {opportunity.applicationFee && <p className="text-xs text-slate-500 font-mono">Application Fee: {opportunity.applicationFee}</p>}
              </div>
            )}

            {(opportunity.contactDetails || opportunity.submissionInstructions) && (
              <div className="bg-white border border-slate-200 p-6 space-y-3">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase">How to Apply</h2>
                {opportunity.submissionInstructions && <p className="text-sm text-slate-700 whitespace-pre-line">{opportunity.submissionInstructions}</p>}
                {opportunity.contactDetails && <p className="text-xs text-slate-500 font-mono">Contact: {opportunity.contactDetails}</p>}
              </div>
            )}

            {documents.length > 0 && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-3">Documents</h2>
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <FileText className="h-4 w-4 text-slate-400" /> {doc.fileName}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {opportunity.sourceUrl && (
              <a
                href={opportunity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-mono text-emerald-700 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View original source{opportunity.sourceName ? `: ${opportunity.sourceName}` : ''}
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
