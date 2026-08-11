import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { verifyExistingTotp } from '../lib/accountSecurityApi';
import { supabase } from '../lib/supabaseClient';

export function MfaChallengeScreen({ onVerified }: { onVerified: () => void }) {
  const [code,setCode]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const verify=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await verifyExistingTotp(code);onVerified();}catch(x){setError(x instanceof Error?x.message:'The code could not be verified.');}finally{setBusy(false);}};
  return <main className="grid min-h-screen place-items-center border-4 border-slate-950 bg-slate-50 p-6 md:border-8">
    <section className="w-full max-w-md border-2 border-slate-950 bg-white p-7 shadow-[8px_8px_0_#0f172a]">
      <KeyRound className="h-9 w-9 text-emerald-600"/><p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-emerald-700">Second factor required</p>
      <h1 className="mt-2 font-display text-3xl font-black">Verify your sign-in</h1><p className="mt-2 text-sm leading-6 text-slate-600">Enter the six-digit code from your authenticator app.</p>
      <form onSubmit={verify} className="mt-6 space-y-4"><label className="block text-xs font-bold uppercase">Authenticator code<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} className="mt-2 w-full border-2 border-slate-300 p-3 text-center font-mono text-xl tracking-[.4em]"/></label>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy||code.length!==6} className="flex w-full items-center justify-center gap-2 bg-slate-950 p-3 text-xs font-bold uppercase text-white disabled:opacity-50">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}Verify and continue</button></form>
      <button onClick={()=>void supabase.auth.signOut()} className="mt-4 w-full text-xs font-bold uppercase text-slate-500">Sign out</button>
    </section>
  </main>;
}
