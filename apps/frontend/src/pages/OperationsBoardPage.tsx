import { ReactNode, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { Billing, DashboardSummary, HousekeepingTask, Property, ReservationGroup } from '../api/types';
import { fetchAllPages } from '../api/pagination';
import { CustomSelect } from '../components/CustomSelect';
import { formatCurrency } from '../utils/format';
import { createPreviewData, isPreviewId } from './previewData';

type BoardRow = {
  reservation_group_id: string;
  reservation_group_status: ReservationGroup['reservation_status'];
  external_reservation_id: string;
  property: ReservationGroup['property'];
  primary_guest_name: string;
  room: ReservationGroup['rooms'][number];
};
type OperationsBoardData = {
  billings: Billing[];
  dashboard: DashboardSummary;
  housekeeping: HousekeepingTask[];
  properties: Property[];
  reservationGroups: ReservationGroup[];
};
type OperationsBoardState = { data: OperationsBoardData | null; error: string | null; loading: boolean };

let operationsBoardCache: OperationsBoardData | null = null;
let operationsBoardCacheUpdatedAt = 0;
const operationsBoardCacheTtlMs = 60_000;

function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmtDate(d: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${d}T00:00:00`));
}
function daysUntil(dep: string, today: string) {
  return Math.max(0, Math.round((new Date(dep + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000));
}
function dayDiff(from: string, to: string) {
  return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000);
}

/* ── Category dot color — softer palette ── */
const CAT_COLORS: Record<string, { dot: string }> = {
  'Suite':           { dot: 'bg-amber-400' },
  'Deluxe King':     { dot: 'bg-violet-400' },
  'Superior Twin':   { dot: 'bg-indigo-400' },
  'Classic Double':  { dot: 'bg-sky-400' },
  'Standard Single': { dot: 'bg-slate-400' },
};
function catDot(name: string) { return CAT_COLORS[name]?.dot ?? 'bg-slate-400'; }

/* ── Room badge — soft indigo ── */
function RoomBadge({ num, size = 'md' }: { num: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-[10px]' : size === 'lg' ? 'w-11 h-11 text-[13px]' : 'w-[38px] h-[38px] text-[11px]';
  if (!num) return (
    <span className={`flex-shrink-0 ${dim} rounded-xl flex items-center justify-center font-extrabold bg-slate-50 text-slate-400 border border-slate-200`}>
      TBD
    </span>
  );
  return (
    <span className={`flex-shrink-0 ${dim} rounded-xl flex items-center justify-center font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200`}>
      {num}
    </span>
  );
}

/* ── Status badge ── */
function StatusBadge({ isLate, isDueOut, isOut }: { isLate?: boolean; isDueOut?: boolean; isOut?: boolean }) {
  if (isLate) return <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex-shrink-0">LATE</span>;
  if (isOut)  return <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex-shrink-0">OUT</span>;
  if (isDueOut) return <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 flex-shrink-0">DUE OUT</span>;
  return null;
}

/* ── Check-in card ── */
function CheckInCard({ row, balanceDue, hkOpen, today, onCheckIn, onRemind, pending }: {
  row: BoardRow; balanceDue: number; hkOpen: boolean; today: string;
  onCheckIn: () => void; onRemind: () => void; pending: boolean;
}) {
  const isLate = row.room.arrival_date < today && row.room.reservation_status === 'BOOKED';
  const guestName = row.room.guest_name ?? row.primary_guest_name;
  const roomNum = row.room.room.room_number ?? null;

  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] hover:border-black/[0.12] hover:shadow-sm transition-all">
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <RoomBadge num={roomNum} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{guestName}</p>
              <StatusBadge isLate={isLate} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${catDot(row.room.room_category.name)}`} />
              <span className="text-[11px] font-semibold text-slate-500">{row.room.room_category.name}</span>
              <span className="text-[11px] text-slate-400">{row.property.name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-3 flex-wrap">
          <code className="font-mono bg-slate-50 border border-slate-100 rounded-md px-1.5 py-0.5 text-[10px] text-slate-500">{row.external_reservation_id}</code>
          <span>{fmtDate(row.room.arrival_date)} → {fmtDate(row.room.departure_date)}</span>
          {hkOpen && <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">HK open</span>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-2">
            {row.room.total_amount != null && <span className="text-[13px] font-bold text-slate-800">{formatCurrency(row.room.total_amount)}</span>}
            {balanceDue > 0 && <span className="text-[11px] font-semibold text-rose-500">{formatCurrency(balanceDue)} due</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button disabled={pending} onClick={onRemind} className="h-7 px-3 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors">
              Remind
            </button>
            <button disabled={pending} onClick={onCheckIn} className="h-7 px-3.5 text-[11px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors">
              {pending ? 'Processing…' : 'Check in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Departure card ── */
function DepartureCard({ row, balanceDue, today, onCheckOut, pending }: {
  row: BoardRow; balanceDue: number; today: string; onCheckOut: () => void; pending: boolean;
}) {
  const isDueOut  = row.room.departure_date === today && row.room.reservation_status === 'CHECKED_IN';
  const isOut     = row.room.reservation_status === 'CHECKED_OUT';
  const guestName = row.room.guest_name ?? row.primary_guest_name;
  const roomNum   = row.room.room.room_number ?? null;

  return (
    <div className={`bg-white rounded-2xl border border-black/[0.06] hover:border-black/[0.12] hover:shadow-sm transition-all ${isOut ? 'opacity-50' : ''}`}>
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <RoomBadge num={roomNum} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{guestName}</p>
              <StatusBadge isDueOut={isDueOut && !isOut} isOut={isOut} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${catDot(row.room.room_category.name)}`} />
              <span className="text-[11px] font-semibold text-slate-500">{row.room.room_category.name}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-3">
          <code className="font-mono bg-slate-50 border border-slate-100 rounded-md px-1.5 py-0.5 text-[10px] text-slate-500">{row.external_reservation_id}</code>
          <span>{fmtDate(row.room.arrival_date)} → {fmtDate(row.room.departure_date)}</span>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          <div className="flex items-center gap-2">
            {row.room.total_amount != null && <span className="text-[13px] font-bold text-slate-800">{formatCurrency(row.room.total_amount)}</span>}
            {balanceDue > 0 && <span className="text-[11px] font-semibold text-rose-500">{formatCurrency(balanceDue)} due</span>}
          </div>
          {!isOut && (
            <button disabled={pending} onClick={onCheckOut} className="h-7 px-3.5 text-[11px] font-bold rounded-lg bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-40 transition-colors">
              {pending ? 'Processing…' : 'Check out'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── In-house compact grid tile ── */
function RoomTile({ row, balanceDue, hkOpen, today, onOpen }: {
  row: BoardRow; balanceDue: number; hkOpen: boolean; today: string; onOpen: () => void;
}) {
  const days    = daysUntil(row.room.departure_date, today);
  const barPct  = Math.min((days / 7) * 100, 100);
  const barColor = days <= 0 ? 'bg-amber-400' : days <= 3 ? 'bg-slate-400' : 'bg-emerald-400';
  const hasAlert = hkOpen || balanceDue > 0;
  const roomNum  = row.room.room.room_number ?? null;
  const guest    = row.room.guest_name ?? row.primary_guest_name;
  const parts    = guest.split(' ');
  const shortName = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : guest;

  return (
    <button type="button" onClick={onOpen} className={`relative w-full text-left bg-white rounded-xl border p-2.5 cursor-pointer hover:-translate-y-0.5 focus:ring-2 focus:ring-indigo-200 transition-all ${
      hasAlert ? 'border-amber-200 bg-amber-50/20' : 'border-black/[0.06] hover:border-black/[0.12]'
    }`}>
      {/* Alert badges */}
      {(hkOpen || balanceDue > 0) && (
        <div className="absolute top-1.5 right-1.5 flex gap-0.5">
          {hkOpen      && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-600">HK</span>}
          {balanceDue > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-rose-100 text-rose-600">BAL</span>}
        </div>
      )}
      {/* Room badge */}
      <div className={`text-[11px] font-extrabold w-10 h-7 rounded-lg flex items-center justify-center mb-2 ${
        !roomNum ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
      }`}>
        {roomNum ?? 'TBD'}
      </div>
      {/* Name */}
      <p className="text-[11px] font-semibold text-slate-800 leading-tight truncate mb-0.5">{shortName}</p>
      {/* Category */}
      <div className="flex items-center gap-1 mb-2.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${catDot(row.room.room_category.name)}`} />
        <span className="text-[9.5px] text-slate-400 truncate">{row.room.room_category.name}</span>
      </div>
      {/* Days bar */}
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden mb-1.5">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[9.5px]">
        <span className={days <= 0 ? 'text-amber-500 font-bold' : 'text-slate-400'}>
          {days === 0 ? 'Today' : `${days}d`}
        </span>
        <span className="text-slate-400">{fmtDate(row.room.departure_date)}</span>
      </div>
      <span className="mt-2 block text-[9px] font-bold text-indigo-500">View stay details</span>
    </button>
  );
}

/* ── HK task status ── */
const HK_STATUS: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  CLEAN:          { dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Clean' },
  DIRTY:          { dot: 'bg-rose-400',    bg: 'bg-rose-50',    text: 'text-rose-600',    label: 'Dirty' },
  CLEANING:       { dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-600',   label: 'Cleaning' },
  INSPECTED:      { dot: 'bg-violet-400',  bg: 'bg-violet-50',  text: 'text-violet-600',  label: 'Inspected' },
  OUT_OF_SERVICE: { dot: 'bg-slate-400',   bg: 'bg-slate-100',  text: 'text-slate-600',   label: 'Out of service' },
};

/* ── Column label/header ── */
function ColHeader({ label, title, count, right }: { label: string; title: string; count: number; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <p className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <h3 className="text-[14px] font-bold text-slate-700">{title}</h3>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-center">{count}</span>
        </div>
      </div>
      {right}
    </div>
  );
}

function EmptyCol({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] py-12 flex flex-col items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
        <span className="w-2 h-2 rounded-full bg-emerald-500" /> All clear
      </span>
      <p className="text-[11.5px] font-semibold text-slate-400">{label}</p>
    </div>
  );
}

function FloatingSuccessToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed left-4 right-4 top-20 z-50 flex justify-center lg:left-auto lg:right-6 lg:top-6 lg:justify-end">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-emerald-500/70 bg-emerald-500 text-white shadow-[0_18px_40px_-20px_rgba(22,163,74,0.5)]">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-emerald-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-5 text-white">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss success message"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export function OperationsBoardPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const [reloadKey, setReloadKey]         = useState(0);
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [searchQuery, setSearchQuery]     = useState('');
  const [activeTab, setActiveTab]         = useState<'board' | 'housekeeping'>('board');
  const [selectedInHouseRow, setSelectedInHouseRow] = useState<BoardRow | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId]         = useState<string | null>(null);
  const [boardState, setBoardState]       = useState<OperationsBoardState>(() => ({
    data: operationsBoardCache, error: null, loading: !operationsBoardCache,
  }));
  const today = getLocalDate();

  useEffect(() => {
    if (!actionSuccess) return;
    const timeoutId = window.setTimeout(() => setActionSuccess(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [actionSuccess]);

  useEffect(() => {
    let active = true;
    const hasFreshCache = operationsBoardCache && reloadKey === 0 && Date.now() - operationsBoardCacheUpdatedAt < operationsBoardCacheTtlMs;
    if (hasFreshCache) { setBoardState({ data: operationsBoardCache, error: null, loading: false }); return () => { active = false; }; }
    setBoardState(cur => ({ ...cur, error: null, loading: !cur.data }));
    Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      fetchAllPages<ReservationGroup>('/bookings/groups'),
      fetchAllPages<Property>('/properties'),
      fetchAllPages<HousekeepingTask>('/housekeeping'),
      fetchAllPages<Billing>('/billings'),
    ]).then(([dashRes, groups, props, hk, bills]) => {
      if (!active) return;
      const next: OperationsBoardData = { billings: bills, dashboard: dashRes.data, housekeeping: hk, properties: props, reservationGroups: groups };
      operationsBoardCache = next; operationsBoardCacheUpdatedAt = Date.now();
      setBoardState({ data: next, error: null, loading: false });
    }).catch((err: unknown) => {
      if (!active) return;
      setBoardState(cur => ({ data: cur.data, error: getApiErrorMessage(err), loading: false }));
    });
    return () => { active = false; };
  }, [reloadKey]);

  function blockPreviewAction(id: string) {
    if (!isPreviewId(id)) return false;
    setActionSuccess(null);
    setActionError('Sample preview records are read-only. Turn off sample data to work with live records.');
    return true;
  }
  async function checkIn(id: string)      { if (blockPreviewAction(id)) return; setActionError(null); setActionSuccess(null); setPendingId(id); try { await api.put(`/bookings/groups/rooms/${id}/checkin`);          setReloadKey(v => v + 1); } catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); } }
  async function checkOut(id: string)     { if (blockPreviewAction(id)) return; setActionError(null); setActionSuccess(null); setPendingId(id); try { await api.put(`/bookings/groups/rooms/${id}/checkout`);         setReloadKey(v => v + 1); } catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); } }
  async function sendReminder(id: string) { if (blockPreviewAction(id)) return; setActionError(null); setActionSuccess(null); setPendingId(id); try { await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`); setActionSuccess('Reminder sent successfully.'); setReloadKey(v => v + 1); } catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); } }

  const previewData  = previewDataEnabled ? createPreviewData() : null;
  const data         = previewData ? { billings: previewData.billings, dashboard: previewData.dashboard, housekeeping: previewData.housekeeping, properties: previewData.properties, reservationGroups: previewData.reservationGroups } : boardState.data;
  const properties   = data?.properties ?? [];
  const normalizedQ  = searchQuery.trim().toLowerCase();
  const reservations = (data?.reservationGroups ?? []).filter(g => propertyFilter === 'ALL' || g.property.id === propertyFilter);
  const hkTasks      = (data?.housekeeping ?? []).filter(t => propertyFilter === 'ALL' || t.property.id === propertyFilter);
  const billings     = (data?.billings ?? []).filter(b => propertyFilter === 'ALL' || b.reservation_room.property.id === propertyFilter);

  const roomBalanceMap  = new Map<string, number>();
  const groupBalanceMap = new Map<string, number>();
  for (const b of billings) {
    roomBalanceMap.set(b.reservation_room_id, (roomBalanceMap.get(b.reservation_room_id) ?? 0) + b.balance_due);
    groupBalanceMap.set(b.reservation_room.reservation_group_id, (groupBalanceMap.get(b.reservation_room.reservation_group_id) ?? 0) + b.balance_due);
  }

  const openTasksByRoomId = new Map<string, HousekeepingTask[]>();
  for (const task of hkTasks) {
    if (task.status === 'CLEAN') continue;
    const cur = openTasksByRoomId.get(task.room_id) ?? [];
    cur.push(task); openTasksByRoomId.set(task.room_id, cur);
  }

  const allRows: BoardRow[] = reservations.flatMap(g =>
    g.rooms.map(r => ({
      reservation_group_id: g.id, reservation_group_status: g.reservation_status,
      external_reservation_id: g.external_reservation_id, property: g.property,
      primary_guest_name: g.primary_guest?.name ?? 'Imported guest', room: r,
    }))
  );
  const filteredRows = normalizedQ
    ? allRows.filter(row => [row.room.guest_name, row.primary_guest_name, row.property.name, row.external_reservation_id, row.room.room.room_number, row.room.room_category.name, row.room.rate_plan.name].filter(Boolean).join(' ').toLowerCase().includes(normalizedQ))
    : allRows;

  const lateArrivalCutoffDays = 2;
  const arrivals     = filteredRows.filter(r => r.room.arrival_date === today && r.room.reservation_status === 'BOOKED');
  const inHouse      = filteredRows.filter(r => r.room.reservation_status === 'CHECKED_IN').sort((a, b) => a.room.departure_date.localeCompare(b.room.departure_date));
  const departures   = filteredRows.filter(r => r.room.departure_date === today && ['CHECKED_IN', 'CHECKED_OUT'].includes(r.room.reservation_status)).sort((a, b) => a.primary_guest_name.localeCompare(b.primary_guest_name));
  const lateArrivals = filteredRows.filter(r =>
    r.room.arrival_date < today &&
    r.room.reservation_status === 'BOOKED' &&
    dayDiff(r.room.arrival_date, today) <= lateArrivalCutoffDays
  );
  const checkedInToday = filteredRows.filter(r => r.room.arrival_date === today && r.room.reservation_status === 'CHECKED_IN').length;
  const checkInQueue = [...lateArrivals, ...arrivals].sort((a, b) => {
    const la = a.room.arrival_date < today, lb = b.room.arrival_date < today;
    if (la !== lb) return la ? -1 : 1;
    return a.room.arrival_date.localeCompare(b.room.arrival_date) || a.primary_guest_name.localeCompare(b.primary_guest_name);
  });

  const hkBlockedRows  = filteredRows.filter(r => r.room.room.id && (openTasksByRoomId.get(r.room.room.id) ?? []).length > 0);
  const balanceDueRows = departures.filter(r => (groupBalanceMap.get(r.reservation_group_id) ?? 0) > 0);
  const totalBalance   = normalizedQ
    ? Array.from(new Set(filteredRows.map(r => r.reservation_group_id)), id => groupBalanceMap.get(id) ?? 0).reduce((s, v) => s + v, 0)
    : (data?.dashboard.pending_balance_total ?? 0);

  const depCleared   = departures.filter(r => r.room.reservation_status === 'CHECKED_OUT').length;
  const occupancyDone = data?.dashboard.occupied_rooms ?? inHouse.length;
  const occupancyTotal = data?.dashboard.total_rooms ?? 0;
  const occupancyPct = occupancyTotal > 0 ? Math.round((occupancyDone / occupancyTotal) * 100) : 0;
  const checkInTotal = checkedInToday + arrivals.length;
  const hasAlerts    = lateArrivals.length > 0 || hkBlockedRows.length > 0 || balanceDueRows.length > 0;
  const hkOpen       = hkTasks.filter(t => t.status !== 'CLEAN');
  const hkStatuses   = ['DIRTY', 'CLEANING', 'CLEAN', 'INSPECTED', 'OUT_OF_SERVICE'] as const;

  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${today}T00:00:00`));

  return (
    <div className="min-h-screen -mx-5 lg:-mx-8 -my-6 lg:-my-8 bg-[#f5f5f3] flex flex-col">
      <FloatingSuccessToast message={actionSuccess} onClose={() => setActionSuccess(null)} />

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-black/[0.06]">

        {/* Row 1: title + date + summary chips */}
        <div className="flex items-start justify-between gap-4 px-5 lg:px-8 pt-6 lg:pt-8 pb-4">
          <div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
              <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Operations Board</h1>
              <p className="text-[12px] text-slate-400 mt-1">Front-desk arrivals, departures, in-house stays, and room-readiness alerts</p>
            </div>
            <div className="flex items-center gap-2.5 mt-2">
              <span className="text-[13px] font-semibold text-slate-500">{dateLabel}</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            </div>
          </div>
          <div className="flex w-full max-w-[34rem] flex-shrink-0 flex-col gap-3 pt-1">
            <div className="flex items-center justify-end gap-2">
              {[
                { label: `${checkInQueue.length} arriving`,  dot: 'bg-indigo-400', alert: lateArrivals.length > 0 },
                { label: `${inHouse.length} in house`,       dot: 'bg-emerald-400', alert: false },
                { label: `${departures.length} departing`,   dot: 'bg-amber-400',  alert: false },
              ].map(c => (
                <span key={c.label} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border ${c.alert ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  <i className={`w-2 h-2 rounded-full not-italic ${c.dot}`} />{c.label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 md:grid-cols-3">
              {[
                { label: 'Occupancy', value: occupancyTotal > 0 ? `${occupancyDone}/${occupancyTotal}` : `${occupancyDone}/—`, pct: occupancyPct, color: 'bg-sky-400' },
                { label: 'Departures closed', value: `${depCleared}/${departures.length}`, pct: departures.length > 0 ? Math.round((depCleared / departures.length) * 100) : 0, color: 'bg-emerald-400' },
                { label: 'Check-ins completed', value: `${checkedInToday}/${checkInTotal}`, pct: checkInTotal > 0 ? Math.round((checkedInToday / checkInTotal) * 100) : 0, color: 'bg-indigo-400' },
              ].map(p => (
                <div key={p.label}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-semibold text-slate-500">{p.label}</span>
                    <span className="text-[10.5px] font-extrabold text-slate-700">{p.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white">
                    <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: search + property filter */}
        <div className="flex items-center gap-3 px-5 lg:px-8 pb-4">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Guest, room, reservation…"
              className="h-10 w-72 rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-[12px] text-slate-700 outline-none placeholder-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Property toggle pills */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setPropertyFilter('ALL')} className={`h-8 px-3 rounded-lg text-[11px] font-semibold transition-colors ${propertyFilter === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              All
            </button>
            {properties.map(p => (
              <button key={p.id} onClick={() => setPropertyFilter(p.id)} className={`h-8 px-3 rounded-lg text-[11px] font-semibold transition-colors ${propertyFilter === p.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {p.name}
              </button>
            ))}
          </div>

          {(propertyFilter !== 'ALL' || normalizedQ) && (
            <button onClick={() => { setPropertyFilter('ALL'); setSearchQuery(''); }} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors">
              Reset ×
            </button>
          )}

        </div>

        {/* Tab row */}
        <div className="flex items-center border-t border-black/[0.04] px-5 lg:px-8">
          {([['board', 'Board'], ['housekeeping', `Housekeeping (${hkOpen.length} open)`]] as [string, string][]).map(([id, lbl]) => (
            <button key={id} onClick={() => setActiveTab(id as typeof activeTab)}
              className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors ${activeTab === id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </header>

      <div className="px-6 py-5 space-y-4">

        {/* ── Errors ── */}
        {(boardState.error || actionError) && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <svg className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6" strokeLinecap="round"/></svg>
            <p className="text-[12px] text-rose-700 font-semibold">{boardState.error ?? actionError}</p>
          </div>
        )}

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Arrivals',       value: (normalizedQ ? checkInQueue.length : (data?.dashboard.reservation_room_arrivals_today ?? checkInQueue.length)).toString(), sub: lateArrivals.length > 0 ? `${lateArrivals.length} late` : 'On schedule', dot: 'bg-indigo-400', alert: lateArrivals.length > 0 },
            { label: 'In house',       value: inHouse.length.toString(),        sub: `${data?.dashboard.occupied_rooms ?? inHouse.length}/${data?.dashboard.total_rooms ?? '—'} occupied`, dot: 'bg-emerald-400', alert: false },
            { label: 'Departing',      value: (normalizedQ ? departures.length : (data?.dashboard.reservation_room_departures_today ?? departures.length)).toString(), sub: `${depCleared} cleared`, dot: 'bg-amber-400', alert: false },
            { label: 'HK tasks',       value: hkOpen.length.toString(),         sub: `${hkBlockedRows.length} room-stay alerts`, dot: 'bg-violet-400', alert: hkBlockedRows.length > 0 },
            { label: 'Balance due',    value: formatCurrency(totalBalance),      sub: `${balanceDueRows.length} folios open`, dot: 'bg-rose-400', alert: totalBalance > 0 },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-black/[0.06] px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${k.dot}`} />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k.label}</p>
              </div>
              <p className="text-[1.65rem] font-extrabold text-slate-800 leading-none tracking-tight">{k.value}</p>
              <p className={`text-[11px] font-semibold mt-1.5 ${k.alert ? 'text-rose-500' : 'text-slate-400'}`}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Alert banner ── */}
        {hasAlerts && activeTab === 'board' && (
          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-2.5 bg-amber-50/60 border-b border-amber-100">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <p className="text-[11.5px] font-bold text-amber-800">
                {[
                  lateArrivals.length > 0    && `${lateArrivals.length} late arrival${lateArrivals.length > 1 ? 's' : ''}`,
                  hkBlockedRows.length > 0   && `${hkBlockedRows.length} HK alert${hkBlockedRows.length > 1 ? 's' : ''}`,
                  balanceDueRows.length > 0  && `${balanceDueRows.length} balance${balanceDueRows.length > 1 ? 's' : ''} due`,
                ].filter(Boolean).join(' · ')} — needs attention
              </p>
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-2">
              {lateArrivals.map(r => (
                <div key={r.room.id} className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                  <RoomBadge num={r.room.room.room_number ?? null} size="sm" />
                  <div><p className="text-[11px] font-bold text-rose-700">{r.room.guest_name ?? r.primary_guest_name}</p><p className="text-[10px] text-rose-500">Late since {fmtDate(r.room.arrival_date)}</p></div>
                </div>
              ))}
              {hkBlockedRows.map(r => (
                <div key={r.room.id} className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <RoomBadge num={r.room.room.room_number ?? null} size="sm" />
                  <div><p className="text-[11px] font-bold text-amber-700">{r.room.guest_name ?? r.primary_guest_name}</p><p className="text-[10px] text-amber-500">HK task open</p></div>
                </div>
              ))}
              {balanceDueRows.map(r => (
                <div key={r.room.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <RoomBadge num={r.room.room.room_number ?? null} size="sm" />
                  <div><p className="text-[11px] font-bold text-slate-700">{r.room.guest_name ?? r.primary_guest_name}</p><p className="text-[10px] text-rose-500">{formatCurrency(groupBalanceMap.get(r.reservation_group_id) ?? 0)} due</p></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Board tab ── */}
        {activeTab === 'board' && (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-5 items-start">

            {/* Col 1 — Check-in queue */}
            <div>
              <ColHeader label="Arrivals today" title="Check-in queue" count={checkInQueue.length}
                right={lateArrivals.length > 0 ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">{lateArrivals.length} late</span> : undefined} />
              <div className="space-y-2.5">
                {checkInQueue.length === 0 ? <EmptyCol label="No arrivals queued" /> : checkInQueue.map(row => (
                  <CheckInCard
                    key={row.room.id}
                    row={row}
                    balanceDue={groupBalanceMap.get(row.reservation_group_id) ?? 0}
                    hkOpen={(row.room.room.id ? (openTasksByRoomId.get(row.room.room.id) ?? []) : []).length > 0}
                    today={today}
                    pending={pendingId === row.room.id}
                    onCheckIn={() => void checkIn(row.room.id)}
                    onRemind={() => void sendReminder(row.room.id)}
                  />
                ))}
              </div>
            </div>

            {/* Col 2 — In-house grid */}
            <div className="space-y-4">

              {/* In-house compact grid */}
              <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.04]">
                  <div className="flex items-center gap-2.5">
                    <p className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400">In house</p>
                    <h3 className="text-[14px] font-bold text-slate-700">Current stays</h3>
                    <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600 flex items-center justify-center">{inHouse.length}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {Object.entries(CAT_COLORS).slice(0, 4).map(([cat, { dot }]) => (
                      <span key={cat} className="flex items-center gap-1 text-[9.5px] text-slate-400">
                        <i className={`w-2 h-2 rounded-full not-italic ${dot}`} />{cat.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                </div>
                {inHouse.length === 0 ? (
                  <div className="py-12 text-center">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> All clear
                    </span>
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
                    {inHouse.map(row => (
                      <RoomTile
                        key={row.room.id}
                        row={row}
                        balanceDue={groupBalanceMap.get(row.reservation_group_id) ?? 0}
                        hkOpen={(row.room.room.id ? (openTasksByRoomId.get(row.room.room.id) ?? []) : []).length > 0}
                        today={today}
                        onOpen={() => setSelectedInHouseRow(row)}
                      />
                    ))}
                  </div>
                )}
                <div className="px-5 py-2.5 border-t border-black/[0.04] bg-[#f9f9f7] flex items-center justify-between">
                  <div className="flex items-center gap-4 text-[10.5px] text-slate-400">
                    <span className="flex items-center gap-1.5"><i className="not-italic w-1.5 h-1.5 rounded-full bg-emerald-400" />Plenty of time</span>
                    <span className="flex items-center gap-1.5"><i className="not-italic w-1.5 h-1.5 rounded-full bg-slate-400" />Departing soon</span>
                    <span className="flex items-center gap-1.5"><i className="not-italic w-1.5 h-1.5 rounded-full bg-amber-400" />Today / due out</span>
                  </div>
                  <span className="text-[10.5px] font-semibold text-slate-400">Select a tile to view stay details</span>
                </div>
              </div>
            </div>

            {/* Col 3 — Departures + next arrivals */}
            <div className="space-y-4">
              <div>
                <ColHeader label="Departures today" title="Checkouts" count={departures.length}
                  right={<span className="text-[10.5px] font-semibold text-slate-400">{depCleared}/{departures.length} cleared</span>} />
                <div className="space-y-2.5">
                  {departures.length === 0 ? <EmptyCol label="No departures today" /> : departures.map(row => (
                    <DepartureCard
                      key={row.room.id}
                      row={row}
                      balanceDue={groupBalanceMap.get(row.reservation_group_id) ?? 0}
                      today={today}
                      pending={pendingId === row.room.id}
                      onCheckOut={() => void checkOut(row.room.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Next arrivals */}
              <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-black/[0.04]">
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Upcoming</p>
                  <h3 className="text-[13px] font-bold text-slate-700">Next to arrive</h3>
                </div>
                <div className="divide-y divide-black/[0.03]">
                  {checkInQueue.filter(r => r.room.arrival_date >= today).slice(0, 5).map(r => (
                    <div key={r.room.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${catDot(r.room.room_category.name)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-bold text-slate-700 truncate">{r.room.guest_name ?? r.primary_guest_name}</p>
                        <p className="text-[10px] text-slate-400">{r.room.room_category.name} · {fmtDate(r.room.arrival_date)}</p>
                      </div>
                    </div>
                  ))}
                  {checkInQueue.filter(r => r.room.arrival_date >= today).length === 0 && (
                    <p className="px-5 py-4 text-[11px] text-slate-400">No further arrivals today</p>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Housekeeping tab ── */}
        {activeTab === 'housekeeping' && (
          <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.04]">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-violet-500 mb-0.5">Housekeeping</p>
                <h3 className="text-[14px] font-bold text-slate-700">{hkTasks.length} tasks today · {hkOpen.length} open</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {hkStatuses.map(st => {
                  const sc = HK_STATUS[st];
                  const n  = hkTasks.filter(t => t.status === st).length;
                  return (
                    <span key={st} className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full ${sc.bg} ${sc.text}`}>
                      <i className={`w-2 h-2 rounded-full not-italic ${sc.dot}`} />{sc.label} ({n})
                    </span>
                  );
                })}
              </div>
            </div>
            {hkTasks.length === 0 ? (
              <div className="py-16 text-center">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">All rooms clean</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px]">
                  <thead>
                    <tr className="bg-[#f9f9f7] border-b border-black/[0.04]">
                      {['Room', 'Type', 'Status', 'Priority'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hkTasks.map(t => {
                      const sc = HK_STATUS[t.status] ?? HK_STATUS['DIRTY'];
                      return (
                        <tr key={t.id} className="border-b border-black/[0.04] last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-[12px] font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">{t.room.room_number ?? 'TBD'}</span>
                          </td>
                          <td className="px-5 py-3.5 text-[12px] font-semibold text-slate-700">{t.room.room_category.name}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${sc.bg} ${sc.text}`}>
                              <i className={`w-1.5 h-1.5 rounded-full not-italic ${sc.dot}`} />{sc.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-[11px] text-slate-400 font-medium">{t.priority}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {selectedInHouseRow && (
        <InHouseStayModal
          balanceDue={groupBalanceMap.get(selectedInHouseRow.reservation_group_id) ?? 0}
          hkOpen={Boolean(selectedInHouseRow.room.room.id && (openTasksByRoomId.get(selectedInHouseRow.room.room.id) ?? []).length > 0)}
          onClose={() => setSelectedInHouseRow(null)}
          row={selectedInHouseRow}
          today={today}
        />
      )}
    </div>
  );
}

function InHouseStayModal({ balanceDue, hkOpen, onClose, row, today }: {
  balanceDue: number;
  hkOpen: boolean;
  onClose: () => void;
  row: BoardRow;
  today: string;
}) {
  const guestName = row.room.guest_name ?? row.primary_guest_name;
  const remainingDays = daysUntil(row.room.departure_date, today);
  return (
    <>
      <button aria-label="Close stay details" className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} type="button" />
      <section aria-label="In-house stay details" className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">In-house stay</p>
            <h3 className="mt-1 text-[18px] font-black text-slate-900">{guestName}</h3>
            <p className="mt-0.5 text-[12px] text-slate-400">{row.property.name}</p>
          </div>
          <button aria-label="Close stay details" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button">×</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <RoomBadge num={row.room.room.room_number ?? null} size="lg" />
            <div>
              <p className="text-[13px] font-bold text-slate-800">{row.room.room_category.name}</p>
              <p className="text-[11px] text-slate-500">{row.room.rate_plan.name}</p>
            </div>
          </div>
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100 px-4">
            {[
              ['Reservation', row.external_reservation_id],
              ['Arrival', fmtDate(row.room.arrival_date)],
              ['Departure', fmtDate(row.room.departure_date)],
              ['Remaining', remainingDays === 0 ? 'Due out today' : `${remainingDays} day${remainingDays === 1 ? '' : 's'}`],
              ['Guests', `${row.room.adults ?? 0} adult${row.room.adults === 1 ? '' : 's'} · ${row.room.children ?? 0} child${row.room.children === 1 ? '' : 'ren'}`],
              ['Stay total', row.room.total_amount == null ? '—' : formatCurrency(row.room.total_amount)],
            ].map(([label, value]) => (
              <div className="flex items-start justify-between gap-3 py-3" key={label}>
                <dt className="text-[11px] font-semibold text-slate-400">{label}</dt>
                <dd className="text-right text-[12px] font-bold text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-2 rounded-xl border border-slate-100 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Operational status</p>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${hkOpen ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {hkOpen ? 'Housekeeping task open' : 'No housekeeping blocker'}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${balanceDue > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {balanceDue > 0 ? `${formatCurrency(balanceDue)} balance due` : 'Folio clear'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
