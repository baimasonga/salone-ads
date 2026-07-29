import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  fetchManagedSubscriptions,
  transitionSubscription,
  type ManagedSubscription,
  type SubscriptionAction,
  type SubscriptionStatus,
} from '../../lib/subscriptionApi';

const filters: Array<{ value: 'all' | SubscriptionStatus; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' },
  { value: 'trialing', label: 'Trials' }, { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' }, { value: 'grace_period', label: 'Grace' },
  { value: 'suspended', label: 'Suspended' }, { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

function availableActions(status: SubscriptionStatus): Array<{ action: SubscriptionAction; label: string; danger?: boolean }> {
  switch (status) {
    case 'pending': return [{ action: 'start_trial', label: 'Start 14-day trial' }, { action: 'activate', label: 'Activate' }, { action: 'cancel', label: 'Decline', danger: true }];
    case 'trialing': return [{ action: 'activate', label: 'Activate' }, { action: 'schedule_cancel', label: 'Cancel at end' }, { action: 'expire', label: 'Expire', danger: true }];
    case 'active': return [{ action: 'renew', label: 'Renew' }, { action: 'mark_past_due', label: 'Mark past due' }, { action: 'suspend', label: 'Suspend', danger: true }, { action: 'schedule_cancel', label: 'Cancel at end' }];
    case 'past_due': return [{ action: 'renew', label: 'Payment received' }, { action: 'start_grace', label: 'Start grace' }, { action: 'suspend', label: 'Suspend', danger: true }];
    case 'grace_period': return [{ action: 'renew', label: 'Payment received' }, { action: 'suspend', label: 'Suspend', danger: true }, { action: 'expire', label: 'Expire', danger: true }];
    case 'suspended': return [{ action: 'resume', label: 'Resume' }, { action: 'cancel', label: 'Cancel', danger: true }];
    default: return [];
  }
}

export function AdminSubscriptionLifecycleWorkspace() {
  const [items, setItems] = useState<ManagedSubscription[]>([]);
  const [filter, setFilter] = useState<'all' | SubscriptionStatus>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    setLoading(true);
    try { setItems(await fetchManagedSubscriptions()); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not load subscriptions.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => filter === 'all' ? items : items.filter((item) => item.status === filter), [filter, items]);

  const act = async (item: ManagedSubscription, action: SubscriptionAction) => {
    let reason = '';
    if (['suspend', 'cancel'].includes(action)) {
      reason = window.prompt(`Reason to ${action} ${item.orgName}:`)?.trim() ?? '';
      if (!reason) return;
    }
    setBusyId(item.id);
    setFeedback('');
    try {
      await transitionSubscription(item.id, action, reason);
      await load();
      setFeedback(`${item.orgName}: ${action.replaceAll('_', ' ')} completed.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Subscription transition failed.');
    } finally { setBusyId(''); }
  };

  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Commercial operations</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Subscription Lifecycle</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Manage trials, activation, renewals, grace periods, suspension and cancellation from one controlled workflow.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 border border-white/30 px-3 py-2 font-mono text-[9px] font-bold uppercase"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Total', items.length, CreditCard], ['Active', items.filter(i => i.status === 'active').length, ShieldCheck],
          ['Attention', items.filter(i => ['past_due', 'grace_period', 'suspended'].includes(i.status)).length, AlertTriangle],
          ['Pending / trials', items.filter(i => ['pending', 'trialing'].includes(i.status)).length, RefreshCw],
        ].map(([label, value, Icon]: any) => <div key={label} className="border-2 border-slate-950 bg-white p-4"><Icon className="h-4 w-4 text-emerald-600" /><p className="mt-3 font-display text-2xl font-extrabold">{value}</p><p className="font-mono text-[8px] font-bold uppercase text-slate-500">{label}</p></div>)}
      </section>

      {feedback && <div className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{feedback}</div>}
      <div className="flex flex-wrap gap-2">{filters.map(option => <button key={option.value} onClick={() => setFilter(option.value)} className={`border px-3 py-2 font-mono text-[9px] font-bold uppercase ${filter === option.value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-white'}`}>{option.label}</button>)}</div>

      <section className="border-2 border-slate-950 bg-white">
        {loading ? <p className="p-8 text-sm text-slate-500">Loading subscriptions…</p> : visible.length === 0 ? <p className="p-8 text-sm text-slate-500">No subscriptions match this view.</p> :
          <div className="divide-y-2 divide-slate-950">{visible.map(item => (
            <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_180px_minmax(280px,auto)] lg:items-center">
              <div><h3 className="font-display text-base font-extrabold">{item.orgName}</h3><p className="mt-1 text-xs text-slate-500">{item.planName} · {item.billingCycle}{item.billingContactEmail ? ` · ${item.billingContactEmail}` : ''}</p>{item.suspensionReason && <p className="mt-2 text-xs text-red-700">{item.suspensionReason}</p>}</div>
              <div><span className="border border-slate-950 px-2 py-1 font-mono text-[9px] font-bold uppercase">{item.status.replaceAll('_', ' ')}</span><p className="mt-2 text-[10px] text-slate-500">{item.currentPeriodEnd ? `Period ends ${new Date(item.currentPeriodEnd).toLocaleDateString('en-GB')}` : 'No period set'}</p>{item.cancelAtPeriodEnd && <p className="mt-1 text-[10px] font-bold text-amber-700">Cancellation scheduled</p>}</div>
              <div className="flex flex-wrap gap-2">{availableActions(item.status).map(option => <button key={option.action} disabled={busyId === item.id} onClick={() => void act(item, option.action)} className={`border px-3 py-2 text-xs font-bold disabled:opacity-50 ${option.danger ? 'border-red-300 text-red-700' : 'border-slate-950 text-slate-900'}`}>{option.label}</button>)}</div>
            </article>
          ))}</div>}
      </section>
    </div>
  );
}

