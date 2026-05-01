import { FormEvent, Fragment, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { Booking, Guest, Property, RatePlan, RoomCategory } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

const defaultForm = {
  property_id: '',
  guest_id: '',
  room_category_id: '',
  rate_plan_id: '',
  check_in_date: '',
  check_out_date: '',
};

export function BookingsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'timeline' | 'ledger'>('timeline');
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingBookingActionId, setPendingBookingActionId] = useState<string | null>(null);
  const bookingsState = useAsync(
    async () => (await api.get<PaginatedResponse<Booking>>('/bookings', { params: { search: search || undefined } })).data,
    [reloadKey, search],
  );
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const guestsState = useAsync(async () => (await api.get<PaginatedResponse<Guest>>('/guests', { params: { limit: 100 } })).data, []);
  const categoriesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<RoomCategory>>('/room-categories', { params: { limit: 100 } })).data),
    [],
  );
  const ratePlansState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<RatePlan>>('/rate-plans', { params: { limit: 100 } })).data),
    [],
  );

  async function submitBooking(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setSubmitting(true);

    try {
      await api.post('/bookings', form);
      setForm(defaultForm);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function checkIn(id: string) {
    setActionError(null);
    setPendingBookingActionId(id);

    try {
      await api.put(`/bookings/${id}/checkin`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingBookingActionId(null);
    }
  }

  async function checkOut(id: string) {
    setActionError(null);
    setPendingBookingActionId(id);

    try {
      await api.put(`/bookings/${id}/checkout`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingBookingActionId(null);
    }
  }

  const guests = guestsState.data?.data ?? [];
  const properties = propertiesState.data ?? [];
  const categories = categoriesState.data ?? [];
  const ratePlans = ratePlansState.data ?? [];
  const bookings = (bookingsState.data?.data ?? []).filter((booking) => {
    if (propertyFilter !== 'ALL' && booking.property.id !== propertyFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && booking.booking_status !== statusFilter) {
      return false;
    }

    return true;
  });
  const selectedRatePlan = ratePlans.find((ratePlan) => ratePlan.id === form.rate_plan_id);
  const estimatedNights = calculateNights(form.check_in_date, form.check_out_date);
  const estimatedBaseTotal =
    selectedRatePlan && estimatedNights > 0 ? selectedRatePlan.base_rate * estimatedNights : null;
  const bookedCount = bookings.filter((booking) => booking.booking_status === 'BOOKED').length;
  const checkedInCount = bookings.filter((booking) => booking.booking_status === 'CHECKED_IN').length;
  const checkedOutCount = bookings.filter((booking) => booking.booking_status === 'CHECKED_OUT').length;
  const timeline = buildTimelineWindow(bookings, 14);

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reservations</p>
          <h2>Bookings</h2>
          <p className="page-subtitle">Create reservations, manage room assignment at arrival, and track reservation status from one ledger.</p>
        </div>
      </div>

      <div className="booking-layout">
        <form className="card booking-form-card" onSubmit={submitBooking}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">New reservation</p>
              <h3>Create booking</h3>
            </div>
          </div>
          <div className="form-grid booking-form-grid">
            <label>
              Property
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    property_id: event.target.value,
                    guest_id: '',
                    room_category_id: '',
                    rate_plan_id: '',
                  })
                }
                required
                value={form.property_id}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Guest
              <select
                onChange={(event) => setForm({ ...form, guest_id: event.target.value })}
                required
                value={form.guest_id}
              >
                <option value="">Select guest</option>
                {guests
                  .filter((guest) => !form.property_id || guest.property_id === form.property_id)
                  .map((guest) => (
                    <option key={guest.id} value={guest.id}>
                      {guest.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Category
              <select
                onChange={(event) => setForm({ ...form, room_category_id: event.target.value, rate_plan_id: '' })}
                required
                value={form.room_category_id}
              >
                <option value="">Select category</option>
                {categories
                  .filter((category) => !form.property_id || category.property_id === form.property_id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Rate plan
              <select
                onChange={(event) => setForm({ ...form, rate_plan_id: event.target.value })}
                required
                value={form.rate_plan_id}
              >
                <option value="">Select rate</option>
                {ratePlans
                  .filter(
                    (ratePlan) =>
                      (!form.property_id || ratePlan.property_id === form.property_id) &&
                      (!form.room_category_id || ratePlan.room_category_id === form.room_category_id),
                  )
                  .map((ratePlan) => (
                    <option key={ratePlan.id} value={ratePlan.id}>
                      {ratePlan.name} - {formatCurrency(ratePlan.base_rate)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Check-in
              <input
                onChange={(event) => setForm({ ...form, check_in_date: event.target.value })}
                placeholder="2026-05-01"
                required
                type="date"
                value={form.check_in_date}
              />
            </label>
            <label>
              Check-out
              <input
                onChange={(event) => setForm({ ...form, check_out_date: event.target.value })}
                placeholder="2026-05-03"
                required
                type="date"
                value={form.check_out_date}
              />
            </label>
          </div>
          <div className="booking-form-footer">
            <button className="primary-button" type="submit">
              {submitting ? 'Creating...' : 'Create booking'}
            </button>
          </div>
        </form>

        <aside className="booking-sidepanel">
          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Reservation mix</p>
                <h3>Status snapshot</h3>
              </div>
            </div>
            <div className="signal-grid compact-signal-grid">
              <SignalStat label="Booked" value={bookedCount.toString()} />
              <SignalStat label="Checked in" value={checkedInCount.toString()} />
              <SignalStat label="Checked out" value={checkedOutCount.toString()} />
            </div>
          </article>

          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Quote context</p>
                <h3>Current selection</h3>
              </div>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Rate plan</dt>
                <dd>{selectedRatePlan?.name ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt>Base rate</dt>
                <dd>{selectedRatePlan ? formatCurrency(selectedRatePlan.base_rate) : '-'}</dd>
              </div>
              <div>
                <dt>Nights</dt>
                <dd>{estimatedNights > 0 ? estimatedNights : '-'}</dd>
              </div>
              <div>
                <dt>Base total</dt>
                <dd>{estimatedBaseTotal == null ? '-' : formatCurrency(estimatedBaseTotal)}</dd>
              </div>
            </dl>
            <p className="muted booking-note">
              Final booking totals apply active dynamic pricing rules at confirmation time.
            </p>
          </article>
        </aside>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      {(bookingsState.loading ||
        propertiesState.loading ||
        guestsState.loading ||
        categoriesState.loading ||
        ratePlansState.loading) && (
        <p className="muted">Loading booking data...</p>
      )}

      <FilterBar title="Reservation filters">
        <label>
          Search bookings
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Guest, phone, property, category, or room"
            value={search}
          />
        </label>
        <label>
          Property
          <select onChange={(event) => setPropertyFilter(event.target.value)} value={propertyFilter}>
            <option value="ALL">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="ALL">All statuses</option>
            <option value="BOOKED">Booked</option>
            <option value="CHECKED_IN">Checked in</option>
            <option value="CHECKED_OUT">Checked out</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </FilterBar>
      <div className="view-switch">
        <button
          className={viewMode === 'timeline' ? 'secondary-button active-toggle' : 'secondary-button'}
          onClick={() => setViewMode('timeline')}
          type="button"
        >
          Timeline
        </button>
        <button
          className={viewMode === 'ledger' ? 'secondary-button active-toggle' : 'secondary-button'}
          onClick={() => setViewMode('ledger')}
          type="button"
        >
          Ledger
        </button>
      </div>
      {(bookingsState.error ||
        propertiesState.error ||
        guestsState.error ||
        categoriesState.error ||
        ratePlansState.error) && (
        <p className="error">
          {bookingsState.error ??
            propertiesState.error ??
            guestsState.error ??
            categoriesState.error ??
            ratePlansState.error}
        </p>
      )}

      {viewMode === 'timeline' && timeline.days.length > 0 && (
        <div className="booking-timeline-board">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Reservation timeline</p>
              <h3>
                {timeline.days[0].label} to {timeline.days[timeline.days.length - 1].label}
              </h3>
            </div>
            {timeline.truncated && <span className="cell-note">Showing the first 14 nights in the visible reservation window.</span>}
          </div>
          <div
            className="timeline-header-grid"
            style={{ gridTemplateColumns: `18rem repeat(${timeline.days.length}, minmax(2.3rem, 1fr))` }}
          >
            <div className="timeline-header-title">Booking</div>
            {timeline.days.map((day) => (
              <div className="timeline-header-day" key={day.date}>
                <strong>{day.dayLabel}</strong>
                <span>{day.shortDate}</span>
              </div>
            ))}
          </div>
          <div className="timeline-body">
            {bookings.map((booking) => (
              <article className="timeline-row-card" key={booking.id}>
                <div
                  className="timeline-grid"
                  style={{ gridTemplateColumns: `18rem repeat(${timeline.days.length}, minmax(2.3rem, 1fr))` }}
                >
                  <div className="timeline-row-summary">
                    <strong>{booking.guest.name}</strong>
                    <span>{booking.property.name}</span>
                    <span className="cell-note">
                      {booking.room_category.name} · {formatCurrency(booking.total_amount)}
                    </span>
                  </div>
                  {timeline.days.map((day) => {
                    const occupied = isDateWithinStay(day.date, booking.check_in_date, booking.check_out_date);
                    return (
                      <div className={occupied ? 'timeline-cell occupied' : 'timeline-cell'} key={`${booking.id}-${day.date}`}>
                        {occupied ? <span className={`timeline-cell-status ${booking.booking_status.toLowerCase()}`} /> : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Reservation ledger</p>
            <h3>{bookings.length} bookings</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Property</th>
              <th>Category / Room</th>
              <th>Dates</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <Fragment key={booking.id}>
                <tr>
                  <td>{booking.guest.name}</td>
                  <td>{booking.property.name}</td>
                  <td>
                    {booking.room_category.name}
                    <br />
                    <span className="muted">Assigned: {booking.room.room_number ?? 'At check-in'}</span>
                  </td>
                  <td>
                    <div className="date-stack">
                      <strong>{booking.check_in_date}</strong>
                      <span>{booking.check_out_date}</span>
                    </div>
                  </td>
                  <td>{formatCurrency(booking.total_amount)}</td>
                  <td>
                    <span className="status-pill">{booking.booking_status}</span>
                  </td>
                  <td>
                    <div className="compact-action-row">
                      <button
                        className="secondary-button compact-button"
                        onClick={() => setExpandedBookingId((current) => (current === booking.id ? null : booking.id))}
                        type="button"
                      >
                        {expandedBookingId === booking.id ? 'Hide' : 'Details'}
                      </button>
                      {booking.booking_status === 'BOOKED' && (
                        <button
                          className="link-button compact-button"
                          disabled={pendingBookingActionId === booking.id}
                          onClick={() => void checkIn(booking.id)}
                          type="button"
                        >
                          {pendingBookingActionId === booking.id ? 'Processing...' : 'Check in'}
                        </button>
                      )}
                      {booking.booking_status === 'CHECKED_IN' && (
                        <button
                          className="link-button compact-button"
                          disabled={pendingBookingActionId === booking.id}
                          onClick={() => void checkOut(booking.id)}
                          type="button"
                        >
                          {pendingBookingActionId === booking.id ? 'Processing...' : 'Check out'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedBookingId === booking.id && (
                  <tr>
                    <td className="inline-detail-cell" colSpan={7}>
                      <div className="inline-detail-panel">
                        <dl className="detail-list">
                          <div>
                            <dt>Guest phone</dt>
                            <dd>{booking.guest.phone}</dd>
                          </div>
                          <div>
                            <dt>Guest email</dt>
                            <dd>{booking.guest.email ?? '-'}</dd>
                          </div>
                          <div>
                            <dt>Rate plan</dt>
                            <dd>{booking.rate_plan.name}</dd>
                          </div>
                          <div>
                            <dt>Assigned room</dt>
                            <dd>{booking.room.room_number ?? 'At check-in'}</dd>
                          </div>
                        </dl>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SignalStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function calculateNights(checkInDate: string, checkOutDate: string) {
  if (!checkInDate || !checkOutDate) {
    return 0;
  }

  const start = new Date(`${checkInDate}T00:00:00.000Z`);
  const end = new Date(`${checkOutDate}T00:00:00.000Z`);
  const diff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);

  return Number.isInteger(diff) && diff > 0 ? diff : 0;
}

function buildTimelineWindow(bookings: Booking[], maxDays: number) {
  if (bookings.length === 0) {
    return { days: [] as Array<{ date: string; label: string; dayLabel: string; shortDate: string }>, truncated: false };
  }

  const sortedDates = bookings
    .flatMap((booking) => [booking.check_in_date, booking.check_out_date])
    .sort((left, right) => left.localeCompare(right));
  const start = sortedDates[0];
  const end = addDays(start, maxDays);
  const lastCheckout = sortedDates[sortedDates.length - 1];

  return {
    days: buildDateRange(start, end).map((date) => ({
      date,
      label: formatLongDate(date),
      dayLabel: formatDay(date),
      shortDate: formatShortDate(date),
    })),
    truncated: lastCheckout > end,
  };
}

function buildDateRange(startDate: string, endDateExclusive: string) {
  const dates: string[] = [];
  let current = startDate;

  while (current < endDateExclusive) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function addDays(date: string, days: number) {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function isDateWithinStay(date: string, checkInDate: string, checkOutDate: string) {
  return date >= checkInDate && date < checkOutDate;
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' });
}

function formatShortDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLongDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
