import { useEffect, useMemo, useState } from 'react';
import { Activity, Gauge, RefreshCw } from 'lucide-react';
import {
  fetchRecentUsageMeteringEvents,
  fetchUsageMeteringSummary,
  type UsageMeteringEvent,
  type UsageMeteringSummary,
} from '../../lib/usageMeteringApi';

const windows = [7, 30, 90] as const;

function label(value: string): string {
  return value.replaceAll('_', ' ');
}

export function AdminUsageMeteringWorkspace() {
  const [days, setDays] = useState<(typeof windows)[number]>(30);
  const [summary, setSummary] = useState<UsageMeteringSummary[]>([]);
  const [events, setEvents] = useState<UsageMeteringEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFeedback('');
    Promise.all([fetchUsageMeteringSummary(days), fetchRecentUsageMeteringEvents()])
      .then(([summaryRows, eventRows]) => {
        if (!cancelled) {
          setSummary(summaryRows);
          setEvents(eventRows);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : 'Could not load usage metering.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [days, refreshToken]);

  const metrics = useMemo(() => ({
    organizations: new Set(summary.map((row) => row.organizationId)).size,
    meters: new Set(summary.map((row) => row.meterKey)).size,
    events: summary.reduce((total, row) => total + row.eventCount, 0),
    units: summary.reduce((total, row) => total + row.totalAmount, 0),
  }), [summary]);

  const organizationNames = useMemo(
    () => new Map(summary.map((row) => [row.organizationId, row.organizationName])),
    [summary],
  );

  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">
              Commercial control
            </p>
            <h2 className="mt-2 flex items-center gap-3 font-display text-3xl font-extrabold !text-white">
              <Gauge className="h-7 w-7 text-violet-300" /> Usage Metering
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Review organization consumption recorded by the central metering service.
              Advertising performance remains in its dedicated analytics workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshToken((value) => value + 1)}
            className="inline-flex items-center gap-2 border border-white/30 px-3 py-2 font-mono text-[9px] font-bold uppercase"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Organizations', metrics.organizations],
          ['Active meters', metrics.meters],
          ['Usage events', metrics.events],
          ['Measured units', metrics.units],
        ].map(([name, value]) => (
          <div key={name} className="border-2 border-slate-950 bg-white p-4">
            <Activity className="h-4 w-4 text-emerald-600" />
            <p className="mt-3 font-display text-2xl font-extrabold">{value}</p>
            <p className="font-mono text-[8px] font-bold uppercase text-slate-500">{name}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {windows.map((windowDays) => (
          <button
            key={windowDays}
            type="button"
            onClick={() => setDays(windowDays)}
            className={`border px-3 py-2 font-mono text-[9px] font-bold uppercase ${
              days === windowDays ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-white'
            }`}
          >
            {windowDays} days
          </button>
        ))}
      </div>

      {feedback && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{feedback}</div>}

      <section className="border-2 border-slate-950 bg-white">
        <div className="border-b-2 border-slate-950 bg-slate-100 px-4 py-3">
          <h3 className="font-display text-lg font-extrabold">Meter totals</h3>
        </div>
        {loading && summary.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Loading usage totals…</p>
        ) : summary.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No organization usage has been recorded in this period. New business actions will appear here automatically.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {summary.map((row) => (
              <article key={`${row.organizationId}:${row.meterKey}`} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_1fr_120px_150px] md:items-center">
                <div>
                  <p className="text-sm font-bold text-slate-900">{row.organizationName}</p>
                  <p className="mt-1 font-mono text-[9px] text-slate-400">{row.organizationId}</p>
                </div>
                <p className="text-xs font-semibold capitalize text-violet-800">{label(row.meterKey)}</p>
                <p className="font-mono text-xs">{row.totalAmount} units · {row.eventCount} events</p>
                <time className="text-[10px] text-slate-500" dateTime={row.lastEventAt}>
                  {new Date(row.lastEventAt).toLocaleString('en-GB')}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border-2 border-slate-950 bg-white">
        <div className="border-b-2 border-slate-950 bg-slate-100 px-4 py-3">
          <h3 className="font-display text-lg font-extrabold">Recent metered actions</h3>
        </div>
        {events.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No recent usage events.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {events.slice(0, 50).map((event) => (
              <article key={event.id} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[1fr_1fr_1fr_160px] md:items-center">
                <div>
                  <p className="font-bold text-slate-800">{organizationNames.get(event.organizationId) ?? event.organizationId}</p>
                  <p className="mt-1 font-mono text-[9px] text-slate-400">{event.source}</p>
                </div>
                <p className="capitalize">{label(event.eventType)}</p>
                <p className="font-mono text-[10px] text-violet-700">{label(event.meterKey)} · +{event.amount}</p>
                <time className="text-[10px] text-slate-500" dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString('en-GB')}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
