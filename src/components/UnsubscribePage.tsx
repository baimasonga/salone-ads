import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { unsubscribePublicAudience } from '../lib/audienceApi';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'done' | 'invalid' | 'error'>('loading');

  useEffect(() => {
    if (!UUID_PATTERN.test(token)) {
      setState('invalid');
      return;
    }
    unsubscribePublicAudience(token)
      .then(changed => setState(changed ? 'done' : 'invalid'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#172554] px-6 py-12 text-[#0F172A]">
      <section className="w-full max-w-lg border-2 border-[#0F172A] bg-white p-8 text-center shadow-[10px_10px_0_0_#F4D35E]">
        {state === 'loading' && <><Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-600" /><h1 className="mt-5 font-display text-2xl font-extrabold">Updating your preferences…</h1></>}
        {state === 'done' && <><CheckCircle className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-5 font-display text-2xl font-extrabold">You have been unsubscribed.</h1><p className="mt-3 text-sm text-slate-600">Hyderra will no longer send audience updates to this subscription.</p></>}
        {state === 'invalid' && <><ShieldCheck className="mx-auto h-12 w-12 text-orange-500" /><h1 className="mt-5 font-display text-2xl font-extrabold">This link is invalid or already used.</h1><p className="mt-3 text-sm text-slate-600">No active subscription could be found for this secure link.</p></>}
        {state === 'error' && <><ShieldCheck className="mx-auto h-12 w-12 text-red-600" /><h1 className="mt-5 font-display text-2xl font-extrabold">We could not process the request.</h1><p className="mt-3 text-sm text-slate-600">Please try again later or contact Hyderra support.</p></>}
        <Link to="/" className="mt-7 inline-flex border border-[#0F172A] bg-[#0F172A] px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white">Return to Hyderra</Link>
      </section>
    </main>
  );
}
