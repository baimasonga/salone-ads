import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Megaphone, Store } from 'lucide-react';
import { fetchLiveAdverts, Advert } from '../lib/procurementApi';
import { AdvertCreative, CreativeScaler } from './AdvertCreative';

// Public advert marketplace — the discovery surface social click-throughs land
// on. Every live advert, browsable by category, each linking to its own page.
export function AdvertsFeedPage() {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    fetchLiveAdverts(60)
      .then(setAdverts)
      .catch(() => setAdverts([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    adverts.forEach((a) => a.category && set.add(a.category));
    return ['all', ...Array.from(set).sort()];
  }, [adverts]);

  const shown = active === 'all' ? adverts : adverts.filter((a) => a.category === active);

  return (
    <div className="min-h-screen bg-[#F8FAFC] border-4 md:border-8 border-[#0F172A]">
      <header className="bg-white border-b border-[#0F172A] px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[#0F172A] font-display font-black tracking-widest uppercase text-sm">
          <ArrowLeft className="h-4 w-4" /> Manohub
        </Link>
        <Link to="/#advertise" className="text-xs font-mono uppercase tracking-widest text-emerald-700 hover:underline flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" /> Advertise
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-left">
          <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-700">Marketplace</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight mt-1">Adverts on Manohub</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">Businesses, goods, services and notices across Sierra Leone and Liberia. Tap any advert for full details and how to reach them.</p>
        </div>

        {categories.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={`font-mono text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 border cursor-pointer transition-colors ${active === c ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#0F172A]'}`}
              >
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-20 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading adverts…
          </div>
        )}

        {!loading && shown.length === 0 && (
          <div className="bg-white border border-slate-200 p-12 text-center mt-8">
            <div className="w-14 h-14 border border-slate-200 bg-slate-50 flex items-center justify-center mx-auto">
              <Store className="h-6 w-6 text-slate-400" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-900 mt-4">No adverts here yet</h2>
            <p className="text-sm text-slate-500 mt-1.5">Be the first to advertise your business on Manohub.</p>
            <Link to="/#advertise" className="btn-geometric mt-5 inline-flex items-center gap-2 cursor-pointer">Advertise your business</Link>
          </div>
        )}

        {!loading && shown.length > 0 && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shown.map((adv) => (
              <Link key={adv.id} to={`/adverts/${adv.slug}`} className="group block bg-white border border-[#0F172A] hover:-translate-y-0.5 transition-transform">
                <div className="bg-slate-50 border-b border-[#0F172A] p-3">
                  <CreativeScaler format="square">
                    <AdvertCreative
                      format="square"
                      theme={adv.theme}
                      withPhoto={adv.withPhoto}
                      businessName={adv.businessName}
                      headline={adv.title}
                      body={adv.summary || adv.content}
                      category={adv.category}
                      mediaUrl={adv.mediaUrl}
                      platform={adv.socialPlatform}
                      ctaUrl={adv.socialUrl}
                      accentColor={adv.accentColor}
                      logoUrl={adv.logoUrl}
                    />
                  </CreativeScaler>
                </div>
                <div className="p-4">
                  <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">{adv.category}</span>
                  <h3 className="font-display font-bold text-slate-900 text-base mt-2 leading-snug group-hover:text-emerald-700 transition-colors">{adv.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{adv.businessName}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
