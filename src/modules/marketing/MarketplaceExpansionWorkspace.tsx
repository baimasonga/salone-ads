import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BriefcaseBusiness, Loader2, Megaphone, Pencil, Plus, Search, Star, Trash2, Users } from 'lucide-react';
import type { Organization } from '../../types';
import { createLead, uploadMediaAsset } from '../../lib/api';
import {
  deleteBusinessDirectoryRecord,
  deleteCreatorMarketplaceRecord,
  fetchBusinessDirectoryRecords,
  fetchCreatorMarketplaceRecords,
  saveBusinessDirectoryRecord,
  saveCreatorMarketplaceRecord,
  type BusinessDirectoryRecord,
  type CreatorMarketplaceRecord,
} from '../../lib/marketplaceApi';

const splitTags = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20);
const emptyBusiness = (): Omit<BusinessDirectoryRecord, 'id'> => ({ businessName: '', category: '', description: '', district: '', city: 'Freetown', whatsapp: '', email: '', website: '', services: [], contactPerson: '', isVerified: false, diasporaSupport: false, isFeatured: false, status: 'active' });
const emptyCreator = (): Omit<CreatorMarketplaceRecord, 'id'> => ({ displayName: '', location: '', district: '', categories: [], platforms: [], bio: '', email: '', whatsapp: '', profileUrl: '', audienceCount: null, engagementPercent: null, rateMin: null, rateMax: null, currencyCode: 'SLE', availabilityStatus: 'available', isVerified: false, isFeatured: false, status: 'active' });

export function MarketplaceExpansionWorkspace({ organization, mode }: { organization: Organization; mode: 'directory' | 'influencers' }) {
  const [businesses, setBusinesses] = useState<BusinessDirectoryRecord[]>([]);
  const [creators, setCreators] = useState<CreatorMarketplaceRecord[]>([]);
  const [businessDraft, setBusinessDraft] = useState(emptyBusiness());
  const [creatorDraft, setCreatorDraft] = useState(emptyCreator());
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = async () => mode === 'directory' ? setBusinesses(await fetchBusinessDirectoryRecords()) : setCreators(await fetchCreatorMarketplaceRecords());
  useEffect(() => { void load().catch(error => setFeedback(error.message || 'Could not load marketplace.')); }, [mode]);
  const reset = () => { setEditingId(''); setShowForm(false); setVerificationFile(null); setBusinessDraft(emptyBusiness()); setCreatorDraft(emptyCreator()); };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const records = mode === 'directory' ? businesses : creators;
    return records.filter(record => {
      const name = mode === 'directory' ? (record as BusinessDirectoryRecord).businessName : (record as CreatorMarketplaceRecord).displayName;
      return (!term || name.toLowerCase().includes(term)) && (statusFilter === 'all' || record.status === statusFilter);
    });
  }, [businesses, creators, mode, search, statusFilter]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setFeedback('');
    try {
      if (mode === 'directory') {
        if (businessDraft.isVerified && !editingId && !verificationFile) throw new Error('Attach a registration or tax document before verifying a new listing.');
        if (verificationFile) await uploadMediaAsset(organization.id, verificationFile, 'Verification Documents');
        await saveBusinessDirectoryRecord(organization.id, businessDraft, editingId || undefined);
      } else await saveCreatorMarketplaceRecord(organization.id, creatorDraft, editingId || undefined);
      await load(); reset(); setFeedback(editingId ? 'Profile updated.' : 'Profile created.');
    } catch (error: any) { setFeedback(error.message || 'Could not save profile.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this marketplace profile permanently?')) return;
    try { mode === 'directory' ? await deleteBusinessDirectoryRecord(id) : await deleteCreatorMarketplaceRecord(id); await load(); }
    catch (error: any) { setFeedback(error.message || 'Could not delete profile.'); }
  };

  const inviteCreator = async (creator: CreatorMarketplaceRecord) => {
    const value = window.prompt(`Proposed campaign budget for ${creator.displayName} (Leones):`, String(creator.rateMin ?? 0));
    if (value === null) return;
    try { await createLead(organization.id, { name: creator.displayName, email: creator.email, whatsapp: creator.whatsapp, district: creator.district, source: 'Influencer Marketplace', estimatedValue: Number(value) || 0 }); setFeedback(`CRM opportunity created for ${creator.displayName}.`); }
    catch (error: any) { setFeedback(error.message || 'Could not create CRM opportunity.'); }
  };

  const editBusiness = (record: BusinessDirectoryRecord) => { setBusinessDraft({ ...record }); setEditingId(record.id); setShowForm(true); };
  const editCreator = (record: CreatorMarketplaceRecord) => { setCreatorDraft({ ...record }); setEditingId(record.id); setShowForm(true); };
  const Icon = mode === 'directory' ? BriefcaseBusiness : Users;

  return <div className="space-y-6 text-left">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
      <div><h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900"><Icon className="h-5 w-5 text-emerald-600" />{mode === 'directory' ? 'Business Directory Management' : 'Influencer Marketplace Management'}</h3><p className="mt-1 text-xs text-slate-500">Search, verify, feature and manage complete {mode === 'directory' ? 'business listings' : 'creator partnership profiles'}.</p></div>
      <button onClick={() => { reset(); setShowForm(true); }} className="btn-geometric-primary inline-flex items-center justify-center gap-2 text-xs"><Plus className="h-4 w-4" /> Add profile</button>
    </div>
    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_180px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search marketplace" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name" className="w-full pl-10" /></label><select aria-label="Filter profile status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></div>
    {feedback && <div role="status" className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</div>}
    {showForm && <form onSubmit={submit} className="grid gap-4 rounded-2xl border-2 border-emerald-500 bg-white p-6 md:grid-cols-2">
      {mode === 'directory' ? <BusinessFields value={businessDraft} setValue={setBusinessDraft} setFile={setVerificationFile} /> : <CreatorFields value={creatorDraft} setValue={setCreatorDraft} />}
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="btn-geometric-primary inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</button><button type="button" onClick={reset} className="btn-geometric-secondary">Cancel</button></div>
    </form>}
    <div className="grid gap-4 lg:grid-cols-2">{filtered.map(record => mode === 'directory' ? <BusinessCard key={record.id} record={record as BusinessDirectoryRecord} edit={editBusiness} remove={remove} /> : <CreatorCard key={record.id} record={record as CreatorMarketplaceRecord} edit={editCreator} remove={remove} invite={inviteCreator} />)}</div>
    {filtered.length === 0 && <div className="border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No matching profiles.</div>}
  </div>;
}

