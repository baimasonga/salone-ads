/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  LogOut, Menu, X, Loader2, Bell,
} from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { AuthScreens } from './components/AuthScreens';
import { supabase } from './lib/supabaseClient';
import {
  fetchMyOrganizations,
  fetchOrgBundle,
  fetchDirectoryProfiles,
  fetchInfluencerProfiles,
  fetchMyPlatformRole,
  getStoredActiveOrganizationId,
  storeActiveOrganizationId,
} from './lib/api';
import { fetchMyNotifications, markNotificationRead, type AppNotification } from './lib/procurement/notificationApi';
import { hasFeature } from './lib/procurement/entitlementAssistApi';
import { CmsTeamRole, fetchCmsCurrentRole } from './lib/cmsApi';
import { Campaign, ContentItem, Lead, DirectoryProfile, InfluencerProfile, SocialConnection, BrandKit, Organization } from './types';
import { clearAllResilienceCaches } from './lib/networkResilience';
import { buildWorkspaceNavigation } from './config/workspaceNavigation';
import type { WorkspaceNavigationGroup } from './config/workspaceNavigation';
import { getAuthScreenMode, getInitialView } from './lib/authRouting';
import type { AppView } from './lib/authRouting';
import { fetchMySubscriptions } from './lib/procurement/subscriptionRequestApi';
import type { SubscriberAccessSummary } from './components/SubscriberOverview';
import { getSubscriberType } from './domain/subscriptions/subscriberTypes';
import { AccountRestrictedPage } from './components/AccountRestrictedPage';
import { fetchMyPlatformStaffAccess, type PlatformStaffRole } from './lib/platformStaffApi';
import { observeAccountSession } from './lib/accountSecurityApi';
import { MfaChallengeScreen } from './components/MfaChallengeScreen';

const NO_FEATURES = new Set<string>();
const ADVERTISING_FEATURES = new Set(['business_advertising']);
const PLATFORM_CONTEXT_ORG: Organization = {
  id:'00000000-0000-0000-0000-000000000000',name:'Quantix Sierra Leone',type:'Platform Staff',country:'Sierra Leone',
  district:'Western Area Urban',primaryObjective:'Hyderra platform operations',monthlyBudget:'',monthlyBudgetSle:null,
  subscriberType:'free',city:'Freetown',website:'',phone:'',whatsapp:'',description:'Hyderra internal platform context',
  audienceScope:'Platform',subscriberDetails:{},isBuyer:false,isSupplier:false,buyerVerified:false,supplierVerifiedUntil:null,
  status:'active',statusReason:null,recoverableUntil:null,
};
const PLATFORM_BRAND_KIT: BrandKit = {brandName:'Hyderra',legalName:'Quantix Sierra Leone',mission:'Operate Hyderra',tagline:'',primaryColor:'#10B981',secondaryColor:'#0F172A',fonts:'',toneOfVoice:'Professional',prohibitedTerminology:[]};

const Workspaces = lazy(() => import('./components/Workspaces').then((module) => ({ default: module.Workspaces })));
const TenderSearchPage = lazy(() => import('./components/TenderSearchPage').then((module) => ({ default: module.TenderSearchPage })));
const AdvancedSearchPage = lazy(() => import('./components/AdvancedSearchPage').then((module) => ({ default: module.AdvancedSearchPage })));
const TenderDetailPage = lazy(() => import('./components/TenderDetailPage').then((module) => ({ default: module.TenderDetailPage })));
const AdvertDetailPage = lazy(() => import('./components/AdvertDetailPage').then((module) => ({ default: module.AdvertDetailPage })));
const AdvertsFeedPage = lazy(() => import('./components/AdvertsFeedPage').then((module) => ({ default: module.AdvertsFeedPage })));
const UnsubscribePage = lazy(() => import('./components/UnsubscribePage').then((module) => ({ default: module.UnsubscribePage })));
const InsightsPage = lazy(() => import('./components/InsightsPage').then((module) => ({ default: module.InsightsPage })));
const CmsArticlePage = lazy(() => import('./components/CmsArticlePage').then((module) => ({ default: module.CmsArticlePage })));

