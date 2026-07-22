import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CheckCircle, Sparkles, Bell, FileSearch, ClipboardCheck, Megaphone,
  Search, KeyRound, Send, MapPin, Calendar, Menu, X, Wheat, HardHat, Mountain, Wifi, Landmark,
  HeartPulse, GraduationCap, Palmtree, Zap, Truck, Briefcase, HandHeart, Building2, ChevronDown,
  Mail, MessageCircle,
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
  { q: 'Which countries does SaloneReach cover?', a: 'Sierra Leone and Liberia today, with a regional West Africa expansion roadmap.' },
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

      {/* Hero Section */}
      <section className="relative px-6 py-12 md:py-16 bg-[#F8FAFC] border-b-2 border-[#0F172A]">
        <div className="max-w-5xl mx-auto flex flex-col items-start gap-6 text-left">
          <div className="inline-flex items-center gap-2 border border-[#0F172A] bg-white text-[#0F172A] font-mono text-[10px] uppercase tracking-widest px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#10B981]" /> Sierra Leone + Liberia
          </div>

          <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-[#0F172A] tracking-tighter leading-[0.98] uppercase">
            Find and win <span className="text-[#10B981] underline decoration-[#0F172A] decoration-[3px] underline-offset-4">tenders</span> across West Africa.
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
            SaloneReach is Sierra Leone's tender and procurement platform. Browse published opportunities
            for free, subscribe for full details and real-time alerts, or publish your own tenders as a
            verified buyer.
          </p>

          {/* Prominent search bar */}
          <form onSubmit={handleHeroSearch} className="w-full max-w-2xl flex border-2 border-[#0F172A] bg-white">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Search tenders by keyword, sector, or buyer..."
              className="flex-1 !border-0 px-4 py-3 text-sm bg-white focus:outline-none"
            />
            <button type="submit" className="bg-[#0F172A] text-white px-5 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-emerald-700 transition-colors">
              <Search className="h-4 w-4" /> Search
            </button>
          </form>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button onClick={onGetStarted} className="btn-geometric flex items-center justify-center gap-3 cursor-pointer">
              Get Started <ArrowRight className="h-4 w-4" />
            </button>
            <Link to="/tenders" className="btn-geometric-secondary flex items-center justify-center gap-2">
              Browse All Tenders
            </Link>
          </div>

          {/* Real stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 mt-4 border-t border-[#0F172A] pt-6 w-full font-mono">
            <div>
              <span className="block font-black text-3xl text-[#0F172A]">Free</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Public search</span>
            </div>
            <div>
              <span className="block font-black text-3xl text-[#0F172A]">{sectors.length || '—'}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Sectors covered</span>
            </div>
            <div>
              <span className="block font-black text-3xl text-[#0F172A]">{districtCount || '—'}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Districts &amp; counties</span>
            </div>
            <div>
              <span className="block font-black text-3xl text-[#0F172A]">{countryCount || 2}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Countries live</span>
            </div>
          </div>
        </div>

        {/* Compact 3-step ribbon */}
        <div className="max-w-5xl mx-auto mt-10 border-2 border-[#0F172A] bg-white grid sm:grid-cols-3">
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

      {/* Browse by Sector — real taxonomy data */}
      <section id="sectors" className="py-14 bg-white border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Browse By Sector</span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                {sectors.length} Sectors, One Search
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-200 border border-slate-200">
            {sectors.map((sector) => {
              const Icon = sectorIcon(sector.name);
              return (
                <Link
                  key={sector.id}
                  to={`/tenders?sector=${sector.id}`}
                  className="group bg-white hover:bg-slate-50 p-5 flex flex-col items-start gap-3 transition-colors"
                >
                  <Icon className="h-5 w-5 text-emerald-700" />
                  <span className="text-xs font-semibold text-slate-800 leading-snug group-hover:text-emerald-700 transition-colors">
                    {sector.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Tenders Feed — real data, honest empty state */}
      <section id="tenders-feed" className="py-14 bg-slate-50 border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Live Tender Feed</span>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                Latest Published Opportunities
              </h2>
            </div>
            <Link
              to="/tenders"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-widest text-[#0F172A] hover:text-emerald-600 transition-colors shrink-0"
            >
              View All Tenders <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loadingLatest ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border border-slate-200 p-5 h-36 animate-pulse bg-white" />
              ))}
            </div>
          ) : latest.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 bg-white px-8 py-14 text-center flex flex-col items-center gap-3">
              <FileSearch className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500 max-w-md">
                No tenders are published yet — new opportunities go live as soon as they clear admin
                review. Be the first to know when one lands.
              </p>
              <button onClick={onGetStarted} className="btn-geometric-secondary mt-2 cursor-pointer bg-white">
                Get Alerted
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {latest.map((op) => (
                <Link
                  key={op.id}
                  to={`/tenders/${op.slug}`}
                  className="group border border-slate-200 hover:border-[#0F172A] bg-white p-5 flex flex-col gap-3 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {op.isFeatured && (
                      <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">Featured</span>
                    )}
                    {op.sector && (
                      <span className="bg-slate-100 text-slate-600 font-mono text-[9px] px-2 py-0.5 uppercase">{op.sector}</span>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-slate-900 leading-snug group-hover:text-emerald-700 transition-colors">
                    {op.title}
                  </h3>
                  <p className="text-xs text-slate-500">{op.buyerName}</p>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-mono">
                    {(op.district || op.country) && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[op.district, op.country].filter(Boolean).join(', ')}</span>
                    )}
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDeadline(op.submissionDeadline)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Target Audience Section */}
      <section id="audience" className="py-14 bg-white border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="max-w-2xl flex flex-col gap-2">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Who We Serve</span>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Built for Buyers, Suppliers, and Advertisers
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              Whichever side of a tender you're on — or if you're simply promoting your business —
              SaloneReach has a subscription tier built around what you actually need.
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
              <span className="font-display font-bold text-white text-lg">SaloneReach</span>
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
            <a href="mailto:hello@salonereach.com" className="text-xs hover:text-white transition-colors flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> hello@salonereach.com
            </a>
            <span className="text-xs flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp support in-app
            </span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 pt-6">
          <p className="text-xs text-slate-500 text-center md:text-left">
            © 2026 SaloneReach. Designed with love and Salone pride for local communities.
          </p>
          <p className="text-xs text-slate-500">Connecting Sierra Leone to the globe.</p>
        </div>
      </footer>
    </div>
  );
}
