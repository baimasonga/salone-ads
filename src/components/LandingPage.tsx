import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  HardHat,
  HeartPulse,
  Menu,
  MonitorCog,
  Package,
  Search,
  Square,
  Truck,
  Wheat,
  X,
  Zap,
} from 'lucide-react';
import {
  fetchCountries,
  fetchLandingAdvertPlacements,
  fetchOpportunityTypes,
  fetchSectors,
  LandingAdvertPlacement,
  OpportunityListItem,
  searchOpportunities,
  TaxonomyOption,
} from '../lib/procurementApi';
import { trackAdvertEvent } from '../lib/advertAnalytics';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
  previewBlockId?: string;
}

type SearchKind = 'tenders' | 'contract_awards' | 'projects' | 'adverts';
type FeedKind = 'latest' | 'closing' | 'high_value' | 'contract_awards' | 'projects';

const SEARCH_TABS: Array<[SearchKind, string]> = [
  ['tenders', 'Tenders'],
  ['contract_awards', 'Contract Awards'],
  ['projects', 'Projects'],
  ['adverts', 'Adverts'],
];

const FEED_TABS: Array<[FeedKind, string]> = [
  ['latest', 'Latest'],
  ['closing', 'Closing Soon'],
  ['high_value', 'High Value'],
  ['contract_awards', 'Contract Awards'],
  ['projects', 'Procurement Plans'],
];

const SECTOR_COLOURS = ['#339CFF', '#F3883B', '#5DC977', '#EB77B1', '#9B79EC', '#3AB9B1'];

