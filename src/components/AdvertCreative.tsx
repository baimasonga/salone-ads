import { forwardRef, useEffect, useRef, useState, ReactNode } from 'react';

// Auto-generated advert creative built from the Gradient design tokens. The
// same advert fields render a finished, on-brand "poster / newspaper strip /
// social square" — like a magazine or newspaper ad — with no manual design.
// forwardRef so the rendered node can be exported to PNG (html-to-image).

export type AdvertFormat = 'poster' | 'strip' | 'square';

export const CREATIVE_SIZE: Record<AdvertFormat, { w: number; h: number }> = {
  poster: { w: 600, h: 760 },
  strip: { w: 960, h: 250 },
  square: { w: 700, h: 700 },
};

export interface AdvertCreativeProps {
  businessName: string;
  headline: string;
  body?: string | null;
  category?: string | null;
  mediaUrl?: string | null;
  platform?: string | null;
  ctaUrl?: string | null;
  format?: AdvertFormat;
  accentColor?: string | null;
  logoUrl?: string | null;
}

const SANS = "'Hanken Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const DUSK = 'linear-gradient(150deg, #14141b 0%, #241f52 48%, #4a2f6e 82%, #6e3a63 100%)';
const MESH =
  'radial-gradient(42% 60% at 18% 22%, rgba(93,78,224,0.55) 0%, rgba(93,78,224,0) 100%), radial-gradient(38% 55% at 82% 14%, rgba(180,88,223,0.5) 0%, rgba(180,88,223,0) 100%), radial-gradient(46% 65% at 74% 88%, rgba(239,106,160,0.5) 0%, rgba(239,106,160,0) 100%), radial-gradient(40% 55% at 16% 92%, rgba(255,138,107,0.42) 0%, rgba(255,138,107,0) 100%)';
const AURORA = 'linear-gradient(115deg, #5d4ee0 0%, #8f5be8 34%, #ef6aa0 70%, #ff8a6b 100%)';

function Wordmark({ light }: { light?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 20, height: 20, background: light ? '#0d1b2a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 9, height: 9, border: `2px solid ${light ? '#fff' : '#0d1b2a'}` }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', color: light ? '#0d1b2a' : '#fff' }}>MANOHUB</span>
    </div>
  );
}

// Scales a fixed-size creative down to fit its container width (keeps the
// export node full-resolution; only the on-screen display shrinks).
export function CreativeScaler({ format = 'poster', children }: { format?: AdvertFormat; children: ReactNode }) {
  const { w, h } = CREATIVE_SIZE[format];
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={ref} style={{ width: '100%', height: h * scale, overflow: 'hidden' }}>
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

export const AdvertCreative = forwardRef<HTMLDivElement, AdvertCreativeProps>(function AdvertCreative(
  { businessName, headline, body, category, mediaUrl, platform, ctaUrl, format = 'poster', accentColor, logoUrl },
  ref,
) {
  const { w, h } = CREATIVE_SIZE[format];
  const cat = (category || 'Advert').toUpperCase();
  const cta = platform ? `Find us on ${platform}` : ctaUrl ? 'Learn more' : 'Advertised on Manohub';
  const accentBg = accentColor || AURORA; // brand colour overrides the default gradient accent
  const logo = logoUrl ? <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: 30, maxWidth: 150, objectFit: 'contain', display: 'block' }} /> : null;

  // ── Newspaper strip: high-contrast black-on-white classified look ──
  if (format === 'strip') {
    return (
      <div ref={ref} style={{ width: w, height: h, background: '#ffffff', border: '3px solid #0d1b2a', display: 'flex', fontFamily: SANS, overflow: 'hidden' }}>
        <div style={{ width: 10, background: accentBg, flex: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '26px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#159a6b' }}>{cat}</span>
            {logo || <Wordmark light />}
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40, lineHeight: 1.02, letterSpacing: '-0.02em', color: '#0d1b2a', margin: '10px 0' }}>{headline}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontFamily: SANS, fontSize: 17, fontWeight: 600, color: '#3a4452' }}>{businessName}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#fff', background: '#0d1b2a', padding: '8px 14px', whiteSpace: 'nowrap' }}>{cta.toUpperCase()}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Poster & square: premium dark gradient "magazine" look ──
  const isSquare = format === 'square';
  return (
    <div ref={ref} style={{ position: 'relative', width: w, height: h, background: DUSK, color: '#fff', fontFamily: SANS, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: MESH, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,27,42,0) 40%, rgba(13,27,42,0.55) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: isSquare ? '40px 44px' : '44px 46px' }}>
        {/* top */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {logo || <Wordmark />}
          <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.6)' }}>SPONSORED</span>
        </div>

        {/* category pill */}
        <div style={{ marginTop: isSquare ? 26 : 30 }}>
          <span style={{ display: 'inline-block', fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#fff', background: accentBg, padding: '7px 14px', borderRadius: 999 }}>{cat}</span>
        </div>

        {/* headline */}
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: isSquare ? 46 : 54, lineHeight: 1.02, letterSpacing: '-0.03em', marginTop: 18, textWrap: 'balance' as any }}>{headline}</div>

        {/* body */}
        {body ? (
          <div style={{ fontFamily: SANS, fontSize: isSquare ? 18 : 20, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)', marginTop: 16, maxWidth: isSquare ? '100%' : 460, display: '-webkit-box', WebkitLineClamp: mediaUrl ? 3 : 5, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{body}</div>
        ) : null}

        {/* optional media */}
        {mediaUrl ? (
          <div style={{ marginTop: 22, flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
            <img src={mediaUrl} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* gradient rule */}
        <div style={{ height: 3, borderRadius: 999, background: accentBg, margin: isSquare ? '22px 0 18px' : '26px 0 20px' }} />

        {/* footer: brand + CTA */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: isSquare ? 22 : 24, letterSpacing: '-0.01em' }}>{businessName}</div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{cta}</div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>manohub.com</span>
        </div>
      </div>
    </div>
  );
});
