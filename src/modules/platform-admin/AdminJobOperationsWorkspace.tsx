import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ServerCog,
} from 'lucide-react';
import {
  BackgroundJobRecord,
  BackgroundJobStatus,
  BackgroundJobSummary,
  fetchBackgroundJobs,
  fetchBackgroundJobSummary,
  replayBackgroundJob,
} from './jobOperationsApi';
import { BusinessEventOutboxPanel } from './BusinessEventOutboxPanel';

const FILTERS: Array<{ value: BackgroundJobStatus | null; label: string }> = [
  { value: null, label: 'All jobs' },
  { value: 'dead_letter', label: 'Dead letter' },
  { value: 'processing', label: 'Processing' },
  { value: 'queued', label: 'Queued' },
  { value: 'completed', label: 'Completed' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusClasses(status: BackgroundJobStatus): string {
  if (status === 'dead_letter') return 'border-red-800 bg-red-50 text-red-800';
  if (status === 'processing') return 'border-violet-700 bg-violet-50 text-violet-800';
  if (status === 'queued') return 'border-amber-700 bg-amber-50 text-amber-800';
  return 'border-emerald-700 bg-emerald-50 text-emerald-800';
}

export function AdminJobOperationsWorkspace() {
  const [summary, setSummary] = useState<BackgroundJobSummary | null>(null);
  const [jobs, setJobs] = useState<BackgroundJobRecord[]>([]);
  const [filter, setFilter] = useState<BackgroundJobStatus | null>('dead_letter');
  const [loading, setLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const [nextSummary, nextJobs] = await Promise.all([
        fetchBackgroundJobSummary(),
        fetchBackgroundJobs(filter),
      ]);
      setSummary(nextSummary);
      setJobs(nextJobs);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not load background jobs.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReplay = async (job: BackgroundJobRecord) => {
    if (!window.confirm(`Retry ${job.jobType}? The job will return to the queue with its attempt count reset.`)) return;
    setReplayingId(job.id);
    setFeedback('');
    try {
      const replayed = await replayBackgroundJob(job.id);
      if (!replayed) throw new Error('The job is no longer in the dead-letter queue.');
      setFeedback('Job returned to the queue.');
      await load();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not retry the job.');
    } finally {
      setReplayingId(null);
    }
  };

  const stats = [
    { label: 'Queued', value: summary?.queued ?? 0, accent: 'bg-amber-300', icon: Clock3 },
    { label: 'Processing', value: summary?.processing ?? 0, accent: 'bg-violet-400', icon: LoaderCircle },
    { label: 'Completed', value: summary?.completed ?? 0, accent: 'bg-emerald-400', icon: CheckCircle2 },
    { label: 'Dead letter', value: summary?.deadLetter ?? 0, accent: 'bg-red-400', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-violet-300">Platform reliability</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Background Job Operations</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Monitor durable work, investigate failures, and return recoverable dead-letter jobs to the queue.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 border-2 border-white bg-white px-4 py-2 font-mono text-[10px] font-bold uppercase text-slate-950 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="relative overflow-hidden border-2 border-slate-950 bg-white p-5">
              <span className={`absolute inset-x-0 top-0 h-1.5 ${stat.accent}`} />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{stat.label}</span>
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <span className="mt-3 block font-display text-3xl font-extrabold text-slate-950">{stat.value}</span>
            </div>
          );
        })}
      </section>

      <section className="border-2 border-slate-950 bg-white">
        <div className="flex flex-col gap-3 border-b-2 border-slate-950 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.label}
                onClick={() => setFilter(item.value)}
                className={`border-2 px-3 py-2 font-mono text-[9px] font-bold uppercase ${
                  filter === item.value
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-950'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="font-mono text-[9px] text-slate-500">
            Oldest queued: {formatDate(summary?.oldestQueuedAt ?? null)}
          </div>
        </div>

        {feedback && (
          <div className={`border-b-2 border-slate-950 px-4 py-3 text-xs ${
            feedback.startsWith('Job returned') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}>
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="grid min-h-48 place-items-center p-8 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading jobs…</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <div>
              <ServerCog className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-3 font-display font-extrabold text-slate-950">No matching jobs</p>
              <p className="mt-1 text-xs text-slate-500">This queue view is currently clear.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y-2 divide-slate-200">
            {jobs.map((job) => (
              <article key={job.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_180px_150px] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-sm font-extrabold text-slate-950">{job.jobType}</h3>
                    <span className={`border px-2 py-0.5 font-mono text-[8px] font-bold uppercase ${statusClasses(job.status)}`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[9px] text-slate-400">{job.id}</p>
                  {job.lastError && (
                    <div className="mt-3 border-l-4 border-red-500 bg-red-50 p-3 text-xs leading-5 text-red-900">
                      {job.lastError}
                    </div>
                  )}
                </div>
                <dl className="space-y-2 font-mono text-[9px]">
                  <div><dt className="uppercase text-slate-400">Attempts</dt><dd className="font-bold text-slate-800">{job.attempts} / {job.maxAttempts}</dd></div>
                  <div><dt className="uppercase text-slate-400">Updated</dt><dd className="text-slate-700">{formatDate(job.updatedAt)}</dd></div>
                </dl>
                <div className="flex justify-end">
                  {job.status === 'dead_letter' ? (
                    <button
                      onClick={() => void handleReplay(job)}
                      disabled={replayingId === job.id}
                      className="inline-flex items-center gap-2 border-2 border-slate-950 bg-amber-300 px-3 py-2 font-mono text-[9px] font-bold uppercase text-slate-950 disabled:opacity-50"
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${replayingId === job.id ? 'animate-spin' : ''}`} />
                      Retry job
                    </button>
                  ) : (
                    <span className="font-mono text-[9px] text-slate-400">Created {formatDate(job.createdAt)}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <BusinessEventOutboxPanel />
    </div>
  );
}
