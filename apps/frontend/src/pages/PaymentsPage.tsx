import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Billing, PaymentProvider, PaymentTransaction, ReservationGroup, ReservationGroupFolio, ReservationGroupPaymentCollection } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { MetricCard, StatusBadge, TableCard, SectionHeading, DetailList, Th, Td, labelCls, inputCls, selectCls, primaryBtn, secondaryBtn, linkBtn, ErrorMsg, LoadingMsg } from './ui';

const defaultForm = { billing_id: '', amount: '', provider: 'MOCK' as PaymentProvider, provider_reference: '' };
const defaultGroupPaymentForm = { amount: '', provider: 'MOCK' as PaymentProvider, provider_reference: '' };

const providerOptions = [{ label: 'Mock', value: 'MOCK' }, { label: 'Cash', value: 'CASH' }, { label: 'Card', value: 'CARD' }, { label: 'UPI', value: 'UPI' }, { label: 'Razorpay', value: 'RAZORPAY' }, { label: 'Stripe', value: 'STRIPE' }];

export function PaymentsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<'ALL' | PaymentProvider>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED'>('ALL');
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [invoiceReservationRoomId, setInvoiceReservationRoomId] = useState<string | null>(null);
  const [folioInvoiceGroupId, setFolioInvoiceGroupId] = useState<string | null>(null);
  const [selectedFolioId, setSelectedFolioId] = useState<string | null>(null);
  const [selectedFolio, setSelectedFolio] = useState<ReservationGroupFolio | null>(null);
  const [folioLoading, setFolioLoading] = useState(false);
  const [folioError, setFolioError] = useState<string | null>(null);
  const [groupPaymentForm, setGroupPaymentForm] = useState(defaultGroupPaymentForm);
  const [collectingGroupPayment, setCollectingGroupPayment] = useState(false);
  const [lastGroupCollection, setLastGroupCollection] = useState<ReservationGroupPaymentCollection | null>(null);
  const billingsState = useAsync(async () => fetchAllPages<Billing>('/billings'), [reloadKey]);
  const paymentsState = useAsync(async () => fetchAllPages<PaymentTransaction>('/payments', { params: { search: search || undefined } }), [reloadKey, search]);
  const reservationGroupsState = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/groups'), [reloadKey]);
  const billings = billingsState.data ?? [];
  const allPayments = paymentsState.data ?? [];
  const payments = allPayments.filter((p) => (providerFilter === 'ALL' || p.provider === providerFilter) && (statusFilter === 'ALL' || p.status === statusFilter));
  const invoicedReservationRoomIds = new Set(billings.map((b) => b.reservation_room_id).filter(Boolean));
  const reservationGroups = reservationGroupsState.data ?? [];
  const uninvoicedCheckedOutReservationRooms = reservationGroups.flatMap((g) => g.rooms.map((r) => ({ ...r, reservation_group_id: g.id, external_reservation_id: g.external_reservation_id, property: g.property, guest_name: r.guest_name ?? g.primary_guest?.name ?? 'Imported guest' }))).filter((r) => r.reservation_status === 'CHECKED_OUT' && !invoicedReservationRoomIds.has(r.id));
  const reservationFolios = reservationGroups.map((g) => {
    const lineInvoices = billings.filter((b) => b.reservation_room.reservation_group_id === g.id);
    const checkedOutRooms = g.rooms.filter((r) => r.reservation_status === 'CHECKED_OUT').length;
    return { id: g.id, external_reservation_id: g.external_reservation_id, guest_name: g.primary_guest?.name ?? 'Imported guest', property_name: g.property.name, room_count: g.rooms.length, invoiced_room_count: lineInvoices.length, checked_out_room_count: checkedOutRooms, billed_total: lineInvoices.reduce((s, b) => s + b.total, 0), balance_due: lineInvoices.reduce((s, b) => s + b.balance_due, 0) };
  }).filter((f) => f.checked_out_room_count > 0 || f.invoiced_room_count > 0 || f.billed_total > 0);
  const outstandingInvoiceCount = uninvoicedCheckedOutReservationRooms.length;
  const collectedTotal = billings.reduce((s, b) => s + (b.paid_total - b.refunded_total), 0);
  const balanceDueTotal = billings.reduce((s, b) => s + b.balance_due, 0);
  const openInvoiceCount = billings.filter((b) => b.balance_due > 0).length;
  const foliosWithBalance = reservationFolios.filter((f) => f.balance_due > 0);
  const folioBalanceTotal = foliosWithBalance.reduce((s, f) => s + f.balance_due, 0);
  const failedPaymentCount = allPayments.filter((p) => p.status === 'FAILED').length;
  const recentPayments = [...allPayments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3);

  async function submitPayment(event: FormEvent) {
    event.preventDefault(); setActionError(null); setCollecting(true);
    try { await api.post('/payments/collect', { billing_id: form.billing_id, amount: form.amount, provider: form.provider, provider_reference: form.provider_reference || undefined }); setForm(defaultForm); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); } finally { setCollecting(false); }
  }

  async function generateReservationRoomInvoice(reservationRoomId: string) {
    setActionError(null); setInvoiceReservationRoomId(reservationRoomId);
    try { await api.post('/billings', { reservation_room_id: reservationRoomId, tax: '0.00' }); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); } finally { setInvoiceReservationRoomId(null); }
  }

  async function generateMissingFolioInvoices(reservationGroupId: string) {
    setActionError(null); setFolioInvoiceGroupId(reservationGroupId);
    try { await api.post(`/billings/reservation-groups/${reservationGroupId}/generate-missing-invoices`); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); } finally { setFolioInvoiceGroupId(null); }
  }

  async function openFolio(reservationGroupId: string) {
    setSelectedFolioId(reservationGroupId); setFolioError(null); setFolioLoading(true);
    try {
      const response = await api.get<ReservationGroupFolio>(`/billings/reservation-groups/${reservationGroupId}/folio`);
      setSelectedFolio(response.data);
      setGroupPaymentForm((c) => ({ ...c, amount: response.data.balance_due > 0 ? response.data.balance_due.toFixed(2) : '' }));
    } catch (error) { setSelectedFolio(null); setFolioError(getApiErrorMessage(error)); } finally { setFolioLoading(false); }
  }

  async function submitGroupPayment(event: FormEvent) {
    event.preventDefault(); if (!selectedFolioId) return;
    setActionError(null); setCollectingGroupPayment(true);
    try {
      const response = await api.post<ReservationGroupPaymentCollection>('/payments/collect-reservation-group', { reservation_group_id: selectedFolioId, amount: groupPaymentForm.amount, provider: groupPaymentForm.provider, provider_reference: groupPaymentForm.provider_reference || undefined });
      setLastGroupCollection(response.data); setGroupPaymentForm(defaultGroupPaymentForm);
      await openFolio(selectedFolioId); setReloadKey((v) => v + 1);
    } catch (error) { setActionError(getApiErrorMessage(error)); } finally { setCollectingGroupPayment(false); }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Finance</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Payments &amp; Folios</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">Collect against room-line invoices and grouped OTA folios without leaving the imported reservation workflow.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Invoices" value={billings.length.toString()} tone="blue" />
        <MetricCard label="Outstanding" value={outstandingInvoiceCount.toString()} tone="gold" sub="Uninvoiced checked-out rooms" />
        <MetricCard label="Payments" value={payments.length.toString()} tone="green" />
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">Finance model</strong>
        <span className="text-slate-500 leading-relaxed">Billing is still one invoice per reservation room, with folio-level collection layered on top for OTA reservation groups and imported stays.</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[28rem_minmax(0,1fr)] gap-5 items-start">
        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 min-h-[26.5rem] space-y-5" onSubmit={submitPayment}>
          <SectionHeading eyebrow="Collection desk" title="Collect payment" />
          <div className="grid grid-cols-2 gap-4">
            <label className={`${labelCls} col-span-2`}>
              <span>Invoice</span>
              <CustomSelect onChange={(value) => { const billing = billings.find((b) => b.id === value); setForm({ ...form, billing_id: value, amount: billing && billing.balance_due > 0 ? billing.balance_due.toFixed(2) : '' }); }} options={billings.map((b) => ({ label: `${b.reservation_room.guest.name} — ${formatCurrency(b.balance_due)} due`, value: b.id }))} placeholder="Select invoice" value={form.billing_id} />
            </label>
            <label className={labelCls}><span>Amount</span><input className={inputCls} min="0" onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="5000.00" required step="0.01" type="number" value={form.amount} /></label>
            <label className={labelCls}><span>Provider</span><CustomSelect onChange={(v) => setForm({ ...form, provider: v as PaymentProvider })} options={providerOptions} value={form.provider} /></label>
            <label className={`${labelCls} col-span-2`}><span>Reference</span><input className={inputCls} onChange={(e) => setForm({ ...form, provider_reference: e.target.value })} placeholder="cash-receipt-001" value={form.provider_reference} /></label>
          </div>
          <button className={primaryBtn + ' w-full justify-center mt-1'} disabled={collecting} type="submit">{collecting ? 'Collecting…' : 'Collect payment'}</button>
        </form>

        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <SectionHeading eyebrow="Ledger posture" title="Cash summary" />
              <DetailList rows={[{ label: 'Collected', value: formatCurrency(collectedTotal) }, { label: 'Balance due', value: formatCurrency(balanceDueTotal) }, { label: 'Grouped folios', value: reservationFolios.length.toString() }]} />
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <SectionHeading eyebrow="Collection focus" title="Desk queue" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[{ label: 'Open invoices', value: String(openInvoiceCount), detail: formatCurrency(balanceDueTotal), tone: 'rose' }, { label: 'Folio balances', value: String(foliosWithBalance.length), detail: formatCurrency(folioBalanceTotal), tone: 'indigo' }, { label: 'Need invoice', value: String(outstandingInvoiceCount), detail: 'Checked-out rooms', tone: 'amber' }, { label: 'Failed payments', value: String(failedPaymentCount), detail: 'Needs review', tone: 'slate' }].map((item) => (
                  <div key={item.label} className={`rounded-xl border p-3 ${focusTileClass(item.tone)}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1 opacity-80">{item.label}</span>
                    <strong className="text-xl font-extrabold block leading-none">{item.value}</strong>
                    <span className="text-[11px] font-medium mt-1.5 block opacity-80">{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <SectionHeading eyebrow="Recent activity" title="Latest payments" />
            {recentPayments.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <strong className="text-sm font-bold text-slate-900 truncate">{payment.reservation_room.guest_name}</strong>
                      <StatusBadge label={payment.status} tone={payment.status === 'SUCCEEDED' ? 'green' : payment.status === 'FAILED' ? 'rose' : 'default'} />
                    </div>
                    <p className="text-xs text-slate-500 truncate">{payment.reservation_room.property_name}</p>
                    <div className="flex items-end justify-between gap-2 mt-3">
                      <span className="text-[11px] font-mono text-slate-400">{formatShortDateTime(payment.created_at)}</span>
                      <strong className="text-sm font-extrabold text-slate-900">{formatCurrency(payment.amount)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4">No payment activity has been recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
      {(billingsState.loading || paymentsState.loading || reservationGroupsState.loading) && <LoadingMsg>Loading payment data…</LoadingMsg>}
      {(billingsState.error || paymentsState.error || reservationGroupsState.error) && <ErrorMsg>{billingsState.error ?? paymentsState.error ?? reservationGroupsState.error}</ErrorMsg>}

      <FilterBar title="Payment filters">
        <label className={labelCls}><span>Search payments</span><input className={inputCls} onChange={(e) => setSearch(e.target.value)} placeholder="Guest, property, or payment reference" value={search} /></label>
        <label className={labelCls}><span>Provider</span><CustomSelect onChange={(v) => setProviderFilter(v as 'ALL' | PaymentProvider)} options={[{ label: 'All providers', value: 'ALL' }, ...providerOptions]} value={providerFilter} /></label>
        <label className={labelCls}><span>Status</span><CustomSelect onChange={(v) => setStatusFilter(v as typeof statusFilter)} options={[{ label: 'All statuses', value: 'ALL' }, { label: 'Succeeded', value: 'SUCCEEDED' }, { label: 'Failed', value: 'FAILED' }, { label: 'Refunded', value: 'REFUNDED' }]} value={statusFilter} /></label>
      </FilterBar>

      {uninvoicedCheckedOutReservationRooms.length > 0 && (
        <TableCard title={`${uninvoicedCheckedOutReservationRooms.length} checked-out room stays`} eyebrow="Imported stays needing invoice">
          <table className="w-full min-w-[600px]">
            <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Guest</Th><Th>Property</Th><Th>External reservation</Th><Th>Dates</Th><Th>Total</Th><Th>Action</Th></tr></thead>
            <tbody>
              {uninvoicedCheckedOutReservationRooms.map((room) => (
                <tr key={room.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                  <Td>{room.guest_name}</Td><Td>{room.property.name}</Td><Td className="font-mono text-xs text-slate-500">{room.external_reservation_id}</Td>
                  <Td>{room.arrival_date} to {room.departure_date}</Td><Td>{room.total_amount == null ? '—' : formatCurrency(room.total_amount)}</Td>
                  <Td><button className={linkBtn + ' !text-xs !px-2.5 !py-1'} disabled={invoiceReservationRoomId === room.id} onClick={() => void generateReservationRoomInvoice(room.id)} type="button">{invoiceReservationRoomId === room.id ? 'Generating…' : 'Generate invoice'}</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {reservationFolios.length > 0 && (
        <TableCard title={`${reservationFolios.length} grouped OTA folios`} eyebrow="Reservation folios">
          <table className="w-full min-w-[600px]">
            <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Reservation</Th><Th>Guest</Th><Th>Property</Th><Th>Rooms invoiced</Th><Th>Billed</Th><Th>Balance</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {reservationFolios.map((folio) => (
                <tr key={folio.id} className={`hover:bg-slate-50/60 border-b border-slate-50 last:border-0 ${selectedFolioId === folio.id ? 'bg-indigo-50/40' : ''}`}>
                  <Td className="font-mono text-xs text-slate-500">{folio.external_reservation_id}</Td>
                  <Td className="font-medium text-slate-900">{folio.guest_name}</Td>
                  <Td>{folio.property_name}</Td>
                  <Td>{folio.invoiced_room_count}/{folio.checked_out_room_count} checked out</Td>
                  <Td>{formatCurrency(folio.billed_total)}</Td>
                  <Td className={folio.balance_due > 0 ? 'text-rose-600 font-bold' : ''}>{formatCurrency(folio.balance_due)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5 ${selectedFolioId === folio.id ? '!bg-indigo-100 !text-indigo-700' : ''}`} onClick={() => void openFolio(folio.id)} type="button">{selectedFolioId === folio.id ? 'Refresh folio' : 'Review folio'}</button>
                      <button className={`${linkBtn} !text-xs !px-2.5 !py-1`} disabled={folioInvoiceGroupId === folio.id} onClick={() => void generateMissingFolioInvoices(folio.id)} type="button">{folioInvoiceGroupId === folio.id ? 'Generating…' : 'Generate missing invoices'}</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {selectedFolioId && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Selected folio</p>
              <h3 className="text-base font-bold text-slate-900">{selectedFolio?.external_reservation_id ?? 'Loading folio…'}</h3>
            </div>
            <button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} onClick={() => { setSelectedFolioId(null); setSelectedFolio(null); setFolioError(null); setLastGroupCollection(null); }} type="button">Close folio</button>
          </div>
          {folioLoading && <LoadingMsg>Loading grouped folio…</LoadingMsg>}
          {folioError && <ErrorMsg>{folioError}</ErrorMsg>}
          {selectedFolio && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-5 p-5">
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  {[{ label: 'Guest', value: selectedFolio.guest?.name ?? 'Imported guest', sub: selectedFolio.property.name }, { label: 'Rooms', value: String(selectedFolio.room_count), sub: `${selectedFolio.invoiced_room_count} invoiced room lines` }, { label: 'Balance due', value: formatCurrency(selectedFolio.balance_due), sub: `${formatCurrency(selectedFolio.billed_total)} billed` }].map((card) => (
                    <div key={card.label} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{card.label}</p>
                      <strong className="text-base font-extrabold text-slate-900 block">{card.value}</strong>
                      <span className="text-xs text-slate-500">{card.sub}</span>
                    </div>
                  ))}
                </div>

                <TableCard title={`${selectedFolio.rooms.length} grouped stays`} eyebrow="Room lines">
                  <table className="w-full min-w-[500px]">
                    <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Room line</Th><Th>Category</Th><Th>Dates</Th><Th>Assigned room</Th><Th>Total</Th><Th>Status</Th><Th>Invoice</Th></tr></thead>
                    <tbody>
                      {selectedFolio.rooms.map((room) => (
                        <tr key={room.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                          <Td className="font-mono text-xs text-slate-500">{room.external_room_reservation_id}</Td>
                          <Td><span className="font-medium text-slate-900 block">{room.room_category.name}</span><span className="text-xs text-slate-400">{room.rate_plan.name}</span></Td>
                          <Td className="text-xs">{room.arrival_date} to {room.departure_date}</Td>
                          <Td>{room.room.room_number ?? 'Not assigned'}</Td>
                          <Td>{formatCurrency(room.total_amount)}</Td>
                          <Td><StatusBadge label={room.reservation_status} /></Td>
                          <Td><span className={`text-xs font-semibold ${room.billing_id ? 'text-emerald-700' : 'text-rose-600'}`}>{room.billing_id ? 'Ready' : 'Missing'}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>

                <TableCard title={`${selectedFolio.invoices.length} folio invoices`} eyebrow="Invoices">
                  <table className="w-full min-w-[400px]">
                    <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Guest</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
                    <tbody>
                      {selectedFolio.invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                          <Td>{invoice.reservation_room.guest.name}</Td>
                          <Td>{formatCurrency(invoice.total)}</Td>
                          <Td>{formatCurrency(invoice.paid_total - invoice.refunded_total)}</Td>
                          <Td className={invoice.balance_due > 0 ? 'text-rose-600 font-bold' : ''}>{formatCurrency(invoice.balance_due)}</Td>
                          <Td><StatusBadge label={invoice.payment_status} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              </div>

              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                  <SectionHeading eyebrow="Group collection" title="Collect against folio" />
                  <form onSubmit={submitGroupPayment} className="space-y-3">
                    <label className={labelCls}><span>Amount</span><input className={inputCls} min="0" onChange={(e) => setGroupPaymentForm({ ...groupPaymentForm, amount: e.target.value })} required step="0.01" type="number" value={groupPaymentForm.amount} /></label>
                    <label className={labelCls}><span>Provider</span><CustomSelect onChange={(v) => setGroupPaymentForm({ ...groupPaymentForm, provider: v as PaymentProvider })} options={providerOptions} value={groupPaymentForm.provider} /></label>
                    <label className={labelCls}><span>Reference</span><input className={inputCls} onChange={(e) => setGroupPaymentForm({ ...groupPaymentForm, provider_reference: e.target.value })} placeholder="folio-receipt-001" value={groupPaymentForm.provider_reference} /></label>
                    <button className={primaryBtn + ' w-full'} disabled={collectingGroupPayment || selectedFolio.balance_due <= 0} type="submit">{collectingGroupPayment ? 'Collecting…' : 'Collect group payment'}</button>
                  </form>
                  <DetailList rows={[{ label: 'Total amount', value: formatCurrency(selectedFolio.total_amount) }, { label: 'Paid total', value: formatCurrency(selectedFolio.paid_total - selectedFolio.refunded_total) }, { label: 'Balance due', value: formatCurrency(selectedFolio.balance_due) }]} />
                </div>
                {lastGroupCollection && lastGroupCollection.reservation_group_id === selectedFolio.reservation_group_id && (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <SectionHeading eyebrow="Last collection" title={`${formatCurrency(lastGroupCollection.allocated_total)} allocated`} />
                    <DetailList rows={[{ label: 'Remaining balance', value: formatCurrency(lastGroupCollection.remaining_balance) }, { label: 'Payments created', value: String(lastGroupCollection.payments.length) }]} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <TableCard title={`${billings.length} invoices`} eyebrow="Invoices">
        <table className="w-full min-w-[500px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Guest</Th><Th>Property</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
          <tbody>
            {billings.map((billing) => (
              <tr key={billing.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                <Td className="font-medium text-slate-900">{billing.reservation_room.guest.name}</Td>
                <Td>{billing.reservation_room.property.name}</Td>
                <Td>{formatCurrency(billing.total)}</Td>
                <Td>{formatCurrency(billing.paid_total - billing.refunded_total)}</Td>
                <Td className={billing.balance_due > 0 ? 'text-rose-600 font-bold' : ''}>{formatCurrency(billing.balance_due)}</Td>
                <Td><StatusBadge label={billing.payment_status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title={`${payments.length} payments`} eyebrow="Transactions">
        <table className="w-full min-w-[500px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Guest</Th><Th>Provider</Th><Th>Reference</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                <Td className="font-medium text-slate-900">{payment.reservation_room.guest_name}</Td>
                <Td>{payment.provider}</Td>
                <Td className="font-mono text-xs text-slate-500">{payment.provider_reference ?? '—'}</Td>
                <Td>{formatCurrency(payment.amount)}</Td>
                <Td><StatusBadge label={payment.status} tone={payment.status === 'SUCCEEDED' ? 'green' : payment.status === 'FAILED' ? 'rose' : 'default'} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </section>
  );
}

function focusTileClass(tone: string) {
  if (tone === 'rose') return 'bg-rose-50 border-rose-200 text-rose-800';
  if (tone === 'indigo') return 'bg-indigo-50 border-indigo-200 text-indigo-800';
  if (tone === 'amber') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-slate-50 border-slate-200 text-slate-700';
}

function formatShortDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { day: '2-digit', hour: '2-digit', minute: '2-digit', month: 'short' });
}
