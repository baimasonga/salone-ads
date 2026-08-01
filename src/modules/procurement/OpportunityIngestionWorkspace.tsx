import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  CheckCircle2,
  Database,
  ExternalLink,
  FilePlus2,
  Globe2,
  History,
  Link2,
  LoaderCircle,
  Plus,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  assignOpportunitySourcingTask,
  createOpportunityIngestionItem,
  createOpportunitySource,
  fetchOpportunityIngestionItems,
  fetchOpportunitySourcingTaskEvents,
  fetchOpportunitySourcingTasks,
  fetchOpportunitySources,
  fetchPlatformResearchers,
  promoteOpportunityIngestionItem,
  recordOpportunitySourceCheck,
  submitOpportunityIngestionItem,
  updateOpportunitySourcingTask,
  type OpportunityIngestionItem,
  type OpportunitySource,
  type OpportunitySourcingTask,
  type OpportunitySourcingTaskEvent,
  type PlatformResearcher,
} from '../../lib/procurement/sourcingApi';
import { extractOpportunityFromText } from './opportunityExtraction';

interface OpportunityIngestionWorkspaceProps {
  isPlatformAdmin: boolean;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function OpportunityIngestionWorkspace({ isPlatformAdmin }: OpportunityIngestionWorkspaceProps) {
  const [sources, setSources] = useState<OpportunitySource[]>([]);
  const [items, setItems] = useState<OpportunityIngestionItem[]>([]);
  const [tasks, setTasks] = useState<OpportunitySourcingTask[]>([]);
  const [taskEvents, setTaskEvents] = useState<OpportunitySourcingTaskEvent[]>([]);
  const [researchers, setResearchers] = useState<PlatformResearcher[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [taskFilter, setTaskFilter] = useState<'active' | 'overdue' | 'completed' | 'all'>('active');
  const [taskQuery, setTaskQuery] = useState('');
  const [expandedHistory, setExpandedHistory] = useState('');
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [taskEvidence, setTaskEvidence] = useState<Record<string, string>>({});
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
  const [rawText, setRawText] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [extractionConfidence, setExtractionConfidence] = useState<number | null>(null);
  const [extractedFields, setExtractedFields] = useState<string[]>([]);
  const [checkStatuses, setCheckStatuses] = useState<Record<string, 'success' | 'no_change' | 'blocked' | 'error'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const [sourceRows, itemRows, taskRows, eventRows, researcherRows] = await Promise.all([
        fetchOpportunitySources(),
        fetchOpportunityIngestionItems(),
        fetchOpportunitySourcingTasks(),
        fetchOpportunitySourcingTaskEvents(),
        isPlatformAdmin ? fetchPlatformResearchers() : Promise.resolve([]),
      ]);
      setSources(sourceRows);
      setItems(itemRows);
      setTasks(taskRows);
      setTaskEvents(eventRows);
      setTaskNotes(Object.fromEntries(taskRows.map((task) => [task.id, task.notes ?? ''])));
      setResearchers(researcherRows);
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not load the ingestion workspace.')}`);
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    drafts: items.filter((item) => item.status === 'draft').length,
    ready: items.filter((item) => item.status === 'ready_for_review').length,
    promoted: items.filter((item) => item.status === 'promoted').length,
    flagged: items.filter((item) => item.qualityScore < 75 || item.duplicateOpportunityId).length,
  }), [items]);

  const taskCounts = useMemo(() => {
    const now = Date.now();
    return {
      active: tasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length,
      overdue: tasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now && !['completed', 'cancelled'].includes(task.status)).length,
      completed: tasks.filter((task) => task.status === 'completed').length,
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const now = Date.now();
    const query = taskQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      const overdue = Boolean(task.dueAt && new Date(task.dueAt).getTime() < now && !['completed', 'cancelled'].includes(task.status));
      const matchesFilter = taskFilter === 'all'
        || (taskFilter === 'active' && !['completed', 'cancelled'].includes(task.status))
        || (taskFilter === 'overdue' && overdue)
        || (taskFilter === 'completed' && task.status === 'completed');
      return matchesFilter && (!query || task.searchTerm.toLowerCase().includes(query));
    });
  }, [taskFilter, taskQuery, tasks]);

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
        externalReference,
        rawText,
        extractionMethod: extractionConfidence == null ? 'manual' : 'assisted_text',
        extractionConfidence: extractionConfidence ?? undefined,
        extractedFields,
        submissionDeadline: deadline ? new Date(deadline).toISOString() : undefined,
        sourcingTaskId: selectedTask || undefined,
      });
      setItems((current) => [item, ...current]);
      setTitle('');
      setBuyerName('');
      setSummary('');
      setDeadline('');
      setItemUrl('');
      setRawText('');
      setExternalReference('');
      setExtractionConfidence(null);
      setExtractedFields([]);
      setSelectedTask('');
      await load();
      setFeedback('Opportunity draft captured. Review its quality checks before submission.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not capture opportunity.')}`);
    } finally {
      setBusy('');
    }
  };

  const assignTask = async (task: OpportunitySourcingTask, assignedTo: string) => {
    if (!assignedTo) return;
    setBusy(`task-${task.id}`);
    setFeedback('');
    try {
      await assignOpportunitySourcingTask({
        taskId: task.id,
        assignedTo,
        priority: task.priority,
        dueAt: task.dueAt ?? undefined,
      });
      await load();
      setFeedback('Sourcing task assigned and the researcher has been notified.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not assign sourcing task.')}`);
    } finally {
      setBusy('');
    }
  };

  const beginTask = async (task: OpportunitySourcingTask) => {
    setBusy(`task-${task.id}`);
    setFeedback('');
    try {
      await updateOpportunitySourcingTask({
        taskId: task.id,
        status: 'in_progress',
        notes: task.notes ?? undefined,
        sourceLinks: task.sourceLinks,
      });
      setSelectedTask(task.id);
      setTitle(task.searchTerm);
      setSummary(`Sourced in response to ${task.demandCount} zero-result search${task.demandCount === 1 ? '' : 'es'} for “${task.searchTerm}”.`);
      await load();
      setFeedback('Task linked to the capture form below. Add the verified notice and source evidence.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not start sourcing task.')}`);
    } finally {
      setBusy('');
    }
  };

  const saveTaskProgress = async (task: OpportunitySourcingTask) => {
    const evidence = taskEvidence[task.id]?.trim();
    if (evidence && !/^https?:\/\//i.test(evidence)) {
      setFeedback('Error: Evidence must be a complete http:// or https:// URL.');
      return;
    }
    setBusy(`task-${task.id}`);
    setFeedback('');
    try {
      const sourceLinks = evidence && !task.sourceLinks.includes(evidence)
        ? [...task.sourceLinks, evidence]
        : task.sourceLinks;
      await updateOpportunitySourcingTask({
        taskId: task.id,
        status: task.status === 'assigned' ? 'in_progress' : task.status as 'in_progress' | 'candidate_found' | 'cancelled',
        notes: taskNotes[task.id],
        sourceLinks,
      });
      setTaskEvidence((current) => ({ ...current, [task.id]: '' }));
      await load();
      setFeedback('Task progress and source evidence saved.');
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not save task progress.')}`);
    } finally {
      setBusy('');
    }
  };

  const extractDraft = () => {
    const result = extractOpportunityFromText(rawText);
    setTitle(result.title);
    setBuyerName(result.buyerName);
    setDeadline(result.submissionDeadline);
    setItemUrl(result.sourceUrl);
    setExternalReference(result.externalReference);
    setSummary(result.summary);
    setExtractionConfidence(result.confidence);
    setExtractedFields(result.detectedFields);
    setFeedback(result.detectedFields.length > 0
      ? `Assisted extraction found ${result.detectedFields.length} fields at ${result.confidence}% confidence. Review every field before capture.`
      : 'Error: No labelled procurement fields were detected. Enter the notice details manually.');
  };

  const recordCheck = async (source: OpportunitySource) => {
    setBusy(`check-${source.id}`);
    setFeedback('');
    try {
      await recordOpportunitySourceCheck({
        sourceId: source.id,
        status: checkStatuses[source.id] ?? 'no_change',
      });
      await load();
      setFeedback(`Monitoring check recorded for ${source.name}.`);
    } catch (error) {
      setFeedback(`Error: ${message(error, 'Could not record source check.')}`);
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

      <section className="border-2 border-slate-950 bg-white">
        <div className="flex flex-col gap-3 border-b-2 border-slate-950 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-amber-700" />
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-amber-800">Demand-led research</p>
              <h3 className="font-display text-lg font-extrabold">Search-gap sourcing tasks</h3>
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold uppercase text-slate-600">{taskCounts.active} active · {taskCounts.overdue} overdue</span>
        </div>
        <div className="grid gap-3 border-b-2 border-slate-950 p-4 md:grid-cols-[1fr_auto]">
          <input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} className="border-2 border-slate-300 px-3 py-2 text-xs" placeholder="Filter tasks by search term…" />
          <div className="flex flex-wrap gap-1">
            {([
              ['active', `Active ${taskCounts.active}`],
              ['overdue', `Overdue ${taskCounts.overdue}`],
              ['completed', `Completed ${taskCounts.completed}`],
              ['all', `All ${tasks.length}`],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)} className={`border-2 border-slate-950 px-3 py-2 font-mono text-[8px] font-bold uppercase ${taskFilter === value ? 'bg-slate-950 text-white' : 'bg-white text-slate-950'}`}>{label}</button>
            ))}
          </div>
        </div>
        {tasks.length === 0 ? (
          <div className="p-6">
            <p className="text-sm font-bold text-slate-800">{isPlatformAdmin ? 'No search demand gaps have become tasks yet.' : 'No sourcing tasks are assigned to you.'}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{isPlatformAdmin ? 'When visitors search and receive no results, create a task from Platform Analytics → Content gaps. Real demand—not demonstration data—will appear here.' : 'An administrator can assign a demand-led research task to your account.'}</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No sourcing tasks match this filter.</p>
        ) : (
          <div className="grid gap-px bg-slate-300 md:grid-cols-2">
            {visibleTasks.map((task) => {
              const overdue = Boolean(task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !['completed', 'cancelled'].includes(task.status));
              const events = taskEvents.filter((event) => event.taskId === task.id);
              return (
              <article key={task.id} className="bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] font-bold uppercase text-violet-700">{task.demandCount} searches · {task.priority} priority</p>
                    <h4 className="mt-1 font-display text-base font-extrabold">{task.searchTerm}</h4>
                  </div>
                  <span className={`border border-slate-950 px-2 py-1 font-mono text-[8px] font-bold uppercase ${overdue ? 'bg-red-100 text-red-800' : 'bg-slate-50'}`}>{overdue ? 'Overdue' : task.status.replace('_', ' ')}</span>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  {task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : 'No due date'} · Latest demand {new Date(task.latestSearchAt).toLocaleDateString()}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {isPlatformAdmin && !['completed', 'cancelled'].includes(task.status) && (
                    <select
                      aria-label={`Assign ${task.searchTerm}`}
                      value={task.assignedTo ?? ''}
                      disabled={busy === `task-${task.id}`}
                      onChange={(event) => void assignTask(task, event.target.value)}
                      className="min-w-44 border-2 border-slate-950 bg-white px-3 py-2 text-xs"
                    >
                      <option value="">Assign researcher</option>
                      {researchers.map((researcher) => <option key={researcher.id} value={researcher.id}>{researcher.fullName}</option>)}
                    </select>
                  )}
                  {!['completed', 'cancelled'].includes(task.status) && task.assignedTo && (
                    <button type="button" disabled={busy === `task-${task.id}`} onClick={() => void beginTask(task)} className="inline-flex items-center gap-2 bg-slate-950 px-3 py-2 font-mono text-[9px] font-bold uppercase text-white disabled:opacity-50">
                      <FilePlus2 className="h-3.5 w-3.5" /> Use for capture
                    </button>
                  )}
                </div>
                {task.assignedTo && !['completed', 'cancelled'].includes(task.status) && (
                  <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                    <textarea rows={2} value={taskNotes[task.id] ?? ''} onChange={(event) => setTaskNotes((current) => ({ ...current, [task.id]: event.target.value }))} className="w-full border border-slate-300 p-2 text-xs" placeholder="Research notes and next action…" />
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1"><Link2 className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" /><input type="url" value={taskEvidence[task.id] ?? ''} onChange={(event) => setTaskEvidence((current) => ({ ...current, [task.id]: event.target.value }))} className="w-full border border-slate-300 py-2 pl-7 pr-2 text-xs" placeholder="Add evidence URL…" /></div>
                      <button type="button" disabled={busy === `task-${task.id}`} onClick={() => void saveTaskProgress(task)} className="border border-slate-950 px-3 py-2 font-mono text-[8px] font-bold uppercase">Save</button>
                    </div>
                  </div>
                )}
                <button type="button" onClick={() => setExpandedHistory(expandedHistory === task.id ? '' : task.id)} className="mt-4 inline-flex items-center gap-1 font-mono text-[8px] font-bold uppercase text-violet-800"><History className="h-3.5 w-3.5" /> History ({events.length})</button>
                {expandedHistory === task.id && (
                  <ol className="mt-2 border-l-2 border-violet-200 pl-3">
                    {events.length === 0 ? <li className="text-[10px] text-slate-400">History begins with the next task update.</li> : events.slice(0, 8).map((event) => (
                      <li key={event.id} className="mb-2 text-[10px] text-slate-600"><strong className="uppercase text-slate-900">{event.eventType.replace('_', ' ')}</strong> · {new Date(event.createdAt).toLocaleString()}{event.previousStatus && event.nextStatus && event.previousStatus !== event.nextStatus ? ` · ${event.previousStatus} → ${event.nextStatus}` : ''}</li>
                    ))}
                  </ol>
                )}
              </article>
            )})}
          </div>
        )}
      </section>

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
          {selectedTask && <div className="mt-4 border border-amber-500 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Linked to sourcing task: {tasks.find((task) => task.id === selectedTask)?.searchTerm}</div>}
          <div className="mt-5 border-2 border-violet-300 bg-violet-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-700">Assisted extraction</p>
                <p className="mt-1 text-xs leading-5 text-violet-950">Paste notice text with labelled fields such as Tender Title, Procuring Entity and Submission Deadline. Extraction runs locally and never publishes.</p>
              </div>
            </div>
            <textarea value={rawText} onChange={(event) => {
              setRawText(event.target.value);
              setExtractionConfidence(null);
              setExtractedFields([]);
            }} rows={5} className="mt-3 w-full border-2 border-violet-300 bg-white p-3 text-xs" placeholder="Paste the source notice text here…" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={!rawText.trim()} onClick={extractDraft} className="inline-flex items-center gap-2 bg-violet-700 px-4 py-2 font-mono text-[9px] font-bold uppercase text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />Extract fields</button>
              {extractionConfidence != null && <span className="font-mono text-[9px] font-bold uppercase text-violet-900">{extractionConfidence}% confidence · {extractedFields.length} fields</span>}
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Registered source<select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal"><option value="">Manual / direct URL</option>{sources.filter((source) => source.status === 'active').map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Notice URL<input type="url" value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" placeholder="https://…" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Tender title<input required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Buyer name<input required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Submission deadline<input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Tender reference<input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Summary<textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1 w-full border-2 border-slate-300 p-3 font-normal" /></label>
          </div>
          <button disabled={busy === 'item'} className="mt-4 inline-flex items-center gap-2 bg-emerald-600 px-4 py-3 font-mono text-[10px] font-bold uppercase text-white disabled:opacity-50"><Database className="h-4 w-4" />{busy === 'item' ? 'Capturing…' : 'Capture draft'}</button>
        </form>
      </section>

      <section className="border-2 border-slate-950 bg-white">
        <div className="border-b-2 border-slate-950 p-5">
          <div className="flex items-center gap-3">
            <Radar className="h-5 w-5 text-sky-600" />
            <div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-sky-700">Human-supervised monitoring</p><h3 className="font-display text-xl font-extrabold">Source check schedule</h3></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Open each source, inspect it, then record the outcome. ManoHub does not claim a source was checked until a researcher confirms it.</p>
        </div>
        {sources.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Add a monitoring source to begin.</p> : (
          <div className="grid gap-px bg-slate-300 md:grid-cols-2">
            {sources.map((source) => {
              const due = !source.nextCheckAt || new Date(source.nextCheckAt).getTime() <= Date.now();
              return (
                <article key={source.id} className="bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h4 className="font-display font-extrabold">{source.name}</h4><p className="mt-1 font-mono text-[8px] font-bold uppercase text-slate-500">{source.trustLevel} · {source.sourceKind}</p></div>
                    <span className={`border px-2 py-1 font-mono text-[8px] font-bold uppercase ${due ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-emerald-500 bg-emerald-50 text-emerald-800'}`}>{due ? 'Check due' : 'Scheduled'}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Last result: {source.lastCheckStatus?.replace('_', ' ') ?? 'Never checked'}{source.consecutiveFailures > 0 ? ` · ${source.consecutiveFailures} consecutive issue(s)` : ''}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {source.baseUrl && <a href={source.baseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 border-2 border-slate-950 px-3 py-2 font-mono text-[9px] font-bold uppercase">Open source <ExternalLink className="h-3 w-3" /></a>}
                    <select aria-label={`Check result for ${source.name}`} value={checkStatuses[source.id] ?? 'no_change'} onChange={(event) => setCheckStatuses((current) => ({ ...current, [source.id]: event.target.value as 'success' | 'no_change' | 'blocked' | 'error' }))} className="border-2 border-slate-950 px-2 text-xs">
                      <option value="no_change">No change</option><option value="success">New notices found</option><option value="blocked">Source blocked</option><option value="error">Source error</option>
                    </select>
                    <button type="button" disabled={busy === `check-${source.id}`} onClick={() => void recordCheck(source)} className="bg-sky-600 px-3 py-2 font-mono text-[9px] font-bold uppercase text-white disabled:opacity-40">{busy === `check-${source.id}` ? 'Recording…' : 'Record check'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
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
                      {item.extractionMethod === 'assisted_text' && <span className="border border-violet-300 bg-violet-50 px-2 py-0.5 font-mono text-[8px] font-bold uppercase text-violet-800">Assisted · {item.extractionConfidence ?? 0}%</span>}
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
