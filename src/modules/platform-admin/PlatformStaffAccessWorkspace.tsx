import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { fetchPlatformStaff, invitePlatformStaff, updatePlatformStaff, type PlatformStaffMember, type PlatformStaffRole } from '../../lib/platformStaffApi';

const roles: Array<{value: Exclude<PlatformStaffRole,'owner'>; label: string; description: string}> = [
  { value:'administrator', label:'Administrator', description:'Runs platform operations and manages staff access.' },
  { value:'finance', label:'Finance', description:'Handles payments, billing records, credits and financial reporting.' },
  { value:'editorial', label:'Editorial', description:'Creates, reviews and publishes Hyderra content.' },
  { value:'support', label:'Support', description:'Assists subscribers and manages service requests.' },
  { value:'auditor', label:'Auditor', description:'Receives read-only operational and audit visibility.' },
];

export function PlatformStaffAccessWorkspace() {
  const [members,setMembers]=useState<PlatformStaffMember[]>([]);
  const [email,setEmail]=useState(''); const [role,setRole]=useState<Exclude<PlatformStaffRole,'owner'>>('administrator');
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [feedback,setFeedback]=useState('');
  const load=useCallback(async()=>{setLoading(true);try{setMembers(await fetchPlatformStaff());setFeedback('');}catch(e:any){setFeedback(e.message||'Could not load staff access.');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const invite=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setFeedback('');try{await invitePlatformStaff(email,role);setEmail('');setFeedback('Invitation sent and access recorded.');await load();}catch(err:any){setFeedback(err.message||'Invitation failed.');}finally{setSaving(false);}};
  const act=async(member:PlatformStaffMember,action:'suspend'|'reactivate'|'revoke')=>{
    const reason=action==='reactivate'?'':window.prompt(`${action === 'suspend' ? 'Suspension' : 'Revocation'} reason:`)?.trim();
    if(action!=='reactivate'&&!reason)return;
    setSaving(true);try{await updatePlatformStaff(member.userId,action,undefined,reason);await load();}catch(e:any){setFeedback(e.message||'Update failed.');}finally{setSaving(false);}
  };
  return <div className="space-y-6 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white"><p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Quantix Sierra Leone</p><h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Staff access</h2><p className="mt-2 text-sm text-slate-300">Invite trusted platform staff, assign responsibilities, and suspend or revoke access. MFA is not enabled in this release.</p></section>
    {feedback&&<p role="status" className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{feedback}</p>}
    <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <form onSubmit={invite} className="border-2 border-slate-950 bg-white p-5 space-y-4"><div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-600"/><h3 className="font-display text-lg font-extrabold">Invite staff member</h3></div><label className="block text-xs font-bold uppercase text-slate-600">Work email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 text-sm normal-case" placeholder="name@quantixsl.com"/></label><label className="block text-xs font-bold uppercase text-slate-600">Role<select value={role} onChange={e=>setRole(e.target.value as Exclude<PlatformStaffRole,'owner'>)} className="mt-1 w-full border-2 border-slate-300 bg-white p-3 text-sm normal-case">{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label><p className="text-xs leading-5 text-slate-500">{roles.find(r=>r.value===role)?.description}</p><button disabled={saving} className="w-full bg-slate-950 p-3 font-mono text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50">{saving?'Working…':'Send invitation'}</button></form>
      <div className="border-2 border-slate-950 bg-white"><div className="border-b-2 border-slate-950 p-5"><h3 className="font-display text-lg font-extrabold">Authorised staff</h3></div>{loading?<div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>:<div className="divide-y divide-slate-200">{members.map(m=><div key={m.userId} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-950">{m.fullName||m.email}</p><p className="text-xs text-slate-500">{m.email}</p></div><div className="flex items-center gap-2"><span className="border px-2 py-1 font-mono text-[9px] font-bold uppercase">{m.role}</span><span className={`px-2 py-1 font-mono text-[9px] font-bold uppercase ${m.status==='active'?'bg-emerald-100 text-emerald-800':m.status==='suspended'?'bg-amber-100 text-amber-800':'bg-slate-200 text-slate-700'}`}>{m.status}</span></div></div>{m.role!=='owner'&&<div className="mt-3 flex flex-wrap gap-2">{m.status==='suspended'||m.status==='revoked'?<button disabled={saving} onClick={()=>void act(m,'reactivate')} className="border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-800">Reactivate</button>:<button disabled={saving} onClick={()=>void act(m,'suspend')} className="border border-amber-700 px-3 py-1.5 text-xs font-bold text-amber-800">Suspend</button>}<button disabled={saving} onClick={()=>void act(m,'revoke')} className="border border-red-700 px-3 py-1.5 text-xs font-bold text-red-800">Revoke</button></div>}</div>)}</div>}</div>
    </section>
    <section className="grid gap-3 md:grid-cols-3">{[{label:'Owner',description:'Full control and sole authority over owner-level access.'},...roles].map(r=><div key={r.label} className="border border-slate-300 bg-white p-4"><ShieldCheck className="h-4 w-4 text-violet-600"/><h4 className="mt-2 font-bold">{r.label}</h4><p className="mt-1 text-xs leading-5 text-slate-500">{r.description}</p></div>)}</section>
  </div>;
}
