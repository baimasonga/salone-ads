import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { AdvertCreative, CreativeScaler } from './AdvertCreative';
import type { AdvertFormat, AdvertTheme } from './AdvertCreative';

export interface AdminAdvertCreativeForm {
  title: string;
  category: string;
  businessName: string;
  summary: string;
  content: string;
  mediaUrl: string;
  socialPlatform: string;
  creativeUrl: string;
  accentColor: string;
  logoUrl: string;
}

interface AdminAdvertCreativeEditorProps {
  form: AdminAdvertCreativeForm;
  format: AdvertFormat;
  theme: AdvertTheme;
  withPhoto: boolean;
  creativeRef: RefObject<HTMLDivElement | null>;
  ogRef: RefObject<HTMLDivElement | null>;
  kitRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  kitFormats: AdvertFormat[];
  kitExporting: boolean;
  savingCreative: boolean;
  onFormatChange: (format: AdvertFormat) => void;
  onThemeChange: (theme: AdvertTheme) => void;
  onWithPhotoChange: Dispatch<SetStateAction<boolean>>;
  onDownloadCreative: () => void | Promise<void>;
  onSaveCreative: () => void | Promise<void>;
  onKitExportChange: (exporting: boolean) => void;
}

export function AdminAdvertCreativeEditor({
  form, format, theme, withPhoto, creativeRef, ogRef, kitRefs, kitFormats,
  kitExporting, savingCreative, onFormatChange, onThemeChange, onWithPhotoChange,
  onDownloadCreative, onSaveCreative, onKitExportChange,
}: AdminAdvertCreativeEditorProps) {
  const creative = {
    businessName: form.businessName || 'Your Business',
    headline: form.title || 'Your headline goes here',
    body: form.summary || form.content,
    category: form.category,
    mediaUrl: form.mediaUrl || null,
    platform: form.socialPlatform,
    accentColor: form.accentColor,
    logoUrl: form.logoUrl || null,
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Auto-generated creative</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {kitFormats.map((candidate) => (
              <button key={candidate} type="button" onClick={() => onFormatChange(candidate)}
                className={`cursor-pointer border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${format === candidate ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                {candidate}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(['dark', 'light'] as AdvertTheme[]).map((candidate) => (
              <button key={candidate} type="button" onClick={() => onThemeChange(candidate)}
                className={`cursor-pointer border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${theme === candidate ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                {candidate}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onWithPhotoChange((value) => !value)}
            className={`cursor-pointer border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${withPhoto ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
            {withPhoto ? 'Photo' : 'Text'}
          </button>
        </div>
      </div>

      <div className="border border-slate-200 bg-slate-50 p-3">
        <CreativeScaler format={format}>
          <AdvertCreative ref={creativeRef} format={format} theme={theme} withPhoto={withPhoto} {...creative} />
        </CreativeScaler>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void onDownloadCreative()} className="cursor-pointer border border-[#0F172A] py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0F172A] transition-colors hover:bg-[#0F172A] hover:text-white">
          Download PNG
        </button>
        <button type="button" onClick={() => void onSaveCreative()} disabled={savingCreative} className="cursor-pointer border border-emerald-600 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-50">
          {savingCreative ? 'Saving…' : 'Save for social'}
        </button>
      </div>
      <button type="button" onClick={() => onKitExportChange(true)} disabled={kitExporting} className="mt-2 w-full cursor-pointer border border-slate-300 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50">
        {kitExporting ? 'Building kit…' : 'Download the kit (all 5 sizes · ZIP)'}
      </button>

      <div style={{ position: 'fixed', left: -99999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        <AdvertCreative ref={ogRef} format="landscape" theme={theme} withPhoto={withPhoto} {...creative} />
      </div>
      {kitExporting && (
        <div style={{ position: 'fixed', left: -99999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
          {kitFormats.map((candidate) => (
            <div key={candidate} ref={(element) => { kitRefs.current[candidate] = element; }}>
              <AdvertCreative format={candidate} theme={theme} withPhoto={withPhoto} {...creative} />
            </div>
          ))}
        </div>
      )}
      {form.creativeUrl && (
        <p className="mt-2 text-[11px] text-emerald-700">
          Creative saved · <a href={form.creativeUrl} target="_blank" rel="noopener noreferrer" className="underline">open PNG</a> — attaches on publish.
        </p>
      )}
    </div>
  );
}
