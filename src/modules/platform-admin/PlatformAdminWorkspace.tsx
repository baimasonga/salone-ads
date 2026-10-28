import type { LucideIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CreditCard,
  Gauge,
  History,
  Landmark,
  Mail,
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
import type { PlatformStaffRole } from '../../lib/platformStaffApi';

const AdminOrganizationLifecycleWorkspace = lazy(() =>
  import('./AdminOrganizationLifecycleWorkspace').then((module) => ({
    default: module.AdminOrganizationLifecycleWorkspace,
  })),
);
const PlatformStaffAccessWorkspace = lazy(() =>
  import('./PlatformStaffAccessWorkspace').then((module) => ({ default: module.PlatformStaffAccessWorkspace })),
);
const AdministratorControlCentre = lazy(() =>
  import('./AdministratorControlCentre').then((module) => ({ default: module.AdministratorControlCentre })),
);

const SupportCasesWorkspace = lazy(() =>
  import('../service-requests/AdminServiceRequestsWorkspace').then(module => ({ default: module.AdminServiceRequestsWorkspace })),
);

const PLATFORM_ADMIN_TABS = ['overview', 'audience-hub', 'operations-hub', 'admin-jobs', 'admin-organizations', 'admin-resilience', 'admin-usage', 'admin-authorization', 'admin-commands', 'admin-access'] as const;
export type PlatformAdminTab = (typeof PLATFORM_ADMIN_TABS)[number];

export function isPlatformAdminWorkspaceTab(tab: string): tab is PlatformAdminTab {
  return PLATFORM_ADMIN_TABS.includes(tab as PlatformAdminTab);
}

interface HubItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface PlatformAdminWorkspaceProps {
  activeTab: PlatformAdminTab;
  onNavigate: (tab: string) => void;
  platformStaffRole: PlatformStaffRole | null;
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

export function PlatformAdminWorkspace({
  activeTab,
  onNavigate,
  platformStaffRole,
}: PlatformAdminWorkspaceProps) {
  if (activeTab === 'overview') {
    return <Suspense fallback={<div role="status" className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-500">Loading Control Centre…</div>}><AdministratorControlCentre role={platformStaffRole ?? 'administrator'} onNavigate={onNavigate}/></Suspense>;
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

  return <CustomerSupportWorkspace onNavigate={onNavigate} />;
}

function OperationalRequests({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <WorkspaceHub
      eyebrow="Operations"
      title="Operational requests"
      description="Review verification, subscription, billing and platform operations."
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

export function CustomerSupportWorkspace({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [view, setView] = useState<'cases' | 'operations'>('cases');
  return <div className="space-y-6">
    <h2 className="font-display text-2xl font-bold text-slate-950">Customer Support Centre</h2>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Support views">
      <button type="button" aria-pressed={view === 'cases'} onClick={() => setView('cases')} className="btn-geometric-secondary">Cases & service requests</button>
      <button type="button" aria-pressed={view === 'operations'} onClick={() => setView('operations')} className="btn-geometric-secondary">Operational requests</button>
    </div>
    {view === 'cases'
      ? <Suspense fallback={<div role="status">Loading support cases…</div>}><SupportCasesWorkspace isPlatformAdmin /></Suspense>
      : <OperationalRequests onNavigate={onNavigate} />}
  </div>;
}
