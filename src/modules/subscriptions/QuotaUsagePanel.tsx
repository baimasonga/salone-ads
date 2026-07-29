import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { fetchQuotaSnapshot, type QuotaSnapshot } from '../../lib/quotaApi';

export function QuotaUsagePanel({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<QuotaSnapshot[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { fetchQuotaSnapshot(organizationId).then(setItems).catch(e => setError(e instanceof Error ? e.message : 'Could not load usage.')); }, [organizationId]);
  return (
    <section className="border-2 border-slate-950 bg-white p-6">
      <div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-violet-600" /><h3 className="font-display text-lg font-extrabold">Usage & Plan Limits</h3></div>
      <p className="mt-1 text-xs text-slate-500">Live usage is measured against your current subscription allowances.</p>
      {error ? <p className="mt-4 text-xs text-red-700">{error}</p> : items.length === 0 ? <p className="mt-4 text-xs text-slate-500">This plan has no measured limits yet.</p> :
        <div className="mt-5 grid gap-4 md:grid-cols-2">{items.map(item => (
          <div key={item.featureKey} className="border border-slate-300 p-4">
            <div className="flex justify-between gap-3"><span className="text-xs font-bold">{item.featureLabel}</span><span className="font-mono text-[10px]">{item.currentValue} / {item.limitValue}</span></div>
            <div className="mt-3 h-2 bg-slate-200"><div className={`h-2 ${item.usagePercent >= 100 ? 'bg-red-500' : item.usagePercent >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(item.usagePercent, 100)}%` }} /></div>
            <p className="mt-2 text-[10px] text-slate-500">{item.remainingValue} remaining{item.isOverride ? ' · administrator override' : ''}</p>
          </div>
        ))}</div>}
    </section>
  );
}

