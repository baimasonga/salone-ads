/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart2, Calendar, FolderOpen, Users, Link2,
  MessageSquare, UserCheck, BookOpen, Award, Compass, Sparkles,
  Settings, CreditCard, UserPlus, LogOut, Menu, X, Landmark, Shield, ShieldAlert, Loader2, FileSearch, Bell
} from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { AuthScreens } from './components/AuthScreens';
import { Workspaces } from './components/Workspaces';
import { TenderSearchPage } from './components/TenderSearchPage';
import { TenderDetailPage } from './components/TenderDetailPage';
import { supabase } from './lib/supabaseClient';
import { fetchMyOrganization, fetchOrgBundle, fetchDirectoryProfiles, fetchInfluencerProfiles, fetchMyPlatformRole } from './lib/api';
import { fetchMyNotifications, markNotificationRead, AppNotification } from './lib/procurementApi';
import { Campaign, ContentItem, Lead, DirectoryProfile, InfluencerProfile, SocialConnection, BrandKit, Organization } from './types';

type ViewState = 'landing' | 'signin' | 'signup' | 'onboarding' | 'dashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/tenders" element={<TenderSearchPage />} />
      <Route path="/tenders/:slug" element={<TenderDetailPage />} />
      <Route path="/*" element={<MainApp />} />
    </Routes>
  );
}

function MainApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<ViewState>('landing');
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');

  // --- HYDRATED DATA STATES (populated from Supabase once authenticated) ---
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [directoryProfiles, setDirectoryProfiles] = useState<DirectoryProfile[]>([]);
  const [influencerProfiles, setInfluencerProfiles] = useState<InfluencerProfile[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // --- DASHBOARD NAVIGATION STATES ---
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadWorkspace = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setActiveOrg(null);
      setBrandKit(null);
      setCampaigns([]);
      setContentItems([]);
      setLeads([]);
      setSocialConnections([]);
      setDirectoryProfiles([]);
      setInfluencerProfiles([]);
      setIsPlatformAdmin(false);
      setWorkspaceLoading(false);
      setView((v) => (v === 'dashboard' || v === 'onboarding' ? 'landing' : v));
      return;
    }

    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const org = await fetchMyOrganization();
      if (!org) {
        setView('onboarding');
        return;
      }
      const [bundle, directory, influencers, platformRole] = await Promise.all([
        fetchOrgBundle(org.id),
        fetchDirectoryProfiles(),
        fetchInfluencerProfiles(),
        fetchMyPlatformRole(),
      ]);
      setActiveOrg(bundle.organization);
      setBrandKit(bundle.brandKit);
      setCampaigns(bundle.campaigns);
      setContentItems(bundle.contentItems);
      setLeads(bundle.leads);
      setSocialConnections(bundle.socialConnections);
      setDirectoryProfiles(directory);
      setInfluencerProfiles(influencers);
      setIsPlatformAdmin(platformRole === 'admin');
      setView('dashboard');
    } catch (err: any) {
      setWorkspaceError(err.message || 'Failed to load your workspace from the server.');
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  // --- AUTH SESSION BOOTSTRAP ---
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadWorkspace(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, [loadWorkspace]);

  // --- HANDLERS ---
  const handleOnboardingComplete = () => {
    loadWorkspace(session);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setActiveTab('overview');
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

  if (view === 'signin' || view === 'signup' || view === 'onboarding') {
    return (
      <AuthScreens
        mode={view === 'onboarding' ? 'onboarding' : view === 'signin' ? 'signin' : 'signup'}
        onSwitchMode={(mode) => setView(mode)}
        onSuccess={handleOnboardingComplete}
      />
    );
  }

  if (workspaceLoading || !activeOrg || !brandKit) {
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

  // Define sidebar navigation items grouped logically
  const NAV_GROUPS = [
    {
      group: "Core Marketing",
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart2 },
        { id: 'campaigns', label: 'Campaigns', icon: Compass },
        { id: 'content', label: 'Content Studio', icon: Sparkles },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'media', label: 'Media Library', icon: FolderOpen },
        { id: 'audiences', label: 'Audiences', icon: Users },
      ]
    },
    {
      group: "Procurement",
      items: [
        { id: 'tenders', label: 'Tenders', icon: FileSearch },
        { id: 'supplier-profile', label: 'Supplier Profile', icon: Award },
      ]
    },
    {
      group: "Conversions & Discovery",
      items: [
        { id: 'social', label: 'Social Accounts', icon: Link2 },
        { id: 'analytics', label: 'Analytics', icon: Landmark },
        { id: 'leads', label: 'CRM Leads', icon: MessageSquare },
        { id: 'influencers', label: 'Influencer Market', icon: Award },
        { id: 'directory', label: 'Business Directory', icon: BookOpen },
        { id: 'events', label: 'Event Promotion', icon: UserCheck },
        { id: 'tourism', label: 'Tourism Excursions', icon: Compass },
      ]
    },
    ...(isPlatformAdmin ? [{
      group: "Platform Admin",
      items: [
        { id: 'admin-tender-review', label: 'Tender Review', icon: Shield },
        { id: 'admin-verification', label: 'Verification Requests', icon: ShieldAlert },
      ]
    }] : []),
    {
      group: "Workspace Settings",
      items: [
        { id: 'brandkit', label: 'Brand Kit', icon: Settings },
        { id: 'team', label: 'Team Roles', icon: UserPlus },
        { id: 'billing', label: 'Billing Invoices', icon: CreditCard },
        { id: 'admin', label: 'Super Admin Desk', icon: Shield },
      ]
    }
  ];

  return (
    <DashboardShell
      activeOrg={activeOrg}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      navGroups={NAV_GROUPS}
      onLogout={handleLogout}
    >
      <Workspaces
        activeTab={activeTab}
        activeOrg={activeOrg}
        isPlatformAdmin={isPlatformAdmin}
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
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  navGroups: { group: string; items: { id: string; label: string; icon: any }[] }[];
  onLogout: () => void;
  children: React.ReactNode;
}

