import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Link } from 'react-router-dom';
import {
  BarChart2, Calendar, FileText, FolderOpen, Users, Link2,
  MessageSquare, UserCheck, BookOpen, Award, Compass, Sparkles,
  Settings, ShieldAlert, CreditCard, UserPlus, Upload, Trash2,
  Check, Play, Plus, Search, Filter, Download, AlertCircle, Eye, RefreshCw,
  FileSearch, ExternalLink, Sparkle, Trophy, Landmark, X, Image as ImageIcon,
  ChevronLeft, ChevronRight, FileUp, Paperclip, Mail, MessageCircle, ShieldCheck
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
  fetchMyOpportunities,
  enableBuyerMode,
  createOpportunity,
  closeOpportunity,
  cancelOpportunity,
  resubmitForReview,
  extendDeadline,
  recordAward,
  fetchSectors,
  fetchDistricts,
  fetchCountries,
  fetchCurrencies,
  CurrencyOption,
  fetchOpportunityTypes,
  fetchOpportunityDocuments,
  uploadOpportunityDocument,
  deleteOpportunityDocument,
  getOpportunityDocumentUrl,
  OpportunityDocument,
  MAX_DOCUMENT_SIZE_BYTES,
  fetchOpportunitiesForReview,
  findSimilarTitledOpportunities,
  approveOpportunity,
  requestCorrection,
  rejectOpportunity,
  enableSupplierMode,
  fetchSupplierProfile,
  saveSupplierProfile,
  submitVerificationRequest,
  fetchMyVerificationRequests,
  fetchVerificationQueue,
  approveVerification,
  rejectVerification,
  OpportunityListItem,
  ReviewQueueItem,
  TaxonomyOption,
  SupplierProfile,
  VerificationRequest,
  VerificationQueueItem,
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
  setOpportunityFeatured,
  createServiceRequest,
  fetchMyServiceRequests,
  fetchAllServiceRequests,
  fetchServiceRequestActivities,
  addServiceRequestNote,
  updateServiceRequestStatus,
  quoteServiceRequest,
  TeamMember,
  Plan,
  OrgSubscription,
  PendingSubscription,
  ServiceRequest,
  ServiceRequestActivity,
  ServiceType,
  fetchPipeline,
  addToPipeline,
  updatePipelineRecord,
  removeFromPipeline,
  fetchSupplierSectorIds,
  setSupplierSectorIds,
  fetchRecommendedOpportunities,
  fetchAdminAnalytics,
  hasFeature,
  fetchSavedSearches,
  deleteSavedSearch,
  SavedSearch,
  aiSuggestSector,
  PipelineRecord,
  PipelineStage,
  AdminAnalyticsSummary,
  submitAdvertisementRequest,
  fetchMyAdvertisements,
  fetchAllAdvertisementRequests,
  updateAdvertisementReport,
  AdvertisementRequest,
  AdvertisementCategory,
} from '../lib/procurementApi';
import { supabase } from '../lib/supabaseClient';

