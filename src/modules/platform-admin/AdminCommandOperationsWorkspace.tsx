import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, ServerCog } from 'lucide-react';
import { fetchCommandOperations, type CommandOperationsReport } from './commandOperationsApi';

const WINDOWS = [7, 30, 90] as const;
const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function AdminCommandOperationsWorkspace() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<CommandOperationsReport|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async()=>{setLoading(true);setError('');try{setReport(await fetchCommandOperations(days));}catch(cause){setError(cause instanceof Error?cause.message:'Could not load command operations.');}finally{setLoading(false);}},[days]);
  useEffect(()=>{void load();},[load]);
  const summary=report?.summary??{total:0,succeeded:0,failed:0,processing:0,retries:0};
  const successRate=summary.total?Math.round(summary.succeeded/summary.total*100):100;
  return <div className="space-y-6 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Secure command layer</p><h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Command Operations</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Monitor sensitive backend actions, idempotent retries and normalized failures without bypassing domain authorization.</p></div><button onClick={()=>void load()} className="inline-flex items-center gap-2 border-2 border-white bg-white px-4 py-2 font-mono text-[9px] font-bold uppercase text-slate-950"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</button></div></section>
    <div className="flex flex-wrap gap-2">{WINDOWS.map(value=><button key={value} onClick={()=>setDays(value)} className={`border-2 border-slate-950 px-3 py-2 font-mono text-[9px] font-bold uppercase ${days===value?'bg-slate-950 text-white':'bg-white'}`}>{value} days</button>)}</div>
    {error&&<div className="border-2 border-red-700 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {loading&&!report?<div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin"/></div>:report&&<>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Commands',summary.total,'bg-violet-400'],['Success rate',`${successRate}%`,'bg-emerald-400'],['Failed',summary.failed,'bg-red-400'],['Processing',summary.processing,'bg-sky-400'],['Retries',summary.retries,'bg-amber-300']].map(([label,value,accent])=><div key={String(label)} className="relative border-2 border-slate-950 bg-white p-5"><span className={`absolute inset-x-0 top-0 h-1.5 ${accent}`}/><span className="font-mono text-[9px] font-bold uppercase text-slate-500">{label}</span><span className="mt-3 block font-display text-3xl font-extrabold">{value}</span></div>)}</section>
      <section className="border-2 border-slate-950 bg-white"><header className="border-b-2 border-slate-950 p-4"><p className="font-mono text-[9px] font-bold uppercase text-violet-700">Command health</p><h3 className="font-display text-xl font-extrabold">Protected operations by type</h3></header>{report.commands.length===0?<div className="grid min-h-28 place-items-center p-6 text-sm text-slate-500">No protected commands recorded in this window.</div>:<div className="divide-y-2 divide-slate-200">{report.commands.map(item=><article key={item.commandName} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_100px_100px_100px]"><strong className="font-mono text-xs">{item.commandName}</strong><span>{item.total} total</span><span className="text-emerald-700">{item.succeeded} passed</span><span className="text-red-700">{item.failed} failed</span></article>)}</div>}</section>
      <section className="border-2 border-slate-950 bg-white"><header className="border-b-2 border-slate-950 p-4"><p className="font-mono text-[9px] font-bold uppercase text-violet-700">Recent activity</p><h3 className="font-display text-xl font-extrabold">Command execution log</h3></header>{report.recent.length===0?<div className="grid min-h-28 place-items-center p-6 text-sm text-slate-500">No command activity yet.</div>:<div className="divide-y-2 divide-slate-200">{report.recent.map(item=><article key={item.id} className="grid gap-2 p-4 md:grid-cols-[36px_minmax(0,1fr)_150px_110px]"><span>{item.status==='succeeded'?<CheckCircle2 className="h-5 w-5 text-emerald-700"/>:item.status==='failed'?<AlertTriangle className="h-5 w-5 text-red-700"/>:<ServerCog className="h-5 w-5 text-sky-700"/>}</span><div><strong className="font-mono text-xs">{item.commandName}</strong><p className="text-xs text-slate-500">{item.requestId??'No request ID'}{item.errorCode?` · ${item.errorCode}`:''}</p></div><span className="text-xs">{formatDate(item.startedAt)}</span><span className="font-mono text-[9px] font-bold uppercase">Attempt {item.attemptCount}</span></article>)}</div>}</section>
    </>}
  </div>;
}
