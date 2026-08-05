import type { LucideIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CreditCard,
  Gauge,
  History,
  Landmark,
  Mail,
  Megaphone,
  ShieldCheck,
  ServerCog,
  LifeBuoy,
  UserCheck,
  Users,
} from 'lucide-react';
import { AdminJobOperationsWorkspace } from './AdminJobOperationsWorkspace';
import { AdminResilienceWorkspace } from './AdminResilienceWorkspace';
import { AdminUsageMeteringWorkspace } from './AdminUsageMeteringWorkspace';
import { AdminAuthorizationAssuranceWorkspace } from './AdminAuthorizationAssuranceWorkspace';
import { AdminCommandOperationsWorkspace } from './AdminCommandOperationsWorkspace';

const AdminOrganizationLifecycleWorkspace = lazy(() =>
  import('./AdminOrganizationLifecycleWorkspace').then((module) => ({
    default: module.AdminOrganizationLifecycleWorkspace,
  })),
);
const PlatformStaffAccessWorkspace = lazy(() =>
  import('./PlatformStaffAccessWorkspace').then((module) => ({ default: module.PlatformStaffAccessWorkspace })),
);

const PLATFORM_ADMIN_TABS = ['overview', 'audience-hub', 'operations-hub', 'admin-jobs', 'admin-organizations', 'admin-resilience', 'admin-usage', 'admin-authorization', 'admin-commands', 'admin-access'] as const;
export type PlatformAdminTab = (typeof PLATFORM_ADMIN_TABS)[number];

export function isPlatformAdminWorkspaceTab(tab: string): tab is PlatformAdminTab {
  return PLATFORM_ADMIN_TABS.includes(tab as PlatformAdminTab);
}

interface PlatformAdminMetrics {
  activeCampaigns: number;
  publishedContent: number;
  activeLeads: number;
  trackedClicks: number;
}

interface HubItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface PlatformAdminWorkspaceProps {
  activeTab: PlatformAdminTab;
  metrics: PlatformAdminMetrics;
  onNavigate: (tab: string) => void;
}