function CmsPreviewRoute() {
  const { blockId = '' } = useParams();
  const navigate = useNavigate();
  return <LandingPage previewBlockId={blockId} onGetStarted={() => navigate('/?auth=signup')} onSignIn={() => navigate('/?auth=signin')} />;
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center border-4 md:border-8 border-[#0F172A]">
      <div role="status" className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/search" element={<AdvancedSearchPage />} />
        <Route path="/tenders" element={<TenderSearchPage />} />
        <Route path="/tenders/:slug" element={<TenderDetailPage />} />
        <Route path="/adverts" element={<AdvertsFeedPage />} />
        <Route path="/adverts/:slug" element={<AdvertDetailPage />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/insights/:slug" element={<CmsArticlePage contentType="post" />} />
        <Route path="/pages/:slug" element={<CmsArticlePage contentType="page" />} />
        <Route path="/content-preview/:contentId" element={<CmsArticlePage preview />} />
        <Route path="/cms-preview/:blockId" element={<CmsPreviewRoute />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </Suspense>
  );
}

function MainApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<AppView>(() => getInitialView(window.location.search));
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);

  // --- HYDRATED DATA STATES (populated from Supabase once authenticated) ---
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [directoryProfiles, setDirectoryProfiles] = useState<DirectoryProfile[]>([]);
  const [influencerProfiles, setInfluencerProfiles] = useState<InfluencerProfile[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isPlatformResearcher, setIsPlatformResearcher] = useState(false);
  const [platformStaffRole, setPlatformStaffRole] = useState<PlatformStaffRole | null>(null);
  const [canAdvertise, setCanAdvertise] = useState(false);
  const [cmsRole, setCmsRole] = useState<CmsTeamRole | null>(null);
  const [subscriberAccess, setSubscriberAccess] = useState<SubscriberAccessSummary | null>(null);

  // --- DASHBOARD NAVIGATION STATES ---
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadWorkspace = useCallback(async (activeSession: Session | null, preferredOrgId?: string) => {
    if (!activeSession) {
      setActiveOrg(null);
      setOrganizations([]);
      setBrandKit(null);
      setCampaigns([]);
      setContentItems([]);
      setLeads([]);
      setSocialConnections([]);
      setDirectoryProfiles([]);
      setInfluencerProfiles([]);
      setIsPlatformAdmin(false);
      setIsPlatformResearcher(false);
      setPlatformStaffRole(null);
      setCanAdvertise(false);
      setCmsRole(null);
      setSubscriberAccess(null);
      setWorkspaceLoading(false);
      setView((v) => (v === 'dashboard' || v === 'onboarding' ? 'landing' : v));
      return;
    }

    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const staffAccess = await fetchMyPlatformStaffAccess().catch(() => null);
      if (staffAccess && !['active','invited'].includes(staffAccess.status)) {
        throw new Error(`Your platform staff access is ${staffAccess.status}. Contact the Hyderra owner.`);
      }
      const activeStaffRole = staffAccess?.role ?? null;
      setPlatformStaffRole(activeStaffRole);
      const availableOrganizations = await fetchMyOrganizations();
      if (availableOrganizations.length === 0) {
        if (activeStaffRole) {
          setOrganizations([]); setActiveOrg(PLATFORM_CONTEXT_ORG); setBrandKit(PLATFORM_BRAND_KIT);
          setCampaigns([]); setContentItems([]); setLeads([]); setSocialConnections([]);
          setDirectoryProfiles([]); setInfluencerProfiles([]); setSubscriberAccess(null); setCanAdvertise(false);
          setIsPlatformAdmin(activeStaffRole === 'owner' || activeStaffRole === 'administrator');
          setIsPlatformResearcher(false);
          setCmsRole(activeStaffRole === 'editorial' ? 'administrator' : null);
          setView('dashboard');
          return;
        }
        setOrganizations([]);
        setView('onboarding');
        return;
      }
      const savedOrgId = preferredOrgId || getStoredActiveOrganizationId(activeSession.user.id);
      const org = availableOrganizations.find((item) => item.id === savedOrgId) ?? availableOrganizations[0];
      storeActiveOrganizationId(activeSession.user.id, org.id);
      setOrganizations(availableOrganizations);
      const [bundle, directory, influencers, platformRole, advertisingEntitled, editorialRole, subscriptions] = await Promise.all([
        fetchOrgBundle(org.id),
        fetchDirectoryProfiles(),
        fetchInfluencerProfiles(),
        fetchMyPlatformRole(),
        hasFeature(org.id, 'business_advertising').catch(() => false),
        fetchCmsCurrentRole().catch(() => null),
        fetchMySubscriptions(org.id).catch(() => []),
      ]);
      setActiveOrg(bundle.organization);
      setBrandKit(bundle.brandKit);
      setCampaigns(bundle.campaigns);
      setContentItems(bundle.contentItems);
      setLeads(bundle.leads);
      setSocialConnections(bundle.socialConnections);
      setDirectoryProfiles(directory);
      setInfluencerProfiles(influencers);
      setIsPlatformAdmin(activeStaffRole === 'owner' || activeStaffRole === 'administrator' || platformRole === 'admin');
      setIsPlatformResearcher(platformRole === 'researcher');
      setCanAdvertise(advertisingEntitled);
      setCmsRole(editorialRole);
      const currentSubscription = subscriptions.find((item) => ['active','trialing','past_due','grace_period','suspended'].includes(item.status))
        ?? subscriptions.find((item) => item.status === 'pending') ?? null;
      setSubscriberAccess(currentSubscription ? { planName: currentSubscription.planName, status: currentSubscription.status, currentPeriodEnd: currentSubscription.currentPeriodEnd } : null);
      setView('dashboard');
    } catch (err: any) {
      setWorkspaceError(err.message || 'Failed to load your workspace from the server.');
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  // --- AUTH SESSION BOOTSTRAP ---
  useEffect(() => {
    let workspaceLoadTimer: number | undefined;
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        if (workspaceLoadTimer !== undefined) window.clearTimeout(workspaceLoadTimer);
        setWorkspaceLoading(false);
        setView('update-password');
        return;
      }
      if (nextSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setView((currentView) => currentView === 'signin' ? 'dashboard' : currentView);
      }
      // Supabase holds an internal auth lock while this callback runs. Starting
      // another Supabase request here can deadlock the client after a successful
      // password login, so defer workspace hydration until the callback exits.
      if (workspaceLoadTimer !== undefined) window.clearTimeout(workspaceLoadTimer);
      workspaceLoadTimer = window.setTimeout(() => {
        void (async () => {
          if (nextSession) {
            const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (!assurance.error && assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
              setMfaRequired(true); setWorkspaceLoading(false); return;
            }
            setMfaRequired(false);
            await observeAccountSession().catch(() => undefined);
          }
          await loadWorkspace(nextSession);
        })();
      }, 0);
    });
    return () => {
      if (workspaceLoadTimer !== undefined) window.clearTimeout(workspaceLoadTimer);
      subscription.subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  // --- HANDLERS ---
  const handleOnboardingComplete = () => {
    loadWorkspace(session);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Unsubmitted drafts and cached results must not survive into the next
    // person's session on a shared device.
    clearAllResilienceCaches();
    setActiveTab('overview');
  };

  const handleOrganizationChange = async (orgId: string) => {
    if (!session || orgId === activeOrg?.id) return;
    setActiveTab('overview');
    await loadWorkspace(session, orgId);
  };

  // --- RENDERING ROUTE SEGMENTS ---

  if (view === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => setView('signup')}
        onSignIn={() => setView('signin')}
      />
    );
  }

  const authScreenMode = getAuthScreenMode(view);
  if (authScreenMode) {
    return (
      <AuthScreens
        mode={authScreenMode}
        onSwitchMode={(mode) => setView(mode)}
        onSuccess={handleOnboardingComplete}
      />
    );
  }

  if (mfaRequired && session) {
    return <MfaChallengeScreen onVerified={() => { setMfaRequired(false); void observeAccountSession().catch(() => undefined); void loadWorkspace(session); }} />;
  }

  // The dashboard view is only ever set from loadWorkspace with a live
  // session, so this also narrows `session` for the workspace props below.
  if (workspaceLoading || !session || !activeOrg || !brandKit) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-4 border-4 md:border-8 border-[#0F172A]">
        {workspaceError ? (
          <>
            <p className="text-sm font-mono text-red-600 max-w-md text-center px-6">{workspaceError}</p>
            <button
              onClick={() => loadWorkspace(session)}
              className="btn-geometric cursor-pointer"
            >
              Retry
            </button>
            <button onClick={handleLogout} className="text-xs font-mono text-slate-400 hover:text-slate-600 cursor-pointer">
              Sign out
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 text-[#0F172A] animate-spin" />
            <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Loading workspace…</span>
          </>
        )}
      </div>
    );
  }

  const navGroups = buildWorkspaceNavigation({
    isPlatformAdmin,
    platformStaffRole,
    isPlatformResearcher,
    cmsRole,
    features: canAdvertise ? ADVERTISING_FEATURES : NO_FEATURES,
    organizationType: activeOrg.type,
    subscriberType: activeOrg.subscriberType,
  });

  if (!isPlatformAdmin && !platformStaffRole && activeOrg.status !== 'active') {
    return <AccountRestrictedPage organization={activeOrg} onLogout={handleLogout} />;
  }

  return (
    <DashboardShell
      activeOrg={activeOrg}
      organizations={organizations}
      onOrganizationChange={handleOrganizationChange}
      organizationSwitching={workspaceLoading}
      subscriberAccess={subscriberAccess}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      navGroups={navGroups}
      isPlatformAdmin={isPlatformAdmin}
      platformStaffRole={platformStaffRole}
      onLogout={handleLogout}
    >
      <Workspaces
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeOrg={activeOrg}
        setActiveOrg={(organization) => setActiveOrg(organization)}
        subscriberAccess={subscriberAccess}
        currentUserId={session.user.id}
        isPlatformAdmin={isPlatformAdmin}
        isPlatformResearcher={isPlatformResearcher}
        platformStaffRole={platformStaffRole}
        campaigns={campaigns}
        setCampaigns={setCampaigns}
        contentItems={contentItems}
        setContentItems={setContentItems}
        leads={leads}
        setLeads={setLeads}
        directoryProfiles={directoryProfiles}
        setDirectoryProfiles={setDirectoryProfiles}
        influencerProfiles={influencerProfiles}
        socialConnections={socialConnections}
        setSocialConnections={setSocialConnections}
        brandKit={brandKit}
        setBrandKit={(update) =>
          setBrandKit((prev) => {
            if (!prev) return prev;
            return typeof update === 'function' ? (update as (p: BrandKit) => BrandKit)(prev) : update;
          })
        }
      />
    </DashboardShell>
  );
}

