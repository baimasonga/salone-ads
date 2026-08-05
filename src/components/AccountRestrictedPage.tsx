import { LogOut, ShieldAlert } from 'lucide-react';
import type { Organization } from '../types';

export function AccountRestrictedPage({ organization, onLogout }: { organization: Organization; onLogout: () => Promise<void> }) {
  const title = organization.status === 'suspended' ? 'Account suspended'
    : organization.status === 'recovery_pending' ? 'Recovery request under review'
      : organization.status === 'purged' ? 'Account permanently removed' : 'Account closed';
  return <main className="grid min-h-screen place-items-center border-8 border-slate-950 bg-slate-100 p-6">
    <section className="w-full max-w-xl border-2 border-slate-950 bg-white p-8 text-left shadow-[10px_10px_0_0_#0F172A]">
      <ShieldAlert className="h-10 w-10 text-amber-600"/>
      <p className="mt-6 font-mono text-[9px] font-bold uppercase tracking-[.22em] text-amber-700">ManoHub account control</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">The normal workspace for {organization.name} is unavailable while this account is {organization.status.replaceAll('_',' ')}.</p>
      {organization.statusReason && <div className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950"><strong>Administrator note:</strong> {organization.statusReason}</div>}
      {organization.recoverableUntil && organization.status === 'closed' && <p className="mt-4 text-xs text-slate-500">Recovery is available until {new Date(organization.recoverableUntil).toLocaleString('en-GB')}.</p>}
      <p className="mt-5 text-sm text-slate-600">Contact ManoHub support if you believe this status is incorrect or need to submit a recovery request.</p>
      <button onClick={() => void onLogout()} className="mt-6 inline-flex items-center gap-2 bg-slate-950 px-5 py-3 text-xs font-bold uppercase text-white"><LogOut className="h-4 w-4"/>Sign out</button>
    </section>
  </main>;
}
