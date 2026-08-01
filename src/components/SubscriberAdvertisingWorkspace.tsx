import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { Sparkles } from 'lucide-react';
import { AdvertCreative, CreativeScaler, type AdvertFormat, type AdvertTheme } from './AdvertCreative';
import type { Organization } from '../types';
import type { AdvertisementCategory, AdvertisementRequest } from '../lib/advertisingApi';

interface SubscriberAdvertisingWorkspaceProps {
  activeOrg: Organization;
  advertisementFeedback: string;
  advertisementsLoading: boolean;
  canAdvertise: boolean;
  setActiveTab: (tab: string) => void;
  adCategory: AdvertisementCategory;
  setAdCategory: (category: AdvertisementCategory) => void;
  adSubject: string;
  setAdSubject: (subject: string) => void;
  adDescription: string;
  setAdDescription: (description: string) => void;
  polishingSub: boolean;
  handlePolishSubCopy: () => void | Promise<void>;
  adUploading: boolean;
  adMediaUrl: string;
  setAdMediaUrl: (url: string) => void;
  handleUploadRequestPhoto: (file: File | undefined) => void | Promise<void>;
  adSubmitting: boolean;
  handleSubmitAdvertisement: (event: FormEvent) => void | Promise<void>;
  advFormat: AdvertFormat;
  setAdvFormat: (format: AdvertFormat) => void;
  advTheme: AdvertTheme;
  setAdvTheme: (theme: AdvertTheme) => void;
  advWithPhoto: boolean;
  setAdvWithPhoto: Dispatch<SetStateAction<boolean>>;
  subCreativeRef: RefObject<HTMLDivElement | null>;
  handleDownloadSubCreative: () => void | Promise<void>;
  myAdvertisements: AdvertisementRequest[];
}

export function SubscriberAdvertisingWorkspace(props: SubscriberAdvertisingWorkspaceProps) {
  const { activeOrg, advertisementFeedback, advertisementsLoading, canAdvertise, setActiveTab,
    adCategory, setAdCategory, adSubject, setAdSubject, adDescription, setAdDescription,
    polishingSub, handlePolishSubCopy, adUploading, adMediaUrl, setAdMediaUrl,
    handleUploadRequestPhoto, adSubmitting, handleSubmitAdvertisement, advFormat, setAdvFormat,
    advTheme, setAdvTheme, advWithPhoto, setAdvWithPhoto, subCreativeRef,
    handleDownloadSubCreative, myAdvertisements } = props;
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
              <button type="button" onClick={handlePolishSubCopy} disabled={polishingSub} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" /> {polishingSub ? 'Polishing…' : 'Polish my wording with AI'}
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase">Photo (optional)</label>
              <div className="mt-1 flex items-center gap-2">
                <label className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50">
                  {adUploading ? 'Uploading…' : adMediaUrl ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadRequestPhoto(e.target.files?.[0])} />
                </label>
                {adMediaUrl && (
                  <>
                    <img src={adMediaUrl} alt="" className="h-9 w-9 object-cover rounded-lg border border-slate-200" />
                    <button type="button" onClick={() => setAdMediaUrl('')} className="text-xs text-slate-400 hover:text-red-500 cursor-pointer">Remove</button>
                  </>
                )}
              </div>
            </div>
            <button type="submit" disabled={adSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm cursor-pointer disabled:opacity-50">
              {adSubmitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>

          {/* Live creative preview — your advert, designed automatically */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-display font-bold text-slate-900 text-sm">Your advert, designed automatically</h4>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {(['square', 'story', 'landscape', 'banner', 'editorial'] as AdvertFormat[]).map((f) => (
                    <button key={f} type="button" onClick={() => setAdvFormat(f)} className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 border cursor-pointer ${advFormat === f ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}>{f}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {(['dark', 'light'] as AdvertTheme[]).map((t) => (
                    <button key={t} type="button" onClick={() => setAdvTheme(t)} className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 border cursor-pointer ${advTheme === t ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}>{t}</button>
                  ))}
                </div>
                <button type="button" onClick={() => setAdvWithPhoto((v) => !v)} className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 border cursor-pointer ${advWithPhoto ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}>{advWithPhoto ? 'Photo' : 'Text'}</button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">This is generated from your details as you type. Our team refines and runs it — you can download it too.</p>
            <div className="bg-slate-50 border border-slate-200 p-3 max-w-md">
              <CreativeScaler format={advFormat}>
                <AdvertCreative
                  ref={subCreativeRef}
                  format={advFormat}
                  theme={advTheme}
                  withPhoto={advWithPhoto}
                  businessName={activeOrg.name}
                  headline={adSubject || 'Your headline goes here'}
                  body={adDescription}
                  category={categoryLabels[adCategory]}
                  mediaUrl={adMediaUrl || null}
                />
              </CreativeScaler>
            </div>
            <button type="button" onClick={handleDownloadSubCreative} className="mt-3 border border-emerald-600 text-emerald-700 font-mono text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer">
              Download my advert (PNG)
            </button>
          </div>

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
