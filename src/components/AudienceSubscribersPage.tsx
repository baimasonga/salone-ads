import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Mail, Search, ShieldCheck, Users } from 'lucide-react';
import {
  fetchPublicAudienceSubscribers,
  PublicAudienceSubscriber,
  updatePublicAudienceSubscriberStatus,
} from '../lib/audienceApi';

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function AudienceSubscribersPage() {
  const [subscribers, setSubscribers] = useState<PublicAudienceSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [feedback, setFeedback] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    fetchPublicAudienceSubscribers()
      .then(setSubscribers)
      .catch(error => setFeedback(error instanceof Error ? error.message : 'Audience data could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => subscribers.filter(subscriber => {
    const matchesStatus = status === 'all' || subscriber.status === status;
    const haystack = [subscriber.fullName, subscriber.email, subscriber.phone, ...subscriber.interests, ...subscriber.locations].filter(Boolean).join(' ').toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }), [query, status, subscribers]);

  const setSubscriberStatus = async (subscriber: PublicAudienceSubscriber, nextStatus: PublicAudienceSubscriber['status']) => {
    setSaving(subscriber.id);
    try {
      await updatePublicAudienceSubscriberStatus(subscriber.id, nextStatus);
      setSubscribers(current => current.map(item => item.id === subscriber.id ? { ...item, status: nextStatus } : item));
      setFeedback(`${subscriber.fullName || subscriber.email || subscriber.phone} is now ${nextStatus}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The subscriber could not be updated.');
    } finally {
      setSaving('');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Interests', 'Locations', 'Channels', 'Frequency', 'Status', 'Consent date'],
      ...visible.map(subscriber => [
        subscriber.fullName,
        subscriber.email ?? '',
        subscriber.phone ?? '',
        subscriber.interests.join('; '),
        subscriber.locations.join('; '),
        subscriber.preferredChannels.join('; '),
        subscriber.frequency,
        subscriber.status,
        subscriber.consentAt,
      ]),
    ];
    const csv = rows.map(row => row.map(value => csvCell(value)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `manohub-audience-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = subscribers.filter(subscriber => subscriber.status === 'active').length;
  const whatsAppCount = subscribers.filter(subscriber => subscriber.preferredChannels.includes('whatsapp')).length;
  const weeklyCount = subscribers.filter(subscriber => subscriber.frequency === 'weekly').length;

  return <div className="space-y-6 text-left">
    <section className="border border-slate-200 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-emerald-300">Owned audience</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="font-display text-2xl font-extrabold !text-white">Audience Subscribers</h2><p className="mt-1 text-sm text-slate-300">Consent-aware contacts gathered from Manohub’s public experience.</p></div>
        <button onClick={exportCsv} disabled={!visible.length} className="inline-flex items-center gap-2 bg-emerald-600 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50"><Download className="h-4 w-4" /> Export filtered</button>
      </div>
    </section>

    {feedback && <div role="status" className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="border border-slate-200 bg-white p-5"><Users className="h-5 w-5 text-emerald-600" /><p className="mt-3 font-display text-3xl font-extrabold">{activeCount}</p><p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Active subscribers</p></div>
      <div className="border border-slate-200 bg-white p-5"><Mail className="h-5 w-5 text-blue-600" /><p className="mt-3 font-display text-3xl font-extrabold">{weeklyCount}</p><p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Weekly digest</p></div>
      <div className="border border-slate-200 bg-white p-5"><ShieldCheck className="h-5 w-5 text-orange-500" /><p className="mt-3 font-display text-3xl font-extrabold">{whatsAppCount}</p><p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">WhatsApp audience</p></div>
    </div>

    <section className="border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, contact, interest or location" className="w-full pl-10" /></label>
        <select aria-label="Subscriber status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="suppressed">Suppressed</option><option value="unsubscribed">Unsubscribed</option></select>
      </div>
    </section>

    {loading
      ? <div className="flex justify-center p-12 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading audience…</div>
      : visible.length === 0
        ? <div className="border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">No subscribers match this view.</div>
        : <div className="grid gap-3">
          {visible.map(subscriber => <article key={subscriber.id} className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-bold text-slate-950">{subscriber.fullName || 'Unnamed subscriber'}</h3><span className={`px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${subscriber.status === 'active' ? 'bg-emerald-100 text-emerald-800' : subscriber.status === 'suppressed' ? 'bg-orange-100 text-orange-800' : 'bg-slate-200 text-slate-600'}`}>{subscriber.status}</span></div>
                <p className="mt-1 text-xs text-slate-500">{[subscriber.email, subscriber.phone].filter(Boolean).join(' · ')}</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-slate-400">Consent: {new Date(subscriber.consentAt).toLocaleString('en-GB')} · {subscriber.frequency} · {subscriber.preferredChannels.join(' + ')}</p>
              </div>
              <select aria-label={`Status for ${subscriber.fullName || subscriber.email || 'subscriber'}`} value={subscriber.status} disabled={saving === subscriber.id} onChange={event => void setSubscriberStatus(subscriber, event.target.value as PublicAudienceSubscriber['status'])} className="min-w-36 text-xs"><option value="active">Active</option><option value="suppressed">Suppressed</option><option value="unsubscribed">Unsubscribed</option></select>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{subscriber.interests.map(interest => <span key={interest} className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">{interest}</span>)}{subscriber.locations.map(location => <span key={location} className="border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800">{location}</span>)}</div>
          </article>)}
        </div>}
  </div>;
}