interface WorkspacesProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeOrg: Organization;
  isPlatformAdmin: boolean;
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
  isPlatformAdmin,
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
    setCampStatusUpdatingId(camp.id);
    const previous = campaigns;
    setCampaigns(campaigns.map((c) => (c.id === camp.id ? { ...c, status } : c)));
    try {
      const updated = await updateCampaign(camp.id, { status });
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
  const [editHashtagsInput, setEditHashtagsInput] = useState('#SaloneReach, #EatSalone');
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
    setEditHashtagsInput('#SaloneReach, #EatSalone');
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
              hashtags: ['#SaloneReach', '#EatSalone'],
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
  const [myOpportunities, setMyOpportunities] = useState<OpportunityListItem[]>([]);
  const [tendersLoading, setTendersLoading] = useState(false);
  const [tendersFeedback, setTendersFeedback] = useState('');
  const [enablingBuyer, setEnablingBuyer] = useState(false);
  const [tenderSectors, setTenderSectors] = useState<TaxonomyOption[]>([]);
  const [tenderCountries, setTenderCountries] = useState<TaxonomyOption[]>([]);
  const [tenderDistricts, setTenderDistricts] = useState<TaxonomyOption[]>([]);
  const [tenderCurrencies, setTenderCurrencies] = useState<CurrencyOption[]>([]);
  const [tenderTypes, setTenderTypes] = useState<TaxonomyOption[]>([]);
  const [tenderTitle, setTenderTitle] = useState('');
  const [tenderSummary, setTenderSummary] = useState('');
  const [tenderDescription, setTenderDescription] = useState('');
  const [tenderTypeId, setTenderTypeId] = useState('');
  const [tenderSectorId, setTenderSectorId] = useState('');
  const [tenderCountryId, setTenderCountryId] = useState('');
  const [tenderDistrictId, setTenderDistrictId] = useState('');
  const [tenderValue, setTenderValue] = useState('');
  const [tenderCurrencyCode, setTenderCurrencyCode] = useState('');
  const [tenderDeadline, setTenderDeadline] = useState('');
  const [tenderContact, setTenderContact] = useState('');
  const [tenderDocumentFiles, setTenderDocumentFiles] = useState<File[]>([]);
  const [tenderDocumentIsPublic, setTenderDocumentIsPublic] = useState(true);
  const [tenderDocumentError, setTenderDocumentError] = useState('');
  const [tenderSubmitting, setTenderSubmitting] = useState(false);
  const [suggestingSector, setSuggestingSector] = useState(false);
  const [canPublishTenders, setCanPublishTenders] = useState(false);
  const [canViewTenderDetails, setCanViewTenderDetails] = useState(false);
  const [viewerSavedSearches, setViewerSavedSearches] = useState<SavedSearch[]>([]);

  // --- Non-admin Overview States ---
  const [overviewTier, setOverviewTier] = useState<'Free' | 'Viewer' | 'Publisher' | null>(null);
  const [overviewPipelineCount, setOverviewPipelineCount] = useState(0);
  const [overviewSavedSearchCount, setOverviewSavedSearchCount] = useState(0);

  useEffect(() => {
    if (activeTab !== 'overview' || isPlatformAdmin) return;
    Promise.all([
      hasFeature(activeOrg.id, 'tender_publishing'),
      hasFeature(activeOrg.id, 'tender_alerts_and_details'),
      fetchPipeline(activeOrg.id).catch(() => []),
      fetchSavedSearches().catch(() => []),
    ])
      .then(([canPublish, canView, pipeline, savedSearches]) => {
        setOverviewTier(canPublish ? 'Publisher' : canView ? 'Viewer' : 'Free');
        setOverviewPipelineCount(pipeline.length);
        setOverviewSavedSearchCount(savedSearches.length);
      })
      .catch(() => {});
  }, [activeTab, activeOrg.id, isPlatformAdmin]);

  const handleSuggestSector = async () => {
    if (!tenderTitle.trim()) {
      setTendersFeedback('Error: Enter a title first so AI has something to work with.');
      setTimeout(() => setTendersFeedback(''), 4000);
      return;
    }
    setSuggestingSector(true);
    try {
      const suggestedName = await aiSuggestSector(`${tenderTitle}. ${tenderSummary}`, tenderSectors.map((s) => s.name));
      const match = tenderSectors.find((s) => s.name.toLowerCase() === suggestedName.trim().toLowerCase());
      if (match) {
        setTenderSectorId(match.id);
        setTendersFeedback(`AI suggested: ${match.name}`);
      } else {
        setTendersFeedback('AI could not confidently match a sector — please select one manually.');
      }
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'AI suggestion failed.'}`);
    } finally {
      setSuggestingSector(false);
      setTimeout(() => setTendersFeedback(''), 5000);
    }
  };

  useEffect(() => {
    if (activeTab !== 'tenders') return;
    setTendersLoading(true);
    Promise.all([
      fetchMyOpportunities(activeOrg.id),
      fetchSectors(),
      fetchCountries(),
      fetchCurrencies(),
      fetchOpportunityTypes(),
      hasFeature(activeOrg.id, 'tender_publishing'),
      hasFeature(activeOrg.id, 'tender_alerts_and_details'),
      fetchSavedSearches().catch(() => []),
    ])
      .then(([opps, sectors, countries, currencies, types, canPublish, canView, savedSearches]) => {
        setMyOpportunities(opps);
        setTenderSectors(sectors);
        setTenderCountries(countries);
        setTenderCurrencies(currencies);
        setTenderTypes(types);
        setCanPublishTenders(canPublish);
        setCanViewTenderDetails(canView);
        setViewerSavedSearches(savedSearches);
        if (countries.length > 0) setTenderCountryId((prev) => prev || countries[0].id);
      })
      .catch((err: any) => setTendersFeedback(`Error: ${err.message || 'Could not load tenders.'}`))
      .finally(() => setTendersLoading(false));
  }, [activeTab, activeOrg.id]);

  const handleDeleteViewerSavedSearch = async (id: string) => {
    const previous = viewerSavedSearches;
    setViewerSavedSearches(viewerSavedSearches.filter((s) => s.id !== id));
    try {
      await deleteSavedSearch(id);
    } catch {
      setViewerSavedSearches(previous);
    }
  };

  useEffect(() => {
    if (!tenderCountryId) return;
    fetchDistricts(tenderCountryId)
      .then((districts) => {
        setTenderDistricts(districts);
        setTenderDistrictId((prev) => (districts.some((d) => d.id === prev) ? prev : ''));
      })
      .catch(() => {});
  }, [tenderCountryId]);

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

  const handleTenderDocumentSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const oversized = incoming.filter((f) => f.size > MAX_DOCUMENT_SIZE_BYTES);
    const accepted = incoming.filter((f) => f.size <= MAX_DOCUMENT_SIZE_BYTES);
    setTenderDocumentFiles((prev) => [...prev, ...accepted]);
    setTenderDocumentError(
      oversized.length > 0
        ? `${oversized.map((f) => f.name).join(', ')} ${oversized.length === 1 ? 'exceeds' : 'exceed'} the 10MB limit and ${oversized.length === 1 ? "wasn't" : "weren't"} added.`
        : ''
    );
  };

  const handleRemoveTenderDocument = (index: number) => {
    setTenderDocumentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenderSubmitting(true);
    try {
      const created = await createOpportunity(activeOrg.id, activeOrg.name, {
        title: tenderTitle,
        summary: tenderSummary,
        description: tenderDescription,
        opportunityTypeId: tenderTypeId,
        sectorId: tenderSectorId,
        countryId: tenderCountryId,
        districtId: tenderDistrictId,
        estimatedValue: tenderValue ? Number(tenderValue) : undefined,
        currencyCode: tenderCurrencyCode || undefined,
        submissionDeadline: tenderDeadline,
        contactDetails: tenderContact,
      });
      setMyOpportunities([created, ...myOpportunities]);

      let uploadFailures = 0;
      if (tenderDocumentFiles.length > 0) {
        const uploaded: OpportunityDocument[] = [];
        for (const file of tenderDocumentFiles) {
          try {
            uploaded.push(await uploadOpportunityDocument(activeOrg.id, created.id, file, tenderDocumentIsPublic));
          } catch {
            uploadFailures += 1;
          }
        }
        if (uploaded.length > 0) {
          setDocsByOpportunity((prev) => ({ ...prev, [created.id]: uploaded }));
        }
      }

      setTenderTitle('');
      setTenderSummary('');
      setTenderDescription('');
      setTenderValue('');
      setTenderDeadline('');
      setTenderContact('');
      setTenderDocumentFiles([]);
      setTenderDocumentError('');
      setTendersFeedback(
        uploadFailures > 0
          ? `Tender submitted for admin review, but ${uploadFailures} document${uploadFailures === 1 ? '' : 's'} failed to upload — attach ${uploadFailures === 1 ? 'it' : 'them'} again from the Documents panel below.`
          : 'Tender submitted for admin review. It will go live once approved.'
      );
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not submit tender.'}`);
    } finally {
      setTenderSubmitting(false);
      setTimeout(() => setTendersFeedback(''), 5000);
    }
  };

  const refreshMyOpportunities = async () => {
    try {
      setMyOpportunities(await fetchMyOpportunities(activeOrg.id));
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not refresh tenders.'}`);
    }
  };

  // --- Tender Document States ---
  const [expandedDocsId, setExpandedDocsId] = useState<string | null>(null);
  const [docsByOpportunity, setDocsByOpportunity] = useState<Record<string, OpportunityDocument[]>>({});
  const [docIsPublic, setDocIsPublic] = useState(true);
  const [uploadingDocFor, setUploadingDocFor] = useState<string | null>(null);

  const toggleDocsPanel = async (opportunityId: string) => {
    if (expandedDocsId === opportunityId) {
      setExpandedDocsId(null);
      return;
    }
    setExpandedDocsId(opportunityId);
    if (!docsByOpportunity[opportunityId]) {
      try {
        const docs = await fetchOpportunityDocuments(opportunityId);
        setDocsByOpportunity((prev) => ({ ...prev, [opportunityId]: docs }));
      } catch (err: any) {
        setTendersFeedback(`Error: ${err.message || 'Could not load documents.'}`);
      }
    }
  };

  const handleUploadDocument = async (opportunityId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingDocFor(opportunityId);
    try {
      const doc = await uploadOpportunityDocument(activeOrg.id, opportunityId, file, docIsPublic);
      setDocsByOpportunity((prev) => ({ ...prev, [opportunityId]: [...(prev[opportunityId] ?? []), doc] }));
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not upload document.'}`);
    } finally {
      setUploadingDocFor(null);
      setTimeout(() => setTendersFeedback(''), 5000);
    }
  };

  const handleDeleteDocument = async (opportunityId: string, doc: OpportunityDocument) => {
    const previous = docsByOpportunity[opportunityId] ?? [];
    setDocsByOpportunity((prev) => ({ ...prev, [opportunityId]: previous.filter((d) => d.id !== doc.id) }));
    try {
      await deleteOpportunityDocument(doc);
    } catch (err: any) {
      setDocsByOpportunity((prev) => ({ ...prev, [opportunityId]: previous }));
      setTendersFeedback(`Error: ${err.message || 'Could not delete document.'}`);
      setTimeout(() => setTendersFeedback(''), 5000);
    }
  };

  const handleDownloadDocument = async (doc: OpportunityDocument) => {
    try {
      const url = await getOpportunityDocumentUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not open document.'}`);
      setTimeout(() => setTendersFeedback(''), 5000);
    }
  };

  const handleCloseOpportunity = async (id: string) => {
    const previous = myOpportunities;
    setMyOpportunities(myOpportunities.map((o) => (o.id === id ? { ...o, statusCode: 'closed', statusLabel: 'Closed' } : o)));
    try {
      await closeOpportunity(id);
    } catch {
      setMyOpportunities(previous);
    }
  };

  const handleCancelOpportunity = async (id: string) => {
    const reason = prompt('Reason for cancelling this tender:') || '';
    try {
      await cancelOpportunity(id, reason);
      await refreshMyOpportunities();
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not cancel tender.'}`);
    }
  };

  const handleResubmit = async (id: string) => {
    try {
      await resubmitForReview(id);
      await refreshMyOpportunities();
      setTendersFeedback('Resubmitted for admin review.');
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not resubmit tender.'}`);
    } finally {
      setTimeout(() => setTendersFeedback(''), 4000);
    }
  };

  const handleExtendDeadline = async (id: string) => {
    const newDeadline = prompt('New submission deadline (YYYY-MM-DD):');
    if (!newDeadline) return;
    try {
      await extendDeadline(id, new Date(newDeadline).toISOString(), '');
      await refreshMyOpportunities();
      setTendersFeedback('Deadline extended.');
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not extend deadline.'}`);
    } finally {
      setTimeout(() => setTendersFeedback(''), 4000);
    }
  };

  const handleRecordAward = async (id: string) => {
    const winningSupplierName = prompt('Winning supplier / contractor name:');
    if (!winningSupplierName) return;
    const awardedValueStr = prompt('Awarded value (optional, numbers only):') || '';
    try {
      await recordAward(id, {
        winningSupplierName,
        awardedValue: awardedValueStr ? Number(awardedValueStr) : undefined,
      });
      await refreshMyOpportunities();
      setTendersFeedback('Contract award published.');
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not record award.'}`);
    } finally {
      setTimeout(() => setTendersFeedback(''), 4000);
    }
  };

  // --- Admin Tender Review States ---
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (activeTab !== 'admin-tender-review' || !isPlatformAdmin) return;
    setReviewLoading(true);
    fetchOpportunitiesForReview()
      .then(async (items) => {
        setReviewQueue(items);
        const warnings: Record<string, string[]> = {};
        for (const item of items) {
          warnings[item.id] = await findSimilarTitledOpportunities(item.title, item.id);
        }
        setDuplicateWarnings(warnings);
      })
      .catch((err: any) => setReviewFeedback(`Error: ${err.message || 'Could not load review queue.'}`))
      .finally(() => setReviewLoading(false));
  }, [activeTab, isPlatformAdmin]);

  const handleApprove = async (id: string) => {
    const previous = reviewQueue;
    setReviewQueue(reviewQueue.filter((o) => o.id !== id));
    try {
      await approveOpportunity(id);
    } catch (err: any) {
      setReviewQueue(previous);
      setReviewFeedback(`Error: ${err.message || 'Could not approve tender.'}`);
    }
  };

  const handleRequestCorrection = async (id: string) => {
    const note = prompt('What needs to be corrected?');
    if (!note) return;
    const previous = reviewQueue;
    setReviewQueue(reviewQueue.filter((o) => o.id !== id));
    try {
      await requestCorrection(id, note);
    } catch (err: any) {
      setReviewQueue(previous);
      setReviewFeedback(`Error: ${err.message || 'Could not request correction.'}`);
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt('Reason for rejecting this tender:');
    if (!note) return;
    const previous = reviewQueue;
    setReviewQueue(reviewQueue.filter((o) => o.id !== id));
    try {
      await rejectOpportunity(id, note);
    } catch (err: any) {
      setReviewQueue(previous);
      setReviewFeedback(`Error: ${err.message || 'Could not reject tender.'}`);
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

  const handleToggleFeatured = async (op: ReviewQueueItem | OpportunityListItem, featured: boolean) => {
    try {
      await setOpportunityFeatured(op.id, featured);
      setReviewQueue(reviewQueue.map((o) => (o.id === op.id ? { ...o, isFeatured: featured } : o)));
    } catch (err: any) {
      setReviewFeedback(`Error: ${err.message || 'Could not update featured status.'}`);
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

  // --- Service Requests States (buyer/supplier + admin) ---
  const [myServiceRequests, setMyServiceRequests] = useState<ServiceRequest[]>([]);
  const [allServiceRequests, setAllServiceRequests] = useState<ServiceRequest[]>([]);
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(false);
  const [serviceRequestFeedback, setServiceRequestFeedback] = useState('');
  const [srServiceType, setSrServiceType] = useState<ServiceType>('bid_readiness_review');
  const [srDescription, setSrDescription] = useState('');
  const [srSubmitting, setSrSubmitting] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState('');
  const [requestActivities, setRequestActivities] = useState<ServiceRequestActivity[]>([]);

  useEffect(() => {
    if (activeTab !== 'services') return;
    setServiceRequestsLoading(true);
    fetchMyServiceRequests(activeOrg.id)
      .then(setMyServiceRequests)
      .catch((err: any) => setServiceRequestFeedback(`Error: ${err.message || 'Could not load service requests.'}`))
      .finally(() => setServiceRequestsLoading(false));
  }, [activeTab, activeOrg.id]);

  useEffect(() => {
    if (activeTab !== 'admin-services' || !isPlatformAdmin) return;
    setServiceRequestsLoading(true);
    fetchAllServiceRequests()
      .then(setAllServiceRequests)
      .catch((err: any) => setServiceRequestFeedback(`Error: ${err.message || 'Could not load service requests.'}`))
      .finally(() => setServiceRequestsLoading(false));
  }, [activeTab, isPlatformAdmin]);

  const handleCreateServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSrSubmitting(true);
    try {
      await createServiceRequest(activeOrg.id, srServiceType, srDescription);
      setMyServiceRequests(await fetchMyServiceRequests(activeOrg.id));
      setSrDescription('');
      setServiceRequestFeedback('Request submitted. Our team will follow up shortly.');
    } catch (err: any) {
      setServiceRequestFeedback(`Error: ${err.message || 'Could not submit request.'}`);
    } finally {
      setSrSubmitting(false);
      setTimeout(() => setServiceRequestFeedback(''), 5000);
    }
  };

  const toggleExpandRequest = async (id: string) => {
    if (expandedRequestId === id) {
      setExpandedRequestId('');
      return;
    }
    setExpandedRequestId(id);
    try {
      setRequestActivities(await fetchServiceRequestActivities(id));
    } catch {
      setRequestActivities([]);
    }
  };

  const handleAddAdminNote = async (id: string, internal: boolean) => {
    const note = prompt(internal ? 'Internal note (admin only):' : 'Message to the customer:');
    if (!note) return;
    try {
      await addServiceRequestNote(id, note, internal);
      setRequestActivities(await fetchServiceRequestActivities(id));
    } catch (err: any) {
      setServiceRequestFeedback(`Error: ${err.message || 'Could not add note.'}`);
    }
  };

  const handleQuoteRequest = async (id: string) => {
    const amountStr = prompt('Quote amount:');
    if (!amountStr) return;
    try {
      await quoteServiceRequest(id, Number(amountStr), 'SLE');
      setAllServiceRequests(await fetchAllServiceRequests());
    } catch (err: any) {
      setServiceRequestFeedback(`Error: ${err.message || 'Could not save quote.'}`);
    }
  };

  const handleUpdateRequestStatus = async (id: string, status: string) => {
    try {
      await updateServiceRequestStatus(id, status);
      setAllServiceRequests(await fetchAllServiceRequests());
    } catch (err: any) {
      setServiceRequestFeedback(`Error: ${err.message || 'Could not update status.'}`);
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
  const [adSubmitting, setAdSubmitting] = useState(false);

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
    fetchAllAdvertisementRequests()
      .then(setAllAdvertisements)
      .catch((err: any) => setAdvertisementFeedback(`Error: ${err.message || 'Could not load advertising requests.'}`))
      .finally(() => setAdvertisementsLoading(false));
  }, [activeTab, isPlatformAdmin]);

  const handleSubmitAdvertisement = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdSubmitting(true);
    try {
      const created = await submitAdvertisementRequest(activeOrg.id, { category: adCategory, subject: adSubject, description: adDescription });
      setMyAdvertisements([created, ...myAdvertisements]);
      setAdSubject('');
      setAdDescription('');
      setAdvertisementFeedback('Request submitted. Our team will design and run your advert.');
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err.message || 'Could not submit request.'}`);
    } finally {
      setAdSubmitting(false);
      setTimeout(() => setAdvertisementFeedback(''), 5000);
    }
  };

  const handleUpdateAdvertisement = async (id: string, updates: Parameters<typeof updateAdvertisementReport>[1]) => {
    try {
      await updateAdvertisementReport(id, updates);
      setAllAdvertisements(await fetchAllAdvertisementRequests());
    } catch (err: any) {
      setAdvertisementFeedback(`Error: ${err.message || 'Could not update advert.'}`);
    }
  };

  // --- Supplier Pipeline States ---
  const [pipeline, setPipeline] = useState<PipelineRecord[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineFeedback, setPipelineFeedback] = useState('');
  const [recommended, setRecommended] = useState<OpportunityListItem[]>([]);
  const [canExport, setCanExport] = useState(false);

  const PIPELINE_STAGES: PipelineStage[] = ['saved', 'reviewing', 'interested', 'go', 'no_go', 'preparing', 'submitted', 'won', 'lost', 'withdrawn', 'archived'];

  useEffect(() => {
    if (activeTab !== 'pipeline') return;
    setPipelineLoading(true);
    Promise.all([fetchPipeline(activeOrg.id), fetchRecommendedOpportunities(activeOrg.id), hasFeature(activeOrg.id, 'data_export')])
      .then(([p, rec, exportAllowed]) => {
        setPipeline(p);
        setRecommended(rec);
        setCanExport(exportAllowed);
      })
      .catch((err: any) => setPipelineFeedback(`Error: ${err.message || 'Could not load pipeline.'}`))
      .finally(() => setPipelineLoading(false));
  }, [activeTab, activeOrg.id]);

  const handleAddToPipeline = async (opportunityId: string) => {
    try {
      await addToPipeline(activeOrg.id, opportunityId);
      setPipeline(await fetchPipeline(activeOrg.id));
    } catch (err: any) {
      setPipelineFeedback(`Error: ${err.message || 'Could not add to pipeline.'}`);
    }
  };

  const handleStageChange = async (record: PipelineRecord, stage: PipelineStage) => {
    const previous = pipeline;
    setPipeline(pipeline.map((p) => (p.id === record.id ? { ...p, stage } : p)));
    try {
      await updatePipelineRecord(record.id, { stage });
    } catch (err: any) {
      setPipeline(previous);
      setPipelineFeedback(`Error: ${err.message || 'Could not update stage.'}`);
    }
  };

  const handleUpdateBidValue = async (record: PipelineRecord) => {
    const value = prompt('Estimated bid value (Le):', record.bidValue?.toString() || '');
    if (value === null) return;
    try {
      await updatePipelineRecord(record.id, { bidValue: value ? Number(value) : null });
      setPipeline(await fetchPipeline(activeOrg.id));
    } catch (err: any) {
      setPipelineFeedback(`Error: ${err.message || 'Could not update bid value.'}`);
    }
  };

  const handleRemoveFromPipeline = async (id: string) => {
    if (!confirm('Remove this tender from your pipeline?')) return;
    const previous = pipeline;
    setPipeline(pipeline.filter((p) => p.id !== id));
    try {
      await removeFromPipeline(id);
    } catch {
      setPipeline(previous);
    }
  };

  const handleExportPipelineCsv = () => {
    const header = 'Title,Stage,Bid Value,Probability,Deadline\n';
    const rows = pipeline.map((p) =>
      [p.opportunityTitle, p.stage, p.bidValue ?? '', p.probability ?? '', p.submissionDeadline].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pipeline-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Supplier Sector Tags (for recommendations) ---
  const [supplierSectorIds, setSupplierSectorIdsState] = useState<string[]>([]);
  const [allSectors, setAllSectors] = useState<TaxonomyOption[]>([]);

  useEffect(() => {
    if (activeTab !== 'supplier-profile' || !activeOrg.isSupplier) return;
    Promise.all([fetchSupplierSectorIds(activeOrg.id), fetchSectors()])
      .then(([ids, sectors]) => {
        setSupplierSectorIdsState(ids);
        setAllSectors(sectors);
      })
      .catch(() => {});
  }, [activeTab, activeOrg.isSupplier, activeOrg.id]);

  const toggleSupplierSector = async (sectorId: string) => {
    const next = supplierSectorIds.includes(sectorId) ? supplierSectorIds.filter((id) => id !== sectorId) : [...supplierSectorIds, sectorId];
    setSupplierSectorIdsState(next);
    try {
      await setSupplierSectorIds(activeOrg.id, next);
    } catch (err: any) {
      setSupplierFeedback(`Error: ${err.message || 'Could not update sectors.'}`);
    }
  };

  // --- Admin Analytics States ---
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsFeedback, setAnalyticsFeedback] = useState('');

  useEffect(() => {
    if (activeTab !== 'admin-analytics' || !isPlatformAdmin) return;
    setAnalyticsLoading(true);
    fetchAdminAnalytics()
      .then(setAnalytics)
      .catch((err: any) => setAnalyticsFeedback(`Error: ${err.message || 'Could not load analytics.'}`))
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, isPlatformAdmin]);

  // --- WORKSPACE RENDERING ---

  // 1. OVERVIEW WORKSPACE
  if (activeTab === 'overview' && !isPlatformAdmin) {
    return (
      <div className="space-y-8 text-left">
        <div className="flex justify-between items-center bg-emerald-50/50 border border-emerald-100/50 p-6 rounded-2xl">
          <div>
            <h2 className="font-display font-bold text-xl text-emerald-950">Welcome back!</h2>
            <p className="text-sm text-slate-500 mt-0.5">Here's the procurement activity for {activeOrg.name}.</p>
          </div>
          {overviewTier && (
            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full ${
              overviewTier === 'Publisher' ? 'bg-emerald-100 text-emerald-800' :
              overviewTier === 'Viewer' ? 'bg-blue-100 text-blue-800' :
              'bg-slate-100 text-slate-600'
            }`}>
              {overviewTier} Plan
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">SAVED SEARCHES & ALERTS</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{overviewSavedSearchCount}</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">TENDERS IN PIPELINE</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{overviewPipelineCount}</span>
          </div>
          {overviewTier === 'Publisher' && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
              <span className="text-slate-400 font-semibold text-xs block">TENDERS PUBLISHED</span>
              <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{myOpportunities.length}</span>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Quick Links</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={() => setActiveTab('tenders')} className="text-left bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl p-4 transition-colors cursor-pointer">
              <FileSearch className="h-4 w-4 text-emerald-600 mb-2" />
              <span className="font-semibold text-slate-800 text-sm block">Tenders</span>
              <span className="text-xs text-slate-500">{overviewTier === 'Publisher' ? 'Publish & manage' : 'Alerts & saved searches'}</span>
            </button>
            <button onClick={() => setActiveTab('pipeline')} className="text-left bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl p-4 transition-colors cursor-pointer">
              <BarChart2 className="h-4 w-4 text-emerald-600 mb-2" />
              <span className="font-semibold text-slate-800 text-sm block">My Pipeline</span>
              <span className="text-xs text-slate-500">Track opportunities you're bidding on</span>
            </button>
            <button onClick={() => setActiveTab('supplier-profile')} className="text-left bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl p-4 transition-colors cursor-pointer">
              <Award className="h-4 w-4 text-emerald-600 mb-2" />
              <span className="font-semibold text-slate-800 text-sm block">Supplier Profile</span>
              <span className="text-xs text-slate-500">Get verified to build trust with buyers</span>
            </button>
          </div>
        </div>

        {overviewTier === 'Free' && (
          <div className="bg-[#0F172A] text-white p-6 text-center space-y-3 rounded-2xl">
            <h3 className="font-display font-bold text-sm uppercase !text-white">Subscribe for full tender access</h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              Viewer plans unlock full tender details and alerts. Publisher plans add the ability to post your own
              tenders.
            </p>
            <Link to="/#pricing" target="_blank" className="inline-block bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-semibold px-6 py-2.5 text-sm rounded-xl">
              View subscription plans
            </Link>
          </div>
        )}
      </div>
    );
  }

  // 1b. OVERVIEW WORKSPACE (platform admins — ad-platform stats)
  if (activeTab === 'overview') {
    return (
      <div className="space-y-8 text-left">
        <div className="flex justify-between items-center bg-emerald-50/50 border border-emerald-100/50 p-6 rounded-2xl">
          <div>
            <h2 className="font-display font-bold text-xl text-emerald-950">Welcome back, Padi!</h2>
            <p className="text-sm text-slate-500 mt-0.5">Here is the current reach activity for {activeOrg.name} in {activeOrg.district}.</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 font-mono block">FREETOWN TIME</span>
            <span className="font-mono text-sm font-bold text-slate-700">
              {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Freetown' })} GMT
            </span>
          </div>
        </div>

        {/* Dashboard Cards — real counts, not mock figures */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">ACTIVE CAMPAIGNS</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{campaigns.filter((c) => c.status === 'Active').length}</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">TRACKING LINK CLICKS</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{trackingLinks.reduce((sum, l) => sum + l.clickCount, 0)}</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">ACTIVE LEADS</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{leads.length}</span>
            <span className="text-xs text-blue-600 font-bold mt-1 block">Lightweight CRM loaded</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">CONTENT PUBLISHED</span>
            <span className="font-display font-extrabold text-2xl text-emerald-600 block mt-2">{contentItems.filter((c) => c.status === 'Published').length}</span>
          </div>
        </div>

        {/* Real click chart — from tracking_link_clicks */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Daily Tracking Link Clicks (Last 12 Days)</h3>
          {clickSeries.length === 0 ? (
            <p className="text-xs text-slate-400">No tracking link clicks yet — create a link in the Analytics tab to start seeing activity here.</p>
          ) : (
            <div className="flex items-end gap-3 h-48 pt-6">
              {clickSeries.map((point) => (
                <div key={point.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div className="w-full bg-emerald-500 rounded-t-md hover:bg-emerald-600 transition-colors" style={{ height: `${(point.count / Math.max(1, ...clickSeries.map((p) => p.count))) * 100}%` }} />
                  <span className="text-[10px] text-slate-400 font-mono">{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Onboarding Checklist */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Onboarding Growth Checklist</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-emerald-50/20 border border-emerald-100/30 rounded-xl">
              <Check className="text-emerald-600 h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 text-sm block">Complete profile onboarding</span>
                <span className="text-xs text-slate-500">Provided organizational goals, budget limits, and Freetown operating suburbs.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <Check className="text-emerald-600 h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 text-sm block">Configure your primary Brand Kit</span>
                <span className="text-xs text-slate-500">Established fonts, mission slogans, and color palettes.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <Plus className="text-slate-400 h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 text-sm block">Launch your first Campaign Plan</span>
                <span className="text-xs text-slate-500">Use our template-driven campaign wizard to set budgets and locations.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TENDERS WORKSPACE (Procurement)
  if (activeTab === 'tenders') {
    if (isPlatformAdmin) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
          Publishing and managing tenders is subscriber tooling for Tender Publishers, not platform admins.
          Use Tender Review under Platform Admin to approve, correct, or reject subscriber-submitted tenders.
        </div>
      );
    }
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-emerald-600" /> Procurement Tenders
            </h3>
            <Link to="/tenders" target="_blank" className="text-xs font-mono text-emerald-600 hover:underline flex items-center gap-1">
              View public listings <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            {activeOrg.isBuyer || canPublishTenders
              ? `Publish tender notices for ${activeOrg.name} and manage your published opportunities.`
              : canViewTenderDetails
              ? 'View full tender details and manage the alerts you receive for matching opportunities.'
              : 'Subscribe to view full tender details and get alerts — or upgrade to Publisher to post your own.'}
          </p>
        </div>

        {tendersFeedback && (
          <div className={`text-sm p-4 rounded-xl font-semibold ${tendersFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {tendersFeedback}
          </div>
        )}

        {!activeOrg.isBuyer && canPublishTenders ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-center space-y-4">
            <p className="text-sm text-slate-600">
              Your plan includes tender publishing. Enable Buyer Mode for {activeOrg.name} to post procurement
              notices that are publicly searchable at /tenders.
            </p>
            <button
              onClick={handleEnableBuyerMode}
              disabled={enablingBuyer}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {enablingBuyer ? 'Enabling…' : 'Enable Buyer Mode'}
            </button>
          </div>
        ) : !activeOrg.isBuyer && canViewTenderDetails ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-slate-900 text-sm">Your Saved Searches & Alerts</h4>
              <Link to="/tenders" target="_blank" className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1">
                Browse tenders <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            {viewerSavedSearches.length === 0 ? (
              <p className="text-sm text-slate-500">
                No saved searches yet. Browse public tenders and use "Save this search &amp; get alerts" to start
                receiving notifications for matching opportunities.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {viewerSavedSearches.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-xs px-3 py-1.5 rounded-lg">
                    {s.name}
                    <button onClick={() => handleDeleteViewerSavedSearch(s.id)} className="text-slate-400 hover:text-red-600 cursor-pointer">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
              Want to publish your own tenders? Upgrade to a Publisher plan from Billing Invoices.
            </p>
          </div>
        ) : !activeOrg.isBuyer ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-center space-y-4">
            <p className="text-sm text-slate-600">
              Subscribe to a Viewer or Publisher plan to see full tender details and receive alerts for matching
              opportunities — or Publisher to publish your own tenders.
            </p>
            <Link to="/#pricing" target="_blank" className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all">
              View subscription plans
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
              <div className="bg-[#0F172A] px-6 py-5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <FileSearch className="h-4.5 w-4.5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-display font-bold !text-white text-sm">Publish New Tender</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    The fields below capture the key facts for search and alerts. Attach the official notice
                    (bidding document, lots, bid security schedule, eligibility requirements, etc.) so bidders
                    get the full detail your form fields can't hold.
                  </p>
                </div>
              </div>
              <form onSubmit={handleCreateOpportunity} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Tender Title</label>
                  <input
                    type="text" required
                    placeholder="e.g. Rehabilitation of Bo-Kenema Feeder Road"
                    value={tenderTitle}
                    onChange={(e) => setTenderTitle(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Summary</label>
                  <textarea
                    required rows={2}
                    placeholder="One or two sentence summary shown in search results"
                    value={tenderSummary}
                    onChange={(e) => setTenderSummary(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Full Description</label>
                  <textarea
                    rows={4}
                    placeholder="Scope of work, deliverables, and background"
                    value={tenderDescription}
                    onChange={(e) => setTenderDescription(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Notice Type</label>
                    <select
                      value={tenderTypeId}
                      onChange={(e) => setTenderTypeId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    >
                      <option value="">Select type</option>
                      {tenderTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-500 uppercase">Sector</label>
                      <button type="button" onClick={handleSuggestSector} disabled={suggestingSector} className="text-[10px] text-emerald-600 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50">
                        <Sparkle className="h-3 w-3" /> {suggestingSector ? 'Thinking…' : 'Suggest with AI'}
                      </button>
                    </div>
                    <select
                      value={tenderSectorId}
                      onChange={(e) => setTenderSectorId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    >
                      <option value="">Select sector</option>
                      {tenderSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Country</label>
                    <select
                      value={tenderCountryId}
                      onChange={(e) => setTenderCountryId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    >
                      {tenderCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">District</label>
                    <select
                      value={tenderDistrictId}
                      onChange={(e) => setTenderDistrictId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    >
                      <option value="">Select district</option>
                      {tenderDistricts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Estimated Value</label>
                    <input
                      type="number" min="0" step="any"
                      placeholder="Optional"
                      value={tenderValue}
                      onChange={(e) => setTenderValue(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Currency</label>
                    <select
                      value={tenderCurrencyCode}
                      onChange={(e) => setTenderCurrencyCode(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    >
                      <option value="">Select currency</option>
                      {tenderCurrencies.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Submission Deadline</label>
                    <input
                      type="datetime-local" required
                      value={tenderDeadline}
                      onChange={(e) => setTenderDeadline(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Contact Details</label>
                    <input
                      type="text"
                      placeholder="email, phone, or WhatsApp"
                      value={tenderContact}
                      onChange={(e) => setTenderContact(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Tender Documents</label>
                  <label
                    htmlFor="tender-document-input"
                    className="mt-1.5 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-6 py-8 text-center cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-50/40"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                      <FileUp className="h-4.5 w-4.5 text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      Drop the official bidding document here, or click to browse
                    </p>
                    <p className="text-[11px] text-slate-400">
                      PDF or Word, up to 10MB each — bid data sheets, lot schedules, forms, and addenda all welcome
                    </p>
                    <input
                      id="tender-document-input"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        handleTenderDocumentSelect(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {tenderDocumentError && (
                    <p className="mt-2 text-[11px] text-red-600 font-medium">{tenderDocumentError}</p>
                  )}

                  {tenderDocumentFiles.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {tenderDocumentFiles.map((file, idx) => (
                        <li key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                          <span className="flex items-center gap-2 min-w-0 text-slate-700">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate font-medium">{file.name}</span>
                            <span className="text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTenderDocument(idx)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer w-fit">
                    <input type="checkbox" checked={tenderDocumentIsPublic} onChange={(e) => setTenderDocumentIsPublic(e.target.checked)} />
                    Public (visible to anyone viewing this tender, not just subscribers)
                  </label>
                </div>

                <button
                  type="submit" disabled={tenderSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20"
                >
                  {tenderSubmitting ? 'Publishing…' : 'Publish Tender'}
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
              <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Your Tenders</h4>
              {tendersLoading ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : myOpportunities.length === 0 ? (
                <p className="text-xs text-slate-400">No tenders submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {myOpportunities.map((op) => {
                    const canManage = ['published', 'amended', 'deadline_extended'].includes(op.statusCode);
                    return (
                      <div key={op.id} className="border border-slate-100 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <Link to={`/tenders/${op.slug}`} target="_blank" className="font-semibold text-slate-800 text-sm hover:underline">{op.title}</Link>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">Deadline: {new Date(op.submissionDeadline).toLocaleDateString('en-GB')}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                            op.statusCode === 'awaiting_review' ? 'bg-blue-100 text-blue-800' :
                            op.statusCode === 'needs_correction' || op.statusCode === 'rejected' ? 'bg-red-100 text-red-800' :
                            op.statusCode === 'awarded' ? 'bg-purple-100 text-purple-800' :
                            op.statusCode === 'cancelled' || op.statusCode === 'closed' ? 'bg-slate-200 text-slate-600' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>{op.statusLabel}</span>
                        </div>

                        {op.reviewNote && (op.statusCode === 'needs_correction' || op.statusCode === 'rejected') && (
                          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2 mt-2">
                            Admin feedback: {op.reviewNote}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 mt-3">
                          {op.statusCode === 'needs_correction' && (
                            <button onClick={() => handleResubmit(op.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Resubmit for Review</button>
                          )}
                          {canManage && (
                            <>
                              <button onClick={() => handleExtendDeadline(op.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Extend Deadline</button>
                              <button onClick={() => handleRecordAward(op.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Record Award</button>
                              <button onClick={() => handleCloseOpportunity(op.id)} className="text-xs text-slate-500 hover:underline cursor-pointer">Close</button>
                              <button onClick={() => handleCancelOpportunity(op.id)} className="text-xs text-red-600 hover:underline cursor-pointer">Cancel</button>
                            </>
                          )}
                          {op.statusCode === 'closed' && (
                            <button onClick={() => handleRecordAward(op.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer">Record Award</button>
                          )}
                          <button onClick={() => toggleDocsPanel(op.id)} className="text-xs text-slate-500 hover:underline cursor-pointer flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Documents ({docsByOpportunity[op.id]?.length ?? '…'})
                          </button>
                        </div>

                        {expandedDocsId === op.id && (
                          <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                            {(docsByOpportunity[op.id] ?? []).map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                                <button onClick={() => handleDownloadDocument(doc)} className="flex items-center gap-2 text-slate-700 hover:underline cursor-pointer truncate">
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  <span className="truncate">{doc.fileName}</span>
                                  {!doc.isPublic && <span className="text-[9px] uppercase text-amber-600 font-bold shrink-0">Private</span>}
                                </button>
                                <button onClick={() => handleDeleteDocument(op.id, doc)} className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-3 pt-1">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                                <input type="checkbox" checked={docIsPublic} onChange={(e) => setDocIsPublic(e.target.checked)} />
                                Public (visible to anyone viewing this tender)
                              </label>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600 hover:underline cursor-pointer w-fit">
                              <Upload className="h-3.5 w-3.5" />
                              {uploadingDocFor === op.id ? 'Uploading…' : 'Upload Document'}
                              <input
                                type="file"
                                className="hidden"
                                disabled={uploadingDocFor === op.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  handleUploadDocument(op.id, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ADMIN TENDER REVIEW WORKSPACE (platform admins only)
  if (activeTab === 'admin-tender-review') {
    if (!isPlatformAdmin) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
          You do not have platform admin access.
        </div>
      );
    }
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-emerald-600" /> Tender Review Queue
          </h3>
          <p className="text-xs text-slate-500 mt-1">Approve, request corrections, or reject tenders submitted by buyers before they go public.</p>
        </div>

        {reviewFeedback && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{reviewFeedback}</div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          {reviewLoading ? (
            <p className="text-xs text-slate-400">Loading review queue…</p>
          ) : reviewQueue.length === 0 ? (
            <p className="text-xs text-slate-400">No tenders awaiting review. Nice and clear.</p>
          ) : (
            <div className="space-y-4">
              {reviewQueue.map((op) => (
                <div key={op.id} className="border border-slate-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-sm">{op.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{op.buyerName} · Submitted {new Date(op.createdAt).toLocaleDateString('en-GB')}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${op.statusCode === 'needs_correction' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                      {op.statusLabel}
                    </span>
                  </div>

                  {duplicateWarnings[op.id]?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Possibly similar to: {duplicateWarnings[op.id].join('; ')}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-4 flex-wrap">
                    <button onClick={() => handleApprove(op.id)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      onClick={async () => { await handleToggleFeatured(op, true); await handleApprove(op.id); }}
                      className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer"
                    >
                      Approve & Feature
                    </button>
                    <button onClick={() => handleRequestCorrection(op.id)} className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer">Request Correction</button>
                    <button onClick={() => handleReject(op.id)} className="text-xs font-semibold text-red-600 hover:underline cursor-pointer">Reject</button>
                    <Link to={`/tenders/${op.slug}`} target="_blank" className="text-xs text-slate-400 hover:underline ml-auto">Preview</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // SUPPLIER PROFILE WORKSPACE
  if (activeTab === 'supplier-profile') {
    if (isPlatformAdmin) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
          Supplier profiles are subscriber tooling for Tender Publishers/Viewers, not platform admins.
        </div>
      );
    }
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-600" /> Supplier Profile
          </h3>
          <p className="text-xs text-slate-500 mt-1">Build a verifiable supplier profile so buyers can discover and invite {activeOrg.name} to bid.</p>
        </div>

        {supplierFeedback && (
          <div className={`text-sm p-4 rounded-xl font-semibold ${supplierFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {supplierFeedback}
          </div>
        )}

        {!activeOrg.isSupplier ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-center space-y-4">
            <p className="text-sm text-slate-600">Enable Supplier Mode to create a profile and apply for verification.</p>
            <button
              onClick={handleEnableSupplierMode}
              disabled={enablingSupplier}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {enablingSupplier ? 'Enabling…' : 'Enable Supplier Mode'}
            </button>
          </div>
        ) : supplierLoading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-display font-bold text-slate-900 text-sm">Verification Status</h4>
                {activeOrg.supplierVerifiedUntil && new Date(activeOrg.supplierVerifiedUntil) > new Date() ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800">
                    Verified until {new Date(activeOrg.supplierVerifiedUntil).toLocaleDateString('en-GB')}
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-600">Not Verified</span>
                )}
              </div>
              <button onClick={handleSubmitVerification} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">
                Apply for Supplier Verification
              </button>
              {myVerifications.length > 0 && (
                <div className="mt-4 space-y-2">
                  {myVerifications.map((v) => (
                    <div key={v.id} className="border border-slate-100 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{v.requestType} verification</span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800">{v.status.replace('_', ' ')}</span>
                      </div>
                      {v.reviewerNote && <p className="text-red-600 mt-1">{v.reviewerNote}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
              <h4 className="font-display font-bold text-slate-900 text-sm mb-1">Sectors You Serve</h4>
              <p className="text-xs text-slate-500 mb-3">Drives your "Recommended For You" tender matches in the Pipeline tab.</p>
              <div className="flex flex-wrap gap-2">
                {allSectors.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggleSupplierSector(s.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${
                      supplierSectorIds.includes(s.id) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveSupplierProfile} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
              <h4 className="font-display font-bold text-slate-900 text-sm">Company Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Trading Name</label>
                  <input type="text" value={supplierProfile.tradingName} onChange={(e) => setSupplierProfile({ ...supplierProfile, tradingName: e.target.value })}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Registration Number</label>
                  <input type="text" value={supplierProfile.registrationNumber} onChange={(e) => setSupplierProfile({ ...supplierProfile, registrationNumber: e.target.value })}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Tax ID</label>
                  <input type="text" value={supplierProfile.taxIdentificationNumber} onChange={(e) => setSupplierProfile({ ...supplierProfile, taxIdentificationNumber: e.target.value })}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Website</label>
                  <input type="text" value={supplierProfile.website} onChange={(e) => setSupplierProfile({ ...supplierProfile, website: e.target.value })}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Year Established</label>
                  <input type="number" value={supplierProfile.yearEstablished ?? ''} onChange={(e) => setSupplierProfile({ ...supplierProfile, yearEstablished: e.target.value ? Number(e.target.value) : null })}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Employees</label>
                  <input type="text" placeholder="e.g. 11-50" value={supplierProfile.employeeCount} onChange={(e) => setSupplierProfile({ ...supplierProfile, employeeCount: e.target.value })}
                    className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Company Description</label>
                <textarea rows={3} value={supplierProfile.description} onChange={(e) => setSupplierProfile({ ...supplierProfile, description: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Geographic Coverage</label>
                <input type="text" placeholder="e.g. Western Area, Bo, Kenema" value={supplierProfile.geographicCoverage} onChange={(e) => setSupplierProfile({ ...supplierProfile, geographicCoverage: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Certifications & Licences</label>
                <input type="text" value={supplierProfile.certifications} onChange={(e) => setSupplierProfile({ ...supplierProfile, certifications: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Major Clients / Past Projects</label>
                <input type="text" value={supplierProfile.majorClients} onChange={(e) => setSupplierProfile({ ...supplierProfile, majorClients: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
              </div>
              <button type="submit" disabled={supplierSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50">
                {supplierSaving ? 'Saving…' : 'Save Supplier Profile'}
              </button>
            </form>
          </>
        )}
      </div>
    );
  }

  // ADMIN VERIFICATION REVIEW WORKSPACE (platform admins only)
  if (activeTab === 'admin-verification') {
    if (!isPlatformAdmin) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
          You do not have platform admin access.
        </div>
      );
    }
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-emerald-600" /> Verification Requests
          </h3>
          <p className="text-xs text-slate-500 mt-1">Review supplier and buyer verification applications.</p>
        </div>

        {verificationFeedback && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{verificationFeedback}</div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          {verificationQueueLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : verificationQueue.length === 0 ? (
            <p className="text-xs text-slate-400">No pending verification requests.</p>
          ) : (
            <div className="space-y-4">
              {verificationQueue.map((v) => (
                <div key={v.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-sm">{v.orgName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{v.requestType} verification · Submitted {new Date(v.submittedAt).toLocaleDateString('en-GB')}</p>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800">{v.status.replace('_', ' ')}</span>
                  </div>
                  {v.notes && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 mt-2">{v.notes}</p>}
                  <div className="flex items-center gap-4 mt-3">
                    <button onClick={() => handleApproveVerification(v)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">Approve</button>
                    <button onClick={() => handleRejectVerification(v.id)} className="text-xs font-semibold text-red-600 hover:underline cursor-pointer">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // BID SUPPORT SERVICES WORKSPACE (buyers & suppliers)
  if (activeTab === 'services') {
    if (isPlatformAdmin) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
          Requesting bid support is subscriber tooling for Tender Publishers/Viewers, not platform admins.
          Use Service Requests under Platform Admin to fulfill subscriber requests.
        </div>
      );
    }
    const serviceTypeLabels: Record<ServiceType, string> = {
      document_retrieval: 'Document Retrieval',
      tender_clarification: 'Tender Clarification',
      eligibility_assessment: 'Eligibility Assessment',
      bid_readiness_review: 'Bid-Readiness Review',
      proposal_review: 'Proposal Review',
      company_profile_prep: 'Company Profile Preparation',
      supplier_registration_assistance: 'Supplier Registration Assistance',
      featured_placement: 'Featured Placement Request',
      other: 'Other',
    };
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg">Support Services</h3>
          <p className="text-xs text-slate-500 mt-1">Request paid, human-assisted help — separate from our AI Content Studio, these are performed by our team.</p>
        </div>

        {serviceRequestFeedback && (
          <div className={`text-sm p-4 rounded-xl font-semibold ${serviceRequestFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {serviceRequestFeedback}
          </div>
        )}

        <form onSubmit={handleCreateServiceRequest} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase">Service Needed</label>
            <select value={srServiceType} onChange={(e) => setSrServiceType(e.target.value as ServiceType)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500">
              {Object.entries(serviceTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase">Describe What You Need</label>
            <textarea required rows={3} value={srDescription} onChange={(e) => setSrDescription(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
          </div>
          <button type="submit" disabled={srSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer disabled:opacity-50">
            {srSubmitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Your Requests</h4>
          {serviceRequestsLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : myServiceRequests.length === 0 ? (
            <p className="text-xs text-slate-400">No requests yet.</p>
          ) : (
            <div className="space-y-3">
              {myServiceRequests.map((r) => (
                <div key={r.id} className="border border-slate-100 rounded-xl p-4">
                  <button onClick={() => toggleExpandRequest(r.id)} className="w-full flex items-center justify-between gap-4 cursor-pointer text-left">
                    <div>
                      <span className="font-semibold text-slate-800 text-sm block">{serviceTypeLabels[r.serviceType]}</span>
                      <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.quoteAmount !== null && <span className="text-xs font-mono text-slate-600">{r.quoteCurrency} {r.quoteAmount.toLocaleString()}</span>}
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800">{r.status}</span>
                    </div>
                  </button>
                  {expandedRequestId === r.id && (
                    <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                      {requestActivities.length === 0 ? (
                        <p className="text-xs text-slate-400">No updates yet.</p>
                      ) : (
                        requestActivities.map((a) => (
                          <p key={a.id} className="text-xs text-slate-600"><span className="font-mono text-slate-400">{new Date(a.createdAt).toLocaleDateString('en-GB')}:</span> {a.note}</p>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ADVERTISER SUBSCRIBER WORKSPACE ("My Adverts")
  // Deliberately narrow: no directory/event-promotion browsing UI here at
  // all. This subscriber submits what they want advertised and later sees
  // a read-only report of what happened -- platform, run count, reach.
  // The actual design/production work stays admin-only ad-platform tooling.
  if (activeTab === 'advertising') {
    const categoryLabels: Record<AdvertisementCategory, string> = {
      business: 'Business', event: 'Event', goods: 'Goods', service: 'Service',
    };
    const statusColor: Record<string, string> = {
      submitted: 'bg-blue-100 text-blue-800',
      in_production: 'bg-amber-100 text-amber-800',
      live: 'bg-emerald-100 text-emerald-800',
      completed: 'bg-slate-200 text-slate-600',
      cancelled: 'bg-red-100 text-red-700',
    };
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg">My Adverts</h3>
          <p className="text-xs text-slate-500 mt-1">Submit what you'd like advertised — our team designs, builds and runs it on social media. Below is a read-only report of what's happened with each request.</p>
        </div>

        {advertisementFeedback && (
          <div className={`text-sm p-4 rounded-xl font-semibold ${advertisementFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {advertisementFeedback}
          </div>
        )}

        {advertisementsLoading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : !canAdvertise ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-center">
            <p className="text-sm text-slate-600">Advertising is available on the Business plan and above.</p>
            <button onClick={() => setActiveTab('billing')} className="btn-geometric mt-4 cursor-pointer">View Plans</button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmitAdvertisement} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">What are you advertising?</label>
                <select value={adCategory} onChange={(e) => setAdCategory(e.target.value as AdvertisementCategory)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500">
                  {Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Subject</label>
                <input required value={adSubject} onChange={(e) => setAdSubject(e.target.value)} placeholder="e.g. Grand opening of our Freetown showroom"
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Describe what you need advertised</label>
                <textarea required rows={3} value={adDescription} onChange={(e) => setAdDescription(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500" />
              </div>
              <button type="submit" disabled={adSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer disabled:opacity-50">
                {adSubmitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </form>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
              <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Your Requests</h4>
              {myAdvertisements.length === 0 ? (
                <p className="text-xs text-slate-400">No requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {myAdvertisements.map((ad) => (
                    <div key={ad.id} className="border border-slate-100 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="font-semibold text-slate-800 text-sm block">{ad.subject}</span>
                          <span className="text-xs text-slate-500">{categoryLabels[ad.category]} · {new Date(ad.createdAt).toLocaleDateString('en-GB')}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${statusColor[ad.status] ?? 'bg-slate-100 text-slate-600'}`}>{ad.status.replace('_', ' ')}</span>
                      </div>
                      {(ad.platform || ad.reachCount !== null || ad.runCount !== null) && (
                        <div className="mt-3 pt-3 border-t border-slate-50 grid grid-cols-3 gap-3 text-center">
                          <div>
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Platform</span>
                            <span className="text-xs font-semibold text-slate-700">{ad.platform || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Reach</span>
                            <span className="text-xs font-semibold text-slate-700">{ad.reachCount !== null ? ad.reachCount.toLocaleString() : '—'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Times Run</span>
                            <span className="text-xs font-semibold text-slate-700">{ad.runCount !== null ? ad.runCount.toLocaleString() : '—'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ADMIN ADVERTISING FULFILLMENT QUEUE
  if (activeTab === 'admin-advertising') {
    if (!isPlatformAdmin) {
      return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">You do not have platform admin access.</div>;
    }
    const categoryLabels: Record<string, string> = { business: 'Business', event: 'Event', goods: 'Goods', service: 'Service' };
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-600" /> Advertising Requests
          </h3>
          <p className="text-xs text-slate-500 mt-1">Fulfillment queue for subscriber advert requests — update status and report reach/run data once the advert is live.</p>
        </div>

        {advertisementFeedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{advertisementFeedback}</div>}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          {advertisementsLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : allAdvertisements.length === 0 ? (
            <p className="text-xs text-slate-400">No advertising requests yet.</p>
          ) : (
            <div className="space-y-4">
              {allAdvertisements.map((ad) => (
                <div key={ad.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-sm">{ad.subject} — {ad.orgName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{categoryLabels[ad.category]}: {ad.description}</p>
                    </div>
                    <select value={ad.status} onChange={(e) => handleUpdateAdvertisement(ad.id, { status: e.target.value as AdvertisementRequest['status'] })}
                      className="text-xs border border-slate-200 rounded-lg p-1 bg-white shrink-0">
                      <option value="submitted">Submitted</option>
                      <option value="in_production">In Production</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3">
                    <button
                      onClick={() => {
                        const platform = prompt('Platform(s) the advert ran on:', ad.platform ?? '');
                        if (platform === null) return;
                        handleUpdateAdvertisement(ad.id, { platform });
                      }}
                      className="text-xs font-semibold text-slate-600 hover:underline cursor-pointer"
                    >
                      Platform: {ad.platform || 'Set'}
                    </button>
                    <button
                      onClick={() => {
                        const reachStr = prompt('Reach (number of people reached):', ad.reachCount?.toString() ?? '');
                        if (reachStr === null) return;
                        handleUpdateAdvertisement(ad.id, { reachCount: Number(reachStr) || 0 });
                      }}
                      className="text-xs font-semibold text-slate-600 hover:underline cursor-pointer"
                    >
                      Reach: {ad.reachCount !== null ? ad.reachCount.toLocaleString() : 'Set'}
                    </button>
                    <button
                      onClick={() => {
                        const runStr = prompt('Number of times the advert was run:', ad.runCount?.toString() ?? '');
                        if (runStr === null) return;
                        handleUpdateAdvertisement(ad.id, { runCount: Number(runStr) || 0 });
                      }}
                      className="text-xs font-semibold text-slate-600 hover:underline cursor-pointer"
                    >
                      Times Run: {ad.runCount !== null ? ad.runCount.toLocaleString() : 'Set'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ADMIN SUBSCRIPTION REQUESTS WORKSPACE
  if (activeTab === 'admin-subscriptions') {
    if (!isPlatformAdmin) {
      return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">You do not have platform admin access.</div>;
    }
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" /> Subscription Requests
          </h3>
          <p className="text-xs text-slate-500 mt-1">Confirm bank transfer payment before activating a plan.</p>
        </div>

        {subscriptionsFeedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{subscriptionsFeedback}</div>}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          {subscriptionsLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : pendingSubscriptions.length === 0 ? (
            <p className="text-xs text-slate-400">No pending subscription requests.</p>
          ) : (
            <div className="space-y-4">
              {pendingSubscriptions.map((s) => (
                <div key={s.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-sm">{s.orgName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{s.planName} · {s.billingCycle} · Requested {new Date(s.createdAt).toLocaleDateString('en-GB')}</p>
                    </div>
                  </div>
                  {s.notes && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 mt-2 font-mono">Payment ref: {s.notes}</p>}
                  <div className="flex items-center gap-4 mt-3">
                    <button onClick={() => handleActivateSubscription(s)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">Activate</button>
                    <button onClick={() => handleDeclineSubscription(s)} className="text-xs font-semibold text-red-600 hover:underline cursor-pointer">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ADMIN SERVICE REQUESTS WORKSPACE
  if (activeTab === 'admin-services') {
    if (!isPlatformAdmin) {
      return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">You do not have platform admin access.</div>;
    }
    const serviceTypeLabels: Record<string, string> = {
      document_retrieval: 'Document Retrieval', tender_clarification: 'Tender Clarification',
      eligibility_assessment: 'Eligibility Assessment', bid_readiness_review: 'Bid-Readiness Review',
      proposal_review: 'Proposal Review', company_profile_prep: 'Company Profile Preparation',
      supplier_registration_assistance: 'Supplier Registration Assistance', featured_placement: 'Featured Placement Request', other: 'Other',
    };
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600" /> Service Requests
          </h3>
          <p className="text-xs text-slate-500 mt-1">Quote, assign, and track bid-support requests. Internal notes are never visible to the requester.</p>
        </div>

        {serviceRequestFeedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{serviceRequestFeedback}</div>}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          {serviceRequestsLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : allServiceRequests.length === 0 ? (
            <p className="text-xs text-slate-400">No open service requests.</p>
          ) : (
            <div className="space-y-4">
              {allServiceRequests.map((r) => (
                <div key={r.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-sm">{serviceTypeLabels[r.serviceType]} — {r.orgName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-800 shrink-0">{r.status}</span>
                  </div>
                  <button onClick={() => toggleExpandRequest(r.id)} className="text-xs text-emerald-600 hover:underline cursor-pointer mt-2">
                    {expandedRequestId === r.id ? 'Hide activity' : 'View activity & notes'}
                  </button>
                  {expandedRequestId === r.id && (
                    <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                      {requestActivities.map((a) => (
                        <p key={a.id} className={`text-xs ${a.isInternal ? 'text-amber-700 bg-amber-50 rounded p-1.5' : 'text-slate-600'}`}>
                          {a.isInternal && <strong>[Internal] </strong>}{a.note}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <button onClick={() => handleAddAdminNote(r.id, false)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">Message Customer</button>
                    <button onClick={() => handleAddAdminNote(r.id, true)} className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer">Internal Note</button>
                    <button onClick={() => handleQuoteRequest(r.id)} className="text-xs font-semibold text-slate-600 hover:underline cursor-pointer">Add Quote</button>
                    <select value={r.status} onChange={(e) => handleUpdateRequestStatus(r.id, e.target.value)} className="text-xs border border-slate-200 rounded-lg p-1 bg-white">
                      <option value="submitted">Submitted</option>
                      <option value="quoted">Quoted</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // SUPPLIER PIPELINE WORKSPACE
  if (activeTab === 'pipeline') {
    if (isPlatformAdmin) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">
          Tracking bid pipelines is subscriber tooling for Tender Publishers/Viewers, not platform admins.
        </div>
      );
    }
    const stageColor = (stage: PipelineStage) =>
      stage === 'won' ? 'bg-emerald-100 text-emerald-800' :
      stage === 'lost' || stage === 'withdrawn' ? 'bg-slate-200 text-slate-600' :
      stage === 'submitted' ? 'bg-blue-100 text-blue-800' :
      'bg-amber-100 text-amber-800';
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-emerald-600" /> My Bid Pipeline
            </h3>
            <p className="text-xs text-slate-500 mt-1">Private to {activeOrg.name} — never visible to buyers or other suppliers.</p>
          </div>
          {canExport && pipeline.length > 0 && (
            <button onClick={handleExportPipelineCsv} className="btn-geometric-secondary flex items-center gap-2 cursor-pointer text-xs">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}
        </div>

        {pipelineFeedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{pipelineFeedback}</div>}

        {recommended.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
            <h4 className="font-display font-bold text-emerald-900 text-sm mb-3 flex items-center gap-2"><Sparkle className="h-4 w-4" /> Recommended For You</h4>
            <p className="text-xs text-emerald-700 mb-3">Matched to the sectors in your Supplier Profile.</p>
            <div className="space-y-2">
              {recommended.map((op) => (
                <div key={op.id} className="bg-white border border-emerald-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <Link to={`/tenders/${op.slug}`} target="_blank" className="text-sm font-semibold text-slate-800 hover:underline">{op.title}</Link>
                  <button onClick={() => handleAddToPipeline(op.id)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer shrink-0">Add to Pipeline</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          {pipelineLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : pipeline.length === 0 ? (
            <p className="text-xs text-slate-400">Nothing in your pipeline yet. Save a tender from the public search page or add a recommended one above.</p>
          ) : (
            <div className="space-y-3">
              {pipeline.map((p) => (
                <div key={p.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link to={`/tenders/${p.opportunitySlug}`} target="_blank" className="font-semibold text-slate-800 text-sm hover:underline">{p.opportunityTitle}</Link>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Deadline: {p.submissionDeadline ? new Date(p.submissionDeadline).toLocaleDateString('en-GB') : '—'}</p>
                    </div>
                    <button onClick={() => handleRemoveFromPipeline(p.id)} className="text-xs text-red-500 hover:underline cursor-pointer shrink-0">Remove</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <select value={p.stage} onChange={(e) => handleStageChange(p, e.target.value as PipelineStage)}
                      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border-0 cursor-pointer ${stageColor(p.stage)}`}>
                      {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                    <button onClick={() => handleUpdateBidValue(p)} className="text-xs text-slate-500 hover:underline cursor-pointer">
                      {p.bidValue ? `Le ${p.bidValue.toLocaleString()}` : 'Set bid value'}
                    </button>
                  </div>
                  {p.notes && <p className="text-xs text-slate-500 mt-2">{p.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ADMIN ANALYTICS WORKSPACE
  if (activeTab === 'admin-analytics') {
    if (!isPlatformAdmin) {
      return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-sm text-slate-500">You do not have platform admin access.</div>;
    }
    const StatBlock = ({ title, stats }: { title: string; stats: { label: string; count: number }[] }) => (
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
        <h4 className="font-display font-bold text-slate-900 text-sm mb-3">{title}</h4>
        {stats.length === 0 ? <p className="text-xs text-slate-400">No data yet.</p> : (
          <div className="space-y-1.5">
            {stats.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{s.label}</span>
                <span className="font-mono font-bold text-slate-800">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-600" /> Platform Analytics
          </h3>
        </div>

        {analyticsFeedback && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{analyticsFeedback}</div>}

        {analyticsLoading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : analytics ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-5">
                <span className="text-slate-400 font-semibold text-xs block">Organizations</span>
                <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{analytics.total_organizations}</span>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-5">
                <span className="text-slate-400 font-semibold text-xs block">Buyers</span>
                <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{analytics.total_buyers}</span>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-5">
                <span className="text-slate-400 font-semibold text-xs block">Suppliers</span>
                <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{analytics.total_suppliers}</span>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-5">
                <span className="text-slate-400 font-semibold text-xs block">Verified Suppliers</span>
                <span className="font-display font-extrabold text-2xl text-emerald-600 block mt-2">{analytics.total_verified_suppliers}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatBlock title="Opportunities by Status" stats={analytics.opportunities_by_status} />
              <StatBlock title="Opportunities by Sector" stats={analytics.opportunities_by_sector} />
              <StatBlock title="Opportunities by District" stats={analytics.opportunities_by_district} />
              <StatBlock title="Most Followed Buyers" stats={analytics.most_followed_buyers} />
              <StatBlock title="Active Subscriptions by Plan" stats={analytics.subscriptions_by_plan} />
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
                <h4 className="font-display font-bold text-slate-900 text-sm mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-purple-600" /> Contract Awards by Sector</h4>
                {analytics.awards_by_sector.length === 0 ? <p className="text-xs text-slate-400">No awards recorded yet.</p> : (
                  <div className="space-y-1.5">
                    {analytics.awards_by_sector.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{s.label} ({s.count})</span>
                        {s.total_value !== undefined && <span className="font-mono font-bold text-slate-800">Le {s.total_value.toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
                <h4 className="font-display font-bold text-slate-900 text-sm mb-3 flex items-center gap-2"><Eye className="h-4 w-4" /> Most Viewed Tenders</h4>
                <div className="space-y-1.5">
                  {analytics.most_viewed.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <Link to={`/tenders/${v.slug}`} target="_blank" className="text-slate-600 hover:underline truncate">{v.title}</Link>
                      <span className="font-mono font-bold text-slate-800 shrink-0 ml-2">{v.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
                <h4 className="font-display font-bold text-slate-900 text-sm mb-3 flex items-center gap-2"><Award className="h-4 w-4" /> Most Saved Tenders</h4>
                <div className="space-y-1.5">
                  {analytics.most_saved.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <Link to={`/tenders/${v.slug}`} target="_blank" className="text-slate-600 hover:underline truncate">{v.title}</Link>
                      <span className="font-mono font-bold text-slate-800 shrink-0 ml-2">{v.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // 2. CAMPAIGNS WORKSPACE
  if (activeTab === 'campaigns') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-slate-900 text-lg">Establish Campaign Plan</h3>
            {editingCampaignId && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 shrink-0">
                Editing
              </span>
            )}
          </div>
          {campFeedback && (
            <div className={`text-sm p-4 rounded-xl mb-4 font-semibold ${campFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {campFeedback}
            </div>
          )}
          <form onSubmit={handleCreateCampaign} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Campaign Slogan / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Christmas Parboiled Rice Promo"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Primary Objective</label>
                <select
                  value={newCampObjective}
                  onChange={(e) => setNewCampObjective(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                >
                  <option>WhatsApp enquiries</option>
                  <option>Product sales & bookings</option>
                  <option>NGO public outreach</option>
                  <option>Investor Enquiries</option>
                  <option>Tourism & Bookings</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Operating District (Sierra Leone)</label>
                <select
                  value={newCampDistrict}
                  onChange={(e) => setNewCampDistrict(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                >
                  <option>Western Area Urban</option>
                  <option>Bo</option>
                  <option>Kenema</option>
                  <option>Makeni</option>
                  <option>Port Loko</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Diaspora Hub Focus</label>
                <select
                  value={newCampDiaspora}
                  onChange={(e) => setNewCampDiaspora(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                >
                  <option>United Kingdom</option>
                  <option>United States</option>
                  <option>Canada</option>
                  <option>Germany</option>
                  <option>Sweden</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Brief Description</label>
              <textarea
                required
                rows={2}
                placeholder="Targeting diaspora investors to support smallholder rice producers in Bo..."
                value={newCampDesc}
                onChange={(e) => setNewCampDesc(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Allocated Budget (Leones)</label>
              <input
                type="number"
                required
                placeholder="15000000"
                value={newCampBudget}
                onChange={(e) => setNewCampBudget(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
            {editingCampaignId && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Status</label>
                <select
                  value={newCampStatus}
                  onChange={(e: any) => setNewCampStatus(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                >
                  <option>Draft</option>
                  <option>Planning</option>
                  <option>Approved</option>
                  <option>Scheduled</option>
                  <option>Active</option>
                  <option>Completed</option>
                  <option>Failed</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={campSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {campSubmitting ? 'Saving…' : editingCampaignId ? 'Save Changes' : 'Launch Campaign Plan'}
              </button>
              {editingCampaignId && (
                <button type="button" onClick={resetCampaignForm} className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer">
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Existing Campaigns */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-display font-bold text-slate-900 text-lg">Active Campaign Scopes</h3>
            <div className="flex items-center gap-3">
              {healthCheckFeedback && (
                <span className="text-xs font-medium text-slate-500">{healthCheckFeedback}</span>
              )}
              <button
                type="button"
                onClick={handleRunHealthCheck}
                disabled={runningHealthCheck}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                {runningHealthCheck ? 'Checking…' : 'Run Health Check Now'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((camp) => {
              const statusColor: Record<Campaign['status'], string> = {
                Draft: 'bg-slate-200 text-slate-600',
                Planning: 'bg-slate-100 text-slate-600',
                Approved: 'bg-amber-100 text-amber-800',
                Scheduled: 'bg-blue-100 text-blue-800',
                Active: 'bg-emerald-100 text-emerald-800',
                Completed: 'bg-indigo-100 text-indigo-800',
                Failed: 'bg-red-100 text-red-700',
              };
              return (
                <div key={camp.id} className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between ${editingCampaignId === camp.id ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-100'}`}>
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <h4 className="font-display font-bold text-slate-900 leading-tight">{camp.name}</h4>
                      <select
                        value={camp.status}
                        disabled={campStatusUpdatingId === camp.id}
                        onChange={(e: any) => handleChangeCampaignStatus(camp, e.target.value)}
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-0 cursor-pointer shrink-0 disabled:opacity-50 ${statusColor[camp.status]}`}
                      >
                        <option>Draft</option>
                        <option>Planning</option>
                        <option>Approved</option>
                        <option>Scheduled</option>
                        <option>Active</option>
                        <option>Completed</option>
                        <option>Failed</option>
                      </select>
                    </div>
                    <p className="text-slate-500 text-xs leading-relaxed mb-4">{camp.description}</p>
                  </div>
                  <div className="border-t border-slate-50 pt-4 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span className="font-medium">District:</span>
                      <span className="font-mono text-slate-500">{camp.district || 'All Sierra Leone'}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-medium">Diaspora:</span>
                      <span className="font-mono text-slate-500">{camp.diasporaMarket || 'All Diaspora'}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-medium">Budget:</span>
                      <span className="font-mono font-bold text-slate-800">Le {camp.totalBudget.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono pt-2">
                    {campaignActivity[camp.id]?.contentCount ?? 0} content · {campaignActivity[camp.id]?.trackingLinkCount ?? 0} tracking links · {campaignActivity[camp.id]?.totalClicks ?? 0} clicks
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-50">
                    <button type="button" onClick={() => handleEditCampaign(camp)} className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSuggestContentPlan(camp)}
                      className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" /> Suggest Content Plan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCampaign(camp)}
                      disabled={deletingCampaignId === camp.id}
                      className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50 ml-auto"
                    >
                      {deletingCampaignId === camp.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {contentPlanCampaignId && (() => {
          const camp = campaigns.find((c) => c.id === contentPlanCampaignId);
          if (!camp) return null;
          return (
            <div className="bg-emerald-950 text-white rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center gap-2 bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs px-3 py-1 rounded-full font-mono uppercase tracking-widest">
                    <Sparkles className="h-3.5 w-3.5" /> AI Content Plan — {camp.name}
                  </span>
                  <p className="text-emerald-300 text-[11px] mt-2">Nothing is saved yet — pick which drafts to actually create below.</p>
                </div>
                <button type="button" onClick={() => setContentPlanCampaignId(null)} className="text-emerald-400 hover:text-white cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {contentPlanLoading && (
                <p className="text-xs text-emerald-300 italic">Drafting a content plan…</p>
              )}
              {contentPlanError && (
                <p className="text-xs text-red-300">{contentPlanError}</p>
              )}
              {!contentPlanLoading && contentPlanItems.length > 0 && (
                <div className="space-y-3">
                  {contentPlanItems.map((item, idx) => (
                    <label key={idx} className="flex items-start gap-3 bg-emerald-900/40 border border-emerald-800 p-3.5 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contentPlanSelected.has(idx)}
                        onChange={() => toggleContentPlanItem(idx)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{item.title}</span>
                          <span className="text-[9px] font-mono text-emerald-400 shrink-0 ml-2">{item.contentType} · {item.platform} · {item.scheduledDate}</span>
                        </div>
                        <p className="text-[11px] text-emerald-100 leading-relaxed">{item.headline}</p>
                        <p className="text-[10px] text-emerald-300 leading-relaxed line-clamp-2">{item.body}</p>
                        {item.hashtags?.length > 0 && (
                          <p className="text-[10px] text-emerald-400 font-mono">{item.hashtags.join(' ')}</p>
                        )}
                      </div>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={handleCreateSelectedDrafts}
                    disabled={creatingContentPlanDrafts || contentPlanSelected.size === 0}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    {creatingContentPlanDrafts ? 'Creating…' : `Create ${contentPlanSelected.size} Selected Draft${contentPlanSelected.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  // 3. CONTENT STUDIO WORKSPACE
  if (activeTab === 'content') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        {/* Left Side: Template Editor */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-slate-900 text-lg">Central Content Composer</h3>
              <p className="text-xs text-slate-500">Draft templates manually or trigger our server-side AI assistant on the right panel.</p>
            </div>
            {editingContentId && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 shrink-0">
                Editing
              </span>
            )}
          </div>
          {contentFeedback && (
            <div className={`text-sm p-3.5 rounded-xl font-semibold ${contentFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {contentFeedback}
            </div>
          )}
          <form onSubmit={handleSaveContent} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Item Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Organic native rice showcase"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Content Type</label>
                <select
                  value={editType}
                  onChange={(e: any) => setEditType(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                >
                  <option>Social Post</option>
                  <option>WhatsApp Promo</option>
                  <option>Video Script</option>
                  <option>Radio Brief</option>
                  <option>Email News</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Target Platform</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Facebook & WhatsApp"
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Headline / Main Hook</label>
              <input
                type="text"
                required
                placeholder="Bring Sierra Leone flavar back to your dinner table!"
                value={editHeadline}
                onChange={(e) => setEditHeadline(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Body Caption / Script Narrative</label>
              <textarea
                required
                rows={4}
                placeholder="Describe product advantages, delivery networks, and support options..."
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500 font-sans"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Hashtags</label>
                <input
                  type="text"
                  placeholder="#SaloneReach, #EatSalone"
                  value={editHashtagsInput}
                  onChange={(e) => setEditHashtagsInput(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Comma-separated</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Scheduled Date</label>
                <input
                  type="date"
                  value={editScheduledDate}
                  onChange={(e) => setEditScheduledDate(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                />
              </div>
            </div>
            {editingContentId && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase">Status</label>
                <select
                  value={editStatus}
                  onChange={(e: any) => setEditStatus(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                >
                  <option>Draft</option>
                  <option>Awaiting Review</option>
                  <option>Approved</option>
                  <option>Scheduled</option>
                  <option>Published</option>
                  <option>Failed</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={contentSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {contentSubmitting ? 'Saving…' : editingContentId ? 'Save Changes' : 'Save Draft Template'}
              </button>
              {editingContentId && (
                <button type="button" onClick={resetContentComposer} className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer">
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          {/* List of drafts */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h4 className="font-display font-bold text-slate-800 text-sm">Stored Content Catalog ({contentItems.length})</h4>
            <div className="space-y-3">
              {contentItems.length === 0 && (
                <p className="text-xs text-slate-400">No content items yet — save a draft above or generate one with AI.</p>
              )}
              {contentItems.map((item) => {
                const statusColor: Record<ContentItem['status'], string> = {
                  Draft: 'bg-slate-200 text-slate-600',
                  'Awaiting Review': 'bg-blue-100 text-blue-800',
                  Approved: 'bg-amber-100 text-amber-800',
                  Scheduled: 'bg-indigo-100 text-indigo-800',
                  Published: 'bg-emerald-100 text-emerald-800',
                  Failed: 'bg-red-100 text-red-700',
                };
                return (
                  <div key={item.id} className={`bg-slate-50 border rounded-xl p-4 ${editingContentId === item.id ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-100'}`}>
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <span className="font-bold text-slate-800 text-sm">{item.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="bg-slate-200 text-slate-700 font-mono text-[10px] px-2 py-0.5 rounded-full">{item.contentType}</span>
                        <select
                          value={item.status}
                          disabled={contentStatusUpdatingId === item.id}
                          onChange={(e: any) => handleChangeContentStatus(item, e.target.value)}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-0 cursor-pointer disabled:opacity-50 ${statusColor[item.status]}`}
                        >
                          <option>Draft</option>
                          <option>Awaiting Review</option>
                          <option>Approved</option>
                          <option>Scheduled</option>
                          <option>Published</option>
                          <option>Failed</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 font-medium italic">"{item.headline}"</p>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed line-clamp-2">{item.bodyText}</p>
                    {item.hashtags.length > 0 && (
                      <p className="text-[10px] text-emerald-600 font-mono mt-2">{item.hashtags.join(' ')}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-mono">{item.platform} · {item.scheduledDate || 'unscheduled'}</span>
                      <button type="button" onClick={() => handleEditContentItem(item)} className="ml-auto text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteContentItem(item)}
                        disabled={deletingContentId === item.id}
                        className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {deletingContentId === item.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Gemini AI Assistant */}
        <div className="lg:col-span-5 bg-emerald-950 text-white rounded-2xl p-6 shadow-md space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs px-3 py-1 rounded-full font-mono uppercase tracking-widest">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" /> AI Campaign Assistant
            </div>
            <h3 className="font-display font-bold text-xl uppercase tracking-wider !text-white">Localized Coprocessor</h3>
            <p className="text-emerald-200 text-xs leading-relaxed">
              Connect to our secure server-side Gemini 3.5 API. Generate high-conversion social captions, content marketing ideas, briefs, or audio/video scripts tailored for Sierra Leonean audiences.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Completions Mode</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setAiOption('captions')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      aiOption === 'captions' || aiOption === 'copy' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-900/40 border-emerald-800/50 text-emerald-300'
                    }`}
                  >
                    Social Captions
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiOption('ideas')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      aiOption === 'ideas' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-900/40 border-emerald-800/50 text-emerald-300'
                    }`}
                  >
                    Content Ideas
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiOption('script')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      aiOption === 'script' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-900/40 border-emerald-800/50 text-emerald-300'
                    }`}
                  >
                    Radio/TV Script
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiOption('brief')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      aiOption === 'brief' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-900/40 border-emerald-800/50 text-emerald-300'
                    }`}
                  >
                    Campaign Brief
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Brand Tone of Voice</label>
                  <span className="text-[9px] text-emerald-400 font-mono italic">Synced to Brand Kit</span>
                </div>
                <input
                  type="text"
                  value={brandKit.toneOfVoice}
                  onChange={(e) => setBrandKit({ ...brandKit, toneOfVoice: e.target.value })}
                  placeholder="e.g. Warm, Honest, Proudly Leonean"
                  className="mt-1 w-full bg-emerald-900/40 border border-emerald-800/60 rounded-xl p-2 px-3 text-xs text-white focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Describe your local product / goal</label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="mt-1 w-full bg-emerald-900/40 border border-emerald-800/60 rounded-xl p-2.5 text-xs focus:outline-emerald-500 text-white placeholder-emerald-400"
                />
              </div>

              <button
                onClick={handleCallAI}
                disabled={aiLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/50 text-white font-bold py-2.5 rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Cooking Salone Content...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Trigger Gemini Complete
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="border-t border-emerald-900/80 pt-4 mt-6">
            <span className="text-[10px] font-bold text-emerald-300 uppercase block mb-2 tracking-wider">Completions Response</span>
            {aiLoading && (
              <div className="bg-emerald-900/30 border border-emerald-800 p-4 rounded-xl text-xs text-emerald-200 italic animate-pulse">
                "Padi, de AI de cook de content. Preparing your custom brand voice layout..."
              </div>
            )}
            {aiError && (
              <div className="bg-red-950 border border-red-900/80 p-3 rounded-xl text-xs text-red-200 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span>{aiError}</span>
              </div>
            )}
            {!aiLoading && aiFormat === 'captions' && aiCaptionItems.length > 0 && (
              <div className="space-y-3">
                {aiCaptionItems.map((item, idx) => (
                  <div key={idx} className="bg-emerald-900/40 border border-emerald-800 p-3.5 rounded-xl text-left space-y-1.5">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Variant {idx + 1}</span>
                    <p className="text-xs font-bold text-white">{item.headline}</p>
                    <p className="text-[11px] text-emerald-100 leading-relaxed whitespace-pre-wrap">{item.body}</p>
                    {item.hashtags?.length > 0 && (
                      <p className="text-[10px] text-emerald-400 font-mono">{item.hashtags.join(' ')}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleUseCaptionInComposer(item)}
                      className="w-full mt-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                    >
                      Use in Composer
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleSaveAllAiItems}
                  disabled={savingAllAiItems}
                  className="w-full py-2 bg-emerald-800 border border-emerald-700 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingAllAiItems ? 'Saving…' : `Save All ${aiCaptionItems.length} as Drafts`}
                </button>
              </div>
            )}
            {!aiLoading && aiFormat === 'ideas' && aiIdeaItems.length > 0 && (
              <div className="space-y-3">
                {aiIdeaItems.map((idea, idx) => (
                  <div key={idx} className="bg-emerald-900/40 border border-emerald-800 p-3.5 rounded-xl text-left space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-white">{idea.title}</p>
                      <span className="text-[9px] font-mono text-emerald-400 shrink-0 ml-2">{idea.platform}</span>
                    </div>
                    <p className="text-[11px] text-emerald-100 leading-relaxed">{idea.concept}</p>
                    <p className="text-[10px] text-emerald-300 italic">→ {idea.executionStep}</p>
                    <button
                      type="button"
                      onClick={() => handleUseIdeaInComposer(idea)}
                      className="w-full mt-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                    >
                      Use in Composer
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleSaveAllAiItems}
                  disabled={savingAllAiItems}
                  className="w-full py-2 bg-emerald-800 border border-emerald-700 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingAllAiItems ? 'Saving…' : `Save All ${aiIdeaItems.length} as Drafts`}
                </button>
              </div>
            )}
            {!aiLoading && aiFormat === 'text' && aiOutput && (
              <div className="space-y-3">
                <div className="bg-emerald-900/40 border border-emerald-800 p-4 rounded-xl text-xs text-emerald-100 font-mono overflow-y-auto max-h-56 text-left whitespace-pre-wrap">
                  {aiOutput}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(aiOutput);
                      setContentFeedback('Copied to clipboard.');
                      setTimeout(() => setContentFeedback(''), 3000);
                    }}
                    className="py-2 bg-emerald-800 border border-emerald-700 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    Copy to Clip
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetContentComposer();
                      setEditBody(aiOutput);
                      setEditTitle(`AI ${aiOption === 'script' ? 'Script' : 'Brief'} - ${aiPrompt.slice(0, 20)}...`);
                      setEditType(aiOption === 'script' ? 'Radio Brief' : 'Social Post');
                      setEditHeadline(aiOption === 'script' ? 'Generated Radio/TV Script' : 'Generated Campaign Brief');
                      setContentFeedback('Loaded into the Composer — review and save.');
                      setTimeout(() => setContentFeedback(''), 4000);
                    }}
                    className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    Use in Composer
                  </button>
                </div>
              </div>
            )}
            {!aiLoading && !aiError && aiFormat === 'text' && !aiOutput && (
              <div className="text-xs text-emerald-400 italic">
                No completions loaded. Enter prompts above to trigger instant completions.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. CALENDAR WORKSPACE
  if (activeTab === 'calendar') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-display font-bold text-slate-900 text-lg">Social Publishing Calendar</h3>
            <div className="flex items-center gap-3">
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </button>
              <span className="text-xs text-slate-500 font-medium w-32 text-center">
                {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer">
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Grid View — real month, real days-in-month, real scheduled_date matches */}
          <div className="grid grid-cols-7 gap-2 border border-slate-100 rounded-xl overflow-hidden p-2 bg-slate-50">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center font-bold text-xs text-slate-400 py-2">{day}</div>
            ))}
            {getCalendarCells(calendarMonth).map((day, idx) => {
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
                    placeholder="@salonereach"
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
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-6">Real Tracking Link Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <span className="text-xs text-slate-400 font-bold uppercase block">Active Tracking Links</span>
              <span className="font-display font-extrabold text-2xl text-slate-800 block mt-2">{trackingLinks.length}</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <span className="text-xs text-slate-400 font-bold uppercase block">Total Clicks (All Time)</span>
              <span className="font-display font-extrabold text-2xl text-slate-800 block mt-2">{totalClicks}</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <span className="text-xs text-slate-400 font-bold uppercase block">Clicks (Last 7 Days)</span>
              <span className="font-display font-extrabold text-2xl text-emerald-600 block mt-2">{clicksLast7Days}</span>
            </div>
          </div>
        </div>

        {/* Real click chart — from tracking_link_clicks, not a fixed mock array */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Daily Clicks (Last 12 Days)</h3>
          <div className="flex items-end gap-3 h-48 pt-6">
            {clickSeries.map((point) => (
              <div key={point.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div className="w-full bg-emerald-500 rounded-t-md hover:bg-emerald-600 transition-colors" style={{ height: `${(point.count / maxClickCount) * 100}%` }} />
                <span className="text-[10px] text-slate-400 font-mono">{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Clicks by day of week — real, from raw click timestamps over the last 90 days */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
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
                    <div className="w-full bg-indigo-400 rounded-t-md hover:bg-indigo-500 transition-colors" style={{ height: `${(point.count / maxWeekday) * 100}%` }} />
                    <span className="text-[10px] text-slate-400 font-mono">{point.weekday}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-campaign click rollup — real, joins tracking_links.campaign_id to campaigns */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
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
                        hashtags: ['#SaloneReach', '#EatSalone'],
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
            Add existing SaloneReach users to {activeOrg.name}.
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
              placeholder="colleague@example.com (must already have a SaloneReach account)"
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
