import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, RefreshCw, ShieldAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import type { PlatformStaffRole } from '../../lib/platformStaffApi';
import {
  fetchAdministratorControlCentre,
  fetchUploadSecurityEvents,
  updatePlatformIntakeControl,
  type AdministratorControlCentreSnapshot,
  type ControlCentreSignal,
  type PlatformIntakeControl,
  type UploadSecurityEvent,
} from './administratorControlCentreApi';

interface AdministratorControlCentreProps {
  role: PlatformStaffRole;
  onNavigate: (tab: string) => void;
}

const roleTitles: Record<PlatformStaffRole,string> = {
  owner: 'Platform command centre', administrator: 'Administrator command centre', finance: 'Finance control centre',
  editorial: 'Editorial control centre', support: 'Support control centre', auditor: 'Audit control centre',
};

function SignalGrid({ title, items, onNavigate }: { title: string; items: ControlCentreSignal[]; onNavigate: (tab:string)=>void }) {
  if (!items.length) return null;
  return <section><h3 className="font-display text-xl font-extrabold text-slate-950">{title}</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item)=><button key={`${title}-${item.label}`}
      onClick={()=>onNavigate(item.href)} className="flex items-center justify-between border-2 border-slate-950 bg-white p-4 text-left hover:shadow-[4px_4px_0_0_#0F172A]">
      <span><span className="block text-xs font-bold text-slate-700">{item.label}</span><span className="mt-1 block font-display text-2xl font-extrabold">{item.value.toLocaleString()}</span></span>
      <span className={`grid h-9 w-9 place-items-center ${item.severity==='critical'?'bg-rose-100 text-rose-700':item.severity==='warning'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>
        {item.severity ? <AlertTriangle className="h-4 w-4"/> : <ArrowRight className="h-4 w-4"/>}
      </span></button>)}</div></section>;
}

export function AdministratorControlCentre({ role, onNavigate }: AdministratorControlCentreProps) {
  const [snapshot,setSnapshot]=useState<AdministratorControlCentreSnapshot|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<PlatformIntakeControl|null>(null);
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const [uploadEvents,setUploadEvents]=useState<UploadSecurityEvent[]>([]);

  const canReviewUploads=['owner','administrator','support','auditor'].includes(role);
  const load=useCallback(async()=>{setLoading(true);setError('');try{setSnapshot(await fetchAdministratorControlCentre());if(canReviewUploads)setUploadEvents(await fetchUploadSecurityEvents())}catch(e){setError(e instanceof Error?e.message:'The operational snapshot could not be loaded.')}finally{setLoading(false)}},[canReviewUploads]);
  useEffect(()=>{void load()},[load]);

  const confirmControl=async()=>{if(!selected||reason.trim().length<10)return;setSaving(true);setError('');try{
    await updatePlatformIntakeControl(selected.key,!selected.enabled,reason.trim());setSelected(null);setReason('');await load();
  }catch(e){setError(e instanceof Error?e.message:'The control could not be updated.')}finally{setSaving(false)}};

  if(loading&&!snapshot)return <div role="status" className="border-2 border-slate-950 bg-white p-8 text-sm text-slate-600">Loading live platform operations…</div>;
  if(error&&!snapshot)return <div role="alert" className="border-2 border-rose-700 bg-rose-50 p-6"><p className="font-bold text-rose-900">Control Centre unavailable</p><p className="mt-2 text-sm text-rose-800">{error}</p><button onClick={()=>void load()} className="mt-4 border-2 border-slate-950 bg-white px-4 py-2 text-xs font-bold">Retry</button></div>;
  if(!snapshot)return null;

  return <div className="space-y-7 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[9px] font-bold uppercase tracking-[.24em] text-emerald-300">Live platform operations</p>
        <h2 className="mt-3 font-display text-3xl font-extrabold !text-white md:text-4xl">{roleTitles[role]}</h2><p className="mt-3 max-w-2xl text-sm text-slate-300">Real queues, commercial signals and platform health—limited to your staff responsibilities.</p></div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 border border-slate-500 px-3 py-2 text-xs font-bold disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</button></div>
    </section>
    {error&&<div role="alert" className="border-2 border-amber-700 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{snapshot.metrics.map(metric=><button key={metric.label} onClick={()=>onNavigate(metric.href)} className="border-2 border-slate-950 bg-white p-5 text-left hover:shadow-[4px_4px_0_0_#0F172A]">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{metric.label}</span><span className="mt-3 block font-display text-3xl font-extrabold">{metric.format==='currency'?`SLE ${Number(metric.value).toLocaleString()}`:Number(metric.value).toLocaleString()}</span></button>)}</section>
    {!snapshot.metrics.length&&<div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">No operational figures are available for this role yet.</div>}
    <SignalGrid title="Action queues" items={snapshot.queues} onNavigate={onNavigate}/><SignalGrid title="Risk signals" items={snapshot.risks} onNavigate={onNavigate}/><SignalGrid title="Platform health" items={snapshot.health} onNavigate={onNavigate}/>
    {canReviewUploads&&<section><div className="flex items-center gap-3"><FileWarning className="h-5 w-5 text-rose-700"/><div><h3 className="font-display text-xl font-extrabold">Upload security review</h3><p className="text-xs text-slate-500">Private scanner evidence; blocked bytes are discarded before storage.</p></div></div>
      <div className="mt-4 overflow-x-auto border-2 border-slate-950 bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-950 text-white"><tr><th className="p-3">Time</th><th className="p-3">File</th><th className="p-3">Type</th><th className="p-3">Verdict</th><th className="p-3">Detail</th></tr></thead><tbody>{uploadEvents.map(event=><tr key={event.id} className="border-t border-slate-200"><td className="whitespace-nowrap p-3">{new Date(event.created_at).toLocaleString()}</td><td className="max-w-56 truncate p-3" title={event.file_name}>{event.file_name}</td><td className="p-3">{event.file_kind}</td><td className={`p-3 font-bold uppercase ${event.verdict==='blocked'?'text-rose-700':'text-emerald-700'}`}>{event.verdict}</td><td className="max-w-72 truncate p-3" title={event.threat_detail||''}>{event.threat_detail||'No threat found'}</td></tr>)}</tbody></table>{!uploadEvents.length&&<p className="p-5 text-sm text-slate-500">No upload scan events have been recorded yet.</p>}</div></section>}
    {snapshot.canManageControls&&<section><div className="flex items-center gap-3"><ShieldAlert className="h-5 w-5 text-violet-700"/><div><h3 className="font-display text-xl font-extrabold">Emergency intake controls</h3><p className="text-xs text-slate-500">Changes are enforced at the database boundary and recorded in the audit log.</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{snapshot.controls.map(control=><button key={control.key} onClick={()=>{setSelected(control);setReason('')}} className="flex items-start justify-between border-2 border-slate-950 bg-white p-4 text-left">
        <span><span className="font-bold">{control.label}</span><span className="mt-1 block text-xs text-slate-500">{control.enabled?'Accepting new requests':control.reason||'Paused by an administrator'}</span></span>{control.enabled?<ToggleRight className="h-7 w-7 text-emerald-600"/>:<ToggleLeft className="h-7 w-7 text-rose-600"/>}</button>)}</div></section>}
    {selected&&<div role="dialog" aria-modal="true" aria-labelledby="control-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div className="w-full max-w-lg border-2 border-slate-950 bg-white p-6 shadow-xl">
      <div className="flex items-center gap-3">{selected.enabled?<AlertTriangle className="h-6 w-6 text-rose-600"/>:<CheckCircle2 className="h-6 w-6 text-emerald-600"/>}<h3 id="control-dialog-title" className="font-display text-xl font-extrabold">{selected.enabled?'Pause':'Resume'} {selected.label}</h3></div>
      <p className="mt-3 text-sm text-slate-600">Provide a clear operational reason. This action is audited.</p><label className="mt-4 block text-xs font-bold" htmlFor="control-reason">Reason</label><textarea id="control-reason" value={reason} onChange={e=>setReason(e.target.value)} rows={4} className="mt-1 w-full border-2 border-slate-950 p-3 text-sm"/>
      <div className="mt-5 flex justify-end gap-3"><button disabled={saving} onClick={()=>{setSelected(null);setReason('')}} className="border-2 border-slate-950 px-4 py-2 text-xs font-bold">Cancel</button><button disabled={saving||reason.trim().length<10} onClick={()=>void confirmControl()} className="border-2 border-slate-950 bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{saving?'Saving…':'Confirm change'}</button></div></div></div>}
  </div>;
}