function DashboardShell({ activeOrg, activeTab, setActiveTab, sidebarOpen, setSidebarOpen, navGroups, onLogout, children }: DashboardShellProps) {
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
    if (notification.linkUrl) {
      window.open(notification.linkUrl, '_blank');
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
              <div className="w-8 h-8 bg-[#0F172A] flex items-center justify-center shrink-0">
                <div className="w-4 h-4 border-2 border-white"></div>
              </div>
              <span className="font-display font-black tracking-widest text-lg uppercase text-[#0F172A]">SaloneReach</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-[#0F172A] hover:bg-slate-100 p-1 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Org Scoped Pill */}
          <div className="border border-[#0F172A] bg-white p-3.5 text-left shadow-xs">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.25em] block">SYSTEM.CONTEXT</span>
            <span className="font-extrabold text-sm block mt-0.5 text-[#0F172A] truncate">{activeOrg.name}</span>
            <span className="text-[10px] text-slate-600 font-mono mt-1 block">PLAN: Trial Tier</span>
          </div>

          {/* Navigation Items Grouped */}
          <nav className="space-y-5 text-left">
            {navGroups.map((group, gIdx) => {
              // Calculate index starts for neat numbering
              let prevCount = 0;
              for (let i = 0; i < gIdx; i++) {
                prevCount += navGroups[i].items.length;
              }

              return (
                <div key={gIdx} className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] block px-2">
                    {group.group}
                  </span>
                  <div className="space-y-1">
                    {group.items.map((item, itemIdx) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      const itemNum = String(prevCount + itemIdx + 1).padStart(2, '0');
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setSidebarOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#0F172A] text-white'
                              : 'text-[#0F172A] hover:bg-slate-200'
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
            })}
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
              <span className="tracking-widest uppercase">System.Core</span>
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
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Notifications</span>
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
              {activeOrg.type}
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
            SaloneReach v2.4 // Build Complete
          </div>
        </footer>
      </div>
    </div>
  );
}
