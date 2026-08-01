import { lazy, Suspense, type ReactNode } from 'react';
import type { Organization } from '../types';
import type { OpportunityListItem, SavedSearch } from '../lib/procurementApi';
import { NotificationCentre } from '../modules/notifications/NotificationCentre';
import { AdminTenderReviewWorkspace } from '../modules/procurement/AdminTenderReviewWorkspace';
import { ProcurementOverview } from '../modules/procurement/ProcurementOverview';
import type { ProcurementTier } from '../modules/procurement/model';
import { FinanceLedgerWorkspace } from '../modules/finance/FinanceLedgerWorkspace';
import { AdminSubscriptionLifecycleWorkspace } from '../modules/subscriptions/AdminSubscriptionLifecycleWorkspace';
import { AdminAuditLogWorkspace } from '../modules/platform-admin/AdminAuditLogWorkspace';
import { isPlatformAdminWorkspaceTab, PlatformAdminWorkspace } from '../modules/platform-admin/PlatformAdminWorkspace';
import { CampaignBuilderPage } from './CampaignBuilderPage';
import { AdvertBillingPage } from './AdvertBillingPage';
import { AgencyWorkspacePage } from './AgencyWorkspacePage';
import { LandingCmsPage } from './LandingCmsPage';
import { CmsContentManagerPage } from './CmsContentManagerPage';
import { AudienceSubscribersPage } from './AudienceSubscribersPage';
import { AudienceEmailCampaignsPage } from './AudienceEmailCampaignsPage';
import { CampaignPerformancePage } from './CampaignPerformancePage';

const OpportunityIngestionWorkspace = lazy(() =>
  import('../modules/procurement/OpportunityIngestionWorkspace')
    .then((module) => ({ default: module.OpportunityIngestionWorkspace })),
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
  onNavigate: (tab: string) => void;
  overview: OverviewModel;
  metrics: { activeCampaigns: number; publishedContent: number; activeLeads: number; trackedClicks: number };
}

const adminDenied = () => <div className="border-2 border-slate-950 bg-white p-6 text-sm text-slate-600">You do not have platform admin access.</div>;

export function resolveDelegatedWorkspaceRoute({
  activeTab, activeOrg, isPlatformAdmin, isPlatformResearcher, onNavigate, overview, metrics,
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
  if (activeTab === 'admin-finance') return isPlatformAdmin ? <FinanceLedgerWorkspace /> : adminDenied();
  if (isPlatformAdmin && isPlatformAdminWorkspaceTab(activeTab)) {
    return <PlatformAdminWorkspace activeTab={activeTab} onNavigate={onNavigate} metrics={metrics} />;
  }
  if (activeTab === 'overview' && !isPlatformAdmin) {
    return <ProcurementOverview organizationName={activeOrg.name} tier={overview.tier}
      pipelineCount={overview.pipelineCount} savedSearchCount={overview.savedSearchCount}
      savedSearches={overview.savedSearches} recommended={overview.recommended}
      publishedTenderCount={overview.publishedTenderCount} loading={overview.loading}
      degraded={overview.degraded} onNavigate={onNavigate} />;
  }
  if (activeTab === 'admin-tender-review') return isPlatformAdmin ? <AdminTenderReviewWorkspace /> : adminDenied();
  if (activeTab === 'admin-audit-log') return isPlatformAdmin ? <AdminAuditLogWorkspace /> : adminDenied();
  if (activeTab === 'admin-subscriptions') return isPlatformAdmin ? <AdminSubscriptionLifecycleWorkspace /> : adminDenied();
  if (activeTab === 'campaign-builder' || activeTab === 'campaigns') return <CampaignBuilderPage activeOrg={activeOrg} isPlatformAdmin={isPlatformAdmin} />;
  if (activeTab === 'advert-packages' || activeTab === 'admin-advert-revenue') return <AdvertBillingPage activeOrg={activeOrg} isPlatformAdmin={isPlatformAdmin} />;
  if (activeTab === 'agency-workspace') return <AgencyWorkspacePage activeOrg={activeOrg} isPlatformAdmin={isPlatformAdmin} />;
  if (activeTab === 'landing-cms') return <LandingCmsPage />;
  if (activeTab === 'content-cms') return <CmsContentManagerPage isPlatformAdmin={isPlatformAdmin} />;
  if (activeTab === 'audience-subscribers') return <AudienceSubscribersPage />;
  if (activeTab === 'audience-messaging') return <AudienceEmailCampaignsPage />;
  if (activeTab === 'campaign-performance') return <CampaignPerformancePage activeOrg={activeOrg}
    isPlatformAdmin={isPlatformAdmin} onCreateAdvert={() => onNavigate(isPlatformAdmin ? 'admin-advertising' : 'advertising')} />;
  return undefined;
}
