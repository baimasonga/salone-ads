import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Bookmark, BookmarkCheck, FileText, ExternalLink, Trophy, History, UserPlus, UserCheck, Sparkle, Handshake, Users, Check } from 'lucide-react';
import {
  fetchOpportunityBySlug,
  fetchOpportunityDocuments,
  getOpportunityDocumentUrl,
  fetchAward,
  fetchAmendments,
  fetchCurrencies,
  isOpportunitySaved,
  setOpportunitySaved,
  incrementOpportunityView,
  OpportunityDetail,
  OpportunityDocument,
  OpportunityAward,
  OpportunityAmendment,
  CurrencyOption,
} from '../lib/procurement/opportunityApi';
import {
  isFollowingBuyer,
  setFollowingBuyer,
} from '../lib/procurement/savedSearchApi';
import {
  aiExplainTender,
  fetchMyOrgId,
  hasFeature,
  fetchMyResponse,
  submitResponse,
  withdrawResponse,
  fetchResponseCount,
  OpportunityResponse,
  ResponseKind,
} from '../lib/procurementApi';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from '../lib/i18n';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatMoney(value: number, currencyCode: string | null, currencies: CurrencyOption[]): string {
  const symbol = currencies.find((c) => c.code === currencyCode)?.symbol ?? currencyCode ?? '';
  return `${symbol} ${value.toLocaleString()}`.trim();
}

const MAX_RESPONSE_NOTE_LENGTH = 500;
const RESPONSE_OPEN_STATUSES = new Set(['published', 'amended', 'deadline_extended']);

