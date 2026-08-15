import { forwardRef, useEffect, useRef, useState, ReactNode } from 'react';

// Auto-generated advert creative — a faithful build of the "Hyderra Ad Frame"
// design system (exported from Claude Design). One set of advert fields renders
// a finished, on-brand social/print creative — square / story / landscape, in a
// dark (dusk gradient + mesh glow) or light (newspaper) theme — like a magazine
// or newspaper ad, with no manual design work.
// forwardRef so the rendered node can be exported to PNG (html-to-image).

export type AdvertFormat = 'square' | 'story' | 'landscape' | 'banner' | 'editorial';
export type AdvertTheme = 'dark' | 'light';

export const CREATIVE_SIZE: Record<AdvertFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  landscape: { w: 1200, h: 628 },
  banner: { w: 1280, h: 720 },
  editorial: { w: 1080, h: 1350 },
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
  theme?: AdvertTheme;
  accentColor?: string | null;
  logoUrl?: string | null;
  // When false, the photo panel is hidden and the copy goes full-width /
  // "text-forward" (larger headline). Defaults to true.
  withPhoto?: boolean;
}

const SANS = "'Hanken Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const INK = '#0d1b2a';
const IRIS = '#5d4ee0';
const GREEN = '#159a6b';
const DUSK = 'linear-gradient(150deg, #14141b 0%, #241f52 48%, #4a2f6e 82%, #6e3a63 100%)';
const AURORA = 'linear-gradient(135deg, #5d4ee0 0%, #8f5be8 34%, #ef6aa0 70%, #ff8a6b 100%)';
const MESH =
  'radial-gradient(48% 42% at 84% 12%, rgba(120,96,240,0.60) 0%, rgba(120,96,240,0) 100%), radial-gradient(46% 60% at 18% 96%, rgba(239,106,160,0.42) 0%, rgba(239,106,160,0) 100%), radial-gradient(40% 44% at 96% 88%, rgba(255,138,107,0.30) 0%, rgba(255,138,107,0) 100%)';

interface Palette {
  bg: string;
  mesh: string | null;
  scrim: string | null;
  headline: string;
  body: string;
  business: string;
  footer: string;
  divider: string;
  logoText: string;
  logoBorder: string;
  panelBg: string;
  panelBorder: string;
  panelText: string;
}

function palette(theme: AdvertTheme): Palette {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      mesh: null,
      scrim: null,
      headline: INK,
      body: '#54606f',
      business: INK,
      footer: '#8b95a3',
      divider: 'rgba(13,27,42,0.10)',
      logoText: '#54606f',
      logoBorder: 'rgba(13,27,42,0.16)',
      panelBg: '#f2f3f5',
      panelBorder: 'rgba(13,27,42,0.14)',
      panelText: 'rgba(13,27,42,0.32)',
    };
  }
  return {
    bg: DUSK,
    mesh: MESH,
    scrim: 'linear-gradient(180deg, rgba(13,27,42,0) 55%, rgba(13,27,42,0.35) 100%)',
    headline: '#ffffff',
    body: 'rgba(255,255,255,0.72)',
    business: '#ffffff',
    footer: 'rgba(255,255,255,0.45)',
    divider: 'rgba(255,255,255,0.14)',
    logoText: 'rgba(255,255,255,0.66)',
    logoBorder: 'rgba(255,255,255,0.22)',
    panelBg: 'rgba(255,255,255,0.035)',
    panelBorder: 'rgba(255,255,255,0.18)',
    panelText: 'rgba(255,255,255,0.42)',
  };
}

function Wordmark({ p }: { p: Palette }) {
  const box = p.headline;
  const inner = p.bg === '#ffffff' ? '#ffffff' : INK;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 30, height: 30, background: box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 13, height: 13, border: `3px solid ${inner}` }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, letterSpacing: '0.16em', color: p.headline }}>HYDERRA</span>
    </div>
  );
}

function Logo({ p, logoUrl }: { p: Palette; logoUrl?: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: 44, maxWidth: 240, objectFit: 'contain', display: 'block' }} />;
  }
  return <Wordmark p={p} />;
}

function CategoryChip({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#ffffff',
        background: accent,
        borderRadius: 999,
        padding: '10px 20px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

// Thin full-width hairline with a short accent segment at the start.
function AccentRule({ p, accent, width }: { p: Palette; accent: string; width?: number }) {
  return (
    <div style={{ position: 'relative', width: width ?? '100%', height: 3 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1, height: 1, background: p.divider }} />
      <div style={{ position: 'absolute', left: 0, top: 0, height: 3, width: 64, background: accent, borderRadius: 2 }} />
    </div>
  );
}

function PhotoPanel({ p, mediaUrl, style }: { p: Palette; mediaUrl?: string | null; style?: React.CSSProperties }) {
  if (mediaUrl) {
    return (
      <div style={{ ...style, borderRadius: 22, overflow: 'hidden', border: `1px solid ${p.panelBorder}` }}>
        <img src={mediaUrl} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...style,
        borderRadius: 22,
        border: `1px dashed ${p.panelBorder}`,
        background: p.panelBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={p.panelText} strokeWidth="1.6">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}

function BusinessRow({ p, businessName, cta, accent, fontSize }: { p: Palette; businessName: string; cta: string; accent: string; fontSize: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: GREEN, flex: 'none' }} />
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize, color: p.business, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessName}</span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: fontSize - 6, fontWeight: 600, letterSpacing: '0.02em', color: accent, whiteSpace: 'nowrap' }}>{cta} →</span>
    </div>
  );
}

