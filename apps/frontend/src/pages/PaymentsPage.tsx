import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { Billing, Booking, PaymentProvider, PaymentTransaction } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

const defaultForm = {
  billing_id: '',
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
  const [invoiceBookingId, setInvoiceBookingId] = useState<string | null>(null);
  const billingsState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Billing>>('/billings', { params: { limit: 100 } })).data),
    [reloadKey],
  );
  const paymentsState = useAsync(
    async () => (await api.get<PaginatedResponse<PaymentTransaction>>('/payments', { params: { search: search || undefined } })).data,
    [reloadKey, search],
  );
  const bookingsState = useAsync(async () => (await api.get<PaginatedResponse<Booking>>('/bookings', { params: { limit: 100 } })).data, [reloadKey]);
  const billings = billingsState.data ?? [];
  const payments = (paymentsState.data?.data ?? []).filter((payment) => {
    if (providerFilter !== 'ALL' && payment.provider !== providerFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && payment.status !== statusFilter) {
      return false;
    }

    return true;
  });
  const invoicedBookingIds = new Set(billings.map((billing) => billing.booking_id));
  const uninvoicedCheckedOutBookings = (bookingsState.data?.data ?? []).filter(
    (booking) => booking.booking_status === 'CHECKED_OUT' && !invoicedBookingIds.has(booking.id),
  );
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

  async function generateInvoice(bookingId: string) {
    setActionError(null);
    setInvoiceBookingId(bookingId);

    try {
      await api.post('/billings', {
        booking_id: bookingId,
        tax: '0.00',
      });
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setInvoiceBookingId(null);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h2>Payment Flow</h2>
          <p className="page-subtitle">Collect invoice payments through a mock provider boundary ready for Razorpay or Stripe.</p>
        </div>
      </div>

      <div className="booking-layout">
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
              <select
                onChange={(event) => {
                  const billing = billings.find((item) => item.id === event.target.value);
                  setForm({
                    ...form,
                    billing_id: event.target.value,
                    amount: billing && billing.balance_due > 0 ? billing.balance_due.toFixed(2) : '',
                  });
                }}
                required
                value={form.billing_id}
              >
                <option value="">Select invoice</option>
                {billings.map((billing) => (
                  <option key={billing.id} value={billing.id}>
                    {billing.booking.guest.name} - {formatCurrency(billing.balance_due)} due
                  </option>
                ))}
              </select>
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
              <select
                onChange={(event) => setForm({ ...form, provider: event.target.value as PaymentProvider })}
                value={form.provider}
              >
                <option value="MOCK">Mock</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="UPI">UPI</option>
                <option value="RAZORPAY">Razorpay</option>
                <option value="STRIPE">Stripe</option>
              </select>
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

        <aside className="booking-sidepanel">
          <div className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cash posture</p>
                <h3>Ledger snapshot</h3>
              </div>
            </div>
            <div className="compact-signal-grid">
              <SignalStat label="Invoices" value={billings.length} />
              <SignalStat label="Outstanding" value={uninvoicedCheckedOutBookings.length} />
              <SignalStat label="Payments" value={paymentsState.data?.meta.total ?? payments.length} />
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
                <dt>Search scope</dt>
                <dd>{search || 'All transactions'}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      {(billingsState.loading || paymentsState.loading || bookingsState.loading) && <p className="muted">Loading payment data...</p>}
      {(billingsState.error || paymentsState.error || bookingsState.error) && (
        <p className="error">{billingsState.error ?? paymentsState.error ?? bookingsState.error}</p>
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
          <select onChange={(event) => setProviderFilter(event.target.value as 'ALL' | PaymentProvider)} value={providerFilter}>
            <option value="ALL">All providers</option>
            <option value="MOCK">Mock</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
            <option value="RAZORPAY">Razorpay</option>
            <option value="STRIPE">Stripe</option>
          </select>
        </label>
        <label>
          Status
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">All statuses</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </label>
      </FilterBar>

      {uninvoicedCheckedOutBookings.length > 0 && (
        <div className="table-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Needs invoice</p>
              <h3>{uninvoicedCheckedOutBookings.length} checked-out bookings</h3>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Property</th>
                <th>Dates</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {uninvoicedCheckedOutBookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.guest.name}</td>
                  <td>{booking.property.name}</td>
                  <td>
                    {booking.check_in_date} to {booking.check_out_date}
                  </td>
                  <td>{formatCurrency(booking.total_amount)}</td>
                  <td>
                    <button
                      className="link-button"
                      disabled={invoiceBookingId === booking.id}
                      onClick={() => void generateInvoice(booking.id)}
                      type="button"
                    >
                      {invoiceBookingId === booking.id ? 'Generating...' : 'Generate invoice'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <td>{billing.booking.guest.name}</td>
                <td>{billing.booking.property.name}</td>
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
            <h3>{paymentsState.data?.meta.total ?? payments.length} payments</h3>
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
                <td>{payment.booking.guest_name}</td>
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
