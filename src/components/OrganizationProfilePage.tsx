import { useEffect, useState } from 'react';
import { Building2, Save, UserRound } from 'lucide-react';
import type { Organization } from '../types';
import { fetchMyProfile, updateMyProfile, updateOrganizationProfile } from '../lib/api';
import { getSubscriberType } from '../domain/subscriptions/subscriberTypes';

const ORGANIZATION_TYPES = [
  'Small Business', 'Sole Trader / Individual Professional', 'Private Company',
  'Agricultural Cooperative', 'Catering & Food Services', 'Tourism Operator',
  'NGO / Development Partner', 'Government Ministry / Agency', 'Local Council',
  'State-Owned Enterprise', 'Educational Institution', 'Creative / Creator Hub',
  'Diaspora Association',
];

export function OrganizationProfilePage({ activeOrg, onUpdated }: { activeOrg: Organization; onUpdated: (org: Organization) => void }) {
  const [org, setOrg] = useState(activeOrg);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const subscriber = getSubscriberType(org.subscriberType);

  useEffect(() => { setOrg(activeOrg); }, [activeOrg]);
  useEffect(() => { void fetchMyProfile().then((profile) => { setFullName(profile.fullName); setEmail(profile.email); }).catch(() => setFeedback('Your personal profile could not be loaded.')); }, []);

  const setDetail = (key: string, value: string) => setOrg((current) => ({ ...current, subscriberDetails: { ...current.subscriberDetails, [key]: value } }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setFeedback('');
    try {
      const [updated] = await Promise.all([updateOrganizationProfile(org), updateMyProfile(fullName)]);
      setOrg(updated); onUpdated(updated); setFeedback('Your personal and organisation profiles have been updated.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Profile could not be updated.'); }
    finally { setBusy(false); }
  };

  const field = 'mt-1 block w-full border border-slate-300 bg-white p-3 text-sm font-normal normal-case';
  return <form onSubmit={save} className="space-y-6 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">{subscriber.label}</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">{subscriber.profileLabel}</h2>
      <p className="mt-2 text-sm text-slate-300">Keep the identity and operating details shown across your ManoHub workspace accurate.</p>
    </section>
    {feedback && <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</div>}

    <section className="border-2 border-slate-950 bg-white p-6">
      <h3 className="flex items-center gap-2 font-display text-xl font-extrabold"><UserRound className="h-5 w-5 text-emerald-600"/>My profile</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold uppercase text-slate-600">Full name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={field}/></label>
        <label className="text-xs font-bold uppercase text-slate-600">Email<input readOnly value={email} className={`${field} bg-slate-100 text-slate-500`}/></label>
      </div>
    </section>

    <section className="border-2 border-slate-950 bg-white p-6">
      <h3 className="flex items-center gap-2 font-display text-xl font-extrabold"><Building2 className="h-5 w-5 text-sky-600"/>Organisation details</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold uppercase text-slate-600">Organisation name<input required value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} className={field}/></label>
        <label className="text-xs font-bold uppercase text-slate-600">Organisation type<select value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value })} className={field}>{ORGANIZATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="text-xs font-bold uppercase text-slate-600">Country<input required value={org.country} onChange={(e) => setOrg({ ...org, country: e.target.value })} className={field}/></label>
        {org.country.trim().toLowerCase() === 'sierra leone' && <label className="text-xs font-bold uppercase text-slate-600">District<input required value={org.district ?? ''} onChange={(e) => setOrg({ ...org, district: e.target.value })} className={field}/></label>}
        <label className="text-xs font-bold uppercase text-slate-600">City / town<input required value={org.city} onChange={(e) => setOrg({ ...org, city: e.target.value })} className={field}/></label>
        <label className="text-xs font-bold uppercase text-slate-600">Website<input type="url" value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} className={field}/></label>
        <label className="text-xs font-bold uppercase text-slate-600">Telephone<input required value={org.phone} onChange={(e) => setOrg({ ...org, phone: e.target.value })} className={field}/></label>
        <label className="text-xs font-bold uppercase text-slate-600">WhatsApp<input value={org.whatsapp} onChange={(e) => setOrg({ ...org, whatsapp: e.target.value })} className={field}/></label>
        <label className="text-xs font-bold uppercase text-slate-600 md:col-span-2">Description<textarea required maxLength={1000} rows={4} value={org.description} onChange={(e) => setOrg({ ...org, description: e.target.value })} className={field}/></label>
      </div>
    </section>

    <section className="border-2 border-slate-950 bg-white p-6">
      <h3 className="font-display text-xl font-extrabold">{subscriber.label} preferences</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {org.subscriberType === 'viewer' && <>
          <label className="text-xs font-bold uppercase text-slate-600">Registration number<input value={org.subscriberDetails.registration_number ?? ''} onChange={(e) => setDetail('registration_number', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Geographic coverage<input value={org.subscriberDetails.geographic_coverage ?? ''} onChange={(e) => setDetail('geographic_coverage', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Sectors served<input value={org.subscriberDetails.sectors ?? ''} onChange={(e) => setDetail('sectors', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Tender interests<input value={org.subscriberDetails.tender_interests ?? ''} onChange={(e) => setDetail('tender_interests', e.target.value)} className={field}/></label>
        </>}
        {org.subscriberType === 'publisher' && <>
          <label className="text-xs font-bold uppercase text-slate-600">Procurement sectors<input value={org.subscriberDetails.procurement_sectors ?? ''} onChange={(e) => setDetail('procurement_sectors', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Tender frequency<input value={org.subscriberDetails.tender_frequency ?? ''} onChange={(e) => setDetail('tender_frequency', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600 md:col-span-2">Procurement contact<input value={org.subscriberDetails.contact_person ?? ''} onChange={(e) => setDetail('contact_person', e.target.value)} className={field}/></label>
        </>}
        {org.subscriberType === 'advertiser' && <>
          <label className="text-xs font-bold uppercase text-slate-600">Primary objective<input value={org.primaryObjective} onChange={(e) => setOrg({ ...org, primaryObjective: e.target.value })} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Audience scope<input value={org.audienceScope} onChange={(e) => setOrg({ ...org, audienceScope: e.target.value })} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Preferred channels<input value={org.subscriberDetails.preferred_channels ?? ''} onChange={(e) => setDetail('preferred_channels', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Monthly budget (SLE)<input type="number" min="0" step="0.01" value={org.monthlyBudgetSle ?? ''} onChange={(e) => setOrg({ ...org, monthlyBudgetSle: e.target.value ? Number(e.target.value) : null })} className={field}/></label>
        </>}
        {org.subscriberType === 'free' && <>
          <label className="text-xs font-bold uppercase text-slate-600">Topics of interest<input value={org.subscriberDetails.interests ?? ''} onChange={(e) => setDetail('interests', e.target.value)} className={field}/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Preferred locations<input value={org.subscriberDetails.preferred_locations ?? ''} onChange={(e) => setDetail('preferred_locations', e.target.value)} className={field}/></label>
        </>}
      </div>
    </section>
    <button disabled={busy} className="inline-flex items-center gap-2 bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{busy ? 'Saving…' : 'Save profiles'}</button>
  </form>;
}
