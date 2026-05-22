import { ReactNode, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { Billing, DashboardSummary, HousekeepingTask, Property, ReservationGroup } from '../api/types';
import { fetchAllPages } from '../api/pagination';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { formatCurrency } from '../utils/format';
import { MetricCard, StatusBadge, labelCls, inputCls, secondaryBtn, linkBtn, ErrorMsg, LoadingMsg } from './ui';

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
type OperationsBoardState = {
  data: OperationsBoardData | null;
  error: string | null;
  loading: boolean;
};

let operationsBoardCache: OperationsBoardData | null = null;
let operationsBoardCacheUpdatedAt = 0;
const operationsBoardCacheTtlMs = 60_000;

export function OperationsBoardPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [boardState, setBoardState] = useState<OperationsBoardState>(() => ({
    data: operationsBoardCache,
    error: null,
    loading: !operationsBoardCache,
  }));
  const today = getLocalDate();

  useEffect(() => {
    let active = true;
    const hasFreshCache =
      operationsBoardCache &&
      reloadKey === 0 &&
      Date.now() - operationsBoardCacheUpdatedAt < operationsBoardCacheTtlMs;

    if (hasFreshCache) {
      setBoardState({ data: operationsBoardCache, error: null, loading: false });
      return () => {
        active = false;
      };
    }

    setBoardState((current) => ({
      ...current,
      error: null,
      loading: !current.data,
    }));

    Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      fetchAllPages<ReservationGroup>('/bookings/groups'),
      fetchAllPages<Property>('/properties'),
      fetchAllPages<HousekeepingTask>('/housekeeping'),
      fetchAllPages<Billing>('/billings'),
    ])
      .then(([dashboardResponse, loadedReservationGroups, loadedProperties, loadedHousekeeping, loadedBillings]) => {
        if (!active) return;
        const nextData = {
          billings: loadedBillings,
          dashboard: dashboardResponse.data,
          housekeeping: loadedHousekeeping,
          properties: loadedProperties,
          reservationGroups: loadedReservationGroups,
        };
        operationsBoardCache = nextData;
        operationsBoardCacheUpdatedAt = Date.now();
        setBoardState({ data: nextData, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBoardState((current) => ({
          data: current.data,
          error: getApiErrorMessage(err),
          loading: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function checkIn(id: string) {
    setActionError(null); setPendingId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkin`); setReloadKey((v) => v + 1); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }
  async function checkOut(id: string) {
    setActionError(null); setPendingId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkout`); setReloadKey((v) => v + 1); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }
  async function sendReminder(id: string) {
    setActionError(null); setPendingId(id);
    try { await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`); setReloadKey((v) => v + 1); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }

  const properties = boardState.data?.properties ?? [];
  const propertyScopeLabel = propertyFilter === 'ALL' ? 'All properties' : (properties.find((p) => p.id === propertyFilter)?.name ?? 'Selected');
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const reservationGroups = (boardState.data?.reservationGroups ?? []).filter((g) => propertyFilter === 'ALL' || g.property.id === propertyFilter);
  const tasks = (boardState.data?.housekeeping ?? []).filter((t) => propertyFilter === 'ALL' || t.property.id === propertyFilter);
  const billings = (boardState.data?.billings ?? []).filter((b) => propertyFilter === 'ALL' || b.reservation_room.property.id === propertyFilter);

  const roomBalanceMap = new Map<string, number>();
  const groupBalanceMap = new Map<string, number>();
  for (const b of billings) {
    roomBalanceMap.set(b.reservation_room_id, (roomBalanceMap.get(b.reservation_room_id) ?? 0) + b.balance_due);
    groupBalanceMap.set(b.reservation_room.reservation_group_id, (groupBalanceMap.get(b.reservation_room.reservation_group_id) ?? 0) + b.balance_due);
  }

  const openTasksByRoomId = new Map<string, HousekeepingTask[]>();
  for (const task of tasks) {
    if (task.status === 'CLEAN') continue;
    const current = openTasksByRoomId.get(task.room_id) ?? [];
    current.push(task); openTasksByRoomId.set(task.room_id, current);
  }

  const allRows: BoardRow[] = reservationGroups.flatMap((g) => g.rooms.map((r) => ({ reservation_group_id: g.id, reservation_group_status: g.reservation_status, external_reservation_id: g.external_reservation_id, property: g.property, primary_guest_name: g.primary_guest?.name ?? 'Imported guest', room: r })));
  const filteredRows = normalizedQuery ? allRows.filter((row) => [row.room.guest_name, row.primary_guest_name, row.property.name, row.external_reservation_id, row.room.room.room_number, row.room.room_category.name, row.room.rate_plan.name].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)) : allRows;

  const arrivals = filteredRows.filter((r) => r.room.arrival_date === today && r.room.reservation_status === 'BOOKED').sort((a, b) => a.property.name.localeCompare(b.property.name) || a.primary_guest_name.localeCompare(b.primary_guest_name));
  const inHouse = filteredRows.filter((r) => r.room.reservation_status === 'CHECKED_IN').sort((a, b) => a.room.departure_date.localeCompare(b.room.departure_date));
  const departures = filteredRows.filter((r) => r.room.departure_date === today && ['CHECKED_IN', 'CHECKED_OUT'].includes(r.room.reservation_status)).sort((a, b) => a.primary_guest_name.localeCompare(b.primary_guest_name));
  const lateArrivals = filteredRows.filter((r) => r.room.arrival_date < today && r.room.reservation_status === 'BOOKED');
  const checkInQueue = [...lateArrivals, ...arrivals].sort((a, b) => { const la = a.room.arrival_date < today, lb = b.room.arrival_date < today; if (la !== lb) return la ? -1 : 1; return a.room.arrival_date.localeCompare(b.room.arrival_date) || a.property.name.localeCompare(b.property.name) || a.primary_guest_name.localeCompare(b.primary_guest_name); });
  const visibleRows = [...checkInQueue, ...departures, ...inHouse];
  const blockedRows = visibleRows.filter((r) => r.room.room.id && (openTasksByRoomId.get(r.room.room.id) ?? []).length > 0);
  const hasFilters = propertyFilter !== 'ALL' || normalizedQuery.length > 0;

  const priorityItems = [
    { key: 'late', label: 'Late arrivals', value: lateArrivals.length.toString(), detail: 'Booked before today and still waiting.', targetId: `stay-${lateArrivals[0]?.room.id ?? 'checkin'}` },
    { key: 'hk', label: 'Room readiness', value: blockedRows.length.toString(), detail: 'Stays with open housekeeping work.', targetId: `stay-${blockedRows[0]?.room.id ?? 'inhouse'}` },
    { key: 'balance', label: 'Pending collections', value: formatCurrency(boardState.data?.dashboard.pending_balance_total ?? 0), detail: 'Open folio balances before checkout.', targetId: `stay-${visibleRows.find((r) => (groupBalanceMap.get(r.reservation_group_id) ?? 0) > 0)?.room.id ?? 'inhouse'}` },
  ].filter((item) => item.key === 'balance' ? (boardState.data?.dashboard.pending_balance_total ?? 0) > 0 : Number(item.value) > 0);

  const loading = boardState.loading && !boardState.data;
  const error = boardState.error;

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Front desk</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Operations Board</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Run check-ins, departures, and in-house stays from one staff board without dropping into channel or ledger detail.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {[`Service date ${formatDisplayDate(today)}`, propertyScopeLabel, `${checkInQueue.length} in check-in queue`].map((chip) => (
            <span key={chip} className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{chip}</span>
          ))}
        </div>
      </div>

      <FilterBar
        title="Refine operations view"
        description="Scope the board by property or jump straight to a guest, room, reservation, category, or rate plan."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500"><strong className="text-slate-800">{visibleRows.length}</strong> stays in scope</span>
            <button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} disabled={!hasFilters} onClick={() => { setPropertyFilter('ALL'); setSearchQuery(''); }} type="button">Reset filters</button>
          </div>
        }
      >
        <label className={`${labelCls} min-w-[18rem]`}>
          <span>Quick search</span>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
            </svg>
            <input className={`${inputCls} pl-9`} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Guest, room, reservation, category, or rate" type="search" value={searchQuery} />
          </div>
        </label>
        <label className={`${labelCls} min-w-[15rem]`}>
          <span>Property</span>
          <CustomSelect onChange={setPropertyFilter} options={[{ label: 'All properties', value: 'ALL' }, ...properties.map((p) => ({ label: p.name, value: p.id }))]} value={propertyFilter} />
        </label>
        <label className={`${labelCls} min-w-[15rem]`}>
          <span>Service date</span>
          <input className={inputCls + ' bg-slate-50'} disabled type="date" value={today} />
        </label>
      </FilterBar>

      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
      {loading && <LoadingMsg>Loading front desk operations…</LoadingMsg>}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Arrivals today" value={(normalizedQuery ? arrivals.length : (boardState.data?.dashboard.reservation_room_arrivals_today ?? arrivals.length)).toString()} tone="gold" sub={`${lateArrivals.length} late arrivals`} />
        <MetricCard label="In house now" value={inHouse.length.toString()} tone="green" sub={`${blockedRows.length} housekeeping blockers`} />
        <MetricCard label="Departures today" value={(normalizedQuery ? departures.length : (boardState.data?.dashboard.reservation_room_departures_today ?? departures.length)).toString()} tone="blue" sub={`${departures.filter((r) => r.room.reservation_status === 'CHECKED_OUT').length} checked out`} />
        <MetricCard label="Pending folio balance" value={formatCurrency(normalizedQuery ? Array.from(new Set(visibleRows.map((r) => r.reservation_group_id)), (id) => groupBalanceMap.get(id) ?? 0).reduce((s, v) => s + v, 0) : (boardState.data?.dashboard.pending_balance_total ?? 0))} tone="rose" sub={`${boardState.data?.dashboard.open_housekeeping_tasks ?? tasks.length} housekeeping tasks`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Check-in queue */}
        <BoardColumn
          id="col-checkin"
          eyebrow="Front desk"
          title="Check-in queue"
          description="Late arrivals float to the top so the desk can clear missed arrivals first."
          count={checkInQueue.length}
          emptyTitle="All check-ins cleared"
          emptyDetail="Late arrivals and same-day check-ins will appear here."
        >
          {checkInQueue.map((row) => (
            <StayCard key={row.room.id} row={row} balanceDue={groupBalanceMap.get(row.reservation_group_id) ?? 0} hkTasks={row.room.room.id ? (openTasksByRoomId.get(row.room.room.id) ?? []) : []} today={today}>
              <button className={linkBtn + ' !text-xs !px-3 !py-1.5'} disabled={pendingId === row.room.id} onClick={() => void checkIn(row.room.id)} type="button">{pendingId === row.room.id ? 'Processing…' : 'Check in'}</button>
              <button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} disabled={pendingId === row.room.id} onClick={() => void sendReminder(row.room.id)} type="button">Send reminder</button>
            </StayCard>
          ))}
        </BoardColumn>

        {/* Departures */}
        <BoardColumn
          id="col-departures"
          eyebrow="Turnover"
          title="Departures today"
          description="Departing stays with checkout state, folio balance, and room-readiness blockers."
          count={departures.length}
          emptyTitle="No departures waiting"
          emptyDetail="No in-house stays are due to leave today in the current scope."
        >
          {departures.map((row) => (
            <StayCard key={row.room.id} row={row} balanceDue={groupBalanceMap.get(row.reservation_group_id) ?? 0} hkTasks={row.room.room.id ? (openTasksByRoomId.get(row.room.room.id) ?? []) : []} today={today}>
              {row.room.reservation_status === 'CHECKED_IN' && (
                <button className={linkBtn + ' !text-xs !px-3 !py-1.5'} disabled={pendingId === row.room.id} onClick={() => void checkOut(row.room.id)} type="button">{pendingId === row.room.id ? 'Processing…' : 'Check out'}</button>
              )}
            </StayCard>
          ))}
        </BoardColumn>

        {/* Priority queue */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Action needed</p>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Priority queue</h3>
              <span className="w-5 h-5 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex items-center justify-center">{priorityItems.length}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Jump to the next queue that needs intervention.</p>
          </div>
          <div className="p-3">
            {priorityItems.length > 0 ? (
              <div className="space-y-2">
                {priorityItems.map((item) => (
                  <button key={item.key} onClick={() => document.getElementById(item.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} type="button" className="w-full text-left flex items-center gap-3 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-xl p-3 transition-colors">
                    <span className="text-xl font-extrabold text-slate-900 min-w-[3rem] text-right">{item.value}</span>
                    <div>
                      <strong className="text-xs font-bold text-slate-800 block">{item.label}</strong>
                      <span className="text-xs text-slate-400 leading-relaxed">{item.detail}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 mb-2">All clear</span>
                <p className="text-sm font-bold text-slate-800">Front desk is clear</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Late arrivals, housekeeping blockers, and pending balances will surface here.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* In house — full width */}
      <BoardColumn
        id="col-inhouse"
        eyebrow="Live stays"
        title="In house"
        description="Checked-in stays with departure timing, folio balance, and room readiness context."
        count={inHouse.length}
        emptyTitle="No active in-house stays"
        emptyDetail="Checked-in stays will appear here with departure timing and folio context."
        grid
      >
        {inHouse.map((row) => (
          <StayCard key={row.room.id} row={row} balanceDue={groupBalanceMap.get(row.reservation_group_id) ?? 0} hkTasks={row.room.room.id ? (openTasksByRoomId.get(row.room.room.id) ?? []) : []} today={today}>
            <button className={linkBtn + ' !text-xs !px-3 !py-1.5'} disabled={pendingId === row.room.id} onClick={() => void checkOut(row.room.id)} type="button">{pendingId === row.room.id ? 'Processing…' : 'Check out'}</button>
          </StayCard>
        ))}
      </BoardColumn>
    </section>
  );
}

function BoardColumn({ id, eyebrow, title, description, count, emptyTitle, emptyDetail, children, grid }: {
  id: string; eyebrow: string; title: string; description?: string; count: number;
  emptyTitle: string; emptyDetail: string; children?: ReactNode; grid?: boolean;
}) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">{eyebrow}</p>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <span className="w-5 h-5 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex items-center justify-center">{count}</span>
        </div>
        {description && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className={`p-3 max-h-[36rem] overflow-y-auto scrollbar-none ${grid ? 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2.5'}`}>
        {count === 0 ? (
          <div className="py-8 text-center col-span-full">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 mb-2">All clear</span>
            <p className="text-sm font-bold text-slate-700">{emptyTitle}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">{emptyDetail}</p>
          </div>
        ) : children}
      </div>
    </div>
  );
}

function StayCard({ row, balanceDue, hkTasks, today, children }: {
  row: BoardRow; balanceDue: number; hkTasks: HousekeepingTask[]; today: string; children?: ReactNode;
}) {
  const isLate = row.room.arrival_date < today && row.room.reservation_status === 'BOOKED';
  const isDueOut = row.room.departure_date === today && row.room.reservation_status === 'CHECKED_IN';
  const assignedRoom = row.room.room.room_number;
  const guestName = row.room.guest_name ?? row.primary_guest_name;

  const note = isLate ? 'Arrival date passed — clear before standard check-ins.'
    : hkTasks.length > 0 ? 'Room has open housekeeping work.'
    : balanceDue > 0 ? 'Outstanding folio balance should be cleared before checkout.'
    : isDueOut ? 'Guest is due out today.'
    : null;

  const stayFmtr = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const fmtDate = (d: string) => stayFmtr.format(new Date(`${d}T00:00:00`));

  return (
    <div id={`stay-${row.room.id}`} className={`border rounded-xl p-3.5 space-y-2.5 ${isLate ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-bold text-slate-800">{assignedRoom ? `Room ${assignedRoom}` : 'Room TBD'}</span>
            {isLate && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">Late arrival</span>}
          </div>
          <p className="text-sm font-extrabold text-slate-900 leading-tight truncate">{guestName}</p>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-slate-500">{row.property.name}</span>
            <span className="text-[11px] text-slate-400 font-mono">{row.external_reservation_id}</span>
          </div>
        </div>
        <StatusBadge label={row.room.reservation_status} />
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="bg-white border border-slate-100 rounded-lg p-2"><span className="text-slate-400 block text-[11px]">Category</span><strong className="text-slate-800 text-[12px]">{row.room.room_category.name}</strong></div>
        <div className="bg-white border border-slate-100 rounded-lg p-2"><span className="text-slate-400 block text-[11px]">Stay</span><strong className="text-slate-800 text-[12px]">{fmtDate(row.room.arrival_date)} → {fmtDate(row.room.departure_date)}</strong></div>
        <div className="bg-white border border-slate-100 rounded-lg p-2"><span className="text-slate-400 block text-[11px]">Rate plan</span><strong className="text-slate-800 text-[12px] truncate block">{row.room.rate_plan.name}</strong></div>
        <div className="bg-white border border-slate-100 rounded-lg p-2"><span className="text-slate-400 block text-[11px]">Total</span><strong className="text-slate-800 text-[12px]">{row.room.total_amount == null ? '—' : formatCurrency(row.room.total_amount)}</strong></div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {isDueOut && row.room.reservation_status === 'CHECKED_IN' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">Due out today</span>}
        {(row.room.adults != null || row.room.children != null) && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{row.room.adults ?? 0}A / {row.room.children ?? 0}C</span>}
        {hkTasks.length > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">Readiness work open</span>}
        {balanceDue > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">Balance {formatCurrency(balanceDue)}</span>}
      </div>

      {note && <p className="text-xs text-slate-500 bg-white border border-slate-100 rounded-lg px-2.5 py-2 leading-relaxed">{note}</p>}

      {children && <div className="flex items-center gap-2 pt-1">{children}</div>}
    </div>
  );
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