function BusinessFields({ value, setValue, setFile }: { value: Omit<BusinessDirectoryRecord, 'id'>; setValue: (value: Omit<BusinessDirectoryRecord, 'id'>) => void; setFile: (file: File | null) => void }) {
  return <><Field label="Business name" required value={value.businessName} onChange={businessName => setValue({ ...value, businessName })} /><Field label="Category" required value={value.category} onChange={category => setValue({ ...value, category })} /><label className="text-xs font-bold md:col-span-2">Description<textarea value={value.description} onChange={e => setValue({ ...value, description: e.target.value })} className="mt-1 min-h-24 w-full" /></label><Field label="City" value={value.city} onChange={city => setValue({ ...value, city })} /><Field label="District" value={value.district} onChange={district => setValue({ ...value, district })} /><Field label="Contact person" value={value.contactPerson} onChange={contactPerson => setValue({ ...value, contactPerson })} /><Field label="WhatsApp" value={value.whatsapp} onChange={whatsapp => setValue({ ...value, whatsapp })} /><Field label="Email" type="email" value={value.email} onChange={email => setValue({ ...value, email })} /><Field label="Website" type="url" value={value.website} onChange={website => setValue({ ...value, website })} /><Field label="Services (comma-separated)" value={value.services.join(', ')} onChange={services => setValue({ ...value, services: splitTags(services) })} /><StatusFields value={value} setValue={setValue} /><label className="text-xs font-bold md:col-span-2">Verification document<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full" /></label></>;
}

function CreatorFields({ value, setValue }: { value: Omit<CreatorMarketplaceRecord, 'id'>; setValue: (value: Omit<CreatorMarketplaceRecord, 'id'>) => void }) {
  return <><Field label="Display name" required value={value.displayName} onChange={displayName => setValue({ ...value, displayName })} /><Field label="Location" value={value.location} onChange={location => setValue({ ...value, location })} /><label className="text-xs font-bold md:col-span-2">Bio<textarea value={value.bio} onChange={e => setValue({ ...value, bio: e.target.value })} className="mt-1 min-h-24 w-full" /></label><Field label="District" value={value.district} onChange={district => setValue({ ...value, district })} /><Field label="Platforms (comma-separated)" value={value.platforms.join(', ')} onChange={platforms => setValue({ ...value, platforms: splitTags(platforms).slice(0, 12) })} /><Field label="Categories (comma-separated)" value={value.categories.join(', ')} onChange={categories => setValue({ ...value, categories: splitTags(categories) })} /><Field label="Profile URL" type="url" value={value.profileUrl} onChange={profileUrl => setValue({ ...value, profileUrl })} /><Field label="Email" type="email" value={value.email} onChange={email => setValue({ ...value, email })} /><Field label="WhatsApp" value={value.whatsapp} onChange={whatsapp => setValue({ ...value, whatsapp })} /><NumberField label="Audience" value={value.audienceCount} onChange={audienceCount => setValue({ ...value, audienceCount })} /><NumberField label="Engagement %" value={value.engagementPercent} max={100} onChange={engagementPercent => setValue({ ...value, engagementPercent })} /><NumberField label="Minimum rate" value={value.rateMin} onChange={rateMin => setValue({ ...value, rateMin })} /><NumberField label="Maximum rate" value={value.rateMax} onChange={rateMax => setValue({ ...value, rateMax })} /><Field label="Currency" value={value.currencyCode} onChange={currencyCode => setValue({ ...value, currencyCode: currencyCode.toUpperCase().slice(0, 3) })} /><label className="text-xs font-bold">Availability<select value={value.availabilityStatus} onChange={e => setValue({ ...value, availabilityStatus: e.target.value as CreatorMarketplaceRecord['availabilityStatus'] })} className="mt-1 w-full"><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select></label><StatusFields value={value} setValue={setValue} /></>;
}

