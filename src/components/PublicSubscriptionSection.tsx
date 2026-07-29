import { FormEvent, useEffect, useState } from 'react';
import { Bell, CheckCircle, Loader2, Mail, MapPin, MessageCircle } from 'lucide-react';
import { fetchCountries, fetchDistricts, subscribePublicAudience, TaxonomyOption } from '../lib/procurementApi';

const INTERESTS = ['Tenders', 'Jobs', 'Business offers', 'Events', 'Training', 'Products & services'];

export function PublicSubscriptionSection({ onSubscribed }: { onSubscribed?: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interests, setInterests] = useState<string[]>(['Tenders']);
  const [locations, setLocations] = useState<string[]>([]);
  const [districts, setDistricts] = useState<TaxonomyOption[]>([]);
  const [frequency, setFrequency] = useState<'urgent' | 'daily' | 'weekly'>('weekly');
  const [emailChannel, setEmailChannel] = useState(true);
  const [whatsAppChannel, setWhatsAppChannel] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    fetchCountries()
      .then(countries => {
        const country = countries.find(item => item.name === 'Sierra Leone') ?? countries[0];
        return country ? fetchDistricts(country.id) : [];
      })
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, []);

  const toggle = (value: string, values: string[], setter: (next: string[]) => void) => {
    setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent) {
      setFeedback('Please confirm that Manohub may send you the updates you selected.');
      return;
    }
    const preferredChannels = [
      ...(emailChannel ? ['email'] : []),
      ...(whatsAppChannel ? ['whatsapp'] : []),
    ];
    if (!preferredChannels.length) {
      setFeedback('Choose email, WhatsApp, or both.');
      return;
    }
    if (emailChannel && !email.trim()) {
      setFeedback('Enter an email address or turn off email updates.');
      return;
    }
    if (whatsAppChannel && !phone.trim()) {
      setFeedback('Enter a WhatsApp number or turn off WhatsApp updates.');
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      await subscribePublicAudience({ fullName, email, phone, interests, locations, preferredChannels, frequency });
      setSubscribed(true);
      onSubscribed?.();
      setFeedback('Your preferences have been saved. Welcome to the Manohub audience.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Your subscription could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="updates" className="border-b-2 border-[#0F172A] bg-[#172554] px-6 py-14 text-white">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.8fr_1.2fr]">
        <div className="flex flex-col justify-between">
          <div>
            <span className="inline-flex items-center gap-2 bg-[#F4D35E] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#0F172A]"><Bell className="h-3.5 w-3.5" /> Your Manohub feed</span>
            <h2 className="mt-5 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">Get the opportunities and offers that matter to you.</h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-blue-100">Choose what you want to receive, where you are interested in, and how often Manohub should contact you.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="border border-white/20 bg-white/5 p-4"><Mail className="h-5 w-5 text-[#F4D35E]" /><p className="mt-3 font-display font-bold">Email digests</p><p className="mt-1 text-xs text-blue-100">Daily or weekly summaries.</p></div>
            <div className="border border-white/20 bg-white/5 p-4"><MessageCircle className="h-5 w-5 text-emerald-300" /><p className="mt-3 font-display font-bold">WhatsApp-ready</p><p className="mt-1 text-xs text-blue-100">Urgent and relevant alerts.</p></div>
          </div>
        </div>

        <form onSubmit={submit} className="border-2 border-[#0F172A] bg-white p-5 text-[#0F172A] shadow-[8px_8px_0_0_#F4D35E] sm:p-7">
          {subscribed ? (
            <div role="status" className="flex min-h-80 flex-col items-center justify-center text-center">
              <CheckCircle className="h-12 w-12 text-emerald-600" />
              <h3 className="mt-4 font-display text-2xl font-extrabold">You’re subscribed.</h3>
              <p className="mt-2 max-w-md text-sm text-slate-600">{feedback}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-600">Name<input value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Your name" className="mt-1 w-full" /></label>
                <label className="text-xs font-bold text-slate-600">Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1 w-full" /></label>
                <label className="text-xs font-bold text-slate-600 sm:col-span-2">WhatsApp number <span className="font-normal text-slate-600">(optional)</span><input type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+232 …" className="mt-1 w-full" /></label>
              </div>

              <fieldset className="mt-5">
                <legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">What interests you?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTERESTS.map(interest => <button key={interest} type="button" aria-pressed={interests.includes(interest)} onClick={() => toggle(interest, interests, setInterests)} className={`border px-3 py-2 text-xs font-bold ${interests.includes(interest) ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{interest}</button>)}
                </div>
              </fieldset>

              {districts.length > 0 && <fieldset className="mt-5">
                <legend className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500"><MapPin className="h-3.5 w-3.5" /> Locations <span className="normal-case tracking-normal text-slate-600">(optional)</span></legend>
                <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                  {districts.map(district => <button key={district.id} type="button" aria-pressed={locations.includes(district.name)} onClick={() => toggle(district.name, locations, setLocations)} className={`border px-3 py-2 text-xs ${locations.includes(district.name) ? 'border-emerald-700 bg-emerald-50 font-bold text-emerald-800' : 'border-slate-300 text-slate-600'}`}>{district.name}</button>)}
                </div>
              </fieldset>}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-600">Frequency<select value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)} className="mt-1 w-full"><option value="urgent">Urgent alerts</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option></select></label>
                <fieldset><legend className="text-xs font-bold text-slate-600">Send through</legend><div className="mt-3 flex gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={emailChannel} onChange={event => setEmailChannel(event.target.checked)} /> Email</label><label className="flex items-center gap-2"><input type="checkbox" checked={whatsAppChannel} onChange={event => setWhatsAppChannel(event.target.checked)} /> WhatsApp</label></div></fieldset>
              </div>

              <label className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-slate-600"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-0.5" /><span>I agree that Manohub may contact me with the categories and frequency selected. I can unsubscribe at any time.</span></label>
              {feedback && <p role="alert" className="mt-4 border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{feedback}</p>}
              <button type="submit" disabled={saving} className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-emerald-600 px-5 py-3.5 font-mono text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Subscribe to updates</button>
              <p className="mt-3 text-center text-[10px] text-slate-600">Consent source and date are securely recorded for every subscription.</p>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
