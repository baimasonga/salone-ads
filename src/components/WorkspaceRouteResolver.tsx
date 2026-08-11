import { lazy, Suspense, type ReactNode } from 'react';
import type { Organization } from '../types';
import type { OpportunityListItem } from '../lib/procurement/opportunityApi';
import type { SavedSearch } from '../lib/procurement/savedSearchApi';
import { NotificationCentre } from '../modules/notifications/NotificationCentre';
import { AdminTenderReviewWorkspace } from '../modules/procurement/AdminTenderReviewWorkspace';
import { ProcurementOverview } from '../modules/procurement/ProcurementOverview';
import type { ProcurementTier } from '../modules/procurement/model';
import { FinanceLedgerWorkspace } from '../modules/finance/FinanceLedgerWorkspace';
import { AdminSubscriptionLifecycleWorkspace } from '../modules/subscriptions/AdminSubscriptionLifecycleWorkspace';
import { AdminAuditLogWorkspace } from '../modules/platform-admin/AdminAuditLogWorkspace';
import { AdminServiceRequestsWorkspace } from '../modules/service-requests/AdminServiceRequestsWorkspace';
import type { PlatformStaffRole } from '../lib/platformStaffApi';
import { isPlatformAdminWorkspaceTab, PlatformAdminWorkspace } from '../modules/platform-admin/PlatformAdminWorkspace';
import { AdvertBillingPage } from './AdvertBillingPage';
import { LandingCmsPage } from './LandingCmsPage';
import { CmsContentManagerPage } from './CmsContentManagerPage';
import { AudienceSubscribersPage } from './AudienceSubscribersPage';
import { AudienceEmailCampaignsPage } from './AudienceEmailCampaignsPage';
import { CampaignPerformancePage } from './CampaignPerformancePage';
import { SubscriptionBillingPage } from './SubscriptionBillingPage';
import { OrganizationProfilePage } from './OrganizationProfilePage';
import {
  AdvertisingSubscriberOverview,
  SubscriberAccessBanner,
  type SubscriberAccessSummary,
} from './SubscriberOverview';

const OpportunityIngestionWorkspace = lazy(() =>
  import('../modules/procurement/OpportunityIngestionWorkspace')
    .then((module) => ({ default: module.OpportunityIngestionWorkspace })),
);

const AgencyWorkspacePage = lazy(() =>
  import('./AgencyWorkspacePage')
    .then((module) => ({ default: module.AgencyWorkspacePage })),
);

const CampaignBuilderPage = lazy(() =>
  import('./CampaignBuilderPage')
    .then((module) => ({ default: module.CampaignBuilderPage })),
);

interface OverviewModel {
  tier: ProcurementTier; pipelineCount: number; savedSearchCount: number; savedSearches: SavedSearch[];
  recommended: OpportunityListItem[]; publishedTenderCount: number; loading: boolean; degraded: boolean;
}

interface WorkspaceRouteResolverProps {
  activeTab: string;
  activeOrg: Organization;
  isPlatformAdmin: boolean;
  isPlatformResearcher: boolean;
  platformStaffRole: PlatformStaffRole | null;
  onNavigate: (tab: string) => void;
  onOrganizationUpdated: (organization: Organization) => void;
  subscriberAccess: SubscriberAccessSummary | null;
  overview: OverviewModel;
  metrics: { activeCampaigns: number; publishedContent: number; activeLeads: number; trackedClicks: number };
}

const adminDenied = () => <div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">You do not have platform admin access.</div>;

const staffOverview = (role: PlatformStaffRole) => {
  const copy: Record<PlatformStaffRole,{title:string;description:string}> = {
    owner:{title:'Platform owner',description:'Full control of Manohub operations and staff access.'},
    administrator:{title:'Platform administration',description:'Operate Manohub services, publishing and customer workflows.'},
    finance:{title:'Finance workspace',description:'Review invoices and record authorised payments, credits and refunds.'},
    editorial:{title:'Editorial workspace',description:'Create, review and publish Manohub pages and articles.'},
    support:{title:'Support workspace',description:'Respond to subscriber service requests and maintain customer communication.'},
    auditor:{title:'Audit workspace',description:'Read-only visibility into platform activity and accountability records.'},
  };
  return <section className="border-2 border-slate-950 bg-slate-950 p-8 text-white"><p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Quantix Sierra Leone</p><h2 className="mt-3 font-display text-3xl font-extrabold !text-white">{copy[role].title}</h2><p className="mt-3 max-w-2xl text-sm text-slate-300">{copy[role].description}</p></section>;
};

