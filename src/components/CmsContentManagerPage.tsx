import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, BarChart2, Calendar, Eye, FileText, History, ImagePlus, Loader2, Mail, MessageSquare, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import {
  acquireCmsContentLock,
  addCmsEditorialComment,
  CmsContent,
  CmsContentAnalytics,
  CmsEditorialComment,
  CmsContentRevision,
  CmsContentType,
  CmsTeamRole,
  cmsSlug,
  createCmsContent,
  createCmsEmailDraft,
  fetchAllCmsContent,
  fetchCmsContentAnalytics,
  fetchCmsCurrentRole,
  fetchCmsEditorialComments,
  fetchCmsRevisions,
  moveCmsContentToTrash,
  permanentlyDeleteCmsContent,
  releaseCmsContentLock,
  restoreCmsContentFromTrash,
  restoreCmsRevision,
  saveCmsContent,
  uploadCmsContentImage,
} from '../lib/cmsApi';
import { Advert, fetchAllAdverts } from '../lib/advertisingApi';
import { CmsWorkflowPanel } from './CmsWorkflowPanel';

const EMPTY: CmsContent[] = [];

export function CmsContentManagerPage({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const [items, setItems] = useState<CmsContent[]>(EMPTY);
  const [trash, setTrash] = useState<CmsContent[]>(EMPTY);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CmsContent | null>(null);
  const [revisions, setRevisions] = useState<CmsContentRevision[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CmsContentType>('all');
  const [saving, setSaving] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [comments, setComments] = useState<CmsEditorialComment[]>([]);
  const [comment, setComment] = useState('');
  const [analytics, setAnalytics] = useState<CmsContentAnalytics>({ views: 0, ctaClicks: 0, adImpressions: 0, adClicks: 0, subscriptions: 0 });
  const [localSavedAt, setLocalSavedAt] = useState('');
  const [cmsRole, setCmsRole] = useState<CmsTeamRole | null>(isPlatformAdmin ? 'administrator' : null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const [active, deleted, advertRows] = await Promise.all([fetchAllCmsContent(), fetchAllCmsContent(true), fetchAllAdverts()]);
    setItems(active);
    setTrash(deleted);
    setAdverts(advertRows.filter(advert => advert.status === 'live'));
    setSelectedId(current => current && active.some(item => item.id === current) ? current : active[0]?.id || '');
  }, []);

  useEffect(() => {
    fetchCmsCurrentRole()
      .then(role => setCmsRole(role || (isPlatformAdmin ? 'administrator' : null)))
      .catch(() => setCmsRole(isPlatformAdmin ? 'administrator' : null));
  }, [isPlatformAdmin]);

  useEffect(() => {
    load().catch(error => setFeedback(error instanceof Error ? error.message : 'CMS content could not be loaded.'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const selected = items.find(item => item.id === selectedId);
    setDraft(selected ? { ...selected, tags: [...selected.tags] } : null);
    setShowHistory(false);
    setRevisions([]);
  }, [items, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void acquireCmsContentLock(selectedId);
    Promise.all([fetchCmsEditorialComments(selectedId), fetchCmsContentAnalytics(selectedId)])
      .then(([commentRows, metrics]) => { setComments(commentRows); setAnalytics(metrics); })
      .catch(() => {});
    return () => { void releaseCmsContentLock(selectedId); };
  }, [selectedId]);

  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`manohub.cms.draft.${draft.id}`, JSON.stringify(draft));
        setLocalSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      } catch { /* local recovery is best-effort */ }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const filtered = useMemo(() => items.filter(item =>
    (typeFilter === 'all' || item.contentType === typeFilter)
    && (!query || `${item.title} ${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  ), [items, query, typeFilter]);

  const create = async (type: CmsContentType) => {
    setSaving(`new-${type}`);
    try {
      const created = await createCmsContent(type);
      await load();
      setSelectedId(created.id);
      setFeedback(`${type === 'post' ? 'Post' : 'Page'} draft created.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Content could not be created.');
    } finally {
      setSaving('');
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.slug.trim()) {
      setFeedback('Title and URL slug are required.');
      return;
    }
    setSaving(draft.id);
    try {
      await saveCmsContent(draft);
      await load();
      setFeedback(`${draft.title} saved. The previous version is available in History.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Content could not be saved.');
    } finally {
      setSaving('');
    }
  };

  const insertMarkup = (before: string, after = '') => {
    if (!draft) return;
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? draft.body.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = draft.body.slice(start, end);
    setDraft({ ...draft, body: `${draft.body.slice(0, start)}${before}${selected}${after}${draft.body.slice(end)}` });
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const openHistory = async () => {
    if (!draft) return;
    setSaving(`history-${draft.id}`);
    try {
      setRevisions(await fetchCmsRevisions(draft.id));
      setShowHistory(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'History could not be loaded.');
    } finally {
      setSaving('');
    }
  };

  const restoreRevision = async (revision: CmsContentRevision) => {
    if (!draft || !window.confirm(`Restore revision ${revision.revisionNumber} as a draft?`)) return;
    setSaving(draft.id);
    try {
      await restoreCmsRevision(draft.id, revision);
      await load();
      setShowHistory(false);
      setFeedback(`Revision ${revision.revisionNumber} restored as a draft.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Revision could not be restored.');
    } finally {
      setSaving('');
    }
  };

  const moveToTrash = async () => {
    if (!draft || !window.confirm(`Move “${draft.title}” to Trash?`)) return;
    setSaving(draft.id);
    try {
      await moveCmsContentToTrash(draft.id);
      await load();
      setFeedback(`${draft.title} moved to Trash.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Content could not be moved to Trash.');
    } finally {
      setSaving('');
    }
  };

  const restoreTrashItem = async (item: CmsContent) => {
    setSaving(item.id);
    try {
      await restoreCmsContentFromTrash(item.id);
      await load();
      setFeedback(`${item.title} restored as a draft.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Content could not be restored.');
    } finally {
      setSaving('');
    }
  };

  const deleteForever = async (item: CmsContent) => {
    if (!window.confirm(`Permanently delete “${item.title}” and its revision history?`)) return;
    setSaving(item.id);
    try {
      await permanentlyDeleteCmsContent(item.id);
      await load();
      setFeedback(`${item.title} permanently deleted.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Content could not be permanently deleted.');
    } finally {
      setSaving('');
    }
  };

  const uploadImage = async (file?: File) => {
    if (!draft || !file) return;
    setSaving(`image-${draft.id}`);
    try {
      const url = await uploadCmsContentImage(file);
      setDraft({ ...draft, featuredImageUrl: url, featuredImageAlt: draft.featuredImageAlt || draft.title, socialImageUrl: draft.socialImageUrl || url });
      setFeedback('Image uploaded. Save the content to attach it.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Image could not be uploaded.');
    } finally {
      setSaving('');
    }
  };

  const addComment = async () => {
    if (!draft || !comment.trim()) return;
    setSaving(`comment-${draft.id}`);
    try {
      await addCmsEditorialComment(draft.id, comment);
      setComments(await fetchCmsEditorialComments(draft.id));
      setComment('');
      setFeedback('Editorial comment added.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Comment could not be added.');
    } finally {
      setSaving('');
    }
  };

  const createEmailDraft = async () => {
    if (!draft) return;
    setSaving(`email-${draft.id}`);
    try {
      await createCmsEmailDraft(draft);
      await load();
      setFeedback('Audience email draft created. Open Audience Messaging to review and schedule it.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Email draft could not be created.');
    } finally {
      setSaving('');
    }
  };

  const canEdit = Boolean(draft && (
    cmsRole === 'administrator'
    || (cmsRole === 'writer' && draft.status === 'draft')
    || (cmsRole === 'editor' && ['draft', 'review', 'approved'].includes(draft.status))
    || (cmsRole === 'publisher' && draft.status === 'approved')
  ));

  return <div className="space-y-6 text-left">
    <section className="border border-slate-200 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-300">Editorial publishing</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="font-display text-2xl font-extrabold !text-white">Pages &amp; Posts</h2><p className="mt-1 text-sm text-slate-300">Publish searchable, SEO-ready Manohub stories and permanent pages.</p></div>
        <div className="flex gap-2"><button onClick={() => void create('post')} disabled={Boolean(saving)} className="inline-flex items-center gap-2 bg-violet-600 px-4 py-2.5 text-xs font-bold"><Plus className="h-4 w-4" />New post</button><button onClick={() => void create('page')} disabled={Boolean(saving)} className="inline-flex items-center gap-2 border border-white/40 px-4 py-2.5 text-xs font-bold"><FileText className="h-4 w-4" />New page</button></div>
      </div>
    </section>

    {feedback && <div role="status" className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</div>}

    <CmsWorkflowPanel items={items} selected={draft} fallbackRole={isPlatformAdmin ? 'administrator' : null} onReload={load} onSelect={setSelectedId} onFeedback={setFeedback} />

    <div className="grid gap-5 xl:grid-cols-[310px_1fr]">
      <aside className="border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 border border-slate-300 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search content…" className="w-full !border-0 px-0" /></div>
        <div className="mt-3 grid grid-cols-3 gap-1">{(['all', 'post', 'page'] as const).map(type => <button key={type} onClick={() => setTypeFilter(type)} className={`border px-2 py-2 text-[10px] font-bold uppercase ${typeFilter === type ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200'}`}>{type}</button>)}</div>
        <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto">
          {loading ? <p className="p-6 text-center text-xs text-slate-500">Loading…</p> : filtered.length === 0 ? <p className="border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">No matching content.</p> : filtered.map(item => {
            const scheduled = item.status === 'published' && item.publishedAt && new Date(item.publishedAt) > new Date();
            return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full border p-3 text-left ${selectedId === item.id ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white'}`}><span className="font-mono text-[8px] font-bold uppercase tracking-widest text-slate-400">{item.contentType} · {scheduled ? 'scheduled' : item.status}</span><span className="mt-1 block font-display text-sm font-bold text-slate-950">{item.title}</span><span className="mt-1 block truncate text-[10px] text-slate-500">/{item.contentType === 'post' ? 'insights' : 'pages'}/{item.slug}</span></button>;
          })}
        </div>
      </aside>

      {!draft ? <section className="flex min-h-96 items-center justify-center border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">Create or select content to begin.</section> : <main className="space-y-5">
        <section className="border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-600">{draft.contentType} editor · {localSavedAt ? `recovery saved ${localSavedAt}` : 'autosave ready'}</p><h3 className="mt-1 font-display text-xl font-extrabold">{draft.title}</h3></div><div className="flex flex-wrap gap-2"><a href={`/content-preview/${draft.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-[10px] font-bold uppercase"><Eye className="h-3.5 w-3.5" />Preview draft</a>{(cmsRole === 'publisher' || cmsRole === 'administrator') && <button onClick={() => void createEmailDraft()} disabled={saving === `email-${draft.id}` || Boolean(draft.emailCampaignId)} className="inline-flex items-center gap-2 border border-blue-300 px-3 py-2 text-[10px] font-bold uppercase text-blue-700"><Mail className="h-3.5 w-3.5" />{draft.emailCampaignId ? 'Email draft created' : 'Create email draft'}</button>}<button onClick={() => void openHistory()} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-[10px] font-bold uppercase"><History className="h-3.5 w-3.5" />History</button>{cmsRole === 'administrator' && <button onClick={() => void moveToTrash()} className="inline-flex items-center gap-2 border border-red-300 px-3 py-2 text-[10px] font-bold uppercase text-red-700"><Trash2 className="h-3.5 w-3.5" />Trash</button>}</div></div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Title<input value={draft.title} maxLength={220} onChange={event => setDraft({ ...draft, title: event.target.value })} onBlur={() => { if (draft.slug.startsWith('new-')) setDraft({ ...draft, slug: cmsSlug(draft.title) }); }} className="mt-1 w-full" /></label>
            <label className="text-xs font-bold text-slate-600">URL slug<input value={draft.slug} maxLength={180} onChange={event => setDraft({ ...draft, slug: cmsSlug(event.target.value) })} className="mt-1 w-full" /></label>
            <label className="text-xs font-bold text-slate-600 md:col-span-2">Excerpt<textarea rows={2} value={draft.excerpt} maxLength={500} onChange={event => setDraft({ ...draft, excerpt: event.target.value })} className="mt-1 w-full" /></label>
            <label className="text-xs font-bold text-slate-600">Category<input value={draft.category} maxLength={100} onChange={event => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full" /></label>
            <label className="text-xs font-bold text-slate-600">Tags <span className="font-normal text-slate-400">(comma-separated)</span><input value={draft.tags.join(', ')} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20) })} className="mt-1 w-full" /></label>
            <label className="text-xs font-bold text-slate-600">Author<input value={draft.authorName} maxLength={120} onChange={event => setDraft({ ...draft, authorName: event.target.value })} className="mt-1 w-full" /></label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={draft.isFeatured} onChange={event => setDraft({ ...draft, isFeatured: event.target.checked })} />Feature this content</label>
          </div>

          <div className="mt-5">
            <p className="text-xs font-bold text-slate-600">Content</p>
            <div className="mt-1 flex flex-wrap gap-1 border border-b-0 border-slate-300 bg-slate-50 p-2">{[['Heading', '## '], ['Bold', '**', '**'], ['Quote', '> '], ['List', '- '], ['Link', '[', '](https://)']].map(([label, before, after]) => <button key={label} type="button" onClick={() => insertMarkup(before, after)} className="border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold">{label}</button>)}</div>
            <textarea ref={bodyRef} rows={18} value={draft.body} maxLength={100000} onChange={event => setDraft({ ...draft, body: event.target.value })} placeholder="Write the article. Use the toolbar for headings, lists, quotes, emphasis and links." className="w-full rounded-none" />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="border border-slate-200 bg-white p-5"><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-orange-600">Featured media</p><div className="mt-3 flex gap-3">{draft.featuredImageUrl ? <img src={draft.featuredImageUrl} alt={draft.featuredImageAlt || ''} className="h-24 w-36 border object-cover" /> : <div className="flex h-24 w-36 items-center justify-center bg-slate-100 text-slate-400"><ImagePlus /></div>}<div className="flex-1"><label className="inline-flex cursor-pointer items-center gap-2 border border-slate-950 px-3 py-2 text-[10px] font-bold uppercase"><ImagePlus className="h-3.5 w-3.5" />{saving === `image-${draft.id}` ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event => { void uploadImage(event.target.files?.[0]); event.target.value = ''; }} /></label>{draft.featuredImageUrl && <button onClick={() => setDraft({ ...draft, featuredImageUrl: '', featuredImageAlt: '' })} className="ml-2 text-[10px] font-bold uppercase text-red-700">Remove</button>}<input value={draft.featuredImageAlt} maxLength={240} onChange={event => setDraft({ ...draft, featuredImageAlt: event.target.value })} placeholder="Image description" className="mt-2 w-full" /></div></div></div>
          <div className="border border-slate-200 bg-white p-5"><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-700">Publishing &amp; monetisation</p><div className="mt-3 grid gap-3"><div className="text-xs font-bold text-slate-600">Workflow status<span className="mt-1 block border border-slate-300 bg-slate-50 px-3 py-2 font-mono uppercase text-violet-700">{draft.status}</span></div><label className="text-xs font-bold text-slate-600">Review note<textarea rows={2} value={draft.reviewNote} maxLength={2000} onChange={event => setDraft({ ...draft, reviewNote: event.target.value })} className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600">Publication date<input type="text" readOnly value={draft.publishedAt ? new Date(draft.publishedAt).toLocaleString('en-GB') : 'Set during publishing approval'} className="mt-1 w-full bg-slate-100" /></label><label className="text-xs font-bold text-slate-600">Native advert<select value={draft.nativeAdvertId || ''} onChange={event => setDraft({ ...draft, nativeAdvertId: event.target.value || null })} className="mt-1 w-full"><option value="">Automatic matching</option>{adverts.map(advert => <option key={advert.id} value={advert.id}>{advert.businessName} — {advert.title}</option>)}</select></label></div></div>
        </section>

        <section className="grid gap-3 sm:grid-cols-5">{[{ label: 'Views', value: analytics.views }, { label: 'CTA clicks', value: analytics.ctaClicks }, { label: 'Ad impressions', value: analytics.adImpressions }, { label: 'Ad clicks', value: analytics.adClicks }, { label: 'Subscriptions', value: analytics.subscriptions }].map(metric => <div key={metric.label} className="border border-slate-200 bg-white p-4"><BarChart2 className="h-4 w-4 text-violet-600" /><p className="mt-2 font-display text-2xl font-extrabold">{metric.value}</p><p className="font-mono text-[8px] font-bold uppercase text-slate-500">{metric.label}</p></div>)}</section>

        <section className="border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-violet-600" /><h3 className="font-display font-bold">Editorial discussion</h3></div><div className="mt-3 flex gap-2"><textarea rows={2} value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} placeholder="Add a correction, approval note or editorial instruction…" className="flex-1" /><button onClick={() => void addComment()} disabled={!comment.trim() || saving === `comment-${draft.id}`} className="self-end bg-slate-950 px-4 py-3 text-[10px] font-bold uppercase text-white">Comment</button></div>{comments.length > 0 && <div className="mt-4 space-y-2">{comments.map(item => <div key={item.id} className="border-l-4 border-violet-300 bg-violet-50 p-3"><p className="text-sm text-slate-700">{item.body}</p><p className="mt-1 font-mono text-[8px] uppercase text-slate-400">{new Date(item.createdAt).toLocaleString('en-GB')}</p></div>)}</div>}</section>

        <section className="border border-slate-200 bg-white p-5"><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-blue-700">Search &amp; social</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">SEO title <span className="font-normal text-slate-400">{draft.seoTitle.length}/70</span><input value={draft.seoTitle} maxLength={70} onChange={event => setDraft({ ...draft, seoTitle: event.target.value })} placeholder={draft.title} className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600">Canonical URL<input type="url" value={draft.canonicalUrl} onChange={event => setDraft({ ...draft, canonicalUrl: event.target.value })} placeholder="Leave blank to use Manohub URL" className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">SEO description <span className="font-normal text-slate-400">{draft.seoDescription.length}/180</span><textarea rows={2} value={draft.seoDescription} maxLength={180} onChange={event => setDraft({ ...draft, seoDescription: event.target.value })} placeholder={draft.excerpt} className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Social image URL<input type="url" value={draft.socialImageUrl} onChange={event => setDraft({ ...draft, socialImageUrl: event.target.value })} placeholder="Defaults to featured image" className="mt-1 w-full" /></label></div><div className="mt-4 border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-blue-700">{draft.seoTitle || draft.title}</p><p className="mt-1 text-sm text-slate-800">{draft.seoDescription || draft.excerpt || 'Add a concise description for search results and social sharing.'}</p><p className="mt-1 text-[10px] text-emerald-700">manohub.com/{draft.contentType === 'post' ? 'insights' : 'pages'}/{draft.slug}</p></div></section>

        <button onClick={() => void save()} disabled={saving === draft.id || !canEdit} className="inline-flex items-center gap-2 bg-emerald-600 px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving === draft.id ? 'Saving…' : canEdit ? 'Save content' : 'Locked at this stage'}</button>

        {showHistory && <section className="border border-violet-200 bg-violet-50 p-5"><div className="flex items-center justify-between"><h3 className="font-display font-bold">Revision history</h3><button aria-label="Close history" onClick={() => setShowHistory(false)}><X className="h-4 w-4" /></button></div>{revisions.length === 0 ? <p className="mt-3 text-sm text-slate-500">No earlier versions yet.</p> : <div className="mt-3 grid gap-2">{revisions.map(revision => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-3 border border-violet-200 bg-white p-3"><div><p className="text-xs font-bold">Revision {revision.revisionNumber} · {String(revision.snapshot.title || 'Untitled')}</p><p className="font-mono text-[9px] text-slate-400">{new Date(revision.createdAt).toLocaleString('en-GB')}</p></div><button onClick={() => void restoreRevision(revision)} className="inline-flex items-center gap-2 border border-slate-950 px-3 py-2 text-[10px] font-bold uppercase"><RotateCcw className="h-3.5 w-3.5" />Restore as draft</button></div>)}</div>}</section>}
      </main>}
    </div>

    <section className="border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-violet-600" /><div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-600">Publishing calendar</p><h3 className="font-display text-lg font-extrabold">Upcoming and recent content</h3></div></div><div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">{items.filter(item => item.publishedAt).sort((a, b) => new Date(a.publishedAt || 0).getTime() - new Date(b.publishedAt || 0).getTime()).slice(0, 12).map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className="flex items-center justify-between gap-3 border border-slate-200 p-3 text-left"><div><p className="font-display text-sm font-bold">{item.title}</p><p className="font-mono text-[8px] uppercase text-slate-400">{item.status}</p></div><span className="font-mono text-[9px] font-bold text-violet-700">{item.publishedAt ? new Date(item.publishedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></button>)}</div></section>

    {cmsRole === 'administrator' && <section className="border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">Recovery</p><h3 className="font-display text-lg font-extrabold">Content Trash</h3></div><Archive className="text-slate-400" /></div>{trash.length === 0 ? <p className="mt-4 border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Trash is empty.</p> : <div className="mt-4 grid gap-2">{trash.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border bg-white p-4"><div><p className="font-display font-bold">{item.title}</p><p className="font-mono text-[9px] uppercase text-slate-400">{item.contentType} · deleted {item.deletedAt ? new Date(item.deletedAt).toLocaleString('en-GB') : ''}</p></div><div className="flex gap-2"><button onClick={() => void restoreTrashItem(item)} disabled={saving === item.id} className="inline-flex items-center gap-2 border border-emerald-500 px-3 py-2 text-[10px] font-bold uppercase text-emerald-700"><RotateCcw className="h-3.5 w-3.5" />Restore</button><button onClick={() => void deleteForever(item)} disabled={saving === item.id} className="inline-flex items-center gap-2 border border-red-300 px-3 py-2 text-[10px] font-bold uppercase text-red-700"><Trash2 className="h-3.5 w-3.5" />Delete forever</button></div></article>)}</div>}</section>}
  </div>;
}
