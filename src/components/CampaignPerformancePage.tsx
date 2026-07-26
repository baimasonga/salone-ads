import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  Eye,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Plus,
  RefreshCw,
  Share2,
  Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AdvertCampaignPerformance,
  fetchOrganizationAdvertPerformance,
} from '../lib/advertAnalytics';
import { Organization } from '../types';

interface CampaignPerformancePageProps {
  activeOrg: Organization;
  onCreateAdvert: () => void;
}

const PERIODS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 12 months', days: 366 },
];

const ACTION_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  website: 'Website',
  social: 'Social',
  native_share: 'Native share',
  copy_link: 'Copied link',
  download: 'Download',
  advert_card: 'Advert opens',
};

const ACTION_COLORS: Record<string, string> = {
  whatsapp: '#059669',
  phone: '#2563EB',
  website: '#D97706',
  social: '#C026D3',
  native_share: '#4F46E5',
  copy_link: '#64748B',
  download: '#0F766E',
  advert_card: '#0F172A',
};

const formatNumber = (value: number) => new Intl.NumberFormat('en').format(value);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value)) : 'Not published';
const rate = (numerator: number, denominator: number) =>
  denominator > 0 ? `${((numerator / denominator) * 100).toFixed(2)}%` : '0.00%';

function statusLabel(campaign: AdvertCampaignPerformance) {
  if (campaign.status === 'live') return 'Live';
  if (campaign.status === 'archived') return 'Completed';
  return 'Draft';
}

function campaignScore(campaign: AdvertCampaignPerformance) {
  if (campaign.impressions === 0) return 0;
  const detailRate = Math.min(1, campaign.detailViews / campaign.impressions);
  const actionRate = Math.min(1, campaign.ctaClicks / campaign.impressions);
  const engagement = Math.min(1, (campaign.shares + campaign.downloads) / campaign.impressions);
  return Math.round(detailRate * 35 + actionRate * 50 + engagement * 15);
}

