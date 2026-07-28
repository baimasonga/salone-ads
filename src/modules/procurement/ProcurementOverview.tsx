import {
  ArrowRight,
  Award,
  BarChart2,
  Bell,
  Bookmark,
  Clock,
  FileSearch,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OpportunityListItem, SavedSearch } from '../../lib/procurementApi';

export type ProcurementTier = 'Free' | 'Viewer' | 'Publisher' | null;

interface ProcurementOverviewProps {
  organizationName: string;
  tier: ProcurementTier;
  pipelineCount: number;
  savedSearchCount: number;
  savedSearches: SavedSearch[];
  recommended: OpportunityListItem[];
  publishedTenderCount: number;
  onNavigate: (tab: string) => void;
}

export function ProcurementOverview({
  organizationName,
  tier,
  pipelineCount,
  savedSearchCount,
  savedSearches,
  recommended,
  publishedTenderCount,
  onNavigate,
}: ProcurementOverviewProps) {
  const statCards = [
    { icon: Sparkles, label: 'Recommended matches', value: recommended.length },
    { icon: Bookmark, label: 'Saved searches', value: savedSearchCount },
    { icon: Bell, label: 'Alerts active', value: savedSearchCount },
    { icon: BarChart2, label: 'Tenders in pipeline', value: pipelineCount },
  ];

  return (
    <div className="space-y-8 text-left">
      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100/50 bg-emerald-50/50 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#0F172A] font-display text-lg font-black text-white">
            {organizationName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-emerald-950">Welcome back!</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {organizationName}
              {tier && <> · <span className="font-semibold text-emerald-700">{tier} plan</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/tenders"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 border border-[#0F172A] bg-white px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A] transition-colors hover:bg-[#0F172A] hover:text-white"
          >
            <Search className="h-3.5 w-3.5" /> Find tenders
          </Link>
          <Link
            to="/tenders"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-emerald-600 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" /> New saved search
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
              <div className="mb-3 flex h-9 w-9 items-center justify-center border border-[#0F172A] bg-emerald-50">
                <Icon className="h-4 w-4 text-emerald-700" />
              </div>
              <span className="block font-display text-2xl font-extrabold text-slate-900">{card.value}</span>
              <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-slate-400">{card.label}</span>
            </div>
          );
        })}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-800">
              <Sparkles className="h-4 w-4 text-emerald-600" /> Recommended for you
            </h3>
            <Link
              to="/tenders"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-widest text-emerald-600 hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recommended.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No matches yet — set your sectors in your supplier profile and save a search to start getting recommendations.
            </p>
          ) : (
            <div className="space-y-3">
              {recommended.map((opportunity) => (
                <Link
                  key={opportunity.id}
                  to={`/tenders/${opportunity.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 border border-slate-100 p-3 transition-colors hover:border-[#0F172A]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#0F172A] bg-emerald-50">
                    <FileSearch className="h-4 w-4 text-emerald-700" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-emerald-700">{opportunity.title}</h4>
                    <p className="truncate text-xs text-slate-500">
                      {[opportunity.buyerName, opportunity.sector].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(opportunity.submissionDeadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-800">
              <Bookmark className="h-4 w-4 text-emerald-600" /> Saved searches
            </h3>
            <span className="bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-400">{savedSearchCount}</span>
          </div>
          {savedSearches.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              No saved searches yet. Browse tenders and save a search to get alerts for matching opportunities.
            </p>
          ) : (
            <div className="space-y-2">
              {savedSearches.map((savedSearch) => (
                <div key={savedSearch.id} className="flex items-center gap-2 border border-slate-100 p-3">
                  <Bell className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="flex-1 truncate text-sm font-medium text-slate-700">{savedSearch.name}</span>
                </div>
              ))}
            </div>
          )}
          {tier === 'Publisher' && (
            <button
              onClick={() => onNavigate('tenders')}
              className="mt-4 flex w-full cursor-pointer items-center gap-2 border border-slate-100 bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100"
            >
              <Award className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-800">{publishedTenderCount} tenders published</span>
            </button>
          )}
        </div>
      </div>

      {tier === 'Free' && (
        <div className="space-y-3 rounded-2xl bg-[#0F172A] p-6 text-center text-white">
          <h3 className="font-display text-sm font-bold uppercase !text-white">Subscribe for full tender access</h3>
          <p className="mx-auto max-w-md text-sm text-slate-300">
            Viewer plans unlock full tender details and alerts. Publisher plans add the ability to post your own tenders.
          </p>
          <Link
            to="/#pricing"
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-[#0F172A] hover:bg-emerald-400"
          >
            View subscription plans
          </Link>
        </div>
      )}
    </div>
  );
}