function StatusFields<T extends { status: BusinessDirectoryRecord['status']; isVerified: boolean; isFeatured: boolean }>({ value, setValue }: { value: T; setValue: (value: T) => void }) { return <><label className="text-xs font-bold">Status<select value={value.status} onChange={e => setValue({ ...value, status: e.target.value as T['status'] })} className="mt-1 w-full"><option value="active">Active</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label><div className="flex items-end gap-4 pb-2"><label className="text-xs font-bold"><input type="checkbox" checked={value.isVerified} onChange={e => setValue({ ...value, isVerified: e.target.checked })} /> Verified</label><label className="text-xs font-bold"><input type="checkbox" checked={value.isFeatured} onChange={e => setValue({ ...value, isFeatured: e.target.checked })} /> Featured</label></div></>; }
function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="text-xs font-bold">{label}<input required={required} type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full" /></label>; }
function NumberField({ label, value, onChange, max }: { label: string; value: number | null; onChange: (value: number | null) => void; max?: number }) { return <label className="text-xs font-bold">{label}<input type="number" min="0" max={max} step="any" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full" /></label>; }

function Badges({ verified, featured }: { verified: boolean; featured: boolean }) { return <div className="flex gap-1">{verified && <span className="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800"><BadgeCheck className="h-3 w-3" />Verified</span>}{featured && <span className="inline-flex items-center gap-1 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800"><Star className="h-3 w-3" />Featured</span>}</div>; }
function Actions({ edit, remove }: { edit: () => void; remove: () => void }) { return <div className="flex gap-1"><button aria-label="Edit profile" onClick={edit} className="p-2 text-slate-500"><Pencil className="h-4 w-4" /></button><button aria-label="Delete profile" onClick={remove} className="p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></div>; }
function BusinessCard({ record, edit, remove }: { record: BusinessDirectoryRecord; edit: (record: BusinessDirectoryRecord) => void; remove: (id: string) => void }) { return <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs"><div className="flex justify-between gap-3"><div><Badges verified={record.isVerified} featured={record.isFeatured} /><h4 className="mt-2 font-display font-bold text-slate-900">{record.businessName}</h4><p className="text-xs text-slate-500">{record.category} · {record.city || record.district}</p></div><Actions edit={() => edit(record)} remove={() => void remove(record.id)} /></div><p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{record.description || 'No description.'}</p><div className="mt-3 flex flex-wrap gap-1">{record.services.slice(0, 5).map(service => <span key={service} className="bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{service}</span>)}</div><p className="mt-4 font-mono text-[10px] uppercase text-slate-400">{record.status}</p></article>; }
function CreatorCard({ record, edit, remove, invite }: { record: CreatorMarketplaceRecord; edit: (record: CreatorMarketplaceRecord) => void; remove: (id: string) => void; invite: (record: CreatorMarketplaceRecord) => void }) { return <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs"><div className="flex justify-between gap-3"><div><Badges verified={record.isVerified} featured={record.isFeatured} /><h4 className="mt-2 font-display font-bold text-slate-900">{record.displayName}</h4><p className="text-xs text-slate-500">{record.location} · {record.availabilityStatus}</p></div><Actions edit={() => edit(record)} remove={() => void remove(record.id)} /></div><p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{record.bio || 'No biography.'}</p><div className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-100 py-3 text-xs"><span><b className="block">{record.audienceCount?.toLocaleString() ?? '—'}</b>Audience</span><span><b className="block">{record.engagementPercent == null ? '—' : `${record.engagementPercent}%`}</b>Engagement</span><span><b className="block">{record.rateMin == null ? '—' : `${record.currencyCode} ${record.rateMin.toLocaleString()}`}</b>From</span></div><button onClick={() => void invite(record)} className="mt-4 inline-flex items-center gap-2 bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Megaphone className="h-3.5 w-3.5" />Create CRM opportunity</button></article>; }
