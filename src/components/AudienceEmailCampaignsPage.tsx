import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, Mail, Pause, Play, Send, Users } from 'lucide-react';
import {
  AudienceEmailCampaign,
  cancelAudienceEmailCampaign,
  createAudienceEmailCampaign,
  dispatchAudienceEmailCampaign,
  fetchAudienceEmailCampaigns,
  fetchPublicAudienceSubscribers,
  PublicAudienceSubscriber,
  queueAudienceEmailCampaign,
  sendAudienceEmailTest,
} from '../lib/procurementApi';

const INTERESTS = ['Tenders', 'Jobs', 'Business offers', 'Events', 'Training', 'Products & services'];
const FREQUENCIES = ['urgent', 'daily', 'weekly'];

export function AudienceEmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AudienceEmailCampaign[]>([]);
  const [subscribers, setSubscribers] = useState<PublicAudienceSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [feedback, setFeedback] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaHref, setCtaHref] = useState('');
  const [targetInterests, setTargetInterests] = useState<string[]>([]);
  const [targetLocations, setTargetLocations] = useState<string[]>([]);
  const [targetFrequencies, setTargetFrequencies] = useState<string[]>(FREQUENCIES);
  const [scheduledAt, setScheduledAt] = useState('');
  const [testEmail, setTestEmail] = useState('');

  const load = useCallback(async () => {
    const [campaignRows, subscriberRows] = await Promise.all([
      fetchAudienceEmailCampaigns(),
      fetchPublicAudienceSubscribers(),
    ]);
    setCampaigns(campaignRows);
    setSubscribers(subscriberRows);
  }, []);

  useEffect(() => {
    load().catch(error => setFeedback(error instanceof Error ? error.message : 'Messaging data could not be loaded.'))
      .finally(() => setLoading(false));
  }, [load]);

  const locations = useMemo(() => Array.from(new Set(subscribers.flatMap(subscriber => subscriber.locations))).sort(), [subscribers]);
  const estimatedAudience = useMemo(() => subscribers.filter(subscriber =>
    subscriber.status === 'active'
    && Boolean(subscriber.email)
    && subscriber.preferredChannels.includes('email')
    && (!targetInterests.length || subscriber.interests.some(interest => targetInterests.includes(interest)))
    && (!targetLocations.length || subscriber.locations.some(location => targetLocations.includes(location)))
    && targetFrequencies.includes(subscriber.frequency)
  ).length, [subscribers, targetFrequencies, targetInterests, targetLocations]);

  const toggle = (value: string, values: string[], setter: (next: string[]) => void) => {
    setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  };

  const reset = () => {
    setName('');
    setSubject('');
    setPreviewText('');
    setBody('');
    setCtaLabel('');
    setCtaHref('');
    setTargetInterests([]);
    setTargetLocations([]);
    setTargetFrequencies(FREQUENCIES);
    setScheduledAt('');
  };

  const saveCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (!targetFrequencies.length) {
      setFeedback('Choose at least one subscriber frequency.');
      return;
    }
    setSaving('campaign');
    try {
      const schedule = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const campaign = await createAudienceEmailCampaign({
        name, subject, previewText, body, ctaLabel, ctaHref,
        targetInterests, targetLocations, targetFrequencies, scheduledAt: schedule,
      });
      const queuedCount = await queueAudienceEmailCampaign(campaign.id);
      if (!schedule || new Date(schedule) <= new Date()) {
        await dispatchAudienceEmailCampaign(campaign.id).catch(() => {});
      }
      await load();
      reset();
      setFeedback(`${campaign.name} saved with ${queuedCount} eligible recipient${queuedCount === 1 ? '' : 's'}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The campaign could not be created.');
    } finally {
      setSaving('');
    }
  };

  const sendTest = async () => {
    if (!testEmail || !subject || !body) {
      setFeedback('Enter a test email, subject and message body first.');
      return;
    }
    setSaving('test');
    try {
      await sendAudienceEmailTest({ to: testEmail, subject, previewText, body, ctaLabel, ctaHref });
      setFeedback(`Test email sent to ${testEmail}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The test email could not be sent.');
    } finally {
      setSaving('');
    }
  };

  const dispatch = async (campaign: AudienceEmailCampaign) => {
    setSaving(campaign.id);
    try {
      await dispatchAudienceEmailCampaign(campaign.id);
      await load();
      setFeedback(`${campaign.name} was submitted to the delivery service.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The campaign could not be dispatched.');
    } finally {
      setSaving('');
    }
  };

  const cancel = async (campaign: AudienceEmailCampaign) => {
    setSaving(campaign.id);
    try {
      await cancelAudienceEmailCampaign(campaign.id);
      await load();
      setFeedback(`${campaign.name} cancelled.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The campaign could not be cancelled.');
    } finally {
      setSaving('');
    }
  };

  return <div className="space-y-6 text-left">
    <section className="border border-slate-200 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-blue-300">Audience delivery</p>
      <h2 className="mt-1 font-display text-2xl font-extrabold !text-white">Email Campaigns</h2>
      <p className="mt-1 text-sm text-slate-300">Compose, target, schedule and measure Manohub audience messages.</p>
    </section>

    {feedback && <div role="status" className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</div>}

    <form onSubmit={saveCampaign} className="border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700">Campaign composer</p><h3 className="mt-1 font-display text-xl font-extrabold">Create an audience email</h3></div>
        <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-right"><p className="font-display text-2xl font-extrabold text-emerald-800">{estimatedAudience}</p><p className="font-mono text-[9px] uppercase tracking-widest text-emerald-700">Estimated recipients</p></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">Internal campaign name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold text-slate-600">Email subject<input required maxLength={180} value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">Preview text<input maxLength={220} value={previewText} onChange={event => setPreviewText(event.target.value)} placeholder="Short text shown beside the subject in the inbox" className="mt-1 w-full" /></label>
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">Message<textarea required rows={7} maxLength={12000} value={body} onChange={event => setBody(event.target.value)} placeholder="Write the audience update…" className="mt-1 w-full" /></label>
        <label className="text-xs font-bold text-slate-600">Button label<input maxLength={80} value={ctaLabel} onChange={event => setCtaLabel(event.target.value)} placeholder="Explore Manohub" className="mt-1 w-full" /></label>
        <label className="text-xs font-bold text-slate-600">Button link<input type="url" maxLength={1000} value={ctaHref} onChange={event => setCtaHref(event.target.value)} placeholder="https://manohub.com/…" className="mt-1 w-full" /></label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <fieldset><legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Interests · all if empty</legend><div className="mt-2 flex flex-wrap gap-2">{INTERESTS.map(item => <button key={item} type="button" aria-pressed={targetInterests.includes(item)} onClick={() => toggle(item, targetInterests, setTargetInterests)} className={`border px-2.5 py-2 text-[10px] font-bold ${targetInterests.includes(item) ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 text-slate-600'}`}>{item}</button>)}</div></fieldset>
        <fieldset><legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Locations · all if empty</legend><div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">{locations.map(item => <button key={item} type="button" aria-pressed={targetLocations.includes(item)} onClick={() => toggle(item, targetLocations, setTargetLocations)} className={`border px-2.5 py-2 text-[10px] font-bold ${targetLocations.includes(item) ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-600'}`}>{item}</button>)}</div></fieldset>
        <fieldset><legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Subscriber frequency</legend><div className="mt-2 flex flex-wrap gap-2">{FREQUENCIES.map(item => <button key={item} type="button" aria-pressed={targetFrequencies.includes(item)} onClick={() => toggle(item, targetFrequencies, setTargetFrequencies)} className={`border px-2.5 py-2 text-[10px] font-bold uppercase ${targetFrequencies.includes(item) ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-600'}`}>{item}</button>)}</div></fieldset>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-bold text-slate-600">Schedule <span className="font-normal text-slate-400">(blank sends now)</span><input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold text-slate-600">Test recipient<input type="email" value={testEmail} onChange={event => setTestEmail(event.target.value)} placeholder="reviewer@example.com" className="mt-1 w-full" /></label>
        <button type="button" onClick={() => void sendTest()} disabled={saving === 'test'} className="mt-auto inline-flex h-11 items-center justify-center gap-2 border border-slate-950 bg-white px-4 text-xs font-bold"><Mail className="h-4 w-4" /> Send test</button>
      </div>
      <button type="submit" disabled={saving === 'campaign' || estimatedAudience === 0} className="mt-5 inline-flex items-center gap-2 bg-emerald-600 px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50">{saving === 'campaign' ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduledAt ? <Calendar className="h-4 w-4" /> : <Send className="h-4 w-4" />}{scheduledAt ? 'Schedule campaign' : 'Queue and send'}</button>
    </form>

    <section className="border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between"><h3 className="font-display text-lg font-extrabold">Delivery history</h3><span className="font-mono text-[9px] uppercase tracking-widest text-slate-400">{campaigns.length} campaigns</span></div>
      {loading ? <div className="flex justify-center p-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading campaigns…</div> : campaigns.length === 0 ? <p className="mt-5 border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No email campaigns yet.</p> : <div className="mt-4 grid gap-3">{campaigns.map(campaign => <article key={campaign.id} className="border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="bg-slate-950 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-white">{campaign.status}</span>{campaign.scheduledAt && <span className="font-mono text-[9px] text-slate-400">{new Date(campaign.scheduledAt).toLocaleString('en-GB')}</span>}</div><h4 className="mt-2 font-display font-bold">{campaign.name}</h4><p className="mt-1 text-xs text-slate-500">{campaign.subject}</p></div><div className="grid grid-cols-3 gap-4 text-right"><div><p className="font-display text-xl font-extrabold">{campaign.queuedCount}</p><p className="text-[9px] uppercase text-slate-400">Queued</p></div><div><p className="font-display text-xl font-extrabold text-emerald-700">{campaign.sentCount}</p><p className="text-[9px] uppercase text-slate-400">Sent</p></div><div><p className="font-display text-xl font-extrabold text-red-600">{campaign.failedCount}</p><p className="text-[9px] uppercase text-slate-400">Failed</p></div></div></div>{['queued', 'scheduled', 'processing'].includes(campaign.status) && <div className="mt-4 flex gap-2"><button onClick={() => void dispatch(campaign)} disabled={saving === campaign.id} className="inline-flex items-center gap-2 bg-slate-950 px-3 py-2 text-[10px] font-bold uppercase text-white"><Play className="h-3.5 w-3.5" /> Dispatch now</button><button onClick={() => void cancel(campaign)} disabled={saving === campaign.id} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-[10px] font-bold uppercase"><Pause className="h-3.5 w-3.5" /> Cancel</button></div>}</article>)}</div>}
    </section>
  </div>;
}
