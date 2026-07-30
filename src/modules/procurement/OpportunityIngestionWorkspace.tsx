import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  FilePlus2,
  Globe2,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import {
  createOpportunityIngestionItem,
  createOpportunitySource,
  fetchOpportunityIngestionItems,
  fetchOpportunitySources,
  promoteOpportunityIngestionItem,
  submitOpportunityIngestionItem,
  type OpportunityIngestionItem,
  type OpportunitySource,
} from '../../lib/procurementApi';

interface OpportunityIngestionWorkspaceProps {
  isPlatformAdmin: boolean;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function OpportunityIngestionWorkspace({ isPlatformAdmin }: OpportunityIngestionWorkspaceProps) {
  const [sources, setSources] = useState<OpportunitySource[]>([]);
  const [items, setItems] = useState<OpportunityIngestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceKind, setSourceKind] = useState<OpportunitySource['sourceKind']>('website');
  const [trustLevel, setTrustLevel] = useState<OpportunitySource['trustLevel']>('unverified');
  const [selectedSource, setSelectedSource] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [title, setTitle] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [summary, setSummary] = useState('');
  const [deadline, setDeadline] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const [sourceRows, itemRows] = await Promise.all([
        fetchOpportunitySources(),
        fetchOpportunityIngestionItems(),
      ]);
      setSources(sourceRows);
      setItems(itemRows);
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not load the ingestion workspace.')}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    drafts: items.filter((item) => item.status === 'draft').length,
    ready: items.filter((item) => item.status === 'ready_for_review').length,
    promoted: items.filter((item) => item.status === 'promoted').length,
    flagged: items.filter((item) => item.qualityScore < 75 || item.duplicateOpportunityId).length,
  }), [items]);

  const addSource = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('source');
    setFeedback('');
    try {
      const source = await createOpportunitySource({
        name: sourceName,
        baseUrl: sourceUrl,
        sourceKind,
        trustLevel,
      });
      setSources((current) => [...current, source].sort((a, b) => a.name.localeCompare(b.name)));
      setSourceName('');
      setSourceUrl('');
      setFeedback('Source added to the monitoring registry.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not add source.')}`);
    } finally {
      setBusy('');
    }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('item');
    setFeedback('');
    try {
      const item = await createOpportunityIngestionItem({
        sourceId: selectedSource,
        sourceUrl: itemUrl,
        title,
        buyerName,
        summary,
        submissionDeadline: deadline ? new Date(deadline).toISOString() : undefined,
      });
      setItems((current) => [item, ...current]);
      setTitle('');
      setBuyerName('');
      setSummary('');
      setDeadline('');
      setItemUrl('');
      setFeedback('Opportunity draft captured. Review its quality checks before submission.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not capture opportunity.')}`);
    } finally {
      setBusy('');
    }
  };

  const submit = async (item: OpportunityIngestionItem) => {
    setBusy(item.id);
    setFeedback('');
    try {
      const updated = await submitOpportunityIngestionItem(item.id);
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
      setFeedback('Opportunity passed quality controls and is ready for promotion.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Quality checks blocked submission.')}`);
    } finally {
      setBusy('');
    }
  };

  const promote = async (item: OpportunityIngestionItem) => {
    setBusy(item.id);
    setFeedback('');
    try {
      const opportunityId = await promoteOpportunityIngestionItem(item.id);
      setItems((current) => current.map((row) => row.id === item.id
        ? { ...row, status: 'promoted', opportunityId }
        : row));
      setFeedback('Opportunity promoted to the administrator tender-review queue.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not promote opportunity.')}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6 text-left">
      <section className="relative overflow-hidden border-2 border-slate-950 bg-slate-950 p-6 text-white md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="absolute -bottom-20 right-32 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[.24em] text-emerald-300">Inventory engine</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold !text-white">Opportunity Ingestion</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Register trusted sources, capture tender notices, resolve quality warnings and send verified records into the existing review workflow.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Drafts', counts.drafts, 'bg-sky-400'],
          ['Ready', counts.ready, 'bg-violet-400'],
          ['Promoted', counts.promoted, 'bg-emerald-400'],
          ['Needs attention', counts.flagged, 'bg-amber-300'],
        ].map(([label, value, accent]) => (
          <div key={label} className="relative overflow-hidden border-2 border-slate-950 bg-white p-5">
            <span className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
            <span className="mt-3 block font-display text-3xl font-extrabold">{value}</span>
          </div>
        ))}
      </section>

      {feedback && (
        <div role="status" className={`border-2 p-4 text-sm ${feedback.startsWith('Error:')
          ? 'border-red-700 bg-red-50 text-red-800'
          : 'border-emerald-700 bg-emerald-50 text-emerald-900'}`}>
          {feedback}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={addSource} className="border-2 border-slate-950 bg-white p-5">
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-violet-600" />
            <div><p className="font-mono text-[9px] font-bold uppercase text-violet-700">Source registry</p><h3 className="font-display text-lg font-extrabold">Add monitoring source</h3></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Source name<input required value={sourceName} onChange={(e) => setSourceName(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" placeholder="National Public Procurement Authority" /></label>
            <label className="text-xs font-bold text-slate-600">Base URL<input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" placeholder="https://…" /></label>
            <label className="text-xs font-bold text-slate-600">Source type<select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as OpportunitySource['sourceKind'])} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal"><option value="website">Website</option><option value="document">Document</option><option value="email">Email</option><option value="manual">Manual research</option></select></label>
            <label className="text-xs font-bold text-slate-600">Trust level<select value={trustLevel} onChange={(e) => setTrustLevel(e.target.value as OpportunitySource['trustLevel'])} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal"><option value="unverified">Unverified</option><option value="trusted">Trusted</option><option value="verified">Verified</option></select></label>
          </div>
          <button disabled={busy === 'source'} className="mt-4 inline-flex items-center gap-2 bg-slate-950 px-4 py-3 font-mono text-[10px] font-bold uppercase text-white disabled:opacity-50"><Plus className="h-4 w-4" />{busy === 'source' ? 'Saving…' : 'Add source'}</button>
        </form>

        <form onSubmit={addItem} className="border-2 border-slate-950 bg-white p-5">
          <div className="flex items-center gap-3">
            <FilePlus2 className="h-5 w-5 text-emerald-600" />
            <div><p className="font-mono text-[9px] font-bold uppercase text-emerald-700">Research queue</p><h3 className="font-display text-lg font-extrabold">Capture opportunity</h3></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Registered source<select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal"><option value="">Manual / direct URL</option>{sources.filter((source) => source.status === 'active').map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Notice URL<input type="url" value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" placeholder="https://…" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Tender title<input required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Buyer name<input required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Submission deadline<input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Summary<textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
          </div>
          <button disabled={busy === 'item'} className="mt-4 inline-flex items-center gap-2 bg-emerald-600 px-4 py-3 font-mono text-[10px] font-bold uppercase text-white disabled:opacity-50"><Database className="h-4 w-4" />{busy === 'item' ? 'Capturing…' : 'Capture draft'}</button>
        </form>
      </section>

      <section className="border-2 border-slate-950 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-950 p-5">
          <div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-700">Quality-controlled inventory</p><h3 className="font-display text-xl font-extrabold">Research queue</h3></div>
          <button onClick={() => void load()} className="border-2 border-slate-950 px-3 py-2 font-mono text-[9px] font-bold uppercase">Refresh</button>
        </div>
        {loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin" /></div> : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No opportunities captured yet.</div>
        ) : (
          <div className="divide-y-2 divide-slate-200">
            {items.map((item) => {
              const blocked = item.qualityScore < 75 || Boolean(item.duplicateOpportunityId);
              return (
                <article key={item.id} className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_170px_240px] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-display font-extrabold">{item.title || 'Untitled opportunity'}</h4>
                      <span className="border border-slate-300 px-2 py-0.5 font-mono text-[8px] font-bold uppercase">{item.status.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.buyerName || 'Buyer missing'} · {item.sourceName || 'Direct research'}</p>
                    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>}
                    {item.qualityIssues.length > 0 && <div className="mt-3 flex items-start gap-2 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{item.qualityIssues.join(' · ')}</span></div>}
                  </div>
                  <div>
                    <p className="font-mono text-[9px] font-bold uppercase text-slate-500">Quality score</p>
                    <p className={`mt-1 font-display text-3xl font-extrabold ${blocked ? 'text-amber-700' : 'text-emerald-700'}`}>{item.qualityScore}<span className="text-sm">/100</span></p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {item.status === 'draft' && <button disabled={busy === item.id || blocked} onClick={() => void submit(item)} className="inline-flex items-center gap-2 border-2 border-violet-700 px-3 py-2 font-mono text-[9px] font-bold uppercase text-violet-800 disabled:opacity-40"><ShieldCheck className="h-4 w-4" />Submit checks</button>}
                    {item.status === 'ready_for_review' && <button disabled={busy === item.id} onClick={() => void promote(item)} className="inline-flex items-center gap-2 bg-emerald-600 px-3 py-2 font-mono text-[9px] font-bold uppercase text-white disabled:opacity-40"><ArrowRight className="h-4 w-4" />Promote to review</button>}
                    {item.status === 'promoted' && <span className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />In tender review</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {!isPlatformAdmin && <p className="border-l-4 border-violet-500 bg-violet-50 p-3 text-xs text-violet-900">Researcher access can prepare and promote records into review. Only platform administrators can publish them.</p>}
    </div>
  );
}
