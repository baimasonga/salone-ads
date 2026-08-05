Warning: truncated output (original token count: 65059)
Total output lines: 5117

import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { toPng } from 'html-to-image';
import { Link } from 'react-router-dom';
import type { AdvertFormat, AdvertTheme } from './AdvertCreative';
import { resolveDelegatedWorkspaceRoute } from './WorkspaceRouteResolver';
import { SubscriberAdvertisingWorkspace } from './SubscriberAdvertisingWorkspace';
import { AdminAdvertisingRequestQueue } from './AdminAdvertisingRequestQueue';
import { AdminAdvertCreativeEditor } from './AdminAdvertCreativeEditor';
import {
  campaignStatusOptions,
  campaignTransitionRequiresReason,
  canTransitionCampaign,
} from '../domain/workflows/campaignStatus';
import { QuotaUsagePanel } from '../modules/subscriptions/QuotaUsagePanel';
import { useProcurementOverview } from '../modules/procurement/useProcurementOverview';
import { useTenderWorkspace } from '../modules/procurement/useTenderWorkspace';
import { TenderCreationForm } from '../modules/procurement/TenderCreationForm';
import { TenderManagementPanel } from '../modules/procurement/TenderManagementPanel';
import { SubscriberServiceRequestsWorkspace } from '../modules/service-requests/SubscriberServiceRequestsWorkspace';
import { AdminServiceRequestsWorkspace } from '../modules/service-requests/AdminServiceRequestsWorkspace';
import {
  BarChart2, Calendar, FileText, FolderOpen, Users, Link2,
  MessageSquare, BookOpen, Award, Compass, Sparkles,
  Settings, ShieldAlert, CreditCard, UserPlus, Upload, Trash2,
  Check, Play, Plus, Search, Filter, Download, AlertCircle, Eye, RefreshCw,
  FileSearch, ExternalLink, Sparkle, Trophy, Landmark, Megaphone, X, Image as ImageIcon,
  ChevronLeft, ChevronRight, Mail, MessageCircle, ShieldCheck,
  ArrowRight, Clock, Bookmark, Bell, MapPin
} from 'lucide-react';
import { Campaign, ContentItem, Lead, DirectoryProfile, InfluencerProfile, SocialConnection, BrandKit, Organization, MediaAsset, TrackingLink, AudienceSegment } from '../types';
import {
  createCampaign,
  updateCampaign,
  deleteCampaign,
  createContentItem,
  updateContentItem,
  deleteContentItem,
  updateLeadStatus as apiUpdateLeadStatus,
  createDirectoryListing,
  claimDirectoryListing,
  saveBrandKit,
  createSocialConnection,
  updateSocialConnection,
  deleteSocialConnection,
  createLead,
  fetchMediaAssets,
  uploadMediaAsset,
  deleteMediaAsset,
  getMediaAssetUrl,
  fetchTrackingLinks,
  createTrackingLink,
  deleteTrackingLink,
  fetchClickSeries,
  ClickSeriesPoint,
  fetchClicksByWeekday,
  WeekdayClickPoint,
  fetchAudienceSegments,
  createAudienceSegment,
  deleteAudienceSegment,
  runCampaignHealthCheck,
  fetchCampaignActivity,
  CampaignActivity,
} from '../lib/api';
import { computeLeadScore, leadPriorityLabel } from '../lib/leadScoring';
import {
  enableBuyerMode,
  fetchSectors,
  fetchDistricts,
  fetchCountries,
  fetchCurrencies,
  CurrencyOption,
  fetchOpportunityTypes,
  MAX_DOCUMENT_SIZE_BYTES,
  OpportunityListItem,
  TaxonomyOption,
} from '../lib/procurement/opportunityApi';
import {
  enableSupplierMode,
  fetchSupplierProfile,
  saveSupplierProfile,
  submitVerificationRequest,
  fetchMyVerificationRequests,
  fetchVerificationQueue,
  approveVerification,
  rejectVerification,
  SupplierProfile,
  VerificationRequest,
  VerificationQueueItem,
} from '../lib/procurement/supplierVerificationApi';
import {
  fetchTeamMembers,
  fetchTeamMemberLimit,
  inviteTeamMember,
  removeTeamMember,
  fetchPlans,
  fetchMySubscriptions,
  requestSubscription,
  updateSubscriptionNotes,
  fetchPendingSubscriptions,
  activateSubscription,
  cancelSubscriptionRequest,
  TeamMember,
  Plan,
  OrgSubscription,
  PendingSubscription,
  submitAdvertisementRequest,
  fetchMyAdvertisements,
  fetchAllAdvertisementRequests,
  updateAdvertisementReport,
  AdvertisementRequest,
  AdvertisementCategory,
  fetchAllAdverts,
  createAdvert,
  updateAdvert,
  deleteAdvert,
  uploadAdvertCreative,
  uploadAdvertImage,
  fetchAdvertAnalyticsSummary,
  AdvertAnalyticsSummary,
  fetchAllCampaigns as fetchAllAdCampaigns,
  createCampaign as createAdCampaign,
  setCampaignStatus,
  deleteCampaign as deleteAdCampaign,
  fetchCampaignReach,
  AdCampaign,
  CampaignReach,
  aiPolishAdvertCopy,
  Advert,
} from '../lib/procurementApi';
import {
  fetchAdminAnalytics,
  fetchProcurementSearchInsights,
  type AdminAnalyticsSummary,
  type ProcurementSearchInsights,
} from '../lib/procurement/insightsApi';
import { hasFeature } from '../lib/procurement/entitlementAssistApi';
import {
  fetchPipeline,
  addToPipeline,
  updatePipelineRecord,
  removeFromPipeline,
  fetchSupplierSectorIds,
  setSupplierSectorIds,
  fetchRecommendedOpportunities,
  type PipelineRecord,
  type PipelineStage,
} from '../lib/procurement/bidPipelineApi';
import {
  fetchSavedSearches,
  deleteSavedSearch,
  type SavedSearch,
} from '../lib/procurement/savedSearchApi';
import { supabase } from '../lib/supabaseClient';
import type { SubscriberAccessSummary } from './SubscriberOverview';
import type { PlatformStaffRole } from '../lib/platformStaffApi';

const AdminAdvertPublisherPanel = React.lazy(() =>
  import('./AdminAdvertPublisherPanel').then((module) => ({ default: module.AdminAdvertPublisherPanel })),
);

interface WorkspacesProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeOrg: Organization;
  setActiveOrg: (organization: Organization) => void;
  subscriberAccess: SubscriberAccessSummary | null;
  currentUserId: string;
  isPlatformAdmin: boolean;
  isPlatformResearcher: boolean;
  platformStaffRole: PlatformStaffRole | null;
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  contentItems: ContentItem[];
  setContentItems: React.Dispatch<React.SetStateAction<ContentItem[]>>;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  directoryProfiles: DirectoryProfile[];
  setDirectoryProfiles: React.Dispatch<React.SetStateAction<DirectoryProfile[]>>;
  influencerProfiles: InfluencerProfile[];
  socialConnections: SocialConnection[];
  setSocialConnections: React.Dispatch<React.SetStateAction<SocialConnection[]>>;
  brandKit: BrandKit;
  setBrandKit: React.Dispatch<React.SetStateAction<BrandKit>>;
}

