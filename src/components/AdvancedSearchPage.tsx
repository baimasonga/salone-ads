import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookmarkPlus, CheckCircle2, Loader2, MapPin, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import {
  deleteDiscoverySavedSearch,
  fetchDiscoverySavedSearches,
  fetchDiscoverySuggestions,
  fetchDiscoveryTrends,
  saveDiscoverySearch,
  searchDiscovery,
  type DiscoveryFilters,
  type DiscoveryResult,
  type DiscoveryResultType,
  type DiscoverySavedSearch,
  type DiscoverySort,
} from '../lib/searchDiscoveryApi';
import { readResilienceCache, withNetworkRetry, writeResilienceCache } from '../lib/networkResilience';

const RESULT_TYPES: Array<[DiscoveryResultType, string]> = [
  ['tender', 'Tenders'], ['award', 'Awards'], ['project', 'Projects'], ['advert', 'Adverts'],
  ['service', 'Services'], ['business', 'Businesses'], ['influencer', 'Influencers'],
];
const DISTRICTS = ['Bo', 'Bombali', 'Bonthe', 'Falaba', 'Kailahun', 'Kambia', 'Karene', 'Kenema', 'Koinadugu', 'Kono', 'Moyamba', 'Port Loko', 'Pujehun', 'Tonkolili', 'Western Area Rural', 'Western Area Urban'];
const RECENT_KEY = 'manohub.discovery.recent.v1';

function readRecent(): string[] {
  try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]').filter((value: unknown) => typeof value === 'string').slice(0, 6); }
  catch { return []; }
}

function resultLabel(type: DiscoveryResultType) {
  return RESULT_TYPES.find(([value]) => value === type)?.[1].replace(/s$/, '') ?? type;
}

