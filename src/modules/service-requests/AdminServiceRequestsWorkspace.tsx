import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Headphones, Search } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');

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

  const visibleRequests = useMemo(() => requests.filter(request => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || `${request.ticketNumber} ${request.subject} ${request.orgName ?? ''}`.toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'open' ? !['completed', 'cancelled'].includes(request.status) : request.status === statusFilter);
    return matchesSearch && matchesStatus;
  }), [requests, search, statusFilter]);
  const overdueCount = requests.filter(request => request.slaDueAt && new Date(request.slaDueAt) < new Date() && !request.firstRespondedAt && !['completed', 'cancelled'].includes(request.status)).length;

  if (!isPlatformAdmin) {
    return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">You do not have platform admin access.</div>;
  }

  return (
    <div className="space-y-8 text-left">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
          <Headphones className="h-5 w-5 text-emerald-600" /> Customer Support Centre
        </h3>
        <p className="text-xs text-slate-500 mt-1">Manage product-support tickets and paid service requests with SLA visibility. Internal notes are never visible to customers.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-lg"><div className="border p-3"><b className="block text-xl">{requests.filter(request => !['completed', 'cancelled'].includes(request.status)).length}</b><span className="text-[10px] uppercase text-slate-400">Open</span></div><div className="border p-3"><b className="block text-xl text-red-700">{overdueCount}</b><span className="text-[10px] uppercase text-slate-400">SLA overdue</span></div><div className="border p-3"><b className="block text-xl">{requests.filter(request => request.status === 'completed').length}</b><span className="text-[10px] uppercase text-slate-400">Resolved</span></div></div>
      </div>

      {feedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{feedback}</div>}

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search support tickets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ticket, subject or customer" className="w-full pl-10" /></label><select aria-label="Filter support status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="open">Open</option><option value="all">All</option><option value="submitted">Submitted</option><option value="quoted">Quoted</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : visibleRequests.length === 0 ? (
          <p className="text-xs text-slate-400">No open service requests.</p>
        ) : (
          <div className="space-y-4">
            {visibleRequests.map((request) => (
              <div key={request.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-bold text-emerald-700">{request.ticketNumber}</span><span className="bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">{request.requestKind}</span><span className={`px-2 py-0.5 text-[9px] font-bold uppercase ${request.priority === 'urgent' ? 'bg-red-100 text-red-800' : request.priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{request.priority}</span></div>
                    <h4 className="font-semibold text-slate-800 text-sm">{request.subject || serviceTypeLabels[request.serviceType]} — {request.orgName}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{request.description}</p>
                    {request.slaDueAt && <p className={`mt-1 inline-flex items-center gap-1 text-[10px] ${new Date(request.slaDueAt) < new Date() && !request.firstRespondedAt ? 'font-bold text-red-700' : 'text-slate-400'}`}>{new Date(request.slaDueAt) < new Date() && !request.firstRespondedAt ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}SLA {new Date(request.slaDueAt).toLocaleString('en-GB')}</p>}
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
                  {request.customerRating && <span className="text-xs text-amber-700">Customer rating: {request.customerRating}/5</span>}
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
