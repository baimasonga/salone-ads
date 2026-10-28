import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BriefcaseBusiness, Loader2, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import type { Organization } from '../../types';
import { uploadMediaAsset } from '../../lib/api';
import {
  deleteBusinessDirectoryRecord,
  fetchBusinessDirectoryRecords,
  saveBusinessDirectoryRecord,
  type BusinessDirectoryRecord,
} from '../../lib/businessDirectoryApi';

const splitTags = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20);
const emptyBusiness = (): Omit<BusinessDirectoryRecord, 'id'> => ({ businessName: '', category: '', description: '', district: '', city: 'Freetown', whatsapp: '', email: '', website: '', services: [], contactPerson: '', isVerified: false, diasporaSupport: false, isFeatured: false, status: 'active' });

export function BusinessDirectoryWorkspace({ organization }: { organization: Organization }) {
  const [businesses, setBusinesses] = useState<BusinessDirectoryRecord[]>([]);
  const [businessDraft, setBusinessDraft] = useState(emptyBusiness());
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = async () => setBusinesses(await fetchBusinessDirectoryRecords());
  useEffect(() => { void load().catch(error => setFeedback(error.message || 'Could not load directory.')); }, [organization.id]);
  const reset = () => { setEditingId(''); setShowForm(false); setVerificationFile(null); setBusinessDraft(emptyBusiness()); };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const records = businesses;
    return records.filter(record => {
      const name = record.businessName;
      return (!term || name.toLowerCase().includes(term)) && (statusFilter === 'all' || record.status === statusFilter);
    });
  }, [businesses, search, statusFilter]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setFeedback('');
    try {
      if (businessDraft.isVerified && !editingId && !verificationFile) throw new Error('Attach a registration or tax document before verifying a new listing.');
      if (verificationFile) await uploadMediaAsset(organization.id, verificationFile, 'Verification Documents');
      await saveBusinessDirectoryRecord(organization.id, businessDraft, editingId || undefined);
      await load(); reset(); setFeedback(editingId ? 'Profile updated.' : 'Profile created.');
    } catch (error: any) { setFeedback(error.message || 'Could not save profile.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this business profile permanently?')) return;
    try { await deleteBusinessDirectoryRecord(id); await load(); }
    catch (error: any) { setFeedback(error.message || 'Could not delete profile.'); }
  };

  const editBusiness = (record: BusinessDirectoryRecord) => { setBusinessDraft({ ...record }); setEditingId(record.id); setShowForm(true); };
  const Icon = BriefcaseBusiness;

  return <div className="space-y-6 text-left">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
      <div><h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900"><Icon className="h-5 w-5 text-emerald-600" />Business Directory Management</h3><p className="mt-1 text-xs text-slate-500">Search, verify, feature and manage complete business listings.</p></div>
      <button onClick={() => { reset(); setShowForm(true); }} className="btn-geometric-primary inline-flex items-center justify-center gap-2 text-xs"><Plus className="h-4 w-4" /> Add profile</button>
    </div>
    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_180px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search marketplace" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name" className="w-full pl-10" /></label><select aria-label="Filter profile status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></div>
    {feedback && <div role="status" className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</div>}
    {showForm && <form onSubmit={submit} className="grid gap-4 rounded-2xl border-2 border-emerald-500 bg-white p-6 md:grid-cols-2">
      <BusinessFields value={businessDraft} setValue={setBusinessDraft} setFile={setVerificationFile} />
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="btn-geometric-primary inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</button><button type="button" onClick={reset} className="btn-geometric-secondary">Cancel</button></div>
    </form>}
    <div className="grid gap-4 lg:grid-cols-2">{filtered.map(record => <BusinessCard key={record.id} record={record} edit={editBusiness} remove={remove} />)}</div>
    {filtered.length === 0 && <div className="border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No matching profiles.</div>}
  </div>;
}

function BusinessFields({ value, setValue, setFile }: { value: Omit<BusinessDirectoryRecord, 'id'>; setValue: (value: Omit<BusinessDirectoryRecord, 'id'>) => void; setFile: (file: File | null) => void }) {
  return <><Field label="Business name" required value={value.businessName} onChange={businessName => setValue({ ...value, businessName })} /><Field label="Category" required value={value.category} onChange={category => setValue({ ...value, category })} /><label className="text-xs font-bold md:col-span-2">Description<textarea value={value.description} onChange={e => setValue({ ...value, description: e.target.value })} className="mt-1 min-h-24 w-full" /></label><Field label="City" value={value.city} onChange={city => setValue({ ...value, city })} /><Field label="District" value={value.district} onChange={district => setValue({ ...value, district })} /><Field label="Contact person" value={value.contactPerson} onChange={contactPerson => setValue({ ...value, contactPerson })} /><Field label="WhatsApp" value={value.whatsapp} onChange={whatsapp => setValue({ ...value, whatsapp })} /><Field label="Email" type="email" value={value.email} onChange={email => setValue({ ...value, email })} /><Field label="Website" type="url" value={value.website} onChange={website => setValue({ ...value, website })} /><Field label="Services (comma-separated)" value={value.services.join(', ')} onChange={services => setValue({ ...value, services: splitTags(services) })} /><StatusFields value={value} setValue={setValue} /><label className="text-xs font-bold md:col-span-2">Verification document<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full" /></label></>;
}

function StatusFields<T extends { status: BusinessDirectoryRecord['status']; isVerified: boolean; isFeatured: boolean }>({ value, setValue }: { value: T; setValue: (value: T) => void }) { return <><label className="text-xs font-bold">Status<select value={value.status} onChange={e => setValue({ ...value, status: e.target.value as T['status'] })} className="mt-1 w-full"><option value="active">Active</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label><div className="flex items-end gap-4 pb-2"><label className="text-xs font-bold"><input type="checkbox" checked={value.isVerified} onChange={e => setValue({ ...value, isVerified: e.target.checked })} /> Verified</label><label className="text-xs font-bold"><input type="checkbox" checked={value.isFeatured} onChange={e => setValue({ ...value, isFeatured: e.target.checked })} /> Featured</label></div></>; }
function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="text-xs font-bold">{label}<input required={required} type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full" /></label>; }

function Badges({ verified, featured }: { verified: boolean; featured: boolean }) { return <div className="flex gap-1">{verified && <span className="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800"><BadgeCheck className="h-3 w-3" />Verified</span>}{featured && <span className="inline-flex items-center gap-1 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800"><Star className="h-3 w-3" />Featured</span>}</div>; }
function Actions({ edit, remove }: { edit: () => void; remove: () => void }) { return <div className="flex gap-1"><button aria-label="Edit profile" onClick={edit} className="p-2 text-slate-500"><Pencil className="h-4 w-4" /></button><button aria-label="Delete profile" onClick={remove} className="p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></div>; }
function BusinessCard({ record, edit, remove }: { record: BusinessDirectoryRecord; edit: (record: BusinessDirectoryRecord) => void; remove: (id: string) => void }) { return <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs"><div className="flex justify-between gap-3"><div><Badges verified={record.isVerified} featured={record.isFeatured} /><h4 className="mt-2 font-display font-bold text-slate-900">{record.businessName}</h4><p className="text-xs text-slate-500">{record.category} · {record.city || record.district}</p></div><Actions edit={() => edit(record)} remove={() => void remove(record.id)} /></div><p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{record.description || 'No description.'}</p><div className="mt-3 flex flex-wrap gap-1">{record.services.slice(0, 5).map(service => <span key={service} className="bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{service}</span>)}</div><p className="mt-4 font-mono text-[10px] uppercase text-slate-400">{record.status}</p></article>; }
