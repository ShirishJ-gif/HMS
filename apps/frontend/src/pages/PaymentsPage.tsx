import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { api, getApiErrorMessage } from '../api/client';
import { Billing, PaymentProvider, ReservationGroup, ReservationGroupFolio, ReservationGroupPaymentCollection } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { DelayedSpinnerOverlay } from '../components/Spinner';
import { useScrollLock } from '../hooks/useScrollLock';
import { formatCurrency } from '../utils/format';
import { ErrorMsg, FloatingSuccessToast, StatCard } from './ui';
import { createPreviewData, isPreviewId } from './previewData';

// ── Providers ──────────────────────────────────────────────────────────────
const PROVIDERS: { label: string; value: PaymentProvider }[] = [
  { label: 'Cash',     value: 'CASH'     },
  { label: 'Card',     value: 'CARD'     },
  { label: 'UPI',      value: 'UPI'      },
  { label: 'Razorpay', value: 'RAZORPAY' },
  { label: 'Stripe',   value: 'STRIPE'   },
  { label: 'Mock',     value: 'MOCK'     },
];

const STATUS_CFG: Record<string, { badge: string; label: string }> = {
  PENDING:  { badge: 'bg-rose-50 text-rose-700 border-rose-200',       label: 'Unpaid'   },
  UNPAID:   { badge: 'bg-rose-50 text-rose-700 border-rose-200',       label: 'Unpaid'   },
  PARTIAL:  { badge: 'bg-amber-50 text-amber-700 border-amber-200',    label: 'Partial'  },
  PAID:     { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Paid'  },
  REFUNDED: { badge: 'bg-slate-100 text-slate-600 border-slate-200',   label: 'Refunded' },
};

const defaultPayForm = { amount: '', provider: 'CASH' as PaymentProvider, provider_reference: '' };
const defaultGroupPayForm = { amount: '', provider: 'CASH' as PaymentProvider, provider_reference: '' };
const FOLIOS_PER_PAGE = 8;

type FinanceOverview = {
  summary: {
    total_billed: number;
    total_collected: number;
    total_balance: number;
    open_invoice_count: number;
    invoice_count: number;
    transaction_count: number;
  };
  billings: Billing[];
  reservation_groups: ReservationGroup[];
};

type FinanceState = {
  data: FinanceOverview | null;
  error: string | null;
  loading: boolean;
};

let financeOverviewCache: FinanceOverview | null = null;
let financeOverviewCacheAt = 0;
const financeOverviewCacheTtlMs = 60_000;

function paymentReferenceLabel(payment: { provider: PaymentProvider; provider_reference: string | null }) {
  return payment.provider === 'CASH' ? '—' : payment.provider_reference ?? '—';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function initials(name: string) {
  return formatGuestName(name).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}
function formatGuestName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map(part => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : '')
    .join(' ');
}
function nights(from: string, to: string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}
function matchesPaymentStatus(paymentStatus: string, filter: string) {
  if (filter === 'ALL') return true;
  if (filter === 'UNPAID') return paymentStatus === 'PENDING' || paymentStatus === 'UNPAID';
  return paymentStatus === filter;
}

const invoicePrintStyles = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Inter', sans-serif; color: #1e293b; padding: 48px; max-width: 680px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 900; margin-bottom: 4px; }
  .sub { color: #94a3b8; font-size: 13px; margin-bottom: 32px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .block p { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
  .block strong { font-size: 14px; font-weight: 700; color: #1e293b; display: block; }
  .block span { font-size: 13px; color: #64748b; display: block; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; padding: 8px 0; border-bottom: 2px solid #f1f5f9; }
  td { padding: 10px 0; font-size: 13px; border-bottom: 1px solid #f8fafc; }
  td:last-child, th:last-child { text-align: right; }
  .total-row td { font-weight: 900; font-size: 15px; border-top: 2px solid #1e293b; border-bottom: none; padding-top: 14px; }
  .paid-row td { font-size: 13px; color: #16a34a; font-weight: 700; border-bottom: none; }
  .balance-row td { font-size: 15px; font-weight: 900; border-bottom: none; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 24px; } }
`;

function PrintableInvoice({ billing }: { billing: Billing }) {
  const r = billing.reservation_room;
  const n = nights(r.check_in_date, r.check_out_date);
  const paid = billing.paid_total - billing.refunded_total;
  const lines = [
    { desc: `Room charge — ${r.room_category.name} (${n} night${n !== 1 ? 's' : ''})`, amount: billing.amount },
    ...billing.extra_charges.map(ec => ({ desc: ec.description, amount: ec.amount })),
    { desc: 'Tax (12%)', amount: billing.tax },
  ];
  const guestName = formatGuestName(r.guest.name);

  return <>
    <h1>{r.property.name}</h1>
    <p className="sub">Tax Invoice · Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <div className="grid2">
      <div className="block"><p>Guest</p><strong>{guestName}</strong>{r.guest.phone && <span>{r.guest.phone}</span>}{r.guest.email && <span>{r.guest.email}</span>}</div>
      <div className="block"><p>Stay details</p><strong>Room {r.room.room_number ?? 'TBD'} — {r.room_category.name}</strong><span>{fmtDate(r.check_in_date)} → {fmtDate(r.check_out_date)} · {n} night{n !== 1 ? 's' : ''}</span><span>{r.rate_plan.name}</span></div>
      <div className="block"><p>Reservation</p><strong>{r.external_reservation_id}</strong><span>Room line: {r.external_room_reservation_id}</span></div>
      <div className="block"><p>Invoice ID</p><strong>{billing.id.slice(0, 8).toUpperCase()}</strong></div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Amount</th></tr></thead>
      <tbody>
        {lines.map((line, index) => <tr key={`${line.desc}-${index}`}><td>{line.desc}</td><td>{formatCurrency(line.amount)}</td></tr>)}
        <tr className="total-row"><td>Total</td><td>{formatCurrency(billing.total)}</td></tr>
        <tr className="paid-row"><td>Paid</td><td>{formatCurrency(paid)}</td></tr>
        <tr className="balance-row" style={{ color: billing.balance_due > 0 ? '#dc2626' : '#16a34a' }}><td>Balance due</td><td>{formatCurrency(billing.balance_due)}</td></tr>
      </tbody>
    </table>
    {billing.payments.length > 0 && <table>
      <thead><tr><th>Payment history</th><th>Provider</th><th>Reference</th><th>Amount</th></tr></thead>
      <tbody>{billing.payments.map(payment => <tr key={payment.id}><td>{new Date(payment.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>{payment.provider}</td><td>{paymentReferenceLabel(payment)}</td><td>{formatCurrency(payment.amount)}</td></tr>)}</tbody>
    </table>}
    <div className="footer">{r.property.name} · Thank you for your stay.</div>
  </>;
}

// ── Print invoice (browser-print, no backend needed) ──────────────────────
function printInvoice(billing: Billing) {
  const w = window.open('', '_blank');
  if (!w) return;

  w.opener = null;
  w.document.title = `Invoice - ${formatGuestName(billing.reservation_room.guest.name)}`;
  const style = w.document.createElement('style');
  style.textContent = invoicePrintStyles;
  w.document.head.appendChild(style);

  const root = createRoot(w.document.body);
  flushSync(() => root.render(<PrintableInvoice billing={billing} />));
  w.addEventListener('afterprint', () => root.unmount(), { once: true });
  w.focus();
  setTimeout(() => w.print(), 400);
}

// ── Main page ──────────────────────────────────────────────────────────────
export function PaymentsPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const [reloadKey, setReloadKey]             = useState(0);
  const [selectedBillingId, setSelectedBillingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter]       = useState<string>('ALL');
  const [showPayModal, setShowPayModal]       = useState(false);
  const [payForm, setPayForm]                 = useState(defaultPayForm);
  const [collecting, setCollecting]           = useState(false);
  const [toastMessage, setToastMessage]       = useState<string | null>(null);
  const [actionError, setActionError]         = useState<string | null>(null);

  // Folio (group) state
  const [selectedFolioGroupId, setSelectedFolioGroupId] = useState<string | null>(null);
  const [selectedFolio, setSelectedFolio]     = useState<ReservationGroupFolio | null>(null);
  const [folioCache, setFolioCache]           = useState<Record<string, ReservationGroupFolio>>({});
  const [folioLoading, setFolioLoading]       = useState(false);
  const [folioLoadingGroupId, setFolioLoadingGroupId] = useState<string | null>(null);
  const [folioError, setFolioError]           = useState<string | null>(null);
  const [groupPayForm, setGroupPayForm]       = useState(defaultGroupPayForm);
  const [collectingGroup, setCollectingGroup] = useState(false);
  const [lastGroupCollection, setLastGroupCollection] = useState<ReservationGroupPaymentCollection | null>(null);
  const [invoicingRoomId, setInvoicingRoomId] = useState<string | null>(null);
  const [generatingFolioId, setGeneratingFolioId] = useState<string | null>(null);
  const [folioPage, setFolioPage] = useState(1);
  const folioRequestIdRef = useRef(0);

  const [financeState, setFinanceState] = useState<FinanceState>(() => {
    const hasFreshCache = financeOverviewCache && Date.now() - financeOverviewCacheAt < financeOverviewCacheTtlMs;
    return {
      data: hasFreshCache ? financeOverviewCache : null,
      error: null,
      loading: !hasFreshCache,
    };
  });

  useEffect(() => {
    let active = true;
    const hasFreshCache = financeOverviewCache && reloadKey === 0 && Date.now() - financeOverviewCacheAt < financeOverviewCacheTtlMs;
    if (hasFreshCache) {
      setFinanceState({ data: financeOverviewCache, error: null, loading: false });
      return () => { active = false; };
    }

    setFinanceState((current) => ({ ...current, error: null, loading: !current.data || reloadKey > 0 }));
    api.get<FinanceOverview>('/finance/overview')
      .then((response) => {
        if (!active) return;
        financeOverviewCache = response.data;
        financeOverviewCacheAt = Date.now();
        setFinanceState({ data: response.data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFinanceState((current) => ({ data: current.data, error: getApiErrorMessage(err), loading: false }));
      });

    return () => { active = false; };
  }, [reloadKey]);

  const previewData       = previewDataEnabled ? createPreviewData() : null;
  const billings          = previewData?.billings ?? financeState.data?.billings ?? [];
  const reservationGroups = previewData?.reservationGroups ?? financeState.data?.reservation_groups ?? [];
  const transactionCount  = previewData?.payments.length ?? financeState.data?.summary.transaction_count ?? 0;

  // Invoice list — filtered
  const filteredBillings = billings.filter(b =>
    matchesPaymentStatus(b.payment_status, statusFilter)
  );

  const selectedBilling = billings.find(b => b.id === selectedBillingId) ?? null;

  // Stats
  const totalBilled    = previewData ? billings.reduce((s, b) => s + b.total, 0) : financeState.data?.summary.total_billed ?? 0;
  const totalCollected = previewData ? billings.reduce((s, b) => s + (b.paid_total - b.refunded_total), 0) : financeState.data?.summary.total_collected ?? 0;
  const totalBalance   = previewData ? billings.reduce((s, b) => s + b.balance_due, 0) : financeState.data?.summary.total_balance ?? 0;
  const openCount      = previewData ? billings.filter(b => b.balance_due > 0).length : financeState.data?.summary.open_invoice_count ?? 0;

  // Folio rows (reservation groups that have billing activity)
  const invoicedRoomIds = new Set(billings.map(b => b.reservation_room_id));
  const folioRows = reservationGroups.map(g => {
    const lineInvoices = billings.filter(b => b.reservation_room.reservation_group_id === g.id);
    const checkedOut   = g.rooms.filter(r => r.reservation_status === 'CHECKED_OUT').length;
    return {
      id: g.id,
      external_reservation_id: g.external_reservation_id,
      guest_name: g.primary_guest?.name ?? 'Imported guest',
      property_name: g.property.name,
      room_count: g.rooms.length,
      invoiced_count: lineInvoices.length,
      checked_out_count: checkedOut,
      billed_total: lineInvoices.reduce((s, b) => s + b.total, 0),
      balance_due: lineInvoices.reduce((s, b) => s + b.balance_due, 0),
    };
  }).filter(f => f.checked_out_count > 0 || f.invoiced_count > 0);
  const folioTotalPages = Math.max(1, Math.ceil(folioRows.length / FOLIOS_PER_PAGE));
  const clampedFolioPage = Math.min(folioPage, folioTotalPages);
  const paginatedFolioRows = folioRows.slice((clampedFolioPage - 1) * FOLIOS_PER_PAGE, clampedFolioPage * FOLIOS_PER_PAGE);

  // Uninvoiced checked-out rooms
  const uninvoiced = reservationGroups
    .flatMap(g => g.rooms.map(r => ({ ...r, groupId: g.id, extResId: g.external_reservation_id, property: g.property, guestName: r.guest_name ?? g.primary_guest?.name ?? 'Imported guest' })))
    .filter(r => r.reservation_status === 'CHECKED_OUT' && !invoicedRoomIds.has(r.id));

  function flash(msg: string) { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); }

  // ── Collect against a billing invoice ─────────────────────────────────
  async function submitPayment(e: FormEvent) {
    e.preventDefault(); if (!selectedBillingId) return;
    if (isPreviewId(selectedBillingId)) { setActionError('Sample preview records are read-only. Turn off sample data to record a payment.'); return; }
    setActionError(null); setCollecting(true);
    try {
      await api.post('/payments/collect', {
        billing_id: selectedBillingId,
        amount: payForm.amount,
        provider: payForm.provider,
        provider_reference: payForm.provider === 'CASH' ? undefined : payForm.provider_reference || undefined,
      });
      setPayForm(defaultPayForm); setShowPayModal(false);
      setReloadKey(v => v + 1); flash('Payment recorded successfully.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setCollecting(false); }
  }

  // ── Generate invoice for a single checked-out room ────────────────────
  async function generateInvoice(reservationRoomId: string) {
    if (isPreviewId(reservationRoomId)) { setActionError('Sample preview records are read-only. Turn off sample data to generate an invoice.'); return; }
    setActionError(null); setInvoicingRoomId(reservationRoomId);
    try {
      await api.post('/billings', { reservation_room_id: reservationRoomId, tax: '0.00' });
      setReloadKey(v => v + 1); flash('Invoice generated.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setInvoicingRoomId(null); }
  }

  // ── Open a folio for a reservation group ─────────────────────────────
  async function openFolio(groupId: string, forceRefresh = false) {
    if (selectedFolioGroupId === groupId && !forceRefresh) {
      closeFolio();
      return;
    }

    const cachedFolio = folioCache[groupId] ?? null;
    const requestId = folioRequestIdRef.current + 1;
    folioRequestIdRef.current = requestId;
    setFolioError(null);
    setFolioLoading(!cachedFolio || forceRefresh);
    setFolioLoadingGroupId(!cachedFolio || forceRefresh ? groupId : null);

    if (cachedFolio) {
      setSelectedFolioGroupId(groupId);
      setSelectedFolio(cachedFolio);
    } else if (forceRefresh) {
      setSelectedFolioGroupId(groupId);
      setSelectedFolio(folioCache[groupId] ?? (selectedFolioGroupId === groupId ? selectedFolio : null));
    } else {
      setFolioError(null);
    }

    if (cachedFolio && !forceRefresh) {
      setGroupPayForm(form => ({ ...form, amount: cachedFolio.balance_due > 0 ? cachedFolio.balance_due.toFixed(2) : '' }));
      setFolioLoading(false);
      setFolioLoadingGroupId(null);
      return;
    }

    if (isPreviewId(groupId)) {
      const folio = createPreviewData().folios.get(groupId) ?? null;
      if (folioRequestIdRef.current !== requestId) return;
      setSelectedFolioGroupId(groupId);
      setSelectedFolio(folio);
      if (folio) setFolioCache(cache => ({ ...cache, [groupId]: folio }));
      setGroupPayForm(form => ({ ...form, amount: folio && folio.balance_due > 0 ? folio.balance_due.toFixed(2) : '' }));
      setFolioLoading(false);
      setFolioLoadingGroupId(null);
      return;
    }
    try {
      const res = await api.get<ReservationGroupFolio>(`/billings/reservation-groups/${groupId}/folio`);
      if (folioRequestIdRef.current !== requestId) return;
      setSelectedFolioGroupId(groupId);
      setSelectedFolio(res.data);
      setFolioCache(cache => ({ ...cache, [groupId]: res.data }));
      setGroupPayForm(f => ({ ...f, amount: res.data.balance_due > 0 ? res.data.balance_due.toFixed(2) : '' }));
    } catch (err) {
      if (folioRequestIdRef.current === requestId) {
        setSelectedFolioGroupId(groupId);
        setSelectedFolio(null);
        setFolioError(getApiErrorMessage(err));
      }
    } finally {
      if (folioRequestIdRef.current === requestId) {
        setFolioLoading(false);
        setFolioLoadingGroupId(null);
      }
    }
  }

  function closeFolio() {
    folioRequestIdRef.current += 1;
    setSelectedFolioGroupId(null);
    setSelectedFolio(null);
    setFolioLoading(false);
    setFolioLoadingGroupId(null);
    setFolioError(null);
    setLastGroupCollection(null);
  }

  // ── Generate missing folio invoices ───────────────────────────────────
  async function generateMissingInvoices(groupId: string) {
    if (isPreviewId(groupId)) { setActionError('Sample preview records are read-only. Turn off sample data to generate invoices.'); return; }
    setActionError(null); setGeneratingFolioId(groupId);
    try {
      await api.post(`/billings/reservation-groups/${groupId}/generate-missing-invoices`);
      setReloadKey(v => v + 1); flash('Missing invoices generated.');
      if (selectedFolioGroupId === groupId) await openFolio(groupId, true);
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setGeneratingFolioId(null); }
  }

  // ── Collect group payment against a folio ─────────────────────────────
  async function submitGroupPayment(e: FormEvent) {
    e.preventDefault(); if (!selectedFolioGroupId) return;
    if (isPreviewId(selectedFolioGroupId)) { setActionError('Sample preview records are read-only. Turn off sample data to collect a folio payment.'); return; }
    setActionError(null); setCollectingGroup(true);
    try {
      const res = await api.post<ReservationGroupPaymentCollection>('/payments/collect-reservation-group', {
        reservation_group_id: selectedFolioGroupId,
        amount: groupPayForm.amount,
        provider: groupPayForm.provider,
        provider_reference: groupPayForm.provider === 'CASH' ? undefined : groupPayForm.provider_reference || undefined,
      });
      setLastGroupCollection(res.data);
      setGroupPayForm(defaultGroupPayForm);
      await openFolio(selectedFolioGroupId, true);
      setReloadKey(v => v + 1); flash('Group payment recorded.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setCollectingGroup(false); }
  }

  const loading = !previewData && financeState.loading;
  const loadError = financeState.error;

  useEffect(() => {
    if (folioPage !== clampedFolioPage) setFolioPage(clampedFolioPage);
  }, [clampedFolioPage, folioPage]);

  return (
    <div className="relative -mx-5 lg:-mx-8 -my-6 lg:-my-8 flex flex-col min-h-0">
      <DelayedSpinnerOverlay loading={loading} />

      {/* Page header */}
      <div className="px-5 lg:px-8 pt-6 lg:pt-8 pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Finance</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Payment & Folios</h1>
          <p className="text-[12px] text-slate-400 mt-1">Collect payments, manage invoices, and review grouped OTA folios</p>
        </div>
      </div>

      {/* Messages */}
      <FloatingSuccessToast message={toastMessage} onClose={() => setToastMessage(null)} />
      {actionError && <div className="mx-5 lg:mx-8 mb-3"><ErrorMsg>{actionError}</ErrorMsg></div>}

      {/* Stats cards */}
      <div className="px-5 lg:px-8 pb-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { label: 'Total billed',  value: formatCurrency(totalBilled),    sub: `${billings.length} invoice${billings.length === 1 ? '' : 's'}`, color: 'text-slate-900' },
          { label: 'Collected',     value: formatCurrency(totalCollected),  sub: 'Net of refunds', color: 'text-emerald-600' },
          { label: 'Balance due',   value: formatCurrency(totalBalance),    sub: totalBalance > 0 ? 'Outstanding' : 'Clear', color: totalBalance > 0 ? 'text-rose-600' : 'text-slate-500' },
          { label: 'Open invoices', value: String(openCount),               sub: openCount > 0 ? 'Needs follow-up' : 'All settled', color: openCount > 0 ? 'text-amber-600' : 'text-slate-500' },
          { label: 'Transactions',  value: String(transactionCount),         sub: 'Payment records', color: 'text-sky-700' },
        ].map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            sub={s.sub}
            className="hover:shadow-sm transition-shadow"
            valueClassName={`text-[1.5rem] tabular-nums ${s.color}`}
          />
        ))}
      </div>
      {uninvoiced.length > 0 && (
        <div className="px-5 lg:px-8 pb-3">
          <span className="inline-flex text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
            ⚠ {uninvoiced.length} checked-out room{uninvoiced.length > 1 ? 's' : ''} need invoicing
          </span>
        </div>
      )}

      {loadError && <div className="px-5 lg:px-8 pt-4"><ErrorMsg>{loadError}</ErrorMsg></div>}

      {/* ── Two-col: invoice list + detail ── */}
      <div className="flex px-5 lg:px-8 py-5 gap-4 min-h-0" style={{ minHeight: '560px' }}>

        {/* Left — invoice list */}
        <div className="w-[300px] lg:w-[340px] flex-shrink-0 flex flex-col bg-white border border-black/[0.06] rounded-2xl overflow-hidden self-start sticky top-5">
          <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <p className="text-[13px] font-bold text-slate-900 mb-2.5">Invoices <span className="font-normal text-slate-400">({filteredBillings.length})</span></p>
            <div className="flex gap-2.5 flex-wrap">
              {([['ALL','All'],['UNPAID','Unpaid'],['PARTIAL','Partial'],['PAID','Paid']] as const).map(([v,l]) => (
                <button key={v} type="button" onClick={() => setStatusFilter(v)}
                  className={`h-7 px-3 rounded-md text-[10.5px] font-bold border transition-colors ${statusFilter === v ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="scrollbar-none max-h-[600px] divide-y divide-slate-50 overflow-y-auto">
            {filteredBillings.map(b => {
              const br = b.reservation_room;
              const bcfg = STATUS_CFG[b.payment_status] ?? STATUS_CFG['UNPAID'];
              const isSel = selectedBillingId === b.id;
              return (
                <button key={b.id} type="button"
                  onClick={() => { setSelectedBillingId(isSel ? null : b.id); setSelectedFolioGroupId(null); setSelectedFolio(null); }}
                  className={`w-full text-left px-4 py-3.5 transition-colors
                    ${isSel ? 'bg-slate-50 ' : 'hover:bg-slate-50/80'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                        {initials(br.guest.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-bold text-slate-900 truncate leading-tight">{formatGuestName(br.guest.name)}</p>
                        <p className="text-[10.5px] text-slate-400">Room {br.room.room_number ?? '—'} · {br.room_category.name}</p>
                      </div>
                    </div>
                    <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${bcfg.badge}`}>{bcfg.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-slate-400">{fmtDate(br.check_in_date)} → {fmtDate(br.check_out_date)}</span>
                    <div className="text-right">
                      <p className="text-[12.5px] font-bold text-slate-900">{formatCurrency(b.total)}</p>
                      {b.balance_due > 0 && <p className="text-[10px] font-semibold text-rose-600">{formatCurrency(b.balance_due)} due</p>}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredBillings.length === 0 && !loading && (
              <p className="px-4 py-6 text-[12px] text-slate-400 text-center">No invoices match this filter.</p>
            )}
          </div>
        </div>

        {/* Right — detail area */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Invoice detail */}
          {selectedBilling && (() => {
            const r = selectedBilling.reservation_room;
            const n = nights(r.check_in_date, r.check_out_date);
            const paid = selectedBilling.paid_total - selectedBilling.refunded_total;
            const cfg = STATUS_CFG[selectedBilling.payment_status] ?? STATUS_CFG['UNPAID'];
            return (
              <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
                {/* Guest header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[16px] font-bold text-white flex-shrink-0">
                      {initials(r.guest.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h2 className="text-[17px] font-bold text-slate-900">{formatGuestName(r.guest.name)}</h2>
                        <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                      </div>
                      <p className="text-[12px] text-slate-400">
                        Room {r.room.room_number ?? '—'} · {r.room_category.name} · {r.rate_plan.name} · {fmtDate(r.check_in_date)} → {fmtDate(r.check_out_date)} · {n} night{n !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[10.5px] text-slate-300 font-mono mt-0.5">{r.external_reservation_id}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] text-slate-400 mb-0.5">Invoice total</p>
                    <p className="text-[28px] font-black text-slate-900 leading-tight">{formatCurrency(selectedBilling.total)}</p>
                    {selectedBilling.balance_due > 0
                      ? <p className="text-[12px] font-bold text-rose-600">{formatCurrency(selectedBilling.balance_due)} outstanding</p>
                      : <p className="text-[12px] font-bold text-emerald-600">Fully settled ✓</p>}
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Charges table */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Charges</p>
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Description</th>
                            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">Room</span>
                                <span className="text-[12.5px] text-slate-800">{r.room_category.name} · {n} night{n !== 1 ? 's' : ''}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-[12.5px] font-bold text-slate-900">{formatCurrency(selectedBilling.amount)}</td>
                          </tr>
                          {selectedBilling.extra_charges.map(ec => (
                            <tr key={ec.id} className="border-b border-slate-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">Extra</span>
                                  <span className="text-[12.5px] text-slate-800">{ec.description}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-[12.5px] font-bold text-slate-900">{formatCurrency(ec.amount)}</td>
                            </tr>
                          ))}
                          <tr className="border-b border-slate-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">Tax</span>
                                <span className="text-[12.5px] text-slate-500">Hotel tax</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-[12.5px] text-slate-600">{formatCurrency(selectedBilling.tax)}</td>
                          </tr>
                          <tr className="bg-slate-50/60">
                            <td className="px-4 py-3 text-[13px] font-black text-slate-900">Total</td>
                            <td className="px-4 py-3 text-right text-[14px] font-black text-slate-900">{formatCurrency(selectedBilling.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment history */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Payment history</p>
                    {selectedBilling.payments.length === 0 ? (
                      <p className="text-[12px] text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">No payments recorded yet.</p>
                    ) : (
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              {['Provider','Reference','Amount','Status'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedBilling.payments.map(p => (
                              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                                <td className="px-4 py-3 text-[12px] font-semibold text-slate-800">{p.provider}</td>
                                <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{paymentReferenceLabel(p)}</td>
                                <td className="px-4 py-3 text-[12.5px] font-bold text-slate-900">{formatCurrency(p.amount)}</td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                    {p.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Summary + actions */}
                  <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                    <div className="flex items-center gap-5 text-[12px]">
                      <span className="text-slate-500">Paid: <span className="font-bold text-emerald-600">{formatCurrency(paid)}</span></span>
                      <span className="text-slate-500">Balance: <span className={`font-bold ${selectedBilling.balance_due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(selectedBilling.balance_due)}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => printInvoice(selectedBilling)}
                        className="h-8 px-3.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                        Print invoice
                      </button>
                      {selectedBilling.balance_due > 0 && (
                        <button type="button"
                          onClick={() => { setPayForm(f => ({ ...f, amount: selectedBilling.balance_due.toFixed(2) })); setShowPayModal(true); }}
                          className="h-8 px-4 rounded-lg text-[11.5px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                          Collect payment →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* No invoice selected prompt */}
          {!selectedBilling && !loading && billings.length > 0 && (
            <div className="bg-white border border-black/[0.06] rounded-2xl px-6 py-12 text-center text-[13px] text-slate-400">
              Select an invoice on the left to view charges and payment history.
            </div>
          )}

          {/* ── Uninvoiced rooms ── */}
          {uninvoiced.length > 0 && (
            <div className="bg-white border border-amber-100 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Action needed</p>
                <p className="text-[14px] font-bold text-slate-900">{uninvoiced.length} checked-out room{uninvoiced.length > 1 ? 's' : ''} without an invoice</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Guest','Property','Reservation','Dates','Total','Action'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uninvoiced.map(room => (
                      <tr key={room.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="px-5 py-3 text-[12.5px] font-semibold text-slate-900">{formatGuestName(room.guestName)}</td>
                        <td className="px-5 py-3 text-[12px] text-slate-600">{room.property.name}</td>
                        <td className="px-5 py-3 text-[11px] font-mono text-slate-400">{room.extResId}</td>
                        <td className="px-5 py-3 text-[12px] text-slate-500">{room.arrival_date} → {room.departure_date}</td>
                        <td className="px-5 py-3 text-[12.5px] font-bold text-slate-900">{room.total_amount != null ? formatCurrency(room.total_amount) : '—'}</td>
                        <td className="px-5 py-3">
                          <button type="button"
                            disabled={invoicingRoomId === room.id}
                            onClick={() => void generateInvoice(room.id)}
                            className="h-7 px-3 rounded-lg text-[11px] font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                            {invoicingRoomId === room.id ? 'Generating…' : 'Generate invoice'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Reservation folios ── */}
          {folioRows.length > 0 && (
            <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">OTA reservation folios</p>
                <p className="text-[14px] font-bold text-slate-900">{folioRows.length} grouped folio{folioRows.length > 1 ? 's' : ''}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Reservation','Guest','Property','Rooms invoiced','Billed','Balance','Actions'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFolioRows.map(f => (
                      <tr key={f.id} className={`border-b last:border-0 transition-colors ${selectedFolioGroupId === f.id ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-50 hover:bg-slate-50/60'}`}>
                        <td className="px-5 py-3 text-[11px] font-mono text-slate-500">{f.external_reservation_id}</td>
                        <td className="px-5 py-3 text-[12.5px] font-semibold text-slate-900">{formatGuestName(f.guest_name)}</td>
                        <td className="px-5 py-3 text-[12px] text-slate-600">{f.property_name}</td>
                        <td className="px-5 py-3 text-[12px] text-slate-600">{f.invoiced_count}/{f.checked_out_count} checked out</td>
                        <td className="px-5 py-3 text-[12.5px] font-bold text-slate-900">{formatCurrency(f.billed_total)}</td>
                        <td className={`px-5 py-3 text-[12.5px] font-bold ${f.balance_due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(f.balance_due)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => void openFolio(f.id)}
                              className={`h-7 px-3 rounded-lg text-[11px] font-semibold border transition-colors ${selectedFolioGroupId === f.id ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}>
                              {folioLoadingGroupId === f.id ? 'Loading...' : 'Review folio'}
                            </button>
                            <button type="button"
                              disabled={generatingFolioId === f.id}
                              onClick={() => void generateMissingInvoices(f.id)}
                              className="h-7 px-3 rounded-lg text-[11px] font-semibold border bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                              {generatingFolioId === f.id ? 'Generating…' : 'Gen. invoices'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {folioTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3">
                  <p className="text-[11px] font-semibold text-slate-400">
                    Showing {(clampedFolioPage - 1) * FOLIOS_PER_PAGE + 1}-{Math.min(clampedFolioPage * FOLIOS_PER_PAGE, folioRows.length)} of {folioRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={clampedFolioPage <= 1}
                      onClick={() => setFolioPage((page) => Math.max(1, page - 1))}
                      type="button"
                    >
                      Previous
                    </button>
                    <span className="text-[11px] font-bold text-slate-500">Page {clampedFolioPage} of {folioTotalPages}</span>
                    <button
                      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={clampedFolioPage >= folioTotalPages}
                      onClick={() => setFolioPage((page) => Math.min(folioTotalPages, page + 1))}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Expanded folio detail ── */}
          {selectedFolioGroupId && (
            <div className="relative bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
              <DelayedSpinnerOverlay loading={folioLoading && folioLoadingGroupId === selectedFolioGroupId} />
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Folio detail</p>
                  <p className="text-[14px] font-bold text-slate-900">{selectedFolio?.external_reservation_id ?? 'Loading…'}</p>
                </div>
                <button type="button" onClick={closeFolio}
                  className="h-7 px-3 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                  Close folio
                </button>
              </div>
              {folioError  && <div className="px-6 py-4"><ErrorMsg>{folioError}</ErrorMsg></div>}
              {selectedFolio && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 p-6">
                  <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Guest',        value: formatGuestName(selectedFolio.guest?.name ?? 'Imported guest'), sub: selectedFolio.property.name },
                        { label: 'Rooms',        value: String(selectedFolio.room_count),              sub: `${selectedFolio.invoiced_room_count} invoiced` },
                        { label: 'Balance due',  value: formatCurrency(selectedFolio.balance_due),     sub: `${formatCurrency(selectedFolio.billed_total)} billed` },
                      ].map(card => (
                        <div key={card.label} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{card.label}</p>
                          <strong className="text-[15px] font-bold text-slate-900 block">{card.value}</strong>
                          <span className="text-[11.5px] text-slate-500">{card.sub}</span>
                        </div>
                      ))}
                    </div>
                    {/* Room lines */}
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                        <p className="text-[12px] font-bold text-slate-900">{selectedFolio.rooms.length} room lines</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px]">
                          <thead><tr className="border-b border-slate-100">{['Category','Rate plan','Dates','Room','Total','Status','Invoice'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
                          <tbody>
                            {selectedFolio.rooms.map(room => (
                              <tr key={room.id} className="border-b border-slate-50 last:border-0">
                                <td className="px-4 py-3 text-[12px] font-semibold text-slate-800">{room.room_category.name}</td>
                                <td className="px-4 py-3 text-[11.5px] text-slate-500">{room.rate_plan.name}</td>
                                <td className="px-4 py-3 text-[11.5px] text-slate-500">{room.arrival_date} → {room.departure_date}</td>
                                <td className="px-4 py-3 text-[12px] text-slate-600">{room.room.room_number ?? '—'}</td>
                                <td className="px-4 py-3 text-[12.5px] font-bold text-slate-900">{formatCurrency(room.total_amount)}</td>
                                <td className="px-4 py-3"><span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">{room.reservation_status}</span></td>
                                <td className="px-4 py-3"><span className={`text-[11px] font-semibold ${room.billing_id ? 'text-emerald-600' : 'text-rose-600'}`}>{room.billing_id ? 'Ready' : 'Missing'}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {/* Folio invoices */}
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                        <p className="text-[12px] font-bold text-slate-900">{selectedFolio.invoices.length} invoices</p>
                      </div>
                      <table className="w-full min-w-[400px]">
                        <thead><tr className="border-b border-slate-100">{['Guest','Total','Paid','Balance','Status'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
                        <tbody>
                          {selectedFolio.invoices.map(inv => (
                            <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                              <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-900">{formatGuestName(inv.reservation_room.guest.name)}</td>
                              <td className="px-4 py-3 text-[12.5px] font-bold text-slate-900">{formatCurrency(inv.total)}</td>
                              <td className="px-4 py-3 text-[12px] text-emerald-600 font-semibold">{formatCurrency(inv.paid_total - inv.refunded_total)}</td>
                              <td className={`px-4 py-3 text-[12.5px] font-bold ${inv.balance_due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(inv.balance_due)}</td>
                              <td className="px-4 py-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${(STATUS_CFG[inv.payment_status] ?? STATUS_CFG['UNPAID']).badge}`}>
                                  {(STATUS_CFG[inv.payment_status] ?? STATUS_CFG['UNPAID']).label}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Group payment form */}
                  <div className="space-y-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Group collection</p>
                      <p className="text-[14px] font-bold text-slate-900 mb-4">Collect against folio</p>
                      <form onSubmit={submitGroupPayment} className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</label>
                          <input type="number" min="0" step="0.01" required
                            value={groupPayForm.amount} onChange={e => setGroupPayForm(f => ({ ...f, amount: e.target.value }))}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-900 font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider</label>
                          <CustomSelect value={groupPayForm.provider} onChange={v => setGroupPayForm(f => ({ ...f, provider: v as PaymentProvider, provider_reference: v === 'CASH' ? '' : f.provider_reference }))} options={PROVIDERS} />
                        </div>
                        {groupPayForm.provider !== 'CASH' ? (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference</label>
                            <input placeholder="folio-receipt-001"
                              value={groupPayForm.provider_reference} onChange={e => setGroupPayForm(f => ({ ...f, provider_reference: e.target.value }))}
                              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-[12.5px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                          </div>
                        ) : null}
                        <button type="submit" disabled={collectingGroup || selectedFolio.balance_due <= 0}
                          className="w-full h-10 rounded-xl text-[12.5px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          {collectingGroup ? 'Collecting…' : 'Collect group payment'}
                        </button>
                      </form>
                      <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                        {[
                          { label: 'Total billed', value: formatCurrency(selectedFolio.billed_total) },
                          { label: 'Paid total',   value: formatCurrency(selectedFolio.paid_total - selectedFolio.refunded_total) },
                          { label: 'Balance due',  value: formatCurrency(selectedFolio.balance_due) },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between">
                            <span className="text-[11.5px] text-slate-500">{row.label}</span>
                            <span className="text-[12px] font-bold text-slate-900">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {lastGroupCollection && lastGroupCollection.reservation_group_id === selectedFolio.reservation_group_id && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <p className="text-[11px] font-bold text-emerald-700 mb-2">Last collection: {formatCurrency(lastGroupCollection.allocated_total)} allocated</p>
                        <p className="text-[11.5px] text-emerald-600">Remaining balance: {formatCurrency(lastGroupCollection.remaining_balance)}</p>
                        <p className="text-[11px] text-emerald-500">{lastGroupCollection.payments.length} payment{lastGroupCollection.payments.length !== 1 ? 's' : ''} created</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Collect payment modal ── */}
      {showPayModal && selectedBilling && (
        <CollectPaymentModal
          billing={selectedBilling}
          collecting={collecting}
          form={payForm}
          onClose={() => setShowPayModal(false)}
          onFormChange={setPayForm}
          onSubmit={submitPayment}
        />
      )}
    </div>
  );
}

function CollectPaymentModal({
  billing,
  collecting,
  form,
  onClose,
  onFormChange,
  onSubmit,
}: {
  billing: Billing;
  collecting: boolean;
  form: typeof defaultPayForm;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<typeof defaultPayForm>>;
  onSubmit: (event: FormEvent) => void;
}) {
  useScrollLock(true);

  return createPortal(
    <>
      <button aria-label="Close collect payment" className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} type="button" />
      <section aria-label="Collect payment" className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-3rem)] w-[calc(100vw_-_2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-[16px] font-bold text-slate-900">Collect payment</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">{formatGuestName(billing.reservation_room.guest.name)} · {billing.reservation_room.room_category.name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>
        <div className="min-h-0 overflow-y-auto p-6">
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
            <span className="text-[12.5px] text-rose-600">Outstanding balance</span>
            <span className="text-[22px] font-black text-rose-600">{formatCurrency(billing.balance_due)}</span>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Payment method</label>
              <div className="grid grid-cols-3 gap-1.5">
                {PROVIDERS.filter(p => p.value !== 'MOCK').map(p => (
                  <button key={p.value} type="button" onClick={() => onFormChange(f => ({ ...f, provider: p.value, provider_reference: p.value === 'CASH' ? '' : f.provider_reference }))}
                    className={`h-9 rounded-lg text-[11px] font-bold transition-colors border ${form.provider === p.value ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Amount</label>
              <input type="number" min="0" step="0.01" required
                value={form.amount} onChange={e => onFormChange(f => ({ ...f, amount: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-[14px] text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
            </div>
            {form.provider !== 'CASH' ? (
              <div className="space-y-1.5">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Reference (optional)</label>
                <input placeholder="Card last 4, UPI ref, receipt no..."
                  value={form.provider_reference} onChange={e => onFormChange(f => ({ ...f, provider_reference: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
              </div>
            ) : null}
            <button type="submit" disabled={collecting || !form.amount}
              className="w-full h-11 rounded-xl text-[13px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {collecting ? 'Recording...' : 'Record payment & settle folio'}
            </button>
          </form>
        </div>
      </section>
    </>,
    document.body,
  );
}