export function AdvancedSearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [resultTypes, setResultTypes] = useState<DiscoveryResultType[]>(() => {
    const type = params.get('type') as DiscoveryResultType | null;
    return type && RESULT_TYPES.some(([value]) => value === type) ? [type] : [];
  });
  const [district, setDistrict] = useState(params.get('district') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [sort, setSort] = useState<DiscoverySort>('relevance');
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ term: string; resultType: DiscoveryResultType }>>([]);
  const [trends, setTrends] = useState<Array<{ term: string; searches: number }>>([]);
  const [saved, setSaved] = useState<DiscoverySavedSearch[]>([]);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const filters = useMemo<DiscoveryFilters>(() => ({
    query: query.trim() || undefined,
    resultTypes: resultTypes.length ? resultTypes : undefined,
    district: district || undefined,
    category: category.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    minValue: minValue ? Number(minValue) : undefined,
    maxValue: maxValue ? Number(maxValue) : undefined,
    sort,
  }), [category, dateFrom, dateTo, district, maxValue, minValue, query, resultTypes, sort]);
  const cacheScope = useMemo(() => `discovery:${JSON.stringify(filters)}`, [filters]);

  const runSearch = async () => {
    setLoading(true);
    setError('');
    const cached = readResilienceCache<DiscoveryResult[]>(cacheScope, 30 * 60 * 1000);
    if (cached) { setResults(cached.value); setCachedAt(cached.savedAt); }
    try {
      const rows = await withNetworkRetry(() => searchDiscovery(filters), { attempts: 2 });
      setResults(rows);
      setCachedAt(null);
      writeResilienceCache(cacheScope, rows);
    } catch (reason) {
      if (!cached) setResults([]);
      setError(reason instanceof Error ? reason.message : 'Search is temporarily unavailable.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void runSearch(); }, [cacheScope]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchDiscoverySuggestions(query).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    fetchDiscoveryTrends().then(setTrends).catch(() => setTrends([]));
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
      if (data.session) fetchDiscoverySavedSearches().then(setSaved).catch(() => setSaved([]));
    });
  }, []);

  const commitQuery = (value: string) => {
    const clean = value.trim();
    setQuery(clean);
    setSuggestions([]);
    const next = new URLSearchParams(params);
    clean ? next.set('q', clean) : next.delete('q');
    setParams(next, { replace: true });
    if (clean) {
      const nextRecent = [clean, ...recent.filter(item => item.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
      setRecent(nextRecent);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
    }
  };

  const toggleType = (type: DiscoveryResultType) => setResultTypes(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type]);
  const total = results[0]?.totalCount ?? 0;

  const handleSave = async () => {
    const name = window.prompt('Name this saved search', query.trim() || 'My discovery search');
    if (!name?.trim()) return;
    try { await saveDiscoverySearch(name, filters); setSaved(await fetchDiscoverySavedSearches()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this search.'); }
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-950">
      <header className="border-b-2 border-slate-950 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold"><ArrowLeft className="h-4 w-4" /> HYDERRA</Link>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Advanced Search &amp; Discovery</span>
        </div>
      </header>

      <section className="border-b-2 border-slate-950 bg-[#0F172A] text-white">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">One trusted discovery layer</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold md:text-5xl">Find opportunities, businesses and services across Hyderra.</h1>
          <form onSubmit={event => { event.preventDefault(); commitQuery(query); }} className="relative mt-7 max-w-4xl">
            <div className="flex border-2 border-white bg-white text-slate-950">
              <Search className="ml-4 mt-4 h-5 w-5 text-slate-400" aria-hidden="true" />
              <input aria-label="Search Hyderra" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tender, supplier, project, service or influencer" className="min-w-0 flex-1 border-0 px-3 py-4 outline-none" />
              <button className="bg-emerald-500 px-5 text-xs font-extrabold uppercase tracking-wide text-slate-950">Search</button>
            </div>
            {suggestions.length > 0 && query.length >= 2 && <div className="absolute z-20 mt-1 w-full border-2 border-slate-950 bg-white text-slate-950 shadow-xl">
              {suggestions.map(item => <button key={`${item.resultType}-${item.term}`} type="button" onClick={() => commitQuery(item.term)} className="flex w-full items-center justify-between border-b border-slate-200 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50"><span>{item.term}</span><span className="font-mono text-[9px] uppercase text-slate-500">{resultLabel(item.resultType)}</span></button>)}
            </div>}
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {RESULT_TYPES.map(([type, label]) => <button key={type} type="button" aria-pressed={resultTypes.includes(type)} onClick={() => toggleType(type)} className={`border px-3 py-2 font-mono text-[9px] font-bold uppercase ${resultTypes.includes(type) ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-600 bg-slate-900 text-white'}`}>{label}</button>)}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-7 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <section className="border-2 border-slate-950 bg-white p-4">
            <h2 className="font-display text-sm font-extrabold">Refine results</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold">District<select value={district} onChange={event => setDistrict(event.target.value)} className="mt-1 w-full"><option value="">All districts</option>{DISTRICTS.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="block text-xs font-bold">Category<input value={category} onChange={event => setCategory(event.target.value)} placeholder="e.g. Agriculture" className="mt-1 w-full" /></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold">From<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="mt-1 w-full" /></label><label className="text-xs font-bold">To<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="mt-1 w-full" /></label></div>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold">Min value<input type="number" min="0" value={minValue} onChange={event => setMinValue(event.target.value)} className="mt-1 w-full" /></label><label className="text-xs font-bold">Max value<input type="number" min="0" value={maxValue} onChange={event => setMaxValue(event.target.value)} className="mt-1 w-full" /></label></div>
              <label className="block text-xs font-bold">Sort<select value={sort} onChange={event => setSort(event.target.value as DiscoverySort)} className="mt-1 w-full"><option value="relevance">Best match</option><option value="newest">Newest</option><option value="value_high">Highest value</option><option value="value_low">Lowest value</option></select></label>
              <button type="button" onClick={() => { setResultTypes(['business']); if (!district) setDistrict('Western Area Urban'); }} className="flex w-full items-center justify-center gap-2 border-2 border-slate-950 px-3 py-2 text-xs font-bold"><MapPin className="h-4 w-4" /> Nearby businesses</button>
            </div>
          </section>

          {(trends.length > 0 || recent.length > 0) && <section className="border-2 border-slate-950 bg-white p-4"><h2 className="flex items-center gap-2 font-display text-sm font-extrabold"><Sparkles className="h-4 w-4 text-amber-500" /> Discover</h2><div className="mt-3 flex flex-wrap gap-2">{trends.map(item => <button key={item.term} onClick={() => commitQuery(item.term)} className="border border-slate-300 px-2 py-1 text-xs">{item.term}</button>)}{recent.map(item => <button key={item} onClick={() => commitQuery(item)} className="bg-slate-100 px-2 py-1 text-xs">Recent: {item}</button>)}</div></section>}

          {isAuthenticated && <section className="border-2 border-slate-950 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-display text-sm font-extrabold">Saved searches</h2><button onClick={() => void handleSave()} title="Save current search"><BookmarkPlus className="h-4 w-4" /></button></div>{saved.length === 0 ? <p className="mt-3 text-xs text-slate-500">Save a useful filter combination for quick access.</p> : <div className="mt-3 space-y-2">{saved.map(item => <div key={item.id} className="flex items-center gap-2 border-t pt-2 text-xs"><button className="flex-1 text-left font-bold" onClick={() => { setQuery(item.keyword ?? ''); setDistrict(item.filters.district ?? ''); setCategory(item.filters.category ?? ''); setResultTypes(item.filters.resultTypes ?? []); }}>{item.name}</button><button aria-label={`Delete ${item.name}`} onClick={async () => { await deleteDiscoverySavedSearch(item.id); setSaved(current => current.filter(row => row.id !== item.id)); }}><Trash2 className="h-3.5 w-3.5 text-red-600" /></button></div>)}</div>}</section>}
        </aside>

        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold">{loading && results.length === 0 ? 'Searching…' : `${total.toLocaleString()} results`}</h2>{cachedAt && <p className="text-xs text-amber-700">Showing cached results from {new Date(cachedAt).toLocaleTimeString()} while reconnecting.</p>}</div><button onClick={() => void runSearch()} className="inline-flex items-center gap-2 border-2 border-slate-950 px-3 py-2 text-xs font-bold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
          {error && <div role="alert" className="mb-4 border-2 border-red-700 bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={() => void runSearch()} className="ml-2 font-bold underline">Retry</button></div>}
          {loading && results.length === 0 && <div role="status" className="flex items-center gap-3 border-2 border-slate-950 bg-white p-8 text-sm"><Loader2 className="h-5 w-5 animate-spin" /> Searching trusted Hyderra records…</div>}
          {!loading && results.length === 0 && !error && <div className="border-2 border-slate-950 bg-white p-10 text-center"><Search className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-display text-lg font-extrabold">No verified results found</h3><p className="mt-1 text-sm text-slate-500">Try a shorter keyword or remove one filter.</p></div>}
          <div className="space-y-3">{results.map(item => <article key={`${item.resultType}-${item.id}`} className="border-2 border-slate-950 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="bg-slate-950 px-2 py-1 font-mono text-[9px] font-bold uppercase text-white">{resultLabel(item.resultType)}</span>{item.isVerified && <span className="inline-flex items-center gap-1 bg-emerald-100 px-2 py-1 font-mono text-[9px] font-bold uppercase text-emerald-800"><CheckCircle2 className="h-3 w-3" /> Verified</span>}{item.isSponsored && <span className="bg-amber-100 px-2 py-1 font-mono text-[9px] font-bold uppercase text-amber-900">Sponsored advert</span>}{item.districtMatch && <span className="bg-blue-100 px-2 py-1 font-mono text-[9px] font-bold uppercase text-blue-800">District match</span>}</div><h3 className="mt-3 font-display text-lg font-extrabold">{item.title}</h3>{item.summary && <p className="mt-1 text-sm text-slate-600">{item.summary}</p>}<p className="mt-3 text-xs text-slate-500">{[item.category, item.district, item.publishedOn].filter(Boolean).join(' · ') || 'Public Hyderra record'}</p>{(item.contactEmail || item.contactWhatsapp) && <p className="mt-2 text-xs text-slate-700">{[item.contactEmail, item.contactWhatsapp].filter(Boolean).join(' · ')}</p>}</div><div className="text-right">{item.amount != null && <p className="font-display font-extrabold">{item.currencyCode ?? ''} {item.amount.toLocaleString()}</p>}{item.href && <Link to={item.href} className="mt-3 inline-block bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-950">View details</Link>}</div></div></article>)}</div>
        </section>
      </div>
    </main>
  );
}
