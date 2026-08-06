import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, LoaderCircle, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { SUBSCRIBER_TYPES, type SubscriberType } from '../../domain/subscriptions/subscriberTypes';
import {
  decideOrganizationRecovery, exportSubscribersCsv, fetchAdminSubscribers, purgeSubscriber,
  transitionOrganization, type AdminSubscriberRecord, type SubscriberLifecycleStatus,
} from './organizationAdminApi';

const PAGE_SIZE = 25;
const STATUS_OPTIONS: Array<{ value: SubscriberLifecycleStatus | null; label: string }> = [
  { value: null, label: 'All statuses' }, { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' }, { value: 'recovery_pending', label: 'Recovery pending' },
  { value: 'closed', label: 'Closed' }, { value: 'purged', label: 'Purged' },
];
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('en-GB') : '—';

export function AdminOrganizationLifecycleWorkspace() {
  const [items, setItems] = useState<AdminSubscriberRecord[]>([]);
  const [status, setStatus] = useState<SubscriberLifecycleStatus | null>(null);
  const [subscriberType, setSubscriberType] = useState<SubscriberType | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AdminSubscriberRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setFeedback('');
    try {
      const result = await fetchAdminSubscribers({ status, subscriberType, search, page, pageSize: PAGE_SIZE });
      setItems(result.items); setTotal(result.total);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Subscribers could not be loaded.'); }
    finally { setLoading(false); }
  }, [page, search, status, subscriberType]);
  useEffect(() => { void load(); }, [load]);

  const act = async (item: AdminSubscriberRecord, action: 'suspend' | 'reactivate' | 'close') => {
    const reason = window.prompt(`${action} ${item.name}: provide a reason (minimum 10 characters).`)?.trim() ?? '';
    if (!reason) return;
    setBusy(item.id);
    try { await transitionOrganization(item.id, action, reason); setFeedback(`${item.name} is now ${action === 'reactivate' ? 'active' : action === 'close' ? 'closed' : 'suspended'}.`); setSelected(null); await load(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Subscriber action failed.'); }
    finally { setBusy(''); }
  };

  const decide = async (item: AdminSubscriberRecord, approve: boolean) => {
    if (!item.recoveryRequestId) return;
    const note = window.prompt(`${approve ? 'Approve' : 'Reject'} recovery for ${item.name}: add a decision note.`)?.trim() ?? '';
    if (!note) return;
    setBusy(item.id);
    try { await decideOrganizationRecovery(item.recoveryRequestId, approve, note); setFeedback(`Recovery ${approve ? 'approved' : 'rejected'} for ${item.name}.`); setSelected(null); await load(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Recovery decision failed.'); }
    finally { setBusy(''); }
  };

  const purge = async (item: AdminSubscriberRecord) => {
    const confirmation = window.prompt(`Permanent removal cannot be undone. Type the organization name exactly:\n${item.name}`) ?? '';
    if (confirmation !== item.name) { if (confirmation) setFeedback('Organization name confirmation did not match.'); return; }
    const reason = window.prompt('Provide the permanent-removal reason (minimum 10 characters):')?.trim() ?? '';
    if (!reason) return;
    setBusy(item.id);
    try { await purgeSubscriber(item.id, confirmation, reason); setFeedback(`${item.name} was permanently removed and personal data was anonymized.`); setSelected(null); await load(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Permanent removal failed.'); }
    finally { setBusy(''); }
  };

  const exportAll = async () => {
    setBusy('export');
    try {
      const records: AdminSubscriberRecord[] = [];
      for (let exportPage = 0; ; exportPage += 1) {
        const result = await fetchAdminSubscribers({ status, subscriberType, search, page: exportPage, pageSize: 100 });
        records.push(...result.items);
        if (records.length >= result.total || result.items.length === 0) break;
      }
      const url = URL.createObjectURL(new Blob([exportSubscribersCsv(records)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `manohub-subscribers-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setBusy(''); }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="space-y-6 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-violet-300">Owner control centre</p><h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Subscriber Management</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">View subscriber identity, registration profile, access and subscription state; suspend, close, recover or permanently anonymize an account through audited controls.</p></div><button disabled={busy === 'export'} onClick={() => void exportAll()} className="inline-flex items-center gap-2 border-2 border-white bg-white px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><Download className="h-4 w-4"/>Export filtered subscribers</button></div></section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ['Filtered subscribers', total], ['Active on page', items.filter(item => item.status === 'active').length],
      ['Pending activation', items.filter(item => item.subscriptionStatus === 'pending').length], ['Needs attention', items.filter(item => ['suspended','recovery_pending','closed'].includes(item.status)).length],
    ].map(([label,value]) => <div key={String(label)} className="border-2 border-slate-950 bg-white p-4"><p className="font-display text-3xl font-extrabold">{value}</p><p className="font-mono text-[9px] font-bold uppercase text-slate-500">{label}</p></div>)}</section>

    {feedback && <div role="status" className="border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">{feedback}</div>}
    <section className="border-2 border-slate-950 bg-white">
      <form onSubmit={event => { event.preventDefault(); setPage(0); setSearch(searchInput); }} className="grid gap-3 border-b-2 border-slate-950 p-4 lg:grid-cols-[minmax(220px,1fr)_200px_220px_auto]">
        <label className="flex items-center gap-2 border-2 border-slate-300 px-3"><Search className="h-4 w-4"/><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Name, owner, email or telephone" className="w-full border-0 p-2 text-xs outline-none"/></label>
        <select aria-label="Subscriber type" value={subscriberType ?? ''} onChange={event => { setSubscriberType((event.target.value || null) as SubscriberType | null); setPage(0); }} className="border-2 border-slate-300 p-2 text-xs"><option value="">All subscriber types</option>{SUBSCRIBER_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
        <select aria-label="Account status" value={status ?? ''} onChange={event => { setStatus((event.target.value || null) as SubscriberLifecycleStatus | null); setPage(0); }} className="border-2 border-slate-300 p-2 text-xs">{STATUS_OPTIONS.map(option => <option key={option.label} value={option.value ?? ''}>{option.label}</option>)}</select>
        <button className="inline-flex items-center justify-center gap-2 bg-slate-950 px-4 py-2 text-xs font-bold text-white">Search</button>
      </form>
      {loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin"/></div> : items.length === 0 ? <div className="grid min-h-56 place-items-center text-sm text-slate-500">No subscribers match these filters.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-100 text-left font-mono text-[9px] uppercase"><tr><th className="p-3">Subscriber</th><th className="p-3">Owner/contact</th><th className="p-3">Plan</th><th className="p-3">Account</th><th className="p-3">Registered</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-200">{items.map(item => <tr key={item.id}><td className="p-3"><strong className="block font-display">{item.name}</strong><span className="text-xs text-slate-500">{SUBSCRIBER_TYPES.find(type => type.value === item.subscriberType)?.label ?? item.subscriberType} · {item.organizationType}</span>{item.isProtected && <span className="mt-1 block font-mono text-[8px] font-bold uppercase text-violet-700">Platform-linked · protected</span>}</td><td className="p-3"><span className="block">{item.ownerName ?? 'No owner'}</span><span className="text-xs text-slate-500">{item.ownerEmail ?? item.phone ?? 'No contact'}</span></td><td className="p-3"><span className="block">{item.planName ?? 'No plan'}</span><span className="font-mono text-[9px] uppercase text-slate-500">{item.subscriptionStatus ?? 'none'}</span></td><td className="p-3"><span className="border px-2 py-1 font-mono text-[9px] font-bold uppercase">{item.status.replaceAll('_',' ')}</span></td><td className="p-3 text-xs text-slate-500">{formatDate(item.createdAt)}</td><td className="p-3"><div className="flex justify-end gap-2"><button onClick={() => setSelected(item)} className="inline-flex items-center gap-1 border-2 border-slate-950 px-3 py-2 text-[9px] font-bold uppercase"><Eye className="h-3.5 w-3.5"/>View</button>{!item.isProtected && item.status === 'active' && <button disabled={busy === item.id} onClick={() => void act(item,'suspend')} className="border-2 border-amber-600 px-3 py-2 text-[9px] font-bold uppercase text-amber-800">Suspend</button>}{!item.isProtected && item.status === 'suspended' && <button disabled={busy === item.id} onClick={() => void act(item,'reactivate')} className="border-2 border-emerald-600 px-3 py-2 text-[9px] font-bold uppercase text-emerald-800">Reactivate</button>}</div></td></tr>)}</tbody></table></div>}
      <footer className="flex items-center justify-between border-t-2 border-slate-950 p-4 text-xs"><span>Page {page + 1} of {pages} · {total} subscribers</span><div className="flex gap-2"><button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(current => current - 1)} className="border-2 border-slate-950 p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button><button aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage(current => current + 1)} className="border-2 border-slate-950 p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button></div></footer>
    </section>

    {selected && <div role="dialog" aria-modal="true" aria-label={`Subscriber details for ${selected.name}`} className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"><div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between border-b-2 border-slate-950 pb-4"><div><p className="font-mono text-[9px] font-bold uppercase text-violet-700">{selected.subscriberType} subscriber</p><h3 className="font-display text-2xl font-extrabold">{selected.name}</h3><p className="text-xs text-slate-500">ID {selected.id}</p></div><button aria-label="Close subscriber details" onClick={() => setSelected(null)} className="border-2 border-slate-950 p-2"><X className="h-4 w-4"/></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{[
        ['Owner',selected.ownerName],['Owner email',selected.ownerEmail],['Telephone',selected.phone],['WhatsApp',selected.whatsapp],['Website',selected.website],['Location',[selected.city,selected.district,selected.country].filter(Boolean).join(', ')],['Plan',selected.planName],['Subscription',selected.subscriptionStatus],['Billing cycle',selected.billingCycle],['Period end',formatDate(selected.currentPeriodEnd)],['Registered',formatDate(selected.createdAt)],['Members',String(selected.memberCount)],
      ].map(([label,value]) => <div key={label} className="border border-slate-200 p-3"><p className="font-mono text-[8px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-sm">{value || '—'}</p></div>)}</div>
      {selected.description && <section className="mt-4 border border-slate-200 p-4"><p className="font-mono text-[8px] font-bold uppercase text-slate-400">Organization description</p><p className="mt-2 text-sm leading-6">{selected.description}</p></section>}
      {Object.keys(selected.subscriberDetails).length > 0 && <section className="mt-4 border border-slate-200 p-4"><p className="font-mono text-[8px] font-bold uppercase text-slate-400">Registration details</p><dl className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(selected.subscriberDetails).map(([key,value]) => <div key={key}><dt className="text-[10px] font-bold uppercase text-slate-500">{key.replaceAll('_',' ')}</dt><dd className="text-sm">{value || '—'}</dd></div>)}</dl></section>}
      {selected.statusReason && <div className="mt-4 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm"><strong>Status reason:</strong> {selected.statusReason}</div>}
      {selected.recoveryReason && <div className="mt-4 border-l-4 border-violet-500 bg-violet-50 p-4 text-sm"><strong>Recovery request:</strong> {selected.recoveryReason}</div>}
      <section className="mt-6 border-2 border-slate-950 p-4"><h4 className="font-display text-lg font-extrabold">Administrative controls</h4>{selected.isProtected ? <p className="mt-3 border-l-4 border-violet-500 bg-violet-50 p-3 text-sm text-violet-950">This organization contains active platform owner or administrator access. Subscriber lifecycle actions are blocked to prevent an administrator lockout.</p> : <><div className="mt-4 flex flex-wrap gap-2">{selected.status === 'active' && <><button disabled={busy === selected.id} onClick={() => void act(selected,'suspend')} className="inline-flex items-center gap-2 border-2 border-amber-600 px-3 py-2 text-xs font-bold text-amber-800"><ShieldAlert className="h-4 w-4"/>Suspend access</button><button disabled={busy === selected.id} onClick={() => void act(selected,'close')} className="border-2 border-red-600 px-3 py-2 text-xs font-bold text-red-700">Close account</button></>}{['suspended','closed'].includes(selected.status) && <button disabled={busy === selected.id} onClick={() => void act(selected,'reactivate')} className="border-2 border-emerald-600 px-3 py-2 text-xs font-bold text-emerald-800">Reactivate</button>}{selected.status === 'recovery_pending' && <><button disabled={busy === selected.id} onClick={() => void decide(selected,true)} className="border-2 border-emerald-600 px-3 py-2 text-xs font-bold text-emerald-800">Approve recovery</button><button disabled={busy === selected.id} onClick={() => void decide(selected,false)} className="border-2 border-red-600 px-3 py-2 text-xs font-bold text-red-700">Reject recovery</button></>}{selected.status === 'closed' && selected.recoverableUntil && new Date(selected.recoverableUntil) <= new Date() && <button disabled={busy === selected.id} onClick={() => void purge(selected)} className="inline-flex items-center gap-2 bg-red-700 px-3 py-2 text-xs font-bold text-white"><Trash2 className="h-4 w-4"/>Permanently remove</button>}</div>{selected.status === 'closed' && selected.recoverableUntil && new Date(selected.recoverableUntil) > new Date() && <p className="mt-3 text-xs text-slate-500">Permanent removal becomes available after the recovery period ends on {formatDate(selected.recoverableUntil)}.</p>}</>}</section>
    </div></div>}
  </div>;
}
