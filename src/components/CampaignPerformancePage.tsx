import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Plus,
  Target,
} from 'lucide-react';
import { Organization } from '../types';

interface CampaignPerformancePageProps {
  activeOrg: Organization;
  onCreateAdvert: () => void;
}

type CampaignPerformance = {
  id: string;
  title: string;
  category: string;
  status: 'Active' | 'Completed';
  startDate: string;
  accent: string;
  background: string;
  spend: number;
  budget: number;
  impressions: number;
  clicks: number;
  leads: number;
  score: number;
  headline: string;
  description: string;
  channels: { whatsapp: number; facebook: number; instagram: number };
};

const campaigns: CampaignPerformance[] = [
  {
    id: 'visibility',
    title: '[DEMO] Business Visibility Package',
    category: 'Business',
    status: 'Active',
    startDate: '20 May 2024',
    accent: '#059669',
    background: '#0F172A',
    spend: 3240000,
    budget: 5000000,
    impressions: 412356,
    clicks: 6842,
    leads: 512,
    score: 84,
    headline: 'Put your business in front of new customers',
    description: 'A measurable campaign for growing brands across Sierra Leone.',
    channels: { whatsapp: 62, facebook: 25, instagram: 13 },
  },
  {
    id: 'marketplace',
    title: '[DEMO] Mano River Marketplace',
    category: 'Marketplace',
    status: 'Active',
    startDate: '22 May 2024',
    accent: '#2563EB',
    background: '#172554',
    spend: 2180000,
    budget: 4000000,
    impressions: 286904,
    clicks: 4128,
    leads: 318,
    score: 72,
    headline: 'Locally made products, ready for new markets',
    description: 'Connecting producers with customers at home and abroad.',
    channels: { whatsapp: 55, facebook: 30, instagram: 15 },
  },
  {
    id: 'training',
    title: '[DEMO] Digital Skills Workshop',
    category: 'Training',
    status: 'Active',
    startDate: '25 May 2024',
    accent: '#D97706',
    background: '#292524',
    spend: 1760000,
    budget: 3000000,
    impressions: 231128,
    clicks: 3210,
    leads: 246,
    score: 61,
    headline: 'Practical digital skills for small businesses',
    description: 'Training entrepreneurs to plan, publish and measure content.',
    channels: { whatsapp: 48, facebook: 34, instagram: 18 },
  },
];

const weeklyData = [
  { label: '20–26 May', whatsapp: 28000, facebook: 21000, instagram: 13000, leads: 44 },
  { label: '27 May–2 Jun', whatsapp: 38000, facebook: 29000, instagram: 19000, leads: 88 },
  { label: '3–9 Jun', whatsapp: 39000, facebook: 42000, instagram: 30000, leads: 131 },
  { label: '10–16 Jun', whatsapp: 48000, facebook: 44000, instagram: 35000, leads: 169 },
];

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat('en').format(value);

const formatCurrency = (value: number) =>
  `Le ${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value)}`;

