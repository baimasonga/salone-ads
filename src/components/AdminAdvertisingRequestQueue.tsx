import { Landmark } from 'lucide-react';
import type { AdvertisementRequest, UpdateAdvertisementReportInput } from '../lib/procurementApi';

interface AdminAdvertisingRequestQueueProps {
  feedback: string;
  loading: boolean;
  requests: AdvertisementRequest[];
  onUpdate: (id: string, updates: UpdateAdvertisementReportInput) => void | Promise<void>;
  onLoadIntoPublisher: (request: AdvertisementRequest) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business', event: 'Event', goods: 'Goods', service: 'Service',
};

export function AdminAdvertisingRequestQueue({
  feedback, loading, requests, onUpdate, onLoadIntoPublisher,
}: AdminAdvertisingRequestQueueProps) {
  return <>
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
        <Landmark className="h-5 w-5 text-emerald-600" /> Advertising Requests
      </h3>
      <p className="mt-1 text-xs text-slate-500">Fulfillment queue for subscriber advert requests — update status and report reach/run data once the advert is live.</p>
    </div>

    {feedback && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{feedback}</div>}

    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
      {loading ? <p className="text-xs text-slate-400">Loading…</p> : requests.length === 0 ?
        <p className="text-xs text-slate-400">No advertising requests yet.</p> :
        <div className="space-y-4">{requests.map((advert) =>
          <div key={advert.id} className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                {advert.mediaUrl && <a href={advert.mediaUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Attached photo — open full size">
                  <img src={advert.mediaUrl} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
                </a>}
                <div className="min-w-0"><h4 className="text-sm font-semibold text-slate-800">{advert.subject} — {advert.orgName}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">{CATEGORY_LABELS[advert.category]}: {advert.description}</p></div>
              </div>
              <select value={advert.status} onChange={(event) => void onUpdate(advert.id, { status: event.target.value as AdvertisementRequest['status'] })}
                className="shrink-0 rounded-lg border border-slate-200 bg-white p-1 text-xs">
                <option value="submitted">Submitted</option><option value="in_production">In Production</option>
                <option value="live">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button onClick={() => onLoadIntoPublisher(advert)} className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Load into publisher →</button>
              <button onClick={() => { const value=prompt('Platform(s) the advert ran on:',advert.platform??'');if(value!==null)void onUpdate(advert.id,{platform:value}); }} className="cursor-pointer text-xs font-semibold text-slate-600 hover:underline">Platform: {advert.platform||'Set'}</button>
              <button onClick={() => { const value=prompt('Reach (number of people reached):',advert.reachCount?.toString()??'');if(value!==null)void onUpdate(advert.id,{reachCount:Number(value)||0}); }} className="cursor-pointer text-xs font-semibold text-slate-600 hover:underline">Reach: {advert.reachCount!==null?advert.reachCount.toLocaleString():'Set'}</button>
              <button onClick={() => { const value=prompt('Number of times the advert was run:',advert.runCount?.toString()??'');if(value!==null)void onUpdate(advert.id,{runCount:Number(value)||0}); }} className="cursor-pointer text-xs font-semibold text-slate-600 hover:underline">Times Run: {advert.runCount!==null?advert.runCount.toLocaleString():'Set'}</button>
            </div>
          </div>)}</div>}
    </div>
  </>;
}
