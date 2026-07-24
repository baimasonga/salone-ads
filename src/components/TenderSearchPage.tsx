import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Loader2, ArrowLeft, MapPin, Clock, Coins, BookmarkPlus, X, FileSearch,
  Wheat, HardHat, Mountain, Wifi, Landmark, HeartPulse, GraduationCap, Palmtree,
  Zap, Truck, Briefcase, HandHeart, Building2,
} from 'lucide-react';
import {
  searchOpportunities,
  fetchSectors,
  fetchDistricts,
  fetchCountries,
  fetchCurrencies,
  fetchOpportunityTypes,
  fetchSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  OpportunityListItem,
  TaxonomyOption,
  CurrencyOption,
  SavedSearch,
} from '../lib/procurementApi';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from '../lib/i18n';

function formatDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function deadlineLabel(iso: string): { text: string; cls: string } {
  const d = daysLeft(iso);
  if (d < 0) return { text: 'Closed', cls: 'text-slate-400' };
  if (d === 0) return { text: 'Closes today', cls: 'text-red-600' };
  if (d <= 3) return { text: `${d} day${d === 1 ? '' : 's'} left`, cls: 'text-red-600' };
  if (d <= 7) return { text: `${d} days left`, cls: 'text-amber-600' };
  return { text: `${d} days left`, cls: 'text-emerald-700' };
}

function formatMoney(value: number, currencyCode: string | null, currencies: CurrencyOption[]): string {
  const symbol = currencies.find((c) => c.code === currencyCode)?.symbol ?? currencyCode ?? '';
  return `${symbol} ${value.toLocaleString()}`.trim();
}

function sectorIcon(name: string | null) {
  const n = (name || '').toLowerCase();
  if (n.includes('agri')) return Wheat;
  if (n.includes('construct') || n.includes('infrastructure')) return HardHat;
  if (n.includes('mining') || n.includes('extract')) return Mountain;
  if (n.includes('telecom') || n.includes('ict')) return Wifi;
  if (n.includes('financ')) return Landmark;
  if (n.includes('health')) return HeartPulse;
  if (n.includes('educat')) return GraduationCap;
  if (n.includes('tourism') || n.includes('hospitality')) return Palmtree;
  if (n.includes('energy') || n.includes('util')) return Zap;
  if (n.includes('transport') || n.includes('logistic')) return Truck;
  if (n.includes('consult') || n.includes('professional')) return Briefcase;
  if (n.includes('ngo') || n.includes('develop')) return HandHeart;
  return Building2;
}

type StatusFilter = 'all' | 'open' | 'closing' | 'featured';

