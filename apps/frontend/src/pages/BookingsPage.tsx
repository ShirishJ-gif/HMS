import { Fragment, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages, PaginatedResponse } from '../api/pagination';
import { Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

type DisplayReservationGroup = ReservationGroup & {
  duplicate_reservation_ids?: string[];
  duplicate_count?: number;
};

type TimelineRow = {
  id: string;
  label: string;
  secondary: string;
  detail: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
};

export function BookingsPage() {
  const bookingsPerPage = 25;
  const todayDate = getTodayDate();
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [feedPage, setFeedPage] = useState(1);
  const [viewMode, setViewMode] = useState<'timeline' | 'ledger'>('timeline');
  const [expandedReservationGroupId, setExpandedReservationGroupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReservationRoomActionId, setPendingReservationRoomActionId] = useState<string | null>(null);
  const reservationFeedState = useAsync(
    async () =>
      (
        await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', {
          params: {
            search: search || undefined,
            property_id: propertyFilter === 'ALL' ? undefined : propertyFilter,
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            page: feedPage,
            limit: bookingsPerPage,
          },
        })
      ).data,
    [reloadKey, search, propertyFilter, statusFilter, feedPage],
  );
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const isInitialLoading =
    (reservationFeedState.loading && reservationFeedState.data == null) ||
    (propertiesState.loading && propertiesState.data == null);
  const isRefreshing = !isInitialLoading && (reservationFeedState.loading || propertiesState.loading);

  useEffect(() => {
    setFeedPage(1);
  }, [search, propertyFilter, statusFilter]);

  useEffect(() => {
    const totalPages = reservationFeedState.data?.meta.total_pages ?? 1;
    if (feedPage > totalPages) {
      setFeedPage(totalPages);
    }
  }, [feedPage, reservationFeedState.data?.meta.total_pages]);

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
  const reservationGroups = reservationFeedState.data?.data ?? [];
  const reservationFeedMeta = reservationFeedState.data?.meta;
  const displayReservationGroups = groupVisibleReservations(reservationGroups);
  const bookedCount = displayReservationGroups.filter((group) => group.reservation_status === 'BOOKED').length;
  const checkedInCount = displayReservationGroups.filter((group) => group.reservation_status === 'CHECKED_IN').length;
  const checkedOutCount = displayReservationGroups.filter((group) => group.reservation_status === 'CHECKED_OUT').length;
  const totalFeedPages = reservationFeedMeta?.total_pages ?? 1;
  const timelineRows = buildTimelineRows(displayReservationGroups);
  const timelineWindow = buildReservationTimelineWindow(timelineRows, todayDate, 30);
  const visibleTimelineRows = timelineRows.filter((stay) =>
    doesStayOverlapWindow(stay.check_in_date, stay.check_out_date, timelineWindow.startDate, timelineWindow.endDateExclusive),
  );
  const timeline = buildTimelineWindow(timelineWindow.startDate, timelineWindow.dayCount);
  const timelineGridTemplateColumns = `18rem repeat(${timeline.days.length}, 4.75rem)`;

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Reservations</h2>
          <p className="page-subtitle">
            Review imported reservations and provider bookings blocked during import from one operator ledger.
          </p>
        </div>
      </div>

      <div className="info-strip">
        <strong>HMS source of truth</strong>
        <span>
          This screen shows HMS reservations plus provider bookings that were found during sync but blocked from full import.
        </span>
      </div>

      {actionError && <p className="error">{actionError}</p>}
      {isInitialLoading ? (
        <ReservationLoadingState />
      ) : (
        <>
          <div className="channel-summary-grid booking-summary-grid">
            <SignalStat label="Booked on page" value={bookedCount.toString()} />
            <SignalStat label="Checked in on page" value={checkedInCount.toString()} />
            <SignalStat label="Checked out on page" value={checkedOutCount.toString()} />
          </div>

          {isRefreshing && <p className="muted">Refreshing reservation data...</p>}

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
              <CustomSelect
                onChange={setPropertyFilter}
                options={[
                  { label: 'All properties', value: 'ALL' },
                  ...properties.map((property) => ({
                    label: property.name,
                    value: property.id,
                  })),
                ]}
                value={propertyFilter}
              />
            </label>
            <label>
              Status
              <CustomSelect
                onChange={setStatusFilter}
                options={[
                  { label: 'All statuses', value: 'ALL' },
                  { label: 'Booked', value: 'BOOKED' },
                  { label: 'Checked in', value: 'CHECKED_IN' },
                  { label: 'Checked out', value: 'CHECKED_OUT' },
                  { label: 'Cancelled', value: 'CANCELLED' },
                ]}
                value={statusFilter}
              />
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
          {(reservationFeedState.error || propertiesState.error) && (
            <p className="error">{reservationFeedState.error ?? propertiesState.error}</p>
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
                <span className="cell-note">
                  {timelineWindow.mode === 'today'
                    ? 'Showing today through the next 30 days.'
                    : 'Showing the full reservation date span on this page because no stays overlap today.'}
                </span>
              </div>
              <div className="booking-timeline-scroll">
                <div
                  className="timeline-header-grid"
                  style={{ gridTemplateColumns: timelineGridTemplateColumns }}
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
                  {visibleTimelineRows.map((stay) => (
                    <article className="timeline-row-card" key={stay.id}>
                      <div
                        className="timeline-grid"
                        style={{ gridTemplateColumns: timelineGridTemplateColumns }}
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
            </div>
          )}

          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Reservation feed</p>
                <h3>{displayReservationGroups.length} groups on this page</h3>
              </div>
              <div className="table-heading-meta">
                <span className="cell-note">Feed page {feedPage} of {totalFeedPages}</span>
                <div className="button-row">
                  <button
                    className="secondary-button compact-button"
                    disabled={feedPage === 1}
                    onClick={() => setFeedPage((current) => Math.max(1, current - 1))}
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="cell-note">
                    Page {feedPage} / {totalFeedPages}
                  </span>
                  <button
                    className="secondary-button compact-button"
                    disabled={feedPage === totalFeedPages}
                    onClick={() => setFeedPage((current) => Math.min(totalFeedPages, current + 1))}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Source / reservation</th>
                  <th>Property</th>
                  <th>Dates</th>
                  <th>Primary guest</th>
                  <th>Rooms</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayReservationGroups.map((group) => (
                  <Fragment key={group.id}>
                    <tr>
                      <td>
                        <strong>{group.source ?? 'ZODOMUS'}</strong>
                        <br />
                        <span className="muted">{group.external_reservation_id}</span>
                        {group.duplicate_count && group.duplicate_count > 1 ? (
                          <>
                            <br />
                            <span className="cell-note">{group.duplicate_count} similar provider records grouped</span>
                          </>
                        ) : null}
                        <br />
                        <span className="cell-note">
                          {group.import_blocked
                            ? `Import blocked: ${group.import_error ?? 'Provider booking not yet imported'}`
                            : formatProviderStatus(group.external_status)}
                        </span>
                      </td>
                      <td>{group.property.name}</td>
                      <td>
                        <div className="date-stack">
                          <strong>{group.arrival_date ?? '-'}</strong>
                          <span>{group.departure_date ?? '-'}</span>
                        </div>
                      </td>
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
                        <span className="status-pill">{group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status}</span>
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
                        <td className="inline-detail-cell" colSpan={8}>
                          <ReservationFeedDetails
                            group={group}
                            pendingReservationRoomActionId={pendingReservationRoomActionId}
                            onCheckIn={checkInReservationRoom}
                            onCheckOut={checkOutReservationRoom}
                            onSendReminder={sendReservationRoomReminder}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ReservationLoadingState() {
  return (
    <div className="booking-loading-shell" aria-live="polite">
      <div className="channel-summary-grid booking-summary-grid">
        <LoadingSignalStat label="Booked" />
        <LoadingSignalStat label="Checked in" />
        <LoadingSignalStat label="Checked out" />
      </div>
      <div className="table-card booking-loading-panel">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Reservations</p>
            <h3>Loading reservation feed</h3>
          </div>
          <span className="cell-note">Fetching imported stays and blocked provider bookings.</span>
        </div>
        <div className="booking-loading-lines">
          <div className="booking-loading-line booking-loading-line-wide" />
          <div className="booking-loading-line" />
          <div className="booking-loading-line" />
          <div className="booking-loading-line" />
        </div>
      </div>
    </div>
  );
}

function LoadingSignalStat({ label }: { label: string }) {
  return (
    <div className="signal-card booking-loading-stat">
      <span>{label}</span>
      <strong className="booking-loading-value">...</strong>
    </div>
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

function ReservationFeedDetails(input: {
  group: DisplayReservationGroup;
  pendingReservationRoomActionId: string | null;
  onCheckIn: (id: string) => Promise<void>;
  onCheckOut: (id: string) => Promise<void>;
  onSendReminder: (id: string) => Promise<void>;
}) {
  const { group, pendingReservationRoomActionId, onCheckIn, onCheckOut, onSendReminder } = input;
  const assignedRooms = group.rooms.filter((room) => room.room.room_number).length;
  const checkedInRoomStays = group.rooms.filter((room) => room.reservation_status === 'CHECKED_IN').length;
  const checkedOutRoomStays = group.rooms.filter((room) => room.reservation_status === 'CHECKED_OUT').length;
  const totalNights = group.rooms.reduce(
    (sum, room) => sum + calculateNights(room.arrival_date, room.departure_date),
    0,
  );
  const groupNights =
    group.arrival_date && group.departure_date ? calculateNights(group.arrival_date, group.departure_date) : 0;

  return (
    <div className="inline-detail-panel reservation-feed-detail-shell">
      <div className="reservation-feed-detail-header">
        <div className="reservation-feed-detail-copy">
          <p className="eyebrow">{group.import_blocked ? 'Import blocker' : 'Reservation detail'}</p>
          <h3>{group.primary_guest?.name ?? 'Imported guest'}</h3>
          <p>
            {group.property.name} · {group.external_reservation_id}
            {group.arrival_date && group.departure_date ? ` · ${group.arrival_date} to ${group.departure_date}` : ''}
          </p>
        </div>
        <div className="reservation-feed-detail-badges">
          <span className={`status-pill ${group.import_blocked ? 'failed' : toneClassForStatus(group.reservation_status)}`}>
            {group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status}
          </span>
          <span className={`status-pill ${toneClassForProviderStatus(group.external_status)}`}>
            {formatProviderStatus(group.external_status)}
          </span>
        </div>
      </div>

      {group.import_blocked ? (
        <div className="reservation-feed-alert">
          <strong>Import blocked</strong>
          <span>{group.import_error ?? group.remarks ?? 'Fix mapping or inventory, then rerun the provider sync.'}</span>
        </div>
      ) : null}

      <div className="reservation-feed-stat-grid">
        <article className="reservation-feed-stat-card">
          <span>Stay window</span>
          <strong>{groupNights} nights</strong>
          <p>{group.arrival_date ?? '-'} to {group.departure_date ?? '-'}</p>
        </article>
        <article className="reservation-feed-stat-card">
          <span>Room stays</span>
          <strong>{group.rooms.length}</strong>
          <p>{totalNights} total booked nights across imported room lines</p>
        </article>
        <article className="reservation-feed-stat-card">
          <span>Assignments</span>
          <strong>{assignedRooms}/{group.rooms.length}</strong>
          <p>{checkedInRoomStays} checked in · {checkedOutRoomStays} checked out</p>
        </article>
        <article className="reservation-feed-stat-card">
          <span>Folio total</span>
          <strong>{group.total_amount == null ? '-' : formatCurrency(group.total_amount)}</strong>
          <p>{group.currency ?? 'Currency unavailable'} · {group.source ?? 'ZODOMUS'}</p>
        </article>
      </div>

      <div className="reservation-feed-meta-grid">
        <article className="reservation-feed-meta-card">
          <div className="section-heading reservation-feed-meta-heading">
            <div>
              <p className="eyebrow">Provider trace</p>
              <h3>Import metadata</h3>
            </div>
          </div>
          <dl className="reservation-feed-fact-list">
            <div>
              <dt>Source</dt>
              <dd>{group.source ?? 'ZODOMUS'}</dd>
            </div>
            <div>
              <dt>External reservation</dt>
              <dd>{group.external_reservation_id}</dd>
            </div>
            {group.duplicate_count && group.duplicate_count > 1 ? (
              <div>
                <dt>Grouped provider IDs</dt>
                <dd>{group.duplicate_reservation_ids?.join(', ') ?? group.external_reservation_id}</dd>
              </div>
            ) : null}
            <div>
              <dt>External status</dt>
              <dd>{formatProviderStatus(group.external_status)}</dd>
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
        </article>

        <article className="reservation-feed-meta-card">
          <div className="section-heading reservation-feed-meta-heading">
            <div>
              <p className="eyebrow">Operational state</p>
              <h3>{group.import_blocked ? 'Resolution guidance' : 'HMS handling'}</h3>
            </div>
          </div>
          <dl className="reservation-feed-fact-list">
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
              <dd>{assignedRooms}</dd>
            </div>
            <div>
              <dt>Checked in room stays</dt>
              <dd>{checkedInRoomStays}</dd>
            </div>
            <div>
              <dt>Checked out room stays</dt>
              <dd>{checkedOutRoomStays}</dd>
            </div>
            <div>
              <dt>Operator action</dt>
              <dd>
                {group.import_blocked
                  ? 'Fix mapping or inventory, then rerun provider sync.'
                  : 'Use room-stay actions below for check-in, reminder, or check-out.'}
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <div className="reservation-room-feed-grid">
        {group.rooms.map((room) => (
          <article className="reservation-room-card" key={room.id}>
            <div className="reservation-room-card-head">
              <div>
                <p className="eyebrow">Room line {room.external_room_reservation_id}</p>
                <h4>{room.room_category.name}</h4>
                <p>
                  Assigned room: {room.room.room_number ?? 'Not assigned'}
                  <span> · External room {room.external_room_id}</span>
                </p>
              </div>
              <span className={`status-pill ${toneClassForStatus(room.reservation_status)}`}>{room.reservation_status}</span>
            </div>

            <div className="reservation-room-chip-grid">
              <div className="reservation-room-chip">
                <span>Stay</span>
                <strong>{room.arrival_date} to {room.departure_date}</strong>
                <p>{calculateNights(room.arrival_date, room.departure_date)} nights</p>
              </div>
              <div className="reservation-room-chip">
                <span>Rate plan</span>
                <strong>{room.rate_plan.name}</strong>
                <p>{formatCurrency(room.rate_plan.base_rate)}</p>
              </div>
              <div className="reservation-room-chip">
                <span>Guest mix</span>
                <strong>{room.guest_name ?? group.primary_guest?.name ?? '-'}</strong>
                <p>{room.adults ?? 0} adults / {room.children ?? 0} children</p>
              </div>
              <div className="reservation-room-chip">
                <span>Total</span>
                <strong>{room.total_amount == null ? '-' : formatCurrency(room.total_amount)}</strong>
                <p>{room.currency ?? group.currency ?? 'Currency unavailable'}</p>
              </div>
            </div>

            <div className="reservation-room-card-actions">
              {!group.import_blocked && room.reservation_status === 'BOOKED' && (
                <button
                  className="link-button compact-button"
                  disabled={pendingReservationRoomActionId === room.id}
                  onClick={() => void onCheckIn(room.id)}
                  type="button"
                >
                  {pendingReservationRoomActionId === room.id ? 'Processing...' : 'Check in'}
                </button>
              )}
              {!group.import_blocked && room.reservation_status === 'CHECKED_IN' && (
                <button
                  className="link-button compact-button"
                  disabled={pendingReservationRoomActionId === room.id}
                  onClick={() => void onCheckOut(room.id)}
                  type="button"
                >
                  {pendingReservationRoomActionId === room.id ? 'Processing...' : 'Check out'}
                </button>
              )}
              {!group.import_blocked && room.reservation_status === 'BOOKED' && (
                <button
                  className="secondary-button compact-button"
                  disabled={pendingReservationRoomActionId === room.id}
                  onClick={() => void onSendReminder(room.id)}
                  type="button"
                >
                  {pendingReservationRoomActionId === room.id ? 'Processing...' : 'Send reminder'}
                </button>
              )}
              {group.import_blocked && <span className="cell-note">{group.import_error ?? 'Import blocked'}</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
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
  startDate: string,
  dayCount: number,
) {
  return {
    days: buildDateRange(startDate, addDays(startDate, dayCount)).map((date) => ({
      date,
      label: formatLongDate(date),
      dayLabel: formatDay(date),
      shortDate: formatShortDate(date),
    })),
  };
}

function buildReservationTimelineWindow(
  rows: Array<{ check_in_date: string; check_out_date: string }>,
  todayDate: string,
  minimumDayCount: number,
) {
  const todayWindowEndDateExclusive = addDays(todayDate, minimumDayCount);
  const hasVisibleRowsInTodayWindow = rows.some((stay) =>
    doesStayOverlapWindow(stay.check_in_date, stay.check_out_date, todayDate, todayWindowEndDateExclusive),
  );

  if (hasVisibleRowsInTodayWindow || rows.length === 0) {
    return {
      startDate: todayDate,
      endDateExclusive: todayWindowEndDateExclusive,
      dayCount: minimumDayCount,
      mode: 'today' as const,
    };
  }

  const earliestCheckInDate = rows.reduce(
    (earliest, row) => (row.check_in_date < earliest ? row.check_in_date : earliest),
    rows[0].check_in_date,
  );
  const latestCheckOutDate = rows.reduce(
    (latest, row) => (row.check_out_date > latest ? row.check_out_date : latest),
    rows[0].check_out_date,
  );
  const dayCount = Math.max(minimumDayCount, diffDays(earliestCheckInDate, latestCheckOutDate));

  return {
    startDate: earliestCheckInDate,
    endDateExclusive: addDays(earliestCheckInDate, dayCount),
    dayCount,
    mode: 'data' as const,
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

function diffDays(startDate: string, endDateExclusive: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDateExclusive}T00:00:00.000Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function isDateWithinStay(date: string, checkInDate: string, checkOutDate: string) {
  return date >= checkInDate && date < checkOutDate;
}

function doesStayOverlapWindow(
  checkInDate: string,
  checkOutDate: string,
  windowStartDate: string,
  windowEndDateExclusive: string,
) {
  return checkInDate < windowEndDateExclusive && checkOutDate > windowStartDate;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
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

function formatProviderStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return 'Provider status unavailable';
  }

  if (normalized === '1' || normalized === 'booked' || normalized === 'confirmed') {
    return 'Booked';
  }

  if (normalized === '2' || normalized === 'modified' || normalized === 'updated') {
    return 'Modified';
  }

  if (normalized === '3' || normalized === 'cancelled' || normalized === 'canceled') {
    return 'Cancelled';
  }

  return status ?? 'Provider status unavailable';
}

function toneClassForStatus(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) {
    return 'neutral';
  }

  if (normalized === 'CHECKED_IN') {
    return 'available';
  }

  if (normalized === 'BOOKED' || normalized === 'CHECKED_OUT') {
    return 'queued';
  }

  if (normalized === 'CANCELLED') {
    return 'failed';
  }

  return 'neutral';
}

function toneClassForProviderStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return 'neutral';
  }

  if (normalized === '1' || normalized === 'booked' || normalized === 'confirmed') {
    return 'queued';
  }

  if (normalized === '2' || normalized === 'modified' || normalized === 'updated') {
    return 'maintenance';
  }

  if (normalized === '3' || normalized === 'cancelled' || normalized === 'canceled') {
    return 'failed';
  }

  return 'neutral';
}

function buildTimelineRows(groups: DisplayReservationGroup[]): TimelineRow[] {
  return groups.flatMap((group) => {
    const groupedRows = new Map<
      string,
      {
        firstRoomId: string;
        label: string;
        secondary: string;
        roomCategoryName: string;
        totalAmountLabel: string;
        checkInDate: string;
        checkOutDate: string;
        status: string;
        count: number;
      }
    >();

    for (const room of group.rooms) {
      if (!shouldShowRoomInTimeline(room.reservation_status)) {
        continue;
      }

      const label =
        room.guest_name ??
        group.primary_guest?.name ??
        group.external_reservation_id;
      const totalAmountLabel = room.total_amount == null ? '-' : formatCurrency(room.total_amount);
      const key = [
        label,
        group.property.id,
        group.external_reservation_id,
        room.room_category.id,
        totalAmountLabel,
        room.arrival_date,
        room.departure_date,
        room.reservation_status,
      ].join('::');
      const existing = groupedRows.get(key);

      if (existing) {
        existing.count += 1;
        continue;
      }

      groupedRows.set(key, {
        firstRoomId: room.id,
        label,
        secondary: `${group.property.name} · ${group.external_reservation_id}`,
        roomCategoryName: room.room_category.name,
        totalAmountLabel,
        checkInDate: room.arrival_date,
        checkOutDate: room.departure_date,
        status: room.reservation_status,
        count: 1,
      });
    }

    return Array.from(groupedRows.values()).map((row) => ({
      id: `reservation-room:${row.firstRoomId}`,
      label: row.label,
      secondary: row.secondary,
      detail: `${row.roomCategoryName}${row.count > 1 ? ` x${row.count}` : ''} · ${row.totalAmountLabel}`,
      check_in_date: row.checkInDate,
      check_out_date: row.checkOutDate,
      status: row.status,
    }));
  });
}

function shouldShowRoomInTimeline(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase();
  return normalized === 'BOOKED' || normalized === 'CHECKED_IN';
}

function groupVisibleReservations(groups: ReservationGroup[]): DisplayReservationGroup[] {
  const groupedBlocked = new Map<string, DisplayReservationGroup>();
  const groupedImported = new Map<string, DisplayReservationGroup>();
  const importedSignatures = new Set(
    groups
      .filter((group) => !group.import_blocked)
      .map((group) => buildReservationOperationalSignature(group)),
  );
  const visible: DisplayReservationGroup[] = [];

  for (const group of groups) {
    if (!group.import_blocked) {
      const importedDuplicateSignature = buildImportedDuplicateSignature(group);
      const existingImported = groupedImported.get(importedDuplicateSignature);

      if (existingImported) {
        existingImported.duplicate_reservation_ids = [
          ...(existingImported.duplicate_reservation_ids ?? [existingImported.external_reservation_id]),
          group.external_reservation_id,
        ];
        existingImported.duplicate_count = (existingImported.duplicate_count ?? 1) + 1;
        continue;
      }

      const firstImported: DisplayReservationGroup = {
        ...group,
        duplicate_reservation_ids: [group.external_reservation_id],
        duplicate_count: 1,
      };
      groupedImported.set(importedDuplicateSignature, firstImported);
      visible.push(firstImported);
      continue;
    }

    const operationalSignature = buildReservationOperationalSignature(group);
    if (importedSignatures.has(operationalSignature)) {
      continue;
    }

    const signature = `${operationalSignature}::${(group.import_error ?? '').trim().toLowerCase()}`;
    const existing = groupedBlocked.get(signature);

    if (!existing) {
      const first: DisplayReservationGroup = {
        ...group,
        duplicate_reservation_ids: [group.external_reservation_id],
        duplicate_count: 1,
      };
      groupedBlocked.set(signature, first);
      visible.push(first);
      continue;
    }

    existing.duplicate_reservation_ids = [
      ...(existing.duplicate_reservation_ids ?? [existing.external_reservation_id]),
      group.external_reservation_id,
    ];
    existing.duplicate_count = (existing.duplicate_count ?? 1) + 1;
  }

  return visible;
}

function buildImportedDuplicateSignature(group: ReservationGroup) {
  const guest = (group.primary_guest?.name ?? '').trim().toLowerCase();
  const arrival = group.arrival_date ?? '';
  const departure = group.departure_date ?? '';
  const roomLines = group.rooms
    .map(
      (room) =>
        `${room.external_room_reservation_id}:${room.external_room_id}:${room.arrival_date}:${room.departure_date}`,
    )
    .sort()
    .join('|');

  return [group.property.id, guest, arrival, departure, roomLines].join('::');
}

function buildBlockedReservationSignature(group: ReservationGroup) {
  const operationalSignature = buildReservationOperationalSignature(group);
  const importError = (group.import_error ?? '').trim().toLowerCase();

  return `${operationalSignature}::${importError}`;
}

function buildReservationOperationalSignature(group: ReservationGroup) {
  const guest = (group.primary_guest?.name ?? '').trim().toLowerCase();
  const arrival = group.arrival_date ?? '';
  const departure = group.departure_date ?? '';
  const roomShape = group.rooms
    .map((room) => `${room.external_room_id}:${room.arrival_date}:${room.departure_date}`)
    .sort()
    .join('|');

  return [group.property.id, guest, arrival, departure, roomShape].join('::');
}
