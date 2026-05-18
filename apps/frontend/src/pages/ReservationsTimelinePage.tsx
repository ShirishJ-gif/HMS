import { Fragment, useEffect, useMemo, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages, PaginatedResponse } from '../api/pagination';
import { Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { ErrorMsg, LoadingMsg, MetricCard, StatusBadge, TableCard, Td, Th, inputCls, labelCls, linkBtn, secondaryBtn } from './ui';

type DatePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'CUSTOM' | 'ALL';
type DisplayReservationGroup = ReservationGroup & { duplicate_reservation_ids?: string[]; duplicate_count?: number };
type TimelineRow = {
  id: string;
  label: string;
  secondary: string;
  detail: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
};

export function ReservationsTimelinePage({ onBack }: { onBack?: () => void }) {
  const today = getTodayDate();
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [customFromDate, setCustomFromDate] = useState(today);
  const [customToDate, setCustomToDate] = useState(today);
  const [customFromDatePickerOpen, setCustomFromDatePickerOpen] = useState(false);
  const [customToDatePickerOpen, setCustomToDatePickerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedReservationGroupId, setExpandedReservationGroupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReservationRoomActionId, setPendingReservationRoomActionId] = useState<string | null>(null);

  const dateWindow = useMemo(() => resolveDateWindow(datePreset, today, customFromDate, customToDate), [customFromDate, customToDate, datePreset, today]);
  const reservationState = useAsync(async () => {
    const response = await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', {
      params: {
        search: search || undefined,
        property_id: propertyFilter === 'ALL' ? undefined : propertyFilter,
        status: statusFilter === 'ACTIVE' || statusFilter === 'ALL_WITH_CANCELLED' ? undefined : statusFilter,
        include_cancelled: statusFilter === 'ALL_WITH_CANCELLED' ? true : undefined,
        date_from: dateWindow.from,
        date_to: dateWindow.to,
        page,
        limit: 10,
      },
    });
    return response.data;
  }, [dateWindow.from, dateWindow.to, page, propertyFilter, reloadKey, search, statusFilter]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);

  useEffect(() => { setPage(1); }, [dateWindow.from, dateWindow.to, propertyFilter, search, statusFilter]);
  useEffect(() => { setExpandedReservationGroupId(null); }, [dateWindow.from, dateWindow.to, page, propertyFilter, search, statusFilter]);
  useEffect(() => {
    const totalPages = reservationState.data?.meta.total_pages ?? 1;
    if (page > totalPages) setPage(totalPages);
  }, [page, reservationState.data?.meta.total_pages]);

  const properties = propertiesState.data ?? [];
  const groups = reservationState.data?.data ?? [];
  const displayGroups = groupVisibleReservations(groups);
  const totalPages = reservationState.data?.meta.total_pages ?? 1;
  const rows = buildTimelineRows(displayGroups);
  const timeline = buildTimeline(dateWindow.from, dateWindow.to, rows, today);
  const timelineGridTemplateColumns = `18rem repeat(${timeline.days.length}, 4.75rem)`;
  const bookedRows = rows.filter((row) => row.status === 'BOOKED').length;
  const checkedInRows = rows.filter((row) => row.status === 'CHECKED_IN').length;
  const revenue = displayGroups.reduce((sum, group) => sum + (group.total_amount ?? 0), 0);

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

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            aria-label="Back to reservations"
            className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            onClick={onBack}
            type="button"
          >
            <BackIcon />
          </button>
        )}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Operations</p>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Reservation Timeline</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">See reservation room stays across today, recent windows, or a custom date range.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Room stays in view" value={rows.length.toString()} tone="indigo" sub={`${displayGroups.length} reservation groups on this page`} />
        <MetricCard label="Booked / checked in" value={`${bookedRows}/${checkedInRows}`} tone="green" sub="Active operational stays" />
        <MetricCard label="Value in view" value={formatCurrency(revenue)} tone="gold" sub="Sum of visible room stay totals" />
      </div>

      <FilterBar title="Timeline filters">
        <label className={`${labelCls} min-w-[16rem]`}>
          <span>Search</span>
          <input className={inputCls} onChange={(event) => setSearch(event.target.value)} placeholder="Guest, reservation, property, room" type="search" value={search} />
        </label>
        <label className={`${labelCls} min-w-[12rem]`}><span>Date range</span><CustomSelect onChange={(value) => setDatePreset(value as DatePreset)} options={[{ label: 'Today', value: 'TODAY' }, { label: 'Last 7 days', value: 'LAST_7' }, { label: 'Last 30 days', value: 'LAST_30' }, { label: 'Custom range', value: 'CUSTOM' }, { label: 'All dates', value: 'ALL' }]} value={datePreset} /></label>
        {datePreset === 'CUSTOM' && (
          <>
            <DatePickerField
              label="From"
              maxDate={customToDate}
              onChange={(value) => {
                setCustomFromDate(value);
                if (value > customToDate) setCustomToDate(value);
              }}
              open={customFromDatePickerOpen}
              setOpen={(open) => {
                setCustomFromDatePickerOpen(open);
                if (open) setCustomToDatePickerOpen(false);
              }}
              value={customFromDate}
            />
            <DatePickerField
              align="right"
              label="To"
              minDate={customFromDate}
              onChange={(value) => {
                setCustomToDate(value);
                if (value < customFromDate) setCustomFromDate(value);
              }}
              open={customToDatePickerOpen}
              setOpen={(open) => {
                setCustomToDatePickerOpen(open);
                if (open) setCustomFromDatePickerOpen(false);
              }}
              value={customToDate}
            />
          </>
        )}
        <label className={`${labelCls} min-w-[14rem]`}><span>Property</span><CustomSelect onChange={setPropertyFilter} options={[{ label: 'All properties', value: 'ALL' }, ...properties.map((property) => ({ label: property.name, value: property.id }))]} value={propertyFilter} /></label>
        <label className={`${labelCls} min-w-[13rem]`}><span>Status</span><CustomSelect onChange={setStatusFilter} options={[{ label: 'Active statuses', value: 'ACTIVE' }, { label: 'Booked', value: 'BOOKED' }, { label: 'Checked in', value: 'CHECKED_IN' }, { label: 'Checked out', value: 'CHECKED_OUT' }, { label: 'Cancelled', value: 'CANCELLED' }, { label: 'All including cancelled', value: 'ALL_WITH_CANCELLED' }]} value={statusFilter} /></label>
      </FilterBar>

      {(reservationState.error || propertiesState.error) && <ErrorMsg>{reservationState.error ?? propertiesState.error}</ErrorMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
      {reservationState.loading && !reservationState.data ? <LoadingMsg>Loading reservation timeline…</LoadingMsg> : null}

      {rows.length > 0 && timeline.days.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Timeline view</p>
              <h3 className="text-sm font-bold text-slate-900">{formatLongDate(timeline.days[0].date)} to {formatLongDate(timeline.days[timeline.days.length - 1].date)}</h3>
            </div>
            <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-max" style={{ display: 'grid', gridTemplateColumns: timelineGridTemplateColumns }}>
              <div className="px-4 py-2.5 text-xs font-bold text-slate-600 border-b border-r border-slate-100 bg-slate-50">Reservation room</div>
              {timeline.days.map((day) => <div className="px-2 py-2.5 text-center border-b border-r border-slate-100 bg-slate-50 last:border-r-0" key={day.date}><strong className="text-[10px] font-bold text-slate-500 block">{day.day}</strong><span className="text-[10px] text-slate-400">{day.short}</span></div>)}
            </div>
            {rows.map((row) => (
              <div className="min-w-max border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors" key={row.id} style={{ display: 'grid', gridTemplateColumns: timelineGridTemplateColumns }}>
                <div className="px-4 py-3 border-r border-slate-100">
                  <strong className="text-xs font-bold text-slate-900 block">{row.label}</strong>
                  <span className="text-[11px] text-slate-500 block">{row.secondary}</span>
                  <span className="text-[11px] text-slate-400">{row.detail}</span>
                </div>
                {timeline.days.map((day) => {
                  const occupied = day.date >= row.check_in_date && day.date < row.check_out_date;
                  const colorMap: Record<string, string> = { BOOKED: 'bg-sky-400', CHECKED_IN: 'bg-emerald-500', CHECKED_OUT: 'bg-slate-300', CANCELLED: 'bg-rose-400' };
                  return (
                    <div className={`flex items-center justify-center border-r border-slate-50 last:border-r-0 ${occupied ? 'bg-indigo-50' : ''}`} key={`${row.id}-${day.date}`}>
                      {occupied && <div className={`h-1 w-1/3 rounded-full ${colorMap[row.status.toUpperCase()] ?? 'bg-slate-400'}`} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : !reservationState.loading ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-sm text-slate-500">No reservation room stays match these filters.</div>
      ) : null}

      <TableCard title={`${displayGroups.length} groups on this page`} eyebrow="Reservation feed" actions={<div className="flex items-center gap-2"><button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Previous</button><button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">Next</button></div>}>
        <table className="w-full min-w-[700px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Source / reservation</Th><Th>Property</Th><Th>Dates</Th><Th>Primary guest</Th><Th>Rooms</Th><Th>Total</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {displayGroups.map((group) => (
              <Fragment key={group.id}>
                <tr className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                  <Td>
                    <span className="font-bold text-slate-900 block">{group.source ?? 'ZODOMUS'}</span>
                    <span className="text-xs text-slate-400 font-mono">{group.external_reservation_id}</span>
                    {group.duplicate_count && group.duplicate_count > 1 ? <span className="text-[11px] text-slate-400 block">{group.duplicate_count} similar provider records grouped</span> : null}
                    <span className="text-[11px] text-slate-400 block">{group.import_blocked ? `Import blocked: ${group.import_error ?? 'Provider booking not yet imported'}` : formatProviderStatus(group.external_status)}</span>
                  </Td>
                  <Td>{group.property.name}</Td>
                  <Td><strong className="block text-slate-900">{group.arrival_date ?? '—'}</strong><span className="text-xs text-slate-400">{group.departure_date ?? '—'}</span></Td>
                  <Td><span className="font-medium text-slate-900 block">{group.primary_guest?.name ?? 'Imported guest'}</span><span className="text-xs text-slate-400">{group.primary_guest?.phone ?? '—'}</span></Td>
                  <Td><span className="font-medium text-slate-900 block">{group.rooms.length} room{group.rooms.length === 1 ? '' : 's'}</span><span className="text-xs text-slate-400">{group.rooms.map((room) => room.room_category.name).filter((value, index, all) => all.indexOf(value) === index).join(', ')}</span></Td>
                  <Td>{group.total_amount == null ? '—' : formatCurrency(group.total_amount)}</Td>
                  <Td><StatusBadge label={group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status} tone={group.import_blocked ? 'rose' : undefined} /></Td>
                  <Td><button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5 ${expandedReservationGroupId === group.id ? '!bg-indigo-100 !text-indigo-700' : ''}`} onClick={() => setExpandedReservationGroupId((current) => current === group.id ? null : group.id)} type="button">{expandedReservationGroupId === group.id ? 'Hide' : 'Details'}</button></Td>
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

function ReservationFeedDetails({ group, pendingReservationRoomActionId, onCheckIn, onCheckOut, onSendReminder }: { group: DisplayReservationGroup; pendingReservationRoomActionId: string | null; onCheckIn: (id: string) => Promise<void>; onCheckOut: (id: string) => Promise<void>; onSendReminder: (id: string) => Promise<void> }) {
  const assignedRooms = group.rooms.filter((room) => room.room.room_number).length;
  const checkedInRoomStays = group.rooms.filter((room) => room.reservation_status === 'CHECKED_IN').length;
  const checkedOutRoomStays = group.rooms.filter((room) => room.reservation_status === 'CHECKED_OUT').length;
  const totalNights = group.rooms.reduce((sum, room) => sum + calculateNights(room.arrival_date, room.departure_date), 0);
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

function DatePickerField({ align = 'left', label, maxDate, minDate, onChange, open, setOpen, value }: {
  align?: 'left' | 'right';
  label: string;
  maxDate?: string;
  minDate?: string;
  onChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
}) {
  const selectedDate = parseDateValue(value);
  return (
    <div className={`${labelCls} min-w-[11rem]`}>
      <span>{label}</span>
      <div className="relative">
        <button
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span>{value ? formatDatePickerLabel(value) : 'Pick a date'}</span>
          <CalendarIcon className="h-4 w-4 text-slate-400" />
        </button>
        {open && (
          <div className={`absolute top-[3rem] z-30 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
            <DayPicker
              animate
              className="hms-day-picker"
              defaultMonth={selectedDate ?? parseDateValue(minDate ?? maxDate ?? '') ?? new Date()}
              disabled={buildDisabledDateMatchers(minDate, maxDate)}
              fixedWeeks
              mode="single"
              onSelect={(date) => {
                if (!date) return;
                onChange(dateToInputValue(date));
                setOpen(false);
              }}
              selected={selectedDate}
              showOutsideDays
              weekStartsOn={1}
            />
          </div>
        )}
      </div>
    </div>
  );
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

function calculateNights(checkInDate: string, checkOutDate: string) {
  if (!checkInDate || !checkOutDate) return 0;
  const diff = (new Date(`${checkOutDate}T00:00:00.000Z`).getTime() - new Date(`${checkInDate}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000);
  return Number.isInteger(diff) && diff > 0 ? diff : 0;
}

function groupVisibleReservations(groups: ReservationGroup[]): DisplayReservationGroup[] {
  const groupedBlocked = new Map<string, DisplayReservationGroup>();
  const groupedImported = new Map<string, DisplayReservationGroup>();
  const importedSignatures = new Set(groups.filter((group) => !group.import_blocked).map(buildReservationOperationalSignature));
  const visible: DisplayReservationGroup[] = [];
  for (const group of groups) {
    if (!group.import_blocked) {
      const signature = buildImportedDuplicateSignature(group);
      const existing = groupedImported.get(signature);
      if (existing) {
        existing.duplicate_reservation_ids = [...(existing.duplicate_reservation_ids ?? [existing.external_reservation_id]), group.external_reservation_id];
        existing.duplicate_count = (existing.duplicate_count ?? 1) + 1;
        continue;
      }
      const first: DisplayReservationGroup = { ...group, duplicate_reservation_ids: [group.external_reservation_id], duplicate_count: 1 };
      groupedImported.set(signature, first);
      visible.push(first);
      continue;
    }
    const operationalSignature = buildReservationOperationalSignature(group);
    if (importedSignatures.has(operationalSignature)) continue;
    const signature = `${operationalSignature}::${(group.import_error ?? '').trim().toLowerCase()}`;
    const existing = groupedBlocked.get(signature);
    if (!existing) {
      const first: DisplayReservationGroup = { ...group, duplicate_reservation_ids: [group.external_reservation_id], duplicate_count: 1 };
      groupedBlocked.set(signature, first);
      visible.push(first);
      continue;
    }
    existing.duplicate_reservation_ids = [...(existing.duplicate_reservation_ids ?? [existing.external_reservation_id]), group.external_reservation_id];
    existing.duplicate_count = (existing.duplicate_count ?? 1) + 1;
  }
  return visible;
}

function buildImportedDuplicateSignature(group: ReservationGroup) {
  const guest = (group.primary_guest?.name ?? '').trim().toLowerCase();
  const roomLines = group.rooms.map((room) => `${room.external_room_reservation_id}:${room.external_room_id}:${room.arrival_date}:${room.departure_date}`).sort().join('|');
  return [group.property.id, guest, group.arrival_date ?? '', group.departure_date ?? '', roomLines].join('::');
}

function buildReservationOperationalSignature(group: ReservationGroup) {
  const guest = (group.primary_guest?.name ?? '').trim().toLowerCase();
  const roomShape = group.rooms.map((room) => `${room.external_room_id}:${room.arrival_date}:${room.departure_date}`).sort().join('|');
  return [group.property.id, guest, group.arrival_date ?? '', group.departure_date ?? '', roomShape].join('::');
}

function formatProviderStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return 'Provider status unavailable';
  if (normalized === '1' || normalized === 'booked' || normalized === 'confirmed') return 'Booked';
  if (normalized === '2' || normalized === 'modified' || normalized === 'updated') return 'Modified';
  if (normalized === '3' || normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled';
  return status ?? 'Provider status unavailable';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function resolveDateWindow(preset: DatePreset, today: string, customFrom: string, customTo: string) {
  if (preset === 'ALL') return { from: undefined, to: undefined };
  if (preset === 'TODAY') return { from: today, to: today };
  if (preset === 'LAST_7') return { from: addDays(today, -6), to: today };
  if (preset === 'LAST_30') return { from: addDays(today, -29), to: today };
  return { from: customFrom, to: customTo };
}

function buildTimeline(fromDate: string | undefined, toDate: string | undefined, rows: TimelineRow[], fallbackDate: string) {
  const rowDates = rows.flatMap((row) => [row.check_in_date, row.check_out_date]).filter(Boolean);
  const start = fromDate ?? rowDates.reduce((early, date) => date < early ? date : early, rowDates[0] ?? fallbackDate);
  const end = toDate ?? rowDates.reduce((late, date) => date > late ? date : late, start);
  const endExclusive = addDays(end, 1);
  const days: Array<{ date: string; day: string; short: string }> = [];
  let current = start;
  while (current < endExclusive) {
    days.push({ date: current, day: formatDay(current), short: formatShortDate(current) });
    current = addDays(current, 1);
  }
  return { days };
}

function getTodayDate() { return new Date().toISOString().slice(0, 10); }
function addDays(date: string, days: number) { const base = new Date(`${date}T00:00:00.000Z`); base.setUTCDate(base.getUTCDate() + days); return base.toISOString().slice(0, 10); }
function formatDay(date: string) { return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' }); }
function formatShortDate(date: string) { return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatLongDate(date: string) { return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatDatePickerLabel(value: string) { return parseDateValue(value)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) ?? value; }
function parseDateValue(value: string) { if (!value) return undefined; return new Date(`${value}T00:00:00.000Z`); }
function dateToInputValue(value: Date) { return value.toISOString().slice(0, 10); }
function buildDisabledDateMatchers(minDate?: string, maxDate?: string) {
  const matchers = [];
  const min = minDate ? parseDateValue(minDate) : undefined;
  const max = maxDate ? parseDateValue(maxDate) : undefined;
  if (min) matchers.push({ before: min });
  if (max) matchers.push({ after: max });
  return matchers.length > 0 ? matchers : undefined;
}

function CalendarIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 9h16" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}
