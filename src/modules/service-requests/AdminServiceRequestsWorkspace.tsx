import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import {
  addServiceRequestNote,
  fetchAllServiceRequests,
  fetchServiceRequestActivities,
  quoteServiceRequest,
  updateServiceRequestStatus,
  type ServiceRequest,
  type ServiceRequestActivity,
} from '../../lib/procurement/serviceRequestApi';
import { serviceTypeLabels } from './serviceRequestLabels';

interface AdminServiceRequestsWorkspaceProps {
  isPlatformAdmin: boolean;
}

export function AdminServiceRequestsWorkspace({ isPlatformAdmin }: AdminServiceRequestsWorkspaceProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [expandedRequestId, setExpandedRequestId] = useState('');
  const [activities, setActivities] = useState<ServiceRequestActivity[]>([]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    fetchAllServiceRequests()
      .then(setRequests)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not load service requests.';
        setFeedback(`Error: ${message}`);
      })
      .finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  const toggleRequest = async (requestId: string) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId('');
      return;
    }
    setExpandedRequestId(requestId);
    try {
      setActivities(await fetchServiceRequestActivities(requestId));
    } catch {
      setActivities([]);
    }
  };

  const addNote = async (requestId: string, internal: boolean) => {
    const note = window.prompt(internal ? 'Internal note (admin only):' : 'Message to the customer:');
    if (!note) return;
    try {
      await addServiceRequestNote(requestId, note, internal);
      setActivities(await fetchServiceRequestActivities(requestId));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not add note.';
      setFeedback(`Error: ${message}`);
    }
  };

  const addQuote = async (requestId: string) => {
    const amount = window.prompt('Quote amount:');
    if (!amount) return;
    try {
      await quoteServiceRequest(requestId, Number(amount), 'SLE');
      setRequests(await fetchAllServiceRequests());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not save quote.';
      setFeedback(`Error: ${message}`);
    }
  };

  const updateStatus = async (requestId: string, status: string) => {
    try {
      await updateServiceRequestStatus(requestId, status);
      setRequests(await fetchAllServiceRequests());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not update status.';
      setFeedback(`Error: ${message}`);
    }
  };

  if (!isPlatformAdmin) {
    return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">You do not have platform admin access.</div>;
  }

  return (
    <div className="space-y-8 text-left">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-emerald-600" /> Service Requests
        </h3>
        <p className="text-xs text-slate-500 mt-1">Quote, assign, and track bid-support requests. Internal notes are never visible to the requester.</p>
      </div>

      {feedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{feedback}</div>}

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-slate-400">No open service requests.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-800 text-sm">{serviceTypeLabels[request.serviceType]} — {request.orgName}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{request.description}</p>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800 shrink-0">{request.status}</span>
                </div>
                <button onClick={() => toggleRequest(request.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer mt-2">
                  {expandedRequestId === request.id ? 'Hide activity' : 'View activity & notes'}
                </button>
                {expandedRequestId === request.id && (
                  <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                    {activities.map((activity) => (
                      <p key={activity.id} className={`text-xs ${activity.isInternal ? 'text-amber-700 bg-amber-50 rounded p-1.5' : 'text-slate-600'}`}>
                        {activity.isInternal && <strong>[Internal] </strong>}{activity.note}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <button onClick={() => addNote(request.id, false)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">Message Customer</button>
                  <button onClick={() => addNote(request.id, true)} className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer">Internal Note</button>
                  <button onClick={() => addQuote(request.id)} className="text-xs font-semibold text-slate-600 hover:underline cursor-pointer">Add Quote</button>
                  <select value={request.status} onChange={(event) => updateStatus(request.id, event.target.value)} className="text-xs border border-slate-200 rounded-lg p-1 bg-white">
                    <option value="submitted">Submitted</option>
                    <option value="quoted">Quoted</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
