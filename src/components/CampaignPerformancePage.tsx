import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Eye,
  FileDown,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Share2,
  Target,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  addAdvertOutcome,
  addAdvertSpendEntry,
  AdvertCampaignPerformance,
  AdvertGoalType,
  AdvertOutcomeSource,
  AdvertOutcomeStatus,
  AdvertOutcomeType,
  fetchOrganizationAdvertPerformance,
  saveAdvertCommercialSettings,
  updateAdvertOutcomeStatus,
} from '../lib/advertAnalytics';
import { Organization } from '../types';

interface CampaignPerformancePageProps {
  activeOrg: Organization;
  isPlatformAdmin: boolean;
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
const measuredRate = (numerator: number, denominator: number) =>
  denominator > 0 ? `${((numerator / denominator) * 100).toFixed(2)}%` : 'Not available';
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
const measuredMoney = (value: number | null, currency: string) =>
  value === null ? 'Not available' : money(value, currency);
const titleCase = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const formatPeriod = (value: string, granularity: 'day' | 'week' | 'month') =>
  new Intl.DateTimeFormat('en-GB', granularity === 'month'
    ? { month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' }
  ).format(new Date(value));

function downloadCampaignCsv(campaign: AdvertCampaignPerformance) {
  const rows: Array<Array<string | number>> = [
    ['Hyderra campaign performance report'],
    ['Campaign', campaign.title],
    ['Period (days)', campaign.periodDays],
    [],
    ['Metric', 'Value'],
    ['Impressions', campaign.impressions],
    ['Unique reach', campaign.uniqueViewers],
    ['Advert opens', campaign.detailViews],
    ['CTA clicks', campaign.ctaClicks],
    ['Shares', campaign.shares],
    ['Downloads', campaign.downloads],
    [],
    ['Commercial measurement'],
    ['Goal', titleCase(campaign.commercial.goalType)],
    ['Budget', campaign.commercial.budgetAmount ?? 'Not available'],
    ['Actual spend', campaign.commercial.actualSpend || 'Not available'],
    ['Currency', campaign.commercial.currencyCode],
    ['Confirmed leads', campaign.commercial.confirmedLeads],
    ['Confirmed sales', campaign.commercial.confirmedSales],
    ['Confirmed revenue', campaign.commercial.confirmedRevenue],
    ['Pending outcomes', campaign.commercial.pendingOutcomes],
    ['Cost per click', campaign.commercial.actualSpend > 0 && campaign.ctaClicks > 0
      ? campaign.commercial.actualSpend / campaign.ctaClicks
      : 'Not available'],
    ['Cost per lead', campaign.commercial.actualSpend > 0 && campaign.commercial.confirmedLeads > 0
      ? campaign.commercial.actualSpend / campaign.commercial.confirmedLeads
      : 'Not available'],
    ['Click-to-sale conversion rate', campaign.ctaClicks > 0
      ? `${((campaign.commercial.confirmedSales / campaign.ctaClicks) * 100).toFixed(2)}%`
      : 'Not available'],
    ['ROAS', campaign.commercial.actualSpend > 0
      ? `${(campaign.commercial.confirmedRevenue / campaign.commercial.actualSpend).toFixed(2)}x`
      : 'Not available'],
    [],
    ['Time series'],
    ['Period', 'Impressions', 'Unique reach', 'Advert opens', 'CTA clicks', 'Shares', 'Downloads'],
    ...campaign.timeSeries.map((point) => [
      point.period,
      point.impressions,
      point.uniqueViewers,
      point.detailViews,
      point.ctaClicks,
      point.shares,
      point.downloads,
    ]),
    [],
    ['Traffic sources'],
    ['Source', 'Events'],
    ...campaign.sources.map((item) => [item.label, item.value]),
    [],
    ['Devices'],
    ['Device', 'Events'],
    ...campaign.devices.map((item) => [item.label, item.value]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hyderra-${campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign'}-performance.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

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

export function CampaignPerformancePage({
  activeOrg,
  isPlatformAdmin,
  onCreateAdvert,
}: CampaignPerformancePageProps) {
  const [periodDays, setPeriodDays] = useState(30);
  const [campaigns, setCampaigns] = useState<AdvertCampaignPerformance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [commercialEditor, setCommercialEditor] = useState<'settings' | 'spend' | 'outcome' | null>(null);
  const [commercialFeedback, setCommercialFeedback] = useState<string | null>(null);
  const [commercialSaving, setCommercialSaving] = useState(false);
  const [goalType, setGoalType] = useState<AdvertGoalType>('lead');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('SLE');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [spendNote, setSpendNote] = useState('');
  const [outcomeType, setOutcomeType] = useState<AdvertOutcomeType>('lead');
  const [outcomeSource, setOutcomeSource] = useState<AdvertOutcomeSource>('whatsapp');
  const [outcomeStatus, setOutcomeStatus] = useState<AdvertOutcomeStatus>('confirmed');
  const [outcomeRevenue, setOutcomeRevenue] = useState('');
  const [outcomeDate, setOutcomeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outcomeNote, setOutcomeNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchOrganizationAdvertPerformance(activeOrg.id, periodDays, isPlatformAdmin)
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
  }, [activeOrg.id, isPlatformAdmin, periodDays, reloadKey]);

  const selected = campaigns.find((campaign) => campaign.advertId === selectedId) ?? campaigns[0] ?? null;
  useEffect(() => {
    if (!selected) return;
    setGoalType(selected.commercial.goalType);
    setBudgetAmount(selected.commercial.budgetAmount?.toString() ?? '');
    setCurrencyCode(selected.commercial.currencyCode);
    setCommercialEditor(null);
    setCommercialFeedback(null);
  }, [selected?.advertId]);

  const refreshCommercial = () => setReloadKey((value) => value + 1);

  const saveCommercialSettings = async () => {
    if (!selected) return;
    const parsedBudget = budgetAmount.trim() === '' ? null : Number(budgetAmount);
    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      setCommercialFeedback('Enter a valid budget or leave it blank.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currencyCode.toUpperCase())) {
      setCommercialFeedback('Currency must be a three-letter code such as SLE or USD.');
      return;
    }
    setCommercialSaving(true);
    setCommercialFeedback(null);
    try {
      await saveAdvertCommercialSettings({
        advertId: selected.advertId,
        organizationId: selected.organizationId,
        goalType,
        budgetAmount: parsedBudget,
        currencyCode,
      });
      setCommercialEditor(null);
      setCommercialFeedback('Commercial goal and budget saved.');
      refreshCommercial();
    } catch (cause) {
      setCommercialFeedback(cause instanceof Error ? cause.message : 'Commercial settings could not be saved.');
    } finally {
      setCommercialSaving(false);
    }
  };

  const saveSpend = async () => {
    if (!selected) return;
    const amount = Number(spendAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCommercialFeedback('Enter a spend amount greater than zero.');
      return;
    }
    setCommercialSaving(true);
    setCommercialFeedback(null);
    try {
      await addAdvertSpendEntry({
        advertId: selected.advertId,
        organizationId: selected.organizationId,
        amount,
        currencyCode,
        spentOn: spendDate,
        note: spendNote,
      });
      setSpendAmount('');
      setSpendNote('');
      setCommercialEditor(null);
      setCommercialFeedback('Campaign spend recorded for the selected date.');
      refreshCommercial();
    } catch (cause) {
      setCommercialFeedback(cause instanceof Error ? cause.message : 'Campaign spend could not be recorded.');
    } finally {
      setCommercialSaving(false);
    }
  };

  const saveOutcome = async () => {
    if (!selected) return;
    const revenue = outcomeRevenue.trim() === '' ? null : Number(outcomeRevenue);
    if (outcomeType === 'sale' && outcomeStatus === 'confirmed' && (!revenue || revenue <= 0)) {
      setCommercialFeedback('A confirmed sale requires revenue greater than zero.');
      return;
    }
    if (revenue !== null && (!Number.isFinite(revenue) || revenue < 0)) {
      setCommercialFeedback('Enter a valid revenue amount or leave it blank.');
      return;
    }
    setCommercialSaving(true);
    setCommercialFeedback(null);
    try {
      await addAdvertOutcome({
        advertId: selected.advertId,
        organizationId: selected.organizationId,
        outcomeType,
        sourceAction: outcomeSource,
        status: outcomeStatus,
        revenueAmount: outcomeType === 'sale' ? revenue : null,
        currencyCode,
        occurredAt: new Date(`${outcomeDate}T12:00:00`).toISOString(),
        note: outcomeNote,
      });
      setOutcomeRevenue('');
      setOutcomeNote('');
      setCommercialEditor(null);
      setCommercialFeedback('Campaign outcome recorded.');
      refreshCommercial();
    } catch (cause) {
      setCommercialFeedback(cause instanceof Error ? cause.message : 'Campaign outcome could not be recorded.');
    } finally {
      setCommercialSaving(false);
    }
  };

  const changeOutcomeStatus = async (
    outcomeId: string,
    status: AdvertOutcomeStatus,
    revenueAmount: number | null,
    outcomeKind: AdvertOutcomeType
  ) => {
    if (
      status === 'confirmed'
      && outcomeKind === 'sale'
      && (revenueAmount === null || revenueAmount <= 0)
    ) {
      const entered = window.prompt('Confirmed sale revenue:', '');
      if (entered === null) return;
      revenueAmount = Number(entered);
      if (!Number.isFinite(revenueAmount) || revenueAmount <= 0) {
        setCommercialFeedback('A confirmed sale requires revenue greater than zero.');
        return;
      }
    }
    setCommercialSaving(true);
    setCommercialFeedback(null);
    try {
      await updateAdvertOutcomeStatus(outcomeId, status, revenueAmount);
      setCommercialFeedback(status === 'confirmed' ? 'Outcome confirmed.' : 'Outcome rejected.');
      refreshCommercial();
    } catch (cause) {
      setCommercialFeedback(cause instanceof Error ? cause.message : 'Outcome status could not be updated.');
    } finally {
      setCommercialSaving(false);
    }
  };
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
          actualSpend: sum.actualSpend + campaign.commercial.actualSpend,
          confirmedLeads: sum.confirmedLeads + campaign.commercial.confirmedLeads,
          confirmedSales: sum.confirmedSales + campaign.commercial.confirmedSales,
          confirmedRevenue: sum.confirmedRevenue + campaign.commercial.confirmedRevenue,
        }),
        {
          impressions: 0,
          uniqueViewers: 0,
          detailViews: 0,
          ctaClicks: 0,
          shares: 0,
          downloads: 0,
          actualSpend: 0,
          confirmedLeads: 0,
          confirmedSales: 0,
          confirmedRevenue: 0,
        }
      ),
    [campaigns]
  );
  const organizationCurrency = useMemo(() => {
    const currencies = new Set(campaigns.map((campaign) => campaign.commercial.currencyCode));
    return currencies.size === 1 ? [...currencies][0] : null;
  }, [campaigns]);

  const actionRows = useMemo(() => {
    if (!selected) return [];
    return Object.entries(selected.actions)
      .map(([action, value]) => ({ action, value: Number(value) || 0 }))
      .filter(({ value }) => value > 0)
      .sort((a, b) => b.value - a.value);
  }, [selected]);
  const maxAction = Math.max(1, ...actionRows.map((row) => row.value));
  const maxSeries = Math.max(
    1,
    ...(selected?.timeSeries.map((point) =>
      point.impressions + point.detailViews + point.ctaClicks + point.shares + point.downloads
    ) ?? [])
  );
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
            Verified Hyderra impressions, advert opens and customer actions for {activeOrg.name}.
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
          <button
            type="button"
            onClick={() => selected && downloadCampaignCsv(selected)}
            disabled={!selected}
            className="btn-geometric-secondary h-10 inline-flex cursor-pointer items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" /> CSV
          </button>
          <button type="button" onClick={() => window.print()} className="btn-geometric-secondary h-10 inline-flex cursor-pointer items-center gap-2">
            <Printer className="h-3.5 w-3.5" /> Print / PDF
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

      <section className="grid grid-cols-2 gap-px border border-[#0F172A] bg-[#0F172A] lg:grid-cols-6">
        {[
          ['Recorded spend', organizationCurrency && totals.actualSpend > 0
            ? money(totals.actualSpend, organizationCurrency)
            : organizationCurrency ? 'Not available' : 'Mixed currencies'],
          ['Confirmed leads', formatNumber(totals.confirmedLeads)],
          ['Confirmed sales', formatNumber(totals.confirmedSales)],
          ['Confirmed revenue', organizationCurrency && totals.confirmedSales > 0
            ? money(totals.confirmedRevenue, organizationCurrency)
            : organizationCurrency ? 'Not available' : 'Mixed currencies'],
          ['Organisation CPL', organizationCurrency
            ? measuredMoney(
              totals.actualSpend > 0 && totals.confirmedLeads > 0
                ? totals.actualSpend / totals.confirmedLeads
                : null,
              organizationCurrency
            )
            : 'Not available'],
          ['Organisation ROAS', organizationCurrency && totals.actualSpend > 0
            ? `${(totals.confirmedRevenue / totals.actualSpend).toFixed(2)}x`
            : 'Not available'],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-50 p-4">
            <span className="font-mono text-[8px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
            <strong className="mt-2 block break-words font-display text-lg font-extrabold tabular-nums text-slate-950">
              {loading ? '—' : value}
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
            <>
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

              <section className="border border-[#0F172A] bg-white">
                <div className="flex flex-col gap-3 border-b border-[#0F172A] px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                      Commercial outcomes
                    </span>
                    <h3 className="mt-1 font-display text-lg font-extrabold text-slate-950">
                      Cost, leads and return
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {selected.title} · confirmed outcomes and spend recorded within the selected reporting period.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setCommercialEditor('settings')} className="btn-geometric-secondary h-9">
                      Goal & budget
                    </button>
                    <button type="button" onClick={() => setCommercialEditor('spend')} className="btn-geometric-secondary h-9 inline-flex items-center gap-2">
                      <ReceiptText className="h-3.5 w-3.5" /> Add spend
                    </button>
                    <button type="button" onClick={() => setCommercialEditor('outcome')} className="btn-geometric h-9 inline-flex items-center gap-2">
                      <CircleDollarSign className="h-3.5 w-3.5" /> Record outcome
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px bg-[#0F172A] lg:grid-cols-4 xl:grid-cols-8">
                  {[
                    ['Goal', titleCase(selected.commercial.goalType)],
                    ['Budget', selected.commercial.budgetAmount === null
                      ? 'Not available'
                      : money(selected.commercial.budgetAmount, selected.commercial.currencyCode)],
                    ['Actual spend', selected.commercial.actualSpend > 0
                      ? money(selected.commercial.actualSpend, selected.commercial.currencyCode)
                      : 'Not available'],
                    ['Confirmed leads', formatNumber(selected.commercial.confirmedLeads)],
                    ['Confirmed sales', formatNumber(selected.commercial.confirmedSales)],
                    ['Cost per click', measuredMoney(
                      selected.commercial.actualSpend > 0 && selected.ctaClicks > 0
                        ? selected.commercial.actualSpend / selected.ctaClicks
                        : null,
                      selected.commercial.currencyCode
                    )],
                    ['Cost per lead', measuredMoney(
                      selected.commercial.actualSpend > 0 && selected.commercial.confirmedLeads > 0
                        ? selected.commercial.actualSpend / selected.commercial.confirmedLeads
                        : null,
                      selected.commercial.currencyCode
                    )],
                    ['ROAS', selected.commercial.actualSpend > 0
                      ? `${(selected.commercial.confirmedRevenue / selected.commercial.actualSpend).toFixed(2)}x`
                      : 'Not available'],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 bg-white p-4">
                      <span className="block font-mono text-[8px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                      <strong className="mt-2 block break-words font-display text-lg font-extrabold tabular-nums text-slate-950">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="grid border-t border-[#0F172A] lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="border-b border-[#0F172A] p-5 lg:border-b-0 lg:border-r">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      Conversion evidence
                    </span>
                    <div className="mt-4 grid grid-cols-2 gap-px bg-slate-300">
                      <div className="bg-slate-50 p-4">
                        <span className="block text-[9px] font-bold uppercase text-slate-500">Click-to-sale rate</span>
                        <strong className="mt-1 block font-display text-2xl text-slate-950">
                          {measuredRate(selected.commercial.confirmedSales, selected.ctaClicks)}
                        </strong>
                      </div>
                      <div className="bg-slate-50 p-4">
                        <span className="block text-[9px] font-bold uppercase text-slate-500">Confirmed revenue</span>
                        <strong className="mt-1 block font-display text-2xl text-slate-950">
                          {selected.commercial.confirmedSales > 0
                            ? money(selected.commercial.confirmedRevenue, selected.commercial.currencyCode)
                            : 'Not available'}
                        </strong>
                      </div>
                    </div>
                    <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
                      ROAS uses confirmed sale revenue divided by spend recorded in this date range. Subscription fees and CRM estimates are excluded.
                    </p>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-display text-sm font-extrabold text-slate-950">Recent advertiser-confirmed outcomes</h4>
                        <p className="mt-1 text-xs text-slate-500">Up to 50 outcomes in the selected period.</p>
                      </div>
                      {selected.commercial.pendingOutcomes > 0 && (
                        <span className="border border-amber-400 bg-amber-50 px-2 py-1 font-mono text-[9px] font-bold uppercase text-amber-800">
                          {selected.commercial.pendingOutcomes} pending
                        </span>
                      )}
                    </div>
                    {selected.commercial.recentOutcomes.length ? (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[620px]">
                          <thead>
                            <tr>
                              <th className="text-left">Date</th>
                              <th className="text-left">Outcome</th>
                              <th className="text-left">Source</th>
                              <th className="text-left">Status</th>
                              <th className="text-right">Revenue</th>
                              <th className="text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.commercial.recentOutcomes.map((outcome) => (
                              <tr key={outcome.id}>
                                <td className="font-mono text-[10px]">{formatDate(outcome.occurredAt)}</td>
                                <td className="font-bold">{titleCase(outcome.outcomeType)}</td>
                                <td>{titleCase(outcome.sourceAction)}</td>
                                <td>{titleCase(outcome.status)}</td>
                                <td className="text-right font-bold">
                                  {outcome.revenueAmount === null
                                    ? '—'
                                    : money(outcome.revenueAmount, outcome.currencyCode)}
                                </td>
                                <td className="text-right">
                                  {outcome.status === 'pending' ? (
                                    <div className="flex justify-end gap-1">
                                      <button
                                        type="button"
                                        disabled={commercialSaving}
                                        onClick={() => changeOutcomeStatus(
                                          outcome.id,
                                          'confirmed',
                                          outcome.revenueAmount,
                                          outcome.outcomeType
                                        )}
                                        className="border border-emerald-700 p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                        title="Confirm outcome"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={commercialSaving}
                                        onClick={() => changeOutcomeStatus(
                                          outcome.id,
                                          'rejected',
                                          outcome.revenueAmount,
                                          outcome.outcomeType
                                        )}
                                        className="border border-red-700 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                        title="Reject outcome"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="mt-4 border-l-4 border-slate-400 bg-slate-50 p-4 text-xs text-slate-600">
                        No lead or sale outcome has been recorded for this advert in the selected period.
                      </div>
                    )}
                  </div>
                </div>

                {commercialEditor && (
                  <div className="border-t border-[#0F172A] bg-slate-50 p-5">
                    {commercialEditor === 'settings' && (
                      <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                        <label className="text-xs font-bold text-slate-700">
                          Conversion goal
                          <select value={goalType} onChange={(event) => setGoalType(event.target.value as AdvertGoalType)} className="mt-1 h-10 w-full bg-white">
                            <option value="awareness">Awareness</option>
                            <option value="traffic">Traffic</option>
                            <option value="lead">Lead generation</option>
                            <option value="sale">Sales</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Campaign budget
                          <input type="number" min="0" step="0.01" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="Optional" className="mt-1 h-10 w-full bg-white" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Currency
                          <input value={currencyCode} maxLength={3} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} className="mt-1 h-10 w-full bg-white uppercase" />
                        </label>
                        <button type="button" disabled={commercialSaving} onClick={saveCommercialSettings} className="btn-geometric h-10 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                          <Save className="h-3.5 w-3.5" /> Save
                        </button>
                      </div>
                    )}

                    {commercialEditor === 'spend' && (
                      <div className="grid gap-4 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
                        <label className="text-xs font-bold text-slate-700">
                          Spend amount
                          <input type="number" min="0.01" step="0.01" value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} className="mt-1 h-10 w-full bg-white" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Spend date
                          <input type="date" value={spendDate} onChange={(event) => setSpendDate(event.target.value)} className="mt-1 h-10 w-full bg-white" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Note
                          <input value={spendNote} maxLength={500} onChange={(event) => setSpendNote(event.target.value)} placeholder="Optional invoice, channel or placement note" className="mt-1 h-10 w-full bg-white" />
                        </label>
                        <button type="button" disabled={commercialSaving} onClick={saveSpend} className="btn-geometric h-10 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                          <Save className="h-3.5 w-3.5" /> Record
                        </button>
                      </div>
                    )}

                    {commercialEditor === 'outcome' && (
                      <div className="grid gap-4 lg:grid-cols-3">
                        <label className="text-xs font-bold text-slate-700">
                          Outcome
                          <select value={outcomeType} onChange={(event) => setOutcomeType(event.target.value as AdvertOutcomeType)} className="mt-1 h-10 w-full bg-white">
                            <option value="lead">Lead / enquiry</option>
                            <option value="sale">Sale</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Source
                          <select value={outcomeSource} onChange={(event) => setOutcomeSource(event.target.value as AdvertOutcomeSource)} className="mt-1 h-10 w-full bg-white">
                            <option value="whatsapp">WhatsApp</option>
                            <option value="phone">Phone</option>
                            <option value="website">Website</option>
                            <option value="social">Social</option>
                            <option value="offline">Offline</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Verification status
                          <select value={outcomeStatus} onChange={(event) => setOutcomeStatus(event.target.value as AdvertOutcomeStatus)} className="mt-1 h-10 w-full bg-white">
                            <option value="confirmed">Confirmed</option>
                            <option value="pending">Pending</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Outcome date
                          <input type="date" value={outcomeDate} onChange={(event) => setOutcomeDate(event.target.value)} className="mt-1 h-10 w-full bg-white" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Sale revenue
                          <input type="number" min="0" step="0.01" disabled={outcomeType !== 'sale'} value={outcomeRevenue} onChange={(event) => setOutcomeRevenue(event.target.value)} placeholder={outcomeType === 'sale' ? 'Required when confirmed' : 'Not applicable'} className="mt-1 h-10 w-full bg-white disabled:bg-slate-100" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Note
                          <input value={outcomeNote} maxLength={500} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="Optional non-personal reference" className="mt-1 h-10 w-full bg-white" />
                        </label>
                        <div className="flex gap-2 lg:col-span-3 lg:justify-end">
                          <button type="button" onClick={() => setCommercialEditor(null)} className="btn-geometric-secondary h-10">Cancel</button>
                          <button type="button" disabled={commercialSaving} onClick={saveOutcome} className="btn-geometric h-10 inline-flex items-center gap-2 disabled:opacity-50">
                            <Save className="h-3.5 w-3.5" /> Record outcome
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {commercialFeedback && (
                  <div className={`border-t px-5 py-3 text-xs font-semibold ${commercialFeedback.includes('could not') || commercialFeedback.startsWith('Enter') || commercialFeedback.startsWith('A confirmed') || commercialFeedback.startsWith('Currency')
                    ? 'border-red-300 bg-red-50 text-red-800'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                    {commercialFeedback}
                  </div>
                )}
              </section>

              <section className="border border-[#0F172A] bg-white">
                <div className="flex flex-col gap-3 border-b border-[#0F172A] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-slate-950">Performance over time</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Real {selected.granularity}ly event totals. Periods with no recorded activity are not invented.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 font-mono text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    <span><i className="mr-1 inline-block h-2 w-2 bg-emerald-600" />Impressions</span>
                    <span><i className="mr-1 inline-block h-2 w-2 bg-blue-600" />Opens</span>
                    <span><i className="mr-1 inline-block h-2 w-2 bg-amber-500" />CTA</span>
                    <span><i className="mr-1 inline-block h-2 w-2 bg-indigo-600" />Share/download</span>
                  </div>
                </div>
                {selected.timeSeries.length ? (
                  <div className="overflow-x-auto p-5">
                    <div className="flex h-64 min-w-[560px] items-end gap-2 border-b border-l border-slate-300 px-3 pt-6">
                      {selected.timeSeries.map((point) => {
                        const total = point.impressions + point.detailViews + point.ctaClicks + point.shares + point.downloads;
                        const height = Math.max(4, (total / maxSeries) * 100);
                        return (
                          <div key={point.period} className="flex min-w-12 flex-1 flex-col items-center justify-end">
                            <span className="mb-1 font-mono text-[8px] font-bold text-slate-600">{formatNumber(total)}</span>
                            <div className="flex w-full max-w-14 flex-col-reverse" style={{ height: `${height}%` }}>
                              <div className="bg-emerald-600" style={{ flex: point.impressions }} />
                              <div className="bg-blue-600" style={{ flex: point.detailViews }} />
                              <div className="bg-amber-500" style={{ flex: point.ctaClicks }} />
                              <div className="bg-indigo-600" style={{ flex: point.shares + point.downloads }} />
                            </div>
                            <span className="mt-2 whitespace-nowrap font-mono text-[8px] text-slate-500">
                              {formatPeriod(point.period, selected.granularity)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <BarChart3 className="mx-auto h-7 w-7 text-slate-400" />
                    <p className="mt-3 text-sm font-bold text-slate-800">No time-series activity yet</p>
                    <p className="mt-1 text-xs text-slate-500">The chart will begin with the first verified event in this period.</p>
                  </div>
                )}
              </section>

              <section className="grid border border-[#0F172A] bg-white lg:grid-cols-2">
                {[
                  { title: 'Traffic sources', rows: selected.sources, fallback: 'No traffic source has been recorded yet.' },
                  { title: 'Devices', rows: selected.devices, fallback: 'No device activity has been recorded yet.' },
                ].map((group, groupIndex) => {
                  const maxValue = Math.max(1, ...group.rows.map((row) => row.value));
                  return (
                    <div key={group.title} className={`p-5 ${groupIndex ? 'border-t border-[#0F172A] lg:border-l lg:border-t-0' : ''}`}>
                      <h3 className="font-display text-lg font-extrabold text-slate-950">{group.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">Verified event distribution for the selected period.</p>
                      {group.rows.length ? (
                        <div className="mt-5 space-y-4">
                          {group.rows.map((row) => (
                            <div key={row.label}>
                              <div className="mb-1.5 flex justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-slate-600">
                                <span>{titleCase(row.label)}</span>
                                <span>{formatNumber(row.value)}</span>
                              </div>
                              <div className="h-2.5 bg-slate-100">
                                <div className="h-full bg-[#0F172A]" style={{ width: `${(row.value / maxValue) * 100}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-5 border-l-4 border-slate-400 bg-slate-50 p-4 text-xs text-slate-600">{group.fallback}</div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}

          <section className="border border-[#0F172A] bg-white">
            <div className="border-b border-[#0F172A] px-5 py-4">
              <h3 className="font-display text-lg font-extrabold text-slate-950">Campaign ranking</h3>
              <p className="mt-1 text-xs text-slate-500">Organisation-level comparison of verified attention and confirmed commercial outcomes.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead><tr><th className="px-5 text-left">Campaign</th><th className="px-4 text-right">Reach</th><th className="px-4 text-right">Impressions</th><th className="px-4 text-right">CTA clicks</th><th className="px-4 text-right">Spend</th><th className="px-4 text-right">Leads</th><th className="px-4 text-right">Sales</th><th className="px-5 text-right">ROAS</th></tr></thead>
                <tbody>
                  {[...campaigns].sort((a, b) => b.ctaClicks - a.ctaClicks || b.impressions - a.impressions).map((campaign) => (
                    <tr key={campaign.advertId} className={campaign.advertId === selected?.advertId ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                      <td className="px-5"><button type="button" onClick={() => setSelectedId(campaign.advertId)} className="cursor-pointer text-left"><span className="block text-xs font-bold text-slate-950">{campaign.title}</span><span className="text-[10px] text-slate-500">{campaign.category} · {statusLabel(campaign)}</span></button></td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.uniqueViewers)}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.impressions)}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.ctaClicks)}</td>
                      <td className="px-4 text-right font-bold">{campaign.commercial.actualSpend > 0 ? money(campaign.commercial.actualSpend, campaign.commercial.currencyCode) : '—'}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.commercial.confirmedLeads)}</td>
                      <td className="px-4 text-right font-bold">{formatNumber(campaign.commercial.confirmedSales)}</td>
                      <td className="px-5 text-right font-bold">{campaign.commercial.actualSpend > 0 ? `${(campaign.commercial.confirmedRevenue / campaign.commercial.actualSpend).toFixed(2)}x` : '—'}</td>
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
        <p><strong>Verified measurement:</strong> unique reach means distinct privacy-safe visitors whose advert was at least 50% visible for one second. Repeat impressions and advert opens are limited to one per visitor and advert every 30 minutes; identical actions are limited to one every 10 seconds. Common automated agents and excessive event bursts are excluded. No names, contact details, IP addresses, raw visitor tokens, user-agent strings or user IDs are stored.</p>
      </div>
    </div>
  );
}
