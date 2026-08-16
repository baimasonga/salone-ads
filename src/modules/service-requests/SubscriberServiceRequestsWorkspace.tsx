import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, Headphones, MessageSquare, Star } from 'lucide-react';
import {
  addServiceRequestNote,
  createSupportTicket,
  createServiceRequest,
  fetchMyServiceRequests,
  fetchServiceRequestActivities,
  rateServiceRequest,
  type ServiceRequest,
  type ServiceRequestActivity,
  type ServiceType,
  type SupportCategory,
  type SupportPriority,
} from '../../lib/procurement/serviceRequestApi';
import { serviceTypeLabels } from './serviceRequestLabels';

interface SubscriberServiceRequestsWorkspaceProps {
  orgId: string;
  isPlatformAdmin: boolean;
}

export function SubscriberServiceRequestsWorkspace({
  orgId,
  isPlatformAdmin,
}: SubscriberServiceRequestsWorkspaceProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('bid_readiness_review');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState('');
  const [activities, setActivities] = useState<ServiceRequestActivity[]>([]);
  const [requestMode, setRequestMode] = useState<'support' | 'service'>('support');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('technical');
  const [priority, setPriority] = useState<SupportPriority>('normal');

  useEffect(() => {
    if (isPlatformAdmin) return;
    setLoading(true);
    fetchMyServiceRequests(orgId)
      .then(setRequests)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not load service requests.';
        setFeedback(`Error: ${message}`);
      })
      .finally(() => setLoading(false));
  }, [isPlatformAdmin, orgId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (requestMode === 'support') await createSupportTicket(orgId, { subject, description, category, priority });
      else await createServiceRequest(orgId, serviceType, description);
      setRequests(await fetchMyServiceRequests(orgId));
      setSubject('');
      setDescription('');
      setFeedback('Request submitted. Our team will follow up shortly.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not submit request.';
      setFeedback(`Error: ${message}`);
    } finally {
      setSubmitting(false);
      window.setTimeout(() => setFeedback(''), 5000);
    }
  };

  const openCount = useMemo(() => requests.filter(request => !['completed', 'cancelled'].includes(request.status)).length, [requests]);

  const reply = async (requestId: string) => {
    const note = window.prompt('Add a message to this ticket:');
    if (!note) return;
    try { await addServiceRequestNote(requestId, note, false); setActivities(await fetchServiceRequestActivities(requestId)); }
    catch (error: any) { setFeedback(`Error: ${error.message || 'Could not add message.'}`); }
  };

  const rate = async (requestId: string, rating: number) => {
    try { await rateServiceRequest(requestId, rating); setRequests(await fetchMyServiceRequests(orgId)); }
    catch (error: any) { setFeedback(`Error: ${error.message || 'Could not save rating.'}`); }
  };

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

  if (isPlatformAdmin) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
        Requesting bid support is subscriber tooling for Tender Publishers/Viewers, not platform admins.
        Use Service Requests under Platform Admin to fulfill subscriber requests.
      </div>
    );
  }

  return (
    <div className="space-y-8 text-left">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <h3 className="flex items-center gap-2 font-display font-bold text-slate-900 text-lg"><Headphones className="h-5 w-5 text-emerald-600" />Customer Support Centre</h3>
        <p className="text-xs text-slate-500 mt-1">Get product help, track conversations and request paid tender assistance from one place.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm"><div className="border border-slate-100 p-3"><b className="block text-xl">{openCount}</b><span className="text-[10px] uppercase text-slate-400">Open tickets</span></div><div className="border border-slate-100 p-3"><b className="block text-xl">{requests.length}</b><span className="text-[10px] uppercase text-slate-400">Total requests</span></div></div>
      </div>

      {feedback && (
        <div className={`text-sm p-4 rounded-xl font-semibold ${feedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
          {feedback}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex gap-2"><button type="button" onClick={() => setRequestMode('support')} className={`px-3 py-2 text-xs font-bold ${requestMode === 'support' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Product support</button><button type="button" onClick={() => setRequestMode('service')} className={`px-3 py-2 text-xs font-bold ${requestMode === 'service' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Managed tender service</button></div>
        {requestMode === 'support' ? <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase text-slate-500">Category<select value={category} onChange={event => setCategory(event.target.value as SupportCategory)} className="mt-1 w-full"><option value="technical">Technical problem</option><option value="billing">Billing</option><option value="account">Account & login</option><option value="tender_access">Tender access</option><option value="data_correction">Data correction</option><option value="feedback">Feedback</option><option value="other">Other</option></select></label>
          <label className="text-xs font-bold uppercase text-slate-500">Priority<select value={priority} onChange={event => setPriority(event.target.value as SupportPriority)} className="mt-1 w-full"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label className="text-xs font-bold uppercase text-slate-500 sm:col-span-2">Subject<input required value={subject} onChange={event => setSubject(event.target.value)} maxLength={180} className="mt-1 w-full" /></label>
        </div> : (
        <div>
          <label htmlFor="service-request-type" className="block text-xs font-bold text-slate-500 uppercase">Service Needed</label>
          <select
            id="service-request-type"
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value as ServiceType)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          >
            {Object.entries(serviceTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        )}
        <div>
          <label htmlFor="service-request-description" className="block text-xs font-bold text-slate-500 uppercase">Describe What You Need</label>
          <textarea
            id="service-request-description"
            required
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          />
        </div>
        <button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer disabled:opacity-50">
          {submitting ? 'Submitting…' : requestMode === 'support' ? 'Create Support Ticket' : 'Submit Service Request'}
        </button>
      </form>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Your Requests</h4>
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-slate-400">No requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="border border-slate-100 rounded-xl p-4">
                <button onClick={() => toggleRequest(request.id)} className="w-full flex items-center justify-between gap-4 cursor-pointer text-left">
                  <div>
                    <span className="font-semibold text-slate-800 text-sm block">{request.subject || serviceTypeLabels[request.serviceType]}</span>
                    <span className="text-xs text-slate-500">{request.ticketNumber} · {new Date(request.createdAt).toLocaleDateString('en-GB')}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {request.quoteAmount !== null && <span className="text-xs font-mono text-slate-600">{request.quoteCurrency} {request.quoteAmount.toLocaleString()}</span>}
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800">{request.status}</span>
                  </div>
                </button>
                {expandedRequestId === request.id && (
                  <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                    {activities.length === 0 ? (
                      <p className="text-xs text-slate-400">No updates yet.</p>
                    ) : (
                      activities.map((activity) => (
                        <p key={activity.id} className="text-xs text-slate-600">
                          <span className="font-mono text-slate-400">{new Date(activity.createdAt).toLocaleDateString('en-GB')}:</span> {activity.note}
                        </p>
                      ))
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-2"><button onClick={() => void reply(request.id)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><MessageSquare className="h-3.5 w-3.5" />Add message</button>{request.slaDueAt && !['completed', 'cancelled'].includes(request.status) && <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Clock3 className="h-3 w-3" />Target response {new Date(request.slaDueAt).toLocaleString('en-GB')}</span>}</div>
                    {request.status === 'completed' && <div className="flex items-center gap-1 pt-2"><span className="mr-2 text-xs text-slate-500">Rate support:</span>{[1, 2, 3, 4, 5].map(value => <button key={value} aria-label={`Rate ${value} stars`} onClick={() => void rate(request.id, value)}><Star className={`h-4 w-4 ${value <= (request.customerRating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
