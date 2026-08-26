import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FilePlus2, Printer, ReceiptText, RefreshCw, Trash2 } from 'lucide-react';
import {
  createFinanceProforma,
  fetchFinanceInvoices,
  fetchFinanceOrganizations,
  fetchFinanceProformas,
  transitionFinanceProforma,
  type FinanceInvoice,
  type FinanceOrganization,
  type FinanceProforma,
  type ProformaLineInput,
} from '../../lib/financeApi';
import { printInvoice, printProforma, printReceipt } from '../../lib/financialDocumentPrint';

const tomorrow = (days = 14) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const emptyLine = (): ProformaLineInput => ({ description: '', quantity: 1, unitAmount: 0 });

export function FinancialDocumentsPanel({ orgId, admin = false }: { orgId?: string; admin?: boolean }) {
  const [proformas, setProformas] = useState<FinanceProforma[]>([]);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [organizations, setOrganizations] = useState<FinanceOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState(orgId ?? '');
  const [currency, setCurrency] = useState('SLE');
  const [validUntil, setValidUntil] = useState(tomorrow());
  const [taxAmount, setTaxAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ProformaLineInput[]>([emptyLine()]);

  const load = async () => {
    setLoading(true);
    setFeedback('');
    try {
      const [nextProformas, nextInvoices, nextOrganizations] = await Promise.all([
        fetchFinanceProformas(orgId), fetchFinanceInvoices(orgId), admin ? fetchFinanceOrganizations() : Promise.resolve([]),
      ]);
      setProformas(nextProformas);
      setInvoices(nextInvoices);
      setOrganizations(nextOrganizations);
      if (admin && !customerId && nextOrganizations[0]) setCustomerId(nextOrganizations[0].id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Financial documents could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [orgId]);
  const receiptCount = useMemo(() => invoices.reduce((total, invoice) => total + invoice.receipts.length, 0), [invoices]);

  const updateLine = (index: number, field: keyof ProformaLineInput, value: string) => {
    setLines(current => current.map((line, position) => position === index
      ? { ...line, [field]: field === 'description' ? value : Number(value) }
      : line));
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || lines.some(line => line.description.trim().length < 2 || line.quantity <= 0 || line.unitAmount < 0)) return;
    setBusy('create'); setFeedback('');
    try {
      await createFinanceProforma({ orgId: customerId, currencyCode: currency, validUntil, notes, taxAmount: Number(taxAmount), lines });
      setCreating(false); setLines([emptyLine()]); setNotes(''); setTaxAmount('0'); setValidUntil(tomorrow());
      await load();
      setFeedback('Proforma issued and added to the document register.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Proforma could not be created.'); }
    finally { setBusy(''); }
  };

  const transition = async (item: FinanceProforma, action: 'accept' | 'convert' | 'void') => {
    if (action === 'void' && !window.confirm(`Void ${item.number}?`)) return;
    setBusy(`${action}:${item.id}`); setFeedback('');
    try {
      await transitionFinanceProforma(item.id, action); await load();
      setFeedback(action === 'convert' ? `${item.number} converted to an invoice.` : `${item.number} marked ${action === 'accept' ? 'accepted' : 'void'}.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Document update failed.'); }
    finally { setBusy(''); }
  };

  return <section className="border-2 border-slate-950 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-950 p-5">
      <div><p className="font-mono text-[8px] font-bold uppercase tracking-[.2em] text-emerald-700">Financial documents</p><h3 className="mt-1 font-display text-xl font-extrabold">Proformas, invoices & receipts</h3><p className="mt-1 text-xs text-slate-500">Open a print-ready document and use your browser to print or save it as PDF.</p></div>
      <div className="flex gap-2">
        {admin && <button onClick={() => setCreating(value => !value)} className="inline-flex items-center gap-2 bg-slate-950 px-3 py-2 text-xs font-bold text-white"><FilePlus2 className="h-4 w-4"/>{creating ? 'Close form' : 'New proforma'}</button>}
        <button aria-label="Refresh documents" onClick={() => void load()} className="border border-slate-300 p-2"><RefreshCw className="h-4 w-4"/></button>
      </div>
    </div>

    {admin && creating && <form onSubmit={create} className="space-y-4 border-b-2 border-slate-950 bg-slate-50 p-5">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-bold uppercase">Customer<select required value={customerId} onChange={event => setCustomerId(event.target.value)} className="mt-1 w-full border border-slate-300 bg-white p-2 text-sm font-normal normal-case"><option value="">Select customer</option>{organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs font-bold uppercase">Currency<input required minLength={3} maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} className="mt-1 w-full border border-slate-300 p-2 text-sm font-normal"/></label>
        <label className="text-xs font-bold uppercase">Valid until<input required type="date" min={new Date().toISOString().slice(0,10)} value={validUntil} onChange={event => setValidUntil(event.target.value)} className="mt-1 w-full border border-slate-300 p-2 text-sm font-normal"/></label>
        <label className="text-xs font-bold uppercase">Tax amount<input required type="number" min="0" step="0.01" value={taxAmount} onChange={event => setTaxAmount(event.target.value)} className="mt-1 w-full border border-slate-300 p-2 text-sm font-normal"/></label>
      </div>
      <div className="space-y-2">{lines.map((line, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_110px_160px_auto]">
        <input required minLength={2} maxLength={500} aria-label={`Line ${index + 1} description`} placeholder="Description" value={line.description} onChange={event => updateLine(index,'description',event.target.value)} className="border border-slate-300 p-2 text-sm"/>
        <input required type="number" min="0.01" step="0.01" aria-label={`Line ${index + 1} quantity`} value={line.quantity} onChange={event => updateLine(index,'quantity',event.target.value)} className="border border-slate-300 p-2 text-sm"/>
        <input required type="number" min="0" step="0.01" aria-label={`Line ${index + 1} unit amount`} value={line.unitAmount} onChange={event => updateLine(index,'unitAmount',event.target.value)} className="border border-slate-300 p-2 text-sm"/>
        <button type="button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, position) => position !== index))} aria-label={`Remove line ${index + 1}`} className="border border-slate-300 p-2 disabled:opacity-30"><Trash2 className="h-4 w-4"/></button>
      </div>)}</div>
      <button type="button" disabled={lines.length >= 30} onClick={() => setLines(current => [...current, emptyLine()])} className="border border-slate-400 px-3 py-2 text-xs font-bold">Add line</button>
      <label className="block text-xs font-bold uppercase">Notes<textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} className="mt-1 min-h-20 w-full border border-slate-300 p-2 text-sm font-normal normal-case"/></label>
      <button disabled={busy === 'create'} className="bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'create' ? 'Issuing…' : 'Issue proforma'}</button>
    </form>}

    {feedback && <p role="status" className="border-b border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{feedback}</p>}
    <div className="grid grid-cols-3 border-b border-slate-200 text-center"><div className="p-3"><strong>{proformas.length}</strong><span className="ml-1 text-xs text-slate-500">proformas</span></div><div className="border-x border-slate-200 p-3"><strong>{invoices.length}</strong><span className="ml-1 text-xs text-slate-500">invoices</span></div><div className="p-3"><strong>{receiptCount}</strong><span className="ml-1 text-xs text-slate-500">receipts</span></div></div>
    {loading ? <p className="p-6 text-sm text-slate-500">Loading financial documents…</p> : proformas.length + invoices.length === 0 ? <p className="p-6 text-sm text-slate-500">No financial documents have been issued yet.</p> : <div className="divide-y divide-slate-200">
      {proformas.map(item => <article key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><FileCheck2 className="h-4 w-4"/><strong>{item.number}</strong><span className="border border-slate-300 px-2 py-0.5 font-mono text-[8px] font-bold uppercase">{item.status}</span></div><p className="mt-1 text-xs text-slate-500">{item.orgName} · valid to {new Date(item.validUntil).toLocaleDateString('en-GB')} · {item.currency} {item.total.toLocaleString()}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => printProforma(item)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-bold"><Printer className="h-3.5 w-3.5"/>Proforma</button>{admin && item.status === 'issued' && <button disabled={Boolean(busy)} onClick={() => void transition(item,'accept')} className="border border-emerald-400 px-3 py-2 text-xs font-bold">Accept</button>}{admin && ['issued','accepted'].includes(item.status) && <button disabled={Boolean(busy)} onClick={() => void transition(item,'convert')} className="bg-slate-950 px-3 py-2 text-xs font-bold text-white">Convert to invoice</button>}{admin && !['converted','void'].includes(item.status) && <button disabled={Boolean(busy)} onClick={() => void transition(item,'void')} className="border border-red-300 px-3 py-2 text-xs font-bold text-red-700">Void</button>}</div></article>)}
      {invoices.map(item => <article key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><ReceiptText className="h-4 w-4"/><strong>{item.number}</strong><span className="border border-slate-300 px-2 py-0.5 font-mono text-[8px] font-bold uppercase">{item.status}</span></div><p className="mt-1 text-xs text-slate-500">{item.orgName} · {item.currency} {item.total.toLocaleString()} · {item.currency} {item.outstanding.toLocaleString()} outstanding</p></div><div className="flex flex-wrap gap-2"><button onClick={() => printInvoice(item)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-bold"><Printer className="h-3.5 w-3.5"/>Invoice</button>{item.receipts.map(receipt => <button key={receipt.id} onClick={() => printReceipt(item,receipt)} className="inline-flex items-center gap-1 border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800"><Printer className="h-3.5 w-3.5"/>{receipt.type === 'refund' ? 'Refund' : 'Receipt'} {receipt.number}</button>)}</div></article>)}
    </div>}
  </section>;
}