function Footer({ p }: { p: Palette }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, letterSpacing: '0.04em', color: p.footer }}>
      Sponsored on Hyderra
    </div>
  );
}

// Scales a fixed-size creative down to fit its container width (keeps the
// export node full-resolution; only the on-screen display shrinks).
export function CreativeScaler({ format = 'square', children }: { format?: AdvertFormat; children: ReactNode }) {
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
  { businessName, headline, body, category, mediaUrl, platform, ctaUrl, format = 'square', theme = 'dark', accentColor, logoUrl, withPhoto = true },
  ref,
) {
  const { w, h } = CREATIVE_SIZE[format];
  const p = palette(theme);
  const accent = accentColor || IRIS;
  const cat = (category || 'Advert').toUpperCase();
  const cta = platform ? `Find us on ${platform}` : ctaUrl ? 'Learn more' : 'Advertised on Hyderra';
  const name = businessName || 'Your Business';
  const showPhoto = withPhoto !== false; // false → text-forward, no photo panel

  // Shared frame wrapper: bg + mesh glow + scrim, positioned content layer.
  const frame = (pad: number, content: ReactNode) => (
    <div ref={ref} style={{ position: 'relative', width: w, height: h, background: p.bg, fontFamily: SANS, overflow: 'hidden' }}>
      {p.mesh && <div style={{ position: 'absolute', inset: 0, backgroundImage: p.mesh, pointerEvents: 'none' }} />}
      {p.scrim && <div style={{ position: 'absolute', inset: 0, background: p.scrim, pointerEvents: 'none' }} />}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', boxSizing: 'border-box', padding: pad, display: 'flex' }}>
        {content}
      </div>
    </div>
  );

  const headlineStyle = (size: number): React.CSSProperties => ({
    fontFamily: SANS,
    fontWeight: 800,
    fontSize: size,
    lineHeight: 1.04,
    letterSpacing: '-0.03em',
    color: p.headline,
    textWrap: 'balance' as any,
  });
  const bodyStyle = (size: number, maxWidth?: number): React.CSSProperties => ({
    fontFamily: SANS,
    fontWeight: 400,
    fontSize: size,
    lineHeight: 1.5,
    color: p.body,
    maxWidth,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as any,
    overflow: 'hidden',
  });

  // ─────────────────── EDITORIAL / CLASSIFIED 1080×1350 ───────────────────
  // Newspaper / print-poster look: paper background, thick ink border, a left
  // accent bar, solid ink rules and a black headline. Always paper (theme is
  // ignored); the accent recolours the left bar, chip, rule ends and CTA.
  if (format === 'editorial') {
    const paper = palette('light');
    const inkRule = <div style={{ height: 3, background: INK }} />;
    return (
      <div ref={ref} style={{ position: 'relative', width: w, height: h, background: '#ffffff', fontFamily: SANS, overflow: 'hidden', border: `4px solid ${INK}`, boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14, background: accent }} />
        <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', paddingLeft: 64, paddingRight: 56, paddingTop: 52, paddingBottom: 52, display: 'flex', flexDirection: 'column' }}>
          {/* masthead */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <Logo p={paper} logoUrl={logoUrl} />
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, letterSpacing: '0.16em', color: '#8b95a3' }}>HYDERRA</span>
          </div>
          <div style={{ margin: '22px 0' }}>{inkRule}</div>
          <div><CategoryChip label={cat} accent={accent} /></div>
          <div style={{ ...headlineStyle(76), color: INK, marginTop: 16 }}>{headline}</div>
          {body && <div style={{ ...bodyStyle(26, undefined), color: '#54606f', marginTop: 20 }}>{body}</div>}
          {showPhoto ? (
            mediaUrl ? (
              <div style={{ marginTop: 30, flex: 1, minHeight: 0, overflow: 'hidden', border: `1px solid ${paper.panelBorder}` }}>
                <img src={mediaUrl} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ) : (
              <div style={{ marginTop: 30, flex: 1, border: `1px dashed ${paper.panelBorder}`, background: paper.panelBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={paper.panelText} strokeWidth="1.6">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
            )
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <div style={{ marginTop: 30, marginBottom: 22 }}>{inkRule}</div>
          <BusinessRow p={paper} businessName={name} cta={cta} accent={accent} fontSize={30} />
          <div style={{ marginTop: 16 }}><Footer p={paper} /></div>
        </div>
      </div>
    );
  }

  // ─────────────────────────── BANNER 1280×720 ───────────────────────────
  // Wide hero: logo top-left, chip + rule + copy stacked on the left, a tall
  // panel on the right. No photo → the panel becomes an aurora gradient block.
  if (format === 'banner') {
    return frame(
      64,
      <>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Logo p={p} logoUrl={logoUrl} />
          <div style={{ flex: 1 }} />
          <div>
            <CategoryChip label={cat} accent={accent} />
          </div>
          <div style={{ marginTop: 18 }}>
            <AccentRule p={p} accent={accent} />
          </div>
          <div style={{ ...headlineStyle(52), marginTop: 18 }}>{headline}</div>
          {body && <div style={{ ...bodyStyle(24, 700), marginTop: 18 }}>{body}</div>}
          <div style={{ flex: 1 }} />
          <div style={{ borderTop: `1px solid ${p.divider}`, paddingTop: 22 }}>
            <BusinessRow p={p} businessName={name} cta={cta} accent={accent} fontSize={25} />
            <div style={{ marginTop: 16 }}>
              <Footer p={p} />
            </div>
          </div>
        </div>
        <div style={{ width: 440, flex: 'none', marginLeft: 48, display: 'flex' }}>
          {showPhoto ? (
            <PhotoPanel p={p} mediaUrl={mediaUrl} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', borderRadius: 22, background: AURORA }} />
          )}
        </div>
      </>,
    );
  }

  // ─────────────────────────── STORY 1080×1920 ───────────────────────────
  if (format === 'story') {
    return frame(
      80,
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <Logo p={p} logoUrl={logoUrl} />
          <CategoryChip label={cat} accent={accent} />
        </div>
        {showPhoto && <PhotoPanel p={p} mediaUrl={mediaUrl} style={{ marginTop: 44, width: '100%', height: 820, flex: 'none' }} />}
        <div style={{ marginTop: showPhoto ? 40 : 44 }}>
          <AccentRule p={p} accent={accent} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={headlineStyle(showPhoto ? 78 : 92)}>{headline}</div>
        {body && <div style={{ ...bodyStyle(showPhoto ? 30 : 34), marginTop: 28 }}>{body}</div>}
        <div style={{ flex: showPhoto ? 1 : 1.4 }} />
        <div style={{ marginBottom: 26 }}>
          <BusinessRow p={p} businessName={name} cta={cta} accent={accent} fontSize={32} />
        </div>
        <div style={{ borderTop: `1px solid ${p.divider}`, paddingTop: 24 }}>
          <Footer p={p} />
        </div>
      </div>,
    );
  }

  // ─────────────────────────── LANDSCAPE 1200×628 ───────────────────────────
  if (format === 'landscape') {
    return frame(
      56,
      <>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <Logo p={p} logoUrl={logoUrl} />
            <CategoryChip label={cat} accent={accent} />
          </div>
          <div style={{ marginTop: 22 }}>
            <AccentRule p={p} accent={accent} />
          </div>
          <div style={{ flex: 1 }} />
          <div style={headlineStyle(showPhoto ? 48 : 54)}>{headline}</div>
          {body && <div style={{ ...bodyStyle(showPhoto ? 22 : 24, showPhoto ? 620 : 900), marginTop: 20 }}>{body}</div>}
          <div style={{ flex: 1 }} />
          <div style={{ borderTop: `1px solid ${p.divider}`, paddingTop: 22 }}>
            <BusinessRow p={p} businessName={name} cta={cta} accent={accent} fontSize={26} />
            <div style={{ marginTop: 16 }}>
              <Footer p={p} />
            </div>
          </div>
        </div>
        {showPhoto && (
          <div style={{ width: 360, flex: 'none', marginLeft: 48, display: 'flex' }}>
            <PhotoPanel p={p} mediaUrl={mediaUrl} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </>,
    );
  }

  // ─────────────────────────── SQUARE 1080×1080 ───────────────────────────
  return frame(
    72,
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <Logo p={p} logoUrl={logoUrl} />
        <CategoryChip label={cat} accent={accent} />
      </div>
      <div style={{ marginTop: 22 }}>
        <AccentRule p={p} accent={accent} />
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 56, marginTop: 40, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: showPhoto ? 'flex-end' : 'center', minWidth: 0, paddingBottom: 4 }}>
          <div style={headlineStyle(showPhoto ? 62 : 74)}>{headline}</div>
          {body && <div style={{ ...bodyStyle(showPhoto ? 26 : 29, showPhoto ? 470 : 780), marginTop: 24 }}>{body}</div>}
        </div>
        {showPhoto && <PhotoPanel p={p} mediaUrl={mediaUrl} style={{ width: 400, flex: 'none' }} />}
      </div>
      <div style={{ marginTop: 40 }}>
        <BusinessRow p={p} businessName={name} cta={cta} accent={accent} fontSize={30} />
      </div>
      <div style={{ marginTop: 26, borderTop: `1px solid ${p.divider}`, paddingTop: 24 }}>
        <Footer p={p} />
      </div>
    </div>,
  );
});
