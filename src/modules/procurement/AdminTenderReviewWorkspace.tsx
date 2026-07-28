import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ShieldAlert } from 'lucide-react';
import {
  approveOpportunity,
  fetchOpportunitiesForReview,
  findSimilarTitledOpportunities,
  rejectOpportunity,
  requestCorrection,
  setOpportunityFeatured,
  type ReviewQueueItem,
} from '../../lib/procurementApi';

type ReviewAction = 'approve' | 'feature' | 'correction' | 'reject';

interface ActiveReviewAction {
  opportunityId: string;
  action: ReviewAction;
}

function errorMessage(error: unknown, fallback: string): string {
  return `Error: ${error instanceof Error ? error.message : fallback}`;
}

export function AdminTenderReviewWorkspace() {
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<string, string[]>>({});
  const [activeAction, setActiveAction] = useState<ActiveReviewAction | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadQueue = async () => {
      setLoading(true);
      try {
        const items = await fetchOpportunitiesForReview();
        const warningEntries = await Promise.all(items.map(async (item) => [
          item.id,
          await findSimilarTitledOpportunities(item.title, item.id).catch(() => []),
        ] as const));

        if (!cancelled) {
          setReviewQueue(items);
          setDuplicateWarnings(Object.fromEntries(warningEntries));
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback(errorMessage(error, 'Could not load review queue.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadQueue();
    return () => {
      cancelled = true;
    };
  }, []);

  const removeOptimistically = async (
    opportunityId: string,
    action: ReviewAction,
    operation: () => Promise<void>,
    fallback: string,
  ) => {
    const previous = reviewQueue;
    setActiveAction({ opportunityId, action });
    setFeedback('');
    setReviewQueue((current) => current.filter((item) => item.id !== opportunityId));

    try {
      await operation();
    } catch (error) {
      setReviewQueue(previous);
      setFeedback(errorMessage(error, fallback));
    } finally {
      setActiveAction(null);
    }
  };

  const handleApprove = (opportunityId: string) => removeOptimistically(
    opportunityId,
    'approve',
    () => approveOpportunity(opportunityId),
    'Could not approve tender.',
  );

  const handleApproveAndFeature = (opportunityId: string) => removeOptimistically(
    opportunityId,
    'feature',
    async () => {
      await setOpportunityFeatured(opportunityId, true);
      try {
        await approveOpportunity(opportunityId);
      } catch (error) {
        await setOpportunityFeatured(opportunityId, false).catch(() => undefined);
        throw error;
      }
    },
    'Could not feature and approve tender.',
  );

  const handleRequestCorrection = (opportunityId: string) => {
    const note = window.prompt('What needs to be corrected?');
    if (!note) return;
    void removeOptimistically(
      opportunityId,
      'correction',
      () => requestCorrection(opportunityId, note),
      'Could not request correction.',
    );
  };

  const handleReject = (opportunityId: string) => {
    const note = window.prompt('Reason for rejecting this tender:');
    if (!note) return;
    void removeOptimistically(
      opportunityId,
      'reject',
      () => rejectOpportunity(opportunityId, note),
      'Could not reject tender.',
    );
  };

  return (
    <div className="space-y-8 text-left">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-emerald-600" /> Tender Review Queue
        </h3>
        <p className="text-xs text-slate-500 mt-1">Approve, request corrections, or reject tenders submitted by buyers before they go public.</p>
      </div>

      {feedback ? (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{feedback}</div>
      ) : null}

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        {loading ? (
          <p className="text-xs text-slate-400">Loading review queue…</p>
        ) : reviewQueue.length === 0 ? (
          <p className="text-xs text-slate-400">No tenders awaiting review. Nice and clear.</p>
        ) : (
          <div className="space-y-4">
            {reviewQueue.map((opportunity) => {
              const actionInProgress = activeAction?.opportunityId === opportunity.id;
              return (
                <div key={opportunity.id} className="border border-slate-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-sm">{opportunity.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{opportunity.buyerName} · Submitted {new Date(opportunity.createdAt).toLocaleDateString('en-GB')}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${opportunity.statusCode === 'needs_correction' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                      {opportunity.statusLabel}
                    </span>
                  </div>

                  {duplicateWarnings[opportunity.id]?.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Possibly similar to: {duplicateWarnings[opportunity.id].join('; ')}</span>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-4 flex-wrap">
                    <button
                      disabled={actionInProgress}
                      onClick={() => void handleApprove(opportunity.id)}
                      className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      disabled={actionInProgress}
                      onClick={() => void handleApproveAndFeature(opportunity.id)}
                      className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Approve &amp; Feature
                    </button>
                    <button
                      disabled={actionInProgress}
                      onClick={() => handleRequestCorrection(opportunity.id)}
                      className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Request Correction
                    </button>
                    <button
                      disabled={actionInProgress}
                      onClick={() => handleReject(opportunity.id)}
                      className="text-xs font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <Link to={`/tenders/${opportunity.slug}`} target="_blank" className="text-xs text-slate-400 hover:underline ml-auto">Preview</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
