import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Sparkles } from 'lucide-react';
import type { AdCampaign, Advert, AdvertAnalyticsSummary } from '../lib/advertisingApi';
import { buildAdvertShareIntents, buildAdvertSharePack } from '../lib/advertisingApi';
import type { AdminAdvertCreativeForm } from './AdminAdvertCreativeEditor';

export interface AdminAdvertPublisherForm extends AdminAdvertCreativeForm {
  socialUrl: string;
}

interface AdminAdvertPublisherPanelProps {
  analytics: AdvertAnalyticsSummary | null;
  campaigns: AdCampaign[];
  campaignId: string;
  copiedKey: string | null;
  creativeEditor: ReactNode;
  editingId: string | null;
  form: AdminAdvertPublisherForm;
  polishingCopy: boolean;
  publishedAdverts: Advert[];
  requestId: string | null;
  saving: boolean;
  sharePackId: string | null;
  uploading: 'photo' | 'logo' | null;
  onCampaignChange: (campaignId: string) => void;
  onCancel: () => void;
  onCopyCaption: (key: string, text: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onEdit: (advert: Advert) => void;
  onFormChange: Dispatch<SetStateAction<AdminAdvertPublisherForm>>;
  onPolishCopy: () => void | Promise<void>;
  onSharePackChange: Dispatch<SetStateAction<string | null>>;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  onToggleStatus: (advert: Advert) => void | Promise<void>;
  onUploadImage: (file: File | undefined, kind: 'photo' | 'logo') => void | Promise<void>;
}

const CATEGORIES = ['business', 'goods', 'service', 'healthcare', 'transportation', 'event', 'hospitality', 'finance', 'education', 'agriculture'];
const SOCIAL_PLATFORMS = ['Facebook', 'Instagram', 'WhatsApp', 'TikTok', 'X', 'YouTube', 'LinkedIn'];

export function AdminAdvertPublisherPanel({
  analytics, campaigns, campaignId, copiedKey, creativeEditor, editingId, form,
  polishingCopy, publishedAdverts, requestId, saving, sharePackId, uploading,
  onCampaignChange, onCancel, onCopyCaption, onDelete, onEdit, onFormChange,
  onPolishCopy, onSharePackChange, onSubmit, onToggleStatus, onUploadImage,
}: AdminAdvertPublisherPanelProps) {
  return (
    <div id="advert-publisher" className={`rounded-2xl border bg-white p-6 shadow-xs ${editingId ? 'border-emerald-300 ring-1 ring-emerald-200' : requestId ? 'border-sky-300 ring-1 ring-sky-200' : 'border-slate-100'}`}>
      <h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
        <Landmark className="h-5 w-5 text-emerald-600" /> {editingId ? 'Editing advert' : requestId ? 'Publishing a request' : 'Adverts on the site'}
        {(editingId || requestId) && (
          <button type="button" onClick={onCancel} className="ml-auto cursor-pointer text-xs font-semibold text-slate-500 hover:underline">Cancel</button>
        )}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Publish an advert so it shows on the public homepage and gets its own detail page. Manohub is the
        source of truth — paste the social post link so visitors can jump to the campaign; the social post
        should reference this advert's page back on Manohub.
      </p>

      {analytics && (
        <div className="mt-5 grid grid-cols-2 gap-px border border-[#0F172A] bg-[#0F172A] lg:grid-cols-4">
          {[
            { label: 'Total views', value: analytics.viewsTotal, sub: `${analytics.views7d} in 7d · ${analytics.views30d} in 30d` },
            { label: 'Total clicks', value: analytics.clicksTotal, sub: `${analytics.clicks7d} in 7d · ${analytics.clicks30d} in 30d` },
            { label: 'Live adverts', value: analytics.liveCount, sub: 'showing on the site' },
            { label: 'Click-through', value: `${analytics.viewsTotal > 0 ? Math.round((analytics.clicksTotal / analytics.viewsTotal) * 100) : 0}%`, sub: 'clicks ÷ views' },
          ].map((stat, index) => (
            <div key={stat.label} className="relative overflow-hidden bg-white p-4">
              <i className={`absolute inset-x-0 top-0 h-1 ${index === 0 ? 'bg-indigo-600' : index === 1 ? 'bg-emerald-600' : index === 2 ? 'bg-amber-500' : 'bg-fuchsia-600'}`} />
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-950">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
              <p className="mt-1 text-[10px] text-slate-500">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-2">
        <form onSubmit={(event) => void onSubmit(event)} className="grid grid-cols-1 gap-3">
          <input value={form.title} onChange={(event) => onFormChange({ ...form, title: event.target.value })} placeholder="Advert title" className="rounded-lg border border-slate-200 p-2 text-sm" />
          <input value={form.businessName} onChange={(event) => onFormChange({ ...form, businessName: event.target.value })} placeholder="Business name" className="rounded-lg border border-slate-200 p-2 text-sm" />
          <select value={form.category} onChange={(event) => onFormChange({ ...form, category: event.target.value })} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
            {CATEGORIES.map((category) => <option key={category} value={category}>{category.charAt(0).toUpperCase() + category.slice(1)}</option>)}
          </select>
          <select value={campaignId} onChange={(event) => onCampaignChange(event.target.value)} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
            <option value="">No campaign — runs immediately, no end date</option>
            {campaigns.filter((campaign) => campaign.status === 'active').map((campaign) => (
              <option key={campaign.id} value={campaign.id}>Campaign: {campaign.name}{campaign.startDate || campaign.endDate ? ` (${campaign.startDate || '…'} → ${campaign.endDate || '…'})` : ''}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {uploading === 'photo' ? 'Uploading…' : form.mediaUrl ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => void onUploadImage(event.target.files?.[0], 'photo')} />
            </label>
            <input value={form.mediaUrl} onChange={(event) => onFormChange({ ...form, mediaUrl: event.target.value })} placeholder="…or paste image URL" className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-sm" />
            {form.mediaUrl && <button type="button" onClick={() => onFormChange({ ...form, mediaUrl: '' })} className="shrink-0 cursor-pointer text-xs text-slate-400 hover:text-red-500">Clear</button>}
          </div>
          <input value={form.summary} onChange={(event) => onFormChange({ ...form, summary: event.target.value })} placeholder="Short summary (one line)" className="rounded-lg border border-slate-200 p-2 text-sm sm:col-span-2" />
          <textarea value={form.content} onChange={(event) => onFormChange({ ...form, content: event.target.value })} placeholder="Full advert content" rows={3} className="rounded-lg border border-slate-200 p-2 text-sm" />
          <button type="button" onClick={() => void onPolishCopy()} disabled={polishingCopy} className="inline-flex cursor-pointer items-center gap-1.5 justify-self-start text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" /> {polishingCopy ? 'Polishing…' : 'Polish copy with AI'}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-600">
              Brand colour
              <input type="color" value={form.accentColor} onChange={(event) => onFormChange({ ...form, accentColor: event.target.value })} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
            </label>
            <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {uploading === 'logo' ? 'Uploading…' : form.logoUrl ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => void onUploadImage(event.target.files?.[0], 'logo')} />
            </label>
          </div>
          <select value={form.socialPlatform} onChange={(event) => onFormChange({ ...form, socialPlatform: event.target.value })} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
            {SOCIAL_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
          </select>
          <input value={form.socialUrl} onChange={(event) => onFormChange({ ...form, socialUrl: event.target.value })} placeholder="Social post URL (https://…)" className="rounded-lg border border-slate-200 p-2 text-sm" />
          <button type="submit" disabled={saving} className="cursor-pointer justify-self-start rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? (editingId ? 'Saving…' : 'Publishing…') : editingId ? 'Save changes' : 'Publish advert'}
          </button>
        </form>
        {creativeEditor}
      </div>

      <div className="mt-6 space-y-3">
        {publishedAdverts.length === 0 ? (
          <p className="text-xs text-slate-400">No adverts published yet.</p>
        ) : publishedAdverts.map((advert) => (
          <div key={advert.id} className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-slate-800">{advert.title} — {advert.businessName}</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {advert.category} · {advert.status} · <span title="Detail-page views">👁 {advert.viewCount.toLocaleString()}</span>
                  {' · '}<span title="'View on social' clicks">↗ {advert.clickCount.toLocaleString()}</span>
                  {advert.socialUrl && <> · <a href={advert.socialUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">social post</a></>}
                  {advert.creativeUrl && <> · <a href={advert.creativeUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">creative PNG</a></>}
                  {' · '}<Link to={`/adverts/${advert.slug}`} target="_blank" className="text-emerald-600 hover:underline">/adverts/{advert.slug}</Link>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button onClick={() => onEdit(advert)} className="cursor-pointer text-xs font-semibold text-slate-600 hover:underline">Edit</button>
                <button onClick={() => onSharePackChange((id) => id === advert.id ? null : advert.id)} className="cursor-pointer text-xs font-semibold text-emerald-700 hover:underline">
                  {sharePackId === advert.id ? 'Hide share pack' : 'Share pack'}
                </button>
                <button onClick={() => void onToggleStatus(advert)} className="cursor-pointer text-xs font-semibold text-slate-600 hover:underline">{advert.status === 'live' ? 'Archive' : 'Set live'}</button>
                <button onClick={() => void onDelete(advert.id)} className="cursor-pointer text-xs font-semibold text-red-600 hover:underline">Delete</button>
              </div>
            </div>
            {sharePackId === advert.id && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap gap-2">
                  {buildAdvertShareIntents(advert).map((intent) => (
                    <a key={intent.key} href={intent.href} target="_blank" rel="noopener noreferrer" className="cursor-pointer border border-slate-200 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-700 transition-colors hover:border-[#0F172A] hover:text-[#0F172A]">Post to {intent.label}</a>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">One-click posts open each app pre-filled. Or copy a caption below — each links back to this advert on Manohub. Attach the creative PNG or a kit image as the post picture.</p>
                {buildAdvertSharePack(advert).map((caption) => (
                  <div key={caption.key} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{caption.label}</span>
                      <button onClick={() => void onCopyCaption(`${advert.id}-${caption.key}`, caption.text)} className="cursor-pointer text-[11px] font-semibold text-emerald-700 hover:underline">
                        {copiedKey === `${advert.id}-${caption.key}` ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{caption.text}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
