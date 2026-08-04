import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, FileUp, Landmark, Smartphone } from 'lucide-react';
import type { Organization } from '../types';
import { fetchMySubscriptions, fetchPlans, requestSubscription, type OrgSubscription, type Plan } from '../lib/procurement/subscriptionRequestApi';
import {
  fetchSubscriptionPaymentProof,
  submitSubscriptionPaymentProof,
  uploadSubscriptionReceipt,
  type SubscriptionPaymentMethod,
  type SubscriptionPaymentProof,
} from '../lib/subscriptionPaymentApi';

const bankInstructions = import.meta.env.VITE_MANOHUB_BANK_INSTRUCTIONS || 'Ask ManoHub Finance to confirm the bank account and exact amount before transferring.';
const mobileInstructions = import.meta.env.VITE_MANOHUB_MOBILE_MONEY_INSTRUCTIONS || 'Ask ManoHub Finance to confirm the registered mobile-money number and exact amount before sending.';
const financeContact = import.meta.env.VITE_MANOHUB_FINANCE_CONTACT || 'Use Customer Requests to contact ManoHub Finance.';

export function SubscriptionBillingPage({ activeOrg }: { activeOrg: Organization }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<OrgSubscription[]>([]);
  const [proof, setProof] = useState<SubscriptionPaymentProof | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [payerName, setPayerName] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);

  const pending = subscriptions.find(item => item.status === 'pending');
  const active = subscriptions.find(item => item.status === 'active');
  const selectedPlan = plans.find(item => item.id === selectedPlanId);
  const quotedPrice = selectedPlan && (billingCycle === 'annual' ? selectedPlan.annualPrice : selectedPlan.monthlyPrice);

  const load = async () => {
    setLoading(true);
    try {
      const [availablePlans, items] = await Promise.all([fetchPlans(), fetchMySubscriptions(activeOrg.id)]);
      setPlans(availablePlans.filter(item => item.code !== 'free'));
      setSubscriptions(items);
      const waiting = items.find(item => item.status === 'pending');
      setProof(waiting ? await fetchSubscriptionPaymentProof(waiting.id) : null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Billing information could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [activeOrg.id]);
  useEffect(() => {
    if (quotedPrice != null) setAmount(String(quotedPrice));
  }, [quotedPrice]);

  const statusCopy = useMemo(() => {
    if (!pending) return null;
    if (!proof) return { title: 'Payment evidence required', body: 'Your plan request is saved. Submit the payment reference below after paying.' };
    if (proof.status === 'rejected') return { title: 'Payment needs correction', body: proof.reviewNote || 'Review the payment details and submit them again.' };
    return { title: 'Payment under review', body: 'ManoHub Finance received your evidence. Access begins only after administrator verification.' };
  }, [pending, proof]);

  const requestPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPlanId) return;
    setBusy(true); setFeedback('');
    try {
      await requestSubscription(activeOrg.id, selectedPlanId, billingCycle, 'Requested from Billing');
      await load();
      setFeedback('Plan requested. Complete the payment step below.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Plan request failed.'); }
    finally { setBusy(false); }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending || reference.trim().length < 3) return;
    setBusy(true); setFeedback('');
    try {
      let receiptObjectPath: string | null = proof?.receiptObjectPath ?? null;
      if (receipt) receiptObjectPath = await uploadSubscriptionReceipt(activeOrg.id, pending.id, receipt);
      await submitSubscriptionPaymentProof({
        subscriptionId: pending.id,
        paymentMethod: method,
        paymentReference: reference,
        amount: amount.trim() ? Number(amount) : null,
        payerName,
        receiptObjectPath,
      });
      setReference(''); setAmount(''); setPayerName(''); setReceipt(null);
      await load();
      setFeedback('Payment evidence submitted. ManoHub Finance will review it.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Payment evidence could not be submitted.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="border-2 border-slate-950 bg-white p-8 text-sm text-slate-500">Loading subscription billing…</div>;

  return <div className="space-y-6 text-left">
    <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300">Account & access</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold !text-white">Subscription & Payment</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">Request a plan, pay through a confirmed ManoHub channel, and track administrator activation.</p>
    </section>

    {feedback && <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</div>}

    <section className="grid gap-3 md:grid-cols-3">
      <div className="border-2 border-slate-950 bg-white p-5"><CheckCircle2 className="h-5 w-5 text-emerald-600"/><p className="mt-3 text-xs uppercase text-slate-500">Current access</p><p className="font-display text-xl font-extrabold">{active?.planName ?? 'Free Access'}</p></div>
      <div className="border-2 border-slate-950 bg-white p-5"><Clock3 className="h-5 w-5 text-amber-600"/><p className="mt-3 text-xs uppercase text-slate-500">Request status</p><p className="font-display text-xl font-extrabold">{pending ? (proof?.status === 'pending' ? 'Payment review' : 'Payment required') : 'No pending request'}</p></div>
      <div className="border-2 border-slate-950 bg-white p-5"><Banknote className="h-5 w-5 text-sky-600"/><p className="mt-3 text-xs uppercase text-slate-500">Finance contact</p><p className="mt-1 text-sm font-semibold">{financeContact}</p></div>
    </section>

    {pending && statusCopy ? <>
      <section className="border-2 border-amber-400 bg-amber-50 p-5"><h3 className="font-display text-lg font-extrabold text-amber-950">{statusCopy.title}</h3><p className="mt-2 text-sm text-amber-900">{pending.planName} · {pending.billingCycle}. {statusCopy.body}</p></section>
      {proof?.status !== 'pending' && <form onSubmit={submitPayment} className="border-2 border-slate-950 bg-white p-6 space-y-5">
        <div><h3 className="font-display text-xl font-extrabold">Submit payment evidence</h3><p className="mt-1 text-xs text-slate-500">A reference is required. A receipt image or PDF is strongly recommended.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold uppercase text-slate-600">Payment method<select value={method} onChange={event => setMethod(event.target.value as SubscriptionPaymentMethod)} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case"><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option></select></label>
          <div className="border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">{method === 'bank_transfer' ? <><Landmark className="mb-2 h-4 w-4"/>{bankInstructions}</> : <><Smartphone className="mb-2 h-4 w-4"/>{mobileInstructions}</>}</div>
          <label className="text-xs font-bold uppercase text-slate-600">Transaction reference<input required minLength={3} maxLength={120} value={reference} onChange={event => setReference(event.target.value)} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case" placeholder="Bank or mobile-money reference"/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Amount paid (SLE)<input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case" placeholder="Enter confirmed amount"/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Payer name<input maxLength={160} value={payerName} onChange={event => setPayerName(event.target.value)} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case" placeholder="Name used for payment"/></label>
          <label className="text-xs font-bold uppercase text-slate-600">Receipt (optional)<span className="mt-1 flex items-center gap-2 border border-dashed border-slate-400 p-3 text-sm font-normal normal-case"><FileUp className="h-4 w-4"/><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setReceipt(event.target.files?.[0] ?? null)}/></span></label>
        </div>
        <button disabled={busy} className="bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Submitting…' : proof?.status === 'rejected' ? 'Resubmit evidence' : 'Submit for verification'}</button>
      </form>}
    </> : <form onSubmit={requestPlan} className="border-2 border-slate-950 bg-white p-6 space-y-5">
      <h3 className="font-display text-xl font-extrabold">Request a paid plan</h3>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-bold uppercase text-slate-600">Plan<select required value={selectedPlanId} onChange={event => setSelectedPlanId(event.target.value)} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case"><option value="">Select a plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label className="text-xs font-bold uppercase text-slate-600">Billing cycle<select value={billingCycle} onChange={event => setBillingCycle(event.target.value as 'monthly' | 'annual')} className="mt-1 block w-full border border-slate-300 p-3 text-sm font-normal normal-case"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label></div>
      <p className="text-xs text-slate-500">{quotedPrice == null ? 'ManoHub Finance will confirm the exact amount before payment.' : `Amount: ${selectedPlan?.currencyCode} ${quotedPrice.toLocaleString()}`}</p>
      <button disabled={busy} className="bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Requesting…' : 'Request plan'}</button>
    </form>}

    {subscriptions.length > 0 && <section className="border-2 border-slate-950 bg-white"><h3 className="border-b-2 border-slate-950 p-4 font-display text-lg font-extrabold">Subscription history</h3><div className="divide-y">{subscriptions.map(item => <div key={item.id} className="flex items-center justify-between p-4 text-sm"><span>{item.planName} · {new Date(item.createdAt).toLocaleDateString('en-GB')}</span><strong className="text-xs uppercase">{item.status.replaceAll('_', ' ')}</strong></div>)}</div></section>}
  </div>;
}
