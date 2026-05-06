import { Fragment, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { Property, ReservationGroup } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

export function BookingsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'timeline' | 'ledger'>('timeline');
  const [expandedReservationGroupId, setExpandedReservationGroupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReservationRoomActionId, setPendingReservationRoomActionId] = useState<string | null>(null);
  const reservationGroupsState = useAsync(
    async () =>
      (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/groups', { params: { search: search || undefined } })).data,
    [reloadKey, search],
  );
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );

  async function checkInReservationRoom(id: string) {
    setActionError(null);
    setPendingReservationRoomActionId(id);

    try {
      await api.put(`/bookings/groups/rooms/${id}/checkin`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingReservationRoomActionId(null);
    }
  }

  async function checkOutReservationRoom(id: string) {
    setActionError(null);
    setPendingReservationRoomActionId(id);

    try {
      await api.put(`/bookings/groups/rooms/${id}/checkout`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingReservationRoomActionId(null);
    }
  }

  async function sendReservationRoomReminder(id: string) {
    setActionError(null);
    setPendingReservationRoomActionId(id);

    try {
      await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingReservationRoomActionId(null);
    }
  }

  const properties = propertiesState.data ?? [];
  const reservationGroups = (reservationGroupsState.data?.data ?? []).filter((group) => {
    if (propertyFilter !== 'ALL' && group.property.id !== propertyFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && group.reservation_status !== statusFilter) {
      return false;
    }

    return true;
  });
  const bookedCount = reservationGroups.filter((group) => group.reservation_status === 'BOOKED').length;
  const checkedInCount = reservationGroups.filter((group) => group.reservation_status === 'CHECKED_IN').length;
  const checkedOutCount = reservationGroups.filter((group) => group.reservation_status === 'CHECKED_OUT').length;
  const timelineRows = [
    ...reservationGroups.flatMap((group) =>
      group.rooms.map((room) => ({
        id: `reservation-room:${room.id}`,
        label: room.guest_name ?? group.primary_guest?.name ?? group.external_reservation_id,
        secondary: `${group.property.name} · ${group.external_reservation_id}`,
        detail: `${room.room_category.name} · ${room.total_amount == null ? '-' : formatCurrency(room.total_amount)}`,
        check_in_date: room.arrival_date,
        check_out_date: room.departure_date,
        status: room.reservation_status,
      })),
    ),
  ];
  const timeline = buildTimelineWindow(timelineRows, 14);

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reservations</p>
          <h2>Reservations</h2>
          <p className="page-subtitle">Review imported reservations, manage room assignment at arrival, and track reservation status from one ledger.</p>
        </div>
      </div>

      <div className="channel-summary-grid booking-summary-grid">
        <SignalStat label="Booked" value={bookedCount.toString()} />
        <SignalStat label="Checked in" value={checkedInCount.toString()} />
        <SignalStat label="Checked out" value={checkedOutCount.toString()} />
      </div>

      {actionError && <p className="error">{actionError}</p>}

      {(reservationGroupsState.loading || propertiesState.loading) && (
        <p className="muted">Loading reservation data...</p>
      )}

      <FilterBar title="Reservation filters">
        <label>
          Search reservations
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
      {(reservationGroupsState.error || propertiesState.error) && (
        <p className="error">{reservationGroupsState.error ?? propertiesState.error}</p>
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
            <div className="timeline-header-title">Reservation room</div>
            {timeline.days.map((day) => (
              <div className="timeline-header-day" key={day.date}>
                <strong>{day.dayLabel}</strong>
                <span>{day.shortDate}</span>
              </div>
            ))}
          </div>
          <div className="timeline-body">
            {timelineRows.map((stay) => (
              <article className="timeline-row-card" key={stay.id}>
                <div
                  className="timeline-grid"
                  style={{ gridTemplateColumns: `18rem repeat(${timeline.days.length}, minmax(2.3rem, 1fr))` }}
                >
                  <div className="timeline-row-summary">
                    <strong>{stay.label}</strong>
                    <span>{stay.secondary}</span>
                    <span className="cell-note">{stay.detail}</span>
                  </div>
                  {timeline.days.map((day) => {
                    const occupied = isDateWithinStay(day.date, stay.check_in_date, stay.check_out_date);
                    return (
                      <div className={occupied ? 'timeline-cell occupied' : 'timeline-cell'} key={`${stay.id}-${day.date}`}>
                        {occupied ? <span className={`timeline-cell-status ${stay.status.toLowerCase()}`} /> : null}
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
            <p className="eyebrow">Imported OTA reservations</p>
            <h3>{reservationGroups.length} reservation groups</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Source / reservation</th>
              <th>Property</th>
              <th>Primary guest</th>
              <th>Rooms</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reservationGroups.map((group) => (
              <Fragment key={group.id}>
                <tr>
                  <td>
                    <strong>{group.source ?? 'ZODOMUS'}</strong>
                    <br />
                    <span className="muted">{group.external_reservation_id}</span>
                    <br />
                    <span className="cell-note">{group.external_status ?? 'Provider status unavailable'}</span>
                  </td>
                  <td>{group.property.name}</td>
                  <td>
                    {group.primary_guest?.name ?? 'Imported guest'}
                    <br />
                    <span className="muted">{group.primary_guest?.phone ?? '-'}</span>
                  </td>
                  <td>
                    {group.rooms.length} room{group.rooms.length === 1 ? '' : 's'}
                    <br />
                    <span className="muted">
                      {group.rooms
                        .map((room) => room.room_category.name)
                        .filter((value, index, array) => array.indexOf(value) === index)
                        .join(', ')}
                    </span>
                  </td>
                  <td>{group.total_amount == null ? '-' : formatCurrency(group.total_amount)}</td>
                  <td>
                    <span className="status-pill">{group.reservation_status}</span>
                  </td>
                  <td>
                    <button
                      className="secondary-button compact-button"
                      onClick={() =>
                        setExpandedReservationGroupId((current) => (current === group.id ? null : group.id))
                      }
                      type="button"
                    >
                      {expandedReservationGroupId === group.id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expandedReservationGroupId === group.id && (
                  <tr>
                    <td className="inline-detail-cell" colSpan={7}>
                      <div className="inline-detail-panel">
                        <div className="split-panels">
                          <div className="mapping-card">
                            <div className="section-heading">
                              <div>
                                <p className="eyebrow">Import trace</p>
                                <h3>Provider metadata</h3>
                              </div>
                            </div>
                            <dl className="detail-list">
                              <div>
                                <dt>Source</dt>
                                <dd>{group.source ?? 'ZODOMUS'}</dd>
                              </div>
                              <div>
                                <dt>External reservation</dt>
                                <dd>{group.external_reservation_id}</dd>
                              </div>
                              <div>
                                <dt>External status</dt>
                                <dd>{group.external_status ?? '-'}</dd>
                              </div>
                              <div>
                                <dt>Booked at</dt>
                                <dd>{group.booked_at ? formatDateTime(group.booked_at) : '-'}</dd>
                              </div>
                              <div>
                                <dt>Modified at</dt>
                                <dd>{group.modified_at ? formatDateTime(group.modified_at) : '-'}</dd>
                              </div>
                            </dl>
                          </div>
                          <div className="mapping-card">
                            <div className="section-heading">
                              <div>
                                <p className="eyebrow">Operational state</p>
                                <h3>HMS handling</h3>
                              </div>
                            </div>
                            <dl className="detail-list">
                              <div>
                                <dt>Reservation status</dt>
                                <dd>{group.reservation_status}</dd>
                              </div>
                              <div>
                                <dt>Rooms in group</dt>
                                <dd>{group.rooms.length}</dd>
                              </div>
                              <div>
                                <dt>Assigned rooms</dt>
                                <dd>{group.rooms.filter((room) => room.room.room_number).length}</dd>
                              </div>
                              <div>
                                <dt>Checked in room stays</dt>
                                <dd>{group.rooms.filter((room) => room.reservation_status === 'CHECKED_IN').length}</dd>
                              </div>
                              <div>
                                <dt>Checked out room stays</dt>
                                <dd>{group.rooms.filter((room) => room.reservation_status === 'CHECKED_OUT').length}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                        <dl className="detail-list">
                          <div>
                            <dt>External status</dt>
                            <dd>{group.external_status ?? '-'}</dd>
                          </div>
                          <div>
                            <dt>Currency</dt>
                            <dd>{group.currency ?? '-'}</dd>
                          </div>
                          <div>
                            <dt>Booked at</dt>
                            <dd>{group.booked_at ? formatDateTime(group.booked_at) : '-'}</dd>
                          </div>
                          <div>
                            <dt>Modified at</dt>
                            <dd>{group.modified_at ? formatDateTime(group.modified_at) : '-'}</dd>
                          </div>
                        </dl>
                        <div className="table-card embedded-table-card">
                          <div className="table-heading">
                            <div>
                              <p className="eyebrow">Room lines</p>
                              <h3>{group.rooms.length} imported stays</h3>
                            </div>
                          </div>
                          <table>
                            <thead>
                              <tr>
                                <th>Room line</th>
                                <th>Category / Room</th>
                                <th>Dates</th>
                                <th>Rate</th>
                                <th>Total</th>
                                <th>Guests</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rooms.map((room) => (
                                <tr key={room.id}>
                                  <td>
                                    <strong>{room.external_room_reservation_id}</strong>
                                    <br />
                                    <span className="muted">External room: {room.external_room_id}</span>
                                  </td>
                                  <td>
                                    {room.room_category.name}
                                    <br />
                                    <span className="muted">Assigned: {room.room.room_number ?? 'Not assigned'}</span>
                                  </td>
                                  <td>
                                    <div className="date-stack">
                                      <strong>{room.arrival_date}</strong>
                                      <span>{room.departure_date}</span>
                                    </div>
                                  </td>
                                  <td>
                                    {room.rate_plan.name}
                                    <br />
                                    <span className="muted">{formatCurrency(room.rate_plan.base_rate)}</span>
                                  </td>
                                  <td>{room.total_amount == null ? '-' : formatCurrency(room.total_amount)}</td>
                                  <td>
                                    {room.guest_name ?? group.primary_guest?.name ?? '-'}
                                    <br />
                                    <span className="muted">
                                      {room.adults ?? 0} adults / {room.children ?? 0} children
                                    </span>
                                  </td>
                                  <td>
                                    <span className="status-pill">{room.reservation_status}</span>
                                    <div className="compact-action-row">
                                      {room.reservation_status === 'BOOKED' && (
                                        <button
                                          className="link-button compact-button"
                                          disabled={pendingReservationRoomActionId === room.id}
                                          onClick={() => void checkInReservationRoom(room.id)}
                                          type="button"
                                        >
                                          {pendingReservationRoomActionId === room.id ? 'Processing...' : 'Check in'}
                                        </button>
                                      )}
                                      {room.reservation_status === 'CHECKED_IN' && (
                                        <button
                                          className="link-button compact-button"
                                          disabled={pendingReservationRoomActionId === room.id}
                                          onClick={() => void checkOutReservationRoom(room.id)}
                                          type="button"
                                        >
                                          {pendingReservationRoomActionId === room.id ? 'Processing...' : 'Check out'}
                                        </button>
                                      )}
                                      {room.reservation_status === 'BOOKED' && (
                                        <button
                                          className="secondary-button compact-button"
                                          disabled={pendingReservationRoomActionId === room.id}
                                          onClick={() => void sendReservationRoomReminder(room.id)}
                                          type="button"
                                        >
                                          {pendingReservationRoomActionId === room.id ? 'Processing...' : 'Send reminder'}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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

function buildTimelineWindow(
  stays: Array<{
    check_in_date: string;
    check_out_date: string;
  }>,
  maxDays: number,
) {
  if (stays.length === 0) {
    return { days: [] as Array<{ date: string; label: string; dayLabel: string; shortDate: string }>, truncated: false };
  }

  const sortedDates = stays
    .flatMap((stay) => [stay.check_in_date, stay.check_out_date])
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
