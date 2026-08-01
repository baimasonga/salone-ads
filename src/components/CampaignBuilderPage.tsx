import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Edit3,
  Eye,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Plus,
  Send,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { Organization } from '../types';
import {
  AdCampaign,
  AdCampaignChannel,
  AdCampaignDevice,
  AdCampaignObjective,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  fetchCampaignCreatives,
  fetchCampaignsForWorkspace,
  Advert,
  reviewCampaign,
  updateAdCampaign,
} from '../lib/advertisingApi';

interface CampaignBuilderPageProps {
  activeOrg: Organization;
  isPlatformAdmin: boolean;
}
const OBJECTIVES: Array<{ value: AdCampaignObjective; label: string; description: string }> = [
  { value: 'awareness', label: 'Awareness', description: 'Maximise qualified reach and advert views.' },
  { value: 'traffic', label: 'Traffic', description: 'Send more visitors to a website or social page.' },
  { value: 'leads', label: 'Leads', description: 'Generate WhatsApp, phone, or form enquiries.' },
  { value: 'sales', label: 'Sales', description: 'Drive and measure confirmed purchases.' },
];

const LOCATIONS = [
  'Western Area Urban',
  'Western Area Rural',
  'Bo',
  'Bombali',
  'Bonthe',
  'Falaba',
  'Kailahun',
  'Kambia',
  'Karene',
  'Kenema',
  'Koinadugu',
  'Kono',
  'Moyamba',
  'Port Loko',
  'Pujehun',
  'Tonkolili',
  'Sierra Leone diaspora',
];

const CATEGORIES = ['Business', 'Events', 'Goods', 'Professional services', 'Tourism', 'Education'];
const DEVICES: Array<{ value: AdCampaignDevice; label: string }> = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'tablet', label: 'Tablet' },
];
const CHANNELS: Array<{ value: AdCampaignChannel; label: string; description: string }> = [
  { value: 'manohub', label: 'Manohub', description: 'Paid adverts delivered inside Manohub.' },
  { value: 'facebook', label: 'Facebook', description: 'Facebook posts and promotion tracking.' },
  { value: 'instagram', label: 'Instagram', description: 'Instagram content and promotion tracking.' },
  { value: 'whatsapp', label: 'WhatsApp', description: 'WhatsApp promotion and enquiry activity.' },
  { value: 'tiktok', label: 'TikTok', description: 'TikTok content and promotion tracking.' },
  { value: 'youtube', label: 'YouTube', description: 'YouTube video activity.' },
  { value: 'linkedin', label: 'LinkedIn', description: 'LinkedIn content activity.' },
  { value: 'x', label: 'X', description: 'Posts and promotion activity on X.' },
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'border-slate-300 bg-slate-50 text-slate-700',
  submitted: 'border-blue-300 bg-blue-50 text-blue-800',
  approved: 'border-indigo-300 bg-indigo-50 text-indigo-800',
  rejected: 'border-red-300 bg-red-50 text-red-800',
  active: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  paused: 'border-amber-300 bg-amber-50 text-amber-800',
  completed: 'border-slate-300 bg-slate-100 text-slate-600',
};

interface CampaignForm {
  name: string;
  description: string;
  objective: AdCampaignObjective;
  startDate: string;
  endDate: string;
  totalBudget: string;
  dailyBudget: string;
  currencyCode: string;
  reachGoal: string;
  locationTargets: string[];
  categoryTargets: string[];
  deviceTargets: AdCampaignDevice[];
  channels: AdCampaignChannel[];
}

const EMPTY_FORM: CampaignForm = {
  name: '',
  description: '',
  objective: 'awareness',
  startDate: '',
  endDate: '',
  totalBudget: '',
  dailyBudget: '',
  currencyCode: 'SLE',
  reachGoal: '',
  locationTargets: [],
  categoryTargets: [],
  deviceTargets: ['mobile'],
  channels: ['manohub'],
};

