import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Loader2, ArrowLeft, MapPin, Clock, Tag, BookmarkPlus, X, FileSearch,
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

// ── Exact palette from the MANOHUB Tenders design (Gradient kit) ──
const C = {
  navy: '#0d1b2a',
  ink: '#14202e',
  ink2: '#16222f',
  green: '#159a6b',
  border: '#d9dde4',
  border2: '#e6e8ec',
  border3: '#e7e9ed',
  muted: '#8b95a3',
  muted2: '#9aa3b0',
  muted3: '#7a8493',
  slate: '#3a4452',
  slate2: '#33404e',
  contentBg: '#f4f6f8',
  iconBg: '#e7f4ee',
  iconBorder: '#d5ebdf',
  amber: '#d5852a',
  featBg: '#fbf1cf',
  featText: '#96741d',
  deadlineDim: '#a7afbb',
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SANS = "'Hanken Grotesk', system-ui, sans-serif";

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
function deadlineParts(iso: string): { text: string; color: string } {
  const d = daysLeft(iso);
  if (d < 0) return { text: 'Closed', color: C.deadlineDim };
  if (d === 0) return { text: 'Closes today', color: C.amber };
  if (d <= 7) return { text: `${d} day${d === 1 ? '' : 's'} left`, color: C.amber };
  return { text: `${d} days left`, color: C.green };
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

// Scoped style overrides — re-establish the Gradient look (fonts, rounded
// corners, focus ring) for THIS page only, beating the app-wide "geometric"
// !important globals in index.css without touching them anywhere else.
const SCOPED_CSS = `
.mh-tenders, .mh-tenders * { font-family: ${SANS}; }
.mh-tenders input, .mh-tenders select {
  border: 1px solid ${C.border} !important;
  background: #ffffff !important;
  color: ${C.slate} !important;
  border-radius: 6px !important;
  outline: none !important;
  box-shadow: none !important;
}
.mh-tenders input:focus, .mh-tenders select:focus {
  outline: none !important;
  border-color: ${C.green} !important;
  box-shadow: 0 0 0 3px rgba(21,154,107,0.18) !important;
}
.mh-tenders button { border-radius: 6px !important; }
.mh-tenders h1 { font-family: ${SANS} !important; color: ${C.ink} !important; }
.mh-tenders input::placeholder { color: ${C.muted2} !important; }
@media (max-width: 820px) {
  .mh-tenders .mh-pad { padding-left: 20px !important; padding-right: 20px !important; }
  .mh-tenders .mh-searchrow { flex-wrap: wrap !important; }
  .mh-tenders .mh-searchrow > * { flex: 1 1 140px !important; width: auto !important; }
  .mh-tenders .mh-card { flex-wrap: wrap !important; }
  .mh-tenders .mh-card-right { align-items: flex-start !important; min-width: 0 !important; }
}
`;

const DOTS_BG: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'radial-gradient(70% 48% at 82% -8%, rgba(21,154,107,0.09) 0%, rgba(244,246,248,0) 60%), radial-gradient(rgba(20,32,46,0.12) 1.1px, transparent 1.4px)',
  backgroundSize: 'auto, 22px 22px',
};
const GRAIN_BG: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0.6,
  mixBlendMode: 'multiply',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.14'/%3E%3C/svg%3E\")",
  backgroundSize: '160px 160px',
};

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
      .catch(() => {});
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
      if (data.session) fetchSavedSearches().then(setSavedSearches).catch(() => {});
    });
  }, []);

  useEffect(() => {
    fetchDistricts(countryId || undefined).then(setDistricts).catch(() => {});
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
    { key: 'all', label: 'ALL' },
    { key: 'open', label: 'OPEN' },
    { key: 'closing', label: 'CLOSING SOON' },
    { key: 'featured', label: 'FEATURED' },
  ];

  const selectBase: React.CSSProperties = {
    flex: 'none', height: 46, padding: '0 12px', fontSize: 14, color: C.slate, cursor: 'pointer',
    fontFamily: SANS, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  };

  return (
    <div className="mh-tenders" style={{ background: C.navy, minHeight: '100vh', fontFamily: SANS }}>
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />
      <div style={{ maxWidth: 1280, margin: '0 auto', background: C.navy, padding: '9px 10px 11px' }}>
        <div style={{ background: '#ffffff', overflow: 'hidden' }}>

          {/* NAV */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70, padding: '0 30px', background: '#fff', borderBottom: `1px solid ${C.border2}` }} className="mh-pad">
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 14, color: C.navy }}>
              <ArrowLeft size={18} strokeWidth={2.2} />
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: '0.13em', color: C.navy }}>MANOHUB TENDERS</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden', fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                <button onClick={() => setLang('en')} style={{ padding: '5px 9px', background: lang === 'en' ? C.navy : '#fff', color: lang === 'en' ? '#fff' : C.muted, border: 'none', cursor: 'pointer', fontFamily: MONO, fontWeight: 600 }}>EN</button>
                <button onClick={() => setLang('fr')} style={{ padding: '5px 9px', background: lang === 'fr' ? C.navy : '#fff', color: lang === 'fr' ? '#fff' : C.muted, border: 'none', borderLeft: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: MONO, fontWeight: 600 }}>FR</button>
              </div>
              <Link to="/" style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em' }}>
                <span style={{ color: C.navy }}>SIGN IN /</span> <span style={{ color: C.green }}>GET STARTED</span>
              </Link>
            </div>
          </div>

          {/* HEADER */}
          <div style={{ background: '#fff', borderBottom: `1px solid ${C.border2}`, padding: '38px 78px 26px' }} className="mh-pad">
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', color: C.green, marginBottom: 14 }}>LIVE TENDERS</div>
            <h1 style={{ fontFamily: SANS, fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, margin: '0 0 26px' }}>{t('pageTitle')}</h1>

            <form onSubmit={handleSearchSubmit} className="mh-searchrow" style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              <div style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6 }}>
                <Search size={16} strokeWidth={2} style={{ flex: 'none', color: C.muted2 }} />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: SANS, fontSize: 14.5, color: C.ink2, minWidth: 0 }}
                />
              </div>
              <select value={sectorId} onChange={(e) => updateFilter('sector', e.target.value)} style={{ ...selectBase, width: 170 }}>
                <option value="">{t('allSectors')}</option>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={countryId} onChange={(e) => updateFilter('country', e.target.value)} style={{ ...selectBase, width: 150 }}>
                <option value="">{t('allCountries')}</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={districtId} onChange={(e) => updateFilter('district', e.target.value)} style={{ ...selectBase, width: 145 }}>
                <option value="">{t('allDistricts')}</option>
                {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={typeId} onChange={(e) => updateFilter('type', e.target.value)} style={{ ...selectBase, width: 165 }}>
                <option value="">{t('allNoticeTypes')}</option>
                {types.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
              </select>
              <button type="submit" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 22px', background: C.navy, color: '#fff', border: 'none', borderRadius: 6, fontFamily: MONO, fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer' }}>
                <Search size={15} strokeWidth={2.2} /> {t('search').toUpperCase()}
              </button>
            </form>

            {/* Status chips + count */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {statusChips.map((chip) => {
                  const active = statusFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      onClick={() => setStatusFilter(chip.key)}
                      style={{ padding: '7px 16px', background: active ? C.navy : '#fff', color: active ? '#fff' : C.slate2, border: `1px solid ${active ? C.navy : C.border}`, borderRadius: 5, fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', whiteSpace: 'nowrap', cursor: 'pointer' }}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                {hasActiveFilters && (
                  <button onClick={clearFilters} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.muted3, cursor: 'pointer' }}>
                    <X size={14} /> Clear filters
                  </button>
                )}
                {isAuthed && (
                  <button onClick={handleSaveSearch} disabled={savingSearch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.green, cursor: 'pointer', opacity: savingSearch ? 0.5 : 1 }}>
                    <BookmarkPlus size={14} /> {t('saveSearch')}
                  </button>
                )}
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>{filtered.length} results</div>
              </div>
            </div>

            {savedSearches.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {savedSearches.map((s) => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.contentBg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 10px', fontSize: 12.5 }}>
                    <button onClick={() => applySavedSearch(s)} style={{ background: 'none', border: 'none', color: C.slate2, cursor: 'pointer', fontFamily: SANS, fontSize: 12.5 }}>{s.name}</button>
                    <button onClick={() => handleDeleteSavedSearch(s.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'inline-flex' }}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* CONTENT */}
          <div style={{ position: 'relative', background: C.contentBg, padding: '30px 78px 70px' }} className="mh-pad">
            <div style={DOTS_BG} />
            <div style={GRAIN_BG} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontSize: 14, padding: '48px 0' }}>
                  <Loader2 size={20} className="animate-spin" /> {t('loadingTenders')}
                </div>
              )}

              {!loading && error && (
                <div style={{ background: '#fdeaea', border: '1px solid #f4c9c9', color: '#b42a2f', fontSize: 14, padding: 16, borderRadius: 6 }}>{error}</div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '64px 24px', border: `1px dashed ${C.border}`, borderRadius: 8, background: '#fff' }}>
                  <div style={{ width: 56, height: 56, margin: '0 auto', borderRadius: 8, background: C.contentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
                    <FileSearch size={26} />
                  </div>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, color: C.ink2, marginTop: 16 }}>
                    {results.length === 0 ? t('noResults') : 'No tenders match your filters'}
                  </div>
                  <p style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Try a broader sector, or clear your filters to see every open opportunity.</p>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 20px', borderRadius: 999, border: `1px solid ${C.border}`, background: '#fff', fontFamily: SANS, fontWeight: 600, fontSize: 14, color: C.ink2, cursor: 'pointer' }}>
                      <X size={15} /> Clear all filters
                    </button>
                  )}
                </div>
              )}

              {!loading && !error && filtered.map((op) => {
                const Icon = sectorIcon(op.sector);
                const dl = deadlineParts(op.submissionDeadline);
                return (
                  <Link
                    key={op.id}
                    to={`/tenders/${op.slug}`}
                    className="mh-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 22, background: '#fff', border: `1px solid ${C.border3}`, borderRadius: 5, padding: '22px 28px', boxShadow: '0 1px 2px rgba(16,32,47,0.05), 0 1px 3px rgba(16,32,47,0.04)' }}
                  >
                    <div style={{ flex: 'none', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.iconBg, border: `1px solid ${C.iconBorder}`, borderRadius: 6, color: C.green }}>
                      <Icon size={26} strokeWidth={2} />
                    </div>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: MONO, fontSize: 12, letterSpacing: '0.03em', color: C.muted, marginBottom: 9 }}>
                        <span>{op.opportunityType || 'Tender'}</span>
                        {op.sector && <><span style={{ color: '#c3cad3' }}>·</span><span>{op.sector}</span></>}
                        {(op.district || op.country) && (
                          <><span style={{ color: '#c3cad3' }}>·</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.muted3 }}>
                            <MapPin size={13} strokeWidth={2} stroke="#4f9e79" style={{ flex: 'none' }} />{[op.district, op.country].filter(Boolean).join(', ')}
                          </span></>
                        )}
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: C.ink2, marginBottom: 7 }}>{op.title}</div>
                      <div style={{ fontFamily: SANS, fontSize: 14, color: '#737d8b' }}>{op.buyerName}</div>
                    </div>
                    <div className="mh-card-right" style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, minWidth: 185 }}>
                      {op.isFeatured && (
                        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: C.featText, background: C.featBg, padding: '3px 8px', borderRadius: 3, marginBottom: 2 }}>FEATURED</div>
                      )}
                      {op.estimatedValue !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.ink2 }}>
                          <Tag size={14} strokeWidth={2} stroke="#55606e" style={{ flex: 'none' }} />{formatMoney(op.estimatedValue, op.currencyCode, currencies)}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 13, fontWeight: 600, color: dl.color }}>
                        <Clock size={14} strokeWidth={2} style={{ flex: 'none' }} />{dl.text}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.deadlineDim }}>{t('deadline')}: {formatDeadline(op.submissionDeadline)}</div>
                    </div>
                  </Link>
                );
              })}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
