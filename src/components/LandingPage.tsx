import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Sparkles, Bell, FileSearch, ClipboardCheck, Megaphone } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  return (
    <div className="bg-[#F8FAFC] font-sans text-[#0F172A] min-h-screen">
      {/* Navigation Header */}
      <header className="sticky top-0 bg-[#F8FAFC]/95 border-b-2 border-[#0F172A] z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Geometric custom logo */}
            <div className="w-8 h-8 bg-[#0F172A] flex items-center justify-center shrink-0">
              <div className="w-4 h-4 border-2 border-white"></div>
            </div>
            <span className="font-display font-black tracking-widest text-xl uppercase text-[#0F172A]">
              Salone<span className="text-[#10B981]">Reach</span>
            </span>
          </div>

          <nav className="hidden md:flex gap-8 font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A]">
            <a href="#features" className="hover:underline transition-all">Features</a>
            <a href="#audience" className="hover:underline transition-all">Audiences</a>
            <a href="#pricing" className="hover:underline transition-all">Pricing</a>
            <Link to="/tenders" className="hover:underline transition-all flex items-center gap-1.5">
              <FileSearch className="h-3.5 w-3.5" /> Tenders
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={onSignIn}
              className="text-xs font-mono font-bold uppercase tracking-widest text-[#0F172A] px-4 py-2 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={onGetStarted}
              className="btn-geometric flex items-center gap-2 cursor-pointer"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 py-20 md:py-28 bg-[#F8FAFC] overflow-hidden border-b-2 border-[#0F172A]">
        <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-12 items-center">
          <div className="md:col-span-7 flex flex-col items-start gap-6 text-left">
            <div className="inline-flex items-center gap-2 border border-[#0F172A] bg-white text-[#0F172A] font-mono text-[10px] uppercase tracking-widest px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5" /> SYSTEM_NODE: ACTIVE
            </div>

            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-[#0F172A] tracking-tighter leading-none uppercase">
              FIND AND WIN <span className="text-[#10B981] underline decoration-[#0F172A] decoration-2">TENDERS</span> ACROSS SIERRA LEONE.
            </h1>

            <p className="text-base text-slate-600 max-w-xl leading-relaxed">
              SaloneReach is Sierra Leone's tender and procurement platform. Browse published opportunities for free, subscribe for full details and real-time alerts, or publish your own tenders as a verified buyer.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-2">
              <button
                onClick={onGetStarted}
                className="btn-geometric flex items-center justify-center gap-3 cursor-pointer"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/tenders"
                className="btn-geometric-secondary flex items-center justify-center gap-2"
              >
                Browse Tenders
              </Link>
            </div>

            <div className="flex items-center gap-6 mt-6 border-t border-[#0F172A] pt-6 w-full font-mono">
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">Free</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Public Search</span>
              </div>
              <div className="border-l border-[#0F172A] h-8" />
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">SL + LR</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Countries Covered</span>
              </div>
              <div className="border-l border-[#0F172A] h-8" />
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">Live</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Deadline Alerts</span>
              </div>
            </div>
          </div>

          {/* Graphical Promo Element */}
          <div className="md:col-span-5 relative">
            <div className="border-2 border-[#0F172A] bg-white p-6 relative overflow-hidden">
              <div className="flex justify-between items-center border-b border-[#0F172A] pb-4 mb-4">
                <span className="font-mono text-xs uppercase font-bold text-[#0F172A] flex items-center gap-2">
                  <CheckCircle className="text-[#10B981] h-4 w-4" /> TENDER_FEED: LIVE
                </span>
                <span className="border border-[#0F172A] bg-[#0F172A] text-white text-[9px] font-mono font-bold px-2 py-0.5 uppercase tracking-widest">
                  Published
                </span>
              </div>

              <div className="space-y-4">
                <div className="border border-[#0F172A] bg-slate-50 p-4 text-left">
                  <span className="text-[9px] text-slate-400 font-mono block mb-1 uppercase tracking-widest">Sample Listing</span>
                  <p className="font-medium text-xs text-[#0F172A] font-sans leading-relaxed">
                    Supply and delivery of office equipment — Ministry of Works, Freetown. Sector: Goods & Supplies.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-[#0F172A] bg-slate-50 p-3 text-left">
                    <span className="text-[9px] text-slate-400 font-mono block uppercase tracking-widest">Sector</span>
                    <span className="font-mono font-bold text-base text-[#10B981]">Goods</span>
                  </div>
                  <div className="border border-[#0F172A] bg-slate-50 p-3 text-left">
                    <span className="text-[9px] text-slate-400 font-mono block uppercase tracking-widest">District</span>
                    <span className="font-mono font-bold text-base text-blue-600">Freetown</span>
                  </div>
                </div>

                <div className="border border-[#0F172A] bg-[#0F172A]/5 p-3 text-left">
                  <p className="text-[11px] text-[#0F172A] font-mono leading-relaxed flex gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-[#10B981]" />
                    Subscribe to see full eligibility requirements, bid security, and submission instructions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience Section */}
      <section id="audience" className="py-20 bg-white border-y border-slate-100 px-6">
        <div className="max-w-7xl mx-auto text-center flex flex-col items-center gap-12">
          <div className="max-w-2xl flex flex-col gap-3">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase">Who We Serve</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
              Built for Buyers, Suppliers, and Advertisers
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Whichever side of a tender you're on — or if you're simply promoting your business — SaloneReach has a subscription tier built around what you actually need.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl text-left hover:shadow-md transition-all">
              <div className="bg-emerald-100 text-emerald-700 h-12 w-12 rounded-xl flex items-center justify-center mb-5">
                <FileSearch className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Suppliers & Bidders</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Search and filter published tenders by sector, district, and deadline. Subscribe for full eligibility details, saved-search alerts, document downloads, and a private bid pipeline.
              </p>
            </div>

            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl text-left hover:shadow-md transition-all">
              <div className="bg-blue-100 text-blue-700 h-12 w-12 rounded-xl flex items-center justify-center mb-5">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Buyers & Institutions</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Publish tenders for admin review, manage amendments and deadline extensions, and record awards — with the same transparency standard as DGMarket-style procurement portals.
              </p>
            </div>

            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl text-left hover:shadow-md transition-all col-span-1 sm:col-span-2 lg:col-span-1">
              <div className="bg-purple-100 text-purple-700 h-12 w-12 rounded-xl flex items-center justify-center mb-5">
                <Megaphone className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Business Advertisers</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Submit what you want advertised — our team designs, builds, and runs it on social media — then track platform, reach, and run count from your dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="py-20 bg-slate-50 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-16">
          <div className="max-w-2xl text-center flex flex-col gap-3">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase font-sans">Comprehensive Toolbox</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
              Everything a DGMarket-Style Portal Needs
            </h2>
            <p className="text-slate-600 leading-relaxed">
              From first search to awarded bid — search, alerts, publishing, and a private pipeline, all in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-8 w-full">
            {/* AI Assistant */}
            <div className="md:col-span-8 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col md:flex-row gap-8 items-center">
              <div className="space-y-4 flex-1">
                <div className="bg-emerald-50 text-emerald-700 font-bold text-xs px-3 py-1 rounded-md inline-block">
                  GEMINI AI-POWERED
                </div>
                <h3 className="font-display font-bold text-2xl text-slate-900">AI Tender Assistant</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Get plain-language explanations of dense tender documents, and automatic sector suggestions when buyers publish a new opportunity — so nothing gets misfiled or missed.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 w-full md:w-80 space-y-3 font-mono text-xs shrink-0 text-left">
                <div className="text-emerald-600 flex items-center gap-1.5 font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> explain_tender
                </div>
                <p className="text-slate-500 italic">"In simple terms: this tender needs a registered supplier who can deliver office furniture to Freetown within 30 days of award..."</p>
                <div className="border-t border-slate-100 pt-2 text-slate-400">Plain-language summaries</div>
              </div>
            </div>

            {/* Alerts */}
            <div className="md:col-span-4 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col justify-between">
              <div>
                <div className="bg-blue-50 text-blue-700 h-10 w-10 rounded-xl flex items-center justify-center mb-6">
                  <Bell className="h-5 w-5" />
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Saved Searches & Alerts</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Save a search once — by sector, district, or keyword — and get notified the moment a matching tender is published, amended, or approaching its deadline.
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-6 flex justify-between items-center text-xs text-slate-500">
                <span>In-app notifications</span>
                <span className="text-emerald-600 font-semibold">Active</span>
              </div>
            </div>

            {/* Buyer Publishing */}
            <div className="md:col-span-4 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col justify-between">
              <div>
                <div className="bg-purple-50 text-purple-700 h-10 w-10 rounded-xl flex items-center justify-center mb-6">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Buyer Publishing Workflow</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Verified buyers submit tenders for admin review before they go live, then manage amendments, deadline extensions, and awards from the same dashboard.
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-6 text-xs text-slate-400 font-mono">
                Every tender is admin-reviewed
              </div>
            </div>

            {/* Supplier Pipeline */}
            <div className="md:col-span-8 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full inline-block">
                  PRIVATE TO YOU
                </div>
                <h3 className="font-display font-bold text-2xl text-slate-900">Bid Pipeline & Documents</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Track every tender you're pursuing from saved through won or lost, upload supporting documents, and download buyer-published materials — never visible to other suppliers.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-4 border-t border-slate-100">
                <div className="text-center">
                  <span className="block font-mono text-emerald-600 font-bold">Saved</span>
                  <span className="text-xs text-slate-400">Stage 1</span>
                </div>
                <div className="text-center border-l border-slate-100">
                  <span className="block font-mono text-emerald-600 font-bold">Preparing</span>
                  <span className="text-xs text-slate-400">Stage 2</span>
                </div>
                <div className="text-center border-l border-slate-100">
                  <span className="block font-mono text-emerald-600 font-bold">Submitted</span>
                  <span className="text-xs text-slate-400">Stage 3</span>
                </div>
                <div className="text-center border-l border-slate-100">
                  <span className="block font-mono text-emerald-600 font-bold">Won / Lost</span>
                  <span className="text-xs text-slate-400">Stage 4</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Simplified Pricing Section */}
      <section id="pricing" className="py-20 bg-white border-t border-slate-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-16">
          <div className="max-w-2xl text-center flex flex-col gap-3">
            <span className="text-emerald-600 font-bold tracking-wider text-xs uppercase">Simple & Adaptable Plans</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">
              A Tier for Every Role
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Browse for free. Subscribe to unlock full tender details, alerts, publishing, and business advertising. Pricing is agreed directly with our team — request a plan and we'll follow up.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 w-full">
            {/* Free */}
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl flex flex-col justify-between text-left">
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
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg transition-colors cursor-pointer text-center text-sm">
                Get Started
              </button>
            </div>

            {/* Professional (Viewer) */}
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Professional</h3>
                <div className="my-4">
                  <span className="text-xl font-extrabold text-slate-900 font-display">Contact Us</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  For suppliers who need the full picture before they bid.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Full tender details & documents</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Real-time deadline alerts</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 10 saved searches</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 3 team members</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg transition-colors cursor-pointer text-center text-sm">
                Subscribe Professional
              </button>
            </div>

            {/* Business (Publisher + Advertiser) */}
            <div className="border-2 border-emerald-500 bg-emerald-50/10 p-6 rounded-2xl flex flex-col justify-between text-left relative">
              <div className="absolute top-0 right-6 -translate-y-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
                RECOMMENDED
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
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Publish & manage your own tenders</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Submit business/event adverts</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> CSV pipeline export</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 25 saved searches · 10 team members</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer text-center text-sm">
                Go Business
              </button>
            </div>

            {/* Enterprise */}
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl flex flex-col justify-between text-left">
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
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg transition-colors cursor-pointer text-center text-sm">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col h-4 w-6 border border-slate-700 rounded overflow-hidden">
              <div className="bg-emerald-500 h-1/3 w-full" />
              <div className="bg-white h-1/3 w-full" />
              <div className="bg-blue-500 h-1/3 w-full" />
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
