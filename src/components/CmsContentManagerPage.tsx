import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Eye, FileText, History, ImagePlus, Loader2, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import {
  CmsContent,
  CmsContentRevision,
  CmsContentStatus,
  CmsContentType,
  cmsSlug,
  createCmsContent,
  fetchAllCmsContent,
  fetchCmsRevisions,
  moveCmsContentToTrash,
  permanentlyDeleteCmsContent,
  restoreCmsContentFromTrash,
  restoreCmsRevision,
  saveCmsContent,
  uploadCmsContentImage,
} from '../lib/cmsApi';

const EMPTY: CmsContent[] = [];

export function CmsContentManagerPage() {
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const [active, deleted] = await Promise.all([fetchAllCmsContent(), fetchAllCmsContent(true)]);
    setItems(active);
    setTrash(deleted);
    setSelectedId(current => current && active.some(item => item.id === current) ? current : active[0]?.id || '');
  }, []);

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

  const updateStatus = (status: CmsContentStatus) => {
    if (!draft) return;
    setDraft({ ...draft, status, publishedAt: status === 'published' ? draft.publishedAt : null });
  };

  return <div className="space-y-6 text-left">
    <section className="border border-slate-200 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-300">Editorial publishing</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="font-display text-2xl font-extrabold !text-white">Pages &amp; Posts</h2><p className="mt-1 text-sm text-slate-300">Publish searchable, SEO-ready Manohub stories and permanent pages.</p></div>
        <div className="flex gap-2"><button onClick={() => void create('post')} disabled={Boolean(saving)} className="inline-flex items-center gap-2 bg-violet-600 px-4 py-2.5 text-xs font-bold"><Plus className="h-4 w-4" />New post</button><button onClick={() => void create('page')} disabled={Boolean(saving)} className="inline-flex items-center gap-2 border border-white/40 px-4 py-2.5 text-xs font-bold"><FileText className="h-4 w-4" />New page</button></div>
      </div>
    </section>

    {feedback && <div role="status" className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</div>}

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
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-600">{draft.contentType} editor</p><h3 className="mt-1 font-display text-xl font-extrabold">{draft.title}</h3></div><div className="flex flex-wrap gap-2"><a href={`/content-preview/${draft.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-[10px] font-bold uppercase"><Eye className="h-3.5 w-3.5" />Preview draft</a><button onClick={() => void openHistory()} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-[10px] font-bold uppercase"><History className="h-3.5 w-3.5" />History</button><button onClick={() => void moveToTrash()} className="inline-flex items-center gap-2 border border-red-300 px-3 py-2 text-[10px] font-bold uppercase text-red-700"><Trash2 className="h-3.5 w-3.5" />Trash</button></div></div>

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
          <div className="border border-slate-200 bg-white p-5"><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-700">Publishing</p><div className="mt-3 grid gap-3"><label className="text-xs font-bold text-slate-600">Status<select value={draft.status} onChange={event => updateStatus(event.target.value as CmsContentStatus)} className="mt-1 w-full"><option value="draft">Draft</option><option value="review">In review</option><option value="published">Published / scheduled</option><option value="archived">Archived</option></select></label><label className="text-xs font-bold text-slate-600">Publish date and time<input type="datetime-local" disabled={draft.status !== 'published'} value={draft.publishedAt?.slice(0, 16) || ''} onChange={event => setDraft({ ...draft, publishedAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full disabled:bg-slate-100" /></label></div></div>
        </section>

        <section className="border border-slate-200 bg-white p-5"><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-blue-700">Search &amp; social</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">SEO title <span className="font-normal text-slate-400">{draft.seoTitle.length}/70</span><input value={draft.seoTitle} maxLength={70} onChange={event => setDraft({ ...draft, seoTitle: event.target.value })} placeholder={draft.title} className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600">Canonical URL<input type="url" value={draft.canonicalUrl} onChange={event => setDraft({ ...draft, canonicalUrl: event.target.value })} placeholder="Leave blank to use Manohub URL" className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">SEO description <span className="font-normal text-slate-400">{draft.seoDescription.length}/180</span><textarea rows={2} value={draft.seoDescription} maxLength={180} onChange={event => setDraft({ ...draft, seoDescription: event.target.value })} placeholder={draft.excerpt} className="mt-1 w-full" /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Social image URL<input type="url" value={draft.socialImageUrl} onChange={event => setDraft({ ...draft, socialImageUrl: event.target.value })} placeholder="Defaults to featured image" className="mt-1 w-full" /></label></div><div className="mt-4 border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-blue-700">{draft.seoTitle || draft.title}</p><p className="mt-1 text-sm text-slate-800">{draft.seoDescription || draft.excerpt || 'Add a concise description for search results and social sharing.'}</p><p className="mt-1 text-[10px] text-emerald-700">manohub.com/{draft.contentType === 'post' ? 'insights' : 'pages'}/{draft.slug}</p></div></section>

        <button onClick={() => void save()} disabled={saving === draft.id} className="inline-flex items-center gap-2 bg-emerald-600 px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white"><Save className="h-4 w-4" />{saving === draft.id ? 'Saving…' : 'Save content'}</button>

        {showHistory && <section className="border border-violet-200 bg-violet-50 p-5"><div className="flex items-center justify-between"><h3 className="font-display font-bold">Revision history</h3><button aria-label="Close history" onClick={() => setShowHistory(false)}><X className="h-4 w-4" /></button></div>{revisions.length === 0 ? <p className="mt-3 text-sm text-slate-500">No earlier versions yet.</p> : <div className="mt-3 grid gap-2">{revisions.map(revision => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-3 border border-violet-200 bg-white p-3"><div><p className="text-xs font-bold">Revision {revision.revisionNumber} · {String(revision.snapshot.title || 'Untitled')}</p><p className="font-mono text-[9px] text-slate-400">{new Date(revision.createdAt).toLocaleString('en-GB')}</p></div><button onClick={() => void restoreRevision(revision)} className="inline-flex items-center gap-2 border border-slate-950 px-3 py-2 text-[10px] font-bold uppercase"><RotateCcw className="h-3.5 w-3.5" />Restore as draft</button></div>)}</div>}</section>}
      </main>}
    </div>

    <section className="border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">Recovery</p><h3 className="font-display text-lg font-extrabold">Content Trash</h3></div><Archive className="text-slate-400" /></div>{trash.length === 0 ? <p className="mt-4 border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Trash is empty.</p> : <div className="mt-4 grid gap-2">{trash.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border bg-white p-4"><div><p className="font-display font-bold">{item.title}</p><p className="font-mono text-[9px] uppercase text-slate-400">{item.contentType} · deleted {item.deletedAt ? new Date(item.deletedAt).toLocaleString('en-GB') : ''}</p></div><div className="flex gap-2"><button onClick={() => void restoreTrashItem(item)} disabled={saving === item.id} className="inline-flex items-center gap-2 border border-emerald-500 px-3 py-2 text-[10px] font-bold uppercase text-emerald-700"><RotateCcw className="h-3.5 w-3.5" />Restore</button><button onClick={() => void deleteForever(item)} disabled={saving === item.id} className="inline-flex items-center gap-2 border border-red-300 px-3 py-2 text-[10px] font-bold uppercase text-red-700"><Trash2 className="h-3.5 w-3.5" />Delete forever</button></div></article>)}</div>}</section>
  </div>;
}
