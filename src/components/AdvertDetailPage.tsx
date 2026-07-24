import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Megaphone, Store } from 'lucide-react';
import { fetchAdvertBySlug, Advert } from '../lib/procurementApi';

function platformLabel(p: string | null): string {
  if (!p) return 'social media';
  return p;
}

export function AdvertDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [advert, setAdvert] = useState<Advert | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetchAdvertBySlug(slug)
      .then((a) => {
        if (!a || a.status !== 'live') setNotFound(true);
        else setAdvert(a);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

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

      <main className="max-w-3xl mx-auto px-6 py-10 text-left">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading advert…
          </div>
        )}

        {!loading && notFound && (
          <div className="bg-white border border-slate-200 p-10 text-center">
            <div className="w-14 h-14 border border-slate-200 bg-slate-50 flex items-center justify-center mx-auto">
              <Store className="h-6 w-6 text-slate-400" />
            </div>
            <h1 className="font-display font-bold text-lg text-slate-900 mt-4">Advert not available</h1>
            <p className="text-sm text-slate-500 mt-1.5">This advert may have ended or isn't published. Browse what's live on Manohub instead.</p>
            <Link to="/" className="btn-geometric mt-5 inline-flex items-center gap-2 cursor-pointer">Back to home</Link>
          </div>
        )}

        {!loading && advert && (
          <article className="bg-white border border-[#0F172A]">
            {advert.mediaUrl ? (
              <img src={advert.mediaUrl} alt={advert.title} className="w-full max-h-96 object-cover border-b border-[#0F172A]" />
            ) : (
              <div className="w-full h-40 bg-[#0F172A] flex items-center justify-center border-b border-[#0F172A]">
                <Store className="h-10 w-10 text-emerald-400" />
              </div>
            )}

            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">{advert.category}</span>
                <span className="font-mono text-[11px] text-slate-400">Sponsored on Manohub</span>
              </div>

              <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight mt-3">{advert.title}</h1>
              <p className="text-sm font-semibold text-slate-600 mt-1">{advert.businessName}</p>

              {advert.summary && <p className="text-base text-slate-700 mt-4 leading-relaxed">{advert.summary}</p>}

              {advert.content && (
                <div className="mt-5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border-t border-slate-100 pt-5">
                  {advert.content}
                </div>
              )}

              <div className="mt-7 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-3">
                {advert.socialUrl ? (
                  <a
                    href={advert.socialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 text-white font-mono text-xs font-bold uppercase tracking-widest px-5 py-3 hover:bg-emerald-700 transition-colors inline-flex items-center gap-2"
                  >
                    View on {platformLabel(advert.socialPlatform)} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-slate-400">Running on {platformLabel(advert.socialPlatform)}</span>
                )}
                <Link to="/#advertise" className="border border-[#0F172A] text-[#0F172A] font-mono text-xs font-bold uppercase tracking-widest px-5 py-3 hover:bg-[#0F172A] hover:text-white transition-colors inline-flex items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5" /> Advertise your business
                </Link>
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