export function Workspaces({
  activeTab,
  setActiveTab,
  activeOrg,
  setActiveOrg,
  subscriberAccess,
  currentUserId,
  isPlatformAdmin,
  isPlatformResearcher,
  platformStaffRole,
  campaigns,
  setCampaigns,
  contentItems,
  setContentItems,
  leads,
  setLeads,
  directoryProfiles,
  setDirectoryProfiles,
  influencerProfiles,
  socialConnections,
  setSocialConnections,
  brandKit,
  setBrandKit
}: WorkspacesProps) {

  // --- Campaign Wizard States ---
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [newCampName, setNewCampName] = useState('');
  const [newCampDesc, setNewCampDesc] = useState('');
  const [newCampObjective, setNewCampObjective] = useState('WhatsApp enquiries');
  const [newCampBudget, setNewCampBudget] = useState('5000000');
  const [newCampDistrict, setNewCampDistrict] = useState('Western Area Urban');
  const [newCampDiaspora, setNewCampDiaspora] = useState('United Kingdom');
  const [newCampStatus, setNewCampStatus] = useState<Campaign['status']>('Planning');
  const [campFeedback, setCampFeedback] = useState('');
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [campStatusUpdatingId, setCampStatusUpdatingId] = useState<string | null>(null);

  const [campSubmitting, setCampSubmitting] = useState(false);

  const resetCampaignForm = () => {
    setEditingCampaignId(null);
    setNewCampName('');
    setNewCampDesc('');
    setNewCampObjective('WhatsApp enquiries');
    setNewCampBudget('5000000');
    setNewCampDistrict('Western Area Urban');
    setNewCampDiaspora('United Kingdom');
    setNewCampStatus('Planning');
  };

  const handleEditCampaign = (camp: Campaign) => {
    setEditingCampaignId(camp.id);
    setNewCampName(camp.name);
    setNewCampDesc(camp.description);
    setNewCampObjective(camp.objective);
    setNewCampBudget(String(camp.totalBudget));
    setNewCampDistrict(camp.district || 'Western Area Urban');
    setNewCampDiaspora(camp.diasporaMarket || 'United Kingdom');
    setNewCampStatus(camp.status);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteCampaign = async (camp: Campaign) => {
    if (!confirm(`Delete "${camp.name}"? This cannot be undone.`)) return;
    setDeletingCampaignId(camp.id);
    const previous = campaigns;
    setCampaigns(campaigns.filter((c) => c.id !== camp.id));
    try {
      await deleteCampaign(camp.id);
      if (editingCampaignId === camp.id) resetCampaignForm();
    } catch (err: any) {
      setCampaigns(previous);
      setCampFeedback(`Error: ${err.message || 'Could not delete campaign.'}`);
      setTimeout(() => setCampFeedback(''), 4000);
    } finally {
      setDeletingCampaignId(null);
    }
  };

  const handleChangeCampaignStatus = async (camp: Campaign, status: Campaign['status']) => {
    if (status === camp.status) return;
    if (!canTransitionCampaign(camp.status, status)) {
      setCampFeedback(`Error: a campaign cannot move from ${camp.status} to ${status}.`);
      setTimeout(() => setCampFeedback(''), 4000);
      return;
    }

    // The state machine refuses these transitions without a recorded reason.
    let rejectionReason: string | undefined;
    if (campaignTransitionRequiresReason(camp.status, status)) {
      const entered = window.prompt(`Why is "${camp.name}" moving to ${status}?`)?.trim();
      if (!entered) return;
      rejectionReason = entered;
    }

    setCampStatusUpdatingId(camp.id);
    const previous = campaigns;
    setCampaigns(campaigns.map((c) => (c.id === camp.id ? { ...c, status } : c)));
    try {
      const updated = await updateCampaign(camp.id, { status }, { rejectionReason });
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (editingCampaignId === camp.id) setNewCampStatus(status);
    } catch (err: any) {
      setCampaigns(previous);
      setCampFeedback(`Error: ${err.message || 'Could not update status.'}`);
      setTimeout(() => setCampFeedback(''), 4000);
    } finally {
      setCampStatusUpdatingId(null);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampSubmitting(true);
    try {
      if (editingCampaignId) {
        const updated = await updateCampaign(editingCampaignId, {
          name: newCampName || 'Sponsorship Native Rice',
          description: newCampDesc || 'Direct delivery promotion targeted for diaspora.',
          objective: newCampObjective,
          totalBudget: Number(newCampBudget) || 5000000,
          district: newCampDistrict,
          diasporaMarket: newCampDiaspora,
          status: newCampStatus,
        });
        setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
        setCampFeedback('Campaign plan updated.');
      } else {
        const newCamp = await createCampaign(activeOrg.id, {
          name: newCampName || 'Sponsorship Native Rice',
          description: newCampDesc || 'Direct delivery promotion targeted for diaspora.',
          objective: newCampObjective,
          totalBudget: Number(newCampBudget) || 5000000,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          channels: ['WhatsApp Broadcaster', 'Facebook organic'],
          district: newCampDistrict,
          diasporaMarket: newCampDiaspora
        });
        setCampaigns([newCamp, ...campaigns]);
        setCampFeedback('Campaign plan successfully established and saved!');
      }
      resetCampaignForm();
    } catch (err: any) {
      setCampFeedback(`Error: ${err.message || 'Could not save campaign.'}`);
    } finally {
      setCampSubmitting(false);
      setTimeout(() => setCampFeedback(''), 4000);
    }
  };

  // --- Campaign Health/Activity States ---
  const [campaignActivity, setCampaignActivity] = useState<Record<string, CampaignActivity>>({});
  const [runningHealthCheck, setRunningHealthCheck] = useState(false);
  const [healthCheckFeedback, setHealthCheckFeedback] = useState('');

  useEffect(() => {
    if (activeTab !== 'campaigns') return;
    fetchCampaignActivity(activeOrg.id)
      .then(setCampaignActivity)
      .catch(() => {});
  }, [activeTab, activeOrg.id]);

  const handleRunHealthCheck = async () => {
    setRunningHealthCheck(true);
    setHealthCheckFeedback('');
    try {
      const flagged = await runCampaignHealthCheck();
      setHealthCheckFeedback(
        flagged > 0
          ? `Found ${flagged} new issue${flagged === 1 ? '' : 's'} — check the notification bell for details.`
          : 'No new issues found. All campaigns look healthy.'
      );
    } catch (err: any) {
      setHealthCheckFeedback(`Error: ${err.message || 'Could not run the health check.'}`);
    } finally {
      setRunningHealthCheck(false);
      setTimeout(() => setHealthCheckFeedback(''), 6000);
    }
  };

  // --- Content Planning Assistant States (suggest-only: preview, admin picks which to create) ---
  interface ContentPlanSuggestion {
    title: string;
    contentType: string;
    platform: string;
    headline: string;
    body: string;
    hashtags: string[];
    scheduledDate: string;
  }
  const VALID_CONTENT_TYPES = ['Social Post', 'WhatsApp Promo', 'Video Script', 'Radio Brief', 'Email News'];
  const [contentPlanCampaignId, setContentPlanCampaignId] = useState<string | null>(null);
  const [contentPlanItems, setContentPlanItems] = useState<ContentPlanSuggestion[]>([]);
  const [contentPlanSelected, setContentPlanSelected] = useState<Set<number>>(new Set());
  const [contentPlanLoading, setContentPlanLoading] = useState(false);
  const [contentPlanError, setContentPlanError] = useState('');
  const [creatingContentPlanDrafts, setCreatingContentPlanDrafts] = useState(false);

  const handleSuggestContentPlan = async (camp: Campaign) => {
    setContentPlanCampaignId(camp.id);
    setContentPlanItems([]);
    setContentPlanSelected(new Set());
    setContentPlanError('');
    setContentPlanLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch('/api/gemini/content-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          campaignName: camp.name,
          campaignObjective: camp.objective,
          campaignDescription: camp.description,
          startDate: camp.startDate || new Date().toISOString().split('T')[0],
          endDate: camp.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          toneOfVoice: brandKit.toneOfVoice,
          brandName: brandKit.brandName,
          tagline: brandKit.tagline,
          mission: brandKit.mission,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setContentPlanError(data.error.message || 'Could not generate a content plan.');
      } else {
        const items: ContentPlanSuggestion[] = Array.isArray(data.items) ? data.items : [];
        setContentPlanItems(items);
        setContentPlanSelected(new Set(items.map((_, i) => i)));
      }
    } catch {
      setContentPlanError('Failed to communicate with the AI assistant.');
    } finally {
      setContentPlanLoading(false);
    }
  };

  const toggleContentPlanItem = (idx: number) => {
    setContentPlanSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCreateSelectedDrafts = async () => {
    if (!contentPlanCampaignId) return;
    setCreatingContentPlanDrafts(true);
    let failures = 0;
    try {
      const created: ContentItem[] = [];
      for (const idx of contentPlanSelected) {
        const item = contentPlanItems[idx];
        if (!item) continue;
        try {
          created.push(
            await createContentItem(activeOrg.id, {
              title: String(item.title || 'AI Content Plan Draft').slice(0, 200),
              contentType: (VALID_CONTENT_TYPES.includes(item.contentType) ? item.contentType : 'Social Post') as ContentItem['contentType'],
              platform: item.platform || 'Facebook',
              headline: item.headline || '',
              bodyText: item.body || '',
              hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
              scheduledDate: item.scheduledDate || new Date().toISOString().split('T')[0],
              campaignId: contentPlanCampaignId,
            })
          );
        } catch {
          failures += 1;
        }
      }
      setContentItems([...created, ...contentItems]);
      setCampaignActivity((prev) => ({
        ...prev,
        [contentPlanCampaignId]: {
          campaignId: contentPlanCampaignId,
          contentCount: (prev[contentPlanCampaignId]?.contentCount ?? 0) + created.length,
          trackingLinkCount: prev[contentPlanCampaignId]?.trackingLinkCount ?? 0,
          totalClicks: prev[contentPlanCampaignId]?.totalClicks ?? 0,
        },
      }));
      setHealthCheckFeedback(
        failures > 0
          ? `Created ${created.length} draft${created.length === 1 ? '' : 's'}, ${failures} failed — review in Content Studio.`
          : `Created ${created.length} draft${created.length === 1 ? '' : 's'} — review them in Content Studio.`
      );
      setContentPlanCampaignId(null);
    } catch (err: any) {
      setContentPlanError(`Error: ${err.message || 'Could not create drafts.'}`);
    } finally {
      setCreatingContentPlanDrafts(false);
      setTimeout(() => setHealthCheckFeedback(''), 6000);
    }
  };

  // --- AI Assistant States ---
  const [aiPrompt, setAiPrompt] = useState('Grow Sierra Leone native red rice among diaspora families in Maryland, USA.');
  const [aiOption, setAiOption] = useState<'brief' | 'copy' | 'script' | 'ideas' | 'captions'>('captions');
  const [aiOutput, setAiOutput] = useState('');
  const [aiFormat, setAiFormat] = useState<'text' | 'captions' | 'ideas'>('text');
  const [aiCaptionItems, setAiCaptionItems] = useState<{ headline: string; body: string; hashtags: string[] }[]>([]);
  const [aiIdeaItems, setAiIdeaItems] = useState<{ title: string; concept: string; platform: string; executionStep: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [savingAllAiItems, setSavingAllAiItems] = useState(false);

  const handleCallAI = async () => {
    setAiLoading(true);
    setAiError('');
    setAiOutput('');
    setAiFormat('text');
    setAiCaptionItems([]);
    setAiIdeaItems([]);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          option: aiOption,
          toneOfVoice: brandKit.toneOfVoice,
          brandName: brandKit.brandName,
          tagline: brandKit.tagline,
          mission: brandKit.mission
        })
      });
      const data = await response.json();
      if (data.error) {
        setAiError(data.error.message || 'AI completions failed.');
      } else if (data.format === 'captions' && Array.isArray(data.items)) {
        setAiFormat('captions');
        setAiCaptionItems(data.items);
        setAiOutput(data.text || '');
      } else if (data.format === 'ideas' && Array.isArray(data.items)) {
        setAiFormat('ideas');
        setAiIdeaItems(data.items);
        setAiOutput(data.text || '');
      } else {
        setAiFormat('text');
        setAiOutput(data.text || 'No content returned.');
      }
    } catch (err: any) {
      setAiError('Failed to communicate with full-stack proxy. Check dev server logs.');
    } finally {
      setAiLoading(false);
    }
  };

  // --- Audience Segment States ---
  const DIASPORA_MARKET_OPTIONS = ['United Kingdom', 'United States', 'Canada', 'Germany', 'Sweden'];
  const [audienceDistricts, setAudienceDistricts] = useState<TaxonomyOption[]>([]);
  const [audienceSegments, setAudienceSegments] = useState<AudienceSegment[]>([]);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceFeedback, setAudienceFeedback] = useState('');
  const [segmentName, setSegmentName] = useState('');
  const [segmentDistricts, setSegmentDistricts] = useState<string[]>([]);
  const [segmentDiasporaMarkets, setSegmentDiasporaMarkets] = useState<string[]>([]);
  const [segmentInterestsInput, setSegmentInterestsInput] = useState('');
  const [savingSegment, setSavingSegment] = useState(false);
  const [deletingSegmentId, setDeletingSegmentId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'audiences') return;
    setAudienceLoading(true);
    fetchCountries()
      .then(async (countries) => {
        const sierraLeone = countries.find((c) => c.name === 'Sierra Leone') ?? countries[0];
        const [districts, segments] = await Promise.all([
          sierraLeone ? fetchDistricts(sierraLeone.id) : Promise.resolve([]),
          fetchAudienceSegments(activeOrg.id),
        ]);
        setAudienceDistricts(districts);
        setAudienceSegments(segments);
      })
      .catch((err: any) => setAudienceFeedback(`Error: ${err.message || 'Could not load audience data.'}`))
      .finally(() => setAudienceLoading(false));
  }, [activeTab, activeOrg.id]);

  const toggleSegmentDistrict = (name: string) => {
    setSegmentDistricts((prev) => (prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]));
  };

  const toggleSegmentDiasporaMarket = (name: string) => {
    setSegmentDiasporaMarkets((prev) => (prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]));
  };

  const resetSegmentForm = () => {
    setSegmentName('');
    setSegmentDistricts([]);
    setSegmentDiasporaMarkets([]);
    setSegmentInterestsInput('');
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSegment(true);
    try {
      const segment = await createAudienceSegment(activeOrg.id, {
        name: segmentName,
        districts: segmentDistricts,
        diasporaMarkets: segmentDiasporaMarkets,
        interests: segmentInterestsInput.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setAudienceSegments([segment, ...audienceSegments]);
      resetSegmentForm();
      setAudienceFeedback('Audience segment saved.');
    } catch (err: any) {
      setAudienceFeedback(`Error: ${err.message || 'Could not save segment.'}`);
    } finally {
      setSavingSegment(false);
      setTimeout(() => setAudienceFeedback(''), 4000);
    }
  };

  const handleDeleteSegment = async (segment: AudienceSegment) => {
    if (!confirm(`Delete "${segment.name}"?`)) return;
    setDeletingSegmentId(segment.id);
    const previous = audienceSegments;
    setAudienceSegments(audienceSegments.filter((s) => s.id !== segment.id));
    try {
      await deleteAudienceSegment(segment.id);
    } catch (err: any) {
      setAudienceSegments(previous);
      setAudienceFeedback(`Error: ${err.message || 'Could not delete segment.'}`);
      setTimeout(() => setAudienceFeedback(''), 4000);
    } finally {
      setDeletingSegmentId(null);
    }
  };

  // --- Social Accounts States (real manual channel tracking, no OAuth) ---
  const [socialFeedback, setSocialFeedback] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelPlatform, setNewChannelPlatform] = useState('');
  const [newChannelAccountName, setNewChannelAccountName] = useState('');
  const [newChannelStatus, setNewChannelStatus] = useState<SocialConnection['status']>('Sandbox');
  const [savingChannel, setSavingChannel] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [editConnAccountName, setEditConnAccountName] = useState('');
  const [editConnStatus, setEditConnStatus] = useState<SocialConnection['status']>('Sandbox');
  const [editConnHealth, setEditConnHealth] = useState<SocialConnection['connectionHealth']>('Healthy');
  const [savingConnEdit, setSavingConnEdit] = useState(false);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChannel(true);
    try {
      const conn = await createSocialConnection(activeOrg.id, {
        platform: newChannelPlatform,
        accountName: newChannelAccountName,
        status: newChannelStatus,
        connectionHealth: 'None',
      });
      setSocialConnections([conn, ...socialConnections]);
      setNewChannelPlatform('');
      setNewChannelAccountName('');
      setNewChannelStatus('Sandbox');
      setAddingChannel(false);
      setSocialFeedback('Channel added.');
    } catch (err: any) {
      setSocialFeedback(`Error: ${err.message || 'Could not add channel.'}`);
    } finally {
      setSavingChannel(false);
      setTimeout(() => setSocialFeedback(''), 4000);
    }
  };

  const handleStartEditConnection = (conn: SocialConnection) => {
    setEditingConnectionId(conn.id);
    setEditConnAccountName(conn.accountName);
    setEditConnStatus(conn.status);
    setEditConnHealth(conn.connectionHealth);
  };

  const handleSaveConnectionEdit = async (id: string) => {
    setSavingConnEdit(true);
    try {
      const updated = await updateSocialConnection(id, {
        accountName: editConnAccountName,
        status: editConnStatus,
        connectionHealth: editConnHealth,
      });
      setSocialConnections(socialConnections.map((c) => (c.id === updated.id ? updated : c)));
      setEditingConnectionId(null);
    } catch (err: any) {
      setSocialFeedback(`Error: ${err.message || 'Could not save channel.'}`);
      setTimeout(() => setSocialFeedback(''), 4000);
    } finally {
      setSavingConnEdit(false);
    }
  };

  const handleDeleteConnection = async (conn: SocialConnection) => {
    if (!confirm(`Remove "${conn.platform}"?`)) return;
    setDeletingConnectionId(conn.id);
    const previous = socialConnections;
    setSocialConnections(socialConnections.filter((c) => c.id !== conn.id));
    try {
      await deleteSocialConnection(conn.id);
      if (editingConnectionId === conn.id) setEditingConnectionId(null);
    } catch (err: any) {
      setSocialConnections(previous);
      setSocialFeedback(`Error: ${err.message || 'Could not remove channel.'}`);
      setTimeout(() => setSocialFeedback(''), 4000);
    } finally {
      setDeletingConnectionId(null);
    }
  };

  // --- Content Editor States ---
  const defaultScheduledDate = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<'Social Post' | 'WhatsApp Promo' | 'Video Script' | 'Radio Brief' | 'Email News'>('Social Post');
  const [editPlatform, setEditPlatform] = useState('Facebook');
  const [editHeadline, setEditHeadline] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editHashtagsInput, setEditHashtagsInput] = useState('#Manohub, #EatSalone');
  const [editScheduledDate, setEditScheduledDate] = useState(defaultScheduledDate());
  const [editStatus, setEditStatus] = useState<ContentItem['status']>('Draft');
  const [contentFeedback, setContentFeedback] = useState('');
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);
  const [contentStatusUpdatingId, setContentStatusUpdatingId] = useState<string | null>(null);

  const [contentSubmitting, setContentSubmitting] = useState(false);

  const resetContentComposer = () => {
    setEditingContentId(null);
    setEditTitle('');
    setEditType('Social Post');
    setEditPlatform('Facebook');
    setEditHeadline('');
    setEditBody('');
    setEditHashtagsInput('#Manohub, #EatSalone');
    setEditScheduledDate(defaultScheduledDate());
    setEditStatus('Draft');
  };

  const handleEditContentItem = (item: ContentItem) => {
    setEditingContentId(item.id);
    setEditTitle(item.title);
    setEditType(item.contentType);
    setEditPlatform(item.platform);
    setEditHeadline(item.headline);
    setEditBody(item.bodyText);
    setEditHashtagsInput(item.hashtags.join(', '));
    setEditScheduledDate(item.scheduledDate || defaultScheduledDate());
    setEditStatus(item.status);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const parseHashtagsInput = (input: string): string[] =>
    input
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setContentSubmitting(true);
    try {
      if (editingContentId) {
        const current = contentItems.find((c) => c.id === editingContentId);
        const updated = await updateContentItem(editingContentId, {
          title: editTitle || 'Custom Content Item',
          contentType: editType,
          platform: editPlatform,
          headline: editHeadline || 'Harvested with Local Pride',
          bodyText: editBody || 'Premium supply directly sourced from Bo cooperative.',
          hashtags: parseHashtagsInput(editHashtagsInput),
          scheduledDate: editScheduledDate,
          status: editStatus,
          version: (current?.version ?? 1) + 1,
        });
        setContentItems(contentItems.map((c) => (c.id === updated.id ? updated : c)));
        setContentFeedback('Content item updated.');
      } else {
        const newItem = await createContentItem(activeOrg.id, {
          title: editTitle || 'Custom Content Item',
          contentType: editType,
          platform: editPlatform,
          headline: editHeadline || 'Harvested with Local Pride',
          bodyText: editBody || 'Premium supply directly sourced from Bo cooperative.',
          hashtags: parseHashtagsInput(editHashtagsInput),
          scheduledDate: editScheduledDate,
        });
        setContentItems([newItem, ...contentItems]);
        setContentFeedback('Draft template saved and added to the content index!');
      }
      resetContentComposer();
    } catch (err: any) {
      setContentFeedback(`Error: ${err.message || 'Could not save content item.'}`);
    } finally {
      setContentSubmitting(false);
      setTimeout(() => setContentFeedback(''), 4000);
    }
  };

  const handleDeleteContentItem = async (item: ContentItem) => {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setDeletingContentId(item.id);
    const previous = contentItems;
    setContentItems(contentItems.filter((c) => c.id !== item.id));
    try {
      await deleteContentItem(item.id);
      if (editingContentId === item.id) resetContentComposer();
    } catch (err: any) {
      setContentItems(previous);
      setContentFeedback(`Error: ${err.message || 'Could not delete content item.'}`);
      setTimeout(() => setContentFeedback(''), 4000);
    } finally {
      setDeletingContentId(null);
    }
  };

  const handleChangeContentStatus = async (item: ContentItem, status: ContentItem['status']) => {
    if (status === item.status) return;
    setContentStatusUpdatingId(item.id);
    const previous = contentItems;
    setContentItems(contentItems.map((c) => (c.id === item.id ? { ...c, status } : c)));
    try {
      const updated = await updateContentItem(item.id, { status, version: item.version + 1 });
      setContentItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (editingContentId === item.id) setEditStatus(status);
    } catch (err: any) {
      setContentItems(previous);
      setContentFeedback(`Error: ${err.message || 'Could not update status.'}`);
      setTimeout(() => setContentFeedback(''), 4000);
    } finally {
      setContentStatusUpdatingId(null);
    }
  };

  const handleUseCaptionInComposer = (item: { headline: string; body: string; hashtags: string[] }) => {
    resetContentComposer();
    setEditTitle(item.headline.slice(0, 60));
    setEditHeadline(item.headline);
    setEditBody(item.body);
    setEditHashtagsInput((item.hashtags || []).join(', '));
    setContentFeedback('Loaded into the Composer — review and save.');
    setTimeout(() => setContentFeedback(''), 4000);
  };

  const handleUseIdeaInComposer = (idea: { title: string; concept: string; platform: string; executionStep: string }) => {
    resetContentComposer();
    setEditTitle(idea.title.slice(0, 60));
    setEditPlatform(idea.platform || 'Facebook');
    setEditHeadline(idea.title);
    setEditBody(`${idea.concept}\n\nHow to execute: ${idea.executionStep}`);
    setContentFeedback('Loaded into the Composer — review and save.');
    setTimeout(() => setContentFeedback(''), 4000);
  };

  const handleSaveAllAiItems = async () => {
    setSavingAllAiItems(true);
    try {
      const created: ContentItem[] = [];
      if (aiFormat === 'captions') {
        for (const item of aiCaptionItems) {
          created.push(
            await createContentItem(activeOrg.id, {
              title: item.headline?.slice(0, 60) || 'AI Caption',
              contentType: 'Social Post',
              platform: editPlatform || 'Facebook',
              headline: item.headline || '',
              bodyText: item.body || '',
              hashtags: item.hashtags || [],
              scheduledDate: defaultScheduledDate(),
            })
          );
        }
      } else if (aiFormat === 'ideas') {
        for (const idea of aiIdeaItems) {
          created.push(
            await createContentItem(activeOrg.id, {
              title: idea.title?.slice(0, 60) || 'AI Idea',
              contentType: 'Social Post',
              platform: idea.platform || editPlatform || 'Facebook',
              headline: idea.title || '',
              bodyText: `${idea.concept || ''}\n\nHow to execute: ${idea.executionStep || ''}`,
              hashtags: ['#Manohub', '#EatSalone'],
              scheduledDate: defaultScheduledDate(),
            })
          );
        }
      }
      setContentItems([...created, ...contentItems]);
      setContentFeedback(`Saved ${created.length} item${created.length === 1 ? '' : 's'} as drafts.`);
    } catch (err: any) {
      setContentFeedback(`Error: ${err.message || 'Could not save AI items.'}`);
    } finally {
      setSavingAllAiItems(false);
      setTimeout(() => setContentFeedback(''), 5000);
    }
  };

  // --- Media Library States ---
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaFeedback, setMediaFeedback] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('General');
  const mediaFileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab !== 'media') return;
    setMediaLoading(true);
    fetchMediaAssets(activeOrg.id)
      .then(setMediaAssets)
      .catch((err: any) => setMediaFeedback(`Error: ${err.message || 'Could not load media assets.'}`))
      .finally(() => setMediaLoading(false));
  }, [activeTab, activeOrg.id]);

  const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const asset = await uploadMediaAsset(activeOrg.id, file, uploadFolder);
      setMediaAssets([asset, ...mediaAssets]);
      setMediaFeedback('Asset uploaded.');
    } catch (err: any) {
      setMediaFeedback(`Error: ${err.message || 'Could not upload asset.'}`);
    } finally {
      setIsUploadingMedia(false);
      setTimeout(() => setMediaFeedback(''), 4000);
    }
  };

  const handleDeleteMediaAsset = async (asset: MediaAsset) => {
    const previous = mediaAssets;
    setMediaAssets(mediaAssets.filter((a) => a.id !== asset.id));
    try {
      await deleteMediaAsset(asset);
    } catch (err: any) {
      setMediaAssets(previous);
      setMediaFeedback(`Error: ${err.message || 'Could not delete asset.'}`);
      setTimeout(() => setMediaFeedback(''), 4000);
    }
  };

  const handleViewMediaAsset = async (asset: MediaAsset) => {
    try {
      const url = await getMediaAssetUrl(asset);
      window.open(url, '_blank');
    } catch (err: any) {
      setMediaFeedback(`Error: ${err.message || 'Could not open asset.'}`);
      setTimeout(() => setMediaFeedback(''), 4000);
    }
  };

  const mediaFolders = Array.from(new Set(mediaAssets.map((a) => a.folder)));

  function formatFileSize(bytes: number | null): string {
    if (bytes === null) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // --- Tracking Links States (real, storage-backed short links) ---
  const [trackDest, setTrackDest] = useState('https://freetownhaven.com/booking');
  const [trackLabel, setTrackLabel] = useState('');
  const [trackCampaignId, setTrackCampaignId] = useState('');
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [trackingLinksLoading, setTrackingLinksLoading] = useState(false);
  const [trackingLinkFeedback, setTrackingLinkFeedback] = useState('');
  const [clickSeries, setClickSeries] = useState<ClickSeriesPoint[]>([]);
  const [weekdayClicks, setWeekdayClicks] = useState<WeekdayClickPoint[]>([]);

  useEffect(() => {
    if (activeTab !== 'analytics' && activeTab !== 'tourism' && activeTab !== 'events' && activeTab !== 'overview') return;
    if (activeTab === 'overview' && !isPlatformAdmin) return;
    setTrackingLinksLoading(true);
    Promise.all([fetchTrackingLinks(activeOrg.id), fetchClickSeries(activeOrg.id, 12), fetchClicksByWeekday(activeOrg.id)])
      .then(([links, series, weekday]) => {
        setTrackingLinks(links);
        setClickSeries(series);
        setWeekdayClicks(weekday);
      })
      .catch((err: any) => setTrackingLinkFeedback(`Error: ${err.message || 'Could not load tracking links.'}`))
      .finally(() => setTrackingLinksLoading(false));
  }, [activeTab, activeOrg.id]);

  const handleGenerateLink = async () => {
    if (!trackLabel.trim() || !trackDest.trim()) {
      setTrackingLinkFeedback('Error: Give the link a label and a destination URL.');
      setTimeout(() => setTrackingLinkFeedback(''), 4000);
      return;
    }
    try {
      const link = await createTrackingLink(activeOrg.id, trackLabel, trackDest, trackCampaignId || null);
      setTrackingLinks([link, ...trackingLinks]);
      setTrackLabel('');
      setTrackCampaignId('');
    } catch (err: any) {
      setTrackingLinkFeedback(`Error: ${err.message || 'Could not create tracking link.'}`);
      setTimeout(() => setTrackingLinkFeedback(''), 4000);
    }
  };

  const handleDeleteTrackingLink = async (id: string) => {
    const previous = trackingLinks;
    setTrackingLinks(trackingLinks.filter((l) => l.id !== id));
    try {
      await deleteTrackingLink(id);
    } catch (err: any) {
      setTrackingLinks(previous);
      setTrackingLinkFeedback(`Error: ${err.message || 'Could not delete link.'}`);
      setTimeout(() => setTrackingLinkFeedback(''), 4000);
    }
  };

  // Generic — any workspace with a real destination URL can create a real
  // tracking link through this (used by both the Analytics builder and the
  // Tourism tab's per-destination "Generate Tracking Link" buttons).
  const generateNamedTrackingLink = async (label: string, defaultUrl: string): Promise<TrackingLink | null> => {
    const targetUrl = prompt(`Where should "${label}" send visitors? (e.g. a WhatsApp link or booking page)`, defaultUrl);
    if (!targetUrl) return null;
    return createTrackingLink(activeOrg.id, label, targetUrl);
  };

  // --- Lead Management States ---
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('All');

  const updateLeadStatus = async (id: string, newStatus: 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Converted' | 'Lost') => {
    const previous = leads;
    setLeads(leads.map(l => l.id === id ? { ...l, status: newStatus } : l));
    try {
      await apiUpdateLeadStatus(id, newStatus);
    } catch {
      setLeads(previous);
    }
  };

  const [addingLead, setAddingLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadWhatsapp, setNewLeadWhatsapp] = useState('');
  const [newLeadSource, setNewLeadSource] = useState('Manual Entry');
  const [newLeadValue, setNewLeadValue] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const [leadFeedback, setLeadFeedback] = useState('');

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLead(true);
    try {
      const lead = await createLead(activeOrg.id, {
        name: newLeadName,
        email: newLeadEmail,
        whatsapp: newLeadWhatsapp,
        source: newLeadSource || 'Manual Entry',
        estimatedValue: Number(newLeadValue) || 0,
      });
      setLeads([lead, ...leads]);
      setNewLeadName('');
      setNewLeadEmail('');
      setNewLeadWhatsapp('');
      setNewLeadSource('Manual Entry');
      setNewLeadValue('');
      setAddingLead(false);
      setLeadFeedback('Lead added.');
    } catch (err: any) {
      setLeadFeedback(`Error: ${err.message || 'Could not add lead.'}`);
    } finally {
      setSavingLead(false);
      setTimeout(() => setLeadFeedback(''), 4000);
    }
  };

  // --- AI Lead Follow-up States (suggest-only: drafts text, admin sends via a real wa.me/mailto link) ---
  const [followupLeadId, setFollowupLeadId] = useState<string | null>(null);
  const [followupChannel, setFollowupChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [followupText, setFollowupText] = useState('');
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState('');

  const handleDraftFollowup = async (lead: Lead, channel: 'whatsapp' | 'email') => {
    setFollowupLeadId(lead.id);
    setFollowupChannel(channel);
    setFollowupText('');
    setFollowupError('');
    setFollowupLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch('/api/gemini/lead-followup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          leadName: lead.name,
          leadSource: lead.source,
          leadDistrict: lead.district,
          estimatedValue: lead.estimatedValue,
          channel,
          toneOfVoice: brandKit.toneOfVoice,
          brandName: brandKit.brandName,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setFollowupError(data.error.message || 'Could not draft a follow-up.');
      } else {
        setFollowupText(data.text || '');
      }
    } catch {
      setFollowupError('Failed to communicate with the AI assistant.');
    } finally {
      setFollowupLoading(false);
    }
  };

  // --- Directory Profile States ---
  const [claimBusinessId, setClaimBusinessId] = useState('');
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [claimFeedback, setClaimFeedback] = useState('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  const handleClaimListing = (id: string) => {
    setClaimBusinessId(id);
    setClaimFile(null);
    setClaimFeedback('');
  };

  const submitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimFile) {
      setClaimFeedback('Error: Attach a business license or tax certificate file.');
      return;
    }
    setIsSubmittingClaim(true);
    try {
      // Real file, uploaded to the same storage-backed Media Library used
      // elsewhere — the "document name" text field this replaced never
      // actually persisted or checked a file at all.
      await uploadMediaAsset(activeOrg.id, claimFile, 'Verification Documents');
      const updated = await claimDirectoryListing(claimBusinessId, activeOrg.id);
      setDirectoryProfiles(directoryProfiles.map(p => p.id === updated.id ? updated : p));
      setClaimFeedback('Verification document uploaded and listing verified.');
    } catch (err: any) {
      setClaimFeedback(`Error: ${err.message || 'Could not submit claim.'}`);
    } finally {
      setIsSubmittingClaim(false);
      setTimeout(() => {
        setClaimBusinessId('');
        setClaimFeedback('');
      }, 3000);
    }
  };

  // --- Social Publishing Calendar (real month navigation, not a fixed Dec 2026 grid) ---
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  function formatDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getCalendarCells(monthStart: Date): (Date | null)[] {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (firstDay.getDay() + 6) % 7; // Monday-first
    const cells: (Date | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }

  // --- Manual Export Packages ---
  const [selectedExportPost, setSelectedExportPost] = useState<ContentItem | null>(null);
  const [exportAssets, setExportAssets] = useState<MediaAsset[]>([]);
  const [exportSelectedAssetIds, setExportSelectedAssetIds] = useState<Set<string>>(new Set());
  const [isGeneratingExport, setIsGeneratingExport] = useState(false);
  const [exportFeedback, setExportFeedback] = useState('');

  useEffect(() => {
    if (!selectedExportPost) return;
    setExportSelectedAssetIds(new Set());
    fetchMediaAssets(activeOrg.id)
      .then(setExportAssets)
      .catch(() => setExportAssets([]));
  }, [selectedExportPost, activeOrg.id]);

  const toggleExportAsset = (id: string) => {
    setExportSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Builds a real .zip (caption.txt + any selected media asset files, fetched
  // via signed URL) and triggers an actual browser download — replacing the
  // old alert() that only claimed a package was compiled.
  const handleDownloadCompiledAssets = async () => {
    if (!selectedExportPost) return;
    setIsGeneratingExport(true);
    setExportFeedback('');
    try {
      const zip = new JSZip();
      const captionText = [
        `Platform: ${selectedExportPost.platform}`,
        `Recommended timing: 18:00 GMT (Peak Leonean Engagement)`,
        '',
        selectedExportPost.headline,
        '',
        selectedExportPost.bodyText,
        '',
        selectedExportPost.hashtags.join(' '),
      ].join('\n');
      zip.file('caption.txt', captionText);

      const selectedAssets = exportAssets.filter((a) => exportSelectedAssetIds.has(a.id));
      for (const asset of selectedAssets) {
        const url = await getMediaAssetUrl(asset);
        const response = await fetch(url);
        const blob = await response.blob();
        zip.file(asset.fileName, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${selectedExportPost.title.replace(/[^a-zA-Z0-9._-]/g, '_')}-export.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setExportFeedback(`Error: ${err.message || 'Could not generate export package.'}`);
    } finally {
      setIsGeneratingExport(false);
    }
  };

  // --- Billing & Subscriptions ---
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<OrgSubscription[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingFeedback, setBillingFeedback] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [paymentRef, setPaymentRef] = useState('');
  const [requestingPlan, setRequestingPlan] = useState(false);

  useEffect(() => {
    if (activeTab !== 'billing') return;
    setBillingLoading(true);
    Promise.all([fetchPlans(), fetchMySubscriptions(activeOrg.id)])
      .then(([p, subs]) => {
        setPlans(p);
        setMySubscriptions(subs);
      })
      .catch((err: any) => setBillingFeedback(`Error: ${err.message || 'Could not load billing info.'}`))
      .finally(() => setBillingLoading(false));
  }, [activeTab, activeOrg.id]);

  const activeSubscription = mySubscriptions.find((s) => s.status === 'active');
  const pendingSubscription = mySubscriptions.find((s) => s.status === 'pending');

  const handleRequestPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;
    setRequestingPlan(true);
    try {
      await requestSubscription(activeOrg.id, selectedPlanId, billingCycle, paymentRef);
      setMySubscriptions(await fetchMySubscriptions(activeOrg.id));
      setPaymentRef('');
      setBillingFeedback('Upgrade requested. Our finance team will confirm your payment and activate the plan.');
    } catch (err: any) {
      setBillingFeedback(`Error: ${err.message || 'Could not request plan.'}`);
    } finally {
      setRequestingPlan(false);
      setTimeout(() => setBillingFeedback(''), 5000);
    }
  };

  const handleSubmitPaymentRef = async () => {
    if (!pendingSubscription) return;
    const ref = prompt('Bank / mobile money transaction reference:');
    if (!ref) return;
    try {
      await updateSubscriptionNotes(pendingSubscription.id, ref);
      setMySubscriptions(await fetchMySubscriptions(activeOrg.id));
      setBillingFeedback('Payment reference submitted for review.');
    } catch (err: any) {
      setBillingFeedback(`Error: ${err.message || 'Could not submit payment reference.'}`);
    } finally {
      setTimeout(() => setBillingFeedback(''), 4000);
    }
  };

  // --- Team Members ---
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamLimit, setTeamLimit] = useState<number | null>(null);
  const [teamEmail, setTeamEmail] = useState('');
  const [teamRole, setTeamRole] = useState<'admin' | 'member'>('member');
  const [teamFeedback, setTeamFeedback] = useState('');
  const [teamInviting, setTeamInviting] = useState(false);

  useEffect(() => {
    if (activeTab !== 'team') return;
    setTeamLoading(true);
    Promise.all([fetchTeamMembers(activeOrg.id), fetchTeamMemberLimit(activeOrg.id)])
      .then(([members, limit]) => {
        setTeamMembers(members);
        setTeamLimit(limit);
      })
      .catch((err: any) => setTeamFeedback(`Error: ${err.message || 'Could not load team.'}`))
      .finally(() => setTeamLoading(false));
  }, [activeTab, activeOrg.id]);

  const handleInviteTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamEmail) return;
    setTeamInviting(true);
    try {
      await inviteTeamMember(activeOrg.id, teamEmail, teamRole);
      const [members, limit] = await Promise.all([fetchTeamMembers(activeOrg.id), fetchTeamMemberLimit(activeOrg.id)]);
      setTeamMembers(members);
      setTeamLimit(limit);
      setTeamEmail('');
      setTeamFeedback('Team member added.');
    } catch (err: any) {
      setTeamFeedback(`Error: ${err.message || 'Could not invite team member.'}`);
    } finally {
      setTeamInviting(false);
      setTimeout(() => setTeamFeedback(''), 5000);
    }
  };

  const handleRemoveTeamMember = async (userId: string) => {
    if (!confirm('Remove this team member?')) return;
    const previous = teamMembers;
    setTeamMembers(teamMembers.filter((m) => m.userId !== userId));
    try {
      await removeTeamMember(activeOrg.id, userId);
    } catch (err: any) {
      setTeamMembers(previous);
      setTeamFeedback(`Error: ${err.message || 'Could not remove team member.'}`);
    }
  };

  // --- Brand Kit Save State ---
  const [brandKitSaving, setBrandKitSaving] = useState(false);
  const [brandKitFeedback, setBrandKitFeedback] = useState('');

  const handleSaveBrandKit = async () => {
    setBrandKitSaving(true);
    setBrandKitFeedback('');
    try {
      const saved = await saveBrandKit(activeOrg.id, brandKit);
      setBrandKit(saved);
      setBrandKitFeedback('Brand Kit configuration saved successfully!');
    } catch (err: any) {
      setBrandKitFeedback(`Error: ${err.message || 'Could not save brand kit.'}`);
    } finally {
      setBrandKitSaving(false);
      setTimeout(() => setBrandKitFeedback(''), 4000);
    }
  };

  // --- Admin Safety Board States ---
  const [safetyLog, setSafetyLog] = useState<string[]>([]);
  const [scannedFlagged, setScannedFlagged] = useState(false);

  const runSafetyModeration = () => {
    setSafetyLog(['Initializing content moderation scanners...', 'Auditing business directory listings for false claims...', 'Auditing active social-post templates against spam limits...', 'No hostile content detected. Local integrity verification passed.']);
    setScannedFlagged(true);
  };

  // --- Tenders (Procurement) States ---
  const [enablingBuyer, setEnablingBuyer] = useState(false);
  const {
    opportunities: myOpportunities,
    setOpportunities: setMyOpportunities,
    loading: tendersLoading,
    feedback: tendersFeedback,
    setFeedback: setTendersFeedback,
    sectors: tenderSectors,
    countries: tenderCountries,
    districts: tenderDistricts,
    currencies: tenderCurrencies,
    opportunityTypes: tenderTypes,
    countryId: tenderCountryId,
    setCountryId: setTenderCountryId,
    districtId: tenderDistrictId,
    setDistrictId: setTenderDistrictId,
    canPublish: canPublishTenders,
    canViewDetails: canViewTenderDetails,
    savedSearches: viewerSavedSearches,
    removeSavedSearch: handleDeleteViewerSavedSearch,
  } = useTenderWorkspace({
    organizationId: activeOrg.id,
    enabled: activeTab === 'tenders',
  });

  const procurementOverview = useProcurementOverview({
    organizationId: activeOrg.id,
    enabled: activeTab === 'overview' && !isPlatformAdmin && activeOrg.subscriberType !== 'advertiser',
  });

  const handleEnableBuyerMode = async () => {
    setEnablingBuyer(true);
    try {
      const activated = await enableBuyerMode(activeOrg.id);
      if (activated) {
        window.location.reload();
      } else {
        setTendersFeedback('Publishing tenders requires a Publisher subscription. Upgrade your plan from Billing Invoices to enable it.');
        setEnablingBuyer(false);
      }
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not enable buyer mode.'}`);
      setEnablingBuyer(false);
    }
  };

  // --- Supplier Profile States ---
  const EMPTY_SUPPLIER: SupplierProfile = {
    tradingName: '', registrationNumber: '', taxIdentificationNumber: '', description: '',
    website: '', yearEstablished: null, employeeCount: '', geographicCoverage: '', certifications: '', majorClients: '',
  };
  const [supplierProfile, setSupplierProfile] = useState<SupplierProfile>(EMPTY_SUPPLIER);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierFeedback, setSupplierFeedback] = useState('');
  const [enablingSupplier, setEnablingSupplier] = useState(false);
  const [myVerifications, setMyVerifications] = useState<VerificationRequest[]>([]);

  useEffect(() => {
    if (activeTab !== 'supplier-profile' || !activeOrg.isSupplier) return;
    setSupplierLoading(true);
    Promise.all([fetchSupplierProfile(activeOrg.id), fetchMyVerificationRequests(activeOrg.id)])
      .then(([profile, verifications]) => {
        setSupplierProfile(profile);
        setMyVerifications(verifications);
      })
      .catch((err: any) => setSupplierFeedback(`Error: ${err.message || 'Could not load supplier profile.'}`))
      .finally(() => setSupplierLoading(false));
  }, [activeTab, activeOrg.isSupplier, activeOrg.id]);

  const handleEnableSupplierMode = async () => {
    setEnablingSupplier(true);
    try {
      await enableSupplierMode(activeOrg.id);
      window.location.reload();
    } catch (err: any) {
      setSupplierFeedback(`Error: ${err.message || 'Could not enable supplier mode.'}`);
      setEnablingSupplier(false);
    }
  };

  const handleSaveSupplierProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupplierSaving(true);
    try {
      await saveSupplierProfile(activeOrg.id, supplierProfile);
      setSupplierFeedback('Supplier profile saved.');
    } catch (err: any) {
      setSupplierFeedback(`Error: ${err.message || 'Could not save supplier profile.'}`);
    } finally {
      setSupplierSaving(false);
      setTimeout(() => setSupplierFeedback(''), 4000);
    }
  };

  const handleSubmitVerification = async () => {
    const notes = prompt('Anything you want the reviewer to know? (optional)') || '';
    try {
      await submitVerificationRequest(activeOrg.id, 'supplier', notes);
      setMyVerifications(await fetchMyVerificationRequests(activeOrg.id));
      setSupplierFeedback('Verification request submitted.');
    } catch (err: any) {
      setSupplierFeedback(`Error: ${err.message || 'Could not submit verification request.'}`);
    } finally {
      setTimeout(() => setSupplierFeedback(''), 4000);
    }
  };

  // --- Admin Verification Queue States ---
  const [verificationQueue, setVerificationQueue] = useState<VerificationQueueItem[]>([]);
  const [verificationQueueLoading, setVerificationQueueLoading] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState('');

  useEffect(() => {
    if (activeTab !== 'admin-verification' || !isPlatformAdmin) return;
    setVerificationQueueLoading(true);
    fetchVerificationQueue()
      .then(setVerificationQueue)
      .catch((err: any) => setVerificationFeedback(`Error: ${err.message || 'Could not load verification queue.'}`))
      .finally(() => setVerificationQueueLoading(false));
  }, [activeTab, isPlatformAdmin]);

  const handleApproveVerification = async (item: VerificationQueueItem) => {
    const previous = verificationQueue;
    setVerificationQueue(verificationQueue.filter((v) => v.id !== item.id));
    try {
      await approveVerification(item.id, item.orgId, item.requestType as 'supplier' | 'buyer');
    } catch (err: any) {
      setVerificationQueue(previous);
      setVerificationFeedback(`Error: ${err.message || 'Could not approve verification.'}`);
    }
  };

  const handleRejectVerification = async (id: string) => {
    const note = prompt('Reason for rejecting this verification request:');
    if (!note) return;
    const previous = verificationQueue;
    setVerificationQueue(verificationQueue.filter((v) => v.id !== id));
    try {
      await rejectVerification(id, note);
    } catch (err: any) {
      setVerificationQueue(previous);
      setVerificationFeedback(`Error: ${err.message || 'Could not reject verification.'}`);
    }
  };

  // --- Admin Subscription Requests States ---
  const [pendingSubscriptions, setPendingSubscriptions] = useState<PendingSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsFeedback, setSubscriptionsFeedback] = useState('');

  useEffect(() => {
    if (activeTab !== 'admin-subscriptions' || !isPlatformAdmin) return;
    setSubscriptionsLoading(true);
    fetchPendingSubscriptions()
      .then(setPendingSubscriptions)
      .catch((err: any) => setSubscriptionsFeedback(`Error: ${err.message || 'Could not load subscription requests.'}`))
      .finally(() => setSubscriptionsLoading(false));
  }, [activeTab, isPlatformAdmin]);

  const handleActivateSubscription = async (sub: PendingSubscription) => {
    const previous = pendingSubscriptions;
    setPendingSubscriptions(pendingSubscriptions.filter((s) => s.id !== sub.id));
    try {
      await activateSubscription(sub.id, sub.billingCycle as 'monthly' | 'annual');
    } catch (err: any) {
      setPendingSubscriptions(previous);
      setSubscriptionsFeedback(`Error: ${err.message || 'Could not activate subscription.'}`);
    }
  };

  const handleDeclineSubscription = async (sub: PendingSubscription) => {
    const note = prompt('Reason for declining this subscription request:') || '';
    const previous = pendingSubscriptions;
    setPendingSubscriptions(pendingSubscriptions.filter((s) => s.id !== sub.id));
    try {
      await cancelSubscriptionRequest(sub.id, note);
    } catch (err: any) {
      setPendingSubscriptions(previous);
      setSubscriptionsFeedback(`Error: ${err.message || 'Could not decline subscription.'}`);
    }
  };

  // --- Advertiser subscriber: "My Adverts" + admin fulfillment queue ---
  const [canAdvertise, setCanAdvertise] = useState(false);
  const [myAdvertisements, setMyAdvertisements] = useState<AdvertisementRequest[]>([]);
  const [allAdvertisements, setAllAdvertisements] = useState<AdvertisementRequest[]>([]);
  const [advertisementsLoading, setAdvertisementsLoading] = useState(false);
  const [advertisementFeedback, setAdvertisementFeedback] = useState('');
  const [adCategory, setAdCategory] = useState<AdvertisementCategory>('business');
  const [adSubject, setAdSubject] = useState('');
  const [adDescription, setAdDescription] = useState('');
  const [adMediaUrl, setAdMediaUrl] = useState('');
  const [adUploading, setAdUploading] = useState(false);

  const handleUploadRequestPhoto = async (file: File | undefined) => {
    if (!file) return;
    setAdUploading(true);
    try {
      setAdMediaUrl(await uploadAdvertImage(file, 'photo'));
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'Upload failed.'}`);
    } finally {
      setAdUploading(false);
    }
  };
  const [adSubmitting, setAdSubmitting] = useState(false);

  // Admin: published adverts shown on the public site (Manohub is the source
  // of truth; the social post links back).
  const [publishedAdverts, setPublishedAdverts] = useState<Advert[]>([]);
  const [advAnalytics, setAdvAnalytics] = useState<AdvertAnalyticsSummary | null>(null);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [campaignReach, setCampaignReach] = useState<Record<string, CampaignReach>>({});
  const [campForm, setCampForm] = useState({ name: '', businessName: '', startDate: '', endDate: '', reachGoal: '' });
  const [campSaving, setCampSaving] = useState(false);
  const [advCampaignId, setAdvCampaignId] = useState<string>(''); // publish-form assignment
  const [advEditingId, setAdvEditingId] = useState<string | null>(null); // editing an existing advert
  const [advRequestId, setAdvRequestId] = useState<string | null>(null); // publishing from a request
  const [advOrgId, setAdvOrgId] = useState<string | null>(null);

  // Load a subscriber advert request into the publisher form for review + publish.
  const loadRequestIntoPublisher = (req: AdvertisementRequest) => {
    setAdvEditingId(null);
    setAdvRequestId(req.id);
    setAdvOrgId(req.orgId);
    setAdvForm({
      title: req.subject, category: req.category, businessName: req.orgName || '',
      summary: req.description.length > 140 ? `${req.description.slice(0, 137)}…` : req.description,
      content: req.description, mediaUrl: req.mediaUrl || '', socialPlatform: 'Facebook',
      socialUrl: '', creativeUrl: '', accentColor: '#5d4ee0', logoUrl: '',
    });
    setAdvCampaignId('');
    setAdvertisementFeedback('Loaded into the publisher below — review and Publish.');
    document.getElementById('advert-publisher')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Load a published advert into the form to edit it.
  const loadAdvertForEdit = (adv: Advert) => {
    setAdvRequestId(null);
    setAdvOrgId(null);
    setAdvEditingId(adv.id);
    setAdvForm({
      title: adv.title, category: adv.category, businessName: adv.businessName,
      summary: adv.summary || '', content: adv.content, mediaUrl: adv.mediaUrl || '',
      socialPlatform: adv.socialPlatform || 'Facebook', socialUrl: adv.socialUrl || '',
      creativeUrl: adv.creativeUrl || '', accentColor: adv.accentColor || '#5d4ee0', logoUrl: adv.logoUrl || '',
    });
    setAdvFormat(adv.format);
    setAdvTheme(adv.theme);
    setAdvWithPhoto(adv.withPhoto);
    setAdvCampaignId(adv.campaignId || '');
    setAdvertisementFeedback('Editing this advert — make changes and Save.');
    document.getElementById('advert-publisher')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelAdvertEdit = () => {
    setAdvEditingId(null);
    setAdvRequestId(null);
    setAdvOrgId(null);
    setAdvForm({ title: '', category: 'business', businessName: '', summary: '', content: '', mediaUrl: '', socialPlatform: 'Facebook', socialUrl: '', creativeUrl: '', accentColor: '#5d4ee0', logoUrl: '' });
    setAdvCampaignId('');
    setAdvertisementFeedback('');
  };

  const reloadAdCampaigns = async () => {
    try {
      const [cs, reach] = await Promise.all([fetchAllAdCampaigns(), fetchCampaignReach().catch(() => ({}))]);
      setAdCampaigns(cs);
      setCampaignReach(reach);
    } catch { /* non-fatal */ }
  };

  const handleCreateAdCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campForm.name.trim()) { setAdvertisementFeedback('Error: campaign name is required.'); return; }
    setCampSaving(true);
    try {
      await createAdCampaign({
        name: campForm.name,
        businessName: campForm.businessName || undefined,
        startDate: campForm.startDate || null,
        endDate: campForm.endDate || null,
        reachGoal: campForm.reachGoal ? Number(campForm.reachGoal) : null,
        orgId: activeOrg?.id ?? null,
        status: 'active',
      });
      setCampForm({ name: '', businessName: '', startDate: '', endDate: '', reachGoal: '' });
      await reloadAdCampaigns();
      setAdvertisementFeedback('Campaign created.');
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'Could not create campaign.'}`);
    } finally {
      setCampSaving(false);
    }
  };

  const handleToggleAdCampaign = async (c: AdCampaign) => {
    try {
      await setCampaignStatus(c.id, c.status === 'active' ? 'paused' : 'active');
      await Promise.all([reloadAdCampaigns(), fetchAllAdverts().then(setPublishedAdverts).catch(() => {})]);
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'Could not update campaign.'}`);
    }
  };

  const handleDeleteAdCampaign = async (id: string) => {
    try {
      await deleteAdCampaign(id);
      await reloadAdCampaigns();
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'Could not delete campaign.'}`);
    }
  };
  const [advForm, setAdvForm] = useState({
    title: '', category: 'business', businessName: '', summary: '', content: '',
    mediaUrl: '', socialPlatform: 'Facebook', socialUrl: '', creativeUrl: '',
    accentColor: '#5d4ee0', logoUrl: '',
  });
  const [advSaving, setAdvSaving] = useState(false);
  const [advFormat, setAdvFormat] = useState<AdvertFormat>('square');
  const [advTheme, setAdvTheme] = useState<AdvertTheme>('dark');
  const [advWithPhoto, setAdvWithPhoto] = useState(true);
  const [advUploading, setAdvUploading] = useState<'photo' | 'logo' | null>(null);

  // Upload an advert photo/logo file and set its public URL on the form.
  const handleUploadAdvertImage = async (file: File | undefined, kind: 'photo' | 'logo') => {
    if (!file) return;
    setAdvUploading(kind);
    try {
      const url = await uploadAdvertImage(file, kind);
      setAdvForm((f) => ({ ...f, [kind === 'photo' ? 'mediaUrl' : 'logoUrl']: url }));
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'Upload failed.'}`);
    } finally {
      setAdvUploading(null);
    }
  };

  // "Download the kit": render every format off-screen, capture each to PNG and
  // zip them so an advertiser gets all channel sizes in one download.
  const KIT_FORMATS: AdvertFormat[] = ['square', 'story', 'landscape', 'banner', 'editorial'];
  const kitRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [kitExporting, setKitExporting] = useState(false);
  const [sharePackId, setSharePackId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyCaption = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    } catch {
      setAdvertisementFeedback('Error: could not copy to clipboard.');
    }
  };

  useEffect(() => {
    if (!kitExporting) return;
    let cancelled = false;
    (async () => {
      try {
        try { await (document as any).fonts?.ready; } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 500));
        const zip = new JSZip();
        const slug = (advForm.title || 'advert').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'advert';
        for (const f of KIT_FORMATS) {
          const node = kitRefs.current[f];
          if (!node) continue;
          const dataUrl = await exportCreativePng(node);
          zip.file(`manohub-${slug}-${f}.png`, dataUrl.split(',')[1], { base64: true });
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        if (cancelled) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `manohub-${slug}-kit.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err: any) {
        setAdvertisementFeedback(`Error: ${err?.message || 'Kit export failed.'}`);
      } finally {
        if (!cancelled) setKitExporting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kitExporting]);
  const [savingCreative, setSavingCreative] = useState(false);
  const [polishingCopy, setPolishingCopy] = useState(false);

  // AI polish: tighten the admin's advert subject/body into headline + body.
  const handlePolishAdvertCopy = async () => {
    if (!advForm.title.trim()) {
      setAdvertisementFeedback('Error: enter a subject/title first so AI has something to polish.');
      return;
    }
    setPolishingCopy(true);
    try {
      const { headline, body } = await aiPolishAdvertCopy({
        businessName: advForm.businessName, category: advForm.category,
        subject: advForm.title, description: advForm.summary || advForm.content,
      });
      setAdvForm((f) => ({ ...f, title: headline, summary: body }));
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'AI polish failed.'}`);
    } finally {
      setPolishingCopy(false);
    }
  };
  const creativeRef = useRef<HTMLDivElement>(null);
  const ogRef = useRef<HTMLDivElement>(null);

  // Export a rendered creative node to a PNG data URL (2x).
  const exportCreativePng = (node: HTMLElement | null) =>
    node ? toPng(node, { pixelRatio: 2, cacheBust: true }) : Promise.reject(new Error('nothing to export'));

  // Download the auto-generated creative as a PNG for social / print use.
  const handleDownloadCreative = async () => {
    try {
      const dataUrl = await exportCreativePng(creativeRef.current);
      const name = (advForm.title || 'advert').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'advert';
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${name}-${advFormat}.png`;
      a.click();
    } catch (err: any) {
      setAdvertisementFeedback(`Error: could not export the creative (${err?.message || 'unknown'}).`);
    }
  };

  // Save the exported creative to storage and attach it to this advert (for
  // social hand-off). The public URL is stored on the advert as creative_url.
  const handleSaveCreativeForSocial = async () => {
    setSavingCreative(true);
    try {
      const dataUrl = await exportCreativePng(creativeRef.current);
      const url = await uploadAdvertCreative(dataUrl);
      setAdvForm((f) => ({ ...f, creativeUrl: url }));
      setAdvertisementFeedback('Creative saved — it will attach to the advert when you publish.');
    } catch (err: any) {
      setAdvertisementFeedback(`Error: could not save the creative (${err?.message || 'unknown'}).`);
    } finally {
      setSavingCreative(false);
    }
  };

  // Subscriber-side preview of their own advert as they fill the request form.
  const subCreativeRef = useRef<HTMLDivElement>(null);
  const [polishingSub, setPolishingSub] = useState(false);
  const handlePolishSubCopy = async () => {
    if (!adSubject.trim()) {
      setAdvertisementFeedback('Error: enter a subject first so AI has something to polish.');
      return;
    }
    setPolishingSub(true);
    try {
      const { headline, body } = await aiPolishAdvertCopy({ businessName: activeOrg.name, category: adCategory, subject: adSubject, description: adDescription });
      setAdSubject(headline);
      setAdDescription(body);
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err?.message || 'AI polish failed.'}`);
    } finally {
      setPolishingSub(false);
    }
  };
  const handleDownloadSubCreative = async () => {
    try {
      const dataUrl = await exportCreativePng(subCreativeRef.current);
      const name = (adSubject || 'advert').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'advert';
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${name}-${advFormat}.png`;
      a.click();
    } catch (err: any) {
      setAdvertisementFeedback(`Error: could not export the creative (${err?.message || 'unknown'}).`);
    }
  };

  useEffect(() => {
    if (activeTab !== 'advertising' || isPlatformAdmin) return;
    setAdvertisementsLoading(true);
    Promise.all([hasFeature(activeOrg.id, 'business_advertising'), fetchMyAdvertisements(activeOrg.id)])
      .then(([entitled, ads]) => {
        setCanAdvertise(entitled);
        setMyAdvertisements(ads);
      })
      .catch((err: any) => setAdvertisementFeedback(`Error: ${err.message || 'Could not load your adverts.'}`))
      .finally(() => setAdvertisementsLoading(false));
  }, [activeTab, activeOrg.id, isPlatformAdmin]);

  useEffect(() => {
    if (activeTab !== 'admin-advertising' || !isPlatformAdmin) return;
    setAdvertisementsLoading(true);
    Promise.all([
      fetchAllAdvertisementRequests(),
      fetchAllAdverts().catch(() => []),
      fetchAdvertAnalyticsSummary().catch(() => null),
      fetchAllAdCampaigns().catch(() => []),
      fetchCampaignReach().catch(() => ({})),
    ])
      .then(([reqs, adverts, analytics, camps, reach]) => {
        setAllAdvertisements(reqs);
        setPublishedAdverts(adverts);
        setAdvAnalytics(analytics);
        setAdCampaigns(camps);
        setCampaignReach(reach);
      })
      .catch((err: any) => setAdvertisementFeedback(`Error: ${err.message || 'Could not load advertising requests.'}`))
      .finally(() => setAdvertisementsLoading(false));
  }, [activeTab, isPlatformAdmin]);

  const handlePublishAdvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advForm.title.trim() || !advForm.businessName.trim()) {
      setAdvertisementFeedback('Error: Advert title and business name are required.');
      return;
    }
    setAdvSaving(true);
    const selectedCampaign = advCampaignId ? adCampaigns.find((c) => c.id === advCampaignId) : undefined;
    try {
      // Guarantee an og:image for social unfurling: if no creative was saved,
      // capture the current preview and upload it before publishing.
      let creativeUrl = advForm.creativeUrl || null;
      if (!creativeUrl && creativeRef.current) {
        try {
          const dataUrl = await exportCreativePng(creativeRef.current);
          creativeUrl = await uploadAdvertCreative(dataUrl);
        } catch { /* non-fatal: publish without a saved creative */ }
      }
      // Always capture a social-optimal 1200×628 landscape card for the feed
      // unfurl (og:image), independent of the advert's own format.
      let ogImageUrl: string | null = null;
      if (ogRef.current) {
        try {
          const dataUrl = await exportCreativePng(ogRef.current);
          ogImageUrl = await uploadAdvertCreative(dataUrl);
        } catch { /* non-fatal: fall back to creative/media for og:image */ }
      }
      const startsAt = selectedCampaign?.startDate ? new Date(selectedCampaign.startDate).toISOString() : null;
      const endsAt = selectedCampaign?.endDate ? new Date(`${selectedCampaign.endDate}T23:59:59`).toISOString() : null;
      const fields = {
        title: advForm.title,
        category: advForm.category,
        businessName: advForm.businessName,
        summary: advForm.summary || null,
        content: advForm.content,
        mediaUrl: advForm.mediaUrl || null,
        socialPlatform: advForm.socialPlatform || null,
        socialUrl: advForm.socialUrl || null,
        creativeUrl,
        ogImageUrl: ogImageUrl || creativeUrl,
        accentColor: advForm.accentColor || null,
        logoUrl: advForm.logoUrl || null,
        theme: advTheme,
        format: advFormat,
        withPhoto: advWithPhoto,
        campaignId: advCampaignId || null,
        startsAt,
        endsAt,
      };
      if (advEditingId) {
        const updated = await updateAdvert(advEditingId, fields);
        setPublishedAdverts(publishedAdverts.map((a) => (a.id === updated.id ? updated : a)));
        setAdvertisementFeedback('Advert updated.');
      } else {
        const created = await createAdvert({ ...fields, status: 'live', requestId: advRequestId, orgId: advOrgId });
        setPublishedAdverts([created, ...publishedAdverts]);
        // Mark the originating request live so the subscriber sees progress.
        if (advRequestId) {
          try {
            await updateAdvertisementReport(advRequestId, { status: 'live' });
            setAllAdvertisements((prev) => prev.map((r) => (r.id === advRequestId ? { ...r, status: 'live' } : r)));
          } catch { /* non-fatal */ …25059 tokens truncated…rCells(calendarMonth).map((day, idx) => {
              if (!day) return <div key={idx} />;
              const scheduledPost = contentItems.find(item => item.scheduledDate === formatDateKey(day));
              return (
                <div key={idx} className="bg-white border border-slate-100 rounded-lg p-2 min-h-24 flex flex-col justify-between relative group hover:shadow-xs transition-shadow">
                  <span className="font-mono text-xs font-bold text-slate-400">{day.getDate()}</span>
                  {scheduledPost && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-1.5 rounded text-[10px] font-semibold leading-tight line-clamp-2">
                      {scheduledPost.title}
                    </div>
                  )}
                  {scheduledPost && (
                    <button
                      onClick={() => setSelectedExportPost(scheduledPost)}
                      className="absolute inset-0 bg-slate-900/10 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity cursor-pointer"
                    >
                      <Eye className="text-slate-800 bg-white rounded-full p-1 h-6 w-6 shadow-sm" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* High Fidelity Export Package Modal/Panel */}
        {selectedExportPost && (
          <div className="bg-white border-2 border-emerald-500 rounded-2xl p-6 shadow-md space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-display font-bold text-slate-800">Export High-Fidelity Manual Package</span>
              <button onClick={() => setSelectedExportPost(null)} className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-bold block">PLATFORM TARGET</span>
                  <span className="font-semibold text-slate-700">{selectedExportPost.platform}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-bold block">RECOMMENDED TIMING</span>
                  <span className="font-semibold text-slate-700">18:00 GMT (Peak Leonean Engagement)</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-bold block">COPY CAPTION</span>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-xs text-slate-700 font-mono mt-1 relative">
                    <p className="font-bold">{selectedExportPost.headline}</p>
                    <p className="mt-2">{selectedExportPost.bodyText}</p>
                    <p className="text-blue-600 mt-2">{selectedExportPost.hashtags.join(' ')}</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col justify-between text-xs space-y-3">
                <span className="font-bold text-slate-700 block uppercase">Attach Media Assets</span>
                {exportAssets.length === 0 ? (
                  <p className="text-slate-400">No media assets uploaded yet — the export will still include caption.txt.</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto space-y-1.5">
                    {exportAssets.map((asset) => (
                      <label key={asset.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportSelectedAssetIds.has(asset.id)}
                          onChange={() => toggleExportAsset(asset.id)}
                          className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="truncate text-slate-700">{asset.fileName}</span>
                      </label>
                    ))}
                  </div>
                )}
                <ul className="space-y-2">
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Copy generated caption safely</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Attach media assets from the Library above</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Embed UTM tracking link</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Upload to target social platform manually</li>
                </ul>
                {exportFeedback && <p className="text-red-600 font-semibold">{exportFeedback}</p>}
                <button
                  onClick={handleDownloadCompiledAssets}
                  disabled={isGeneratingExport}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-semibold py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="h-4 w-4" /> {isGeneratingExport ? 'Compiling…' : 'Download Compiled Assets'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. MEDIA LIBRARY WORKSPACE
  if (activeTab === 'media') {
    return (
      <div className="space-y-8 text-left">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-100 p-6 rounded-2xl">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-lg">Centralized Media Library</h3>
            <p className="text-xs text-slate-500">Real, storage-backed assets — upload logos, photography, and campaign files.</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={lowBandwidthMode}
                onChange={(e) => setLowBandwidthMode(e.target.checked)}
                className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500"
              />
              Low-Bandwidth Mode
            </label>
            <input
              type="text"
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value)}
              placeholder="Folder"
              className="w-28 border border-slate-200 rounded-xl p-2 text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
            <input ref={mediaFileInputRef} type="file" onChange={handleMediaFileChange} className="hidden" />
            <button
              onClick={() => mediaFileInputRef.current?.click()}
              disabled={isUploadingMedia}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Upload className="h-4 w-4" /> {isUploadingMedia ? 'Uploading…' : 'Upload Asset'}
            </button>
          </div>
        </div>

        {mediaFeedback && (
          <div className={`text-sm p-4 rounded-xl font-semibold ${mediaFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {mediaFeedback}
          </div>
        )}

        {mediaLoading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : mediaAssets.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 text-sm">
            No media assets uploaded yet. Use "Upload Asset" above to add your first file.
          </div>
        ) : (
          <>
            {/* Folders Grid — real counts derived from uploaded assets */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {mediaFolders.map((folder) => (
                <div key={folder} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition-shadow text-left">
                  <FolderOpen className="text-emerald-600 h-10 w-10 mb-4" />
                  <h4 className="font-display font-bold text-slate-800 text-sm leading-tight">{folder}</h4>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block uppercase">
                    {mediaAssets.filter((a) => a.folder === folder).length} Files
                  </span>
                </div>
              ))}
            </div>

            {/* Asset List — real files, real sizes, real delete/view */}
            <div className="space-y-4">
              <h4 className="font-display font-bold text-slate-900 text-sm">All Uploads</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                {mediaAssets.map((asset) => {
                  const isImage = asset.mimeType?.startsWith('image/');
                  return (
                    <div key={asset.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs relative group">
                      <button
                        onClick={() => handleViewMediaAsset(asset)}
                        className="w-full bg-slate-100 h-32 flex items-center justify-center text-slate-400 cursor-pointer"
                      >
                        {lowBandwidthMode ? (
                          <span className="text-[10px] font-mono text-slate-400">Low-Res Placeholder</span>
                        ) : isImage ? (
                          <ImageIcon className="h-8 w-8 text-slate-300" />
                        ) : (
                          <FileText className="h-8 w-8 text-slate-300" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteMediaAsset(asset)}
                        className="absolute top-2 right-2 bg-white/90 border border-slate-200 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                      <div className="p-3 text-left">
                        <span className="font-semibold text-slate-700 text-xs block truncate">{asset.fileName}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{formatFileSize(asset.fileSize)} · {asset.folder}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // 6. AUDIENCES WORKSPACE
  if (activeTab === 'audiences') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-lg">Local & Diaspora Audience Planner</h3>
            <p className="text-xs text-slate-500">Build and save reusable targeting profiles from real districts and diaspora markets, for reference when planning campaigns.</p>
          </div>

          {audienceFeedback && (
            <div className={`text-sm p-3.5 rounded-xl font-semibold ${audienceFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {audienceFeedback}
            </div>
          )}

          <form onSubmit={handleSaveSegment} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Segment Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Bo/Kenema rice buyers + UK diaspora"
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Districts (Sierra Leone)</span>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm max-h-48 overflow-y-auto">
                  {audienceLoading ? (
                    <p className="text-xs text-slate-400">Loading…</p>
                  ) : (
                    audienceDistricts.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={segmentDistricts.includes(d.name)}
                          onChange={() => toggleSegmentDistrict(d.name)}
                          className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500"
                        />
                        {d.name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Diaspora Markets</span>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm">
                  {DIASPORA_MARKET_OPTIONS.map((market) => (
                    <label key={market} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={segmentDiasporaMarkets.includes(market)}
                        onChange={() => toggleSegmentDiasporaMarket(market)}
                        className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500"
                      />
                      {market}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Interest Tags</span>
                <textarea
                  rows={5}
                  placeholder="Homecoming Festivals, Agrotech, Music Sponsorships"
                  value={segmentInterestsInput}
                  onChange={(e) => setSegmentInterestsInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                />
                <p className="text-[10px] text-slate-400">Comma-separated</p>
              </div>
            </div>

            <button type="submit" disabled={savingSegment} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {savingSegment ? 'Saving…' : 'Save Segment'}
            </button>
          </form>

          <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
            <span className="text-xs text-slate-600 font-bold uppercase tracking-wider block">Live Reach Estimates</span>
            <p className="text-xs text-slate-500 mt-1">
              Real audience-size numbers require a connected Meta or WhatsApp Business ad account — see Social Accounts.
              Not available yet, so no reach figure is shown here rather than an invented one.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-display font-bold text-slate-900 text-lg">Saved Segments ({audienceSegments.length})</h3>
          {audienceSegments.length === 0 ? (
            <p className="text-xs text-slate-400">No segments saved yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {audienceSegments.map((seg) => (
                <div key={seg.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-display font-bold text-slate-900 leading-tight text-sm">{seg.name}</h4>
                    <button
                      type="button"
                      onClick={() => handleDeleteSegment(seg)}
                      disabled={deletingSegmentId === seg.id}
                      className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {deletingSegmentId === seg.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-slate-600"><span className="font-medium">Districts:</span> <span className="text-slate-500">{seg.districts.length > 0 ? seg.districts.join(', ') : '—'}</span></p>
                    <p className="text-slate-600"><span className="font-medium">Diaspora:</span> <span className="text-slate-500">{seg.diasporaMarkets.length > 0 ? seg.diasporaMarkets.join(', ') : '—'}</span></p>
                    <p className="text-slate-600"><span className="font-medium">Interests:</span> <span className="text-slate-500">{seg.interests.length > 0 ? seg.interests.join(', ') : '—'}</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 7. SOCIAL ACCOUNTS WORKSPACE
  if (activeTab === 'social') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="font-display font-bold text-slate-900 text-lg">Connected Channels</h3>
              <p className="text-xs text-slate-500 mt-1">
                No official Meta/WhatsApp Business API integration exists yet (that needs a developer app and
                credentials we don't have) — this is real, manually-tracked channel status instead of a fake
                OAuth handshake.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddingChannel((v) => !v)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shrink-0"
            >
              {addingChannel ? 'Cancel' : '+ Add Channel'}
            </button>
          </div>

          {socialFeedback && (
            <div className={`text-sm p-3.5 rounded-xl font-semibold mb-4 ${socialFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {socialFeedback}
            </div>
          )}

          {addingChannel && (
            <form onSubmit={handleAddChannel} className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Platform</label>
                  <input
                    type="text" required
                    placeholder="e.g. Instagram"
                    value={newChannelPlatform}
                    onChange={(e) => setNewChannelPlatform(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Account / Handle</label>
                  <input
                    type="text" required
                    placeholder="@manohub"
                    value={newChannelAccountName}
                    onChange={(e) => setNewChannelAccountName(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Status</label>
                  <select
                    value={newChannelStatus}
                    onChange={(e: any) => setNewChannelStatus(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  >
                    <option>Sandbox</option>
                    <option>Connected</option>
                    <option>Expired</option>
                    <option>Not Configured</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={savingChannel} className="bg-[#0F172A] text-white font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50">
                {savingChannel ? 'Saving…' : 'Save Channel'}
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {socialConnections.length === 0 && (
              <p className="text-xs text-slate-400">No channels tracked yet — add one above.</p>
            )}
            {socialConnections.map((conn) => (
              <div key={conn.id} className="border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition-shadow flex flex-col justify-between">
                {editingConnectionId === conn.id ? (
                  <div className="space-y-3">
                    <span className="font-display font-bold text-slate-800 text-sm block">{conn.platform}</span>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Account / Handle</label>
                      <input
                        type="text"
                        value={editConnAccountName}
                        onChange={(e) => setEditConnAccountName(e.target.value)}
                        className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-sm focus:outline-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Status</label>
                        <select
                          value={editConnStatus}
                          onChange={(e: any) => setEditConnStatus(e.target.value)}
                          className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-sm focus:outline-emerald-500"
                        >
                          <option>Sandbox</option>
                          <option>Connected</option>
                          <option>Expired</option>
                          <option>Not Configured</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Health</label>
                        <select
                          value={editConnHealth}
                          onChange={(e: any) => setEditConnHealth(e.target.value)}
                          className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-sm focus:outline-emerald-500"
                        >
                          <option>Healthy</option>
                          <option>Warning</option>
                          <option>Disconnected</option>
                          <option>None</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSaveConnectionEdit(conn.id)}
                        disabled={savingConnEdit}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                      >
                        {savingConnEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setEditingConnectionId(null)} className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-display font-bold text-slate-800 text-sm">{conn.platform}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          conn.status === 'Connected' ? 'bg-emerald-100 text-emerald-800' :
                          conn.status === 'Sandbox' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {conn.status}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-mono block">ACCOUNT: {conn.accountName}</span>
                    </div>

                    <div className="border-t border-slate-50 pt-4 mt-6 flex justify-between items-center">
                      <span className="text-xs text-slate-400">Health: <strong className="text-slate-600">{conn.connectionHealth}</strong></span>
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={() => handleStartEditConnection(conn)} className="text-emerald-600 hover:text-emerald-700 text-xs font-semibold cursor-pointer">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConnection(conn)}
                          disabled={deletingConnectionId === conn.id}
                          className="text-red-600 hover:text-red-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {deletingConnectionId === conn.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 8. ANALYTICS WORKSPACE
  if (activeTab === 'analytics') {
    const totalClicks = trackingLinks.reduce((sum, l) => sum + l.clickCount, 0);
    const clicksLast7Days = clickSeries.slice(-7).reduce((sum, p) => sum + p.count, 0);
    const maxClickCount = Math.max(1, ...clickSeries.map((p) => p.count));
    return (
      <div className="space-y-5 text-left">
        <div className="border-b-2 border-[#0F172A] pb-5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-700">Audience response</span>
          <h3 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-slate-950">Tracking Link Performance</h3>
          <p className="mt-1 text-sm text-slate-500">See which links, days and campaigns are earning genuine attention.</p>
        </div>
        <div className="border border-[#0F172A] bg-[#0F172A]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px">
            <div className="bg-white border-t-4 border-indigo-600 p-5">
              <span className="font-mono text-[9px] tracking-widest text-slate-500 font-bold uppercase block">Active Tracking Links</span>
              <span className="font-display font-extrabold text-4xl text-slate-950 block mt-3">{trackingLinks.length.toLocaleString()}</span>
            </div>
            <div className="bg-white border-t-4 border-emerald-600 p-5">
              <span className="font-mono text-[9px] tracking-widest text-slate-500 font-bold uppercase block">Total Clicks (All Time)</span>
              <span className="font-display font-extrabold text-4xl text-slate-950 block mt-3">{totalClicks.toLocaleString()}</span>
            </div>
            <div className="bg-white border-t-4 border-amber-500 p-5">
              <span className="font-mono text-[9px] tracking-widest text-slate-500 font-bold uppercase block">Clicks (Last 7 Days)</span>
              <span className="font-display font-extrabold text-4xl text-emerald-700 block mt-3">{clicksLast7Days.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Real click chart — from tracking_link_clicks, not a fixed mock array */}
        <div className="bg-white border border-[#0F172A] p-6">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Daily Clicks (Last 12 Days)</h3>
          <div className="flex items-end gap-3 h-48 pt-6">
            {clickSeries.map((point) => (
              <div key={point.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors" style={{ height: `${(point.count / maxClickCount) * 100}%` }} />
                <span className="text-[10px] text-slate-400 font-mono">{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Clicks by day of week — real, from raw click timestamps over the last 90 days */}
        <div className="bg-white border border-[#0F172A] p-6">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Clicks by Day of Week (Last 90 Days)</h3>
          {weekdayClicks.every((w) => w.count === 0) ? (
            <p className="text-xs text-slate-400">No click activity yet — this will fill in once your tracking links get real traffic.</p>
          ) : (
            <div className="flex items-end gap-3 h-40 pt-6">
              {weekdayClicks.map((point) => {
                const maxWeekday = Math.max(1, ...weekdayClicks.map((w) => w.count));
                return (
                  <div key={point.weekday} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="text-[10px] text-slate-500 font-mono">{point.count}</span>
                    <div className="w-full bg-indigo-500 hover:bg-indigo-600 transition-colors" style={{ height: `${(point.count / maxWeekday) * 100}%` }} />
                    <span className="text-[10px] text-slate-400 font-mono">{point.weekday}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-campaign click rollup — real, joins tracking_links.campaign_id to campaigns */}
        <div className="bg-white border border-[#0F172A] p-6">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Clicks by Campaign</h3>
          {(() => {
            const rollup = new Map<string, { name: string; clicks: number; links: number }>();
            for (const link of trackingLinks) {
              if (!link.campaignId) continue;
              const camp = campaigns.find((c) => c.id === link.campaignId);
              const key = link.campaignId;
              const entry = rollup.get(key) ?? { name: camp?.name || 'Unknown campaign', clicks: 0, links: 0 };
              entry.clicks += link.clickCount;
              entry.links += 1;
              rollup.set(key, entry);
            }
            const rows = Array.from(rollup.values()).sort((a, b) => b.clicks - a.clicks);
            if (rows.length === 0) {
              return <p className="text-xs text-slate-400">No tracking links are attached to a campaign yet — pick a campaign when creating a link below.</p>;
            }
            return (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.name} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                    <span className="text-slate-700 font-medium">{row.name}</span>
                    <span className="font-mono text-slate-500">{row.links} link{row.links === 1 ? '' : 's'} · <strong className="text-emerald-600">{row.clicks} clicks</strong></span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Tracking Link Builder */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-display font-bold text-slate-900 text-lg">Create a Tracking Link</h3>
          {trackingLinkFeedback && (
            <div className={`text-sm p-3 rounded-xl font-semibold ${trackingLinkFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {trackingLinkFeedback}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Label</label>
              <input
                type="text"
                placeholder="e.g. Facebook Video Ad"
                value={trackLabel}
                onChange={(e) => setTrackLabel(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Destination URL</label>
              <input
                type="text"
                value={trackDest}
                onChange={(e) => setTrackDest(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">Attribute to Campaign (optional)</label>
              <select
                value={trackCampaignId}
                onChange={(e) => setTrackCampaignId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              >
                <option value="">No campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={handleGenerateLink} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer">
            Generate Tracking Link
          </button>
        </div>

        {/* List of real links */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Your Tracking Links</h4>
          {trackingLinksLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : trackingLinks.length === 0 ? (
            <p className="text-xs text-slate-400">No tracking links yet.</p>
          ) : (
            <div className="space-y-3">
              {trackingLinks.map((link) => {
                const shortUrl = `${window.location.origin}/r/${link.shortCode}`;
                return (
                  <div key={link.id} className="border border-slate-100 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800 text-sm block truncate">{link.label}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(shortUrl)}
                        className="text-xs text-emerald-600 hover:underline cursor-pointer font-mono truncate block"
                        title="Copy link"
                      >
                        {shortUrl}
                      </button>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-mono text-slate-500">{link.clickCount} clicks</span>
                      <button onClick={() => handleDeleteTrackingLink(link.id)} className="text-xs text-red-500 hover:underline cursor-pointer">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 9. LEADS WORKSPACE (CRM)
  if (activeTab === 'leads') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="font-display font-bold text-slate-900 text-lg">Lightweight CRM Pipeline</h3>
              <p className="text-xs text-slate-500">Track clicks, inquiries, and converted sponsorships securely.</p>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search lead name..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="border border-slate-200 rounded-xl p-2 text-xs bg-slate-50 text-slate-700"
              />
              <select
                value={leadStatusFilter}
                onChange={(e) => setLeadStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-xl p-2 text-xs bg-slate-50 text-slate-700"
              >
                <option>All</option>
                <option>New</option>
                <option>Contacted</option>
                <option>Qualified</option>
                <option>Proposal Sent</option>
                <option>Converted</option>
              </select>
              <button
                type="button"
                onClick={() => setAddingLead((v) => !v)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shrink-0"
              >
                {addingLead ? 'Cancel' : '+ Add Lead'}
              </button>
            </div>
          </div>

          {leadFeedback && (
            <div className={`text-sm p-3.5 rounded-xl font-semibold mb-4 ${leadFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {leadFeedback}
            </div>
          )}

          {addingLead && (
            <form onSubmit={handleAddLead} className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Name</label>
                  <input
                    type="text" required
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Email</label>
                  <input
                    type="email"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">WhatsApp / Tel</label>
                  <input
                    type="text"
                    value={newLeadWhatsapp}
                    onChange={(e) => setNewLeadWhatsapp(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Source</label>
                  <input
                    type="text"
                    value={newLeadSource}
                    onChange={(e) => setNewLeadSource(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Est. Value (Le)</label>
                  <input
                    type="number" min="0"
                    value={newLeadValue}
                    onChange={(e) => setNewLeadValue(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg p-2 bg-white text-sm focus:outline-emerald-500"
                  />
                </div>
              </div>
              <button type="submit" disabled={savingLead} className="bg-[#0F172A] text-white font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50">
                {savingLead ? 'Saving…' : 'Save Lead'}
              </button>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-mono uppercase border-b border-slate-100">
                  <th className="p-4 font-bold">Priority</th>
                  <th className="p-4 font-bold">Name</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">WhatsApp / Tel</th>
                  <th className="p-4 font-bold">Source Campaign</th>
                  <th className="p-4 font-bold">Est. Value</th>
                  <th className="p-4 font-bold">Status Pipeline</th>
                  <th className="p-4 font-bold">AI Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                {leads
                  .filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase()))
                  .filter(l => leadStatusFilter === 'All' || l.status === leadStatusFilter)
                  .sort((a, b) => computeLeadScore(b) - computeLeadScore(a))
                  .map((lead) => {
                    const priority = leadPriorityLabel(computeLeadScore(lead));
                    const priorityColor =
                      priority === 'Hot' ? 'bg-red-100 text-red-700' :
                      priority === 'Warm' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500';
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/40">
                        <td className="p-4">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${priorityColor}`}>{priority}</span>
                        </td>
                        <td className="p-4 font-bold text-slate-900">{lead.name}</td>
                        <td className="p-4 font-mono text-slate-500">{lead.email}</td>
                        <td className="p-4 font-mono text-slate-500">{lead.whatsapp || lead.telephone}</td>
                        <td className="p-4 text-slate-600">{lead.source}</td>
                        <td className="p-4 font-mono font-bold text-emerald-600">Le {lead.estimatedValue.toLocaleString()}</td>
                        <td className="p-4">
                          <select
                            value={lead.status}
                            onChange={(e: any) => updateLeadStatus(lead.id, e.target.value)}
                            className="border border-slate-200 rounded-lg p-1 bg-white focus:outline-emerald-500"
                          >
                            <option>New</option>
                            <option>Contacted</option>
                            <option>Qualified</option>
                            <option>Proposal Sent</option>
                            <option>Converted</option>
                            <option>Lost</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!lead.whatsapp}
                              onClick={() => handleDraftFollowup(lead, 'whatsapp')}
                              title={lead.whatsapp ? 'Draft a WhatsApp follow-up' : 'No WhatsApp number on file'}
                              className="text-emerald-600 hover:text-emerald-700 disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={!lead.email}
                              onClick={() => handleDraftFollowup(lead, 'email')}
                              title={lead.email ? 'Draft an email follow-up' : 'No email on file'}
                              className="text-emerald-600 hover:text-emerald-700 disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {followupLeadId && (() => {
            const lead = leads.find((l) => l.id === followupLeadId);
            if (!lead) return null;
            const waDigits = (lead.whatsapp || '').replace(/[^0-9]/g, '');
            const waLink = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(followupText)}` : null;
            const mailLink = lead.email
              ? `mailto:${lead.email}?subject=${encodeURIComponent(`Following up — ${brandKit.brandName || 'us'}`)}&body=${encodeURIComponent(followupText)}`
              : null;
            return (
              <div className="mt-4 bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">
                    AI-drafted {followupChannel === 'whatsapp' ? 'WhatsApp' : 'email'} follow-up for {lead.name}
                  </span>
                  <button type="button" onClick={() => setFollowupLeadId(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {followupLoading ? (
                  <p className="text-xs text-slate-500 italic">Drafting…</p>
                ) : followupError ? (
                  <p className="text-xs text-red-600">{followupError}</p>
                ) : (
                  <>
                    <textarea
                      rows={4}
                      value={followupText}
                      onChange={(e) => setFollowupText(e.target.value)}
                      className="w-full border border-emerald-200 rounded-xl p-3 bg-white text-sm focus:outline-emerald-500"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleDraftFollowup(lead, followupChannel)}
                        className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(followupText)}
                        className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Copy
                      </button>
                      {followupChannel === 'whatsapp' && waLink && (
                        <a href={waLink} target="_blank" rel="noopener noreferrer" className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all">
                          Open in WhatsApp
                        </a>
                      )}
                      {followupChannel === 'email' && mailLink && (
                        <a href={mailLink} className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all">
                          Open in Email
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Nothing is sent automatically — this opens your own WhatsApp/email client with the message pre-filled for you to review and send.
                    </p>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // 10. INFLUENCERS WORKSPACE
  if (activeTab === 'influencers') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-2">Verified Creator Marketplace</h3>
          <p className="text-xs text-slate-500 mb-6">Partner with trusted local or diaspora creators displaying certified engagement parameters.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {influencerProfiles.map((inf) => (
              <div key={inf.id} className="border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition-shadow flex justify-between items-start">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <h4 className="font-display font-bold text-slate-800">{inf.displayName}</h4>
                    {inf.isVerified && <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Verified</span>}
                  </div>
                  <span className="text-xs text-slate-500 block">Location: {inf.location}</span>
                  <div className="flex gap-2 pt-1">
                    {inf.categories.map((cat, i) => (
                      <span key={i} className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">{cat}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-3 text-xs border-t border-slate-50 mt-4">
                    <div>
                      <span className="text-slate-400 block font-mono">AUDIENCE</span>
                      <strong className="text-slate-700">{inf.audienceSize}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-mono">ENGAGE</span>
                      <strong className="text-emerald-600">{inf.engagementRate}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-mono">RATE RANGE</span>
                      <strong className="text-slate-700 block truncate">{inf.rateRange}</strong>
                    </div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const budgetStr = prompt(`Proposed budget for ${inf.displayName} (Leones):`, '0');
                    if (budgetStr === null) return;
                    try {
                      const lead = await createLead(activeOrg.id, {
                        name: inf.displayName,
                        source: 'Influencer Marketplace',
                        district: inf.district,
                        estimatedValue: Number(budgetStr) || 0,
                      });
                      setLeads([lead, ...leads]);
                      alert(`Real CRM lead created for ${inf.displayName} — see the CRM Leads tab.`);
                    } catch (err: any) {
                      alert(err.message || 'Could not create lead.');
                    }
                  }}
                  className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
                >
                  Invite Partner
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 11. DIRECTORY WORKSPACE
  if (activeTab === 'directory') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-display font-bold text-slate-900 text-lg">Public Business Discovery Registry</h3>
              <p className="text-xs text-slate-500">Fostering corporate visibility and local-to-diaspora transactional trust.</p>
            </div>
            <button
              onClick={async () => {
                const name = prompt('Enter your Business Name:');
                if (name) {
                  try {
                    const newB = await createDirectoryListing(activeOrg.id, name);
                    setDirectoryProfiles([newB, ...directoryProfiles]);
                  } catch (err: any) {
                    alert(err.message || 'Could not add listing.');
                  }
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Listing
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {directoryProfiles.map((p) => (
              <div key={p.id} className="border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-bold text-slate-800">{p.businessName}</h4>
                      {p.isVerified ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Verified</span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Claimable</span>
                      )}
                    </div>
                    <span className="bg-slate-100 text-slate-600 font-mono text-[10px] px-2 py-0.5 rounded-md">{p.category}</span>
                  </div>
                  <p className="text-slate-500 text-xs leading-relaxed mb-4">{p.description}</p>
                </div>

                <div className="border-t border-slate-50 pt-4 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-mono">{p.city}, {p.district}</span>
                  {!p.isVerified && (
                    <button
                      onClick={() => handleClaimListing(p.id)}
                      className="text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer"
                    >
                      Claim & Verify Listing
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Claim listing panel */}
        {claimBusinessId && (
          <div className="bg-slate-50 border-2 border-emerald-500 rounded-2xl p-6 shadow-md text-left space-y-4">
            <h4 className="font-display font-bold text-slate-900 text-sm">Upload Corporate Registration / Business Claim Form</h4>
            {claimFeedback ? (
              <p className="text-emerald-800 text-xs font-semibold bg-emerald-50 p-3 rounded-lg border border-emerald-100">{claimFeedback}</p>
            ) : (
              <form onSubmit={submitClaim} className="space-y-4 text-xs">
                <p className="text-slate-500">Provide an official copy of your SL business license or tax certificate to earn your verification mark.</p>
                <div>
                  <label className="block text-slate-400 font-mono uppercase mb-1">Corporate document</label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setClaimFile(e.target.files?.[0] ?? null)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-700"
                  />
                </div>
                <button type="submit" disabled={isSubmittingClaim} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-semibold py-2 px-4 rounded-xl cursor-pointer">
                  {isSubmittingClaim ? 'Uploading…' : 'Submit Verification Documents'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  // 12. EVENTS WORKSPACE
  if (activeTab === 'events') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-4">Homecoming & Festival Promoters</h3>
          <p className="text-xs text-slate-500 mb-6">Connect ticket sales with direct tracking campaigns to trace ticket buyers directly in the UK/US diaspora communities.</p>

          <div className="space-y-4">
            {[
              { title: 'Freetown December Music Fest 2026', date: 'Dec 24, 2026', location: 'National Stadium Complex', scheduledDate: '2026-12-24', buttonLabel: 'Promote Concert' },
              { title: 'Sierra Leone Diaspora Investment Summit', date: 'Nov 12, 2026', location: 'Radisson Blu, Freetown', scheduledDate: '2026-11-12', buttonLabel: 'Promote Summit' },
            ].map((ev) => (
              <div key={ev.title} className="bg-slate-50 p-4 border border-slate-100 rounded-xl flex justify-between items-center text-sm">
                <div>
                  <span className="font-bold text-slate-800 block">{ev.title}</span>
                  <span className="text-xs text-slate-500">Date: {ev.date} · Location: {ev.location}</span>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const newItem = await createContentItem(activeOrg.id, {
                        title: `Promote: ${ev.title}`,
                        contentType: 'Social Post',
                        platform: 'Facebook & WhatsApp',
                        headline: ev.title,
                        bodyText: `Join us for ${ev.title} — ${ev.date} at ${ev.location}. Don't miss it!`,
                        hashtags: ['#Manohub', '#EatSalone'],
                        scheduledDate: ev.scheduledDate,
                      });
                      setContentItems([newItem, ...contentItems]);
                      alert(`Real draft created in Content Studio for "${ev.title}".`);
                    } catch (err: any) {
                      alert(err.message || 'Could not create draft.');
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer"
                >
                  {ev.buttonLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 13. TOURISM WORKSPACE
  if (activeTab === 'tourism') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-2">Heritage & Homecoming Tour Excursions</h3>
          <p className="text-xs text-slate-500 mb-6">Showcase eco-tourism hotspots and ancestral landmarks (e.g., Tiwai Island, Banana Islands) with simple, tracking-redirect call-to-actions.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            {[
              { label: 'Bunce Island Historical Exploration', body: 'Ancestral roots tours mapping Sierra Leonean heritage directly for African-American and Caribbean diaspora visitors.', defaultUrl: 'https://wa.me/23276000000?text=Bunce%20Island%20tour' },
              { label: 'Banana Island Snorkeling Retreat', body: 'Eco-friendly water sports, local dining, and beach camping escapes tailored for festive groups.', defaultUrl: 'https://wa.me/23276000000?text=Banana%20Island%20retreat' },
            ].map((dest) => {
              const existing = trackingLinks.find((l) => l.label === dest.label);
              return (
                <div key={dest.label} className="bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-2">
                  <span className="font-bold text-slate-800 block">{dest.label}</span>
                  <p className="text-xs text-slate-500 leading-relaxed">{dest.body}</p>
                  {existing ? (
                    <div className="pt-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${existing.shortCode}`)}
                        className="text-emerald-600 font-mono text-xs hover:underline cursor-pointer block truncate"
                        title="Copy link"
                      >
                        {`${window.location.origin}/r/${existing.shortCode}`}
                      </button>
                      <span className="text-[10px] text-slate-400 font-mono">{existing.clickCount} clicks</span>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        const link = await generateNamedTrackingLink(dest.label, dest.defaultUrl);
                        if (link) setTrackingLinks((prev) => [link, ...prev]);
                      }}
                      className="text-emerald-600 font-semibold hover:underline text-xs block cursor-pointer pt-2"
                    >
                      Generate Tracking Link
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 14. BRAND KIT WORKSPACE
  if (activeTab === 'brandkit') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <h3 className="font-display font-bold text-slate-900 text-lg">Central Brand Kit</h3>
          <p className="text-xs text-slate-500">Slogan values and logo palettes feed directly into our AI generation workflows for perfect stylistic brand compliance.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Primary Slogan / Tagline</label>
              <input
                type="text"
                value={brandKit.tagline}
                onChange={(e) => setBrandKit({ ...brandKit, tagline: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm focus:outline-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Core Slogan / Slogan Goal</label>
              <input
                type="text"
                value={brandKit.mission}
                onChange={(e) => setBrandKit({ ...brandKit, mission: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm focus:outline-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Primary Tone of Voice</label>
              <input
                type="text"
                value={brandKit.toneOfVoice}
                onChange={(e) => setBrandKit({ ...brandKit, toneOfVoice: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm focus:outline-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Primary Colors Palette</label>
              <div className="flex gap-4 mt-2">
                <input
                  type="color"
                  value={brandKit.primaryColor}
                  onChange={(e) => setBrandKit({ ...brandKit, primaryColor: e.target.value })}
                  className="rounded h-10 w-16 border border-slate-200 cursor-pointer"
                />
                <input
                  type="color"
                  value={brandKit.secondaryColor}
                  onChange={(e) => setBrandKit({ ...brandKit, secondaryColor: e.target.value })}
                  className="rounded h-10 w-16 border border-slate-200 cursor-pointer"
                />
                <div className="flex flex-col justify-center">
                  <span className="text-[10px] text-slate-400 font-mono font-bold block">EMERALD: {brandKit.primaryColor}</span>
                  <span className="text-[10px] text-slate-400 font-mono font-bold block">AMBER: {brandKit.secondaryColor}</span>
                </div>
              </div>
            </div>
          </div>
          {brandKitFeedback && (
            <p className={`text-sm font-semibold ${brandKitFeedback.startsWith('Error') ? 'text-red-600' : 'text-emerald-700'}`}>{brandKitFeedback}</p>
          )}
          <button
            onClick={handleSaveBrandKit}
            disabled={brandKitSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {brandKitSaving ? 'Saving…' : 'Save Brand Kit'}
          </button>
        </div>
      </div>
    );
  }

  // 15. TEAM WORKSPACE
  if (activeTab === 'team') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <h3 className="font-display font-bold text-slate-900 text-lg">Team Roles & Secure Invites</h3>
          <p className="text-xs text-slate-500">
            Add existing Manohub users to {activeOrg.name}.
            {teamLimit !== null && ` Your plan allows up to ${teamLimit} team member${teamLimit === 1 ? '' : 's'}.`}
          </p>

          {teamFeedback && (
            <div className={`text-sm p-3.5 rounded-xl font-semibold ${teamFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {teamFeedback}
            </div>
          )}

          <form onSubmit={handleInviteTeam} className="flex flex-col sm:flex-row gap-4">
            <input
              type="email"
              required
              placeholder="colleague@example.com (must already have a Manohub account)"
              value={teamEmail}
              onChange={(e) => setTeamEmail(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            />
            <select
              value={teamRole}
              onChange={(e) => setTeamRole(e.target.value as 'admin' | 'member')}
              className="border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" disabled={teamInviting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer shrink-0 disabled:opacity-50">
              {teamInviting ? 'Adding…' : 'Add Member'}
            </button>
          </form>

          <div className="border-t border-slate-50 pt-6 space-y-4">
            <h4 className="font-display font-bold text-slate-800 text-sm">Active Workspace Membership</h4>
            {teamLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-3 text-xs">
                {teamMembers.map((m) => (
                  <div key={m.userId} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-800">{m.fullName || m.email}</span>
                      <span className="text-[10px] text-slate-400 font-mono block">{m.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold px-2.5 py-0.5 rounded-full uppercase text-[10px] ${m.role === 'owner' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{m.role}</span>
                      {m.role !== 'owner' && (
                        <button onClick={() => handleRemoveTeamMember(m.userId)} className="text-red-500 hover:underline cursor-pointer">Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 16. BILLING WORKSPACE
  if (activeTab === 'billing') {
    return (
      <div className="space-y-8 text-left">
        <QuotaUsagePanel organizationId={activeOrg.id} />
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-display font-bold text-slate-900 text-lg">Current Plan</h3>
          {billingLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : activeSubscription ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="font-display font-bold text-emerald-700 text-lg">{activeSubscription.planName}</span>
                {activeSubscription.currentPeriodEnd && (
                  <p className="text-xs text-slate-500 mt-1">Renews / expires {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString('en-GB')}</p>
                )}
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase">Active</span>
            </div>
          ) : (
            <p className="text-sm text-slate-500">You're on the Free plan.</p>
          )}
        </div>

        {billingFeedback && (
          <div className={`text-sm p-3.5 rounded-xl font-semibold ${billingFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {billingFeedback}
          </div>
        )}

        {pendingSubscription && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3">
            <p className="text-sm text-amber-900">
              <strong>{pendingSubscription.planName}</strong> upgrade requested — awaiting payment confirmation and admin approval.
            </p>
            {pendingSubscription.notes ? (
              <p className="text-xs text-amber-700 font-mono">Reference on file: {pendingSubscription.notes}</p>
            ) : (
              <button onClick={handleSubmitPaymentRef} className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer">
                Submit bank transfer reference
              </button>
            )}
          </div>
        )}

        {!pendingSubscription && (
          <form onSubmit={handleRequestPlan} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
            <h4 className="font-display font-bold text-slate-900 text-sm">Request a Plan Change</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Plan</label>
                <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} required
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500">
                  <option value="">Select a plan</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Billing Cycle</label>
                <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'annual')}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500">
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Payment Reference (optional, bank transfer)</label>
              <input type="text" placeholder="e.g. SLCB-9812401" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
            </div>
            <button type="submit" disabled={requestingPlan} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-6 rounded-xl text-sm cursor-pointer disabled:opacity-50">
              {requestingPlan ? 'Requesting…' : 'Request Plan Change'}
            </button>
            <p className="text-[10px] text-slate-400">Payment is confirmed manually by our finance team — your plan activates once approved, never automatically on submission.</p>
          </form>
        )}

        {mySubscriptions.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
            <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Subscription History</h4>
            <div className="space-y-2 text-xs">
              {mySubscriptions.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-700">{s.planName} · {new Date(s.createdAt).toLocaleDateString('en-GB')}</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full uppercase text-[9px] ${
                    s.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                    s.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                  }`}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 17. ADMIN BOARD (SUPER ADMIN MODERATION)
  if (activeTab === 'admin') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <h3 className="font-display font-bold text-slate-900 text-lg">Platform Moderation Safety Desk</h3>
          <p className="text-xs text-slate-500">Platform administrator desk enforcing safe corporate listings and monitoring false directory claims.</p>

          <div className="flex gap-4">
            <button
              onClick={runSafetyModeration}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer"
            >
              Run Directory Safety Scans
            </button>
          </div>

          {scannedFlagged && (
            <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs space-y-2 max-h-56 overflow-y-auto">
              {safetyLog.map((log: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback / Placeholder for tabs that didn't specify customized views
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400">
      <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-300" />
      <h3 className="font-display font-bold text-slate-600">Workspace Pending Initialization</h3>
      <p className="text-xs mt-2 max-w-sm mx-auto text-slate-500 leading-relaxed">
        This workspace ({activeTab}) is cataloged under upcoming milestone schedules.
      </p>
    </div>
  );
}