const CONCEPT_CSS = `
  .mh-page {
    --mh-ink:#0f172a;
    --mh-paper:#ffffff;
    --mh-soft:#f8fafc;
    --mh-muted:#64748b;
    --mh-green:#00a240;
    --mh-blue:#339cff;
    --mh-orange:#f3883b;
    --mh-yellow:#f4d35e;
    color:var(--mh-ink);
    background:var(--mh-paper);
    min-height:100vh;
    overflow:hidden;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  }
  .mh-page *{box-sizing:border-box}
  .mh-shell{width:min(100% - 48px,1180px);margin-inline:auto}
  .mh-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase}
  .mh-small{font-size:12px;line-height:16px}
  .mh-muted{color:var(--mh-muted)}
  .mh-btn{
    display:inline-flex;min-height:38px;width:fit-content;max-width:100%;align-items:center;justify-content:center;
    gap:7px;margin:0;padding:0 13px;border:1px solid #cbd5e1;border-radius:0;color:var(--mh-ink);
    background:#fff;cursor:pointer;font:600 13px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;text-decoration:none;white-space:nowrap
  }
  .mh-btn:hover{background:#f1f5f9}
  .mh-btn-primary{border-color:var(--mh-ink);color:#fff;background:var(--mh-ink)}
  .mh-btn-primary:hover{background:#1e293b}
  .mh-btn-ghost{border-color:transparent;background:transparent;color:#475569}
  .mh-input,.mh-select{
    width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:0;outline:0;color:var(--mh-ink);
    background:#fff;padding:0 12px;font:500 14px/1.2 Inter,ui-sans-serif,system-ui,sans-serif
  }
  .mh-input::placeholder{color:#94a3b8}
  .mh-input:focus,.mh-select:focus{border-color:var(--mh-blue);box-shadow:inset 0 0 0 1px var(--mh-blue)}
  .mh-select{appearance:auto;padding-right:30px}
  .mh-badge{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;color:#1677d2;background:#e5f2ff;font-size:12px;font-weight:700}
  .mh-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-block:18px;border-bottom:2px solid var(--mh-ink)}
  .mh-brand{display:flex;align-items:center;gap:10px;color:var(--mh-ink);font-size:18px;font-weight:900;letter-spacing:.08em}
  .mh-brand-mark{display:grid;width:34px;height:34px;place-items:center;background:var(--mh-ink);color:#fff}
  .mh-brand-accent{color:var(--mh-green)}
  .mh-nav{display:flex;align-items:center;gap:20px}
  .mh-nav a,.mh-nav-link{border:0;background:transparent;color:var(--mh-ink);cursor:pointer;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;text-decoration:none;text-transform:uppercase}
  .mh-mobile-toggle{display:none}
  .mh-mobile-nav{display:none}
  .mh-hero{
    padding-block:58px 34px;color:#fff;background-color:var(--mh-ink);
    background-image:linear-gradient(rgb(16 185 129 / 9%) 1px,transparent 1px),linear-gradient(90deg,rgb(16 185 129 / 9%) 1px,transparent 1px),linear-gradient(120deg,transparent,rgb(243 136 59 / 18%));
    background-size:56px 56px,56px 56px,auto
  }
  .mh-hero-grid{display:grid;grid-template-columns:1.18fr .82fr;gap:44px;align-items:center}
  .mh-live-label{display:inline-flex;align-items:center;gap:9px}
  .mh-live-dot{width:9px;height:9px;background:var(--mh-green)}
  .mh-hero h1{max-width:760px;margin:18px 0 14px;color:#fff;font-size:38px;line-height:1.15;font-weight:800;letter-spacing:-.025em}
  .mh-hero-copy{max-width:680px;color:#cbd5e1;font-size:16px;line-height:1.7}
  .mh-search-console{margin-top:26px;padding:12px;border:2px solid #fff;color:var(--mh-ink);background:#fff}
  .mh-type-tabs,.mh-op-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
  .mh-search-row{display:grid;grid-template-columns:1.5fr .72fr .72fr auto;gap:8px}
  .mh-search-status{min-height:18px;margin-top:9px;color:#64748b}
  .mh-quicklinks{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;color:#cbd5e1}
  .mh-quicklinks a,.mh-quicklinks button{border:0;padding:0;color:inherit;background:transparent;cursor:pointer;text-decoration:none}
  .mh-hero-feature{padding:22px;border:2px solid var(--mh-ink);color:var(--mh-ink);background:#fff;box-shadow:9px 9px 0 rgb(0 162 64 / 65%)}
  .mh-feature-head,.mh-feature-foot,.mh-section-head,.mh-row-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
  .mh-feature-title{margin:18px 0 8px;font-size:24px;line-height:1.25;font-weight:800}
  .mh-feature-foot{margin-top:18px;padding-top:14px;border-top:1px solid #e2e8f0}
  .mh-feature-foot small{display:inline-block;margin-bottom:4px}
  .mh-deadline{color:#008a3a}
  .mh-metrics{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:2px solid var(--mh-ink)}
  .mh-metric{padding:22px 20px;border-right:1px solid var(--mh-ink)}
  .mh-metric:last-child{border-right:0}
  .mh-metric strong{display:block;margin-bottom:4px;font-size:24px}
  .mh-section{padding-block:44px;border-bottom:2px solid var(--mh-ink)}
  .mh-section-head{align-items:end;margin-bottom:22px}
  .mh-section-head h2,.mh-browse-grid h2{margin:4px 0 0;font-size:28px;line-height:1.2;font-weight:800}
  .mh-section-head a{color:#2563eb;font-weight:700;text-decoration:none}
  .mh-sector-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:var(--mh-ink)}
  .mh-sector{display:flex;min-height:112px;flex-direction:column;justify-content:space-between;padding:18px;border-top:5px solid var(--sector-colour);color:var(--mh-ink);background:color-mix(in srgb,var(--sector-colour) 9%,#fff);text-decoration:none}
  .mh-sector-top{display:flex;justify-content:space-between;gap:10px}
  .mh-category-icon,.mh-sector-count{display:grid;width:38px;height:38px;place-items:center;color:var(--sector-colour);background:color-mix(in srgb,var(--sector-colour) 18%,#fff)}
  .mh-sector-count{min-width:38px;width:auto;padding-inline:9px;color:var(--mh-ink);font-size:15px}
  .mh-sector-name{padding-top:14px;border-top:2px solid color-mix(in srgb,var(--sector-colour) 60%,#e2e8f0);font-size:15px;font-weight:600}
  .mh-market-grid{display:grid;grid-template-columns:220px 1fr;gap:28px}
  .mh-filter-list{display:grid;gap:2px;align-content:start}
  .mh-filter-list .mh-btn{width:100%;justify-content:space-between}
  .mh-opportunity-list{border-top:2px solid var(--mh-ink)}
  .mh-opportunity{display:grid;grid-template-columns:1fr 145px 120px;gap:18px;align-items:center;padding-block:17px;border-bottom:1px solid var(--mh-ink)}
  .mh-opportunity h3{margin:5px 0;font-size:17px;line-height:1.35;font-weight:750}
  .mh-op-meta{display:flex;flex-wrap:wrap;gap:8px 16px}
  .mh-empty{padding:28px 0;border-bottom:1px solid var(--mh-ink);color:#64748b}
  .mh-sponsored{display:grid;grid-template-columns:1.3fr .7fr;gap:28px;align-items:center;padding:26px;background:#fff9dc;border-block:2px solid var(--mh-ink)}
  .mh-sponsored h2{margin:8px 0;font-size:26px;line-height:1.2;font-weight:800}
  .mh-sponsored p{margin-bottom:18px;line-height:1.6}
  .mh-sponsor-visual{display:grid;min-height:150px;place-items:center;color:#fff;background-color:var(--mh-ink);background-image:linear-gradient(rgb(16 185 129 / 12%) 1px,transparent 1px),linear-gradient(90deg,rgb(16 185 129 / 12%) 1px,transparent 1px);background-size:28px 28px}
  .mh-sponsor-visual img{width:100%;height:180px;object-fit:cover}
  .mh-browse-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:34px}
  .mh-browse-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0}
  .mh-browse-links{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:#e2e8f0}
  .mh-browse-links button{display:flex;justify-content:space-between;border:0;padding:16px;color:var(--mh-ink);background:#fff;cursor:pointer;text-align:left}
  .mh-insight-list{border-top:1px solid #e2e8f0}
  .mh-insight{padding-block:15px;border-bottom:1px solid #e2e8f0}
  .mh-insight h3{margin:5px 0 0;font-size:18px;line-height:1.35}
  .mh-alert-card{padding:26px;border-left:8px solid var(--mh-green);color:#fff;background:var(--mh-ink)}
  .mh-alert-card h2{margin:10px 0;color:#fff;font-size:28px;font-weight:800}
  .mh-alert-card p{color:#cbd5e1}
  .mh-alert-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}
  .mh-alert-fields .mh-wide{grid-column:1/-1}
  .mh-footer{display:flex;justify-content:space-between;gap:24px;padding-block:28px;color:#64748b}
  @media(max-width:900px){
    .mh-nav a,.mh-nav .mh-nav-link{display:none}
    .mh-mobile-toggle{display:inline-flex}
    .mh-mobile-nav{padding:0 0 16px}
    .mh-mobile-nav.mh-open{display:grid;gap:2px}
    .mh-mobile-nav a,.mh-mobile-nav button{width:100%;padding:12px;border:0;border-bottom:1px solid #e2e8f0;color:var(--mh-ink);background:#fff;text-align:left;text-decoration:none}
    .mh-hero-grid,.mh-browse-grid{grid-template-columns:1fr}
    .mh-search-row{grid-template-columns:1fr 1fr}
    .mh-search-row>:first-child{grid-column:1/-1}
    .mh-metrics{grid-template-columns:repeat(2,1fr)}
    .mh-metric{border-bottom:1px solid #e2e8f0}
    .mh-sector-grid{grid-template-columns:repeat(2,1fr)}
    .mh-market-grid{grid-template-columns:1fr}
    .mh-filter-list{grid-template-columns:repeat(3,1fr)}
    .mh-sponsored{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .mh-shell{width:min(100% - 32px,1180px)}
    .mh-hero{padding-block:36px 24px}
    .mh-hero h1{font-size:32px}
    .mh-search-row,.mh-metrics,.mh-sector-grid,.mh-alert-fields{grid-template-columns:1fr}
    .mh-search-row>:first-child,.mh-alert-fields .mh-wide{grid-column:auto}
    .mh-filter-list{grid-template-columns:1fr 1fr}
    .mh-opportunity{grid-template-columns:1fr;gap:8px}
    .mh-browse-links{grid-template-columns:1fr}
    .mh-footer{flex-direction:column}
  }
`;

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function valueLabel(opportunity: OpportunityListItem): string {
  if (opportunity.estimatedValue == null) return 'Not stated';
  const value = opportunity.estimatedValue;
  const compact = value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${Math.round(value / 1_000)}K`
      : String(value);
  return `${opportunity.currencyCode || 'NLe'} ${compact}`;
}

function deadlineText(iso: string): string {
  const days = daysLeft(iso);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function sectorIcon(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('construct')) return HardHat;
  if (normalized.includes('tech') || normalized.includes('ict') || normalized.includes('telecom')) return MonitorCog;
  if (normalized.includes('health')) return HeartPulse;
  if (normalized.includes('agri')) return Wheat;
  if (normalized.includes('energy') || normalized.includes('util')) return Zap;
  if (normalized.includes('transport') || normalized.includes('logistic')) return Truck;
  if (normalized.includes('consult')) return BriefcaseBusiness;
  return Package;
}

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<OpportunityListItem[]>([]);
  const [sectors, setSectors] = useState<TaxonomyOption[]>([]);
  const [countries, setCountries] = useState<TaxonomyOption[]>([]);
  const [opportunityTypes, setOpportunityTypes] = useState<TaxonomyOption[]>([]);
  const [spotlight, setSpotlight] = useState<LandingAdvertPlacement | null>(null);
  const [searchKind, setSearchKind] = useState<SearchKind>('tenders');
  const [feedKind, setFeedKind] = useState<FeedKind>('latest');
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [searchStatus, setSearchStatus] = useState('Search live notices by keyword, country and sector.');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      searchOpportunities({}),
      fetchSectors(),
      fetchCountries(),
      fetchOpportunityTypes(),
    ]).then(([opportunityRows, sectorRows, countryRows, typeRows]) => {
      setOpportunities(opportunityRows);
      setSectors(sectorRows);
      setCountries(countryRows);
      setOpportunityTypes(typeRows);
    }).catch(() => {});

    fetchLandingAdvertPlacements().then((rows) => {
      const eligible = rows.filter((row) => row.placementCode === 'homepage_spotlight' && row.advert.status === 'live');
      setSpotlight(eligible[0] || null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!spotlight) return;
    void trackAdvertEvent({
      advertId: spotlight.advert.id,
      eventType: 'impression',
      action: 'advert_card',
      channel: 'manohub_homepage',
      metadata: { placement: 'homepage_spotlight' },
    });
  }, [spotlight]);

  const activeOpportunities = useMemo(() => opportunities.filter((item) => daysLeft(item.submissionDeadline) >= 0), [opportunities]);
  const buyers = useMemo(() => new Set(activeOpportunities.map((item) => item.buyerName).filter(Boolean)), [activeOpportunities]);
  const closingThisWeek = activeOpportunities.filter((item) => daysLeft(item.submissionDeadline) <= 7).length;
  const heroTender = activeOpportunities[0];
  const popularSectors = sectors.slice(0, 8);
  const sectorCount = (sectorName: string) => activeOpportunities.filter((item) => item.sector === sectorName).length;

  const feed = useMemo(() => {
    const rows = [...activeOpportunities];
    if (feedKind === 'closing') return rows.sort((a, b) => daysLeft(a.submissionDeadline) - daysLeft(b.submissionDeadline)).slice(0, 3);
    if (feedKind === 'high_value') return rows.sort((a, b) => Number(b.estimatedValue || 0) - Number(a.estimatedValue || 0)).slice(0, 3);
    if (feedKind === 'contract_awards' || feedKind === 'projects') {
      const needle = feedKind === 'contract_awards' ? 'award' : 'plan';
      return rows.filter((item) => item.opportunityType?.toLowerCase().includes(needle)).slice(0, 3);
    }
    return rows.slice(0, 3);
  }, [activeOpportunities, feedKind]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchKind === 'adverts') {
      navigate('/adverts');
      return;
    }
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('q', keyword.trim());
    if (country) params.set('country', country);
    if (sector) params.set('sector', sector);
    if (searchKind === 'contract_awards' || searchKind === 'projects') {
      const needle = searchKind === 'contract_awards' ? 'contract award' : 'procurement plan';
      const type = opportunityTypes.find((item) => item.name.toLowerCase().includes(needle));
      if (type) params.set('type', type.id);
    }
    navigate(`/tenders${params.size ? `?${params.toString()}` : ''}`);
  };

  const navigateToSector = (sectorId: string) => navigate(`/tenders?sector=${sectorId}`);

  return (
    <div className="mh-page">
      <style>{CONCEPT_CSS}</style>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <header className="mh-shell mh-topbar">
        <div className="mh-brand">
          <span className="mh-brand-mark"><Square aria-hidden="true" size={17} /></span>
          <span>MANO<span className="mh-brand-accent">HUB</span></span>
        </div>
        <nav className="mh-nav" aria-label="Main navigation">
          <a href="#mh-opportunities">Find Opportunities</a>
          <a href="#mh-sponsored">Business Adverts</a>
          <a href="#mh-insights">Insights</a>
          <a href="#mh-buyers">For Buyers</a>
          <button type="button" className="mh-nav-link" onClick={onSignIn}>Sign In</button>
          <button type="button" className="mh-btn mh-btn-primary" onClick={onGetStarted}>Get Started <ArrowRight size={15} /></button>
          <button
            type="button"
            className="mh-btn mh-mobile-toggle"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </nav>
      </header>
      <nav className={`mh-shell mh-mobile-nav ${mobileMenuOpen ? 'mh-open' : ''}`} aria-label="Mobile navigation">
        <a href="#mh-opportunities" onClick={() => setMobileMenuOpen(false)}>Find Opportunities</a>
        <a href="#mh-sponsored" onClick={() => setMobileMenuOpen(false)}>Business Adverts</a>
        <a href="#mh-insights" onClick={() => setMobileMenuOpen(false)}>Insights</a>
        <a href="#mh-buyers" onClick={() => setMobileMenuOpen(false)}>For Buyers</a>
        <button type="button" onClick={onSignIn}>Sign In</button>
      </nav>

      <main id="main-content" tabIndex={-1}>
        <section className="mh-hero">
          <div className="mh-shell mh-hero-grid">
            <div>
              <div className="mh-live-label mh-mono mh-small"><span className="mh-live-dot" /> Live across Sierra Leone &amp; Liberia</div>
              <h1>Every public tender and trusted business advert in one place.</h1>
              <p className="mh-hero-copy">Discover opportunities, promote businesses and reach buyers across Sierra Leone, Liberia and the wider Mano River region.</p>

              <form className="mh-search-console" onSubmit={submitSearch} aria-label="Opportunity search">
                <div className="mh-type-tabs" role="group" aria-label="Search type">
                  {SEARCH_TABS.map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className={`mh-btn ${searchKind === kind ? 'mh-btn-primary' : 'mh-btn-ghost'}`}
                      aria-pressed={searchKind === kind}
                      onClick={() => {
                        setSearchKind(kind);
                        setSearchStatus(`Ready to search ${label.toLowerCase()}.`);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mh-search-row">
                  <input
                    className="mh-input"
                    aria-label="Keywords"
                    placeholder="What are you looking for?"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                  <select className="mh-select" aria-label="Country" value={country} onChange={(event) => setCountry(event.target.value)}>
                    <option value="">All countries</option>
                    {countries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <select className="mh-select" aria-label="Sector" value={sector} onChange={(event) => setSector(event.target.value)}>
                    <option value="">All sectors</option>
                    {sectors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <button type="submit" className="mh-btn mh-btn-primary"><Search size={16} /> Search</button>
                </div>
                <div className="mh-search-status mh-small" aria-live="polite">{searchStatus}</div>
              </form>

              <div className="mh-quicklinks mh-small">
                <span>Quick access:</span>
                <a href="#mh-sectors">Browse sectors</a>
                <a href="#mh-opportunities">Closing soon</a>
                <button type="button" onClick={onGetStarted}>Create alert</button>
              </div>
            </div>

            <aside className="mh-hero-feature" aria-label="Featured tender">
              <div className="mh-feature-head">
                <span className="mh-badge">Latest verified tender</span>
                <Bookmark aria-hidden="true" size={19} />
              </div>
              <p className="mh-mono mh-small mh-muted">
                {heroTender ? `${heroTender.opportunityType || 'Open tender'} · Verified notice` : 'Open competitive bidding · MOH/ICT/026'}
              </p>
              <h2 className="mh-feature-title">{heroTender?.title || 'Supply and installation of hospital information systems'}</h2>
              <p className="mh-muted">
                {heroTender ? `${heroTender.buyerName}${heroTender.district ? ` · ${heroTender.district}` : ''}` : 'Ministry of Health · Freetown, Sierra Leone'}
              </p>
              <div className="mh-feature-foot">
                <span><small className="mh-muted">Estimated value</small><br /><strong>{heroTender ? valueLabel(heroTender) : 'NLe 2.4M'}</strong></span>
                <span><small className="mh-muted">Closing</small><br /><strong className="mh-deadline">{heroTender ? deadlineText(heroTender.submissionDeadline) : '8 days'}</strong></span>
              </div>
            </aside>
          </div>
        </section>

        <div className="mh-shell mh-metrics" aria-label="Verified platform statistics">
          <div className="mh-metric"><strong>{activeOpportunities.length}</strong><span className="mh-small mh-muted">Live opportunities</span></div>
          <div className="mh-metric"><strong>{Math.min(activeOpportunities.length, 41)}</strong><span className="mh-small mh-muted">Published this week</span></div>
          <div className="mh-metric"><strong>{closingThisWeek}</strong><span className="mh-small mh-muted">Closing in 7 days</span></div>
          <div className="mh-metric"><strong>{buyers.size}</strong><span className="mh-small mh-muted">Procurement buyers</span></div>
          <div className="mh-metric"><strong>{countries.length || 2}</strong><span className="mh-small mh-muted">Countries covered</span></div>
        </div>

        <section className="mh-shell mh-section" id="mh-sectors">
          <div className="mh-section-head">
            <div><span className="mh-mono mh-small mh-muted">Browse by market</span><h2>Popular sectors</h2></div>
            <a href="#mh-opportunities">View all sectors →</a>
          </div>
          <div className="mh-sector-grid">
            {(popularSectors.length ? popularSectors : [
              { id: 'construction', name: 'Construction & Infrastructure' },
              { id: 'technology', name: 'Information Technology' },
              { id: 'healthcare', name: 'Healthcare' },
              { id: 'agriculture', name: 'Agriculture' },
              { id: 'energy', name: 'Energy & Utilities' },
              { id: 'transport', name: 'Transport & Logistics' },
              { id: 'consultancy', name: 'Consultancy' },
              { id: 'goods', name: 'Goods & Supplies' },
            ]).map((item, index) => {
              const Icon = sectorIcon(item.name);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="mh-sector"
                  style={{ '--sector-colour': SECTOR_COLOURS[index % SECTOR_COLOURS.length] } as React.CSSProperties}
                  onClick={() => navigateToSector(item.id)}
                >
                  <span className="mh-sector-top">
                    <span className="mh-category-icon"><Icon size={20} /></span>
                    <strong className="mh-sector-count">{sectorCount(item.name)}</strong>
                  </span>
                  <span className="mh-sector-name">{item.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mh-shell mh-section" id="mh-opportunities">
          <div className="mh-section-head">
            <div><span className="mh-mono mh-small mh-muted">Opportunity centre</span><h2>Live procurement activity</h2></div>
            <a href="/tenders">Browse all opportunities →</a>
          </div>
          <div className="mh-op-tabs" role="group" aria-label="Opportunity feed">
            {FEED_TABS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className={`mh-btn ${feedKind === kind ? 'mh-btn-primary' : 'mh-btn-ghost'}`}
                aria-pressed={feedKind === kind}
                onClick={() => setFeedKind(kind)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mh-market-grid">
            <aside className="mh-filter-list" aria-label="Quick filters">
              <button type="button" className="mh-btn mh-btn-primary" onClick={() => navigate('/tenders')}>All sectors <span>{activeOpportunities.length}</span></button>
              {popularSectors.slice(0, 4).map((item) => (
                <button key={item.id} type="button" className="mh-btn mh-btn-ghost" onClick={() => navigateToSector(item.id)}>
                  {item.name} <span>{sectorCount(item.name)}</span>
                </button>
              ))}
            </aside>
            <div>
              <div className="mh-row-head mh-small mh-muted"><span>Showing {FEED_TABS.find(([kind]) => kind === feedKind)?.[1].toLowerCase()} opportunities</span><span>Updated live</span></div>
              <div className="mh-opportunity-list">
                {feed.length ? feed.map((item) => (
                  <article className="mh-opportunity" key={item.id}>
                    <div>
                      <span className="mh-badge">{item.opportunityType || 'Tender notice'}</span>
                      <h3>{item.title}</h3>
                      <div className="mh-op-meta mh-small mh-muted"><span>{item.buyerName}</span><span>{item.district || item.country}</span><span>{item.sector}</span></div>
                    </div>
                    <div><span className="mh-small mh-muted">Estimated value</span><br /><strong>{valueLabel(item)}</strong></div>
                    <div><span className="mh-small mh-muted">Closes</span><br /><strong className="mh-deadline">{deadlineText(item.submissionDeadline)}</strong></div>
                  </article>
                )) : <div className="mh-empty">No live opportunities currently match this view.</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="mh-shell mh-sponsored" id="mh-sponsored" aria-label="Sponsored business placement">
          <div>
            <span className="mh-badge">Sponsored · {spotlight?.advert.category || 'Construction'}</span>
            <h2>{spotlight?.advert.title || 'Equipment, materials and logistics for your next contract.'}</h2>
            <p className="mh-muted">{spotlight?.advert.summary || 'A context-matched business advert appears beside relevant opportunities—not as unrelated clutter.'}</p>
            <button
              type="button"
              className="mh-btn mh-btn-primary"
              onClick={() => {
                if (spotlight) {
                  void trackAdvertEvent({ advertId: spotlight.advert.id, eventType: 'cta_click', action: 'advert_card', channel: 'manohub_homepage', metadata: { placement: 'homepage_spotlight' } });
                  navigate(`/adverts/${spotlight.advert.slug}`);
                } else {
                  navigate('/adverts');
                }
              }}
            >
              Explore supplier <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="mh-sponsor-visual">
            {spotlight?.advert.mediaUrl || spotlight?.advert.creativeUrl
              ? <img src={spotlight.advert.creativeUrl || spotlight.advert.mediaUrl || ''} alt={spotlight.advert.title} />
              : <Bell aria-hidden="true" size={44} />}
          </div>
        </section>

        <section className="mh-shell mh-section mh-browse-grid" id="mh-insights">
          <div id="mh-buyers">
            <span className="mh-mono mh-small mh-muted">Regional directory</span>
            <h2>Browse the market your way</h2>
            <div className="mh-browse-tabs" role="group" aria-label="Browse dimension">
              <button type="button" className="mh-btn mh-btn-primary">Country</button>
              <button type="button" className="mh-btn mh-btn-ghost">District</button>
              <button type="button" className="mh-btn mh-btn-ghost">Buyer</button>
              <button type="button" className="mh-btn mh-btn-ghost">Funding agency</button>
            </div>
            <div className="mh-browse-links">
              <button type="button" onClick={() => navigate('/tenders')}><span>Sierra Leone</span><strong>{activeOpportunities.length} →</strong></button>
              <button type="button" onClick={() => navigate('/tenders')}><span>Liberia</span><strong>0 →</strong></button>
              <button type="button" onClick={() => navigate('/tenders')}><span>Freetown</span><strong>{activeOpportunities.filter((item) => item.district?.toLowerCase().includes('freetown')).length} →</strong></button>
              <button type="button" onClick={() => navigate('/tenders')}><span>Regional</span><strong>{countries.length} →</strong></button>
            </div>
          </div>
          <div>
            <div className="mh-section-head"><div><span className="mh-mono mh-small mh-muted">From the editorial desk</span><h2>Insights and guidance</h2></div><a href="/insights">View insights →</a></div>
            <div className="mh-insight-list">
              <article className="mh-insight"><span className="mh-small mh-muted">Tendering guide · 6 min</span><h3>How to assess eligibility before preparing a bid</h3></article>
              <article className="mh-insight"><span className="mh-small mh-muted">Market update · Sierra Leone</span><h3>Infrastructure procurement outlook for the next quarter</h3></article>
              <article className="mh-insight"><span className="mh-small mh-muted">Buyer announcement</span><h3>Updated supplier-registration requirements</h3></article>
            </div>
          </div>
        </section>

        <section className="mh-shell mh-section" id="mh-alerts">
          <div className="mh-alert-card">
            <span className="mh-mono mh-small">Personalised opportunity alerts</span>
            <h2>Never miss a relevant opportunity.</h2>
            <p>Choose a market and delivery channel. Additional preferences can be completed after registration.</p>
            <div className="mh-alert-fields">
              <input className="mh-input" aria-label="Email or WhatsApp" placeholder="Email or WhatsApp number" />
              <select className="mh-select" aria-label="Preferred sector"><option>Preferred sector</option>{sectors.map((item) => <option key={item.id}>{item.name}</option>)}</select>
              <select className="mh-select" aria-label="Alert frequency"><option>Daily digest</option><option>Immediate alerts</option><option>Weekly summary</option></select>
              <button type="button" className="mh-btn mh-btn-primary" onClick={onGetStarted}>Create my alert <Bell size={15} /></button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mh-shell mh-footer mh-small">
        <span>MANOHUB · Regional procurement and business discovery</span>
        <span>Trusted notices · Relevant adverts · Market intelligence</span>
      </footer>
    </div>
  );
}
