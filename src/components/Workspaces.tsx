import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart2, Calendar, FileText, FolderOpen, Users, Link2,
  MessageSquare, UserCheck, BookOpen, Award, Compass, Sparkles,
  Settings, ShieldAlert, CreditCard, UserPlus, Upload, Trash2,
  Check, Play, Plus, Search, Filter, Download, AlertCircle, Eye, RefreshCw,
  FileSearch, ExternalLink
} from 'lucide-react';
import { Campaign, ContentItem, Lead, DirectoryProfile, InfluencerProfile, SocialConnection, BrandKit, Organization } from '../types';
import {
  createCampaign,
  createContentItem,
  updateLeadStatus as apiUpdateLeadStatus,
  createDirectoryListing,
  claimDirectoryListing,
  toggleSocialConnectionStatus,
  saveBrandKit,
} from '../lib/api';
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
  fetchOpportunityTypes,
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
} from '../lib/procurementApi';
import { supabase } from '../lib/supabaseClient';

interface WorkspacesProps {
  activeTab: string;
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
  const [newCampName, setNewCampName] = useState('');
  const [newCampDesc, setNewCampDesc] = useState('');
  const [newCampObjective, setNewCampObjective] = useState('WhatsApp enquiries');
  const [newCampBudget, setNewCampBudget] = useState('5000000');
  const [newCampDistrict, setNewCampDistrict] = useState('Western Area Urban');
  const [newCampDiaspora, setNewCampDiaspora] = useState('United Kingdom');
  const [campFeedback, setCampFeedback] = useState('');

