import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { FileSearch, FileUp, Paperclip, Sparkle, Trash2 } from 'lucide-react';
import {
  MAX_DOCUMENT_SIZE_BYTES,
  aiSuggestSector,
  createOpportunity,
  uploadOpportunityDocument,
  type CurrencyOption,
  type TaxonomyOption,
} from '../../lib/procurementApi';
import {
  partitionTenderDocuments,
  submitTenderWithDocuments,
  tenderSubmissionFeedback,
  type TenderSubmissionResult,
} from './tenderSubmission';
import {
  readResilienceCache,
  removeResilienceCache,
  writeResilienceCache,
} from '../../lib/networkResilience';

interface TenderCreationFormProps {
  organizationId: string;
  organizationName: string;
  sectors: TaxonomyOption[];
  countries: TaxonomyOption[];
  districts: TaxonomyOption[];
  currencies: CurrencyOption[];
  opportunityTypes: TaxonomyOption[];
  countryId: string;
  onCountryChange: (countryId: string) => void;
  districtId: string;
  onDistrictChange: (districtId: string) => void;
  onCreated: (result: TenderSubmissionResult) => void;
  onFeedback: (message: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TenderDraft {
  title: string;
  summary: string;
  description: string;
  typeId: string;
  sectorId: string;
  value: string;
  currencyCode: string;
  deadline: string;
  contact: string;
  countryId: string;
  districtId: string;
  documentsArePublic: boolean;
}

const TENDER_DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function TenderCreationForm({
  organizationId,
  organizationName,
  sectors,
  countries,
  districts,
  currencies,
  opportunityTypes,
  countryId,
  onCountryChange,
  districtId,
  onDistrictChange,
  onCreated,
  onFeedback,
}: TenderCreationFormProps) {
  const draftScope = `tender-draft:${organizationId}`;
  const savedDraft = useMemo(
    () => readResilienceCache<TenderDraft>(draftScope, TENDER_DRAFT_MAX_AGE),
    [draftScope],
  );
  const [title, setTitle] = useState(savedDraft?.value.title ?? '');
  const [summary, setSummary] = useState(savedDraft?.value.summary ?? '');
  const [description, setDescription] = useState(savedDraft?.value.description ?? '');
  const [typeId, setTypeId] = useState(savedDraft?.value.typeId ?? '');
  const [sectorId, setSectorId] = useState(savedDraft?.value.sectorId ?? '');
  const [value, setValue] = useState(savedDraft?.value.value ?? '');
  const [currencyCode, setCurrencyCode] = useState(savedDraft?.value.currencyCode ?? '');
  const [deadline, setDeadline] = useState(savedDraft?.value.deadline ?? '');
  const [contact, setContact] = useState(savedDraft?.value.contact ?? '');
  const [documents, setDocuments] = useState<File[]>([]);
  const [documentsArePublic, setDocumentsArePublic] = useState(savedDraft?.value.documentsArePublic ?? true);
  const [documentError, setDocumentError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestingSector, setSuggestingSector] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(savedDraft?.savedAt ?? null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (savedDraft?.value.countryId && savedDraft.value.countryId !== countryId) {
      onCountryChange(savedDraft.value.countryId);
    }
    if (savedDraft?.value.districtId && savedDraft.value.districtId !== districtId) {
      onDistrictChange(savedDraft.value.districtId);
    }
  }, [countryId, districtId, onCountryChange, onDistrictChange, savedDraft]);

  useEffect(() => {
    const hasDraftContent = Boolean(title || summary || description || deadline || contact || value);
    if (!hasDraftContent) return;
    const timer = window.setTimeout(() => {
      const savedAt = Date.now();
      writeResilienceCache<TenderDraft>(draftScope, {
        title,
        summary,
        description,
        typeId,
        sectorId,
        value,
        currencyCode,
        deadline,
        contact,
        countryId,
        districtId,
        documentsArePublic,
      }, window.localStorage, savedAt);
      setDraftSavedAt(savedAt);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    contact,
    countryId,
    currencyCode,
    deadline,
    description,
    districtId,
    documentsArePublic,
    draftScope,
    sectorId,
    summary,
    title,
    typeId,
    value,
  ]);

  const reportFeedback = (message: string, duration = 5000) => {
    onFeedback(message);
    window.setTimeout(() => onFeedback(''), duration);
  };

  const handleSuggestSector = async () => {
    if (!title.trim()) {
      reportFeedback('Error: Enter a title first so AI has something to work with.', 4000);
      return;
    }

    setSuggestingSector(true);
    try {
      const suggestedName = await aiSuggestSector(
        `${title}. ${summary}`,
        sectors.map((sector) => sector.name),
      );
      const match = sectors.find(
        (sector) => sector.name.toLowerCase() === suggestedName.trim().toLowerCase(),
      );
      if (match) {
        setSectorId(match.id);
        reportFeedback(`AI suggested: ${match.name}`);
      } else {
        reportFeedback('AI could not confidently match a sector — please select one manually.');
      }
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'AI suggestion failed.'}`);
    } finally {
      setSuggestingSector(false);
    }
  };

  const handleDocumentSelect = (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const { accepted, rejected } = partitionTenderDocuments(
      Array.from(fileList),
      MAX_DOCUMENT_SIZE_BYTES,
    );
    setDocuments((current) => [...current, ...accepted]);
    setDocumentError(
      rejected.length > 0
        ? `${rejected.map((file) => file.name).join(', ')} ${rejected.length === 1 ? 'exceeds' : 'exceed'} the 10MB limit and ${rejected.length === 1 ? "wasn't" : "weren't"} added.`
        : '',
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!isOnline) {
      reportFeedback('Error: You are offline. Your tender draft is saved on this device; reconnect and publish when the connection returns.');
      return;
    }
    setSubmitting(true);

    try {
      const result = await submitTenderWithDocuments(
        {
          organizationId,
          organizationName,
          input: {
            title,
            summary,
            description,
            opportunityTypeId: typeId,
            sectorId,
            countryId,
            districtId,
            estimatedValue: value ? Number(value) : undefined,
            currencyCode: currencyCode || undefined,
            submissionDeadline: deadline,
            contactDetails: contact,
          },
          documents,
          documentsArePublic,
        },
        {
          createOpportunity,
          uploadDocument: uploadOpportunityDocument,
        },
      );

      onCreated(result);
      setTitle('');
      setSummary('');
      setDescription('');
      setValue('');
      setDeadline('');
      setContact('');
      setDocuments([]);
      setDocumentError('');
      removeResilienceCache(draftScope);
      setDraftSavedAt(null);
      reportFeedback(tenderSubmissionFeedback(result.failedDocumentCount));
    } catch (error) {
      reportFeedback(`Error: ${error instanceof Error ? error.message : 'Could not submit tender.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {!isOnline ? (
          <div role="status" className="border border-amber-500 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            You are offline. This draft will remain on this device, but publishing and document uploads are paused.
          </div>
        ) : draftSavedAt ? (
          <div role="status" className="border border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
            Draft saved on this device at {new Date(draftSavedAt).toLocaleTimeString()}. Attachments must be selected again after reopening.
          </div>
        ) : null}
        <div>
          <label htmlFor="tender-title" className="block text-xs font-bold text-slate-500 uppercase">Tender Title</label>
          <input
            id="tender-title"
            type="text"
            required
            placeholder="e.g. Rehabilitation of Bo-Kenema Feeder Road"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          />
        </div>
        <div>
          <label htmlFor="tender-summary" className="block text-xs font-bold text-slate-500 uppercase">Summary</label>
          <textarea
            id="tender-summary"
            required
            rows={2}
            placeholder="One or two sentence summary shown in search results"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          />
        </div>
        <div>
          <label htmlFor="tender-description" className="block text-xs font-bold text-slate-500 uppercase">Full Description</label>
          <textarea
            id="tender-description"
            rows={4}
            placeholder="Scope of work, deliverables, and background"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="tender-type" className="block text-xs font-bold text-slate-500 uppercase">Notice Type</label>
            <select
              id="tender-type"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              <option value="">Select type</option>
              {opportunityTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="tender-sector" className="block text-xs font-bold text-slate-500 uppercase">Sector</label>
              <button type="button" onClick={handleSuggestSector} disabled={suggestingSector} className="text-[10px] text-emerald-600 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50">
                <Sparkle className="h-3 w-3" /> {suggestingSector ? 'Thinking…' : 'Suggest with AI'}
              </button>
            </div>
            <select
              id="tender-sector"
              value={sectorId}
              onChange={(event) => setSectorId(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              <option value="">Select sector</option>
              {sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tender-country" className="block text-xs font-bold text-slate-500 uppercase">Country</label>
            <select
              id="tender-country"
              value={countryId}
              onChange={(event) => onCountryChange(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tender-district" className="block text-xs font-bold text-slate-500 uppercase">District</label>
            <select
              id="tender-district"
              value={districtId}
              onChange={(event) => onDistrictChange(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              <option value="">Select district</option>
              {districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="tender-value" className="block text-xs font-bold text-slate-500 uppercase">Estimated Value</label>
            <input
              id="tender-value"
              type="number"
              min="0"
              step="any"
              placeholder="Optional"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="tender-currency" className="block text-xs font-bold text-slate-500 uppercase">Currency</label>
            <select
              id="tender-currency"
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            >
              <option value="">Select currency</option>
              {currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} ({currency.symbol})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tender-deadline" className="block text-xs font-bold text-slate-500 uppercase">Submission Deadline</label>
            <input
              id="tender-deadline"
              type="datetime-local"
              required
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
            />
          </div>
        </div>
        <div>
          <label htmlFor="tender-contact" className="block text-xs font-bold text-slate-500 uppercase">Contact Details</label>
          <input
            id="tender-contact"
            type="text"
            placeholder="email, phone, or WhatsApp"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm focus:bg-white focus:outline-emerald-500"
          />
        </div>
        <div>
          <label htmlFor="tender-document-input" className="block text-xs font-bold text-slate-500 uppercase">Tender Documents</label>
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
              onChange={(event) => {
                handleDocumentSelect(event.target.files);
                event.target.value = '';
              }}
            />
          </label>

          {documentError ? (
            <p className="mt-2 text-[11px] text-red-600 font-medium">{documentError}</p>
          ) : null}

          {documents.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {documents.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0 text-slate-700">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <label className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer w-fit">
            <input type="checkbox" checked={documentsArePublic} onChange={(event) => setDocumentsArePublic(event.target.checked)} />
            Public (visible to anyone viewing this tender, not just subscribers)
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || !isOnline}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20"
        >
          {submitting ? 'Publishing…' : !isOnline ? 'Reconnect to Publish' : 'Publish Tender'}
        </button>
      </form>
    </div>
  );
}
