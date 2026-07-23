import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CheckCircle, Sparkles, Bell, FileSearch, ClipboardCheck, Megaphone,
  Search, KeyRound, Send, MapPin, Calendar, Menu, X, Wheat, HardHat, Mountain, Wifi, Landmark,
  HeartPulse, GraduationCap, Palmtree, Zap, Truck, Briefcase, HandHeart, Building2, ChevronDown,
  Mail, MessageCircle, FileCheck2,
} from 'lucide-react';
import { searchOpportunities, fetchSectors, fetchDistricts, fetchCountries, OpportunityListItem, TaxonomyOption } from '../lib/procurementApi';

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

// Original flat-geometric illustration — a published tender (document +
// approval seal) and an advert going out (megaphone + reach waves). Hand-
// built inline SVG, not a stock asset, to stay consistent with the rest of
// the "Emerald Sky" visual language and avoid licensing/attribution issues.
function ProcurementIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden="true">
      {/* Tender document */}
      <rect x="20" y="20" width="112" height="150" rx="4" fill="#F8FAFC" />
      <rect x="20" y="20" width="112" height="28" rx="4" fill="#10B981" />
      <rect x="32" y="66" width="86" height="6" rx="2" fill="#CBD5E1" />
      <rect x="32" y="82" width="70" height="6" rx="2" fill="#CBD5E1" />
      <rect x="32" y="98" width="86" height="6" rx="2" fill="#CBD5E1" />
      <rect x="32" y="114" width="50" height="6" rx="2" fill="#CBD5E1" />
      <rect x="32" y="130" width="70" height="6" rx="2" fill="#CBD5E1" />
      {/* Approval seal */}
      <circle cx="112" cy="152" r="22" fill="#0F172A" stroke="#10B981" strokeWidth="2.5" />
      <path d="M101 152 L109 160 L124 144" stroke="#10B981" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Megaphone (advertising) */}
      <rect x="140" y="118" width="13" height="16" fill="#FBBF24" />
      <path d="M150 90 L192 70 L192 152 L150 132 Z" fill="#FBBF24" />
      {/* Reach waves */}
      <path d="M200 82 Q214 111 200 140" stroke="#FBBF24" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M210 72 Q230 111 210 150" stroke="#FBBF24" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M220 62 Q246 111 220 160" stroke="#FBBF24" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

const HOW_IT_WORKS = [
  { num: '01', icon: Search, title: 'Search, free', body: 'Browse every published tender by sector, district, or keyword — no account needed.' },
  { num: '02', icon: KeyRound, title: 'Subscribe for full access', body: 'Unlock eligibility details, documents, and real-time deadline alerts.' },
  { num: '03', icon: Send, title: 'Bid, or publish your own', body: 'Track your pipeline as a supplier, or submit tenders for review as a verified buyer.' },
];