export function CampaignPerformancePage({ activeOrg, onCreateAdvert }: CampaignPerformancePageProps) {
  const [periodDays, setPeriodDays] = useState(30);
  const [campaigns, setCampaigns] = useState<AdvertCampaignPerformance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchOrganizationAdvertPerformance(activeOrg.id, periodDays)
      .then((result) => {
        if (cancelled) return;
        setCampaigns(result);
        setSelectedId((current) =>
          current && result.some((campaign) => campaign.advertId === current)
            ? current
            : result[0]?.advertId ?? null
        );
      })
      .catch((cause) => {
        if (cancelled) return;
        setCampaigns([]);
        setError(cause instanceof Error ? cause.message : 'Campaign analytics could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrg.id, periodDays, reloadKey]);

  const selected = campaigns.find((campaign) => campaign.advertId === selectedId) ?? campaigns[0] ?? null;
  const totals = useMemo(
    () =>
      campaigns.reduce(
        (sum, campaign) => ({
          impressions: sum.impressions + campaign.impressions,
          uniqueViewers: sum.uniqueViewers + campaign.uniqueViewers,
          detailViews: sum.detailViews + campaign.detailViews,
          ctaClicks: sum.ctaClicks + campaign.ctaClicks,
          shares: sum.shares + campaign.shares,
          downloads: sum.downloads + campaign.downloads,
        }),
        { impressions: 0, uniqueViewers: 0, detailViews: 0, ctaClicks: 0, shares: 0, downloads: 0 }
      ),
    [campaigns]
  );

  const actionRows = useMemo(() => {
    if (!selected) return [];
    return Object.entries(selected.actions)
      .map(([action, value]) => ({ action, value: Number(value) || 0 }))
      .filter(({ value }) => value > 0)
      .sort((a, b) => b.value - a.value);
  }, [selected]);
  const maxAction = Math.max(1, ...actionRows.map((row) => row.value));
  const metrics: Array<[string, number, LucideIcon]> = [
    ['Impressions', totals.impressions, Eye],
    ['Unique reach', totals.uniqueViewers, Target],
    ['Advert opens', totals.detailViews, Megaphone],
    ['CTA clicks', totals.ctaClicks, MousePointerClick],
    ['Shares', totals.shares, Share2],
    ['Downloads', totals.downloads, Download],
  ];

  return (
    <div className="space-y-5 text-left" data-testid="campaign-performance-page">
      <header className="flex flex-col gap-4 border-b-2 border-[#0F172A] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-700">
            Live advertising intelligence
          </span>
          <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-slate-950">
            Campaign Performance
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Verified Manohub impressions, advert opens and customer actions for {activeOrg.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <select
              aria-label="Campaign performance period"
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value))}
              className="h-10 bg-white pl-9 pr-8 font-mono text-[10px] font-bold uppercase tracking-wider"
            >
              {PERIODS.map((period) => (
                <option key={period.days} value={period.days}>{period.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="btn-geometric-secondary h-10 inline-flex cursor-pointer items-center gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => window.print()} className="btn-geometric-secondary h-10 inline-flex cursor-pointer items-center gap-2">
            <Download className="h-3.5 w-3.5" /> Report
          </button>
          <button type="button" onClick={onCreateAdvert} className="btn-geometric h-10 inline-flex cursor-pointer items-center gap-2">
            <Plus className="h-3.5 w-3.5" /> Create advert
          </button>
        </div>
      </header>

      {error && (
        <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Analytics unavailable.</strong> {error}
        </div>
      )}

      <section className="grid grid-cols-2 border border-[#0F172A] bg-[#0F172A] gap-px lg:grid-cols-6">
        {metrics.map(([label, value, Icon]) => (
          <div key={String(label)} className="bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">{String(label)}</span>
              <Icon className="h-4 w-4 text-emerald-700" />
            </div>
            <strong className="mt-2 block font-display text-2xl font-extrabold tabular-nums text-slate-950">
              {loading ? '—' : formatNumber(Number(value))}
            </strong>
          </div>
        ))}
      </section>

      {!loading && campaigns.length === 0 && !error ? (
        <section className="border border-[#0F172A] bg-white px-6 py-12 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-emerald-700" />
          <h3 className="mt-4 font-display text-xl font-extrabold text-slate-950">No adverts to measure yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Create and publish an advert for {activeOrg.name}. Real performance will appear here as people see and interact with it.
          </p>
          <button type="button" onClick={onCreateAdvert} className="btn-geometric mt-5 inline-flex cursor-pointer items-center gap-2">
            <Plus className="h-4 w-4" /> Create your first advert
          </button>
        </section>
      ) : (
        <>
          <section className="border border-[#0F172A] bg-white">
            <div className="border-b border-[#0F172A] px-5 py-4">
              <h3 className="font-display text-lg font-extrabold text-slate-950">Campaigns</h3>
              <p className="mt-1 text-xs text-slate-500">Select an advert to inspect its verified actions.</p>
            </div>
            <div className="grid lg:grid-cols-3">
              {loading
                ? Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className={`h-56 animate-pulse bg-slate-100 ${index ? 'border-t border-[#0F172A] lg:border-l lg:border-t-0' : ''}`} />
                ))
                : campaigns.map((campaign, index) => (
                  <button
                    key={campaign.advertId}
                    type="button"
                    onClick={() => setSelectedId(campaign.advertId)}
                    className={`min-w-0 cursor-pointer bg-white text-left hover:bg-slate-50 ${index ? 'border-t border-[#0F172A] lg:border-l lg:border-t-0' : ''} ${campaign.advertId === selected?.advertId ? 'outline outline-4 -outline-offset-4 outline-emerald-600' : ''}`}
                  >
                    {campaign.creativeUrl ? (
                      <img src={campaign.creativeUrl} alt="" className="h-32 w-full object-cover" />
                    ) : (
                      <div className="flex h-32 items-end bg-[#0F172A] p-4 text-white" style={{ borderBottom: `5px solid ${campaign.accentColor || '#059669'}` }}>
                        <span className="font-display text-lg font-extrabold">{campaign.title}</span>
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-950">{campaign.title}</p>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-emerald-700">
                            {statusLabel(campaign)} · {formatDate(campaign.publishedAt)}
                          </p>
                        </div>
                        <strong className="font-display text-2xl text-slate-950">{campaignScore(campaign)}</strong>
                      </div>
                      <div className="mt-4 grid grid-cols-3 border-t border-slate-200 pt-3">
                        <div><span className="block font-mono text-[8px] uppercase text-slate-500">Impressions</span><strong>{formatNumber(campaign.impressions)}</strong></div>
                        <div className="border-l border-slate-200 pl-3"><span className="block font-mono text-[8px] uppercase text-slate-500">Open rate</span><strong>{rate(campaign.detailViews, campaign.impressions)}</strong></div>
                        <div className="border-l border-slate-200 pl-3"><span className="block font-mono text-[8px] uppercase text-slate-500">CTA rate</span><strong>{rate(campaign.ctaClicks, campaign.impressions)}</strong></div>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </section>

          {selected && (
            <section className="grid border border-[#0F172A] bg-white xl:grid-cols-[1.5fr_0.9fr]">
              <div className="border-b border-[#0F172A] p-5 xl:border-b-0 xl:border-r">
                <h3 className="font-display text-lg font-extrabold text-slate-950">Customer action breakdown</h3>
                <p className="mt-1 text-xs text-slate-500">{selected.title} · last {periodDays === 366 ? '12 months' : `${periodDays} days`}</p>
                {actionRows.length ? (
                  <div className="mt-6 space-y-4">
                    {actionRows.map(({ action, value }) => (
                      <div key={action}>
                        <div className="mb-1.5 flex justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-slate-600">
                          <span>{ACTION_LABELS[action] || action.replaceAll('_', ' ')}</span>
                          <span>{formatNumber(value)}</span>
                        </div>
                        <div className="h-3 bg-slate-100">
                          <div className="h-full" style={{ width: `${(value / maxAction) * 100}%`, backgroundColor: ACTION_COLORS[action] || '#64748B' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
                    No CTA, share or download actions have been recorded for this advert in the selected period.
                  </div>
                )}
              </div>
              <aside className="bg-slate-50 p-5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-700">Performance pulse</span>
                <div className="mt-2 flex items-baseline gap-2 border-b border-[#0F172A] pb-5">
                  <strong className="font-display text-5xl font-extrabold text-slate-950">{campaignScore(selected)}</strong>
                  <span className="font-mono text-xs text-slate-500">/100</span>
                </div>
                <h4 className="mt-5 font-display text-sm font-extrabold text-slate-950">Evidence-based next step</h4>
                <div className="mt-3 border border-[#0F172A] bg-white p-4">
                  {selected.impressions === 0 ? (
                    <p className="text-xs leading-relaxed text-slate-600">This campaign needs delivery before performance can be assessed.</p>
                  ) : selected.ctaClicks === 0 ? (
                    <p className="text-xs leading-relaxed text-slate-600">People are seeing the advert but have not used a customer-action link yet. Review the offer and CTA wording.</p>
                  ) : (
                    <div className="flex gap-3">
                      <MessageCircle className="h-4 w-4 shrink-0 text-emerald-700" />
                      <p className="text-xs leading-relaxed text-slate-600">
                        The strongest recorded action is <strong>{ACTION_LABELS[actionRows[0]?.action] || 'customer engagement'}</strong>. Keep it prominent in the creative and advert detail.
                      </p>
                    </div>
                  )}
                </div>
              </aside>
            </section>
          )}

          <section className="border border-[#0F172A] bg-white">
            <div className="border-b border-[#0F172A] px-5 py-4">
              <h3 className="font-display text-lg font-extrabold text-slate-950">Campaign ranking</h3>
              <p className="mt-1 text-xs text-slate-500">Ranked by verified customer actions, then impressions.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead><tr><th className="px-5 text-left">Campaign</th><th className="px-4 text-right">Reach</th><th className="px-4 text-right">Impressions</th><th className="px-4 text-right">Opens</th><th className="px-4 text-right">CTA clicks</th><th className="px-5 text-right">CTA rate</th></tr></thead>
                <tbody>
                  {[...campaigns].sort((a, b) => b.ctaClicks - a.ctaClicks || b.impressions - a.impressions).map((campaign) => (
                    <tr key={campaign.advertId} className={campaign.advertId === selected?.advertId ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                      <td className="px-5"><button type="button" onClick={() => setSelectedId(campaign.advertId)} className="cursor-pointer text-left"><span className="block text-xs font-bold text-slate-950">{campaign.title}</span><span className="text-[10px] text-slate-500">{campaign.category} · {statusLabel(campaign)}</span></button></td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.uniqueViewers)}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.impressions)}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.detailViews)}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.ctaClicks)}</td>
                      <td className="px-5 text-right font-bold">{rate(campaign.ctaClicks, campaign.impressions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="flex items-start gap-2 border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-[11px] leading-relaxed text-emerald-900">
        <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Verified measurement:</strong> figures come from deduplicated Manohub events. No names, contact details, IP addresses or user IDs are included in public event metadata.</p>
      </div>
    </div>
  );
}