interface DashboardShellProps {
  activeOrg: Organization;
  organizations: Organization[];
  onOrganizationChange: (orgId: string) => void;
  organizationSwitching: boolean;
  subscriberAccess: SubscriberAccessSummary | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  navGroups: WorkspaceNavigationGroup[];
  isPlatformAdmin: boolean;
  platformStaffRole: PlatformStaffRole | null;
  onLogout: () => void;
  children: React.ReactNode;
}

type NavGroup = DashboardShellProps['navGroups'][number];

function computeItemNumOffset(groupIndex: number, groups: NavGroup[]): number {
  let count = 0;
  for (let i = 0; i < groupIndex; i++) count += groups[i].items.length;
  return count;
}

function NavGroupBlock({
  group,
  itemNumOffset,
  activeTab,
  onSelect,
  accent = 'default',
}: {
  group: NavGroup;
  itemNumOffset: number;
  activeTab: string;
  onSelect: (id: string) => void;
  accent?: 'default' | 'amber';
}) {
  const labelColor = accent === 'amber' ? 'text-amber-600' : 'text-slate-400';
  const activeClasses = accent === 'amber' ? 'bg-amber-700 text-white' : 'bg-[#0F172A] text-white';
  const idleClasses = accent === 'amber' ? 'text-amber-900 hover:bg-amber-50' : 'text-[#0F172A] hover:bg-slate-200';

  return (
    <div className="space-y-2">
      <span className={`text-[10px] font-bold uppercase tracking-[0.3em] block px-2 ${labelColor}`}>
        {group.group}
      </span>
      <div className="space-y-1">
        {group.items.map((item, itemIdx) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const itemNum = String(itemNumOffset + itemIdx + 1).padStart(2, '0');
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                isActive ? activeClasses : idleClasses
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.label}</span>
              </div>
              <span className="text-[9px] opacity-60 font-mono">{itemNum}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DashboardShell({
  activeOrg,
  organizations,
  onOrganizationChange,
  organizationSwitching,
  subscriberAccess,
  activeTab,
  setActiveTab,
  sidebarOpen,
  setSidebarOpen,
  navGroups,
  isPlatformAdmin,
  platformStaffRole,
  onLogout,
  children,
}: DashboardShellProps) {
  // Track current time formatted for Greenwich Mean Time / Freetown Time
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Africa/Freetown'
      };
      setTimeStr(new Date().toLocaleTimeString('en-GB', options) + ' GMT');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Notification Bell ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const refreshNotifications = () => {
    fetchMyNotifications()
      .then(setNotifications)
      .catch(() => {
        /* notifications are non-critical; ignore transient failures */
      });
  };

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => n.status !== 'read').length;

  const handleNotificationClick = async (notification: AppNotification) => {
    if (notification.status !== 'read') {
      setNotifications(notifications.map((n) => (n.id === notification.id ? { ...n, status: 'read' } : n)));
      try {
        await markNotificationRead(notification.id);
      } catch {
        /* best effort */
      }
    }
    if (notification.workspaceTarget) {
      setActiveTab(notification.workspaceTarget);
    } else if (notification.linkUrl) {
      window.location.assign(notification.linkUrl);
    }
    setNotifOpen(false);
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen font-sans flex border-4 md:border-8 border-[#0F172A] relative">
      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Navigation Panel */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white text-[#0F172A] border-r border-[#0F172A] p-5 flex flex-col justify-between z-50 transform transition-transform lg:translate-x-0 lg:static lg:flex shrink-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="space-y-6 overflow-y-auto pr-1 flex-1">
          {/* Logo Brand Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#0F172A]">
            <div className="flex items-center gap-3">
              <img src="/hyderra-mono.svg" alt="" aria-hidden="true" className="h-9 w-9 shrink-0" />
              <span className="font-display font-black tracking-widest text-lg uppercase text-[#0F172A]">Hyderra</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-[#0F172A] hover:bg-slate-100 p-1 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Platform owners have a platform identity; subscribers have an organisation context. */}
          <div className="border border-[#0F172A] bg-white p-3.5 text-left shadow-xs">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.25em] block">
              {platformStaffRole ? 'PLATFORM.STAFF' : 'SYSTEM.CONTEXT'}
            </span>
            {platformStaffRole ? (
              <>
                <span className="font-extrabold text-sm block mt-0.5 text-[#0F172A]">Quantix Sierra Leone</span>
                <span className="text-[10px] text-emerald-700 font-mono mt-1 block">HYDERRA {platformStaffRole.toUpperCase()}</span>
              </>
            ) : organizations.length > 1 ? (
              <select
                value={activeOrg.id}
                onChange={(event) => onOrganizationChange(event.target.value)}
                disabled={organizationSwitching}
                aria-label="Active organisation"
                className="font-extrabold text-sm block mt-1 text-[#0F172A] bg-white border border-slate-300 w-full px-2 py-1.5 cursor-pointer disabled:opacity-50"
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            ) : (
              <span className="font-extrabold text-sm block mt-0.5 text-[#0F172A] truncate">{activeOrg.name}</span>
            )}
            {!platformStaffRole && (
              <>
                <span className="text-[10px] text-slate-600 font-mono mt-1 block">TYPE: {getSubscriberType(activeOrg.subscriberType).label}</span>
                <span className={`text-[9px] font-mono mt-1 block uppercase ${subscriberAccess?.status === 'active' ? 'text-emerald-700' : 'text-amber-700'}`}>ACCESS: {subscriberAccess?.status?.replaceAll('_', ' ') ?? 'Free'}</span>
              </>
            )}
          </div>

          {/* Navigation is generated from the central access policy. */}
          <nav className="space-y-5 text-left">
            {navGroups.map((group, gIdx) => (
              <NavGroupBlock
                key={gIdx}
                group={group}
                itemNumOffset={computeItemNumOffset(gIdx, navGroups)}
                activeTab={activeTab}
                onSelect={(id) => {
                  setActiveTab(id);
                  setSidebarOpen(false);
                }}
              />
            ))}
          </nav>
        </div>

        {/* Sidebar Footer / System Health */}
        <div className="pt-4 border-t border-[#0F172A] mt-6 space-y-4">
          <div className="space-y-2 text-left">
            <div>
              <div className="flex justify-between text-[9px] uppercase font-mono font-bold text-slate-400 mb-0.5"><span>Bandwidth</span><span>38%</span></div>
              <div className="h-1 bg-slate-200 w-full"><div className="h-1 bg-[#0F172A] w-[38%]"></div></div>
            </div>
            <div>
              <div className="flex justify-between text-[9px] uppercase font-mono font-bold text-slate-400 mb-0.5"><span>Core API</span><span>Active</span></div>
              <div className="h-1 bg-[#10B981] w-full"></div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2.5 px-3 py-2 bg-slate-100 hover:bg-[#0F172A] text-[#0F172A] hover:text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors border border-[#0F172A] cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Main Header */}
        <header className="sticky top-0 bg-white border-b border-[#0F172A] z-30 px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-[#0F172A] hover:bg-slate-100 p-1 cursor-pointer">
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#0F172A]">
              <span className="tracking-widest uppercase">{platformStaffRole ? 'System.Staff' : 'System.Core'}</span>
              <span className="text-slate-300">//</span>
              <span className="uppercase text-slate-500 font-medium">
                {activeTab.replace('kit', ' Kit').replace('market', ' Market')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-8">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></div>
              <span className="text-[10px] font-mono uppercase tracking-tighter text-[#0F172A]">Status: Operational</span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-slate-300"></div>
            <span className="text-xs font-mono text-[#0F172A]">{timeStr || 'Freetown GMT'}</span>

            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative text-[#0F172A] hover:bg-slate-100 p-1.5 cursor-pointer"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#0F172A] shadow-lg z-40 max-h-96 overflow-y-auto">
                  <div className="p-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Notifications</span>
                      <button
                        onClick={() => {
                          setActiveTab('notifications');
                          setNotifOpen(false);
                        }}
                        className="text-[9px] font-mono font-bold uppercase text-emerald-700"
                      >
                        View all
                      </button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-400 p-4 text-center">No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer ${n.status !== 'read' ? 'bg-emerald-50/40' : ''}`}
                      >
                        <span className="text-xs font-semibold text-slate-800 block">{n.title}</span>
                        {n.body && <span className="text-[11px] text-slate-500 block mt-0.5">{n.body}</span>}
                        <span className="text-[9px] text-slate-400 font-mono mt-1 block">{new Date(n.createdAt).toLocaleDateString('en-GB')}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <span className="bg-[#0F172A] text-white text-[10px] font-mono font-bold px-2.5 py-1 uppercase tracking-wider">
              {platformStaffRole ? platformStaffRole.replace('_',' ') : activeOrg.type}
            </span>
          </div>
        </header>

        {/* Active Tab Screen Mounting Area */}
        <main className="p-6 md:p-8 flex-1 bg-[#F8FAFC]">
          {children}
        </main>

        {/* Terminal Style Operational Footer */}
        <footer className="h-12 bg-[#0F172A] text-white flex items-center px-6 md:px-8 gap-8 md:gap-12 shrink-0 text-[10px] font-mono">
          <div className="flex items-center gap-3">
            <span className="uppercase tracking-[0.3em] opacity-60 hidden sm:inline">Grid Status</span>
            <div className="flex gap-1">
              <div className="w-3 h-1.5 bg-[#10B981]"></div>
              <div className="w-3 h-1.5 bg-[#10B981]"></div>
              <div className="w-3 h-1.5 bg-[#10B981]"></div>
              <div className="w-3 h-1.5 bg-white/20"></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-[0.3em] opacity-60 hidden sm:inline">Latency</span>
            <span className="text-[#10B981]">14ms</span>
          </div>
          <div className="ml-auto opacity-50 tracking-widest uppercase text-[9px]">
            Hyderra v2.4 // Build Complete
          </div>
        </footer>
      </div>
    </div>
  );
}