const money = (value: number | null, currency: string) =>
  value === null
    ? 'Not set'
    : new Intl.NumberFormat('en-SL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : 'Not set';

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function campaignToForm(campaign: AdCampaign): CampaignForm {
  return {
    name: campaign.name,
    description: campaign.description,
    objective: campaign.objective,
    startDate: campaign.startDate ?? '',
    endDate: campaign.endDate ?? '',
    totalBudget: campaign.totalBudget?.toString() ?? '',
    dailyBudget: campaign.dailyBudget?.toString() ?? '',
    currencyCode: campaign.currencyCode,
    reachGoal: campaign.reachGoal?.toString() ?? '',
    locationTargets: campaign.locationTargets,
    categoryTargets: campaign.categoryTargets,
    deviceTargets: campaign.deviceTargets,
    channels: campaign.channels,
  };
}

export function CampaignBuilderPage({ activeOrg, isPlatformAdmin }: CampaignBuilderPageProps) {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [creatives, setCreatives] = useState<Record<string, Advert[]>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const nextCampaigns = await fetchCampaignsForWorkspace(activeOrg.id, isPlatformAdmin);
      setCampaigns(nextCampaigns);
      setCreatives(await fetchCampaignCreatives(nextCampaigns.map((campaign) => campaign.id)));
      setFeedback(null);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Campaigns could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, [activeOrg.id, isPlatformAdmin]);

  const summary = useMemo(() => ({
    total: campaigns.length,
    drafts: campaigns.filter((campaign) => campaign.status === 'draft' || campaign.status === 'rejected').length,
    review: campaigns.filter((campaign) => campaign.status === 'submitted').length,
    running: campaigns.filter((campaign) => campaign.status === 'active').length,
  }), [campaigns]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setStep(1);
    setFeedback(null);
    setWizardOpen(true);
  };

  const openEdit = (campaign: AdCampaign) => {
    setEditingId(campaign.id);
    setForm(campaignToForm(campaign));
    setStep(1);
    setFeedback(null);
    setWizardOpen(true);
  };

  const validateStep = (targetStep: number) => {
    if (targetStep >= 1 && !form.name.trim()) return 'Enter a campaign name.';
    if (targetStep >= 1 && !form.description.trim()) return 'Describe what the campaign should achieve.';
    if (targetStep >= 1 && form.channels.length === 0) return 'Choose at least one delivery channel.';
    if (targetStep >= 2 && form.startDate && form.endDate && form.endDate < form.startDate) {
      return 'The end date must be on or after the start date.';
    }
    if (targetStep >= 2 && Number(form.totalBudget || 0) < 0) return 'The total budget cannot be negative.';
    if (targetStep >= 2 && Number(form.dailyBudget || 0) < 0) return 'The daily budget cannot be negative.';
    if (
      targetStep >= 2
      && form.totalBudget
      && form.dailyBudget
      && Number(form.dailyBudget) > Number(form.totalBudget)
    ) return 'The daily budget cannot be greater than the total budget.';
    if (targetStep >= 3 && form.locationTargets.length === 0) return 'Choose at least one target location.';
    if (targetStep >= 3 && form.deviceTargets.length === 0) return 'Choose at least one device.';
    return null;
  };

  const nextStep = () => {
    const issue = validateStep(step);
    if (issue) {
      setFeedback(issue);
      return;
    }
    setFeedback(null);
    setStep((current) => Math.min(3, current + 1));
  };

  const save = async (status: 'draft' | 'submitted') => {
    const issue = validateStep(status === 'submitted' ? 3 : 1);
    if (issue) {
      setFeedback(issue);
      return;
    }
    setSaving(true);
    setFeedback(null);
    const input = {
      name: form.name.trim(),
      businessName: activeOrg.name,
      description: form.description.trim(),
      objective: form.objective,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      reachGoal: form.reachGoal ? Number(form.reachGoal) : null,
      totalBudget: form.totalBudget ? Number(form.totalBudget) : null,
      dailyBudget: form.dailyBudget ? Number(form.dailyBudget) : null,
      currencyCode: form.currencyCode.trim().toUpperCase() || 'SLE',
      locationTargets: form.locationTargets,
      categoryTargets: form.categoryTargets,
      deviceTargets: form.deviceTargets,
      channels: form.channels,
    };
    try {
      if (editingId) {
        await updateAdCampaign(editingId, input, status);
      } else {
        await createCampaign({ ...input, orgId: activeOrg.id, status });
      }
      await loadCampaigns();
      setWizardOpen(false);
      setFeedback(status === 'submitted' ? 'Campaign submitted for review.' : 'Campaign draft saved.');
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Campaign could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (campaign: AdCampaign) => {
    if (!window.confirm(`Delete the campaign "${campaign.name}"?`)) return;
    try {
      await deleteCampaign(campaign.id);
      await loadCampaigns();
      setFeedback('Campaign deleted.');
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Campaign could not be deleted.');
    }
  };

  const duplicate = async (campaign: AdCampaign) => {
    try {
      await duplicateCampaign(campaign);
      await loadCampaigns();
      setFeedback('Campaign duplicated as a draft. Add new dates and review it before submission.');
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Campaign could not be duplicated.');
    }
  };

  const review = async (campaign: AdCampaign, decision: 'approved' | 'rejected') => {
    const reason = decision === 'rejected'
      ? window.prompt('What should the advertiser change?')
      : undefined;
    if (decision === 'rejected' && reason === null) return;
    try {
      await reviewCampaign(campaign.id, decision, reason ?? undefined);
      await loadCampaigns();
      setFeedback(decision === 'approved'
        ? 'Campaign approved. It will publish automatically on its start date.'
        : 'Campaign returned to the advertiser with your feedback.');
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Campaign review could not be saved.');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < 3) nextStep();
    else void save('submitted');
  };

  return (
    <div className="space-y-6 text-left">
      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Enhancement 2</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-950">Campaign Management</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Create one campaign for Manohub, social media, or both—without entering the same plan twice.
            </p>
          </div>
          <button onClick={openNew} className="inline-flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> New campaign
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 border-l border-t border-slate-200 bg-white md:grid-cols-4">
        {[
          ['All campaigns', summary.total],
          ['Drafts', summary.drafts],
          ['In review', summary.review],
          ['Active', summary.running],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-r border-slate-200 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      {feedback && (
        <div className={`border p-4 text-sm font-semibold ${feedback.toLowerCase().includes('could not') || feedback.toLowerCase().includes('enter') || feedback.toLowerCase().includes('choose') || feedback.toLowerCase().includes('cannot')
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {feedback}
        </div>
      )}

      {wizardOpen && (
        <section className="border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">Step {step} of 3</p>
                <h3 className="mt-1 font-display text-xl font-bold">{editingId ? 'Edit campaign' : 'Create campaign'}</h3>
              </div>
              <button onClick={() => setWizardOpen(false)} className="text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white">Close</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1">
              {['Objective', 'Budget & dates', 'Audience'].map((label, index) => (
                <div key={label}>
                  <div className={`h-1 ${step >= index + 1 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                  <p className={`mt-1 text-[10px] ${step >= index + 1 ? 'text-white' : 'text-slate-500'}`}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-6">
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Campaign name</label>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} placeholder="e.g. Freetown Back-to-School Promotion" className="w-full border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">What should this campaign achieve?</label>
                  <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} maxLength={1000} placeholder="Describe the offer, audience, and desired result." className="w-full border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OBJECTIVES.map((objective) => (
                    <button key={objective.value} type="button" onClick={() => setForm({ ...form, objective: objective.value })} className={`border p-4 text-left ${form.objective === objective.value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:border-slate-400'}`}>
                      <span className="flex items-center gap-2 font-bold text-slate-900">
                        <Target className={`h-4 w-4 ${form.objective === objective.value ? 'text-emerald-600' : 'text-slate-400'}`} />
                        {objective.label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{objective.description}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Delivery channels</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CHANNELS.map((channel) => (
                      <button
                        key={channel.value}
                        type="button"
                        onClick={() => setForm({ ...form, channels: toggleValue(form.channels, channel.value) })}
                        className={`border p-3 text-left ${form.channels.includes(channel.value) ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:border-slate-400'}`}
                      >
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Check className={`h-4 w-4 ${form.channels.includes(channel.value) ? 'text-emerald-600' : 'text-slate-300'}`} />
                          {channel.label}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{channel.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Start date
                    <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case text-slate-900 outline-none focus:border-emerald-600" />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    End date
                    <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case text-slate-900 outline-none focus:border-emerald-600" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Currency
                    <select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })} className="mt-1 block w-full border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600">
                      <option value="SLE">SLE</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Total budget
                    <input type="number" min="0" step="0.01" value={form.totalBudget} onChange={(event) => setForm({ ...form, totalBudget: event.target.value })} placeholder="Optional" className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600" />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Daily budget
                    <input type="number" min="0" step="0.01" value={form.dailyBudget} onChange={(event) => setForm({ ...form, dailyBudget: event.target.value })} placeholder="Optional" className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600" />
                  </label>
                </div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Reach goal
                  <input type="number" min="0" step="1" value={form.reachGoal} onChange={(event) => setForm({ ...form, reachGoal: event.target.value })} placeholder="Optional number of qualified impressions" className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case text-slate-900 outline-none focus:border-emerald-600" />
                </label>
                <div className="border-l-4 border-blue-500 bg-blue-50 p-4 text-xs text-blue-900">
                  Budgets are planning limits only. Actual campaign spend is entered separately in Campaign Performance and is the only value used for CPC, CPL, and ROAS.
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Target locations</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LOCATIONS.map((location) => (
                      <button key={location} type="button" onClick={() => setForm({ ...form, locationTargets: toggleValue(form.locationTargets, location) })} className={`flex items-center gap-2 border p-2.5 text-left text-xs ${form.locationTargets.includes(location) ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600'}`}>
                        <span className={`flex h-4 w-4 items-center justify-center border ${form.locationTargets.includes(location) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{form.locationTargets.includes(location) && <Check className="h-3 w-3" />}</span>
                        {location}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Categories</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CATEGORIES.map((category) => (
                      <button key={category} type="button" onClick={() => setForm({ ...form, categoryTargets: toggleValue(form.categoryTargets, category) })} className={`border px-3 py-2 text-xs font-semibold ${form.categoryTargets.includes(category) ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Devices</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {DEVICES.map((device) => (
                      <button key={device.value} type="button" onClick={() => setForm({ ...form, deviceTargets: toggleValue(form.deviceTargets, device.value) })} className={`border p-3 text-xs font-bold ${form.deviceTargets.includes(device.value) ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>
                        {device.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2 border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-2">
                  <p><strong className="text-slate-900">Objective:</strong> {OBJECTIVES.find((item) => item.value === form.objective)?.label}</p>
                  <p><strong className="text-slate-900">Dates:</strong> {form.startDate || 'Not set'} → {form.endDate || 'Not set'}</p>
                  <p><strong className="text-slate-900">Budget:</strong> {form.totalBudget ? `${form.currencyCode} ${form.totalBudget}` : 'Not set'}</p>
                  <p><strong className="text-slate-900">Locations:</strong> {form.locationTargets.length}</p>
                  <p className="sm:col-span-2"><strong className="text-slate-900">Channels:</strong> {form.channels.map((channel) => CHANNELS.find((item) => item.value === channel)?.label ?? channel).join(', ')}</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {step > 1 && (
                  <button type="button" onClick={() => setStep((current) => current - 1)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 hover:text-slate-950">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" disabled={saving} onClick={() => void save('draft')} className="border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Save draft
                </button>
                {step < 3 ? (
                  <button type="submit" className="inline-flex items-center justify-center gap-2 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit for review
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
      )}

      <section className="border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">{isPlatformAdmin ? 'All advertiser campaigns' : 'My campaigns'}</h3>
            <p className="mt-1 text-xs text-slate-500">{isPlatformAdmin ? 'Campaigns across authorised organisations.' : `Campaigns owned by ${activeOrg.name}.`}</p>
          </div>
          <Megaphone className="h-5 w-5 text-emerald-600" />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-bold text-slate-800">No campaigns yet</p>
            <p className="mt-1 text-sm text-slate-500">Create the first campaign and save it as a draft or submit it for review.</p>
            <button onClick={openNew} className="mt-4 border border-emerald-600 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">Create campaign</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {campaigns.map((campaign) => {
              const editable = campaign.status === 'draft' || campaign.status === 'rejected';
              return (
                <article key={campaign.id} className="p-5 hover:bg-slate-50">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-display text-base font-bold text-slate-900">{campaign.name}</h4>
                        <span className={`border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${STATUS_STYLES[campaign.status] ?? STATUS_STYLES.draft}`}>
                          {campaign.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-slate-500">{campaign.description || 'No description provided.'}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-indigo-500" /> {campaign.objective}</span>
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-blue-500" /> {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}</span>
                        <span className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5 text-amber-500" /> {money(campaign.totalBudget, campaign.currencyCode)}</span>
                        <span>{campaign.locationTargets.length} location{campaign.locationTargets.length === 1 ? '' : 's'}</span>
                        <span>{campaign.channels.map((channel) => CHANNELS.find((item) => item.value === channel)?.label ?? channel).join(' + ')}</span>
                      </div>
                      {campaign.rejectionReason && <p className="mt-3 border-l-4 border-red-500 bg-red-50 p-3 text-xs text-red-800">{campaign.rejectionReason}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isPlatformAdmin && campaign.status === 'submitted' && (
                        <>
                          <button onClick={() => void review(campaign, 'approved')} className="inline-flex items-center gap-1.5 border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </button>
                          <button onClick={() => void review(campaign, 'rejected')} className="inline-flex items-center gap-1.5 border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                            <XCircle className="h-3.5 w-3.5" /> Request changes
                          </button>
                        </>
                      )}
                      <button onClick={() => setPreviewingId(previewingId === campaign.id ? null : campaign.id)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white">
                        <Eye className="h-3.5 w-3.5" /> Creatives ({creatives[campaign.id]?.length ?? 0})
                      </button>
                      <button onClick={() => void duplicate(campaign)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white">
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </button>
                      {editable && (
                        <button onClick={() => openEdit(campaign)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white">
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                      )}
                      {(editable || isPlatformAdmin) && (
                        <button onClick={() => void remove(campaign)} className="inline-flex items-center gap-1.5 border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {previewingId === campaign.id && (
                    <div className="mt-5 border-t border-slate-200 pt-5">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Creative preview</p>
                          <p className="mt-1 text-xs text-slate-500">Responsive previews of the adverts assigned to this campaign.</p>
                        </div>
                      </div>
                      {(creatives[campaign.id]?.length ?? 0) === 0 ? (
                        <div className="flex items-center gap-3 border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                          <ImageIcon className="h-5 w-5 text-slate-400" />
                          No creatives are assigned yet. Manohub administrators can add multiple adverts in the Advert Publisher.
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {creatives[campaign.id].map((creative) => (
                            <article key={creative.id} className="overflow-hidden border border-slate-200 bg-white">
                              <div className="aspect-[16/9] bg-slate-100">
                                {creative.creativeUrl || creative.mediaUrl ? (
                                  <img src={creative.creativeUrl || creative.mediaUrl || ''} alt={`${creative.title} creative`} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-5 text-center text-sm font-bold text-slate-500">{creative.title}</div>
                                )}
                              </div>
                              <div className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-bold text-slate-900">{creative.title}</p>
                                  <span className="border border-slate-200 px-2 py-0.5 font-mono text-[9px] uppercase text-slate-500">{creative.format}</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{creative.socialPlatform || 'Manohub'} · {creative.status}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
