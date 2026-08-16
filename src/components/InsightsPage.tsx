import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Loader2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CmsContent, fetchPublishedCmsContent } from '../lib/cmsApi';
import { PublicSubscriptionSection } from './PublicSubscriptionSection';

export function InsightsPage() {
  const [items, setItems] = useState<CmsContent[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublishedCmsContent('post').then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map(item => item.category))).sort()], [items]);
  const filtered = useMemo(() => items.filter(item =>
    (category === 'All' || item.category === category)
    && (!query || `${item.title} ${item.excerpt} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  ), [category, items, query]);

  return <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
    <header className="border-b-2 border-[#0F172A] bg-white px-6 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between"><Link to="/"><img src="/hyderra-horizontal.svg?v=2" alt="Hyderra" className="h-10 w-auto" /></Link><Link to="/" className="font-mono text-[10px] font-bold uppercase tracking-widest">Back to Hyderra</Link></div></header>
    <section className="border-b-2 border-[#0F172A] bg-[#0F172A] px-6 py-16 text-white"><div className="mx-auto max-w-7xl"><p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-violet-300">Knowledge &amp; market intelligence</p><h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold !text-white sm:text-5xl">Insights for businesses across the Mano River region.</h1><p className="mt-4 max-w-2xl text-slate-300">Practical tender guidance, market updates, business stories and opportunities from Hyderra.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-10"><div className="grid gap-3 md:grid-cols-[1fr_auto]"><label className="flex items-center gap-2 border-2 border-[#0F172A] bg-white px-4"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search insights…" className="w-full !border-0 px-0" /></label><div className="flex flex-wrap gap-2">{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`border px-3 py-2 font-mono text-[9px] font-bold uppercase ${category === item ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-300 bg-white'}`}>{item}</button>)}</div></div>
      {loading ? <div className="flex justify-center p-16 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading insights…</div> : filtered.length === 0 ? <div className="mt-8 border-2 border-dashed border-slate-300 bg-white p-12 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No published insights match your search.</p></div> : <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{filtered.map(item => <article key={item.id} className="flex flex-col overflow-hidden border-2 border-[#0F172A] bg-white">{item.featuredImageUrl ? <img src={item.featuredImageUrl} alt={item.featuredImageAlt || ''} loading="lazy" className="h-48 w-full border-b-2 border-[#0F172A] object-cover" /> : <div className="h-48 border-b-2 border-[#0F172A] bg-gradient-to-br from-violet-100 via-amber-50 to-emerald-100" />}<div className="flex flex-1 flex-col p-5"><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-700">{item.category}</p><h2 className="mt-3 font-display text-xl font-extrabold">{item.title}</h2><p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{item.excerpt}</p><div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4"><span className="font-mono text-[9px] text-slate-400">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-GB') : ''}</span><Link to={`/insights/${item.slug}`} className="inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase text-emerald-700">Read insight <ArrowRight className="h-3.5 w-3.5" /></Link></div></div></article>)}</div>}
    </section>
    <PublicSubscriptionSection />
  </main>;
}
