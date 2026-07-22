import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CheckCircle, Sparkles, Bell, FileSearch, ClipboardCheck, Megaphone,
  Search, KeyRound, Send, MapPin, Calendar, Menu, X,
} from 'lucide-react';
import { searchOpportunities, OpportunityListItem } from '../lib/procurementApi';

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

const HOW_IT_WORKS = [
  {
    num: '01',
    icon: Search,
    title: 'Search, free',
    body: 'Browse every published tender by sector, district, or keyword — no account needed.',
  },
  {
    num: '02',
    icon: KeyRound,
    title: 'Subscribe for full access',
    body: 'Unlock eligibility details, documents, and real-time deadline alerts.',
  },
  {
    num: '03',
    icon: Send,
    title: 'Bid, or publish your own',
    body: 'Track your pipeline as a supplier, or submit tenders for review as a verified buyer.',
  },
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const [latest, setLatest] = useState<OpportunityListItem[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    searchOpportunities({})
      .then((rows) => setLatest(rows.slice(0, 6)))
      .catch(() => setLatest([]))
      .finally(() => setLoadingLatest(false));
  }, []);

  const navLinks = [
    { href: '#tenders-feed', label: 'Live Tenders' },
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

          <nav className="hidden md:flex gap-8 font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A]">
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

        {/* Mobile menu panel */}
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
              <button
                onClick={() => { setMobileMenuOpen(false); onSignIn(); }}
                className="btn-geometric-secondary w-full cursor-pointer text-center"
              >
                Sign In
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); onGetStarted(); }}
                className="btn-geometric w-full flex items-center justify-center gap-2 cursor-pointer"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative px-6 py-20 md:py-28 bg-[#F8FAFC] overflow-hidden border-b-2 border-[#0F172A]">
        <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-12 items-start">
          <div className="md:col-span-7 flex flex-col items-start gap-6 text-left">
            <div className="inline-flex items-center gap-2 border border-[#0F172A] bg-white text-[#0F172A] font-mono text-[10px] uppercase tracking-widest px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#10B981]" /> Sierra Leone + Liberia
            </div>

            <h1 className="font-display font-extrabold text-5xl sm:text-6xl lg:text-7xl text-[#0F172A] tracking-tighter leading-[0.95] uppercase">
              Find and win
              <br />
              <span className="text-[#10B981] underline decoration-[#0F172A] decoration-[3px] underline-offset-4">tenders</span>.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
              SaloneReach is Sierra Leone's tender and procurement platform. Browse published opportunities
              for free, subscribe for full details and real-time alerts, or publish your own tenders as a
              verified buyer.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-2">
              <button onClick={onGetStarted} className="btn-geometric flex items-center justify-center gap-3 cursor-pointer">
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
              <Link to="/tenders" className="btn-geometric-secondary flex items-center justify-center gap-2">
                Browse Tenders
              </Link>
            </div>

            <div className="flex items-center gap-6 sm:gap-10 mt-6 border-t border-[#0F172A] pt-6 w-full font-mono">
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">Free</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Public search</span>
              </div>
              <div className="border-l border-slate-300 h-8" />
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">SL + LR</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Countries covered</span>
              </div>
              <div className="border-l border-slate-300 h-8" />
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">Live</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Deadline alerts</span>
              </div>
            </div>
          </div>

          {/* How It Works — process card, not a fabricated data mockup */}
          <div className="md:col-span-5 border-2 border-[#0F172A] bg-white">
            <div className="flex justify-between items-center border-b-2 border-[#0F172A] px-6 py-4">
              <span className="font-mono text-[10px] uppercase font-bold text-[#0F172A] tracking-widest">How It Works</span>
              <span className="bg-[#0F172A] text-white text-[9px] font-mono font-bold px-2 py-0.5 uppercase tracking-widest">
                3 Steps
              </span>
            </div>
            <div>
              {HOW_IT_WORKS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.num}
                    className={`flex gap-4 px-6 py-5 ${i < HOW_IT_WORKS.length - 1 ? 'border-b border-slate-200' : ''}`}
                  >
                    <div className="shrink-0 flex flex-col items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400 font-bold">{step.num}</span>
                      <div className="h-9 w-9 border border-[#0F172A] bg-emerald-50 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-emerald-700" />
                      </div>
                    </div>
                    <div className="text-left">
                      <h3 className="font-display font-bold text-sm text-[#0F172A]">{step.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Live Tenders Feed — real data, honest empty state */}
      <section id="tenders-feed" className="py-20 bg-white border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex flex-col gap-3">
              <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Live Tender Feed</span>
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border border-slate-200 p-5 h-40 animate-pulse bg-slate-50" />
              ))}
            </div>
          ) : latest.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 px-8 py-16 text-center flex flex-col items-center gap-3">
              <FileSearch className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500 max-w-md">
                No tenders are published yet — new opportunities go live as soon as they clear admin
                review. Be the first to know when one lands.
              </p>
              <button onClick={onGetStarted} className="btn-geometric-secondary mt-2 cursor-pointer">
                Get Alerted
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
      <section id="audience" className="py-20 bg-slate-50 border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-12">
          <div className="max-w-2xl flex flex-col gap-3">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Who We Serve</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
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
                <div key={card.num} className="bg-slate-50 p-8 text-left flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="h-11 w-11 border border-[#0F172A] bg-white flex items-center justify-center">
                      <Icon className="h-5 w-5 text-emerald-700" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 font-bold">{card.num}</span>
                  </div>
                  <h3 className="font-display font-bold text-xl text-slate-900">{card.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{card.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="py-20 bg-white px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-16">
          <div className="max-w-2xl flex flex-col gap-3">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Comprehensive Toolbox</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
              Everything a DGMarket-Style Portal Needs
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              From first search to awarded bid — search, alerts, publishing, and a private pipeline, all
              in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-6 w-full">
            {/* AI Assistant */}
            <div className="md:col-span-8 border border-slate-200 hover:border-[#0F172A] transition-colors p-8 flex flex-col md:flex-row gap-8 items-center">
              <div className="space-y-4 flex-1">
                <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px] px-3 py-1 uppercase tracking-wider inline-block">
                  Gemini AI-Powered
                </div>
                <h3 className="font-display font-bold text-2xl text-slate-900">AI Tender Assistant</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Get plain-language explanations of dense tender documents, and automatic sector
                  suggestions when buyers publish a new opportunity — so nothing gets misfiled or missed.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-5 w-full md:w-80 space-y-3 font-mono text-xs shrink-0 text-left">
                <div className="text-emerald-600 flex items-center gap-1.5 font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> explain_tender
                </div>
                <p className="text-slate-500 italic">"In simple terms: this tender needs a registered supplier who can deliver office furniture to Freetown within 30 days of award..."</p>
                <div className="border-t border-slate-200 pt-2 text-slate-400">Plain-language summaries</div>
              </div>
            </div>

            {/* Alerts */}
            <div className="md:col-span-4 border border-slate-200 hover:border-[#0F172A] transition-colors p-8 flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 border border-[#0F172A] bg-blue-50 flex items-center justify-center mb-6">
                  <Bell className="h-5 w-5 text-blue-700" />
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Saved Searches &amp; Alerts</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Save a search once — by sector, district, or keyword — and get notified the moment a
                  matching tender is published, amended, or approaching its deadline.
                </p>
              </div>
              <div className="border-t border-slate-200 pt-4 mt-6 flex justify-between items-center text-xs text-slate-500 font-mono">
                <span>In-app notifications</span>
                <span className="text-emerald-600 font-semibold">Active</span>
              </div>
            </div>

            {/* Buyer Publishing */}
            <div className="md:col-span-4 border border-slate-200 hover:border-[#0F172A] transition-colors p-8 flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 border border-[#0F172A] bg-purple-50 flex items-center justify-center mb-6">
                  <ClipboardCheck className="h-5 w-5 text-purple-700" />
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Buyer Publishing Workflow</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Verified buyers submit tenders for admin review before they go live, then manage
                  amendments, deadline extensions, and awards from the same dashboard.
                </p>
              </div>
              <div className="border-t border-slate-200 pt-4 mt-6 text-xs text-slate-400 font-mono">
                Every tender is admin-reviewed
              </div>
            </div>

            {/* Supplier Pipeline */}
            <div className="md:col-span-8 border border-slate-200 hover:border-[#0F172A] transition-colors p-8 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border border-amber-200 bg-amber-50 text-amber-800 font-mono text-[10px] font-semibold px-3 py-1 uppercase tracking-wider inline-block">
                  Private To You
                </div>
                <h3 className="font-display font-bold text-2xl text-slate-900">Bid Pipeline &amp; Documents</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Track every tender you're pursuing from saved through won or lost, upload supporting
                  documents, and download buyer-published materials — never visible to other suppliers.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-4 border-t border-slate-200">
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

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-slate-50 border-t border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-16">
          <div className="max-w-2xl flex flex-col gap-3">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-mono">Simple &amp; Adaptable Plans</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
              A Tier for Every Role
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-lg">
              Browse for free. Subscribe to unlock full tender details, alerts, publishing, and business
              advertising. Pricing is agreed directly with our team — request a plan and we'll follow up.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full items-stretch">
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

      {/* Footer */}
      <footer className="bg-[#0F172A] text-slate-400 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border border-white/30 flex items-center justify-center shrink-0">
              <div className="w-4 h-4 border-2 border-white"></div>
            </div>
            <span className="font-display font-bold text-white text-lg">SaloneReach</span>
          </div>
          <p className="text-xs text-slate-500 text-center md:text-right">
            © 2026 SaloneReach. Designed with love and Salone pride for local communities. Connecting Sierra Leone to the globe.
          </p>
        </div>
      </footer>
    </div>
  );
}
