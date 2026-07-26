import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, Pause, Play, Plus, Save, Trash2 } from 'lucide-react';
import {
  Advert,
  assignLandingAdvert,
  createLandingContentBlock,
  fetchAllAdverts,
  fetchAllLandingContent,
  fetchLandingAdvertPlacements,
  fetchLandingPlacementOptions,
  LandingAdvertPlacement,
  LandingContentBlock,
  removeLandingAdvertAssignment,
  updateLandingAdvertAssignment,
  updateLandingContent,
} from '../lib/procurementApi';

type PlacementOption = { id: string; code: string; name: string };

export function LandingCmsPage() {
  const [blocks, setBlocks] = useState<LandingContentBlock[]>([]);
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [placements, setPlacements] = useState<PlacementOption[]>([]);
  const [assignments, setAssignments] = useState<LandingAdvertPlacement[]>([]);
  const [placementId, setPlacementId] = useState('');
  const [advertId, setAdvertId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    const [content, advertOptions, placementOptions, assignmentRows] = await Promise.all([
      fetchAllLandingContent(),
      fetchAllAdverts(),
      fetchLandingPlacementOptions(),
      fetchLandingAdvertPlacements(),
    ]);
    setBlocks(content);
    setAdverts(advertOptions);
    setPlacements(placementOptions);
    setAssignments(assignmentRows);
    setPlacementId(current => current || placementOptions[0]?.id || '');
    setAdvertId(current => current || advertOptions[0]?.id || '');
  }, []);

  useEffect(() => {
    load().catch(error => setFeedback(error instanceof Error ? error.message : 'CMS data could not be loaded.'))
      .finally(() => setLoading(false));
  }, [load]);

  const change = (id: string, patch: Partial<LandingContentBlock>) => {
    setBlocks(current => current.map(block => block.id === id ? { ...block, ...patch } : block));
  };

  const save = async (block: LandingContentBlock) => {
    setSaving(block.id);
    try {
      await updateLandingContent(block);
      setFeedback(`${block.title} saved. The previous version was added to revision history.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Content could not be saved.');
    } finally {
      setSaving('');
    }
  };

  const createBlock = async () => {
    setSaving('new-block');
    try {
      await createLandingContentBlock();
      await load();
      setFeedback('Draft editorial block created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The block could not be created.');
    } finally {
      setSaving('');
    }
  };

  const assignAdvert = async () => {
    if (!placementId || !advertId) return;
    setSaving('assignment');
    try {
      await assignLandingAdvert(placementId, advertId);
      await load();
      setFeedback('Advert assigned. It is now eligible for the selected landing-page placement.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The advert could not be assigned.');
    } finally {
      setSaving('');
    }
  };

  const changeAssignment = (id: string, patch: Partial<LandingAdvertPlacement>) => {
    setAssignments(current => current.map(assignment => assignment.assignmentId === id ? { ...assignment, ...patch } : assignment));
  };

  const saveAssignment = async (assignment: LandingAdvertPlacement) => {
    setSaving(assignment.assignmentId);
    try {
      await updateLandingAdvertAssignment(assignment.assignmentId, assignment);
      setFeedback(`${assignment.advert.title} delivery settings saved.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The delivery settings could not be saved.');
    } finally {
      setSaving('');
    }
  };

  const removeAssignment = async (assignment: LandingAdvertPlacement) => {
    if (!window.confirm(`Remove “${assignment.advert.title}” from ${assignment.placementName}?`)) return;
    setSaving(assignment.assignmentId);
    try {
      await removeLandingAdvertAssignment(assignment.assignmentId);
      setAssignments(current => current.filter(item => item.assignmentId !== assignment.assignmentId));
      setFeedback('Advert removed from the placement.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The assignment could not be removed.');
    } finally {
      setSaving('');
    }
  };

  return <div className="space-y-6 text-left">
    <section className="border border-slate-200 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-orange-300">Public publishing</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-extrabold !text-white">Landing Page CMS</h2>
          <p className="mt-1 text-sm text-slate-300">Manage public stories and advert inventory without changing Manohub’s theme.</p>
        </div>
        <button onClick={() => void createBlock()} disabled={saving === 'new-block'} className="inline-flex items-center gap-2 bg-orange-500 px-4 py-2.5 text-xs font-bold text-white">
          {saving === 'new-block' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          New editorial block
        </button>
      </div>
    </section>

    {feedback && <div role="status" className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</div>}

    {!loading && <section className="border border-slate-200 bg-white p-5">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-orange-600">Advert inventory</p>
      <h3 className="mt-1 font-display text-lg font-extrabold text-slate-950">Assign an advert placement</h3>
      <p className="mt-1 text-sm text-slate-500">Eligible live adverts rotate by weight and respect a visitor session cap.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
        <select aria-label="Landing placement" value={placementId} onChange={event => setPlacementId(event.target.value)}>
          {placements.map(placement => <option key={placement.id} value={placement.id}>{placement.name}</option>)}
        </select>
        <select aria-label="Advert" value={advertId} onChange={event => setAdvertId(event.target.value)}>
          {adverts.map(advert => <option key={advert.id} value={advert.id}>{advert.businessName} — {advert.title}</option>)}
        </select>
        <button onClick={() => void assignAdvert()} disabled={!placementId || !advertId || saving === 'assignment'} className="inline-flex items-center justify-center gap-2 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">
          {saving === 'assignment' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Assign advert
        </button>
      </div>
      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="font-display text-sm font-extrabold text-slate-950">Current assignments</h4>
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">{assignments.length} configured</span>
        </div>
        {assignments.length === 0
          ? <p className="border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No adverts have been assigned yet.</p>
          : <div className="grid gap-3">
            {assignments.map(assignment => <article key={assignment.assignmentId} className={`border p-4 ${assignment.isActive ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-slate-100 opacity-75'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-slate-950 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-white">{assignment.placementName}</span>
                    <span className={`px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${assignment.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{assignment.isActive ? 'Active' : 'Paused'}</span>
                  </div>
                  <h5 className="mt-2 font-display font-bold text-slate-950">{assignment.advert.title}</h5>
                  <p className="text-xs text-slate-500">{assignment.advert.businessName} · {assignment.advert.status}</p>
                </div>
                <a href={`/adverts/${assignment.advert.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-widest"><Eye className="h-3.5 w-3.5" /> Preview</a>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Priority<input type="number" value={assignment.priority} onChange={event => changeAssignment(assignment.assignmentId, { priority: Number(event.target.value) })} className="mt-1 w-full" /></label>
                <label className="text-[10px] font-bold uppercase text-slate-500">Weight<input type="number" min="1" max="100" value={assignment.weight} onChange={event => changeAssignment(assignment.assignmentId, { weight: Number(event.target.value) })} className="mt-1 w-full" /></label>
                <label className="text-[10px] font-bold uppercase text-slate-500">Session cap<input type="number" min="1" max="20" value={assignment.sessionFrequencyCap} onChange={event => changeAssignment(assignment.assignmentId, { sessionFrequencyCap: Number(event.target.value) })} className="mt-1 w-full" /></label>
                <label className="text-[10px] font-bold uppercase text-slate-500">Starts<input type="datetime-local" value={assignment.startsAt?.slice(0, 16) || ''} onChange={event => changeAssignment(assignment.assignmentId, { startsAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full" /></label>
                <label className="text-[10px] font-bold uppercase text-slate-500">Ends<input type="datetime-local" value={assignment.endsAt?.slice(0, 16) || ''} onChange={event => changeAssignment(assignment.assignmentId, { endsAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full" /></label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void saveAssignment(assignment)} disabled={saving === assignment.assignmentId} className="inline-flex items-center gap-2 bg-slate-950 px-3 py-2 text-[10px] font-bold uppercase text-white"><Save className="h-3.5 w-3.5" /> Save delivery</button>
                <button onClick={() => { const next = { ...assignment, isActive: !assignment.isActive }; changeAssignment(assignment.assignmentId, { isActive: next.isActive }); void saveAssignment(next); }} disabled={saving === assignment.assignmentId} className="inline-flex items-center gap-2 border border-slate-950 bg-white px-3 py-2 text-[10px] font-bold uppercase text-slate-950">
                  {assignment.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{assignment.isActive ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => void removeAssignment(assignment)} disabled={saving === assignment.assignmentId} className="inline-flex items-center gap-2 border border-red-300 bg-white px-3 py-2 text-[10px] font-bold uppercase text-red-700"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
              </div>
            </article>)}
          </div>}
      </div>
    </section>}

    {loading
      ? <div className="flex justify-center p-12 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading content…</div>
      : <div className="grid gap-5">
        {blocks.map(block => <article key={block.id} className="border bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase text-slate-400">{block.section} · {block.blockKey}</p>
              <h3 className="mt-1 font-display text-lg font-bold">{block.title}</h3>
            </div>
            <span className="border px-2 py-1 text-[9px] font-bold uppercase">{block.status}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={block.eyebrow} onChange={event => change(block.id, { eyebrow: event.target.value })} placeholder="Eyebrow" />
            <input value={block.title} onChange={event => change(block.id, { title: event.target.value })} placeholder="Title" />
            <textarea rows={3} value={block.body} onChange={event => change(block.id, { body: event.target.value })} placeholder="Body" className="md:col-span-2" />
            <input value={block.ctaLabel} onChange={event => change(block.id, { ctaLabel: event.target.value })} placeholder="CTA label" />
            <input value={block.ctaHref} onChange={event => change(block.id, { ctaHref: event.target.value })} placeholder="CTA link" />
            <label className="text-xs font-bold uppercase text-slate-500">Section<select value={block.section} onChange={event => change(block.id, { section: event.target.value })} className="mt-1 w-full"><option value="editorial">Editorial feature</option><option value="hero">Homepage hero</option><option value="advert_marketplace">Advert marketplace</option></select></label>
            <label className="text-xs font-bold uppercase text-slate-500">Display order<input type="number" value={block.sortOrder} onChange={event => change(block.id, { sortOrder: Number(event.target.value) })} className="mt-1 w-full" /></label>
            <label className="text-xs font-bold uppercase text-slate-500">Accent<input type="color" value={block.accentColor} onChange={event => change(block.id, { accentColor: event.target.value })} className="mt-1 h-11 w-full" /></label>
            <label className="text-xs font-bold uppercase text-slate-500">Surface<input type="color" value={block.surfaceColor} onChange={event => change(block.id, { surfaceColor: event.target.value })} className="mt-1 h-11 w-full" /></label>
            <select value={block.status} onChange={event => change(block.id, { status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void save(block)} disabled={saving === block.id} className="inline-flex items-center gap-2 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" />{saving === block.id ? 'Saving…' : 'Save block'}</button>
            <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-slate-950 px-4 py-2.5 text-xs font-bold"><Eye className="h-3.5 w-3.5" />Preview live page</a>
          </div>
        </article>)}
      </div>}
  </div>;
}
