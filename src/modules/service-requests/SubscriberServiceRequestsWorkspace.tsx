import { useEffect, useState, type FormEvent } from 'react';
import {
  createServiceRequest,
  fetchMyServiceRequests,
  fetchServiceRequestActivities,
  type ServiceRequest,
  type ServiceRequestActivity,
  type ServiceType,
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
      await createServiceRequest(orgId, serviceType, description);
      setRequests(await fetchMyServiceRequests(orgId));
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
        <h3 className="font-display font-bold text-slate-900 text-lg">Support Services</h3>
        <p className="text-xs text-slate-500 mt-1">Request paid, human-assisted help — separate from our AI Content Studio, these are performed by our team.</p>
      </div>

      {feedback && (
        <div className={`text-sm p-4 rounded-xl font-semibold ${feedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
          {feedback}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase">Service Needed</label>
          <select
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value as ServiceType)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          >
            {Object.entries(serviceTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase">Describe What You Need</label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          />
        </div>
        <button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit Request'}
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
                    <span className="font-semibold text-slate-800 text-sm block">{serviceTypeLabels[request.serviceType]}</span>
                    <span className="text-xs text-slate-500">{new Date(request.createdAt).toLocaleDateString('en-GB')}</span>
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