const FAQS = [
  { q: 'Do I need an account to browse tenders?', a: 'No. Public tender search is completely free with no sign-in required. An account and subscription are only needed for full eligibility details, documents, alerts, or publishing.' },
  { q: 'How do buyers get their tenders published?', a: 'Verified buyers submit tenders through their dashboard. Every submission goes through admin review — for accuracy and legitimacy — before it appears on the public feed.' },
  { q: "What's the difference between Professional and Business plans?", a: 'Professional unlocks full tender details, documents, and real-time alerts for suppliers. Business adds the ability to publish your own tenders and submit business or event adverts.' },
  { q: 'How does business advertising work?', a: 'Business and Enterprise subscribers submit what they want advertised through their dashboard. Our team designs, builds, and runs it on social media — you track platform, reach, and run count from the same screen.' },
  { q: 'Which countries does Manohub cover?', a: 'Sierra Leone and Liberia today, with a regional West Africa expansion roadmap.' },
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const navigate = useNavigate();
  const [latest, setLatest] = useState<OpportunityListItem[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sectors, setSectors] = useState<TaxonomyOption[]>([]);
  const [districtCount, setDistrictCount] = useState(0);
  const [countryCount, setCountryCount] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    searchOpportunities({})
      .then((rows) => setLatest(rows.slice(0, 9)))
      .catch(() => setLatest([]))
      .finally(() => setLoadingLatest(false));
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
    navigate(searchKeyword ? `/tenders?q=${encodeURIComponent(searchKeyword)}` : '/tenders');
  };

  const navLinks = [
    { href: '#tenders-feed', label: 'Live Tenders' },
    { href: '#sectors', label: 'Sectors' },
    { href: '#features', label: 'Features' },
    { href: '#audience', label: 'Audiences' },
    { href: '#pricing', label: 'Pricing' },
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
              Salone<span className="text-[#10B981]">Reach</span>
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

      {/* Utility Search Bar — DGMarket-style, immediate access before any marketing copy */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-3">
        <form onSubmit={handleHeroSearch} className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-2 sm:items-center">
          <span className="hidden sm:block font-display font-bold text-sm text-[#0F172A] shrink-0">Search</span>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Search tenders by keyword, sector, or buyer..."
            className="flex-1 !border-slate-300 px-3 py-2 text-sm bg-white focus:!border-[#0F172A]"
          />
          <button type="submit" className="bg-[#0F172A] text-white px-5 py-2 flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-emerald-700 transition-colors shrink-0">
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <Link to="/tenders" className="text-xs font-mono font-bold uppercase tracking-widest text-[#0F172A] hover:text-emerald-600 transition-colors shrink-0 text-center sm:text-left">
            Advanced Search
          </Link>
        </form>
      </div>

      {/* Compact banner — brand identity, not a stock photo */}
      <section className="relative bg-[#0F172A] text-white px-6 py-10 md:py-12 overflow-hidden border-b-2 border-[#0F172A]">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #10B981 0, #10B981 1px, transparent 1px, transparent 24px)' }}
        />
        {/* Oversized faint watermark version of the same illustration — quiet texture behind the copy */}
        <ProcurementIllustration className="hidden lg:block absolute -right-6 -bottom-10 h-72 w-72 opacity-[0.06] pointer-events-none rotate-3" />

        <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 border border-white/30 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 w-fit">
              <Sparkles className="h-3.5 w-3.5 text-[#10B981]" /> Sierra Leone + Liberia
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl tracking-tight uppercase max-w-2xl !text-white">
              Procurement opportunities across West Africa
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              Browse published tenders for free, subscribe for full details and real-time alerts, or publish your own as a verified buyer.
            </p>

            {/* Icon cluster — tendering + advertising, our own visual language, not stock photography */}
            <div className="flex items-center gap-3 sm:gap-4 mt-2">
              {[
                { icon: FileCheck2, label: 'Tenders' },
                { icon: Search, label: 'Search' },
                { icon: Megaphone, label: 'Adverts' },
                { icon: Bell, label: 'Alerts' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div className="h-10 w-10 sm:h-11 sm:w-11 border border-white/30 bg-white/5 flex items-center justify-center">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-[#10B981]" />
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center md:items-end gap-6 shrink-0 border-t md:border-t-0 md:border-l border-white/20 pt-6 md:pt-0 md:pl-8">
            <ProcurementIllustration className="hidden md:block w-40 h-auto" />
            <div className="grid grid-cols-3 gap-6 sm:gap-8 font-mono">
              <div>
                <span className="block font-black text-2xl">{sectors.length || '—'}</span>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest">Sectors</span>
              </div>
              <div>
                <span className="block font-black text-2xl">{districtCount || '—'}</span>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest">Districts</span>
              </div>
              <div>
                <span className="block font-black text-2xl">{countryCount || '—'}</span>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest">Countries</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three action cards — Find / Alerts / Subscribe */}
      <section className="relative px-6 py-10 bg-gradient-to-b from-emerald-50/50 via-white to-white border-b border-slate-100 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #10B981 0, #10B981 1px, transparent 1px, transparent 24px)' }}
        />
        <div className="relative max-w-7xl mx-auto flex flex-col gap-5">
          <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Quick Actions</span>
          <div className="grid sm:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
          {[
            { icon: Search, title: 'Find Tenders', body: 'In your sector and district.', linkLabel: 'Advanced search', to: '/tenders' },
            { icon: Bell, title: 'Get Alerts', body: 'Tailored to your saved searches.', linkLabel: 'Add alerts', action: onGetStarted },
            { icon: KeyRound, title: 'Subscribe', body: 'To unlock full procurement notices.', linkLabel: 'View plans', href: '#pricing' },
          ].map((card) => {
            const Icon = card.icon;
            const content = (
              <>
                <div className="h-11 w-11 border border-[#0F172A] bg-emerald-50 flex items-center justify-center mb-3">
                  <Icon className="h-5 w-5 text-emerald-700" />
                </div>
                <h3 className="font-display font-bold text-base text-slate-900">{card.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{card.body}</p>
                <span className="text-xs font-semibold text-emerald-700 mt-3 inline-block">{card.linkLabel} →</span>
              </>
            );
            return card.to ? (
              <Link key={card.title} to={card.to} className="bg-white hover:bg-slate-50 p-6 flex flex-col items-start transition-colors">{content}</Link>
            ) : card.href ? (
              <a key={card.title} href={card.href} className="bg-white hover:bg-slate-50 p-6 flex flex-col items-start transition-colors">{content}</a>
            ) : (
              <button key={card.title} onClick={card.action} className="bg-white hover:bg-slate-50 p-6 flex flex-col items-start transition-colors text-left cursor-pointer">{content}</button>
            );
          })}
          </div>
        </div>
      </section>

      {/* Directory: Sectors | Latest Opportunities | Popular Tenders — DGMarket-style density */}
      <section className="px-6 py-10 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-6 items-start">
          {/* Sectors sidebar with real counts */}
          <aside id="sectors" className="lg:col-span-3 bg-white border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200">
              <span className="font-display font-bold text-sm text-slate-900">Sectors</span>
            </div>
            <div>
              {sectors.map((sector) => {
                const Icon = sectorIcon(sector.name);
                const count = latest.filter((op) => op.sector === sector.name).length;
                return (
                  <Link
                    key={sector.id}
                    to={`/tenders?sector=${sector.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors group"
                  >
                    <span className="flex items-center gap-2 text-xs font-medium text-slate-700 group-hover:text-emerald-700 transition-colors">
                      <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" /> {sector.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{count}</span>
                  </Link>
                );
              })}
            </div>
          </aside>

          {/* Main list — Latest & Featured Opportunities */}
          <div id="tenders-feed" className="lg:col-span-6 bg-white border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display font-bold text-sm text-slate-900">Latest &amp; Featured Opportunities</span>
              <Link to="/tenders" className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0F172A] hover:text-emerald-600 transition-colors flex items-center gap-1">
                View All <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {loadingLatest ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-50 animate-pulse" />)}
              </div>
            ) : latest.length === 0 ? (
              <div className="px-6 py-12 text-center flex flex-col items-center gap-3">
                <FileSearch className="h-7 w-7 text-slate-300" />
                <p className="text-sm text-slate-500 max-w-sm">
                  No tenders are published yet — new opportunities go live as soon as they clear admin review.
                </p>
                <button onClick={onGetStarted} className="btn-geometric-secondary mt-1 cursor-pointer">Get Alerted</button>
              </div>
            ) : (
              <div>
                {latest.slice(0, 8).map((op) => (
                  <Link
                    key={op.id}
                    to={`/tenders/${op.slug}`}
                    className="group block px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {op.isFeatured && <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider">Featured</span>}
                      {op.sector && <span className="bg-slate-100 text-slate-600 font-mono text-[9px] px-1.5 py-0.5 uppercase">{op.sector}</span>}
                    </div>
                    <h3 className="font-semibold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">{op.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[op.district, op.country].filter(Boolean).join(', ') || '—'}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Deadline: {formatDeadline(op.submissionDeadline)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Popular tenders — real view_count data */}
          <aside className="lg:col-span-3 bg-white border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200">
              <span className="font-display font-bold text-sm text-slate-900">Popular Tenders</span>
            </div>
            {!loadingLatest && latest.length === 0 ? (
              <p className="text-xs text-slate-400 px-4 py-6 text-center">No activity yet.</p>
            ) : (
              <div>
                {[...latest].sort((a, b) => b.viewCount - a.viewCount).slice(0, 6).map((op) => (
                  <Link
                    key={op.id}
                    to={`/tenders/${op.slug}`}
                    className="group block px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    <h4 className="text-xs font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors leading-snug">{op.title}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">{[op.country, formatDeadline(op.submissionDeadline)].filter(Boolean).join(' · ')}</p>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* Compact 3-step ribbon */}
      <section className="px-6 py-10 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto border-2 border-[#0F172A] bg-white grid sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.num} className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? 'sm:border-l border-t sm:border-t-0 border-slate-200' : ''}`}>
                <div className="h-9 w-9 border border-[#0F172A] bg-emerald-50 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-emerald-700" />
                </div>
                <div className="text-left">
                  <span className="font-mono text-[9px] text-slate-400 font-bold">{step.num}</span>
                  <h3 className="font-display font-bold text-sm text-[#0F172A] leading-tight">{step.title}</h3>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Target Audience Section */}
      <section id="audience" className="py-14 bg-white border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="max-w-2xl mx-auto flex flex-col items-center gap-2 text-center">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Who We Serve</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Built for Buyers, Suppliers, and Advertisers
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              Whichever side of a tender you're on — or if you're simply promoting your business —
              Manohub has a subscription tier built around what you actually need.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
            {[
              { num: '01', icon: FileSearch, title: 'Suppliers & Bidders', body: 'Search and filter published tenders by sector, district, and deadline. Subscribe for full eligibility details, saved-search alerts, document downloads, and a private bid pipeline.' },
              { num: '02', icon: ClipboardCheck, title: 'Buyers & Institutions', body: 'Publish tenders for admin review, manage amendments and deadline extensions, and record awards — with the same transparency standard as DGMarket-style procurement portals.' },
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

      {/* Feature Bento Grid */}
      <section id="features" className="py-14 bg-slate-50 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="max-w-2xl flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Comprehensive Toolbox</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Everything a DGMarket-Style Portal Needs
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              From first search to awarded bid — search, alerts, publishing, and a private pipeline, all
              in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-4 w-full">
            {/* AI Assistant */}
            <div className="md:col-span-8 border border-slate-200 hover:border-[#0F172A] transition-colors p-6 bg-white flex flex-col md:flex-row gap-6 items-center">
              <div className="space-y-3 flex-1">
                <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px] px-3 py-1 uppercase tracking-wider inline-block">
                  Gemini AI-Powered
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900">AI Tender Assistant</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Get plain-language explanations of dense tender documents, and automatic sector
                  suggestions when buyers publish a new opportunity — so nothing gets misfiled or missed.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 w-full md:w-72 space-y-2 font-mono text-xs shrink-0 text-left">
                <div className="text-emerald-600 flex items-center gap-1.5 font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> explain_tender
                </div>
                <p className="text-slate-500 italic">"In simple terms: this tender needs a registered supplier who can deliver office furniture to Freetown within 30 days of award..."</p>
                <div className="border-t border-slate-200 pt-2 text-slate-400">Plain-language summaries</div>
              </div>
            </div>

            {/* Alerts */}
            <div className="md:col-span-4 border border-slate-200 hover:border-[#0F172A] transition-colors p-6 bg-white flex flex-col justify-between">
              <div>
                <div className="h-9 w-9 border border-[#0F172A] bg-blue-50 flex items-center justify-center mb-4">
                  <Bell className="h-4 w-4 text-blue-700" />
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900 mb-1.5">Saved Searches &amp; Alerts</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Save a search once — by sector, district, or keyword — and get notified the moment a
                  matching tender is published, amended, or approaching its deadline.
                </p>
              </div>
              <div className="border-t border-slate-200 pt-3 mt-4 flex justify-between items-center text-xs text-slate-500 font-mono">
                <span>In-app notifications</span>
                <span className="text-emerald-600 font-semibold">Active</span>
              </div>
            </div>

            {/* Buyer Publishing */}
            <div className="md:col-span-4 border border-slate-200 hover:border-[#0F172A] transition-colors p-6 bg-white flex flex-col justify-between">
              <div>
                <div className="h-9 w-9 border border-[#0F172A] bg-purple-50 flex items-center justify-center mb-4">
                  <ClipboardCheck className="h-4 w-4 text-purple-700" />
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900 mb-1.5">Buyer Publishing Workflow</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Verified buyers submit tenders for admin review before they go live, then manage
                  amendments, deadline extensions, and awards from the same dashboard.
                </p>
              </div>
              <div className="border-t border-slate-200 pt-3 mt-4 text-xs text-slate-400 font-mono">
                Every tender is admin-reviewed
              </div>
            </div>

            {/* Supplier Pipeline */}
            <div className="md:col-span-8 border border-slate-200 hover:border-[#0F172A] transition-colors p-6 bg-white flex flex-col justify-between">
              <div className="space-y-3">
                <div className="border border-amber-200 bg-amber-50 text-amber-800 font-mono text-[10px] font-semibold px-3 py-1 uppercase tracking-wider inline-block">
                  Private To You
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900">Bid Pipeline &amp; Documents</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Track every tender you're pursuing from saved through won or lost, upload supporting
                  documents, and download buyer-published materials — never visible to other suppliers.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-3 border-t border-slate-200">
                {['Saved', 'Preparing', 'Submitted', 'Won / Lost'].map((label, i) => (
                  <div key={label} className={`text-center ${i > 0 ? 'border-l border-slate-200' : ''}`}>
                    <span className="block font-mono text-emerald-600 font-bold text-sm">{label}</span>
                    <span className="text-[10px] text-slate-400">Stage {i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-white border-t border-slate-100 px-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Questions</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Frequently Asked
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

      {/* Pricing Section — exclusive to this page */}
      <section id="pricing" className="py-14 bg-slate-50 border-t border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="max-w-2xl flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Simple &amp; Adaptable Plans</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              A Tier for Every Role
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
                  Browse published tenders, DGMarket-style — teaser details, no sign-in required.
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

      {/* Footer — multi-column, only real in-page links */}
      <footer className="bg-[#0F172A] text-slate-400 pt-14 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-white/10">
          <div className="flex flex-col gap-3 col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border border-white/30 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 border-2 border-white"></div>
              </div>
              <span className="font-display font-bold text-white text-lg">Manohub</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Sierra Leone's tender and procurement platform — connecting buyers, suppliers, and advertisers
              across Sierra Leone and Liberia.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Platform</span>
            <a href="#tenders-feed" className="text-xs hover:text-white transition-colors">Live Tenders</a>
            <a href="#sectors" className="text-xs hover:text-white transition-colors">Browse By Sector</a>
            <a href="#features" className="text-xs hover:text-white transition-colors">Features</a>
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
            © 2026 Manohub. Designed with love and Salone pride for local communities.
          </p>
          <p className="text-xs text-slate-500">Connecting Sierra Leone to the globe.</p>
        </div>
      </footer>
    </div>
  );
}
