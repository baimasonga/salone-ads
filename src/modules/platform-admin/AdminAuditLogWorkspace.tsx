import { useEffect, useState } from 'react';
import { ClipboardList, Filter, RefreshCw, Search } from 'lucide-react';
import {
  auditActionLabel,
  fetchAuditEvents,
  type AuditEvent,
} from '../../lib/auditApi';

const ACTION_OPTIONS = [
  'tender.submitted',
  'tender.approved',
  'tender.correction_requested',
  'tender.rejected',
  'tender.resubmitted',
  'tender.deadline_extended',
  'tender.closed',
  'tender.cancelled',
  'tender.awarded',
  'tender.featured',
  'tender.unfeatured',
];

function shortId(value: string | null): string {
  if (!value) return 'System';
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function auditReason(event: AuditEvent): string | null {
  const reason = event.metadata.reason;
  return typeof reason === 'string' && reason.trim() ? reason : null;
}

export function AdminAuditLogWorkspace() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [appliedEntityId, setAppliedEntityId] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFeedback('');

    fetchAuditEvents({
      action: action || undefined,
      entityId: appliedEntityId || undefined,
      limit: 100,
    })
      .then((items) => {
        if (!cancelled) setEvents(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setFeedback(`Error: ${error instanceof Error ? error.message : 'Could not load audit events.'}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, appliedEntityId, refreshToken]);

  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Accountability</p>
        <h2 className="mt-2 flex items-center gap-3 font-display text-3xl font-extrabold !text-white">
          <ClipboardList className="h-7 w-7 text-violet-300" /> Platform audit log
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Review immutable records of sensitive procurement and administrative actions.
        </p>
      </section>

      <section className="border-2 border-slate-950 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div>
            <label htmlFor="audit-action-filter" className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">Action</label>
            <div className="relative mt-1">
              <Filter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <select
                id="audit-action-filter"
                value={action}
                onChange={(event) => setAction(event.target.value)}
                className="w-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:bg-white focus:outline-emerald-500"
              >
                <option value="">All actions</option>
                {ACTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{auditActionLabel(option)}</option>
                ))}
              </select>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedEntityId(entityId.trim());
            }}
          >
            <label htmlFor="audit-entity-filter" className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">Entity ID</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                id="audit-entity-filter"
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                placeholder="Search tender or entity ID"
                className="w-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
          </form>
          <button
            type="button"
            aria-label="Refresh audit events"
            onClick={() => setRefreshToken((value) => value + 1)}
            className="self-end border-2 border-slate-950 bg-emerald-300 p-2.5 text-slate-950 hover:bg-emerald-400"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>

      {feedback ? (
        <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{feedback}</div>
      ) : null}

      <section className="overflow-hidden border-2 border-slate-950 bg-white">
        <div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px] gap-3 border-b-2 border-slate-950 bg-slate-100 px-4 py-3 font-mono text-[9px] font-bold uppercase tracking-wider text-slate-600">
          <span>Action</span>
          <span>Organisation / entity</span>
          <span>Actor / reason</span>
          <span>Time</span>
        </div>
        {loading && events.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Loading audit events…</p>
        ) : events.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No audit events match these filters.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <article key={event.id} className="grid grid-cols-[minmax(150px,1.2fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px] gap-3 px-4 py-4 text-xs">
                <div>
                  <span className="font-semibold capitalize text-slate-800">{auditActionLabel(event.action)}</span>
                  <span className="mt-1 block font-mono text-[9px] uppercase text-violet-600">{event.entityType}</span>
                </div>
                <div className="min-w-0">
                  <span className="block truncate font-medium text-slate-700">{event.organizationName ?? 'Platform'}</span>
                  <span className="mt-1 block truncate font-mono text-[9px] text-slate-400">{event.entityId ?? '—'}</span>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[9px] text-slate-500">{shortId(event.actorId)}</span>
                  {auditReason(event) ? <span className="mt-1 block truncate text-slate-500">{auditReason(event)}</span> : null}
                </div>
                <time className="text-[10px] text-slate-500" dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