export function TenderDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [documents, setDocuments] = useState<OpportunityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [award, setAward] = useState<OpportunityAward | null>(null);
  const [amendments, setAmendments] = useState<OpportunityAmendment[]>([]);
  const [followingBuyer, setFollowingBuyerState] = useState(false);
  const [followToggling, setFollowToggling] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiExplaining, setAiExplaining] = useState(false);
  const [aiError, setAiError] = useState('');
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [canRespond, setCanRespond] = useState(false);
  const [myResponse, setMyResponse] = useState<OpportunityResponse | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [respondNote, setRespondNote] = useState('');
  const [respondBusy, setRespondBusy] = useState(false);
  const [responseNotice, setResponseNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { lang, setLang, t } = useLanguage();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    fetchOpportunityBySlug(slug)
      .then(async (op) => {
        if (!op) {
          setError(t('notFound'));
          return;
        }
        setOpportunity(op);
        incrementOpportunityView(op.id);
        const [docs, session, awardInfo, amendmentHistory, currencyList] = await Promise.all([
          fetchOpportunityDocuments(op.id),
          supabase.auth.getSession(),
          fetchAward(op.id),
          fetchAmendments(op.id),
          fetchCurrencies(),
        ]);
        setDocuments(docs);
        setCurrencies(currencyList);
        setAward(awardInfo);
        setAmendments(amendmentHistory);
        setResponseCount(await fetchResponseCount(op.id));
        const authed = !!session.data.session;
        setIsAuthed(authed);
        if (authed) {
          setSaved(await isOpportunitySaved(op.id));
          if (op.buyerOrgId) {
            setFollowingBuyerState(await isFollowingBuyer(op.buyerOrgId));
          }
          const orgId = await fetchMyOrgId();
          setMyOrgId(orgId);
          if (orgId) {
            const [entitledViewer, entitledPublisher, existing] = await Promise.all([
              hasFeature(orgId, 'tender_alerts_and_details').catch(() => false),
              hasFeature(orgId, 'tender_publishing').catch(() => false),
              fetchMyResponse(op.id, orgId).catch(() => null),
            ]);
            setCanRespond(entitledViewer || entitledPublisher);
            setMyResponse(existing && existing.status === 'active' ? existing : null);
            if (existing?.note) setRespondNote(existing.note);
          }
        }
      })
      .catch((err: any) => setError(err.message || 'Could not load this tender.'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleExplainTender = async () => {
    if (!opportunity) return;
    setAiExplaining(true);
    setAiError('');
    try {
      const text = `${opportunity.title}. ${opportunity.summary || ''} ${opportunity.description || ''}`.slice(0, 1800);
      setAiExplanation(await aiExplainTender(text));
    } catch (err: any) {
      setAiError(err.message || 'Could not generate an explanation.');
    } finally {
      setAiExplaining(false);
    }
  };

  const handleOpenDocument = async (doc: OpportunityDocument) => {
    try {
      const url = await getOpportunityDocumentUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* non-critical */
    }
  };

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

  const toggleFollow = async () => {
    if (!opportunity?.buyerOrgId || !isAuthed) return;
    setFollowToggling(true);
    const next = !followingBuyer;
    try {
      await setFollowingBuyer(opportunity.buyerOrgId, next);
      setFollowingBuyerState(next);
    } catch {
      /* keep prior state on failure */
    } finally {
      setFollowToggling(false);
    }
  };

  const isStatusClosed = !!opportunity && !RESPONSE_OPEN_STATUSES.has(opportunity.statusCode);
  const isDeadlinePassed = !!opportunity?.submissionDeadline && new Date(opportunity.submissionDeadline).getTime() < Date.now();
  const isClosed = isStatusClosed || isDeadlinePassed;

  const handleRespond = async (kind: ResponseKind) => {
    if (!opportunity || !myOrgId) return;
    const note = respondNote.trim();
    if (!isOnline) {
      setResponseNotice({ kind: 'error', message: 'You are offline. Reconnect to the internet and try again.' });
      return;
    }
    if (isClosed) {
      setResponseNotice({ kind: 'error', message: 'This tender is no longer accepting responses.' });
      return;
    }
    if (note.length > MAX_RESPONSE_NOTE_LENGTH) {
      setResponseNotice({ kind: 'error', message: `Your note must be ${MAX_RESPONSE_NOTE_LENGTH} characters or fewer.` });
      return;
    }
    setRespondBusy(true);
    setResponseNotice(null);
    try {
      const res = await submitResponse({ opportunityId: opportunity.id, orgId: myOrgId, kind, note: note || null });
      const wasNew = !myResponse;
      setMyResponse(res);
      if (wasNew) setResponseCount((c) => c + 1);
      setResponseNotice({
        kind: 'success',
        message: kind === 'intent_to_bid' ? 'Your intent to bid was registered.' : 'Your interest was registered.',
      });
    } catch (err: any) {
      setResponseNotice({ kind: 'error', message: err.message || 'Your response could not be submitted. Please try again.' });
    } finally {
      setRespondBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!myResponse) return;
    if (!isOnline) {
      setResponseNotice({ kind: 'error', message: 'You are offline. Reconnect to the internet and try again.' });
      return;
    }
    if (!window.confirm('Withdraw this tender response? The buyer will no longer see it as active.')) return;
    setRespondBusy(true);
    setResponseNotice(null);
    try {
      await withdrawResponse(myResponse.id);
      setMyResponse(null);
      setResponseCount((c) => Math.max(0, c - 1));
      setResponseNotice({ kind: 'success', message: 'Your tender response was withdrawn.' });
    } catch (err: any) {
      setResponseNotice({ kind: 'error', message: err.message || 'Your response could not be withdrawn. Please try again.' });
    } finally {
      setRespondBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] border-4 md:border-8 border-[#0F172A]">
      <header className="bg-white border-b border-[#0F172A] px-6 py-4 flex items-center justify-between">
        <Link to="/tenders" className="flex items-center gap-2 text-[#0F172A] font-display font-black tracking-widest uppercase text-sm">
          <ArrowLeft className="h-4 w-4" /> {t('backToTenders')}
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center border border-slate-200 text-[10px] font-mono uppercase tracking-widest">
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 cursor-pointer ${lang === 'en' ? 'bg-[#0F172A] text-white' : 'text-slate-500'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('fr')}
              className={`px-2 py-1 cursor-pointer ${lang === 'fr' ? 'bg-[#0F172A] text-white' : 'text-slate-500'}`}
            >
              FR
            </button>
          </div>
          <Link to="/?auth=signin" className="text-xs font-mono uppercase tracking-widest text-emerald-700 hover:underline">
            {t('signIn')}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 text-left">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> {t('loadingTender')}
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
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={toggleSave}
                      disabled={savingToggle}
                      className="btn-geometric-secondary flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                      {saved ? t('saved') : t('save')}
                    </button>
                    {opportunity.buyerOrgId && (
                      <button
                        onClick={toggleFollow}
                        disabled={followToggling}
                        className="btn-geometric-secondary flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {followingBuyer ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                        {followingBuyer ? t('followingBuyer') : t('followBuyer')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-xs font-mono">
                <div>
                  <span className="text-slate-400 uppercase block">{t('reference')}</span>
                  <span className="text-slate-700">{opportunity.referenceNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">{t('noticeType')}</span>
                  <span className="text-slate-700">{opportunity.opportunityType || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">{t('procurementMethod')}</span>
                  <span className="text-slate-700">{opportunity.procurementMethod || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">{t('sector')}</span>
                  <span className="text-slate-700">{opportunity.sector || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase block">{t('location')}</span>
                  <span className="text-slate-700">{[opportunity.district, opportunity.country].filter(Boolean).join(', ') || '—'}</span>
                </div>
                {opportunity.estimatedValue !== null && (
                  <div>
                    <span className="text-slate-400 uppercase block">{t('estimatedValue')}</span>
                    <span className="text-slate-700">{formatMoney(opportunity.estimatedValue, opportunity.currencyCode, currencies)}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 uppercase block">{t('submissionDeadline')}</span>
                  <span className="text-red-700 font-bold">{formatDate(opportunity.submissionDeadline)}</span>
                </div>
              </div>
            </div>

            {/* Respond to this tender — express interest / signal intent to bid */}
            <div className="bg-white border-2 border-[#0F172A] p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-emerald-600" /> Respond to this tender
                </h2>
                {responseCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500">
                    <Users className="h-3.5 w-3.5" /> {responseCount} supplier{responseCount === 1 ? '' : 's'} responded
                  </span>
                )}
              </div>

              {!isOnline && (
                <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 mt-3">
                  You are offline. Tender details remain visible, but responses are disabled until you reconnect.
                </p>
              )}
              {responseNotice && (
                <p
                  role={responseNotice.kind === 'error' ? 'alert' : 'status'}
                  className={`text-xs border p-2.5 mt-3 ${
                    responseNotice.kind === 'error'
                      ? 'text-red-700 bg-red-50 border-red-200'
                      : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                  }`}
                >
                  {responseNotice.message}
                </p>
              )}

              {isClosed ? (
                <p className="text-sm text-slate-500 mt-3">
                  {isDeadlinePassed
                    ? 'The submission deadline has passed and this tender is not accepting responses.'
                    : `This tender is ${opportunity.statusLabel.toLowerCase()} and is not accepting responses.`}
                </p>
              ) : !isAuthed ? (
                <p className="text-sm text-slate-600 mt-3">
                  <Link to="/?auth=signin" className="text-emerald-700 font-semibold hover:underline">Sign in</Link> with a subscribed account to register your interest or intent to bid.
                </p>
              ) : !myOrgId ? (
                <p className="text-sm text-slate-600 mt-3">Set up your organisation profile to respond to tenders.</p>
              ) : !canRespond ? (
                <p className="text-sm text-slate-600 mt-3">Responding to tenders needs a <span className="font-semibold">Viewer or Publisher</span> subscription. Ask our team to activate one for your organisation.</p>
              ) : myResponse ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-semibold">
                      You’ve registered {myResponse.kind === 'intent_to_bid' ? 'intent to bid' : 'interest'} on this tender.
                    </span>
                  </div>
                  {myResponse.note && <p className="text-xs text-slate-500 mt-1.5 italic">“{myResponse.note}”</p>}
                  <p className="text-xs text-slate-500 mt-2">The buyer can see your organisation in their responses list. Prepare your bid before the deadline.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {myResponse.kind === 'interest' && (
                      <button onClick={() => handleRespond('intent_to_bid')} disabled={respondBusy || !isOnline} className="btn-geometric flex items-center gap-2 cursor-pointer disabled:opacity-50">
                        Upgrade to intent to bid
                      </button>
                    )}
                    <button onClick={handleWithdraw} disabled={respondBusy || !isOnline} className="btn-geometric-secondary cursor-pointer disabled:opacity-50">Withdraw</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-slate-600">Let the buyer know your organisation is in the running — and keep this tender on your dashboard.</p>
                  <textarea
                    value={respondNote}
                    onChange={(e) => setRespondNote(e.target.value)}
                    maxLength={MAX_RESPONSE_NOTE_LENGTH}
                    placeholder="Optional note to the buyer (capabilities, questions, partnership interest)…"
                    rows={2}
                    className="mt-3 w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 font-mono text-right mt-1">
                    {respondNote.length}/{MAX_RESPONSE_NOTE_LENGTH}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => handleRespond('intent_to_bid')} disabled={respondBusy || !isOnline} className="btn-geometric flex items-center gap-2 cursor-pointer disabled:opacity-50">
                      <Handshake className="h-4 w-4" /> {respondBusy ? 'Submitting…' : 'Intent to bid'}
                    </button>
                    <button onClick={() => handleRespond('interest')} disabled={respondBusy || !isOnline} className="btn-geometric-secondary flex items-center gap-2 cursor-pointer disabled:opacity-50">
                      Express interest
                    </button>
                  </div>
                </div>
              )}
            </div>

            {opportunity.summary && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-2">{t('summary')}</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{opportunity.summary}</p>
              </div>
            )}

            {opportunity.description && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-2">{t('description')}</h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{opportunity.description}</p>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-100 p-6">
              {!aiExplanation ? (
                <button onClick={handleExplainTender} disabled={aiExplaining} className="text-sm font-semibold text-emerald-700 hover:underline cursor-pointer flex items-center gap-2 disabled:opacity-50">
                  <Sparkle className="h-4 w-4" /> {aiExplaining ? t('thinking') : t('explainTender')}
                </button>
              ) : (
                <>
                  <h2 className="font-display font-bold text-emerald-900 text-sm uppercase mb-2 flex items-center gap-2"><Sparkle className="h-4 w-4" /> {t('aiExplanation')}</h2>
                  <p className="text-sm text-emerald-900 leading-relaxed">{aiExplanation}</p>
                  <p className="text-[10px] text-emerald-600 mt-2">{t('aiDisclaimer')}</p>
                </>
              )}
              {aiError && <p className="text-xs text-red-600 mt-2">{aiError}</p>}
            </div>

            {!opportunity.hasFullAccess && (
              <div className="bg-[#0F172A] text-white p-6 text-center space-y-3">
                <h2 className="font-display font-bold text-sm uppercase">{t('subscribeToViewTitle')}</h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">{t('subscribeToViewBody')}</p>
                <Link to="/#pricing" className="inline-block bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-semibold px-6 py-2.5 text-sm">
                  {t('viewPlans')}
                </Link>
              </div>
            )}

            {(opportunity.eligibilityRequirements || opportunity.bidSecurity || opportunity.applicationFee) && (
              <div className="bg-white border border-slate-200 p-6 space-y-3">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase">{t('eligibility')}</h2>
                {opportunity.eligibilityRequirements && <p className="text-sm text-slate-700">{opportunity.eligibilityRequirements}</p>}
                {opportunity.bidSecurity && <p className="text-xs text-slate-500 font-mono">Bid Security: {opportunity.bidSecurity}</p>}
                {opportunity.applicationFee && <p className="text-xs text-slate-500 font-mono">Application Fee: {opportunity.applicationFee}</p>}
              </div>
            )}

            {(opportunity.contactDetails || opportunity.submissionInstructions) && (
              <div className="bg-white border border-slate-200 p-6 space-y-3">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase">{t('howToApply')}</h2>
                {opportunity.submissionInstructions && <p className="text-sm text-slate-700 whitespace-pre-line">{opportunity.submissionInstructions}</p>}
                {opportunity.contactDetails && <p className="text-xs text-slate-500 font-mono">Contact: {opportunity.contactDetails}</p>}
              </div>
            )}

            {documents.length > 0 && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-3">{t('documents')}</h2>
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li key={doc.id}>
                      <button
                        onClick={() => handleOpenDocument(doc)}
                        className="flex items-center gap-2 text-sm text-slate-700 hover:underline cursor-pointer"
                      >
                        <FileText className="h-4 w-4 text-slate-400" /> {doc.fileName}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {award && (
              <div className="bg-purple-50 border border-purple-200 p-6 space-y-2">
                <h2 className="font-display font-bold text-purple-900 text-sm uppercase flex items-center gap-2">
                  <Trophy className="h-4 w-4" /> {t('contractAward')}
                </h2>
                <p className="text-sm text-purple-900"><strong>{award.winningSupplierName}</strong></p>
                {award.awardedValue !== undefined && (
                  <p className="text-xs text-purple-700 font-mono">
                    Awarded Value: {formatMoney(award.awardedValue, award.currencyCode ?? null, currencies)}
                  </p>
                )}
                {award.awardDate && <p className="text-xs text-purple-700 font-mono">Award Date: {formatDate(award.awardDate)}</p>}
                {award.notes && <p className="text-sm text-purple-800">{award.notes}</p>}
              </div>
            )}

            {amendments.length > 0 && (
              <div className="bg-white border border-slate-200 p-6">
                <h2 className="font-display font-bold text-slate-900 text-sm uppercase mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" /> {t('amendmentHistory')}
                </h2>
                <ul className="space-y-2">
                  {amendments.map((a) => (
                    <li key={a.id} className="text-xs text-slate-600 border-l-2 border-slate-200 pl-3">
                      <span className="font-mono text-slate-400">{formatDate(a.createdAt)}:</span> {a.summary}
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
                <ExternalLink className="h-3.5 w-3.5" /> {t('viewSource')}{opportunity.sourceName ? `: ${opportunity.sourceName}` : ''}
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
