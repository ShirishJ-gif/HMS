import { Fragment, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse } from '../api/pagination';
import { ReservationGroup } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { ReservationsTimelinePage } from './ReservationsTimelinePage';
import { MetricCard, StatusBadge, TableCard, Th, Td, secondaryBtn, linkBtn, ErrorMsg } from './ui';

type DisplayReservationGroup = ReservationGroup & { duplicate_reservation_ids?: string[]; duplicate_count?: number };

type TimelineRow = { id: string; label: string; secondary: string; detail: string; check_in_date: string; check_out_date: string; status: string };

export function BookingsPage() {
  const bookingsPerPage = 10;
  const todayDate = getTodayDate();
  const [fullViewOpen, setFullViewOpen] = useState(() => isFullReservationsRoute());
  const [reloadKey, setReloadKey] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const [viewMode, setViewMode] = useState<'timeline' | 'ledger'>('timeline');
  const [expandedReservationGroupId, setExpandedReservationGroupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReservationRoomActionId, setPendingReservationRoomActionId] = useState<string | null>(null);
  const reservationFeedState = useAsync(async () => (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', { params: { page: feedPage, limit: bookingsPerPage } })).data, [reloadKey, feedPage]);
  const isInitialLoading = reservationFeedState.loading && reservationFeedState.data == null;

  useEffect(() => { const totalPages = reservationFeedState.data?.meta.total_pages ?? 1; if (feedPage > totalPages) setFeedPage(totalPages); }, [feedPage, reservationFeedState.data?.meta.total_pages]);
  useEffect(() => {
    function handlePopState() {
      setFullViewOpen(isFullReservationsRoute());
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function openFullReservationsView() {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('reservations', 'all');
    window.history.pushState({}, '', nextUrl);
    setFullViewOpen(true);
  }

  function closeFullReservationsView() {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('reservations');
    window.history.pushState({}, '', nextUrl);
    setFullViewOpen(false);
  }

  async function checkInReservationRoom(id: string) {
    setActionError(null); setPendingReservationRoomActionId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkin`); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); } finally { setPendingReservationRoomActionId(null); }
  }
  async function checkOutReservationRoom(id: string) {
    setActionError(null); setPendingReservationRoomActionId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkout`); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); } finally { setPendingReservationRoomActionId(null); }
  }
  async function sendReservationRoomReminder(id: string) {
    setActionError(null); setPendingReservationRoomActionId(id);
    try { await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); } finally { setPendingReservationRoomActionId(null); }
  }

  if (fullViewOpen) return <ReservationsTimelinePage onBack={closeFullReservationsView} />;

  const reservationGroups = reservationFeedState.data?.data ?? [];
  const displayReservationGroups = groupVisibleReservations(reservationGroups);
  const bookedCount = displayReservationGroups.filter((g) => g.reservation_status === 'BOOKED').length;
  const checkedInCount = displayReservationGroups.filter((g) => g.reservation_status === 'CHECKED_IN').length;
  const checkedOutCount = displayReservationGroups.filter((g) => g.reservation_status === 'CHECKED_OUT').length;
  const timelineRows = buildTimelineRows(displayReservationGroups);
  const timelineWindow = buildReservationTimelineWindow(timelineRows, todayDate, 30);
  const visibleTimelineRows = timelineRows.filter((stay) => doesStayOverlapWindow(stay.check_in_date, stay.check_out_date, timelineWindow.startDate, timelineWindow.endDateExclusive));
  const previewTimelineRows = visibleTimelineRows.slice(0, 12);
  const hasTimelineRows = visibleTimelineRows.length > 0;
  const timeline = buildTimelineWindow(timelineWindow.startDate, timelineWindow.dayCount);
  const timelineGridTemplateColumns = `18rem repeat(${timeline.days.length}, 4.75rem)`;

  if (isInitialLoading) return <ReservationLoadingState />;

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Operations</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Reservations</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">Review the 10 most recent reservation groups. Open the full view for filters, timeline, and the complete feed.</p>
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">HMS source of truth</strong>
        <span className="text-slate-500 leading-relaxed">This screen shows HMS reservations plus provider bookings that were found during sync but blocked from full import.</span>
      </div>

      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Booked on page" value={bookedCount.toString()} tone="gold" />
        <MetricCard label="Checked in on page" value={checkedInCount.toString()} tone="green" />
        <MetricCard label="Checked out on page" value={checkedOutCount.toString()} tone="blue" />
      </div>

      {hasTimelineRows && (
        <div className="flex items-center gap-2">
          {(['timeline', 'ledger'] as const).map((mode) => {
            const isActive = viewMode === mode;
            const toneClass = mode === 'timeline'
              ? isActive
                ? 'border-amber-500 bg-amber-500 text-white shadow-sm ring-2 ring-amber-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:bg-amber-100'
              : isActive
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100';
            return (
              <button aria-pressed={isActive} key={mode} className={`px-4 py-2 rounded-lg border text-sm font-semibold transition capitalize active:scale-[0.98] ${toneClass}`} onClick={() => setViewMode(mode)} type="button">{mode}</button>
            );
          })}
        </div>
      )}

      {reservationFeedState.error && <ErrorMsg>{reservationFeedState.error}</ErrorMsg>}

      {hasTimelineRows && viewMode === 'timeline' && timeline.days.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Reservation timeline</p>
              <h3 className="text-sm font-bold text-slate-900">{timeline.days[0].label} to {timeline.days[timeline.days.length - 1].label}</h3>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-xs text-slate-400 leading-relaxed max-w-xs text-right">{timelineWindow.mode === 'today' ? `Showing ${previewTimelineRows.length} of ${visibleTimelineRows.length} rows for today through the next 30 days.` : `Showing ${previewTimelineRows.length} of ${visibleTimelineRows.length} rows from this page because no stays overlap today.`}</span>
              <button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} onClick={openFullReservationsView} type="button">View all reservations</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="timeline-header-grid min-w-max" style={{ gridTemplateColumns: timelineGridTemplateColumns, display: 'grid' }}>
              <div className="px-4 py-2.5 text-xs font-bold text-slate-600 border-b border-r border-slate-100 bg-slate-50">Reservation room</div>
              {timeline.days.map((day) => (
                <div className="px-2 py-2.5 text-center border-b border-r border-slate-100 bg-slate-50 last:border-r-0" key={day.date}>
                  <strong className="text-[10px] font-bold text-slate-500 block">{day.dayLabel}</strong>
                  <span className="text-[10px] text-slate-400">{day.shortDate}</span>
                </div>
              ))}
            </div>
            <div>
              {previewTimelineRows.map((stay) => (
                <div className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors min-w-max" key={stay.id} style={{ display: 'grid', gridTemplateColumns: timelineGridTemplateColumns }}>
                  <div className="px-4 py-3 border-r border-slate-100">
                    <strong className="text-xs font-bold text-slate-900 block">{stay.label}</strong>
                    <span className="text-[11px] text-slate-500 block">{stay.secondary}</span>
                    <span className="text-[11px] text-slate-400">{stay.detail}</span>
                  </div>
                  {timeline.days.map((day) => {
                    const occupied = isDateWithinStay(day.date, stay.check_in_date, stay.check_out_date);
                    const colorMap: Record<string, string> = { BOOKED: 'bg-sky-400', CHECKED_IN: 'bg-emerald-500', CHECKED_OUT: 'bg-slate-300', CANCELLED: 'bg-rose-400' };
                    return (
                      <div className={`flex items-center justify-center border-r border-slate-50 last:border-r-0 ${occupied ? 'bg-indigo-50' : ''}`} key={`${stay.id}-${day.date}`}>
                        {occupied && <div className={`h-1 w-1/3 rounded-full ${colorMap[stay.status.toUpperCase()] ?? 'bg-slate-400'}`} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!hasTimelineRows && (
        <div className="flex justify-end">
          <button className={secondaryBtn} onClick={openFullReservationsView} type="button">View all reservations</button>
        </div>
      )}

      <TableCard title={`${displayReservationGroups.length} recent groups`} eyebrow="Reservation feed" actions={
        <button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} onClick={openFullReservationsView} type="button">View all</button>
      }>
        <table className="w-full min-w-[700px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Source / reservation</Th><Th>Property</Th><Th>Dates</Th><Th>Primary guest</Th><Th>Rooms</Th><Th>Total</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {displayReservationGroups.map((group) => (
              <Fragment key={group.id}>
                <tr className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                  <Td>
                    <span className="font-bold text-slate-900 block">{group.source ?? 'ZODOMUS'}</span>
                    <span className="text-xs text-slate-400 font-mono">{group.external_reservation_id}</span>
                    {group.duplicate_count && group.duplicate_count > 1 ? <span className="text-[11px] text-slate-400 block">{group.duplicate_count} similar provider records grouped</span> : null}
                    <span className="text-[11px] text-slate-400 block">{group.import_blocked ? `Import blocked: ${group.import_error ?? 'Provider booking not yet imported'}` : formatProviderStatus(group.external_status)}</span>
                  </Td>
                  <Td>{group.property.name}</Td>
                  <Td>
                    <strong className="block text-slate-900">{group.arrival_date ?? '—'}</strong>
                    <span className="text-xs text-slate-400">{group.departure_date ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="font-medium text-slate-900 block">{group.primary_guest?.name ?? 'Imported guest'}</span>
                    <span className="text-xs text-slate-400">{group.primary_guest?.phone ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="font-medium text-slate-900 block">{group.rooms.length} room{group.rooms.length === 1 ? '' : 's'}</span>
                    <span className="text-xs text-slate-400">{group.rooms.map((r) => r.room_category.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
                  </Td>
                  <Td>{group.total_amount == null ? '—' : formatCurrency(group.total_amount)}</Td>
                  <Td><StatusBadge label={group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status} tone={group.import_blocked ? 'rose' : undefined} /></Td>
                  <Td><button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5 ${expandedReservationGroupId === group.id ? '!bg-indigo-100 !text-indigo-700' : ''}`} onClick={() => setExpandedReservationGroupId((c) => c === group.id ? null : group.id)} type="button">{expandedReservationGroupId === group.id ? 'Hide' : 'Details'}</button></Td>
                </tr>
                {expandedReservationGroupId === group.id && (
                  <tr>
                    <td colSpan={8} className="bg-slate-50/80 border-b border-slate-100 px-5 py-5">
                      <ReservationFeedDetails group={group} pendingReservationRoomActionId={pendingReservationRoomActionId} onCheckIn={checkInReservationRoom} onCheckOut={checkOutReservationRoom} onSendReminder={sendReservationRoomReminder} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TableCard>
    </section>
  );
}

function ReservationLoadingState() {
  return (
    <div className="space-y-5 animate-pulse" aria-live="polite">
      <div className="grid grid-cols-3 gap-4">
        {['Booked', 'Checked in', 'Checked out'].map((l) => (
          <div key={l} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-2">{l}</p>
            <div className="h-6 bg-slate-100 rounded w-12 mb-1" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="h-4 bg-slate-100 rounded w-40 mb-3" />
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className={`h-3 bg-slate-100 rounded ${i === 1 ? 'w-full' : i === 2 ? 'w-3/4' : 'w-1/2'}`} />)}</div>
      </div>
    </div>
  );
}

function ReservationFeedDetails({ group, pendingReservationRoomActionId, onCheckIn, onCheckOut, onSendReminder }: { group: DisplayReservationGroup; pendingReservationRoomActionId: string | null; onCheckIn: (id: string) => Promise<void>; onCheckOut: (id: string) => Promise<void>; onSendReminder: (id: string) => Promise<void> }) {
  const assignedRooms = group.rooms.filter((r) => r.room.room_number).length;
  const checkedInRoomStays = group.rooms.filter((r) => r.reservation_status === 'CHECKED_IN').length;
  const checkedOutRoomStays = group.rooms.filter((r) => r.reservation_status === 'CHECKED_OUT').length;
  const totalNights = group.rooms.reduce((sum, r) => sum + calculateNights(r.arrival_date, r.departure_date), 0);
  const groupNights = group.arrival_date && group.departure_date ? calculateNights(group.arrival_date, group.departure_date) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">{group.import_blocked ? 'Import blocker' : 'Reservation detail'}</p>
          <h3 className="text-base font-bold text-slate-900">{group.primary_guest?.name ?? 'Imported guest'}</h3>
          <p className="text-sm text-slate-500">{group.property.name} · {group.external_reservation_id}{group.arrival_date && group.departure_date ? ` · ${group.arrival_date} to ${group.departure_date}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status} tone={group.import_blocked ? 'rose' : undefined} />
          <StatusBadge label={formatProviderStatus(group.external_status)} />
        </div>
      </div>

      {group.import_blocked && (
        <div className="flex gap-3 items-start bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm">
          <strong className="text-rose-800 flex-shrink-0">Import blocked</strong>
          <span className="text-rose-700 leading-relaxed">{group.import_error ?? group.remarks ?? 'Fix mapping or inventory, then rerun the provider sync.'}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ label: 'Stay window', value: `${groupNights} nights`, sub: `${group.arrival_date ?? '—'} to ${group.departure_date ?? '—'}` }, { label: 'Room stays', value: String(group.rooms.length), sub: `${totalNights} total booked nights` }, { label: 'Assignments', value: `${assignedRooms}/${group.rooms.length}`, sub: `${checkedInRoomStays} checked in · ${checkedOutRoomStays} checked out` }, { label: 'Folio total', value: group.total_amount == null ? '—' : formatCurrency(group.total_amount), sub: `${group.currency ?? 'Currency unavailable'} · ${group.source ?? 'ZODOMUS'}` }].map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-100 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{stat.label}</span>
            <strong className="text-base font-extrabold text-slate-900 block">{stat.value}</strong>
            <p className="text-[11px] text-slate-400 leading-relaxed">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ eyebrow: 'Provider trace', title: 'Import metadata', rows: [['Source', group.source ?? 'ZODOMUS'], ['External reservation', group.external_reservation_id], ...(group.duplicate_count && group.duplicate_count > 1 ? [['Grouped provider IDs', group.duplicate_reservation_ids?.join(', ') ?? group.external_reservation_id]] : []), ['External status', formatProviderStatus(group.external_status)], ['Booked at', group.booked_at ? formatDateTime(group.booked_at) : '—'], ['Modified at', group.modified_at ? formatDateTime(group.modified_at) : '—']] as [string, string][] }, { eyebrow: 'Operational state', title: group.import_blocked ? 'Resolution guidance' : 'HMS handling', rows: [['Reservation status', group.reservation_status], ['Rooms in group', String(group.rooms.length)], ['Assigned rooms', String(assignedRooms)], ['Checked in room stays', String(checkedInRoomStays)], ['Checked out room stays', String(checkedOutRoomStays)], ['Operator action', group.import_blocked ? 'Fix mapping or inventory, then rerun provider sync.' : 'Use room-stay actions below for check-in, reminder, or check-out.']] as [string, string][] }].map((card) => (
          <div key={card.title} className="bg-white border border-slate-100 rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">{card.eyebrow}</p>
            <h4 className="text-sm font-bold text-slate-900 mb-3">{card.title}</h4>
            <dl className="space-y-1.5">
              {card.rows.map(([dt, dd]) => (
                <div key={String(dt)} className="flex items-start gap-2 text-xs">
                  <dt className="text-slate-400 w-40 flex-shrink-0">{dt}</dt>
                  <dd className="text-slate-700 font-medium leading-relaxed">{dd}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {group.rooms.map((room) => (
          <div key={room.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Room line {room.external_room_reservation_id}</p>
                <h4 className="text-sm font-bold text-slate-900">{room.room_category.name}</h4>
                <p className="text-xs text-slate-500">Assigned: {room.room.room_number ?? 'Not assigned'} · Ext {room.external_room_id}</p>
              </div>
              <StatusBadge label={room.reservation_status} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[{ label: 'Stay', value: `${room.arrival_date} to ${room.departure_date}`, sub: `${calculateNights(room.arrival_date, room.departure_date)} nights` }, { label: 'Rate plan', value: room.rate_plan.name, sub: formatCurrency(room.rate_plan.base_rate) }, { label: 'Guest mix', value: room.guest_name ?? group.primary_guest?.name ?? '—', sub: `${room.adults ?? 0} adults / ${room.children ?? 0} children` }, { label: 'Total', value: room.total_amount == null ? '—' : formatCurrency(room.total_amount), sub: room.currency ?? group.currency ?? '—' }].map((chip) => (
                <div key={chip.label} className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{chip.label}</span>
                  <strong className="text-xs font-bold text-slate-800 block truncate">{chip.value}</strong>
                  <p className="text-[11px] text-slate-400 truncate">{chip.sub}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!group.import_blocked && room.reservation_status === 'BOOKED' && <button className={`${linkBtn} !text-xs !px-2.5 !py-1`} disabled={pendingReservationRoomActionId === room.id} onClick={() => void onCheckIn(room.id)} type="button">{pendingReservationRoomActionId === room.id ? 'Processing…' : 'Check in'}</button>}
              {!group.import_blocked && room.reservation_status === 'CHECKED_IN' && <button className={`${linkBtn} !text-xs !px-2.5 !py-1`} disabled={pendingReservationRoomActionId === room.id} onClick={() => void onCheckOut(room.id)} type="button">{pendingReservationRoomActionId === room.id ? 'Processing…' : 'Check out'}</button>}
              {!group.import_blocked && room.reservation_status === 'BOOKED' && <button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5`} disabled={pendingReservationRoomActionId === room.id} onClick={() => void onSendReminder(room.id)} type="button">{pendingReservationRoomActionId === room.id ? 'Processing…' : 'Send reminder'}</button>}
              {group.import_blocked && <span className="text-xs text-rose-500">{group.import_error ?? 'Import blocked'}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function calculateNights(checkInDate: string, checkOutDate: string) {
  if (!checkInDate || !checkOutDate) return 0;
  const diff = (new Date(`${checkOutDate}T00:00:00.000Z`).getTime() - new Date(`${checkInDate}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000);
  return Number.isInteger(diff) && diff > 0 ? diff : 0;
}

function buildTimelineWindow(startDate: string, dayCount: number) {
  return { days: buildDateRange(startDate, addDays(startDate, dayCount)).map((date) => ({ date, label: formatLongDate(date), dayLabel: formatDay(date), shortDate: formatShortDate(date) })) };
}

function buildReservationTimelineWindow(rows: Array<{ check_in_date: string; check_out_date: string }>, todayDate: string, minimumDayCount: number) {
  const todayWindowEndDateExclusive = addDays(todayDate, minimumDayCount);
  const hasVisibleRowsInTodayWindow = rows.some((stay) => doesStayOverlapWindow(stay.check_in_date, stay.check_out_date, todayDate, todayWindowEndDateExclusive));
  if (hasVisibleRowsInTodayWindow || rows.length === 0) return { startDate: todayDate, endDateExclusive: todayWindowEndDateExclusive, dayCount: minimumDayCount, mode: 'today' as const };
  const earliestCheckInDate = rows.reduce((e, r) => r.check_in_date < e ? r.check_in_date : e, rows[0].check_in_date);
  const latestCheckOutDate = rows.reduce((l, r) => r.check_out_date > l ? r.check_out_date : l, rows[0].check_out_date);
  const dayCount = Math.max(minimumDayCount, diffDays(earliestCheckInDate, latestCheckOutDate));
  return { startDate: earliestCheckInDate, endDateExclusive: addDays(earliestCheckInDate, dayCount), dayCount, mode: 'data' as const };
}

function buildDateRange(startDate: string, endDateExclusive: string) {
  const dates: string[] = []; let current = startDate;
  while (current < endDateExclusive) { dates.push(current); current = addDays(current, 1); }
  return dates;
}

function addDays(date: string, days: number) { const base = new Date(`${date}T00:00:00.000Z`); base.setUTCDate(base.getUTCDate() + days); return base.toISOString().slice(0, 10); }
function diffDays(startDate: string, endDateExclusive: string) { return Math.max(1, Math.round((new Date(`${endDateExclusive}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000))); }
function isDateWithinStay(date: string, checkInDate: string, checkOutDate: string) { return date >= checkInDate && date < checkOutDate; }
function doesStayOverlapWindow(checkInDate: string, checkOutDate: string, windowStartDate: string, windowEndDateExclusive: string) { return checkInDate < windowEndDateExclusive && checkOutDate > windowStartDate; }
function getTodayDate() { return new Date().toISOString().slice(0, 10); }
function formatDay(date: string) { return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' }); }
function formatShortDate(date: string) { return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatLongDate(date: string) { return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString(); }
function formatProviderStatus(status: string | null | undefined) {
  const n = status?.trim().toLowerCase();
  if (!n) return 'Provider status unavailable';
  if (n === '1' || n === 'booked' || n === 'confirmed') return 'Booked';
  if (n === '2' || n === 'modified' || n === 'updated') return 'Modified';
  if (n === '3' || n === 'cancelled' || n === 'canceled') return 'Cancelled';
  return status ?? 'Provider status unavailable';
}

function buildTimelineRows(groups: DisplayReservationGroup[]): TimelineRow[] {
  return groups.flatMap((group) => {
    const groupedRows = new Map<string, { firstRoomId: string; label: string; secondary: string; roomCategoryName: string; totalAmountLabel: string; checkInDate: string; checkOutDate: string; status: string; count: number }>();
    for (const room of group.rooms) {
      if (!['BOOKED', 'CHECKED_IN'].includes((room.reservation_status ?? '').toUpperCase())) continue;
      const label = room.guest_name ?? group.primary_guest?.name ?? group.external_reservation_id;
      const totalAmountLabel = room.total_amount == null ? '—' : formatCurrency(room.total_amount);
      const key = [label, group.property.id, group.external_reservation_id, room.room_category.id, totalAmountLabel, room.arrival_date, room.departure_date, room.reservation_status].join('::');
      const existing = groupedRows.get(key);
      if (existing) { existing.count += 1; continue; }
      groupedRows.set(key, { firstRoomId: room.id, label, secondary: `${group.property.name} · ${group.external_reservation_id}`, roomCategoryName: room.room_category.name, totalAmountLabel, checkInDate: room.arrival_date, checkOutDate: room.departure_date, status: room.reservation_status, count: 1 });
    }
    return Array.from(groupedRows.values()).map((row) => ({ id: `reservation-room:${row.firstRoomId}`, label: row.label, secondary: row.secondary, detail: `${row.roomCategoryName}${row.count > 1 ? ` x${row.count}` : ''} · ${row.totalAmountLabel}`, check_in_date: row.checkInDate, check_out_date: row.checkOutDate, status: row.status }));
  });
}

function groupVisibleReservations(groups: ReservationGroup[]): DisplayReservationGroup[] {
  const groupedBlocked = new Map<string, DisplayReservationGroup>();
  const groupedImported = new Map<string, DisplayReservationGroup>();
  const importedSignatures = new Set(groups.filter((g) => !g.import_blocked).map(buildReservationOperationalSignature));
  const visible: DisplayReservationGroup[] = [];
  for (const group of groups) {
    if (!group.import_blocked) {
      const sig = buildImportedDuplicateSignature(group);
      const existing = groupedImported.get(sig);
      if (existing) { existing.duplicate_reservation_ids = [...(existing.duplicate_reservation_ids ?? [existing.external_reservation_id]), group.external_reservation_id]; existing.duplicate_count = (existing.duplicate_count ?? 1) + 1; continue; }
      const first: DisplayReservationGroup = { ...group, duplicate_reservation_ids: [group.external_reservation_id], duplicate_count: 1 };
      groupedImported.set(sig, first); visible.push(first); continue;
    }
    const opSig = buildReservationOperationalSignature(group);
    if (importedSignatures.has(opSig)) continue;
    const sig = `${opSig}::${(group.import_error ?? '').trim().toLowerCase()}`;
    const existing = groupedBlocked.get(sig);
    if (!existing) { const first: DisplayReservationGroup = { ...group, duplicate_reservation_ids: [group.external_reservation_id], duplicate_count: 1 }; groupedBlocked.set(sig, first); visible.push(first); continue; }
    existing.duplicate_reservation_ids = [...(existing.duplicate_reservation_ids ?? [existing.external_reservation_id]), group.external_reservation_id]; existing.duplicate_count = (existing.duplicate_count ?? 1) + 1;
  }
  return visible;
}

function isFullReservationsRoute() {
  return new URLSearchParams(window.location.search).get('reservations') === 'all';
}

function buildImportedDuplicateSignature(group: ReservationGroup) {
  const guest = (group.primary_guest?.name ?? '').trim().toLowerCase();
  const roomLines = group.rooms.map((r) => `${r.external_room_reservation_id}:${r.external_room_id}:${r.arrival_date}:${r.departure_date}`).sort().join('|');
  return [group.property.id, guest, group.arrival_date ?? '', group.departure_date ?? '', roomLines].join('::');
}

function buildReservationOperationalSignature(group: ReservationGroup) {
  const guest = (group.primary_guest?.name ?? '').trim().toLowerCase();
  const roomShape = group.rooms.map((r) => `${r.external_room_id}:${r.arrival_date}:${r.departure_date}`).sort().join('|');
  return [group.property.id, guest, group.arrival_date ?? '', group.departure_date ?? '', roomShape].join('::');
}
