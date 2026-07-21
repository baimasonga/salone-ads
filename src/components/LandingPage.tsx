import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Globe, Users, TrendingUp, CheckCircle, Shield, Award, Sparkles, MessageSquare, FileSearch } from 'lucide-react';

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
              GROW YOUR BUSINESS IN <span className="text-[#10B981] underline decoration-[#0F172A] decoration-2">SIERRA LEONE</span> AND BEYOND.
            </h1>

            <p className="text-base text-slate-600 max-w-xl leading-relaxed">
              SaloneReach is the digital growth and advertising platform connecting Sierra Leonean businesses, organizations, creators, and communities with audiences in Sierra Leone and around the world.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-2">
              <button
                onClick={onGetStarted}
                className="btn-geometric flex items-center justify-center gap-3 cursor-pointer"
              >
                Start Campaign <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#features"
                className="btn-geometric-secondary flex items-center justify-center gap-2"
              >
                Explore Features
              </a>
            </div>

            <div className="flex items-center gap-6 mt-6 border-t border-[#0F172A] pt-6 w-full font-mono">
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">4.8M+</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Audience Reach</span>
              </div>
              <div className="border-l border-[#0F172A] h-8" />
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">1,200+</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">SL Businesses</span>
              </div>
              <div className="border-l border-[#0F172A] h-8" />
              <div>
                <span className="block font-black text-3xl text-[#0F172A]">20+</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Diaspora Hubs</span>
              </div>
            </div>
          </div>

          {/* Graphical Promo Element */}
          <div className="md:col-span-5 relative">
            <div className="border-2 border-[#0F172A] bg-white p-6 relative overflow-hidden">
              <div className="flex justify-between items-center border-b border-[#0F172A] pb-4 mb-4">
                <span className="font-mono text-xs uppercase font-bold text-[#0F172A] flex items-center gap-2">
                  <CheckCircle className="text-[#10B981] h-4 w-4" /> PROMO_ALIGN: RICE_01
                </span>
                <span className="border border-[#0F172A] bg-[#0F172A] text-white text-[9px] font-mono font-bold px-2 py-0.5 uppercase tracking-widest">
                  Active
                </span>
              </div>

              <div className="space-y-4">
                <div className="border border-[#0F172A] bg-slate-50 p-4 text-left">
                  <span className="text-[9px] text-slate-400 font-mono block mb-1 uppercase tracking-widest">Target Context</span>
                  <p className="font-medium text-xs text-[#0F172A] font-sans leading-relaxed">
                    Sierra Leonean diaspora (UK, US, Canada) sponsoring native rice bags for parents back home.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-[#0F172A] bg-slate-50 p-3 text-left">
                    <span className="text-[9px] text-slate-400 font-mono block uppercase tracking-widest">Throughput</span>
                    <span className="font-mono font-bold text-base text-[#10B981]">42.5K Reach</span>
                  </div>
                  <div className="border border-[#0F172A] bg-slate-50 p-3 text-left">
                    <span className="text-[9px] text-slate-400 font-mono block uppercase tracking-widest">Alignment</span>
                    <span className="font-mono font-bold text-base text-blue-600">2.1K Leads</span>
                  </div>
                </div>

                <div className="border border-[#0F172A] bg-[#0F172A]/5 p-3 text-left">
                  <p className="text-[11px] text-[#0F172A] font-mono leading-relaxed flex gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-[#10B981]" />
                    "Leonean-grown parboiled rice delivered directly to Bo, Makeni, or Freetown within 48 hours."
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
              Bridging Local Talents with Global Communities
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We connect agricultural producers, retail startups, creative artists, tourism operators, and development agencies with users locally and in diaspora markets.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl text-left hover:shadow-md transition-all">
              <div className="bg-emerald-100 text-emerald-700 h-12 w-12 rounded-xl flex items-center justify-center mb-5">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Local Small Businesses</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Unlock high-fidelity marketing tools to design Facebook, TikTok, and WhatsApp campaign strategies that drive organic and paid foot traffic directly to your storefront.
              </p>
            </div>

            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl text-left hover:shadow-md transition-all">
              <div className="bg-blue-100 text-blue-700 h-12 w-12 rounded-xl flex items-center justify-center mb-5">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Diaspora Sponsors</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Directly purchase locally sourced food supplies, book excursions, buy homecoming events tickets, or fund local agricultural developers in a traceable, transparent ecosystem.
              </p>
            </div>

            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl text-left hover:shadow-md transition-all col-span-1 sm:col-span-2 lg:col-span-1">
              <div className="bg-purple-100 text-purple-700 h-12 w-12 rounded-xl flex items-center justify-center mb-5">
                <Award className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Musicians & Creators</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Build verified creator marketplace profiles displaying clear social metrics, platforms, and rate cards to secure brand sponsorship contracts easily.
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
              Engineered for Real-World Engagement
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Skip complex marketing pipelines. SaloneReach equips you with all tools required to map, build, preview, and track campaigns.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-8 w-full">
            {/* AI Assistant */}
            <div className="md:col-span-8 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col md:flex-row gap-8 items-center">
              <div className="space-y-4 flex-1">
                <div className="bg-emerald-50 text-emerald-700 font-bold text-xs px-3 py-1 rounded-md inline-block">
                  GEMINI AI-POWERED
                </div>
                <h3 className="font-display font-bold text-2xl text-slate-900">AI Campaign Assistant</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Generate hyper-localized marketing briefs, Facebook copy variants, and warm Krio-styled radio script narratives that resonate perfectly with Sierra Leoneans at home or abroad.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 w-full md:w-80 space-y-3 font-mono text-xs shrink-0 text-left">
                <div className="text-emerald-600 flex items-center gap-1.5 font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> krio_caption_helper
                </div>
                <p className="text-slate-500 italic">"Padi, dis rice ya na real Salone pride. Pure, sweet, and delivered straight..."</p>
                <div className="border-t border-slate-100 pt-2 text-slate-400">Tone: Friendly & Honest 🇸🇱</div>
              </div>
            </div>

            {/* Low-Bandwidth */}
            <div className="md:col-span-4 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col justify-between">
              <div>
                <div className="bg-blue-50 text-blue-700 h-10 w-10 rounded-xl flex items-center justify-center mb-6">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-2">Low-Bandwidth Mode</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Optimized for Sierra Leonean mobile networks. Toggle compression, defer video loading, and autosave templates to LocalStorage to safeguard work during unexpected connectivity lags.
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-6 flex justify-between items-center text-xs text-slate-500">
                <span>Direct client saving</span>
                <span className="text-emerald-600 font-semibold">Active</span>
              </div>
            </div>

            {/* Leads & WhatsApp */}
            <div className="md:col-span-4 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col justify-between">
              <div>
                <div className="bg-purple-50 text-purple-700 h-10 w-10 rounded-xl flex items-center justify-center mb-6">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-2">WhatsApp Click Tracking</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Generate instant redirect links, short codes, and QR badges connecting ads directly to your WhatsApp Business inbox. Monitor lead triggers seamlessly.
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-6 text-xs text-slate-400 font-mono">
                salone.reach/rt/rice-bo
              </div>
            </div>

            {/* Public Directory */}
            <div className="md:col-span-8 bg-white border border-slate-100 p-8 rounded-3xl text-left shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full inline-block">
                  DISCOVERABILITY
                </div>
                <h3 className="font-display font-bold text-2xl text-slate-900">Verified Business Directory</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  List your company under agricultural, tourism, technology, or catering categories. Claim existing records with proper documentation to earn verification checkmarks and diaspora trust.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-4 border-t border-slate-100">
                <div className="text-center">
                  <span className="block font-mono text-emerald-600 font-bold">Bo District</span>
                  <span className="text-xs text-slate-400">Agriculture</span>
                </div>
                <div className="text-center border-l border-slate-100">
                  <span className="block font-mono text-emerald-600 font-bold">Lumley</span>
                  <span className="text-xs text-slate-400">Hotels</span>
                </div>
                <div className="text-center border-l border-slate-100">
                  <span className="block font-mono text-emerald-600 font-bold">Kenema</span>
                  <span className="text-xs text-slate-400">Cocoa Growers</span>
                </div>
                <div className="text-center border-l border-slate-100">
                  <span className="block font-mono text-emerald-600 font-bold">Makeni</span>
                  <span className="text-xs text-slate-400">Retail Supply</span>
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
              Invest in Scalable Local Growth
            </h2>
            <p className="text-slate-600 leading-relaxed">
              No hidden fees or rigid long-term bindings. Choose the exact tier supporting your company scale and primary audience locations.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 w-full">
            {/* Free Trial */}
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Trial</h3>
                <div className="my-4">
                  <span className="text-3xl font-extrabold text-slate-900 font-display">Free</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  Perfect for local startups to map campaigns and configure directory lists.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 1 Campaign Plan</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Local Directory Profile</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Manual Calendar Exports</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg transition-colors cursor-pointer text-center text-sm">
                Get Started
              </button>
            </div>

            {/* Starter */}
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Starter</h3>
                <div className="my-4">
                  <span className="text-3xl font-extrabold text-slate-900 font-display">$19</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  For active local retail, agro-producers, and digital creators.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 3 Active Campaigns</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> 1 Brand Kit configuration</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> AI content tokens (Basic)</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> WhatsApp Click shortcodes</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg transition-colors cursor-pointer text-center text-sm">
                Subscribe Starter
              </button>
            </div>

            {/* Professional */}
            <div className="border-2 border-emerald-500 bg-emerald-50/10 p-6 rounded-2xl flex flex-col justify-between text-left relative">
              <div className="absolute top-0 right-6 -translate-y-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
                RECOMMENDED
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Professional</h3>
                <div className="my-4">
                  <span className="text-3xl font-extrabold text-slate-900 font-display">$49</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  Comprehensive tools designed for established companies & exporters.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Unlimited Campaign Plans</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Multiple Brand Kits</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Full AI Studio Completion</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Interactive CRM Lead tables</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer text-center text-sm">
                Go Professional
              </button>
            </div>

            {/* Agency / Enterprise */}
            <div className="border border-slate-100 bg-slate-50/50 p-6 rounded-2xl flex flex-col justify-between text-left">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">Agency</h3>
                <div className="my-4">
                  <span className="text-3xl font-extrabold text-slate-900 font-display">$99</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mb-6">
                  For marketing agencies and organizations managing client assets.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Multi-Tenant Client Profiles</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Client reviewer access portals</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Premium white-label analytics</li>
                </ul>
              </div>
              <button onClick={onGetStarted} className="w-full mt-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg transition-colors cursor-pointer text-center text-sm">
                Get Agency
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
