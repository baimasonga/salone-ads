import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Megaphone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { CmsContent, CmsContentType, fetchCmsContentPreview, fetchPublishedCmsContent, fetchPublishedCmsItem, trackCmsContentEvent } from '../lib/cmsApi';
import { Advert, fetchLiveAdverts } from '../lib/procurementApi';
import { CmsBody } from './CmsBody';
import { PublicSubscriptionSection } from './PublicSubscriptionSection';

function setMeta(name: string, content: string, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(property ? 'property' : 'name', name);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function CmsArticlePage({ contentType, preview = false }: { contentType?: CmsContentType; preview?: boolean }) {
  const { slug = '', contentId = '' } = useParams();
  const [content, setContent] = useState<CmsContent | null>(null);
  const [related, setRelated] = useState<CmsContent[]>([]);
  const [advert, setAdvert] = useState<Advert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([preview ? fetchCmsContentPreview(contentId) : fetchPublishedCmsItem(slug), fetchPublishedCmsContent(contentType), fetchLiveAdverts()])
      .then(([item, all, adverts]) => {
        if (!item || (contentType && item.contentType !== contentType)) return;
        setContent(item);
        setRelated(all.filter(candidate => candidate.id !== item.id && candidate.contentType === item.contentType && candidate.category === item.category).slice(0, 3));
        const selectedAdvert = adverts.find(advert => advert.id === item.nativeAdvertId) ?? adverts[0] ?? null;
        setAdvert(selectedAdvert);
        if (!preview) {
          void trackCmsContentEvent(item.id, 'view');
          if (selectedAdvert) void trackCmsContentEvent(item.id, 'ad_impression');
        }
        document.title = `${item.seoTitle || item.title} · Hyderra`;
        const description = item.seoDescription || item.excerpt;
        setMeta('description', description);
        setMeta('og:title', item.seoTitle || item.title, true);
        setMeta('og:description', description, true);
        if (item.socialImageUrl || item.featuredImageUrl) setMeta('og:image', item.socialImageUrl || item.featuredImageUrl, true);
      })
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, [contentId, contentType, preview, slug]);

  const readingMinutes = useMemo(() => content ? Math.max(1, Math.ceil(content.body.split(/\s+/).length / 220)) : 0, [content]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading content…</div>;
  if (!content) return <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center"><h1 className="font-display text-3xl font-extrabold">Content not found</h1><p className="mt-3 text-slate-500">This item may be unpublished, scheduled, removed, or unavailable to your account.</p><Link to={contentType === 'post' ? '/insights' : '/'} className="mt-6 border border-[#0F172A] bg-[#0F172A] px-5 py-3 font-mono text-xs font-bold uppercase text-white">Return to Hyderra</Link></main>;

  return <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
    {preview && <div role="status" className="border-b-2 border-[#0F172A] bg-[#F4D35E] px-4 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-widest">Secure CMS preview · This content is not publicly visible</div>}
    <header className="border-b-2 border-[#0F172A] bg-white px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/" className="font-display text-xl font-black tracking-widest">HYD<span className="text-emerald-600">ERRA</span></Link><Link to={content.contentType === 'post' ? '/insights' : '/'} className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase"><ArrowLeft className="h-3.5 w-3.5" />{content.contentType === 'post' ? 'All insights' : 'Home'}</Link></div></header>
    <article>
      <section className="border-b-2 border-[#0F172A] bg-[#0F172A] px-6 py-14 text-white"><div className="mx-auto max-w-4xl"><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-violet-300">{content.category} · {contentType}</p><h1 className="mt-4 font-display text-4xl font-extrabold leading-tight !text-white sm:text-5xl">{content.title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{content.excerpt}</p><p className="mt-6 font-mono text-[9px] uppercase tracking-widest text-slate-400">{content.authorName} · {readingMinutes} min read {content.publishedAt ? `· ${new Date(content.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}` : ''}</p></div></section>
      {content.featuredImageUrl && <div className="mx-auto max-w-5xl px-6 pt-10"><img src={content.featuredImageUrl} alt={content.featuredImageAlt || ''} className="max-h-[560px] w-full border-2 border-[#0F172A] object-cover" /></div>}
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_280px]"><div className="min-w-0"><CmsBody body={content.body} onLinkClick={() => { if (!preview) void trackCmsContentEvent(content.id, 'cta_click'); }} />{content.tags.length > 0 && <div className="mt-10 flex flex-wrap gap-2 border-t border-slate-200 pt-6">{content.tags.map(tag => <span key={tag} className="border border-slate-300 bg-white px-3 py-1.5 font-mono text-[9px] font-bold uppercase">{tag}</span>)}</div>}</div><aside>{advert && <div className="sticky top-5 border-2 border-[#0F172A] bg-[#F4D35E] p-4"><p className="font-mono text-[8px] font-bold uppercase tracking-widest">Sponsored on Hyderra</p>{advert.mediaUrl && <img src={advert.mediaUrl} alt={advert.title} className="mt-3 h-36 w-full border border-[#0F172A] object-cover" />}<h2 className="mt-4 font-display text-lg font-extrabold">{advert.title}</h2><p className="mt-2 text-xs text-slate-700">{advert.summary || advert.content}</p><Link onClick={() => { if (!preview) void trackCmsContentEvent(content.id, 'ad_click'); }} to={`/adverts/${advert.slug}`} className="mt-4 inline-flex items-center gap-2 border border-[#0F172A] bg-[#0F172A] px-3 py-2 font-mono text-[9px] font-bold uppercase text-white">Discover <Megaphone className="h-3.5 w-3.5" /></Link></div>}</aside></div>
    </article>
    {related.length > 0 && <section className="border-y-2 border-[#0F172A] bg-white px-6 py-10"><div className="mx-auto max-w-6xl"><h2 className="font-display text-2xl font-extrabold">Related content</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{related.map(item => <Link key={item.id} to={`/${item.contentType === 'post' ? 'insights' : 'pages'}/${item.slug}`} className="border-2 border-[#0F172A] p-5"><p className="font-mono text-[9px] font-bold uppercase text-violet-700">{item.category}</p><h3 className="mt-3 font-display text-lg font-bold">{item.title}</h3><span className="mt-4 inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase text-emerald-700">Read <ArrowRight className="h-3.5 w-3.5" /></span></Link>)}</div></div></section>}
    <PublicSubscriptionSection onSubscribed={() => { if (!preview) void trackCmsContentEvent(content.id, 'subscription'); }} />
  </main>;
}
