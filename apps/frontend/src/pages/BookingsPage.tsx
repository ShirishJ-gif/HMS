import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages, PaginatedResponse } from '../api/pagination';
import { BookingStatus, ReservationGroup, Room } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { ErrorMsg, LoadingMsg, StatusBadge, TableCard, Th, Td, linkBtn, secondaryBtn } from './ui';
import { createPreviewData, isPreviewId } from './previewData';

/* ─── Local types ─────────────────────────────────────── */
type DisplayGroup = ReservationGroup & { duplicate_reservation_ids?: string[]; duplicate_count?: number };

/* ─── Tape-chart helpers ─────────────────────────────── */
function getTodayDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string) {
  return Math.max(0, Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / 86400000));
}
function fmtShort(d: string) {
  return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtLong(d: string) {
  return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function dayNum(d: string) { return new Date(`${d}T00:00:00.000Z`).getUTCDate(); }
function dayOfWeek(d: string) { return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' }); }
function isWeekend(d: string) { const w = new Date(`${d}T00:00:00.000Z`).getUTCDay(); return w === 0 || w === 6; }
function calculateNights(a: string, b: string) {
  if (!a || !b) return 0;
  const d = diffDays(a, b);
  return d > 0 ? d : 0;
}
function formatDateTime(v: string) { return new Date(v).toLocaleString(); }
function formatProviderStatus(s: string | null | undefined) {
  const n = s?.trim().toLowerCase();
  if (!n) return 'Provider status unavailable';
  if (n === '1' || n === 'booked' || n === 'confirmed') return 'Booked';
  if (n === '2' || n === 'modified' || n === 'updated') return 'Modified';
  if (n === '3' || n === 'cancelled' || n === 'canceled') return 'Cancelled';
  return s ?? 'Provider status unavailable';
}

/* ─── Status colours ─────────────────────────────────── */
const STATUS_BAR: Record<string, string> = {
  BOOKED:      'bg-cyan-600 text-white',
  CHECKED_IN:  'bg-emerald-600 text-white',
  CHECKED_OUT: 'bg-slate-200 text-slate-400',
  CANCELLED:   'bg-rose-200 text-rose-500',
};
const STATUS_DOT: Record<string, string> = {
  BOOKED: 'bg-cyan-500', CHECKED_IN: 'bg-emerald-500',
  CHECKED_OUT: 'bg-slate-300', CANCELLED: 'bg-rose-400',
};
const STATUS_LABEL: Record<string, string> = {
  BOOKED: 'Booked', CHECKED_IN: 'Checked in', CHECKED_OUT: 'Checked out', CANCELLED: 'Cancelled',
};

const COL_W = 80;
const ROW_H = 64;
const SIDEBAR_W = 240;
const WINDOW_DAYS = 30;

/* ─── Calendar rows from physical rooms ── */
type PhysRoomRow = {
  roomKey: string;
  roomNum: string;
  category: string;
  propertyName: string;
  propertyId: string;
};

function buildRoomRows(rooms: Room[], propertyId: string): PhysRoomRow[] {
  return rooms
    .filter(r => propertyId === 'ALL' || r.property.id === propertyId)
    .map(r => ({
      roomKey: `${r.property.id}::${r.room_number}::${r.room_category.name}`,
      roomNum: r.room_number,
      category: r.room_category.name,
      propertyName: r.property.name,
      propertyId: r.property.id,
    }));
}

function sortRoomRows(rows: PhysRoomRow[]) {
  return rows
    .sort((a, b) => {
      if (a.propertyName !== b.propertyName) return a.propertyName.localeCompare(b.propertyName);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return parseInt(a.roomNum, 10) - parseInt(b.roomNum, 10);
    });
}

function buildDisplayRoomAssignments(rows: PhysRoomRow[], groups: ReservationGroup[], propertyId: string, days: string[]) {
  const assignments = new Map<string, string>();
  const reservedRangesByRoom = new Map<string, Array<{ arrival: string; departure: string }>>();
  const windowStart = days[0];
  const windowEnd = addDays(days[days.length - 1] ?? windowStart, 1);

  for (const group of groups) {
    if (propertyId !== 'ALL' && group.property.id !== propertyId) continue;
    for (const room of group.rooms) {
      if (room.reservation_status === 'CANCELLED' || room.reservation_status === 'CHECKED_OUT') continue;
      if (room.departure_date <= windowStart || room.arrival_date >= windowEnd) continue;
      const assignedRoomNumber = room.room.room_number;
      if (!assignedRoomNumber) continue;
      const key = `${group.property.id}::${assignedRoomNumber}::${room.room_category.name}`;
      const ranges = reservedRangesByRoom.get(key) ?? [];
      ranges.push({ arrival: room.arrival_date, departure: room.departure_date });
      reservedRangesByRoom.set(key, ranges);
    }
  }

  const unassignedRooms = groups.flatMap(group => {
    if (propertyId !== 'ALL' && group.property.id !== propertyId) return [];
    return group.rooms
      .filter(room =>
        !room.room.room_number &&
        room.reservation_status !== 'CANCELLED' &&
        room.reservation_status !== 'CHECKED_OUT' &&
        room.arrival_date < windowEnd &&
        room.departure_date > windowStart
      )
      .map(room => ({ group, room }));
  }).sort((a, b) => a.room.arrival_date.localeCompare(b.room.arrival_date));

  for (const { group, room } of unassignedRooms) {
    const candidate = rows.find(row => {
      if (row.propertyId !== group.property.id || row.category !== room.room_category.name) return false;
      const ranges = reservedRangesByRoom.get(row.roomKey) ?? [];
      return ranges.every(range => room.departure_date <= range.arrival || room.arrival_date >= range.departure);
    });

    if (!candidate) continue;
    assignments.set(room.id, candidate.roomKey);
    const ranges = reservedRangesByRoom.get(candidate.roomKey) ?? [];
    ranges.push({ arrival: room.arrival_date, departure: room.departure_date });
    reservedRangesByRoom.set(candidate.roomKey, ranges);
  }

  return assignments;
}

/* ─── Find reservation bar for a (roomNum|category, day, propertyId) ── */
type BarInfo = { group: ReservationGroup; room: ReservationGroup['rooms'][number]; status: BookingStatus };
function getBar(
  groups: ReservationGroup[],
  row: PhysRoomRow,
  day: string,
  propertyId: string,
  displayAssignments: Map<string, string>,
): BarInfo | undefined {
  for (const g of groups) {
    if (propertyId !== 'ALL' && g.property.id !== propertyId) continue;
    for (const r of g.rooms) {
      if (g.property.id !== row.propertyId || r.room_category.name !== row.category) continue;
      const displayRoomKey = r.room.room_number
        ? `${g.property.id}::${r.room.room_number}::${r.room_category.name}`
        : displayAssignments.get(r.id);
      if (displayRoomKey !== row.roomKey) continue;
      if (r.arrival_date <= day && r.departure_date > day) return { group: g, room: r, status: r.reservation_status as BookingStatus };
    }
  }
  return undefined;
}

/* ─── Cache ────────────────────────────────────────────── */
let _allGroupsCache: ReservationGroup[] | null = null;
let _allGroupsCacheAt = 0;
const CACHE_TTL = 60_000;

/* ══════════════════════════════════════════════════════════
   BookingsPage
══════════════════════════════════════════════════════════ */
export function BookingsPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const today = getTodayDate();

  /* ── View & filter state ── */
  const [viewMode, setViewMode] = useState<'timeline' | 'ledger'>('timeline');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL');
  const [windowStart, setWindowStart] = useState(() => addDays(today, -2));
  const [collapsedRoomTypes, setCollapsedRoomTypes] = useState<Set<string>>(() => new Set());

  /* ── Tape-chart data (all groups) ── */
  const [reloadKey, setReloadKey] = useState(0);
  const [allGroups, setAllGroups] = useState<ReservationGroup[]>(_allGroupsCache ?? []);
  const [allLoading, setAllLoading] = useState(!_allGroupsCache);
  const [allError, setAllError] = useState<string | null>(null);

  /* ── Room inventory (full list, shows all rooms even with no bookings) ── */
  const roomsState = useAsync(async () => fetchAllPages<Room>('/rooms'), []);
  const previewData = previewDataEnabled ? createPreviewData() : null;
  const displayedGroups = previewData?.reservationGroups ?? allGroups;
  const allRooms = previewData?.rooms ?? roomsState.data ?? [];

  /* ── Detail drawer ── */
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  /* ── Date picker ref (hidden input) ── */
  const datePickerRef = useRef<HTMLInputElement>(null);

  function toggleRoomType(category: string) {
    setCollapsedRoomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  /* ── Ledger feed (paginated) ── */
  const [feedPage, setFeedPage] = useState(1);
  const feedState = useAsync(
    async () => (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', { params: { page: feedPage, limit: 10 } })).data,
    [reloadKey, feedPage]
  );

  useEffect(() => {
    let active = true;
    const fresh = _allGroupsCache && reloadKey === 0 && Date.now() - _allGroupsCacheAt < CACHE_TTL;
    if (fresh) { setAllGroups(_allGroupsCache!); setAllLoading(false); return; }
    setAllLoading(!_allGroupsCache);
    fetchAllPages<ReservationGroup>('/bookings/groups')
      .then(data => { if (!active) return; _allGroupsCache = data; _allGroupsCacheAt = Date.now(); setAllGroups(data); setAllLoading(false); })
      .catch((e: unknown) => { if (!active) return; setAllError(getApiErrorMessage(e)); setAllLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  /* ── Actions ── */
  async function checkIn(id: string) {
    if (isPreviewId(id)) { setActionError('Sample preview records are read-only. Turn off sample data to work with live records.'); return; }
    setActionError(null); setPendingId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkin`); _allGroupsCache = null; setReloadKey(v => v + 1); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }
  async function checkOut(id: string) {
    if (isPreviewId(id)) { setActionError('Sample preview records are read-only. Turn off sample data to work with live records.'); return; }
    setActionError(null); setPendingId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkout`); _allGroupsCache = null; setReloadKey(v => v + 1); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }
  async function sendReminder(id: string) {
    if (isPreviewId(id)) { setActionError('Sample preview records are read-only. Turn off sample data to work with live records.'); return; }
    setActionError(null); setPendingId(id);
    try { await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }

  /* ── Derived data ── */
  const properties = Array.from(
    new Map(allRooms.map(r => [r.property.id, r.property])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i));
  const windowEnd = addDays(windowStart, WINDOW_DAYS);

  const filteredGroups = displayedGroups.filter(g => {
    if (propertyFilter !== 'ALL' && g.property.id !== propertyFilter) return false;
    if (statusFilter !== 'ALL') {
      if (!g.rooms.some(r => r.reservation_status === statusFilter)) return false;
    }
    return true;
  });

  /* Room rows come from real room inventory; unassigned bookings are placed on free matching rows for display. */
  const roomRows = sortRoomRows(buildRoomRows(allRooms, propertyFilter));
  const displayRoomAssignments = buildDisplayRoomAssignments(roomRows, filteredGroups, propertyFilter, days);
  const groupedRooms = Object.entries(
    roomRows.reduce<Record<string, PhysRoomRow[]>>((acc, r) => { (acc[r.category] ??= []).push(r); return acc; }, {})
  );

  /* Occupancy per day */
  const occByDay: Record<string, number> = {};
  for (const day of days) {
    const occ = displayedGroups.filter(g =>
      g.rooms.some(r => r.arrival_date <= day && r.departure_date > day && r.reservation_status !== 'CHECKED_OUT' && r.reservation_status !== 'CANCELLED')
    ).length;
    occByDay[day] = roomRows.length > 0 ? Math.round((occ / Math.max(roomRows.length, 1)) * 100) : 0;
  }

  /* KPIs */
  const arrivalsToday  = displayedGroups.reduce((s, g) => s + g.rooms.filter(r => r.arrival_date === today && r.reservation_status === 'BOOKED').length, 0);
  const depToday       = displayedGroups.reduce((s, g) => s + g.rooms.filter(r => r.departure_date === today && ['CHECKED_IN','CHECKED_OUT'].includes(r.reservation_status)).length, 0);
  const inHouse        = displayedGroups.reduce((s, g) => s + g.rooms.filter(r => r.reservation_status === 'CHECKED_IN').length, 0);
  const visibleGroups = groupVisibleReservations(displayedGroups);

  /* Selected group */
  const selectedGroup = selectedGroupId ? (displayedGroups.find(g => g.id === selectedGroupId) ?? feedState.data?.data.find(g => g.id === selectedGroupId) ?? null) : null;

  /* Ledger display groups */
  const feedGroups = groupVisibleReservations(previewData?.reservationGroups ?? feedState.data?.data ?? []);
  const notCheckedInGroups = visibleGroups.filter(g =>
    g.rooms.some(r => r.reservation_status === 'BOOKED'),
  ).length;

  return (
    <div className="space-y-4 relative">

      {/* ── Header row: title + controls ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Operations</span>
            <span className="text-slate-300">·</span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Reservations</span>
          </div>
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">Reservations</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Property selector */}
          <div className="flex items-center gap-2">
            {/* <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap select-none">Property</span> */}
            <div className="w-44">
              <CustomSelect
                options={[{ label: 'All properties', value: 'ALL' }, ...properties.map(p => ({ label: p.name, value: p.id }))]}
                value={propertyFilter}
                onChange={setPropertyFilter}
              />
            </div>
          </div>

          {/* Date navigator */}
          <div className="bg-white border border-black/[0.07] rounded-lg flex items-center shadow-sm relative">
            {/* Hidden native date picker — triggered by clicking the date label */}
            <input
              ref={datePickerRef}
              type="date"
              value={windowStart}
              onChange={e => { if (e.target.value) setWindowStart(e.target.value); }}
              className="sr-only"
              tabIndex={-1}
            />
            {/* ‹ prev week */}
            <button type="button" onClick={() => setWindowStart(s => addDays(s, -7))}
              className="px-3 py-2.5 hover:bg-slate-50 rounded-l-lg transition-colors text-slate-600 border-r border-slate-100 flex items-center gap-0.5" title="Previous week">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
              <svg className="w-3 h-3 -ml-1.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            {/* Clickable date range — opens native date picker */}
            <button type="button"
              onClick={() => datePickerRef.current?.showPicker?.() ?? datePickerRef.current?.click()}
              className="px-3.5 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors group"
              title="Pick a date">
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <span className="text-[12px] font-bold text-slate-800 whitespace-nowrap select-none">
                {fmtShort(windowStart)} — {fmtShort(addDays(windowEnd, -1))}
              </span>
            </button>
            {/* › next week */}
            <button type="button" onClick={() => setWindowStart(s => addDays(s, 7))}
              className="px-3 py-2.5 hover:bg-slate-50 rounded-r-lg transition-colors text-slate-600 border-l border-slate-100 flex items-center gap-0.5" title="Next week">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
              <svg className="w-3 h-3 -ml-1.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setWindowStart(addDays(today, -2))}
            className="h-9 px-3.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Today
          </button>

          {/* Timeline / Ledger toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {(['timeline', 'ledger'] as const).map(v => (
              <button key={v} type="button" onClick={() => setViewMode(v)}
                className={`h-8 px-3 rounded-md text-[11.5px] font-semibold transition-colors capitalize ${viewMode === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'timeline' ? 'Timeline' : 'Ledger'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Arrivals today',    value: arrivalsToday.toString() },
          { label: 'Departures today',  value: depToday.toString() },
          { label: 'In house',          value: inHouse.toString() },
          { label: 'Not checked in groups', value: notCheckedInGroups.toString() },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-black/[0.06] px-3.5 py-2.5">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{k.label}</p>
            <p className="text-[1.35rem] font-bold text-slate-900 tracking-tight leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {allError && <ErrorMsg>{allError}</ErrorMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      {/* ════════════════════════════════════════════════
          TIMELINE VIEW
      ════════════════════════════════════════════════ */}
      {viewMode === 'timeline' && (
        <>
          {/* Status filter chips + count */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['ALL', 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-semibold transition-colors ${statusFilter === s ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {s !== 'ALL' && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />}
                {s === 'ALL' ? 'All statuses' : STATUS_LABEL[s]}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400">
              {roomRows.length} rooms · {filteredGroups.reduce((s, g) => s + g.rooms.length, 0)} stays
            </span>
          </div>

          {/* ── Tape chart ── */}
          {allLoading && !previewData ? (
            <LoadingMsg>Loading reservation timeline…</LoadingMsg>
          ) : (
            <div className="bg-white rounded-xl border border-black/[0.06] flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 240px)', minHeight: 720 }}>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
                {roomRows.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-[13px] font-semibold text-slate-500">No rooms found for the selected filters.</p>
                  </div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: `${SIDEBAR_W}px minmax(0, 1fr)` }}>
                    <div className="border-r border-slate-100 bg-white">
                      <div className="bg-slate-50 border-b border-slate-100 flex items-end px-4 pb-2.5" style={{ height: 80 }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Room</span>
                      </div>
                      {groupedRooms.map(([category, rooms]) => {
                        const collapsed = collapsedRoomTypes.has(category);
                        return (
                          <Fragment key={category}>
                            <div className="bg-slate-50/95 border-b border-slate-100 flex items-center px-4" style={{ height: 28 }}>
                              <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{category}</span>
                              <span className="ml-1.5 text-[9px] font-semibold text-slate-400">· {rooms.length} rooms</span>
                              <button type="button" onClick={() => toggleRoomType(category)}
                                className="ml-2 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${category} rooms`}>
                                {collapsed ? <ChevronRight size={13} strokeWidth={2.4} /> : <ChevronDown size={13} strokeWidth={2.4} />}
                              </button>
                            </div>
                            {!collapsed && rooms.map(room => (
                              <div key={room.roomKey} className="border-b border-slate-100 flex items-center gap-2.5 px-4 bg-white" style={{ height: ROW_H }}>
                                <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-extrabold text-slate-600 flex-shrink-0">
                                  {room.roomNum ?? '?'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[11.5px] font-bold text-slate-800 leading-tight">
                                    Room {room.roomNum}
                                  </p>
                                  {properties.length > 1 && (
                                    <p className="text-[9.5px] text-slate-400 truncate">{room.propertyName.split(' ')[0]}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </Fragment>
                        );
                      })}
                    </div>

                    <div className="overflow-x-auto scrollbar-none overscroll-x-contain">
                      <div className="min-w-max">
                        <div className="flex border-b border-slate-100" style={{ height: 80 }}>
                          {days.map(day => {
                            const isToday = day === today;
                            const occ = occByDay[day] ?? 0;
                            const occColor = occ >= 85 ? 'bg-rose-400' : occ >= 60 ? 'bg-amber-400' : occ >= 30 ? 'bg-emerald-400' : 'bg-slate-200';
                            return (
                              <div key={day} className={`flex-shrink-0 flex flex-col items-center justify-end pb-2 gap-1 ${isToday ? 'bg-indigo-50' : isWeekend(day) ? 'bg-slate-50/60' : 'bg-slate-50/20'}`}
                                style={{ width: COL_W }}>
                                <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${occColor}`} style={{ width: `${occ}%` }} />
                                </div>
                                <span className={`text-[8.5px] font-bold leading-none ${isToday ? 'text-indigo-500' : 'text-slate-400'}`}>{occ}%</span>
                                <strong className={`text-[12px] font-bold leading-tight ${isToday ? 'text-indigo-700' : 'text-slate-800'}`}>{dayNum(day)}</strong>
                                <span className={`text-[9.5px] font-semibold leading-none ${isToday ? 'text-indigo-500' : 'text-slate-400'}`}>{dayOfWeek(day)}</span>
                              </div>
                            );
                          })}
                        </div>

                        {groupedRooms.map(([category, rooms]) => {
                          const collapsed = collapsedRoomTypes.has(category);
                          return (
                            <Fragment key={category}>
                              <div className="flex bg-slate-50/80 border-b border-slate-100" style={{ height: 28 }}>
                                {days.map(day => (
                                  <div key={day} className={`flex-shrink-0 ${day === today ? 'bg-indigo-50/60' : isWeekend(day) ? 'bg-slate-50/50' : ''}`}
                                    style={{ width: COL_W }} />
                                ))}
                              </div>
                              {!collapsed && rooms.map(room => (
                                <div key={room.roomKey} className="flex border-b border-slate-100 group" style={{ height: ROW_H }}>
                                  {days.map(day => {
                                    const bar = getBar(filteredGroups, room, day, propertyFilter, displayRoomAssignments);
                                    const isToday = day === today;
                                    const cellClass = isToday
                                      ? 'bg-indigo-50/40 group-hover:bg-indigo-50/40'
                                      : isWeekend(day)
                                        ? 'bg-slate-50/20 group-hover:bg-slate-50/20'
                                        : 'bg-white group-hover:bg-slate-50/20';

                                    if (!bar) return (
                                      <div key={day}
                                        className={`flex-shrink-0 border-b border-slate-100 ${cellClass}`}
                                        style={{ width: COL_W, height: ROW_H }} />
                                    );

                                    const visibleStart = bar.room.arrival_date > days[0] ? bar.room.arrival_date : days[0];
                                    const visibleEnd = bar.room.departure_date < addDays(days[days.length - 1], 1)
                                      ? bar.room.departure_date
                                      : addDays(days[days.length - 1], 1);
                                    const isVisibleStart = day === visibleStart;
                                    const visibleSpanDays = Math.max(1, diffDays(visibleStart, visibleEnd));
                                    const barCls    = STATUS_BAR[bar.status] ?? 'bg-slate-400 text-white';
                                    const guestName = (bar.room.guest_name ?? bar.group.primary_guest?.name ?? '').split(' ')[0];
                                    const isActualStart = bar.room.arrival_date >= days[0];
                                    const isActualEnd = bar.room.departure_date <= addDays(days[days.length - 1], 1);
                                    const barShape = isActualStart && isActualEnd
                                      ? 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)'
                                      : isActualStart
                                        ? 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)'
                                        : isActualEnd
                                          ? 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)'
                                          : undefined;

                                    return (
                                      <div key={day}
                                        className={`flex-shrink-0 relative border-b border-slate-100 ${cellClass}`}
                                        style={{ width: COL_W, height: ROW_H }}>
                                        {isVisibleStart && (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedGroupId(id => id === bar.group.id ? null : bar.group.id)}
                                            className={`absolute left-[5px] top-[10px] bottom-[10px] ${barCls} transition-shadow z-10 ${selectedGroupId === bar.group.id ? 'ring-2 ring-inset ring-white/60' : ''}`}
                                            style={{
                                              width: visibleSpanDays * COL_W - 10,
                                              ...(barShape ? { clipPath: barShape } : {}),
                                            }}
                                          >
                                            <span className="absolute inset-0 flex items-center justify-center px-2.5 overflow-hidden pointer-events-none text-center">
                                              <span className="text-[10.5px] font-semibold truncate whitespace-nowrap">{guestName}</span>
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Legend ── */}
              <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5 flex items-center gap-6 bg-white rounded-b-xl">
                {(['BOOKED', 'CHECKED_IN', 'CHECKED_OUT'] as const).map(s => (
                  <span key={s} className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-500">
                    <span className={`w-4 h-2.5 rounded-sm flex-shrink-0 ${STATUS_BAR[s].split(' ')[0]}`} />
                    {STATUS_LABEL[s]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-400 ml-2">
                  <span className="w-4 h-2.5 rounded-sm bg-indigo-100 flex-shrink-0" />Today
                </span>
                <span className="ml-auto text-[10.5px] text-slate-400">Click a bar to view reservation details</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════
          LEDGER VIEW
      ════════════════════════════════════════════════ */}
      {viewMode === 'ledger' && (
        <>
          {feedState.error && <ErrorMsg>{feedState.error}</ErrorMsg>}
          {feedState.loading && !feedState.data && !previewData && <LoadingMsg>Loading reservations…</LoadingMsg>}

          <TableCard
            title={`${feedGroups.length} reservation groups`}
            eyebrow="Reservation feed"
            scrollClassName="scrollbar-none"
            actions={
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Page {feedPage} of {feedState.data?.meta.total_pages ?? '…'}
                </span>
                <button className={secondaryBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={feedPage <= 1} onClick={() => setFeedPage(p => p - 1)} type="button">← Prev</button>
                <button className={secondaryBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={feedPage >= (feedState.data?.meta.total_pages ?? 1)} onClick={() => setFeedPage(p => p + 1)} type="button">Next →</button>
              </div>
            }
          >
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <Th>Source / reservation</Th><Th>Property</Th><Th>Dates</Th>
                  <Th>Primary guest</Th><Th>Rooms</Th><Th>Total</Th>
                  <Th>Status</Th><Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {feedGroups.map(group => (
                  <Fragment key={group.id}>
                    <tr className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                      <Td>
                        <span className="font-bold text-slate-900 block">{group.source ?? 'ZODOMUS'}</span>
                        <span className="text-xs text-slate-400 font-mono">{group.external_reservation_id}</span>
                        {group.import_blocked && <span className="text-[11px] text-rose-500 block">Import blocked</span>}
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
                        <span className="text-xs text-slate-400">{group.rooms.map(r => r.room_category.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
                      </Td>
                      <Td>{group.total_amount == null ? '—' : formatCurrency(group.total_amount)}</Td>
                      <Td><StatusBadge label={group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status} tone={group.import_blocked ? 'rose' : undefined} /></Td>
                      <Td>
                        <button
                          className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5 ${selectedGroupId === group.id ? '!bg-slate-800 !text-white !border-slate-800' : ''}`}
                          onClick={() => setSelectedGroupId(id => id === group.id ? null : group.id)}
                          type="button"
                        >
                          {selectedGroupId === group.id ? 'Close' : 'Details'}
                        </button>
                      </Td>
                    </tr>
                    {selectedGroupId === group.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/80 border-b border-slate-100 px-5 py-5">
                          <ReservationFeedDetails
                            group={group}
                            pendingId={pendingId}
                            onCheckIn={checkIn}
                            onCheckOut={checkOut}
                            onSendReminder={sendReminder}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ════════════════════════════════════════════════
          RESERVATION DETAIL DRAWER (timeline mode)
      ════════════════════════════════════════════════ */}
      {viewMode === 'timeline' && selectedGroup && createPortal(
        <>
        <button
          type="button"
          aria-label="Close reservation details"
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          onClick={() => setSelectedGroupId(null)}
        />
        <div className="fixed top-0 bottom-4 right-0 w-80 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col overflow-y-auto scrollbar-none">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Reservation</p>
              <h3 className="text-[13.5px] font-bold text-slate-900 truncate max-w-[200px]">
                {selectedGroup.primary_guest?.name ?? 'Imported guest'}
              </h3>
            </div>
            <button onClick={() => setSelectedGroupId(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="p-4 overflow-y-auto scrollbar-none">
            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded-full ${selectedGroup.reservation_status === 'CHECKED_IN' ? 'bg-emerald-50 text-emerald-700' : selectedGroup.import_blocked ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[selectedGroup.reservation_status] ?? 'bg-slate-300'}`} />
                {selectedGroup.import_blocked ? 'Import blocked' : STATUS_LABEL[selectedGroup.reservation_status] ?? selectedGroup.reservation_status}
              </span>
            </div>

            {/* Room stays */}
            {selectedGroup.rooms.map(room => (
              <div key={room.id} className="border border-slate-100 rounded-xl p-3 mb-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-800">{room.room.room_number ? `Room ${room.room.room_number}` : 'Room TBD'}</p>
                    <p className="text-[10.5px] text-slate-500">{room.room_category.name}</p>
                  </div>
                  <StatusBadge label={room.reservation_status} />
                </div>

                {[
                  ['Guest',    room.guest_name ?? selectedGroup.primary_guest?.name ?? '—'],
                  ['Arrival',  fmtLong(room.arrival_date)],
                  ['Departure',fmtLong(room.departure_date)],
                  ['Nights',   `${calculateNights(room.arrival_date, room.departure_date)} nights`],
                  ['Guests',   `${room.adults ?? 0}A / ${room.children ?? 0}C`],
                  ['Rate plan',room.rate_plan.name],
                  ['Total',    room.total_amount == null ? '—' : formatCurrency(room.total_amount)],
                ].map(([l, v]) => (
                  <div key={String(l)} className="flex items-start justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
                    <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0">{l}</span>
                    <span className="text-[11px] font-medium text-slate-800 text-right leading-tight">{v}</span>
                  </div>
                ))}

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {!selectedGroup.import_blocked && room.reservation_status === 'BOOKED' && (
                    <button disabled={pendingId === room.id} onClick={() => void checkIn(room.id)}
                      className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50 transition-colors">
                      {pendingId === room.id ? 'Processing…' : 'Check in'}
                    </button>
                  )}
                  {!selectedGroup.import_blocked && room.reservation_status === 'CHECKED_IN' && (
                    <button disabled={pendingId === room.id} onClick={() => void checkOut(room.id)}
                      className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                      {pendingId === room.id ? 'Processing…' : 'Check out'}
                    </button>
                  )}
                  {!selectedGroup.import_blocked && room.reservation_status === 'BOOKED' && (
                    <button disabled={pendingId === room.id} onClick={() => void sendReminder(room.id)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      Remind
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>,
        </>,
        document.body,
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ReservationFeedDetails (ledger expand row)
══════════════════════════════════════════════════════════ */
function ReservationFeedDetails({ group, pendingId, onCheckIn, onCheckOut, onSendReminder }: {
  group: DisplayGroup;
  pendingId: string | null;
  onCheckIn: (id: string) => Promise<void>;
  onCheckOut: (id: string) => Promise<void>;
  onSendReminder: (id: string) => Promise<void>;
}) {
  const assignedRooms = group.rooms.filter(r => r.room.room_number).length;
  const checkedInRooms = group.rooms.filter(r => r.reservation_status === 'CHECKED_IN').length;
  const checkedOutRooms = group.rooms.filter(r => r.reservation_status === 'CHECKED_OUT').length;
  const totalNights = group.rooms.reduce((s, r) => s + calculateNights(r.arrival_date, r.departure_date), 0);
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
        {[
          { label: 'Stay window',  value: `${groupNights} nights`, sub: `${group.arrival_date ?? '—'} to ${group.departure_date ?? '—'}` },
          { label: 'Room stays',   value: String(group.rooms.length), sub: `${totalNights} total booked nights` },
          { label: 'Assignments',  value: `${assignedRooms}/${group.rooms.length}`, sub: `${checkedInRooms} checked in · ${checkedOutRooms} checked out` },
          { label: 'Folio total',  value: group.total_amount == null ? '—' : formatCurrency(group.total_amount), sub: `${group.currency ?? '—'} · ${group.source ?? 'ZODOMUS'}` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{s.label}</span>
            <strong className="text-base font-extrabold text-slate-900 block">{s.value}</strong>
            <p className="text-[11px] text-slate-400 leading-relaxed">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {group.rooms.map(room => (
          <div key={room.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Room line {room.external_room_reservation_id}</p>
                <h4 className="text-sm font-bold text-slate-900">{room.room_category.name}</h4>
                <p className="text-xs text-slate-500">Assigned: {room.room.room_number ?? 'Not assigned'}</p>
              </div>
              <StatusBadge label={room.reservation_status} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Stay',      value: `${room.arrival_date} → ${room.departure_date}`, sub: `${calculateNights(room.arrival_date, room.departure_date)} nights` },
                { label: 'Rate plan', value: room.rate_plan.name,   sub: formatCurrency(room.rate_plan.base_rate) },
                { label: 'Guests',    value: room.guest_name ?? group.primary_guest?.name ?? '—', sub: `${room.adults ?? 0}A / ${room.children ?? 0}C` },
                { label: 'Total',     value: room.total_amount == null ? '—' : formatCurrency(room.total_amount), sub: room.currency ?? group.currency ?? '—' },
              ].map(chip => (
                <div key={chip.label} className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{chip.label}</span>
                  <strong className="text-xs font-bold text-slate-800 block truncate">{chip.value}</strong>
                  <p className="text-[11px] text-slate-400 truncate">{chip.sub}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!group.import_blocked && room.reservation_status === 'BOOKED' && (
                <button className={`${linkBtn} !text-xs !px-2.5 !py-1`} disabled={pendingId === room.id} onClick={() => void onCheckIn(room.id)} type="button">
                  {pendingId === room.id ? 'Processing…' : 'Check in'}
                </button>
              )}
              {!group.import_blocked && room.reservation_status === 'CHECKED_IN' && (
                <button className={`${linkBtn} !text-xs !px-2.5 !py-1`} disabled={pendingId === room.id} onClick={() => void onCheckOut(room.id)} type="button">
                  {pendingId === room.id ? 'Processing…' : 'Check out'}
                </button>
              )}
              {!group.import_blocked && room.reservation_status === 'BOOKED' && (
                <button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5`} disabled={pendingId === room.id} onClick={() => void onSendReminder(room.id)} type="button">
                  {pendingId === room.id ? 'Processing…' : 'Send reminder'}
                </button>
              )}
              {group.import_blocked && <span className="text-xs text-rose-500">{group.import_error ?? 'Import blocked'}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Duplicate grouping helpers (unchanged) ────────── */
function groupVisibleReservations(groups: ReservationGroup[]): DisplayGroup[] {
  const groupedBlocked  = new Map<string, DisplayGroup>();
  const groupedImported = new Map<string, DisplayGroup>();
  const importedSigs    = new Set(groups.filter(g => !g.import_blocked).map(buildOperationalSig));
  const visible: DisplayGroup[] = [];

  for (const g of groups) {
    if (!g.import_blocked) {
      const sig = buildDupSig(g);
      const ex  = groupedImported.get(sig);
      if (ex) { ex.duplicate_reservation_ids = [...(ex.duplicate_reservation_ids ?? [ex.external_reservation_id]), g.external_reservation_id]; ex.duplicate_count = (ex.duplicate_count ?? 1) + 1; continue; }
      const first: DisplayGroup = { ...g, duplicate_reservation_ids: [g.external_reservation_id], duplicate_count: 1 };
      groupedImported.set(sig, first); visible.push(first); continue;
    }
    const opSig = buildOperationalSig(g);
    if (importedSigs.has(opSig)) continue;
    const sig = `${opSig}::${(g.import_error ?? '').trim().toLowerCase()}`;
    const ex  = groupedBlocked.get(sig);
    if (!ex) { const first: DisplayGroup = { ...g, duplicate_reservation_ids: [g.external_reservation_id], duplicate_count: 1 }; groupedBlocked.set(sig, first); visible.push(first); continue; }
    ex.duplicate_reservation_ids = [...(ex.duplicate_reservation_ids ?? [ex.external_reservation_id]), g.external_reservation_id]; ex.duplicate_count = (ex.duplicate_count ?? 1) + 1;
  }
  return visible;
}
function buildDupSig(g: ReservationGroup) {
  const guest = (g.primary_guest?.name ?? '').trim().toLowerCase();
  const rooms = g.rooms.map(r => `${r.external_room_reservation_id}:${r.external_room_id}:${r.arrival_date}:${r.departure_date}`).sort().join('|');
  return [g.property.id, guest, g.arrival_date ?? '', g.departure_date ?? '', rooms].join('::');
}
function buildOperationalSig(g: ReservationGroup) {
  const guest = (g.primary_guest?.name ?? '').trim().toLowerCase();
  const rooms = g.rooms.map(r => `${r.external_room_id}:${r.arrival_date}:${r.departure_date}`).sort().join('|');
  return [g.property.id, guest, g.arrival_date ?? '', g.departure_date ?? '', rooms].join('::');
}
