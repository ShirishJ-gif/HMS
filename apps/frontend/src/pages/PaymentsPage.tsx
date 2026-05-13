import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import {
  Billing,
  PaymentProvider,
  PaymentTransaction,
  ReservationGroup,
  ReservationGroupFolio,
  ReservationGroupPaymentCollection,
} from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

const defaultForm = {
  billing_id: '',
  amount: '',
  provider: 'MOCK' as PaymentProvider,
  provider_reference: '',
};

const defaultGroupPaymentForm = {
  amount: '',
  provider: 'MOCK' as PaymentProvider,
  provider_reference: '',
};

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
  const paymentsState = useAsync(
    async () => fetchAllPages<PaymentTransaction>('/payments', { params: { search: search || undefined } }),
    [reloadKey, search],
  );
  const reservationGroupsState = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/groups'), [reloadKey]);
  const billings = billingsState.data ?? [];
  const payments = (paymentsState.data ?? []).filter((payment) => {
    if (providerFilter !== 'ALL' && payment.provider !== providerFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && payment.status !== statusFilter) {
      return false;
    }

    return true;
  });
  const invoicedReservationRoomIds = new Set(
    billings.map((billing) => billing.reservation_room_id).filter(Boolean),
  );
  const reservationGroups = reservationGroupsState.data ?? [];
  const uninvoicedCheckedOutReservationRooms = reservationGroups
    .flatMap((group) =>
      group.rooms.map((room) => ({
        ...room,
        reservation_group_id: group.id,
        external_reservation_id: group.external_reservation_id,
        property: group.property,
        guest_name: room.guest_name ?? group.primary_guest?.name ?? 'Imported guest',
      })),
    )
    .filter((room) => room.reservation_status === 'CHECKED_OUT' && !invoicedReservationRoomIds.has(room.id));
  const reservationFolios = reservationGroups
    .map((group) => {
      const lineInvoices = billings.filter(
        (billing) => billing.reservation_room.reservation_group_id === group.id,
      );
      const checkedOutRooms = group.rooms.filter((room) => room.reservation_status === 'CHECKED_OUT').length;
      const billedTotal = lineInvoices.reduce((sum, billing) => sum + billing.total, 0);
      const balanceDue = lineInvoices.reduce((sum, billing) => sum + billing.balance_due, 0);

      return {
        id: group.id,
        external_reservation_id: group.external_reservation_id,
        guest_name: group.primary_guest?.name ?? 'Imported guest',
        property_name: group.property.name,
        room_count: group.rooms.length,
        invoiced_room_count: lineInvoices.length,
        checked_out_room_count: checkedOutRooms,
        billed_total: billedTotal,
        balance_due: balanceDue,
      };
    })
    .filter((folio) => folio.checked_out_room_count > 0 || folio.invoiced_room_count > 0 || folio.billed_total > 0);
  const outstandingInvoiceCount = uninvoicedCheckedOutReservationRooms.length;
  const collectedTotal = billings.reduce((sum, billing) => sum + (billing.paid_total - billing.refunded_total), 0);
  const balanceDueTotal = billings.reduce((sum, billing) => sum + billing.balance_due, 0);

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setCollecting(true);

    try {
      await api.post('/payments/collect', {
        billing_id: form.billing_id,
        amount: form.amount,
        provider: form.provider,
        provider_reference: form.provider_reference || undefined,
      });
      setForm(defaultForm);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setCollecting(false);
    }
  }

  async function generateReservationRoomInvoice(reservationRoomId: string) {
    setActionError(null);
    setInvoiceReservationRoomId(reservationRoomId);

    try {
      await api.post('/billings', {
        reservation_room_id: reservationRoomId,
        tax: '0.00',
      });
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setInvoiceReservationRoomId(null);
    }
  }

  async function generateMissingFolioInvoices(reservationGroupId: string) {
    setActionError(null);
    setFolioInvoiceGroupId(reservationGroupId);

    try {
      await api.post(`/billings/reservation-groups/${reservationGroupId}/generate-missing-invoices`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setFolioInvoiceGroupId(null);
    }
  }

  async function openFolio(reservationGroupId: string) {
    setSelectedFolioId(reservationGroupId);
    setFolioError(null);
    setFolioLoading(true);

    try {
      const response = await api.get<ReservationGroupFolio>(`/billings/reservation-groups/${reservationGroupId}/folio`);
      setSelectedFolio(response.data);
      setGroupPaymentForm((current) => ({
        ...current,
        amount: response.data.balance_due > 0 ? response.data.balance_due.toFixed(2) : '',
      }));
    } catch (error) {
      setSelectedFolio(null);
      setFolioError(getApiErrorMessage(error));
    } finally {
      setFolioLoading(false);
    }
  }

  async function submitGroupPayment(event: FormEvent) {
    event.preventDefault();

    if (!selectedFolioId) {
      return;
    }

    setActionError(null);
    setCollectingGroupPayment(true);

    try {
      const response = await api.post<ReservationGroupPaymentCollection>('/payments/collect-reservation-group', {
        reservation_group_id: selectedFolioId,
        amount: groupPaymentForm.amount,
        provider: groupPaymentForm.provider,
        provider_reference: groupPaymentForm.provider_reference || undefined,
      });
      setLastGroupCollection(response.data);
      setGroupPaymentForm(defaultGroupPaymentForm);
      await openFolio(selectedFolioId);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setCollectingGroupPayment(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Finance</p>
          <h2>Payments &amp; Folios</h2>
          <p className="page-subtitle">
            Collect against room-line invoices and grouped OTA folios without leaving the imported reservation workflow.
          </p>
        </div>
      </div>

      <div className="channel-summary-grid payment-summary-grid">
        <SignalStat label="Invoices" value={billings.length} />
        <SignalStat label="Outstanding" value={outstandingInvoiceCount} />
        <SignalStat label="Payments" value={payments.length} />
      </div>

      <div className="info-strip">
        <strong>Finance model</strong>
        <span>
          Billing is still one invoice per reservation room, with folio-level collection layered on top for OTA reservation groups and imported stays.
        </span>
      </div>

      <div className="split-panels payment-top-grid">
        <form className="card booking-form-card" onSubmit={submitPayment}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Collection desk</p>
              <h3>Collect payment</h3>
            </div>
          </div>
          <div className="booking-form-grid">
            <label>
              Invoice
              <CustomSelect
                onChange={(value) => {
                  const billing = billings.find((item) => item.id === value);
                  setForm({
                    ...form,
                    billing_id: value,
                    amount: billing && billing.balance_due > 0 ? billing.balance_due.toFixed(2) : '',
                  });
                }}
                options={billings.map((billing) => ({
                  label: `${billing.reservation_room.guest.name} - ${formatCurrency(billing.balance_due)} due`,
                  value: billing.id,
                }))}
                placeholder="Select invoice"
                value={form.billing_id}
              />
            </label>
            <label>
              Amount
              <input
                min="0"
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="5000.00"
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </label>
            <label>
              Provider
              <CustomSelect
                onChange={(value) => setForm({ ...form, provider: value as PaymentProvider })}
                options={[
                  { label: 'Mock', value: 'MOCK' },
                  { label: 'Cash', value: 'CASH' },
                  { label: 'Card', value: 'CARD' },
                  { label: 'UPI', value: 'UPI' },
                  { label: 'Razorpay', value: 'RAZORPAY' },
                  { label: 'Stripe', value: 'STRIPE' },
                ]}
                value={form.provider}
              />
            </label>
            <label>
              Reference
              <input
                onChange={(event) => setForm({ ...form, provider_reference: event.target.value })}
                placeholder="cash-receipt-001"
                value={form.provider_reference}
              />
            </label>
          </div>
          <div className="booking-form-footer">
            <button className="primary-button" type="submit">
              {collecting ? 'Collecting...' : 'Collect payment'}
            </button>
          </div>
        </form>

        <article className="insight-panel payment-ledger-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ledger posture</p>
              <h3>Cash summary</h3>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Collected</dt>
              <dd>{formatCurrency(collectedTotal)}</dd>
            </div>
            <div>
              <dt>Balance due</dt>
              <dd>{formatCurrency(balanceDueTotal)}</dd>
            </div>
            <div>
              <dt>Grouped folios</dt>
              <dd>{reservationFolios.length}</dd>
            </div>
          </dl>
        </article>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      {(billingsState.loading || paymentsState.loading || reservationGroupsState.loading) && <p className="muted">Loading payment data...</p>}
      {(billingsState.error || paymentsState.error || reservationGroupsState.error) && (
        <p className="error">{billingsState.error ?? paymentsState.error ?? reservationGroupsState.error}</p>
      )}

      <FilterBar title="Payment filters">
        <label>
          Search payments
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Guest, property, or payment reference"
            value={search}
          />
        </label>
        <label>
          Provider
          <CustomSelect
            onChange={(value) => setProviderFilter(value as 'ALL' | PaymentProvider)}
            options={[
              { label: 'All providers', value: 'ALL' },
              { label: 'Mock', value: 'MOCK' },
              { label: 'Cash', value: 'CASH' },
              { label: 'Card', value: 'CARD' },
              { label: 'UPI', value: 'UPI' },
              { label: 'Razorpay', value: 'RAZORPAY' },
              { label: 'Stripe', value: 'STRIPE' },
            ]}
            value={providerFilter}
          />
        </label>
        <label>
          Status
          <CustomSelect
            onChange={(value) => setStatusFilter(value as typeof statusFilter)}
            options={[
              { label: 'All statuses', value: 'ALL' },
              { label: 'Succeeded', value: 'SUCCEEDED' },
              { label: 'Failed', value: 'FAILED' },
              { label: 'Refunded', value: 'REFUNDED' },
            ]}
            value={statusFilter}
          />
        </label>
      </FilterBar>

      {uninvoicedCheckedOutReservationRooms.length > 0 && (
        <div className="table-card spaced-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Imported stays needing invoice</p>
              <h3>{uninvoicedCheckedOutReservationRooms.length} checked-out room stays</h3>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Property</th>
                <th>External reservation</th>
                <th>Dates</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {uninvoicedCheckedOutReservationRooms.map((room) => (
                <tr key={room.id}>
                  <td>{room.guest_name}</td>
                  <td>{room.property.name}</td>
                  <td>{room.external_reservation_id}</td>
                  <td>
                    {room.arrival_date} to {room.departure_date}
                  </td>
                  <td>{room.total_amount == null ? '-' : formatCurrency(room.total_amount)}</td>
                  <td>
                    <button
                      className="link-button"
                      disabled={invoiceReservationRoomId === room.id}
                      onClick={() => void generateReservationRoomInvoice(room.id)}
                      type="button"
                    >
                      {invoiceReservationRoomId === room.id ? 'Generating...' : 'Generate invoice'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reservationFolios.length > 0 && (
        <div className="table-card spaced-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Reservation folios</p>
              <h3>{reservationFolios.length} grouped OTA folios</h3>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Reservation</th>
                <th>Guest</th>
                <th>Property</th>
                <th>Rooms invoiced</th>
                <th>Billed</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservationFolios.map((folio) => (
                <tr key={folio.id}>
                  <td>{folio.external_reservation_id}</td>
                  <td>{folio.guest_name}</td>
                  <td>{folio.property_name}</td>
                  <td>
                    {folio.invoiced_room_count}/{folio.checked_out_room_count} checked-out rooms
                  </td>
                  <td>{formatCurrency(folio.billed_total)}</td>
                  <td>{formatCurrency(folio.balance_due)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="secondary-button compact-button"
                        onClick={() => void openFolio(folio.id)}
                        type="button"
                      >
                        {selectedFolioId === folio.id ? 'Refresh folio' : 'Review folio'}
                      </button>
                      <button
                        className="link-button"
                        disabled={folioInvoiceGroupId === folio.id}
                        onClick={() => void generateMissingFolioInvoices(folio.id)}
                        type="button"
                      >
                        {folioInvoiceGroupId === folio.id ? 'Generating...' : 'Generate missing invoices'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedFolioId && (
        <div className="table-card spaced-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Selected folio</p>
              <h3>{selectedFolio?.external_reservation_id ?? 'Loading folio...'}</h3>
            </div>
            <button
              className="secondary-button compact-button"
              onClick={() => {
                setSelectedFolioId(null);
                setSelectedFolio(null);
                setFolioError(null);
                setLastGroupCollection(null);
              }}
              type="button"
            >
              Close folio
            </button>
          </div>

          {folioLoading && <p className="muted">Loading grouped folio...</p>}
          {folioError && <p className="error">{folioError}</p>}

          {selectedFolio && (
            <div className="folio-layout">
              <div className="folio-main-rail">
                <div className="channel-summary-grid">
                  <article className="channel-summary-card">
                    <p>Guest</p>
                    <strong>{selectedFolio.guest?.name ?? 'Imported guest'}</strong>
                    <span>{selectedFolio.property.name}</span>
                  </article>
                  <article className="channel-summary-card">
                    <p>Rooms</p>
                    <strong>{selectedFolio.room_count}</strong>
                    <span>{selectedFolio.invoiced_room_count} invoiced room lines</span>
                  </article>
                  <article className="channel-summary-card">
                    <p>Balance due</p>
                    <strong>{formatCurrency(selectedFolio.balance_due)}</strong>
                    <span>{formatCurrency(selectedFolio.billed_total)} billed</span>
                  </article>
                </div>

                <div className="table-card embedded-table-card">
                  <div className="table-heading">
                    <div>
                      <p className="eyebrow">Room lines</p>
                      <h3>{selectedFolio.rooms.length} grouped stays</h3>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Room line</th>
                        <th>Category</th>
                        <th>Dates</th>
                        <th>Assigned room</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFolio.rooms.map((room) => (
                        <tr key={room.id}>
                          <td>{room.external_room_reservation_id}</td>
                          <td>
                            {room.room_category.name}
                            <br />
                            <span className="muted">{room.rate_plan.name}</span>
                          </td>
                          <td>
                            {room.arrival_date} to {room.departure_date}
                          </td>
                          <td>{room.room.room_number ?? 'Not assigned'}</td>
                          <td>{formatCurrency(room.total_amount)}</td>
                          <td>
                            <span className={`status-pill ${room.reservation_status.toLowerCase()}`}>{room.reservation_status}</span>
                          </td>
                          <td>{room.billing_id ? 'Ready' : 'Missing'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="table-card embedded-table-card">
                  <div className="table-heading">
                    <div>
                      <p className="eyebrow">Invoices</p>
                      <h3>{selectedFolio.invoices.length} folio invoices</h3>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Guest</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFolio.invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>{invoice.reservation_room.guest.name}</td>
                          <td>{formatCurrency(invoice.total)}</td>
                          <td>{formatCurrency(invoice.paid_total - invoice.refunded_total)}</td>
                          <td>{formatCurrency(invoice.balance_due)}</td>
                          <td>
                            <span className="status-pill">{invoice.payment_status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="folio-side-rail">
                <div className="insight-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Group collection</p>
                      <h3>Collect against folio</h3>
                    </div>
                  </div>
                  <form className="grid" onSubmit={submitGroupPayment}>
                    <label>
                      Amount
                      <input
                        min="0"
                        onChange={(event) => setGroupPaymentForm({ ...groupPaymentForm, amount: event.target.value })}
                        required
                        step="0.01"
                        type="number"
                        value={groupPaymentForm.amount}
                      />
                    </label>
                    <label>
                      Provider
                      <CustomSelect
                        onChange={(value) => setGroupPaymentForm({ ...groupPaymentForm, provider: value as PaymentProvider })}
                        options={[
                          { label: 'Mock', value: 'MOCK' },
                          { label: 'Cash', value: 'CASH' },
                          { label: 'Card', value: 'CARD' },
                          { label: 'UPI', value: 'UPI' },
                          { label: 'Razorpay', value: 'RAZORPAY' },
                          { label: 'Stripe', value: 'STRIPE' },
                        ]}
                        value={groupPaymentForm.provider}
                      />
                    </label>
                    <label>
                      Reference
                      <input
                        onChange={(event) => setGroupPaymentForm({ ...groupPaymentForm, provider_reference: event.target.value })}
                        placeholder="folio-receipt-001"
                        value={groupPaymentForm.provider_reference}
                      />
                    </label>
                    <button className="primary-button" disabled={collectingGroupPayment || selectedFolio.balance_due <= 0} type="submit">
                      {collectingGroupPayment ? 'Collecting...' : 'Collect group payment'}
                    </button>
                  </form>
                  <dl className="detail-list">
                    <div>
                      <dt>Total amount</dt>
                      <dd>{formatCurrency(selectedFolio.total_amount)}</dd>
                    </div>
                    <div>
                      <dt>Paid total</dt>
                      <dd>{formatCurrency(selectedFolio.paid_total - selectedFolio.refunded_total)}</dd>
                    </div>
                    <div>
                      <dt>Balance due</dt>
                      <dd>{formatCurrency(selectedFolio.balance_due)}</dd>
                    </div>
                  </dl>
                </div>

                {lastGroupCollection && lastGroupCollection.reservation_group_id === selectedFolio.reservation_group_id && (
                  <div className="insight-panel">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Last collection</p>
                        <h3>{formatCurrency(lastGroupCollection.allocated_total)} allocated</h3>
                      </div>
                    </div>
                    <dl className="detail-list">
                      <div>
                        <dt>Remaining balance</dt>
                        <dd>{formatCurrency(lastGroupCollection.remaining_balance)}</dd>
                      </div>
                      <div>
                        <dt>Payments created</dt>
                        <dd>{lastGroupCollection.payments.length}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      )}

      <div className="table-card spaced-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Invoices</p>
            <h3>{billings.length} invoices</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Property</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {billings.map((billing) => (
              <tr key={billing.id}>
                <td>{billing.reservation_room.guest.name}</td>
                <td>{billing.reservation_room.property.name}</td>
                <td>{formatCurrency(billing.total)}</td>
                <td>{formatCurrency(billing.paid_total - billing.refunded_total)}</td>
                <td>{formatCurrency(billing.balance_due)}</td>
                <td>
                  <span className="status-pill">{billing.payment_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-card spaced-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Transactions</p>
            <h3>{payments.length} payments</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Provider</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.reservation_room.guest_name}</td>
                <td>{payment.provider}</td>
                <td>{payment.provider_reference ?? '-'}</td>
                <td>{formatCurrency(payment.amount)}</td>
                <td>
                  <span className="status-pill available">{payment.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SignalStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
