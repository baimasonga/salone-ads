import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Loader2, ArrowLeft, MapPin, Calendar, Tag, Globe2, BookmarkPlus, X } from 'lucide-react';
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

function formatMoney(value: number, currencyCode: string | null, currencies: CurrencyOption[]): string {
  const symbol = currencies.find((c) => c.code === currencyCode)?.symbol ?? currencyCode ?? '';
  return `${symbol} ${value.toLocaleString()}`.trim();
}

export function TenderSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [sectors, setSectors] = useState<TaxonomyOption[]>([]);
  const [countries, setCountries] = useState<TaxonomyOption[]>([]);
  const [districts, setDistricts] = useState<TaxonomyOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [types, setTypes] = useState<TaxonomyOption[]>([]);
  const [results, setResults] = useState<OpportunityListItem[]>([]);
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
      .then(([s, d, c, cur, t]) => {
        setSectors(s);
        setDistricts(d);
        setCountries(c);
        setCurrencies(cur);
        setTypes(t);
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] border-4 md:border-8 border-[#0F172A]">
      <header className="bg-white border-b border-[#0F172A] px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[#0F172A] font-display font-black tracking-widest uppercase text-sm">
          <ArrowLeft className="h-4 w-4" /> SaloneReach Tenders
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

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 text-left">
        <div>
          <h1 className="font-display font-black text-2xl uppercase text-[#0F172A]">{t('pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('pageSubtitle')}</p>
        </div>

        <form onSubmit={handleSearchSubmit} className="bg-white border border-[#0F172A] p-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="flex-1 border border-slate-200 p-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
            <button type="submit" className="btn-geometric flex items-center gap-2 cursor-pointer">
              <Search className="h-4 w-4" /> {t('search')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={sectorId}
              onChange={(e) => updateFilter('sector', e.target.value)}
              className="border border-slate-200 p-2 text-sm bg-slate-50"
            >
              <option value="">{t('allSectors')}</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={countryId}
              onChange={(e) => updateFilter('country', e.target.value)}
              className="border border-slate-200 p-2 text-sm bg-slate-50"
            >
              <option value="">{t('allCountries')}</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={districtId}
              onChange={(e) => updateFilter('district', e.target.value)}
              className="border border-slate-200 p-2 text-sm bg-slate-50"
            >
              <option value="">{t('allDistricts')}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              value={typeId}
              onChange={(e) => updateFilter('type', e.target.value)}
              className="border border-slate-200 p-2 text-sm bg-slate-50"
            >
              <option value="">{t('allNoticeTypes')}</option>
              {types.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.name}</option>
              ))}
            </select>
          </div>
          {isAuthed && (
            <button type="button" onClick={handleSaveSearch} disabled={savingSearch} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50">
              <BookmarkPlus className="h-3.5 w-3.5" /> {t('saveSearch')}
            </button>
          )}
        </form>

        {savedSearches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-xs px-3 py-1.5">
                <button onClick={() => applySavedSearch(s)} className="text-slate-700 hover:underline cursor-pointer">{s.name}</button>
                <button onClick={() => handleDeleteSavedSearch(s.id)} className="text-slate-400 hover:text-red-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> {t('loadingTenders')}
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4">{error}</div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="bg-white border border-slate-200 p-8 text-center text-slate-500 text-sm">
            {t('noResults')}
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="space-y-3">
            {results.map((op) => (
              <Link
                key={op.id}
                to={`/tenders/${op.slug}`}
                className="block bg-white border border-slate-200 hover:border-[#0F172A] p-5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {op.isFeatured && (
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">Featured</span>
                      )}
                      {op.opportunityType && (
                        <span className="bg-slate-100 text-slate-600 font-mono text-[10px] px-2 py-0.5">{op.opportunityType}</span>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-slate-900">{op.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{op.buyerName}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500 font-mono">
                  {op.sector && (
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {op.sector}</span>
                  )}
                  {(op.district || op.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {[op.district, op.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {op.estimatedValue !== null && (
                    <span className="flex items-center gap-1"><Globe2 className="h-3 w-3" /> {formatMoney(op.estimatedValue, op.currencyCode, currencies)}</span>
                  )}
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {t('deadline')}: {formatDeadline(op.submissionDeadline)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
