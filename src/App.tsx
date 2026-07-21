/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart2, Calendar, FileText, FolderOpen, Users, Link2, 
  MessageSquare, UserCheck, BookOpen, Award, Compass, Sparkles, 
  Settings, ShieldAlert, CreditCard, UserPlus, LogOut, Menu, X, Landmark, Shield
} from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { AuthScreens } from './components/AuthScreens';
import { Workspaces } from './components/Workspaces';
import { 
  INITIAL_CAMPAIGNS, 
  INITIAL_CONTENT_ITEMS, 
  INITIAL_LEADS, 
  INITIAL_DIRECTORY_PROFILES, 
  INITIAL_INFLUENCER_PROFILES, 
  INITIAL_SOCIAL_CONNECTIONS 
} from './mockData';
import { Campaign, ContentItem, Lead, DirectoryProfile, InfluencerProfile, SocialConnection, BrandKit, Organization } from './types';

export default function App() {
  // --- CORE VIEW STATE ---
  // View states: 'landing' | 'signin' | 'signup' | 'onboarding' | 'dashboard'
  const [view, setView] = useState<'landing' | 'signin' | 'signup' | 'onboarding' | 'dashboard'>(() => {
    const saved = localStorage.getItem('salonereach_view');
    return (saved as any) || 'landing';
  });

  // --- HYDRATED DATA STATES ---
  const [activeOrg, setActiveOrg] = useState<Organization>(() => {
    const saved = localStorage.getItem('salonereach_active_org');
    return saved ? JSON.parse(saved) : {
      id: 'org-def',
      name: 'My Salone Enterprise',
      type: 'Small Business',
      country: 'Sierra Leone',
      district: 'Western Area Urban',
      primaryObjective: 'WhatsApp enquiries',
      monthlyBudget: 'Le 15,000,000'
    };
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    const saved = localStorage.getItem('salonereach_campaigns');
    return saved ? JSON.parse(saved) : INITIAL_CAMPAIGNS;
  });

  const [contentItems, setContentItems] = useState<ContentItem[]>(() => {
    const saved = localStorage.getItem('salonereach_content_items');
    return saved ? JSON.parse(saved) : INITIAL_CONTENT_ITEMS;
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('salonereach_leads');
    return saved ? JSON.parse(saved) : INITIAL_LEADS;
  });

  const [directoryProfiles, setDirectoryProfiles] = useState<DirectoryProfile[]>(() => {
    const saved = localStorage.getItem('salonereach_directory_profiles');
    return saved ? JSON.parse(saved) : INITIAL_DIRECTORY_PROFILES;
  });

  const [brandKit, setBrandKit] = useState<BrandKit>(() => {
    const saved = localStorage.getItem('salonereach_brand_kit');
    return saved ? JSON.parse(saved) : {
      brandName: 'Sierra Organic',
      legalName: 'Sierra Organic Ltd',
      mission: 'Bring organic native Sierra Leone flavors to families globally',
      tagline: 'Harvested with Local Pride, Shared with Global Love',
      primaryColor: '#059669', // Emerald
      secondaryColor: '#D97706', // Amber
      fonts: 'Inter, Outfit',
      toneOfVoice: 'Warm, Honest, Proudly Leonean',
      prohibitedTerminology: ['cheap', 'artificial', 'fake']
    };
  });

  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>(() => {
    const saved = localStorage.getItem('salonereach_social_connections');
    return saved ? JSON.parse(saved) : INITIAL_SOCIAL_CONNECTIONS;
  });

  // Static / Constants
  const influencerProfiles: InfluencerProfile[] = INITIAL_INFLUENCER_PROFILES;

  // --- DASHBOARD NAVIGATION STATES ---
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('salonereach_active_tab');
    return saved || 'overview';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- PERSISTENCE SYNCHRONIZERS ---
  useEffect(() => {
    localStorage.setItem('salonereach_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('salonereach_active_org', JSON.stringify(activeOrg));
  }, [activeOrg]);

  useEffect(() => {
    localStorage.setItem('salonereach_campaigns', JSON.stringify(campaigns));
  }, [campaigns]);

  useEffect(() => {
    localStorage.setItem('salonereach_content_items', JSON.stringify(contentItems));
  }, [contentItems]);

  useEffect(() => {
    localStorage.setItem('salonereach_leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('salonereach_directory_profiles', JSON.stringify(directoryProfiles));
  }, [directoryProfiles]);

  useEffect(() => {
    localStorage.setItem('salonereach_brand_kit', JSON.stringify(brandKit));
  }, [brandKit]);

  useEffect(() => {
    localStorage.setItem('salonereach_social_connections', JSON.stringify(socialConnections));
  }, [socialConnections]);

  useEffect(() => {
    localStorage.setItem('salonereach_active_tab', activeTab);
  }, [activeTab]);

  // --- HANDLERS ---
  const handleAuthSuccess = (org?: Organization) => {
    if (org) {
      setActiveOrg(org);
    }
    setView('dashboard');
  };

  const handleLogout = () => {
    setView('landing');
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
        onSuccess={handleAuthSuccess}
      />
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
            {NAV_GROUPS.map((group, gIdx) => {
              // Calculate index starts for neat numbering
              let prevCount = 0;
              for (let i = 0; i < gIdx; i++) {
                prevCount += NAV_GROUPS[i].items.length;
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
            onClick={handleLogout}
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
            <span className="bg-[#0F172A] text-white text-[10px] font-mono font-bold px-2.5 py-1 uppercase tracking-wider">
              {activeOrg.type}
            </span>
          </div>
        </header>

        {/* Active Tab Screen Mounting Area */}
        <main className="p-6 md:p-8 flex-1 bg-[#F8FAFC]">
          <Workspaces
            activeTab={activeTab}
            activeOrg={activeOrg}
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
            setBrandKit={setBrandKit}
          />
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
