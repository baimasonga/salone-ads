import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeDollarSign, Landmark, RefreshCw, Undo2 } from 'lucide-react';
import {
  fetchFinanceInvoices,
  issueFinanceCredit,
  processOverdueInvoices,
  recordFinancePayment,
  recordFinanceRefund,
  type FinanceInvoice,
  type FinancePayment,
} from '../../lib/financeApi';

function readAmount(message: string, maximum: number): number | null {
  const raw = window.prompt(message);
  if (raw === null) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > maximum) {
    window.alert(`Enter an amount between 0 and ${maximum.toLocaleString()}.`);
    return null;
  }
  return amount;
}

export function FinanceLedgerWorkspace() {
  const [rows, setRows] = useState<FinanceInvoice[]>([]);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchFinanceInvoices());
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not load the financial ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => ({
    invoices: rows.length,
    overdue: rows.filter((row) => row.status === 'overdue').length,
    open: rows.filter((row) => row.outstanding > 0).length,
    settled: rows.filter((row) => row.outstanding === 0).length,
  }), [rows]);

  const run = async (key: string, operation: () => Promise<void>, success: string) => {
    setBusy(key);
    setFeedback('');
    try {
      await operation();
      await load();
      setFeedback(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Billing operation failed.');
    } finally {
      setBusy('');
    }
  };

  const pay = async (invoice: FinanceInvoice) => {
    const reference = window.prompt('Verified payment reference:')?.trim();
    if (!reference) return;
    const amount = readAmount(
      `Amount (${invoice.currency}), outstanding ${invoice.outstanding.toLocaleString()}:`,
      invoice.outstanding,
    );
    if (amount === null) return;
    await run(
      `pay:${invoice.id}`,
      () => recordFinancePayment(invoice.id, reference, 'bank_transfer', amount),
      `Payment recorded against ${invoice.number}.`,
    );
  };

  const credit = async (invoice: FinanceInvoice) => {
    const creditNumber = window.prompt('Credit-note number:')?.trim();
    if (!creditNumber) return;
    const amount = readAmount(
      `Credit amount (${invoice.currency}), maximum ${invoice.outstanding.toLocaleString()}:`,
      invoice.outstanding,
    );
    if (amount === null) return;
    const reason = window.prompt('Reason for issuing this credit:')?.trim();
    if (!reason) return;
    await run(
      `credit:${invoice.id}`,
      () => issueFinanceCredit(invoice.id, creditNumber, amount, reason),
      `Credit note recorded against ${invoice.number}.`,
    );
  };

  const refund = async (invoice: FinanceInvoice, payment: FinancePayment) => {
    const refundable = payment.amount - payment.refunded;
    const reference = window.prompt('Refund reference:')?.trim();
    if (!reference) return;
    const amount = readAmount(
      `Refund amount (${invoice.currency}), maximum ${refundable.toLocaleString()}:`,
      refundable,
    );
    if (amount === null) return;
    const reason = window.prompt('Reason for this refund:')?.trim();
    if (!reason) return;
    await run(
      `refund:${payment.id}`,
      () => recordFinanceRefund(payment.id, reference, amount, reason),
      `Refund recorded for payment ${payment.reference}.`,
    );
  };

  const processOverdue = async () => {
    setBusy('overdue');
    setFeedback('');
    try {
      const count = await processOverdueInvoices();
      await load();
      setFeedback(`${count} invoice${count === 1 ? '' : 's'} marked overdue.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not process overdue invoices.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Landmark className="h-5 w-5 text-emerald-300" />
            <h2 className="mt-3 font-display text-3xl font-extrabold !text-white">Financial Ledger</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Reconcile subscription, advertising and managed-service receivables,
              including payments, credits, refunds and overdue accounts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy === 'overdue'}
              onClick={() => void processOverdue()}
              className="inline-flex items-center gap-2 border border-amber-300 px-3 py-2 font-mono text-[9px] font-bold uppercase text-amber-200 disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Process overdue
            </button>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 border border-white/30 px-3 py-2 font-mono text-[9px] font-bold uppercase"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Invoices', totals.invoices],
          ['Open balances', totals.open],
          ['Overdue', totals.overdue],
          ['Settled', totals.settled],
        ].map(([label, value]) => (
          <div key={label} className="border-2 border-slate-950 bg-white p-4">
            <p className="font-display text-2xl font-extrabold">{value}</p>
            <p className="font-mono text-[8px] font-bold uppercase text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      {feedback && (
        <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{feedback}</p>
      )}

      <section className="border-2 border-slate-950 bg-white">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading financial ledger…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">No unified ledger invoices yet.</p>
        ) : (
          <div className="divide-y-2 divide-slate-950">
            {rows.map((invoice) => (
              <article key={invoice.id} className="space-y-4 p-5">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
                  <div>
                    <h3 className="font-display text-base font-extrabold">
                      {invoice.number} · {invoice.orgName}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {invoice.sourceType.replaceAll('_', ' ')}
                      {invoice.dueAt ? ` · due ${new Date(invoice.dueAt).toLocaleDateString('en-GB')}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs font-bold">
                      {invoice.currency} {invoice.outstanding.toLocaleString()} outstanding
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Total {invoice.total.toLocaleString()} · paid {invoice.paid.toLocaleString()}
                      {invoice.credited > 0 ? ` · credited ${invoice.credited.toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`border px-2 py-2 font-mono text-[9px] font-bold uppercase ${
                      invoice.status === 'overdue' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300'
                    }`}>
                      {invoice.status.replaceAll('_', ' ')}
                    </span>
                    {invoice.outstanding > 0 && invoice.status !== 'void' && (
                      <>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void pay(invoice)}
                          className="border border-slate-950 px-3 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          Record payment
                        </button>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void credit(invoice)}
                          className="inline-flex items-center gap-1 border border-violet-300 px-3 py-2 text-xs font-bold text-violet-800 disabled:opacity-50"
                        >
                          <BadgeDollarSign className="h-3.5 w-3.5" /> Issue credit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {invoice.payments.some((payment) => payment.amount > payment.refunded) && (
                  <div className="border-l-4 border-slate-200 pl-4">
                    <p className="font-mono text-[8px] font-bold uppercase text-slate-500">
                      Refundable payments
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {invoice.payments
                        .filter((payment) => payment.amount > payment.refunded)
                        .map((payment) => (
                          <button
                            key={payment.id}
                            disabled={Boolean(busy)}
                            onClick={() => void refund(invoice, payment)}
                            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs disabled:opacity-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Refund {payment.reference} · {invoice.currency}{' '}
                            {(payment.amount - payment.refunded).toLocaleString()}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