export function TenderSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [sectors, setSectors] = useState<TaxonomyOption[]>([]);
  const [countries, setCountries] = useState<TaxonomyOption[]>([]);
  const [districts, setDistricts] = useState<TaxonomyOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [types, setTypes] = useState<TaxonomyOption[]>([]);
  const [results, setResults] = useState<OpportunityListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch, setSavingSearch] = useState(false);
  const { lang, setLang, t } = useLanguage();

  const sectorId = searchParams.get('sector') || '';
  const countryId = searchParams.get('country') || '';
  const districtId = searchParams.get('district') || '';
  const typeId = searchParams.get('type') || '';

  useEffect(() => {
    Promise.all([fetchSectors(), fetchDistricts(), fetchCountries(), fetchCurrencies(), fetchOpportunityTypes()])
      .then(([s, d, c, cur, tp]) => {
        setSectors(s);
        setDistricts(d);
        setCountries(c);
        setCurrencies(cur);
        setTypes(tp);
      })
      .catch(() => {
        /* filter dropdowns are a progressive enhancement; ignore failures */
      });
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
      if (data.session) {
        fetchSavedSearches().then(setSavedSearches).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    fetchDistricts(countryId || undefined)
      .then(setDistricts)
      .catch(() => {});
  }, [countryId]);

  const applySavedSearch = (s: SavedSearch) => {
    const next = new URLSearchParams();
    if (s.keyword) next.set('q', s.keyword);
    if (s.sectorId) next.set('sector', s.sectorId);
    if (s.districtId) next.set('district', s.districtId);
    if (s.opportunityTypeId) next.set('type', s.opportunityTypeId);
    setSearchParams(next);
    setKeyword(s.keyword || '');
  };

  const handleSaveSearch = async () => {
    const name = prompt('Name this saved search (e.g. "Health tenders in Bo"):');
    if (!name) return;
    setSavingSearch(true);
    try {
      const created = await createSavedSearch({ name, keyword: keyword || null, sectorId: sectorId || null, districtId: districtId || null, opportunityTypeId: typeId || null });
      setSavedSearches([created, ...savedSearches]);
    } catch {
      /* non-critical */
    } finally {
      setSavingSearch(false);
    }
  };

  const handleDeleteSavedSearch = async (id: string) => {
    const previous = savedSearches;
    setSavedSearches(savedSearches.filter((s) => s.id !== id));
    try {
      await deleteSavedSearch(id);
    } catch {
      setSavedSearches(previous);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    searchOpportunities({
      keyword: searchParams.get('q') || undefined,
      sectorId: sectorId || undefined,
      countryId: countryId || undefined,
      districtId: districtId || undefined,
      opportunityTypeId: typeId || undefined,
    })
      .then(setResults)
      .catch((err: any) => setError(err.message || 'Could not load tenders.'))
      .finally(() => setLoading(false));
  }, [searchParams, sectorId, countryId, districtId, typeId]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'country') next.delete('district');
    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter('q', keyword);
  };

  const clearFilters = () => {
    setKeyword('');
    setStatusFilter('all');
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = !!(keyword || sectorId || countryId || districtId || typeId) || statusFilter !== 'all';

  const filtered = results.filter((op) => {
    if (statusFilter === 'closing') { const d = daysLeft(op.submissionDeadline); return d >= 0 && d <= 7; }
    if (statusFilter === 'open') return daysLeft(op.submissionDeadline) >= 0;
    if (statusFilter === 'featured') return op.isFeatured;
    return true;
  });

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'closing', label: 'Closing soon' },
    { key: 'featured', label: 'Featured' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] border-4 md:border-8 border-[#0F172A]">
      <header className="bg-white border-b border-[#0F172A] px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[#0F172A] font-display font-black tracking-widest uppercase text-sm">
          <ArrowLeft className="h-4 w-4" /> Manohub Tenders
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center border border-slate-200 text-[10px] font-mono uppercase tracking-widest">
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 cursor-pointer ${lang === 'en' ? 'bg-[#0F172A] text-white' : 'text-slate-500'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('fr')}
              className={`px-2 py-1 cursor-pointer ${lang === 'fr' ? 'bg-[#0F172A] text-white' : 'text-slate-500'}`}
            >
              FR
            </button>
          </div>
          <Link to="/" className="text-xs font-mono uppercase tracking-widest text-emerald-700 hover:underline">
            {t('signIn')}
          </Link>
        </div>
      </header>

      {/* Header + search + filters */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-6 text-left">
          <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">Live Tenders</span>
          <h1 className="mt-2 font-display font-extrabold text-2xl sm:text-3xl text-[#0F172A] tracking-tight">{t('pageTitle')}</h1>

          <form onSubmit={handleSearchSubmit} className="mt-5 flex flex-wrap gap-2.5 items-center">
            <div className="flex items-center gap-2 flex-1 min-w-[260px] border border-[#0F172A] bg-white px-3">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="flex-1 !border-0 !bg-transparent py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <select value={sectorId} onChange={(e) => updateFilter('sector', e.target.value)} className="!bg-white text-sm font-medium text-slate-600 px-3 py-2.5">
              <option value="">{t('allSectors')}</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={countryId} onChange={(e) => updateFilter('country', e.target.value)} className="!bg-white text-sm font-medium text-slate-600 px-3 py-2.5">
              <option value="">{t('allCountries')}</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={districtId} onChange={(e) => updateFilter('district', e.target.value)} className="!bg-white text-sm font-medium text-slate-600 px-3 py-2.5">
              <option value="">{t('allDistricts')}</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={typeId} onChange={(e) => updateFilter('type', e.target.value)} className="!bg-white text-sm font-medium text-slate-600 px-3 py-2.5">
              <option value="">{t('allNoticeTypes')}</option>
              {types.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </select>
            <button type="submit" className="bg-[#0F172A] text-white px-6 py-2.5 flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors">
              <Search className="h-3.5 w-3.5" /> {t('search')}
            </button>
          </form>

          {/* Status chips + clear + count */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {statusChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setStatusFilter(chip.key)}
                className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  statusFilter === chip.key
                    ? 'bg-[#0F172A] text-white border-[#0F172A]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#0F172A]'
                }`}
              >
                {chip.label}
              </button>
            ))}
            <div className="flex-1" />
            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0F172A] cursor-pointer">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
            <span className="font-mono text-xs text-slate-500">{filtered.length} results</span>
            {isAuthed && (
              <button type="button" onClick={handleSaveSearch} disabled={savingSearch} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline cursor-pointer disabled:opacity-50">
                <BookmarkPlus className="h-3.5 w-3.5" /> {t('saveSearch')}
              </button>
            )}
          </div>

          {savedSearches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {savedSearches.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-xs px-3 py-1.5">
                  <button onClick={() => applySavedSearch(s)} className="text-slate-700 hover:underline cursor-pointer">{s.name}</button>
                  <button onClick={() => handleDeleteSavedSearch(s.id)} className="text-slate-400 hover:text-red-600 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <main className="max-w-6xl mx-auto px-6 py-6 pb-20 text-left">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> {t('loadingTenders')}
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 px-6 border border-dashed border-slate-300 bg-white">
            <div className="w-14 h-14 border border-slate-200 bg-slate-50 flex items-center justify-center mx-auto">
              <FileSearch className="h-6 w-6 text-slate-400" />
            </div>
            <div className="mt-4 font-display font-bold text-lg text-slate-900">
              {results.length === 0 ? t('noResults') : 'No tenders match your filters'}
            </div>
            <p className="mt-1.5 text-sm text-slate-500">Try a broader sector, or clear your filters to see every open opportunity.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-5 btn-geometric-secondary cursor-pointer inline-flex items-center gap-2">
                <X className="h-3.5 w-3.5" /> Clear all filters
              </button>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((op) => {
              const Icon = sectorIcon(op.sector);
              const dl = deadlineLabel(op.submissionDeadline);
              return (
                <Link
                  key={op.id}
                  to={`/tenders/${op.slug}`}
                  className="flex items-center gap-4 bg-white border border-slate-200 hover:border-[#0F172A] p-5 transition-colors"
                >
                  <span className="w-12 h-12 border border-[#0F172A] bg-emerald-50 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-emerald-700" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] text-slate-400">
                      <span>{op.opportunityType || 'Tender'}</span>
                      {op.sector && <><span className="text-slate-300">·</span><span className="text-slate-500">{op.sector}</span></>}
                      {(op.district || op.country) && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="flex items-center gap-1 text-slate-500"><MapPin className="h-3 w-3" /> {[op.district, op.country].filter(Boolean).join(', ')}</span>
                        </>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-slate-900 leading-snug mt-1 truncate">{op.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{op.buyerName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                    {op.isFeatured && <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider">Featured</span>}
                    {op.estimatedValue !== null && (
                      <span className="flex items-center gap-1 font-mono font-semibold text-sm text-slate-800"><Coins className="h-3.5 w-3.5 text-slate-400" /> {formatMoney(op.estimatedValue, op.currencyCode, currencies)}</span>
                    )}
                    <span className={`flex items-center gap-1 font-mono text-xs font-semibold ${dl.cls}`}><Clock className="h-3.5 w-3.5" /> {dl.text}</span>
                    <span className="font-mono text-[10px] text-slate-400">{t('deadline')}: {formatDeadline(op.submissionDeadline)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
