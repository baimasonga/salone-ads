import { BarChart3, CheckCircle2, CreditCard, Megaphone, Plus, Target } from 'lucide-react';
import type { Organization } from '../types';
import { getSubscriberType } from '../domain/subscriptions/subscriberTypes';

export interface SubscriberAccessSummary {
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
}

export function SubscriberAccessBanner({ organization, access, onNavigate }: { organization: Organization; access: SubscriberAccessSummary | null; onNavigate: (tab: string) => void }) {
  const subscriber = getSubscriberType(organization.subscriberType);
  if (!access || access.status === 'active') return null;
  return <div className="mb-6 flex flex-col gap-3 border-2 border-amber-400 bg-amber-50 p-5 md:flex-row md:items-center md:justify-between">
    <div><p className="font-display text-lg font-extrabold text-amber-950">{subscriber.label} activation pending</p><p className="mt-1 text-sm text-amber-900">Your requested profile is saved. Paid capabilities remain locked until payment evidence is verified.</p></div>
    <button onClick={() => onNavigate('billing')} className="bg-amber-900 px-4 py-2 text-xs font-bold uppercase text-white">Complete payment</button>
  </div>;
}

export function AdvertisingSubscriberOverview({ organization, access, metrics, onNavigate }: {
  organization: Organization;
  access: SubscriberAccessSummary | null;
  metrics: { activeCampaigns: number; publishedContent: number; activeLeads: number; trackedClicks: number };
  onNavigate: (tab: string) => void;
}) {
  const active = access?.status === 'active';
  return <div className="space-y-6 text-left">
    <SubscriberAccessBanner organization={organization} access={access} onNavigate={onNavigate}/>
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-amber-300">Business Advertiser</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Welcome, {organization.name}</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">Plan campaigns, request advertising and monitor delivery from one business workspace.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button disabled={!active} onClick={() => onNavigate('campaign-builder')} className="inline-flex items-center gap-2 bg-amber-400 px-4 py-2 text-xs font-bold uppercase text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4"/>New campaign</button><button onClick={() => onNavigate('org-profile')} className="inline-flex items-center gap-2 border border-white px-4 py-2 text-xs font-bold uppercase"><Target className="h-4 w-4"/>Business profile</button></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      { label: 'Active campaigns', value: metrics.activeCampaigns, icon: Megaphone },
      { label: 'Published content', value: metrics.publishedContent, icon: CheckCircle2 },
      { label: 'Active leads', value: metrics.activeLeads, icon: Target },
      { label: 'Tracked clicks', value: metrics.trackedClicks, icon: BarChart3 },
    ].map(({label,value,icon:Icon}) => <div key={label} className="border-2 border-slate-950 bg-white p-5"><Icon className="h-5 w-5 text-amber-600"/><p className="mt-3 font-display text-3xl font-extrabold">{value}</p><p className="text-xs uppercase text-slate-500">{label}</p></div>)}</section>
    <section className="grid gap-4 md:grid-cols-2"><button onClick={() => onNavigate('campaign-performance')} className="border-2 border-slate-950 bg-white p-5 text-left"><BarChart3 className="h-5 w-5 text-emerald-600"/><h3 className="mt-3 font-display text-lg font-extrabold">Campaign performance</h3><p className="mt-1 text-sm text-slate-500">Review delivery, reach and response activity.</p></button><button onClick={() => onNavigate('billing')} className="border-2 border-slate-950 bg-white p-5 text-left"><CreditCard className="h-5 w-5 text-sky-600"/><h3 className="mt-3 font-display text-lg font-extrabold">Subscription & payment</h3><p className="mt-1 text-sm text-slate-500">{active ? `${access?.planName} access is active.` : 'Submit payment evidence and track activation.'}</p></button></section>
  </div>;
}
