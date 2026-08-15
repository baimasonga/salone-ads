import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  AuthorizationAssuranceReport,
  fetchAuthorizationAssurance,
} from './authorizationAssuranceApi';

const WINDOWS = [7, 30, 90] as const;
const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

export function AdminAuthorizationAssuranceWorkspace() {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<AuthorizationAssuranceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setReport(await fetchAuthorizationAssurance(days)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load authorization assurance.'); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const summary = report?.summary ?? {
    publicTables: 0, rlsProtectedTables: 0, registeredResources: 0, passingResources: 0,
    unsafeAnonDefiners: 0, authorizationDenials: 0, crossTenantDenials: 0, roleDenials: 0,
  };
  const posturePassing = Boolean(report)
    && summary.rlsProtectedTables === summary.publicTables
    && summary.passingResources === summary.registeredResources
    && summary.unsafeAnonDefiners === 0;

  return <div className="space-y-6 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Tenant security</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Authorization Assurance</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Continuously verify RLS coverage, tenant-scoped policies and privileged function exposure across Hyderra.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 border-2 border-white bg-white px-4 py-2 font-mono text-[9px] font-bold uppercase text-slate-950">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh posture
        </button>
      </div>
    </section>

    <div className="flex flex-wrap gap-2">{WINDOWS.map(value => <button key={value} onClick={() => setDays(value)} className={`border-2 border-slate-950 px-3 py-2 font-mono text-[9px] font-bold uppercase ${days === value ? 'bg-slate-950 text-white' : 'bg-white'}`}>{value} days</button>)}</div>
    {error && <div className="border-2 border-red-700 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {loading && !report ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin"/></div> : report && <>
      <section className={`flex items-center gap-3 border-2 border-slate-950 p-4 ${posturePassing ? 'bg-emerald-100' : 'bg-amber-100'}`}>
        {posturePassing ? <CheckCircle2 className="h-6 w-6 text-emerald-700"/> : <AlertTriangle className="h-6 w-6 text-amber-800"/>}
        <div><p className="font-display text-lg font-extrabold">{posturePassing ? 'Core tenant controls are passing' : 'Security posture needs attention'}</p>
          <p className="text-xs text-slate-600">Generated {formatDate(report.generatedAt)}. New public tables are automatically placed behind RLS.</p></div>
      </section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['RLS protected', `${summary.rlsProtectedTables}/${summary.publicTables}`, ShieldCheck, 'bg-emerald-400'],
        ['Scoped resources', `${summary.passingResources}/${summary.registeredResources}`, KeyRound, 'bg-violet-400'],
        ['Unsafe functions', summary.unsafeAnonDefiners, AlertTriangle, 'bg-orange-400'],
        ['Denied attempts', summary.authorizationDenials, ShieldCheck, 'bg-sky-400'],
      ].map(([label, value, Icon, accent]: any) => <div key={label} className="relative border-2 border-slate-950 bg-white p-5"><span className={`absolute inset-x-0 top-0 h-1.5 ${accent}`}/><div className="flex justify-between"><span className="font-mono text-[9px] font-bold uppercase text-slate-500">{label}</span><Icon className="h-4 w-4"/></div><span className="mt-3 block font-display text-3xl font-extrabold">{value}</span></div>)}</section>
      <section className="border-2 border-slate-950 bg-white"><header className="border-b-2 border-slate-950 p-4"><p className="font-mono text-[9px] font-bold uppercase text-violet-700">Policy coverage</p><h3 className="font-display text-xl font-extrabold">Registered tenant resources</h3></header>
        <div className="divide-y-2 divide-slate-200">{report.resources.map(item => <article key={item.tableName} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_150px_180px]"><div><div className="flex flex-wrap items-center gap-2"><span className={`px-2 py-1 font-mono text-[8px] font-bold uppercase ${item.status === 'pass' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{item.status}</span><span className="font-mono text-[9px] font-bold uppercase text-violet-700">{item.domain}</span></div><h4 className="mt-2 font-display font-extrabold">{item.tableName}</h4></div><span className="font-mono text-[9px] font-bold uppercase">{item.classification}</span><div className="flex flex-wrap gap-2 font-mono text-[8px] font-bold uppercase"><span>{item.rlsEnabled ? 'RLS ✓' : 'RLS missing'}</span><span>{item.hasPolicy ? 'Policy ✓' : 'Policy missing'}</span><span>{item.hasTenantGuard ? 'Scope ✓' : 'Scope missing'}</span></div></article>)}</div>
      </section>
      <section className="border-2 border-slate-950 bg-white"><header className="border-b-2 border-slate-950 p-4"><p className="font-mono text-[9px] font-bold uppercase text-red-700">Access denials</p><h3 className="font-display text-xl font-extrabold">Recent protected requests</h3></header>
        {report.recentDenials.length === 0 ? <div className="grid min-h-32 place-items-center p-6 text-sm text-slate-500">No authorization denials recorded in this window.</div> : <div className="divide-y-2 divide-slate-200">{report.recentDenials.map((item, index) => <article key={`${item.occurredAt}-${index}`} className="grid gap-2 p-4 md:grid-cols-[180px_minmax(0,1fr)_180px]"><span className="font-mono text-[9px]">{formatDate(item.occurredAt)}</span><div><strong className="text-sm">{item.permission}</strong><p className="text-xs text-slate-500">{item.resourceType}{item.orgId ? ` · ${item.orgId}` : ''}</p></div><span className="h-fit bg-red-100 px-2 py-1 text-center font-mono text-[8px] font-bold uppercase text-red-800">{item.reasonCode.replaceAll('_', ' ')}</span></article>)}</div>}
      </section>
    </>}
  </div>;
}
