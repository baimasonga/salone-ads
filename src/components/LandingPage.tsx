import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CheckCircle, Sparkles, Bell, FileSearch, ClipboardCheck, Megaphone,
  Search, KeyRound, Send, MapPin, Menu, X, Wheat, HardHat, Mountain, Wifi, Landmark,
  HeartPulse, GraduationCap, Palmtree, Zap, Truck, Briefcase, HandHeart, Building2, ChevronDown,
  Mail, MessageCircle, Bookmark, Clock, Coins, Store, ShoppingBag, Ticket,
} from 'lucide-react';
import { searchOpportunities, fetchSectors, fetchDistricts, fetchCountries, fetchLiveAdverts, OpportunityListItem, TaxonomyOption, Advert } from '../lib/procurementApi';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

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

function formatValue(op: Pick<OpportunityListItem, 'estimatedValue' | 'currencyCode'>): string {
  if (op.estimatedValue == null) return '—';
  const cur = op.currencyCode || 'Le';
  const v = op.estimatedValue;
  const compact =
    v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` :
    v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` :
    v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` :
    String(v);
  return `${cur} ${compact}`;
}

// Deadline pill styling in the existing geometric theme — plain mono text,
// coloured by urgency (red imminent, amber soon, emerald otherwise).
function deadlineLabel(iso: string): { text: string; cls: string } {
  const d = daysLeft(iso);
  if (d < 0) return { text: 'Closed', cls: 'text-slate-400' };
  if (d === 0) return { text: 'Closes today', cls: 'text-red-600' };
  if (d <= 3) return { text: `${d} day${d === 1 ? '' : 's'} left`, cls: 'text-red-600' };
  if (d <= 7) return { text: `${d} days left`, cls: 'text-amber-600' };
  return { text: `${d} days left`, cls: 'text-emerald-700' };
}

function sectorIcon(name: string) {
  const n = name.toLowerCase();
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

// Advertising categories showcased on the homepage marquee. These are the
// kinds of businesses Manohub promotes (the ad team designs & runs each
// campaign) — a marketing showcase, not a feed of live third-party ads.
const ADVERT_CATEGORIES = [
  { name: 'Business', desc: 'Shops, brands & local enterprises', icon: Store },
  { name: 'Goods & Services', desc: 'Products and everyday services', icon: ShoppingBag },
  { name: 'Healthcare', desc: 'Clinics, pharmacies & health services', icon: HeartPulse },
  { name: 'Transportation', desc: 'Logistics, transport & delivery', icon: Truck },
  { name: 'Events', desc: 'Concerts, launches & promotions', icon: Ticket },
  { name: 'Hospitality & Tourism', desc: 'Hotels, restaurants & travel', icon: Palmtree },
  { name: 'Financial Services', desc: 'Banks, fintech & insurance', icon: Landmark },
  { name: 'Education', desc: 'Schools, training & courses', icon: GraduationCap },
  { name: 'Agriculture', desc: 'Farms, produce & agribusiness', icon: Wheat },
  { name: 'Construction', desc: 'Builders, materials & trades', icon: HardHat },
];

const HOW_IT_WORKS = [
  { num: '01', icon: Search, title: 'Search, free', body: 'Browse every published tender by sector, district, or keyword — no account needed to look.' },
  { num: '02', icon: KeyRound, title: 'Subscribe for full access', body: 'Unlock complete procurement notices, documents, unlimited alerts, and the AI assistant.' },
  { num: '03', icon: Send, title: 'Bid, or publish your own', body: 'Track bids in a private pipeline — or, as a verified buyer, publish tenders for review.' },
];

const FAQS = [
  { q: 'Do I need an account to browse tenders?', a: 'No. Public tender search is completely free with no sign-in required. An account and subscription are only needed for full eligibility details, documents, alerts, or publishing.' },
  { q: 'How do buyers get their tenders published?', a: 'Verified buyers submit tenders through their dashboard. Every submission goes through admin review — for accuracy and legitimacy — before it appears on the public feed.' },
  { q: "What's the difference between Professional and Business plans?", a: 'Professional unlocks full tender details, documents, and real-time alerts for suppliers. Business adds the ability to publish your own tenders and submit business or event adverts.' },
  { q: 'How does business advertising work?', a: 'Business and Enterprise subscribers submit what they want advertised through their dashboard. Our team designs, builds, and runs it on social media — you track platform, reach, and run count from the same screen.' },
  { q: 'Which countries does Manohub cover?', a: 'Sierra Leone and Liberia today, with a regional West Africa expansion roadmap.' },
];

// Illustrative example used only in the hero "matched" card when there are no
// real published tenders yet — clearly tagged as an example, never passed off
// as a live listing.
const EXAMPLE_TENDER = {
  ref: 'MOHS/2026/CW/018',
  title: 'Construction of 12 Community Health Posts',
  buyer: 'Ministry of Health & Sanitation',
  value: 'NLe 4.8M',
  deadlineText: '6 days left',
  deadlineCls: 'text-amber-600',
};

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const navigate = useNavigate();
  const [latest, setLatest] = useState<OpportunityListItem[]>([]);
  const [totalOpen, setTotalOpen] = useState(0);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [heroSector, setHeroSector] = useState('');
  const [sectors, setSectors] = useState<TaxonomyOption[]>([]);
  const [districtCount, setDistrictCount] = useState(0);
  const [countryCount, setCountryCount] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [liveAdverts, setLiveAdverts] = useState<Advert[]>([]);

  useEffect(() => {
    searchOpportunities({})
      .then((rows) => {
        setTotalOpen(rows.length);
        setLatest(rows.slice(0, 9));
      })
      .catch(() => setLatest([]))
      .finally(() => setLoadingLatest(false));
    fetchLiveAdverts().then(setLiveAdverts).catch(() => setLiveAdverts([]));
    Promise.all([fetchSectors(), fetchDistricts(), fetchCountries()])
      .then(([s, d, c]) => {
        setSectors(s);
        setDistrictCount(d.length);
        setCountryCount(c.length);
      })
      .catch(() => {});
  }, []);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchKeyword) params.set('q', searchKeyword);
    if (heroSector) params.set('sector', heroSector);
    const qs = params.toString();
    navigate(qs ? `/tenders?${qs}` : '/tenders');
  };

  const buyers = Array.from(new Set(latest.map((o) => o.buyerName).filter(Boolean))).slice(0, 6);
  const featured = [...latest].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)).slice(0, 3);
  const closing = [...latest]
    .filter((o) => daysLeft(o.submissionDeadline) >= 0)
    .sort((a, b) => daysLeft(a.submissionDeadline) - daysLeft(b.submissionDeadline))
    .slice(0, 4);
  const heroTender = latest[0] || null;
  const popularSectors = sectors.slice(0, 4);

  const navLinks = [
    { href: '#explorer', label: 'Live Tenders' },
    { href: '#how', label: 'How It Works' },
    { href: '#advertise', label: 'Advertise' },
    { href: '#pricing', label: 'Pricing' },
  ];

  const stats = [
    { num: totalOpen || latest.length || '—', label: 'Live Tenders' },
    { num: sectors.length || '—', label: 'Sectors' },
    { num: districtCount || '—', label: 'Districts' },
    { num: countryCount || '—', label: 'Countries' },
  ];

  return (
    <div className="bg-[#F8FAFC] font-sans text-[#0F172A] min-h-screen">
      {/* Navigation Header */}
      <header className="sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-sm border-b-2 border-[#0F172A] z-50 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#0F172A] flex items-center justify-center shrink-0">
              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white"></div>
            </div>
            <span className="font-display font-black tracking-widest text-base sm:text-xl uppercase text-[#0F172A] truncate">
              Mano<span className="text-[#10B981]">hub</span>
            </span>
          </div>

          <nav className="hidden lg:flex gap-6 font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A]">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-emerald-600 transition-colors">{link.label}</a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={onSignIn}
              className="text-xs font-mono font-bold uppercase tracking-widest text-[#0F172A] px-4 py-2 hover:text-emerald-600 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button onClick={onGetStarted} className="btn-geometric flex items-center gap-2 cursor-pointer">
              Get Started <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden shrink-0 h-9 w-9 flex items-center justify-center border border-[#0F172A] text-[#0F172A] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden max-w-7xl mx-auto mt-4 border-t-2 border-[#0F172A] pt-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A] py-3 border-b border-slate-200"
              >
                {link.label}
              </a>
            ))}
            <div className="flex flex-col gap-3 mt-4">
              <button onClick={() => { setMobileMenuOpen(false); onSignIn(); }} className="btn-geometric-secondary w-full cursor-pointer text-center">
                Sign In
              </button>
              <button onClick={() => { setMobileMenuOpen(false); onGetStarted(); }} className="btn-geometric w-full flex items-center justify-center gap-2 cursor-pointer">
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ============================ HERO ============================ */}
      <section className="relative bg-[#0F172A] text-white overflow-hidden border-b-2 border-[#0F172A]">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(#10B981 1px, transparent 1px), linear-gradient(90deg, #10B981 1px, transparent 1px)', backgroundSize: '56px 56px' }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-20 grid lg:grid-cols-2 gap-12 lg:gap-14 items-center">
          {/* Left column */}
          <div>
            <div className="inline-flex items-center gap-2 border border-white/25 bg-white/5 px-2 py-1.5">
              <span className="bg-[#10B981] text-[#0F172A] font-mono text-[10px] font-bold tracking-widest px-2 py-0.5">LIVE</span>
              <span className="font-mono text-[11px] text-slate-300 tracking-wide">
                {(totalOpen || latest.length) ? `${totalOpen || latest.length} open tenders · ` : ''}Sierra Leone &amp; Liberia
              </span>
            </div>
            <h1 className="mt-5 font-display font-extrabold text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05] tracking-tight !text-white">
              Every public tender in <span className="text-[#10B981]">one place</span> — search, bid, win.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              Manohub brings live procurement notices, instant alerts, and a private bid pipeline together —
              whether you're bidding, publishing, or promoting your business across the Mano River region.
            </p>

            {/* Inline search */}
            <form onSubmit={handleHeroSearch} className="mt-7 bg-white border border-[#0F172A] flex flex-col sm:flex-row items-stretch">
              <div className="flex items-center gap-2 flex-1 px-3">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Search tenders, buyers, or reference…"
                  className="flex-1 !border-0 !bg-transparent py-3 text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <div className="hidden sm:block w-px bg-slate-200" />
              <select
                value={heroSector}
                onChange={(e) => setHeroSector(e.target.value)}
                className="!border-0 !border-t sm:!border-t-0 !border-slate-200 !bg-white text-sm font-semibold text-slate-600 px-3 py-3 sm:max-w-[170px] cursor-pointer focus:outline-none"
              >
                <option value="">All sectors</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-[#0F172A] text-white px-6 py-3 flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors shrink-0"
              >
                Search <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Popular chips */}
            {popularSectors.length > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Popular</span>
                {popularSectors.map((s) => (
                  <Link
                    key={s.id}
                    to={`/tenders?sector=${s.id}`}
                    className="px-3 py-1.5 border border-white/20 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/15 hover:border-white/40 transition-colors"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right column — matched tender card + stats */}
          <div className="relative">
            <div className="bg-white text-[#0F172A] border border-[#0F172A] p-5 shadow-[8px_8px_0_0_rgba(16,185,129,0.4)]">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1">
                  <Sparkles className="h-3 w-3" /> {heroTender ? 'LATEST TENDER' : 'EXAMPLE TENDER'}
                </span>
                <Bookmark className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex gap-3">
                <span className="w-11 h-11 border border-[#0F172A] bg-emerald-50 flex items-center justify-center shrink-0">
                  {(() => {
                    const Icon = sectorIcon(heroTender?.sector || 'health');
                    return <Icon className="h-5 w-5 text-emerald-700" />;
                  })()}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-slate-400">{heroTender ? (heroTender.opportunityType || heroTender.sector || 'Tender') : EXAMPLE_TENDER.ref}</div>
                  <div className="font-bold text-[15px] leading-snug mt-0.5">{heroTender ? heroTender.title : EXAMPLE_TENDER.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{heroTender ? heroTender.buyerName : EXAMPLE_TENDER.buyer}</div>
                </div>
              </div>
              <div className="h-px bg-slate-200 my-4" />
              <div className="flex items-end justify-between">
                <div>
                  <div className="font-mono text-[9px] text-slate-400 uppercase tracking-widest">Est. Value</div>
                  <div className="font-mono font-semibold text-sm mt-0.5">{heroTender ? formatValue(heroTender) : EXAMPLE_TENDER.value}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[9px] text-slate-400 uppercase tracking-widest">Closes</div>
                  <div className={`font-mono font-semibold text-sm mt-0.5 ${heroTender ? deadlineLabel(heroTender.submissionDeadline).cls : EXAMPLE_TENDER.deadlineCls}`}>
                    {heroTender ? deadlineLabel(heroTender.submissionDeadline).text : EXAMPLE_TENDER.deadlineText}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="border border-white/15 bg-white/5 px-4 py-3">
                  <div className="font-display font-black text-2xl text-white">{s.num}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ TRUST STRIP ============================ */}
      {buyers.length > 0 && (
        <section className="bg-white border-b border-slate-200 px-6">
          <div className="max-w-7xl mx-auto py-5 flex items-center gap-6 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400 whitespace-nowrap">Notices from</span>
            {buyers.map((b) => (
              <span key={b} className="font-semibold text-sm text-slate-600 whitespace-nowrap">{b}</span>
            ))}
          </div>
        </section>
      )}

      {/* ============================ LIVE EXPLORER ============================ */}
      <section id="explorer" className="px-6 py-14 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">Explore the market</span>
              <h2 className="mt-2 font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">Live opportunities, updated daily</h2>
            </div>
            <Link to="/tenders" className="hidden sm:flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A] hover:text-emerald-600 transition-colors whitespace-nowrap">
              Browse all {totalOpen || latest.length || ''} tenders <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!loadingLatest && latest.length === 0 ? (
            <div className="flex flex-col gap-6">
              <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-stretch">
                {/* Sectors */}
                <div id="sectors" className="bg-white border border-[#0F172A]">
                  <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200">
                    <span className="font-display font-bold text-[15px] text-slate-900">Sectors</span>
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{sectors.length || 0}</span>
                  </div>
                  {sectors.length === 0 ? (
                    <p className="px-4 py-8 text-xs text-slate-400 text-center">Loading sectors…</p>
                  ) : (
                    <div>
                      {sectors.map((sector) => {
                        const Icon = sectorIcon(sector.name);
                        return (
                          <Link
                            key={sector.id}
                            to={`/tenders?sector=${sector.id}`}
                            className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors group"
                          >
                            <Icon className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span className="flex-1 text-sm font-medium text-slate-800 group-hover:text-emerald-700 transition-colors min-w-0 truncate">{sector.name}</span>
                            <span className="font-mono text-xs text-slate-400 shrink-0">{latest.filter((op) => op.sector === sector.name).length}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: empty card + closing-soon bar */}
                <div className="flex flex-col gap-4">
                  <div className="flex-1 bg-white border border-[#0F172A] flex flex-col items-center justify-center text-center px-10 py-12">
                    <div className="w-16 h-16 border border-dashed border-slate-300 flex items-center justify-center text-slate-300">
                      <FileSearch className="h-7 w-7" />
                    </div>
                    <h3 className="font-display font-bold text-xl text-slate-900 mt-5 tracking-tight">No tenders published yet</h3>
                    <p className="text-sm text-slate-500 leading-relaxed max-w-md mt-2">New opportunities go live here as soon as they clear admin review.</p>
                    <div className="flex items-center gap-3.5 mt-6">
                      <button onClick={onGetStarted} className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-700 bg-white border border-[#0F172A] px-4 py-2.5 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors cursor-pointer">Get Alerted</button>
                      <Link to="/tenders" className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700 hover:text-emerald-800 transition-colors">Browse all tenders <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                    </div>
                  </div>
                  <div className="bg-white border border-[#0F172A] px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <Bell className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-display font-bold text-sm text-slate-900">Closing soon</span>
                      <span className="text-[13px] text-slate-500">Nothing closing soon yet.</span>
                    </div>
                    <button onClick={onGetStarted} className="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-700 bg-white border border-[#0F172A] px-3.5 py-2 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors cursor-pointer shrink-0">Get alerts for these</button>
                  </div>
                </div>
              </div>

              {/* How it works (per the Live Opportunities reference) */}
              <div className="mt-4">
                <div className="text-center font-mono text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">How it works</div>
                <div className="bg-white border border-[#0F172A] grid sm:grid-cols-3">
                  {[
                    { n: '1', title: 'Browse by sector', body: `Filter live opportunities across ${sectors.length || 12} industries.` },
                    { n: '2', title: 'Set up alerts', body: 'Get notified the moment a matching tender opens.' },
                    { n: '3', title: 'Submit your bid', body: 'Apply directly and track every submission.' },
                  ].map((step, i) => (
                    <div key={step.n} className={`px-8 py-7 ${i < 2 ? 'sm:border-r border-b sm:border-b-0 border-slate-200' : ''}`}>
                      <div className="w-9 h-9 border border-[#0F172A] flex items-center justify-center font-mono text-sm font-bold text-slate-900">{step.n}</div>
                      <h3 className="font-display font-bold text-base text-slate-900 mt-4">{step.title}</h3>
                      <p className="text-[13.5px] text-slate-500 leading-relaxed mt-1.5">{step.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
          <div className="grid lg:grid-cols-12 gap-5 items-start">
            {/* Sectors */}
            <aside id="sectors" className="lg:col-span-3 bg-white border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="font-display font-bold text-sm text-slate-900">Sectors</span>
                <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5">{sectors.length || 0}</span>
              </div>
              <div>
                {sectors.map((sector) => {
                  const Icon = sectorIcon(sector.name);
                  const count = latest.filter((op) => op.sector === sector.name).length;
                  return (
                    <Link
                      key={sector.id}
                      to={`/tenders?sector=${sector.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors group"
                    >
                      <span className="w-7 h-7 border border-slate-200 bg-emerald-50 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-emerald-700" />
                      </span>
                      <span className="flex-1 text-xs font-medium text-slate-700 group-hover:text-emerald-700 transition-colors min-w-0 truncate">{sector.name}</span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">{count}</span>
                    </Link>
                  );
                })}
                {sectors.length === 0 && <p className="px-4 py-6 text-xs text-slate-400 text-center">Loading sectors…</p>}
              </div>
            </aside>

            {/* Featured */}
            <div id="tenders-feed" className="lg:col-span-6 flex flex-col gap-4">
              {loadingLatest ? (
                [0, 1, 2].map((i) => <div key={i} className="h-28 bg-white border border-slate-200 animate-pulse" />)
              ) : featured.length === 0 ? (
                <div className="bg-white border border-slate-200 px-6 py-14 text-center flex flex-col items-center gap-3">
                  <FileSearch className="h-7 w-7 text-slate-300" />
                  <p className="text-sm text-slate-500 max-w-sm">
                    No tenders are published yet — new opportunities go live here as soon as they clear admin review.
                  </p>
                  <button onClick={onGetStarted} className="btn-geometric-secondary mt-1 cursor-pointer">Get Alerted</button>
                </div>
              ) : (
                featured.map((op) => {
                  const Icon = sectorIcon(op.sector || '');
                  const dl = deadlineLabel(op.submissionDeadline);
                  return (
                    <Link
                      key={op.id}
                      to={`/tenders/${op.slug}`}
                      className="group block bg-white border border-slate-200 hover:border-[#0F172A] transition-colors p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3 min-w-0">
                          <span className="w-11 h-11 border border-[#0F172A] bg-emerald-50 flex items-center justify-center shrink-0">
                            <Icon className="h-5 w-5 text-emerald-700" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] text-slate-400">
                              <span>{op.opportunityType || 'Tender'}</span>
                              {op.sector && <><span className="text-slate-300">·</span><span className="text-slate-500">{op.sector}</span></>}
                            </div>
                            <h3 className="font-semibold text-[15px] text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug mt-1">{op.title}</h3>
                          </div>
                        </div>
                        {op.isFeatured && <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider shrink-0">Featured</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 flex-wrap font-mono text-xs">
                        <span className="flex items-center gap-1.5 text-slate-500"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {[op.district, op.country].filter(Boolean).join(', ') || '—'}</span>
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700"><Coins className="h-3.5 w-3.5 text-slate-400" /> {formatValue(op)}</span>
                        <span className={`flex items-center gap-1.5 ml-auto font-semibold ${dl.cls}`}><Clock className="h-3.5 w-3.5" /> {dl.text}</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {/* Closing soon */}
            <aside className="lg:col-span-3 bg-white border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="font-display font-bold text-sm text-slate-900">Closing soon</span>
              </div>
              {closing.length === 0 ? (
                <p className="px-4 py-6 text-xs text-slate-400 text-center">Nothing closing soon yet.</p>
              ) : (
                closing.map((op) => {
                  const dl = deadlineLabel(op.submissionDeadline);
                  return (
                    <Link key={op.id} to={`/tenders/${op.slug}`} className="group block px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <div className="font-semibold text-[13px] text-slate-800 group-hover:text-emerald-700 transition-colors leading-snug">{op.title}</div>
                      <div className="flex items-center justify-between mt-2 font-mono text-[11px]">
                        <span className={dl.cls}>{dl.text}</span>
                        <span className="text-slate-500">{formatValue(op)}</span>
                      </div>
                    </Link>
                  );
                })
              )}
              <button
                onClick={onGetStarted}
                className="w-full px-4 py-3 border-t border-slate-200 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bell className="h-3.5 w-3.5" /> Get alerts for these
              </button>
            </aside>
          </div>
          )}
        </div>
      </section>

      {/* ============================ HOW IT WORKS (hidden when empty — the explorer shows its own) ============================ */}
      {(loadingLatest || latest.length > 0) && (
      <section id="how" className="px-6 py-14 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">How it works</span>
            <h2 className="mt-2 font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">From first search to awarded bid</h2>
          </div>
          <div className="mt-10 grid sm:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="border border-slate-200 bg-slate-50 p-6">
                  <div className="flex items-center justify-between">
                    <span className="h-11 w-11 border border-[#0F172A] bg-white flex items-center justify-center">
                      <Icon className="h-5 w-5 text-emerald-700" />
                    </span>
                    <span className="font-mono text-2xl font-bold text-slate-200">{step.num}</span>
                  </div>
                  <h3 className="mt-5 font-display font-bold text-lg text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{step.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* ============================ WHO WE SERVE ============================ */}
      <section id="audience" className="py-14 bg-slate-50 border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="max-w-2xl mx-auto flex flex-col items-center gap-2 text-center">
            <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">Who We Serve</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Built for buyers, suppliers, and advertisers
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              Whichever side of a tender you're on — or if you're simply promoting your business —
              Manohub has a subscription tier built around what you actually need.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
            {[
              { num: '01', icon: FileSearch, title: 'Suppliers & Bidders', body: 'Search and filter published tenders by sector, district, and deadline. Subscribe for full eligibility details, saved-search alerts, document downloads, and a private bid pipeline.' },
              { num: '02', icon: ClipboardCheck, title: 'Buyers & Institutions', body: 'Publish tenders for admin review, manage amendments and deadline extensions, and record awards — with a transparent, auditable review process at every step.' },
              { num: '03', icon: Megaphone, title: 'Business Advertisers', body: 'Submit what you want advertised — our team designs, builds, and runs it on social media — then track platform, reach, and run count from your dashboard.' },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.num} className="bg-white p-6 text-left flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="h-11 w-11 border border-[#0F172A] bg-slate-50 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-emerald-700" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 font-bold">{card.num}</span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-slate-900">{card.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{card.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================ ADVERTISE (scrolling banner) ============================ */}
      <section id="advertise" className="py-14 bg-white border-b border-slate-100 overflow-hidden">
        <style dangerouslySetInnerHTML={{ __html: `
          .mh-marquee-wrap { width: 100%; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
          .mh-marquee-track { display: flex; gap: 16px; width: max-content; padding: 4px 8px; animation: mh-marquee 48s linear infinite; }
          .mh-marquee-wrap:hover .mh-marquee-track { animation-play-state: paused; }
          @keyframes mh-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          @media (prefers-reduced-motion: reduce) { .mh-marquee-track { animation: none; } }
        ` }} />
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div className="max-w-2xl flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">More than tenders</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Advertise your business across the region
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Manohub isn't only procurement. Shops, service providers, healthcare, transport operators and
              event organisers promote what they do to buyers and communities across Sierra Leone and Liberia
              — our team designs, builds, and runs each campaign for you.
            </p>
          </div>
          <button onClick={onGetStarted} className="shrink-0 bg-emerald-600 text-white font-mono text-xs font-bold uppercase tracking-widest px-5 py-3 hover:bg-emerald-700 transition-colors cursor-pointer inline-flex items-center gap-2 self-start sm:self-auto">
            <Megaphone className="h-4 w-4" /> Advertise your business
          </button>
        </div>

        {/* Scrolling banner — real live adverts when published, else the
            categories businesses can promote (full-bleed). */}
        <div className="mt-8 mh-marquee-wrap">
          <div className="mh-marquee-track">
            {liveAdverts.length > 0
              ? [...liveAdverts, ...liveAdverts].map((ad, i) => (
                  <Link key={`ad-${i}`} to={`/adverts/${ad.slug}`} className="w-64 shrink-0 bg-white border border-[#0F172A] overflow-hidden group">
                    {ad.mediaUrl ? (
                      <img src={ad.mediaUrl} alt={ad.title} className="w-full h-28 object-cover border-b border-[#0F172A]" />
                    ) : (
                      <div className="w-full h-28 bg-[#0F172A] flex items-center justify-center border-b border-[#0F172A]">
                        <Store className="h-7 w-7 text-emerald-400" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-700">{ad.category}</span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-slate-400">Sponsored</span>
                      </div>
                      <h3 className="font-display font-bold text-sm text-slate-900 mt-2 leading-snug truncate group-hover:text-emerald-700 transition-colors">{ad.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{ad.businessName}</p>
                    </div>
                  </Link>
                ))
              : [...ADVERT_CATEGORIES, ...ADVERT_CATEGORIES].map((cat, i) => {
                  const Icon = cat.icon;
                  return (
                    <div key={i} className="w-64 shrink-0 bg-white border border-[#0F172A] p-5">
                      <div className="flex items-center justify-between">
                        <span className="w-11 h-11 border border-[#0F172A] bg-emerald-50 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-emerald-700" />
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-slate-400">Category</span>
                      </div>
                      <h3 className="font-display font-bold text-base text-slate-900 mt-4">{cat.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{cat.desc}</p>
                    </div>
                  );
                })}
          </div>
        </div>
      </section>

      {/* ============================ PRICING ============================ */}
      <section id="pricing" className="py-14 bg-slate-50 border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="max-w-2xl flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">Simple &amp; Adaptable Plans</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              A tier for every side of a tender
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              Browse for free. Subscribe to unlock full tender details, alerts, publishing, and business
              advertising. Pricing is agreed directly with our team — request a plan and we'll follow up.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full items-stretch">
            {/* Free */}
            <div className="border border-slate-300 bg-white p-6 flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Free</h3>
                <div className="my-4">
                  <span className="text-3xl font-extrabold text-slate-900 font-display">Le 0</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  Browse published tenders — teaser details, no sign-in required.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Public tender search</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 3 saved searches</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Basic tender info only</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-[#0F172A] text-[#0F172A] font-mono font-bold text-[11px] uppercase tracking-widest py-2.5 transition-colors hover:bg-[#0F172A] hover:text-white cursor-pointer text-center">
                Get Started
              </button>
            </div>

            {/* Professional */}
            <div className="border border-slate-300 bg-white p-6 flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Professional</h3>
                <div className="my-4">
                  <span className="text-xl font-extrabold text-slate-900 font-display">Contact Us</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  For suppliers who need the full picture before they bid.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Full tender details &amp; documents</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Real-time deadline alerts</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 10 saved searches</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 3 team members</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-[#0F172A] text-[#0F172A] font-mono font-bold text-[11px] uppercase tracking-widest py-2.5 transition-colors hover:bg-[#0F172A] hover:text-white cursor-pointer text-center">
                Subscribe Professional
              </button>
            </div>

            {/* Business (Recommended) */}
            <div className="border-2 border-emerald-600 bg-white p-6 flex flex-col justify-between text-left relative">
              <div className="absolute top-0 right-0 -translate-y-1/2 bg-emerald-600 text-white text-[9px] font-mono font-bold uppercase tracking-widest px-2.5 py-1">
                Recommended
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Business</h3>
                <div className="my-4">
                  <span className="text-xl font-extrabold text-slate-900 font-display">Contact Us</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  Everything in Professional, plus publish your own tenders and advertise your business.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Publish &amp; manage your own tenders</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Submit business/event adverts</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> CSV pipeline export</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 25 saved searches · 10 team members</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-emerald-600 border border-emerald-600 text-white font-mono font-bold text-[11px] uppercase tracking-widest py-2.5 transition-colors hover:bg-emerald-700 cursor-pointer text-center">
                Go Business
              </button>
            </div>

            {/* Enterprise */}
            <div className="border border-slate-300 bg-white p-6 flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Enterprise</h3>
                <div className="my-4">
                  <span className="text-xl font-extrabold text-slate-900 font-display">Contact Us</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  For agencies and institutions operating at scale across teams.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Everything in Business</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Unlimited saved searches</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Unlimited team members</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Dedicated support</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-[#0F172A] text-[#0F172A] font-mono font-bold text-[11px] uppercase tracking-widest py-2.5 transition-colors hover:bg-[#0F172A] hover:text-white cursor-pointer text-center">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section className="py-14 bg-white border-b border-slate-100 px-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase font-mono">Questions</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Frequently asked
            </h2>
          </div>

          <div className="border border-slate-200">
            {FAQS.map((item, i) => (
              <div key={item.q} className={i > 0 ? 'border-t border-slate-200' : ''}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <span className="font-display font-bold text-sm sm:text-base text-slate-900">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ CTA BAND ============================ */}
      <section className="relative bg-[#0F172A] text-white overflow-hidden px-6">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(#10B981 1px, transparent 1px), linear-gradient(90deg, #10B981 1px, transparent 1px)', backgroundSize: '56px 56px' }}
        />
        <div className="relative max-w-3xl mx-auto py-16 text-center">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight !text-white">Start finding tenders today</h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
            Search every open opportunity for free. Subscribe when you're ready to bid.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/tenders" className="bg-white text-[#0F172A] px-6 py-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-emerald-50 transition-colors">
              Browse live tenders <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#pricing" className="border border-white/25 bg-white/5 text-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-white/15 transition-colors">
              View pricing
            </a>
          </div>
        </div>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer className="bg-[#0F172A] text-slate-400 pt-14 pb-8 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-white/10">
          <div className="flex flex-col gap-3 col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border border-white/30 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 border-2 border-white"></div>
              </div>
              <span className="font-display font-bold text-white text-lg">Manohub</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              The Mano River region's tender and procurement platform — connecting buyers, suppliers, and
              advertisers across Sierra Leone and Liberia.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Platform</span>
            <a href="#explorer" className="text-xs hover:text-white transition-colors">Live Tenders</a>
            <a href="#sectors" className="text-xs hover:text-white transition-colors">Browse By Sector</a>
            <a href="#advertise" className="text-xs hover:text-white transition-colors">Advertise</a>
            <a href="#pricing" className="text-xs hover:text-white transition-colors">Pricing</a>
          </div>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Account</span>
            <button onClick={onSignIn} className="text-xs text-left hover:text-white transition-colors cursor-pointer">Sign In</button>
            <button onClick={onGetStarted} className="text-xs text-left hover:text-white transition-colors cursor-pointer">Get Started</button>
            <a href="#audience" className="text-xs hover:text-white transition-colors">Who We Serve</a>
          </div>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Get In Touch</span>
            <a href="mailto:hello@manohub.com" className="text-xs hover:text-white transition-colors flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> hello@manohub.com
            </a>
            <span className="text-xs flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp support in-app
            </span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 pt-6">
          <p className="text-xs text-slate-500 text-center md:text-left">
            © 2026 Manohub. Built for the Mano River region's local communities.
          </p>
          <p className="text-xs text-slate-500">Connecting the region to the globe.</p>
        </div>
      </footer>
    </div>
  );
}
