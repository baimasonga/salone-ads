import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, ReceiptText, ShieldCheck } from 'lucide-react';
import type { Organization } from '../types';
import {
  AdvertOrder, AdvertPackage, AdCampaign, confirmAdvertOrder, createAdvertOrder,
  fetchAdvertOrders, fetchAdvertPackages, fetchCampaignsForWorkspace,
} from '../lib/procurementApi';

export function AdvertBillingPage({ activeOrg, isPlatformAdmin }: { activeOrg: Organization; isPlatformAdmin: boolean }) {
  const [packages, setPackages] = useState<AdvertPackage[]>([]);
  const [orders, setOrders] = useState<AdvertOrder[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [selected, setSelected] = useState<AdvertPackage | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [campaignId, setCampaignId] = useState('');
  const [method, setMethod] = useState('orange_money');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [nextPackages, nextOrders, nextCampaigns] = await Promise.all([
        fetchAdvertPackages(), fetchAdvertOrders(activeOrg.id, isPlatformAdmin),
        fetchCampaignsForWorkspace(activeOrg.id, isPlatformAdmin),
      ]);
      setPackages(nextPackages); setOrders(nextOrders); setCampaigns(nextCampaigns);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Billing information could not be loaded.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activeOrg.id, isPlatformAdmin]);

  const price = selected?.prices.find((item) => item.billingPeriod === period);
  const revenue = useMemo(() => orders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.totalAmount, 0), [orders]);

  const checkout = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !price) return;
    if (price.amount > 0 && !reference.trim()) { setFeedback('Enter the payment transaction reference.'); return; }
    setSaving(true);
    try {
      await createAdvertOrder({
        orgId: activeOrg.id, campaignId: campaignId || null, packageId: selected.id,
        billingPeriod: period, quantity: 1, amount: price.amount, currencyCode: price.currencyCode,
        paymentMethod: method, paymentReference: reference,
      });
      setSelected(null); setReference(''); await load();
      setFeedback('Order submitted. Manohub will verify payment and issue the receipt.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Order could not be submitted.'); }
    finally { setSaving(false); }
  };

  const confirm = async (orderId: string) => {
    try { await confirmAdvertOrder(orderId); await load(); setFeedback('Payment confirmed and receipt issued.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Payment could not be confirmed.'); }
  };

  return (
    <div className="space-y-6 text-left">
      <section className="border border-slate-200 bg-slate-950 p-6 text-white">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">Enhancement 3</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">{isPlatformAdmin ? 'Advert Revenue' : 'Packages & Checkout'}</h2>
        <p className="mt-1 text-sm text-slate-300">{isPlatformAdmin ? 'Verify payments, issue receipts and track advertising revenue.' : 'Choose placement, pay locally and connect the order to a campaign.'}</p>
      </section>
      {feedback && <div className="border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</div>}
      {loading ? <div className="flex justify-center p-12 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div> : (
        <>
          {!isPlatformAdmin && <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {packages.map((item) => (
              <article key={item.id} className={`border bg-white p-5 ${item.code === 'premium' ? 'border-emerald-500 shadow-md' : 'border-slate-200'}`}>
                <p className="font-mono text-[9px] uppercase tracking-widest text-slate-400">{item.placement}</p>
                <h3 className="mt-2 font-display text-xl font-bold text-slate-900">{item.name}</h3>
                <p className="mt-2 min-h-14 text-sm text-slate-500">{item.description}</p>
                <div className="mt-4 space-y-1 text-xs text-slate-600">{item.prices.sort((a,b)=>a.amount-b.amount).map((p) =>
                  <p key={p.billingPeriod}><strong>{p.currencyCode} {p.amount.toLocaleString()}</strong> / {p.billingPeriod}</p>)}</div>
                <button onClick={() => setSelected(item)} className="mt-5 w-full bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Select package</button>
              </article>
            ))}
          </section>}
          {selected && !isPlatformAdmin && (
            <form onSubmit={checkout} className="border border-slate-300 bg-white p-6">
              <h3 className="font-display text-lg font-bold">Checkout — {selected.name}</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs font-bold uppercase text-slate-500">Duration<select value={period} onChange={(e)=>setPeriod(e.target.value as typeof period)} className="mt-1 block w-full border p-3 font-normal normal-case text-slate-900"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
                <label className="text-xs font-bold uppercase text-slate-500">Campaign<select value={campaignId} onChange={(e)=>setCampaignId(e.target.value)} className="mt-1 block w-full border p-3 font-normal normal-case text-slate-900"><option value="">Not linked yet</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="text-xs font-bold uppercase text-slate-500">Payment method<select value={method} onChange={(e)=>setMethod(e.target.value)} className="mt-1 block w-full border p-3 font-normal normal-case text-slate-900"><option value="orange_money">Orange Money</option><option value="afrimoney">Afrimoney</option><option value="mobile_money">Other Mobile Money</option><option value="card">Card</option><option value="agency_credit">Agency credit</option></select></label>
                <label className="text-xs font-bold uppercase text-slate-500">Transaction reference<input value={reference} onChange={(e)=>setReference(e.target.value)} placeholder="Required for paid packages" className="mt-1 block w-full border p-3 font-normal normal-case text-slate-900" /></label>
              </div>
              <div className="mt-5 flex items-center justify-between border-t pt-4"><strong>{price ? `${price.currencyCode} ${price.amount.toLocaleString()}` : 'Price unavailable'}</strong><button disabled={saving || !price} className="bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Submitting…' : 'Place order'}</button></div>
            </form>
          )}
          {isPlatformAdmin && <section className="grid gap-3 sm:grid-cols-3"><div className="border bg-white p-5"><CreditCard className="h-5 w-5 text-emerald-600"/><p className="mt-2 text-xs text-slate-500">Paid revenue</p><p className="text-2xl font-bold">SLE {revenue.toLocaleString()}</p></div><div className="border bg-white p-5"><ShieldCheck className="h-5 w-5 text-amber-600"/><p className="mt-2 text-xs text-slate-500">Awaiting verification</p><p className="text-2xl font-bold">{orders.filter(o=>o.status==='payment_review').length}</p></div><div className="border bg-white p-5"><ReceiptText className="h-5 w-5 text-indigo-600"/><p className="mt-2 text-xs text-slate-500">Orders</p><p className="text-2xl font-bold">{orders.length}</p></div></section>}
          <section className="border border-slate-200 bg-white"><div className="border-b p-5"><h3 className="font-display text-lg font-bold">{isPlatformAdmin ? 'Payment queue' : 'Invoices & receipts'}</h3></div>{orders.length===0?<p className="p-8 text-sm text-slate-500">No advert orders yet.</p>:<div className="divide-y">{orders.map(o=><div key={o.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-slate-900">{o.packageName} · {o.billingPeriod}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{o.invoiceNumber}{o.receiptNumber ? ` · ${o.receiptNumber}` : ''} · {o.paymentMethod.replaceAll('_',' ')}</p></div><div className="flex items-center gap-3"><strong>{o.currencyCode} {o.totalAmount.toLocaleString()}</strong><span className="border px-2 py-1 text-[9px] font-bold uppercase">{o.status.replaceAll('_',' ')}</span>{isPlatformAdmin&&['payment_review','pending_payment'].includes(o.status)&&<button onClick={()=>void confirm(o.id)} className="inline-flex items-center gap-1 bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5"/> Confirm</button>}</div></div>)}</div>}</section>
        </>
      )}
    </div>
  );
}