export function resolveDelegatedWorkspaceRoute({
  activeTab, activeOrg, isPlatformAdmin, isPlatformResearcher, platformStaffRole, onNavigate,
  onOrganizationUpdated, subscriberAccess, overview, metrics,
}: WorkspaceRouteResolverProps): ReactNode | undefined {
  if (activeTab === 'notifications') return <NotificationCentre activeOrgId={activeOrg.id} onNavigate={onNavigate} />;
  if (activeTab === 'opportunity-ingestion') {
    if (!isPlatformAdmin && !isPlatformResearcher) return <div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">Researcher access is required.</div>;
    return (
      <Suspense fallback={<div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">Loading sourcing workspace…</div>}>
        <OpportunityIngestionWorkspace isPlatformAdmin={isPlatformAdmin} />
      </Suspense>
    );
  }
  if (activeTab === 'admin-finance') return isPlatformAdmin || platformStaffRole === 'finance' ? <FinanceLedgerWorkspace /> : adminDenied();
  if (isPlatformAdmin && isPlatformAdminWorkspaceTab(activeTab)) {
    return <PlatformAdminWorkspace activeTab={activeTab} onNavigate={onNavigate} metrics={metrics} />;
  }
  if (activeTab === 'overview' && !isPlatformAdmin) {
    if (platformStaffRole) return staffOverview(platformStaffRole);
    if (activeOrg.subscriberType === 'advertiser') {
      return <AdvertisingSubscriberOverview organization={activeOrg} access={subscriberAccess} metrics={metrics} onNavigate={onNavigate} />;
    }
    return <>
      <SubscriberAccessBanner organization={activeOrg} access={subscriberAccess} onNavigate={onNavigate} />
      <ProcurementOverview organizationName={activeOrg.name}
        tier={subscriberAccess?.status === 'pending' ? null : overview.tier}
        pipelineCount={overview.pipelineCount} savedSearchCount={overview.savedSearchCount}
        savedSearches={overview.savedSearches} recommended={overview.recommended}
        publishedTenderCount={overview.publishedTenderCount} loading={overview.loading}
        degraded={overview.degraded} onNavigate={onNavigate} />
    </>;
  }
  if (activeTab === 'admin-tender-review') return isPlatformAdmin ? <AdminTenderReviewWorkspace /> : adminDenied();
  if (activeTab === 'admin-audit-log') return isPlatformAdmin || platformStaffRole === 'auditor' ? <AdminAuditLogWorkspace /> : adminDenied();
  if (activeTab === 'admin-services') return isPlatformAdmin || platformStaffRole === 'support' ? <AdminServiceRequestsWorkspace isPlatformAdmin /> : adminDenied();
  if (activeTab === 'admin-subscriptions') return isPlatformAdmin ? <AdminSubscriptionLifecycleWorkspace /> : adminDenied();
  if (activeTab === 'billing') return <SubscriptionBillingPage activeOrg={activeOrg} />;
  if (activeTab === 'org-profile') return <OrganizationProfilePage activeOrg={activeOrg} onUpdated={onOrganizationUpdated} />;
  if (activeTab === 'campaign-builder' || activeTab === 'campaigns') {
    return (
      <Suspense fallback={<div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">Loading Campaign Management…</div>}>
        <CampaignBuilderPage activeOrg={activeOrg} isPlatformAdmin={isPlatformAdmin} />
      </Suspense>
    );
  }
  if (activeTab === 'advert-packages' || activeTab === 'admin-advert-revenue') return <AdvertBillingPage activeOrg={activeOrg} isPlatformAdmin={isPlatformAdmin} />;
  if (activeTab === 'agency-workspace') {
    return (
      <Suspense fallback={<div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">Loading Agency Workspace…</div>}>
        <AgencyWorkspacePage activeOrg={activeOrg} isPlatformAdmin={isPlatformAdmin} />
      </Suspense>
    );
  }
  if (activeTab === 'landing-cms') return <LandingCmsPage />;
  if (activeTab === 'content-cms') return <CmsContentManagerPage isPlatformAdmin={isPlatformAdmin || platformStaffRole === 'editorial'} />;
  if (activeTab === 'audience-subscribers') return <AudienceSubscribersPage />;
  if (activeTab === 'audience-messaging') return <AudienceEmailCampaignsPage />;
  if (activeTab === 'campaign-performance') return <CampaignPerformancePage activeOrg={activeOrg}
    isPlatformAdmin={isPlatformAdmin} onCreateAdvert={() => onNavigate(isPlatformAdmin ? 'admin-advertising' : 'advertising')} />;
  return undefined;
}