function Trend({
  value,
  direction = 'up',
}: {
  value: string;
  direction?: 'up' | 'down';
}) {
  const Icon = direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold ${direction === 'up' ? 'text-emerald-700' : 'text-red-700'}`}>
      <Icon className="h-3 w-3" />
      {value}
    </span>
  );
}

function CampaignCreative({ campaign }: { campaign: CampaignPerformance }) {
  return (
    <div
      className="relative h-40 overflow-hidden p-5 flex flex-col justify-between text-white"
      style={{ backgroundColor: campaign.background, borderBottom: `5px solid ${campaign.accent}` }}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-white/70">Manohub advertising</span>
        <span className="border border-white/50 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest">{campaign.category}</span>
      </div>
      <div>
        <p className="font-display text-xl font-extrabold leading-tight text-white max-w-sm">{campaign.headline}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-white/70 max-w-md">{campaign.description}</p>
      </div>
    </div>
  );
}

export function CampaignPerformancePage({ activeOrg, onCreateAdvert }: CampaignPerformancePageProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0].id);
  const [period, setPeriod] = useState('May 20 – Jun 16, 2024');
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0];

  const totals = useMemo(
    () =>
      campaigns.reduce(
        (sum, campaign) => ({
          impressions: sum.impressions + campaign.impressions,
          clicks: sum.clicks + campaign.clicks,
          leads: sum.leads + campaign.leads,
          spend: sum.spend + campaign.spend,
        }),
        { impressions: 0, clicks: 0, leads: 0, spend: 0 },
      ),
    [],
  );

  const maxWeeklyImpressions = Math.max(
    ...weeklyData.map((week) => week.whatsapp + week.facebook + week.instagram),
  );

  return (
    <div className="space-y-5 text-left" data-testid="campaign-performance-page">
      <div className="flex flex-col gap-4 border-b-2 border-[#0F172A] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-700">Advertising intelligence</span>
          <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-slate-950">Campaign Performance</h2>
          <p className="mt-1 text-sm text-slate-500">Compare campaigns, understand results and decide what to improve next.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <select
              aria-label="Campaign performance period"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="h-10 bg-white pl-9 pr-8 font-mono text-[10px] font-bold uppercase tracking-wider"
            >
              <option>May 20 – Jun 16, 2024</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
            </select>
          </label>
          <span className="border border-amber-500 bg-amber-50 px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Demo data
          </span>
          <button type="button" onClick={() => window.print()} className="btn-geometric-secondary h-10 inline-flex items-center gap-2 cursor-pointer">
            <Download className="h-3.5 w-3.5" /> Report
          </button>
          <button type="button" onClick={onCreateAdvert} className="btn-geometric h-10 inline-flex items-center gap-2 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Create advert
          </button>
        </div>
      </div>

      <section className="border border-[#0F172A] bg-white">
        <div className="border-b border-[#0F172A] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-display text-xl font-extrabold text-slate-950">See what earns attention</h3>
              <p className="mt-1 text-xs text-slate-500">Compare campaign creatives, delivery and business results.</p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{activeOrg.name} · Demo portfolio</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3">
          {campaigns.map((campaign, index) => {
            const selected = campaign.id === selectedCampaignId;
            const spendPercentage = Math.round((campaign.spend / campaign.budget) * 100);
            const ctr = (campaign.clicks / campaign.impressions) * 100;
            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => setSelectedCampaignId(campaign.id)}
                aria-pressed={selected}
                className={`min-w-0 bg-white text-left transition-colors cursor-pointer ${index > 0 ? 'border-t border-[#0F172A] lg:border-l lg:border-t-0' : ''} ${selected ? 'outline outline-4 -outline-offset-4 outline-emerald-600' : 'hover:bg-slate-50'}`}
              >
                <CampaignCreative campaign={campaign} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{campaign.title}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-emerald-700">{campaign.status} since {campaign.startDate}</p>
                    </div>
                    <div className="border-l border-[#0F172A] pl-3 text-right shrink-0">
                      <span className="block font-display text-2xl font-extrabold leading-none text-slate-950">{campaign.score}</span>
                      <span className="font-mono text-[8px] uppercase tracking-wider text-slate-500">Pulse /100</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between font-mono text-[9px] uppercase tracking-wider text-slate-500">
                      <span>{formatCurrency(campaign.spend)}</span>
                      <span>{spendPercentage}% of budget</span>
                    </div>
                    <div className="h-1.5 bg-slate-200">
                      <div className="h-full bg-[#0F172A]" style={{ width: `${spendPercentage}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 border-t border-slate-200 pt-3">
                    <div>
                      <span className="block font-mono text-[8px] uppercase tracking-wider text-slate-500">Impressions</span>
                      <strong className="mt-1 block font-display text-lg text-slate-950">{formatCompact(campaign.impressions)}</strong>
                    </div>
                    <div className="border-l border-slate-200 pl-3">
                      <span className="block font-mono text-[8px] uppercase tracking-wider text-slate-500">CTR</span>
                      <strong className="mt-1 block font-display text-lg text-slate-950">{ctr.toFixed(2)}%</strong>
                    </div>
                    <div className="border-l border-slate-200 pl-3">
                      <span className="block font-mono text-[8px] uppercase tracking-wider text-slate-500">Leads</span>
                      <strong className="mt-1 block font-display text-lg text-slate-950">{formatNumber(campaign.leads)}</strong>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid border border-[#0F172A] bg-white xl:grid-cols-[1.55fr_0.85fr]">
        <div className="border-b border-[#0F172A] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-extrabold text-slate-950">Why this campaign is working</h3>
              <p className="mt-1 text-xs text-slate-500">Weekly channel delivery and lead growth for the selected campaign.</p>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-wider text-slate-600">
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#059669] align-middle" />WhatsApp</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#2563EB] align-middle" />Facebook</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#C026D3] align-middle" />Instagram</span>
            </div>
          </div>

          <div className="mt-7 grid h-64 grid-cols-4 gap-3 border-b border-l border-slate-300 px-3">
            {weeklyData.map((week) => {
              const total = week.whatsapp + week.facebook + week.instagram;
              const height = Math.max(12, (total / maxWeeklyImpressions) * 100);
              const whatsappShare = (week.whatsapp / total) * 100;
              const facebookShare = (week.facebook / total) * 100;
              const instagramShare = 100 - whatsappShare - facebookShare;
              return (
                <div key={week.label} className="relative flex min-w-0 flex-col items-center justify-end">
                  <span className="mb-2 font-display text-base font-extrabold text-slate-950">{week.leads}</span>
                  <div className="flex w-full max-w-20 flex-col-reverse" style={{ height: `${height}%` }}>
                    <div className="bg-[#059669]" style={{ height: `${whatsappShare}%` }} />
                    <div className="bg-[#2563EB]" style={{ height: `${facebookShare}%` }} />
                    <div className="bg-[#C026D3]" style={{ height: `${instagramShare}%` }} />
                  </div>
                  <span className="absolute top-full mt-2 w-full text-center font-mono text-[8px] leading-tight text-slate-500">{week.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-px bg-[#0F172A] border border-[#0F172A] sm:grid-cols-4">
            {[
              ['Total impressions', formatNumber(totals.impressions), '+24.8%'],
              ['CTA clicks', formatNumber(totals.clicks), '+18.2%'],
              ['Qualified leads', formatNumber(totals.leads), '+31.4%'],
              ['Cost per lead', formatCurrency(Math.round(totals.spend / totals.leads)), '-9.6%'],
            ].map(([label, value, trend], index) => (
              <div key={label} className="bg-white p-3">
                <span className="font-mono text-[8px] uppercase tracking-wider text-slate-500">{label}</span>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <strong className="font-display text-xl text-slate-950">{value}</strong>
                  <Trend value={trend} direction={index === 3 ? 'down' : 'up'} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="bg-slate-50 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-5 border-b border-[#0F172A] pb-5">
            <div>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-700">Performance pulse</span>
              <div className="mt-2 flex items-baseline gap-2">
                <strong className="font-display text-5xl font-extrabold text-slate-950">{selectedCampaign.score}</strong>
                <span className="font-mono text-xs text-slate-500">/100</span>
              </div>
            </div>
            <div className="border-l-4 border-emerald-600 pl-3">
              <p className="text-sm font-bold text-emerald-800">{selectedCampaign.score >= 80 ? 'Performing well' : selectedCampaign.score >= 70 ? 'Good momentum' : 'Needs attention'}</p>
              <p className="mt-1 max-w-48 text-[11px] leading-relaxed text-slate-600">Calculated from reach, clicks, leads, cost efficiency and recent momentum.</p>
            </div>
          </div>

          <h4 className="mt-5 font-display text-sm font-extrabold text-slate-950">Top recommendations</h4>
          <div className="mt-3 border border-[#0F172A] bg-white">
            {[
              { icon: MessageCircle, title: 'Keep WhatsApp as primary CTA', body: `${selectedCampaign.channels.whatsapp}% of selected-campaign traffic comes through WhatsApp.` },
              { icon: Target, title: 'Increase evening delivery', body: '7PM–10PM produces the strongest click-through rate.' },
              { icon: Megaphone, title: 'Reuse the strongest headline', body: 'The text-led message is generating more qualified leads.' },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={`flex gap-3 p-3 ${index > 0 ? 'border-t border-slate-200' : ''}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="border border-[#0F172A] bg-white">
        <div className="flex items-end justify-between gap-4 border-b border-[#0F172A] px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-extrabold text-slate-950">Creative ranking</h3>
            <p className="mt-1 text-xs text-slate-500">Every number stays visible for fast comparison.</p>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Demo data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr>
                <th className="px-5 text-left">Creative</th>
                <th className="px-4 text-left">Channel mix</th>
                <th className="px-4 text-right">Impressions</th>
                <th className="px-4 text-right">CTR</th>
                <th className="px-4 text-right">Leads</th>
                <th className="px-5 text-left">Performance</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const ctr = (campaign.clicks / campaign.impressions) * 100;
                const label = campaign.score >= 80 ? 'Best performer' : campaign.score >= 70 ? 'Good' : 'Needs improvement';
                return (
                  <tr key={campaign.id} className={campaign.id === selectedCampaignId ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                    <td className="px-5">
                      <button type="button" onClick={() => setSelectedCampaignId(campaign.id)} className="text-left cursor-pointer">
                        <span className="block font-sans text-xs font-bold text-slate-950">{campaign.headline}</span>
                        <span className="mt-0.5 block font-sans text-[10px] text-slate-500">{campaign.description}</span>
                      </button>
                    </td>
                    <td className="px-4">
                      <span className="text-emerald-700">{campaign.channels.whatsapp}%</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-blue-700">{campaign.channels.facebook}%</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-fuchsia-700">{campaign.channels.instagram}%</span>
                    </td>
                    <td className="px-4 text-right font-bold">{formatNumber(campaign.impressions)}</td>
                    <td className="px-4 text-right font-bold">{ctr.toFixed(2)}%</td>
                    <td className="px-4 text-right font-bold">{formatNumber(campaign.leads)}</td>
                    <td className="px-5">
                      <span className={`border px-2 py-1 font-sans text-[10px] font-bold ${campaign.score >= 80 ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : campaign.score >= 70 ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-amber-600 bg-amber-50 text-amber-800'}`}>
                        {label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-900">
        <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Demo-performance preview:</strong> these figures demonstrate the Campaign Performance experience. Live campaign events will replace them once detailed channel, CTA and lead tracking is enabled.</p>
      </div>
    </div>
  );
}