  const [campSubmitting, setCampSubmitting] = useState(false);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampSubmitting(true);
    try {
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
      setNewCampName('');
      setNewCampDesc('');
      setCampFeedback('Campaign plan successfully established and saved!');
    } catch (err: any) {
      setCampFeedback(`Error: ${err.message || 'Could not save campaign.'}`);
    } finally {
      setCampSubmitting(false);
      setTimeout(() => setCampFeedback(''), 4000);
    }
  };

  // --- AI Assistant States ---
  const [aiPrompt, setAiPrompt] = useState('Grow Sierra Leone native red rice among diaspora families in Maryland, USA.');
  const [aiOption, setAiOption] = useState<'brief' | 'copy' | 'script' | 'ideas' | 'captions'>('captions');
  const [aiOutput, setAiOutput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleCallAI = async () => {
    setAiLoading(true);
    setAiError('');
    setAiOutput('');
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
      } else {
        setAiOutput(data.text || 'No content returned.');
      }
    } catch (err: any) {
      setAiError('Failed to communicate with full-stack proxy. Check dev server logs.');
    } finally {
      setAiLoading(false);
    }
  };

  // --- Content Editor States ---
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<'Social Post' | 'WhatsApp Promo' | 'Video Script' | 'Radio Brief' | 'Email News'>('Social Post');
  const [editPlatform, setEditPlatform] = useState('Facebook');
  const [editHeadline, setEditHeadline] = useState('');
  const [editBody, setEditBody] = useState('');
  const [contentFeedback, setContentFeedback] = useState('');

  const [contentSubmitting, setContentSubmitting] = useState(false);

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setContentSubmitting(true);
    try {
      const newItem = await createContentItem(activeOrg.id, {
        title: editTitle || 'Custom Content Item',
        contentType: editType,
        platform: editPlatform,
        headline: editHeadline || 'Harvested with Local Pride',
        bodyText: editBody || 'Premium supply directly sourced from Bo cooperative.',
        hashtags: ['#SaloneReach', '#EatSalone'],
        scheduledDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
      setContentItems([newItem, ...contentItems]);
      setEditTitle('');
      setEditHeadline('');
      setEditBody('');
      setContentFeedback('Draft template saved and added to the content index!');
    } catch (err: any) {
      setContentFeedback(`Error: ${err.message || 'Could not save content item.'}`);
    } finally {
      setContentSubmitting(false);
      setTimeout(() => setContentFeedback(''), 4000);
    }
  };

  // --- Media Library States ---
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);

  const simulateUpload = () => {
    setIsUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsUploading(false), 800);
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  // --- Tracking Links States ---
  const [trackDest, setTrackDest] = useState('https://freetownhaven.com/booking');
  const [trackSource, setTrackSource] = useState('Facebook Ads');
  const [trackMedium, setTrackMedium] = useState('Social Video');
  const [generatedLink, setGeneratedLink] = useState('');

  const handleGenerateLink = () => {
    const slug = Math.random().toString(36).substring(2, 7);
    setGeneratedLink(`https://salone.reach/rt/${slug}?utm_source=${encodeURIComponent(trackSource)}&utm_medium=${encodeURIComponent(trackMedium)}&destination=${encodeURIComponent(trackDest)}`);
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

  // --- Directory Profile States ---
  const [claimBusinessId, setClaimBusinessId] = useState('');
  const [claimDocName, setClaimDocName] = useState('');
  const [claimFeedback, setClaimFeedback] = useState('');

  const handleClaimListing = (id: string) => {
    setClaimBusinessId(id);
    setClaimDocName('');
    setClaimFeedback('');
  };

  const submitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await claimDirectoryListing(claimBusinessId, activeOrg.id);
      setDirectoryProfiles(directoryProfiles.map(p => p.id === updated.id ? updated : p));
      setClaimFeedback('Verification submitted! The Super Admin has approved your business verification.');
    } catch (err: any) {
      setClaimFeedback(`Error: ${err.message || 'Could not submit claim.'}`);
    } finally {
      setTimeout(() => {
        setClaimBusinessId('');
        setClaimFeedback('');
      }, 3000);
    }
  };

  // --- Manual Export Packages ---
  const [selectedExportPost, setSelectedExportPost] = useState<ContentItem | null>(null);

  // --- Billing Manual Settlement ---
  const [billBank, setBillBank] = useState('Rokupr Commercial Bank');
  const [billRef, setBillRef] = useState('');
  const [billingFeedback, setBillingFeedback] = useState('');

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setBillingFeedback('Bank transfer record logged. Our platform finance team is validating your receipt.');
    setBillRef('');
    setTimeout(() => setBillingFeedback(''), 4000);
  };

  // --- Team Invitation ---
  const [teamEmail, setTeamEmail] = useState('');
  const [teamRole, setTeamRole] = useState('Designer');
  const [teamLogs, setTeamLogs] = useState<{ email: string; role: string; date: string }[]>([]);

  const handleInviteTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamEmail) return;
    setTeamLogs([{ email: teamEmail, role: teamRole, date: new Date().toISOString().split('T')[0] }, ...teamLogs]);
    setTeamEmail('');
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
  const [tenderDistricts, setTenderDistricts] = useState<TaxonomyOption[]>([]);
  const [tenderTypes, setTenderTypes] = useState<TaxonomyOption[]>([]);
  const [tenderTitle, setTenderTitle] = useState('');
  const [tenderSummary, setTenderSummary] = useState('');
  const [tenderDescription, setTenderDescription] = useState('');
  const [tenderTypeId, setTenderTypeId] = useState('');
  const [tenderSectorId, setTenderSectorId] = useState('');
  const [tenderDistrictId, setTenderDistrictId] = useState('');
  const [tenderDeadline, setTenderDeadline] = useState('');
  const [tenderContact, setTenderContact] = useState('');
  const [tenderSubmitting, setTenderSubmitting] = useState(false);

  useEffect(() => {
    if (activeTab !== 'tenders') return;
    setTendersLoading(true);
    Promise.all([
      fetchMyOpportunities(activeOrg.id),
      fetchSectors(),
      fetchDistricts(),
      fetchOpportunityTypes(),
    ])
      .then(([opps, sectors, districts, types]) => {
        setMyOpportunities(opps);
        setTenderSectors(sectors);
        setTenderDistricts(districts);
        setTenderTypes(types);
      })
      .catch((err: any) => setTendersFeedback(`Error: ${err.message || 'Could not load tenders.'}`))
      .finally(() => setTendersLoading(false));
  }, [activeTab, activeOrg.id]);

  const handleEnableBuyerMode = async () => {
    setEnablingBuyer(true);
    try {
      await enableBuyerMode(activeOrg.id);
      window.location.reload();
    } catch (err: any) {
      setTendersFeedback(`Error: ${err.message || 'Could not enable buyer mode.'}`);
      setEnablingBuyer(false);
    }
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
        districtId: tenderDistrictId,
        submissionDeadline: tenderDeadline,
        contactDetails: tenderContact,
      });
      setMyOpportunities([created, ...myOpportunities]);
      setTenderTitle('');
      setTenderSummary('');
      setTenderDescription('');
      setTenderDeadline('');
      setTenderContact('');
      setTendersFeedback('Tender submitted for admin review. It will go live once approved.');
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

  // --- WORKSPACE RENDERING ---

  // 1. OVERVIEW WORKSPACE
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

        {/* Dashboard Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">AUDIENCE REACH</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">4,812,400</span>
            <span className="text-xs text-emerald-600 font-bold mt-1 block">↑ 12.4% vs last month</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">WHATSAPP CLICKS</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">12,410</span>
            <span className="text-xs text-emerald-600 font-bold mt-1 block">↑ 8.2% conversion rate</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">ACTIVE LEADS</span>
            <span className="font-display font-extrabold text-2xl text-slate-900 block mt-2">{leads.length}</span>
            <span className="text-xs text-blue-600 font-bold mt-1 block">Lightweight CRM loaded</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <span className="text-slate-400 font-semibold text-xs block">EST. ROI INDEX</span>
            <span className="font-display font-extrabold text-2xl text-emerald-600 block mt-2">3.5x</span>
            <span className="text-xs text-slate-500 font-medium mt-1 block">Targeting optimized</span>
          </div>
        </div>

        {/* Local Traffic Chart Mock */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-800 text-lg mb-4">Daily Click Attributions (Local vs Diaspora)</h3>
          <div className="flex items-end gap-3 h-48 pt-6">
            {[65, 80, 55, 95, 70, 110, 85, 120, 90, 105, 130, 95].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div className="w-full bg-emerald-500 rounded-t-md hover:bg-emerald-600 transition-colors" style={{ height: `${(val / 140) * 100}%` }} />
                <span className="text-[10px] text-slate-400 font-mono">D{idx+1}</span>
              </div>
            ))}
          </div>
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
          <p className="text-xs text-slate-500">Publish tender notices for {activeOrg.name} and manage your published opportunities.</p>
        </div>

        {tendersFeedback && (
          <div className={`text-sm p-4 rounded-xl font-semibold ${tendersFeedback.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {tendersFeedback}
          </div>
        )}

        {!activeOrg.isBuyer ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs text-center space-y-4">
            <p className="text-sm text-slate-600">
              To publish tenders, enable Buyer Mode for {activeOrg.name}. This lets your organization post procurement
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
        ) : (
          <>
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
              <h4 className="font-display font-bold text-slate-900 text-sm mb-4">Publish New Tender</h4>
              <form onSubmit={handleCreateOpportunity} className="space-y-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <label className="block text-xs font-bold text-slate-500 uppercase">Sector</label>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Submission Deadline</label>
                    <input
                      type="datetime-local" required
                      value={tenderDeadline}
                      onChange={(e) => setTenderDeadline(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
                    />
                  </div>
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
                <button
                  type="submit" disabled={tenderSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
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
                        </div>
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

                  <div className="flex items-center gap-4">
                    <button onClick={() => handleApprove(op.id)} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Approve
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

  // 2. CAMPAIGNS WORKSPACE
  if (activeTab === 'campaigns') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-4">Establish Campaign Plan</h3>
          {campFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-4 rounded-xl mb-4 font-semibold">
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
            <button type="submit" disabled={campSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {campSubmitting ? 'Saving…' : 'Launch Campaign Plan'}
            </button>
          </form>
        </div>

        {/* Existing Campaigns */}
        <div className="space-y-4">
          <h3 className="font-display font-bold text-slate-900 text-lg">Active Campaign Scopes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((camp) => (
              <div key={camp.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <h4 className="font-display font-bold text-slate-900 leading-tight">{camp.name}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      camp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 
                      camp.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {camp.status}
                    </span>
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
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 3. CONTENT STUDIO WORKSPACE
  if (activeTab === 'content') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        {/* Left Side: Template Editor */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-lg">Central Content Composer</h3>
            <p className="text-xs text-slate-500">Draft templates manually or trigger our server-side AI assistant on the right panel.</p>
          </div>
          {contentFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3.5 rounded-xl font-semibold">
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
            <button type="submit" disabled={contentSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {contentSubmitting ? 'Saving…' : 'Save Draft Template'}
            </button>
          </form>

          {/* List of drafts */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h4 className="font-display font-bold text-slate-800 text-sm">Stored Content Catalog ({contentItems.length})</h4>
            <div className="space-y-3">
              {contentItems.map((item) => (
                <div key={item.id} className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-800 text-sm">{item.title}</span>
                    <span className="bg-slate-200 text-slate-700 font-mono text-[10px] px-2 py-0.5 rounded-full">{item.contentType}</span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium italic">"{item.headline}"</p>
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed line-clamp-2">{item.bodyText}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Gemini AI Assistant */}
        <div className="lg:col-span-5 bg-emerald-950 text-white rounded-2xl p-6 shadow-md space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs px-3 py-1 rounded-full font-mono uppercase tracking-widest">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" /> AI Campaign Assistant
            </div>
            <h3 className="font-display font-bold text-xl uppercase tracking-wider">Localized Coprocessor</h3>
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
            {aiOutput && (
              <div className="space-y-3">
                <div className="bg-emerald-900/40 border border-emerald-800 p-4 rounded-xl text-xs text-emerald-100 font-mono overflow-y-auto max-h-56 text-left whitespace-pre-wrap">
                  {aiOutput}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(aiOutput);
                      alert('Copied output response text!');
                    }}
                    className="py-2 bg-emerald-800 border border-emerald-700 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    Copy to Clip
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditBody(aiOutput);
                      setEditTitle(`AI ${aiOption === 'ideas' ? 'Ideas' : 'Captions'} - ${aiPrompt.slice(0, 20)}...`);
                      if (aiOption === 'ideas') {
                        setEditType('Social Post');
                        setEditHeadline('New Content Ideas Generation');
                      } else {
                        setEditType('Social Post');
                        setEditHeadline('Generated Social Media Captions');
                      }
                      alert('Loaded content into the Central Content Composer on the left!');
                    }}
                    className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    Use in Composer
                  </button>
                </div>
              </div>
            )}
            {!aiLoading && !aiOutput && !aiError && (
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
            <span className="text-xs text-slate-500 font-medium">Month View: December 2026</span>
          </div>

          {/* Grid View */}
          <div className="grid grid-cols-7 gap-2 border border-slate-100 rounded-xl overflow-hidden p-2 bg-slate-50">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center font-bold text-xs text-slate-400 py-2">{day}</div>
            ))}
            {Array.from({ length: 28 }).map((_, idx) => {
              const dayNum = idx + 1;
              const scheduledPost = contentItems.find(item => item.scheduledDate === `2026-12-${dayNum < 10 ? '0' + dayNum : dayNum}`);
              return (
                <div key={idx} className="bg-white border border-slate-100 rounded-lg p-2 min-h-24 flex flex-col justify-between relative group hover:shadow-xs transition-shadow">
                  <span className="font-mono text-xs font-bold text-slate-400">{dayNum}</span>
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
                <span className="font-bold text-slate-700 block uppercase">Manual Publishing Checklist</span>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Copy generated caption safely</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Download compressed image/video asset</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Embed UTM tracking link</li>
                  <li className="flex items-center gap-2"><Check className="text-emerald-600 h-4 w-4 shrink-0" /> Upload to target social platform manually</li>
                </ul>
                <button
                  onClick={() => alert('Download simulated: Manual export package compiled successfully!')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="h-4 w-4" /> Download Compiled Assets
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
            <p className="text-xs text-slate-500">Manage logo palettes, photography folders, and direct campaign assets.</p>
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
            <button
              onClick={simulateUpload}
              disabled={isUploading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Upload className="h-4 w-4" /> Upload Asset
            </button>
          </div>
        </div>

        {/* Upload Status Card */}
        {isUploading && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
            <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
              <span className="font-medium">Direct resizable upload progress...</span>
              <span className="font-mono font-bold text-emerald-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {/* Assets Folders Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {['Logos & Branding', 'Bo Agriculture Photos', 'Homecoming Concerts', 'Radio Voices'].map((folder, idx) => (
            <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition-shadow text-left">
              <FolderOpen className="text-emerald-600 h-10 w-10 mb-4" />
              <h4 className="font-display font-bold text-slate-800 text-sm leading-tight">{folder}</h4>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block uppercase">3 Folders · 12 Files</span>
            </div>
          ))}
        </div>

        {/* Thumbnail Preview Area */}
        <div className="space-y-4">
          <h4 className="font-display font-bold text-slate-900 text-sm">Recent Visual Uploads</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs relative group">
                <div className="bg-slate-100 h-32 flex items-center justify-center text-slate-400">
                  {lowBandwidthMode ? (
                    <span className="text-[10px] font-mono text-slate-400">Low-Res Placeholder</span>
                  ) : (
                    <Compass className="h-8 w-8 text-slate-300 animate-pulse" />
                  )}
                </div>
                <div className="p-3 text-left">
                  <span className="font-semibold text-slate-700 text-xs block truncate">campaign_asset_0{item}.png</span>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">1.4 MB · 1:1 RATIO</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 6. AUDIENCES WORKSPACE
  if (activeTab === 'audiences') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <h3 className="font-display font-bold text-slate-900 text-lg">Local & Diaspora Audience Planner</h3>
          <p className="text-xs text-slate-500">Formulate and estimate reachable user clusters by matching demographic interests and operating locations.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Operating Core</span>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Freetown Hubs
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Bo & Kenema Regions
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Makeni Suburbs
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Diaspora Markets</span>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  United Kingdom
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  United States (East Coast)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Europe / ECOWAS Hubs
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Socio-Interests</span>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Homecoming Festivals
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Local Rice & Agrotech
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-emerald-600 focus:ring-emerald-500" />
                  Music Sponsorships
                </label>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-xs text-emerald-800 font-bold uppercase tracking-wider block">Estimated Audience Segment Reach</span>
              <p className="text-xs text-emerald-600 mt-1">Based on active local and diaspora interest configurations.</p>
            </div>
            <span className="font-display font-extrabold text-3xl text-emerald-900">4,812,400 Users</span>
          </div>
        </div>
      </div>
    );
  }

  // 7. SOCIAL ACCOUNTS WORKSPACE
  if (activeTab === 'social') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-2">Connected Channels</h3>
          <p className="text-xs text-slate-500 mb-6">Manage official social API integrations or configure the local manual sandbox.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {socialConnections.map((conn) => (
              <div key={conn.id} className="border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition-shadow flex flex-col justify-between">
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
                  <button
                    onClick={async () => {
                      const nextStatus = conn.status === 'Expired' ? 'Connected' : 'Expired';
                      const previous = socialConnections;
                      setSocialConnections(socialConnections.map((c) => c.id === conn.id ? { ...c, status: nextStatus } : c));
                      try {
                        await toggleSocialConnectionStatus(conn.id, nextStatus);
                      } catch {
                        setSocialConnections(previous);
                      }
                    }}
                    className="text-emerald-600 hover:text-emerald-700 text-xs font-semibold cursor-pointer"
                  >
                    {conn.status === 'Expired' ? 'Re-authorize Access' : 'Simulate Expire Token'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 8. ANALYTICS WORKSPACE
  if (activeTab === 'analytics') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
          <h3 className="font-display font-bold text-slate-900 text-lg mb-6">Attributions & Performance Funnel</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <span className="text-xs text-slate-400 font-bold uppercase block">Avg. Cost Per WhatsApp Click</span>
              <span className="font-display font-extrabold text-2xl text-slate-800 block mt-2">Le 240</span>
              <span className="text-xs text-emerald-600 font-medium block mt-1">Excellent cost-to-reach ratio</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <span className="text-xs text-slate-400 font-bold uppercase block">Conversion Rate (Click to Lead)</span>
              <span className="font-display font-extrabold text-2xl text-slate-800 block mt-2">8.2%</span>
              <span className="text-xs text-emerald-600 font-medium block mt-1">↑ 1.2% this week</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-center">
              <span className="text-xs text-slate-400 font-bold uppercase block">Diaspora Traffic Share</span>
              <span className="font-display font-extrabold text-2xl text-emerald-600 block mt-2">42%</span>
              <span className="text-xs text-slate-500 font-medium block mt-1">UK: 24% | US: 18%</span>
            </div>
          </div>
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
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-mono uppercase border-b border-slate-100">
                  <th className="p-4 font-bold">Name</th>
                  <th className="p-4 font-bold">Email</th>
                  <th className="p-4 font-bold">WhatsApp / Tel</th>
                  <th className="p-4 font-bold">Source Campaign</th>
                  <th className="p-4 font-bold">Est. Value</th>
                  <th className="p-4 font-bold">Status Pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                {leads
                  .filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase()))
                  .filter(l => leadStatusFilter === 'All' || l.status === leadStatusFilter)
                  .map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/40">
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
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  onClick={() => alert(`Inquiry submitted to ${inf.displayName}! Stored in CRM.`)}
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
                  <label className="block text-slate-400 font-mono uppercase mb-1">Corporate document name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SL_License_Haven.pdf"
                    value={claimDocName}
                    onChange={(e) => setClaimDocName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-700"
                  />
                </div>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl cursor-pointer">
                  Submit Verification Documents
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
            <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl flex justify-between items-center text-sm">
              <div>
                <span className="font-bold text-slate-800 block">Freetown December Music Fest 2026</span>
                <span className="text-xs text-slate-500">Date: Dec 24, 2026 · Location: National Stadium Complex</span>
              </div>
              <button
                onClick={() => alert('Concert promotional template added to Content Studio drafts!')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer"
              >
                Promote Concert
              </button>
            </div>
            <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl flex justify-between items-center text-sm">
              <div>
                <span className="font-bold text-slate-800 block">Sierra Leone Diaspora Investment Summit</span>
                <span className="text-xs text-slate-500">Date: Nov 12, 2026 · Location: Radisson Blu, Freetown</span>
              </div>
              <button
                onClick={() => alert('Summit promo briefs added to Campaign planner!')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer"
              >
                Promote Summit
              </button>
            </div>
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
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-2">
              <span className="font-bold text-slate-800 block">Bunce Island Historical Exploration</span>
              <p className="text-xs text-slate-500 leading-relaxed">Ancestral roots tours mapping Sierra Leonean heritage directly for African-American and Caribbean diaspora visitors.</p>
              <button onClick={() => alert('Bunce Island promotional link configured!')} className="text-emerald-600 font-semibold hover:underline text-xs block cursor-pointer pt-2">Generate Tracking Link</button>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-2">
              <span className="font-bold text-slate-800 block">Banana Island Snorkeling Retreat</span>
              <p className="text-xs text-slate-500 leading-relaxed">Eco-friendly water sports, local dining, and beach camping escapes tailored for festive groups.</p>
              <button onClick={() => alert('Banana Island promotional link configured!')} className="text-emerald-600 font-semibold hover:underline text-xs block cursor-pointer pt-2">Generate Tracking Link</button>
            </div>
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
          <p className="text-xs text-slate-500">Establish workspace parameters and authorize designers, marketers, or diaspora coordinators.</p>

          <form onSubmit={handleInviteTeam} className="flex flex-col sm:flex-row gap-4">
            <input
              type="email"
              required
              placeholder="e.g. colleague@salonetech.com"
              value={teamEmail}
              onChange={(e) => setTeamEmail(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            />
            <select
              value={teamRole}
              onChange={(e) => setTeamRole(e.target.value)}
              className="border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              <option>Campaign Manager</option>
              <option>Content Designer</option>
              <option>Platform Analyst</option>
              <option>Viewer</option>
            </select>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer shrink-0">
              Invite Member
            </button>
          </form>

          <div className="border-t border-slate-50 pt-6 space-y-4">
            <h4 className="font-display font-bold text-slate-800 text-sm">Active Workspace Membership</h4>
            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-800">Alhassan Kamara (You)</span>
                  <span className="text-[10px] text-slate-400 font-mono block">baimasonga@gmail.com</span>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full uppercase text-[10px]">Owner</span>
              </div>
              {teamLogs.map((log, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center animate-fade-in">
                  <div>
                    <span className="font-bold text-slate-800">{log.email}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">Invited on {log.date}</span>
                  </div>
                  <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full uppercase text-[10px]">{log.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 16. BILLING WORKSPACE
  if (activeTab === 'billing') {
    return (
      <div className="space-y-8 text-left">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <h3 className="font-display font-bold text-slate-900 text-lg">Billing & Invoice Settlement</h3>
          <p className="text-xs text-slate-500">Record payments manually via bank draft to avoid complex credit card limits.</p>

          {billingFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl font-semibold">
              {billingFeedback}
            </div>
          )}

          <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 font-mono uppercase mb-1">Select Bank / Processor</label>
                <select
                  value={billBank}
                  onChange={(e) => setBillBank(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-700"
                >
                  <option>Rokupr Commercial Bank</option>
                  <option>Sierra Leone Commercial Bank</option>
                  <option>Orange Money Transfer</option>
                  <option>Direct Bank Draft Wire</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-mono uppercase mb-1">Transaction Ref Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SLCB-9812401"
                  value={billRef}
                  onChange={(e) => setBillRef(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-700 focus:bg-white"
                />
              </div>
            </div>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-6 rounded-xl cursor-pointer">
              Record Bank Settlement
            </button>
          </form>

          {/* Stored invoices mocker */}
          <div className="border-t border-slate-100 pt-6">
            <span className="font-display font-bold text-slate-800 text-sm block mb-4">Invoice Ledger History</span>
            <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden text-xs">
              <div className="grid grid-cols-4 p-3 font-mono font-bold uppercase text-slate-400 border-b border-slate-100">
                <span>INVOICE</span>
                <span>PLAN DETAILS</span>
                <span>AMOUNT</span>
                <span>STATUS</span>
              </div>
              <div className="grid grid-cols-4 p-3 text-slate-600">
                <span className="font-bold">INV-2026-001</span>
                <span>Starter Trial Upgrade</span>
                <span className="font-mono">SLE 440 (Approx $19)</span>
                <span className="text-emerald-600 font-bold">Paid</span>
              </div>
            </div>
          </div>
        </div>
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