function WorkspaceHub({
  eyebrow,
  title,
  description,
  items,
  onNavigate,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: HubItem[];
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-violet-300">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group border-2 border-slate-950 bg-white p-5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#0F172A]"
            >
              <Icon className="h-5 w-5 text-emerald-600" />
              <h3 className="mt-4 font-display text-lg font-extrabold">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase text-violet-700">
                Open workspace <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function PlatformOverview({
  metrics,
  onNavigate,
}: {
  metrics: PlatformAdminMetrics;
  onNavigate: (tab: string) => void;
}) {
  const stats = [
    { label: 'Active campaigns', value: metrics.activeCampaigns, accent: 'bg-emerald-400' },
    { label: 'Published content', value: metrics.publishedContent, accent: 'bg-violet-400' },
    { label: 'Active leads', value: metrics.activeLeads, accent: 'bg-amber-300' },
    { label: 'Tracked clicks', value: metrics.trackedClicks, accent: 'bg-sky-400' },
  ];
  const actions: HubItem[] = [
    {
      id: 'content-cms',
      title: 'Publish content',
      description: 'Create and manage pages, articles, announcements, and editorial workflows.',
      icon: BookOpen,
    },
    {
      id: 'campaign-builder',
      title: 'Manage campaigns',
      description: 'Plan advertising campaigns, schedule delivery, and coordinate creative assets.',
      icon: Megaphone,
    },
    {
      id: 'admin-tender-review',
      title: 'Review tenders',
      description: 'Approve, return, or reject tender submissions awaiting platform moderation.',
      icon: ShieldCheck,
    },
    {
      id: 'operations-hub',
      title: 'Handle requests',
      description: 'Process verification, subscription, service, and revenue operations in one place.',
      icon: UserCheck,
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <section className="relative overflow-hidden border-2 border-slate-950 bg-slate-950 p-6 text-white md:p-8">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="absolute -bottom-20 right-32 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[.24em] text-emerald-300">Platform administration</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold !text-white md:text-4xl">
            One clear view of Manohub operations.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Publish content, run advertising, review tenders, and support customers from focused workspaces.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="relative overflow-hidden border-2 border-slate-950 bg-white p-5">
            <span className={`absolute inset-x-0 top-0 h-1.5 ${stat.accent}`} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{stat.label}</span>
            <span className="mt-3 block font-display text-3xl font-extrabold text-slate-950">{stat.value}</span>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-violet-700">Quick actions</p>
          <h3 className="mt-1 font-display text-xl font-extrabold text-slate-950">Continue your work</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onNavigate(action.id)}
                className="group flex items-start gap-4 border-2 border-slate-950 bg-white p-5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#0F172A]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center bg-emerald-100 text-emerald-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="flex items-center gap-2 font-display text-base font-extrabold text-slate-950">
                    {action.title}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{action.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function PlatformAdminWorkspace({
  activeTab,
  metrics,
  onNavigate,
}: PlatformAdminWorkspaceProps) {
  if (activeTab === 'overview') {
    return <PlatformOverview metrics={metrics} onNavigate={onNavigate} />;
  }

  if (activeTab === 'admin-jobs') {
    return <AdminJobOperationsWorkspace />;
  }
  if (activeTab === 'admin-organizations') {
    return (
      <Suspense fallback={<div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-500">Loading subscriber management…</div>}>
        <AdminOrganizationLifecycleWorkspace />
      </Suspense>
    );
  }
  if (activeTab === 'admin-resilience') {
    return <AdminResilienceWorkspace />;
  }
  if (activeTab === 'admin-usage') {
    return <AdminUsageMeteringWorkspace />;
  }
  if (activeTab === 'admin-authorization') {
    return <AdminAuthorizationAssuranceWorkspace />;
  }
  if (activeTab === 'admin-commands') {
    return <AdminCommandOperationsWorkspace />;
  }
  if (activeTab === 'admin-access') {
    return <Suspense fallback={<div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-500">Loading staff access…</div>}><PlatformStaffAccessWorkspace /></Suspense>;
  }

  if (activeTab === 'audience-hub') {
    return (
      <WorkspaceHub
        eyebrow="Publishing"
        title="Audience & Messaging"
        description="Manage subscribers and prepare communications from one focused workspace."
        onNavigate={onNavigate}
        items={[
          {
            id: 'audience-subscribers',
            title: 'Audience subscribers',
            description: 'Review subscribers, preferences, consent and delivery channels.',
            icon: Users,
          },
          {
            id: 'audience-messaging',
            title: 'Messages & campaigns',
            description: 'Prepare, review and schedule email communication.',
            icon: Mail,
          },
        ]}
      />
    );
  }

  return (
    <WorkspaceHub
      eyebrow="Operations"
      title="Customer Requests"
      description="Process verification, subscriptions and support work without crowding the main navigation."
      onNavigate={onNavigate}
      items={[
        {
          id: 'admin-verification',
          title: 'Verification',
          description: 'Review supplier and organisation verification requests.',
          icon: ShieldCheck,
        },
        {
          id: 'admin-subscriptions',
          title: 'Subscriptions',
          description: 'Approve plans and manage pending subscription requests.',
          icon: CreditCard,
        },
        {
          id: 'admin-services',
          title: 'Service requests',
          description: 'Respond to support and managed-service requests.',
          icon: UserCheck,
        },
        {
          id: 'admin-advert-revenue',
          title: 'Revenue & orders',
          description: 'Review advert orders, packages and commercial activity.',
          icon: Landmark,
        },
        {
          id: 'admin-organizations',
          title: 'Subscriber management',
          description: 'View every subscriber profile; filter, export, suspend, close, recover or permanently remove accounts.',
          icon: Building2,
        },
        {
          id: 'admin-jobs',
          title: 'Background jobs',
          description: 'Monitor durable work, investigate failures and retry dead-letter jobs.',
          icon: ServerCog,
        },
        {
          id: 'admin-resilience',
          title: 'Reliability & recovery',
          description: 'Command incidents, track recovery objectives and record tested restore evidence.',
          icon: LifeBuoy,
        },
        {
          id: 'admin-audit-log',
          title: 'Platform audit log',
          description: 'Review immutable records across procurement, billing, subscriptions, content and administration.',
          icon: History,
        },
        {
          id: 'admin-usage',
          title: 'Usage metering',
          description: 'Inspect organization consumption and commercially important metered actions.',
          icon: Gauge,
        },
        {
          id: 'admin-authorization',
          title: 'Authorization assurance',
          description: 'Verify tenant isolation, RLS policy coverage and protected-access denials.',
          icon: ShieldCheck,
        },
        {
          id: 'admin-commands',
          title: 'Command operations',
          description: 'Monitor sensitive backend actions, idempotent retries and normalized failures.',
          icon: ServerCog,
        },
      ]}
    />
  );
}
