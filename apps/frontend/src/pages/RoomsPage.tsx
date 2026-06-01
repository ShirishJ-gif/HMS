import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Property, ReservationGroup, Room, RoomCategory, RoomOutOfServicePeriod, RoomStatus } from '../api/types';
import { InlineCalendarDatePicker } from '../components/CalendarDatePicker';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { inputCls, ErrorMsg, SuccessMsg, LoadingMsg } from './ui';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<RoomStatus, { label: string; dot: string; cardBg: string; cardBorder: string; cardText: string; badge: string }> = {
  AVAILABLE: {
    label: 'Available',
    dot: 'bg-emerald-500',
    cardBg: 'bg-emerald-50',
    cardBorder: 'border-emerald-200',
    cardText: 'text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  OCCUPIED: {
    label: 'Occupied',
    dot: 'bg-slate-700',
    cardBg: 'bg-slate-100/60',
    cardBorder: 'border-slate-300',
    cardText: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    dot: 'bg-rose-400',
    cardBg: 'bg-rose-50',
    cardBorder: 'border-rose-200',
    cardText: 'text-rose-700',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const defaultForm = { property_id: '', room_category_id: '', room_number: '', status: 'AVAILABLE' as RoomStatus };
const defaultOutOfServiceForm = { from_date: '', to_date: '', reason: '', notes: '' };

type OccupancyDetail = {
  arrivalDate: string;
  departureDate: string;
  externalReservationId: string;
  guestName: string;
};

type PendingStatusChange = {
  roomId: string;
  status: RoomStatus;
};

// ─── Main page ─────────────────────────────────────────────────────────────────
export function RoomsPage() {
  const [reloadKey, setReloadKey]               = useState(0);
  const [periodReloadKey, setPeriodReloadKey]   = useState(0);
  const [form, setForm]                         = useState(defaultForm);
  const [outOfServiceForm, setOutOfServiceForm] = useState(defaultOutOfServiceForm);
  const [showAddForm, setShowAddForm]           = useState(false);
  const [selectedRoomId, setSelectedRoomId]     = useState<string | null>(null);
  const [detailTab, setDetailTab]               = useState<'info' | 'blocks'>('info');
  const [propFilter, setPropFilter]             = useState('ALL');
  const [statusFilter, setStatusFilter]         = useState<RoomStatus | 'ALL'>('ALL');
  const [successMsg, setSuccessMsg]             = useState<string | null>(null);
  const [actionError, setActionError]           = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
  const [deletingRoomId, setDeletingRoomId]     = useState<string | null>(null);
  const [roomStatusOverrides, setRoomStatusOverrides] = useState<Record<string, RoomStatus>>({});
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [updatingStatus, setUpdatingStatus]     = useState(false);
  const [outOfServiceSubmitting, setOutOfServiceSubmitting] = useState(false);
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null);
  const [openBlockDatePicker, setOpenBlockDatePicker] = useState<'from' | 'to' | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedRoomId) return;

    function closeDetailPanel(event: PointerEvent) {
      if (!detailPanelRef.current?.contains(event.target as Node)) {
        setSelectedRoomId(null);
        setOpenBlockDatePicker(null);
      }
    }

    document.addEventListener('pointerdown', closeDetailPanel);
    return () => document.removeEventListener('pointerdown', closeDetailPanel);
  }, [selectedRoomId]);

  const roomsState      = useAsync(async () => fetchAllPages<Room>('/rooms'), [reloadKey]);
  const reservationsState = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/feed'), [reloadKey]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const outOfServiceState = useAsync(async () => {
    if (!selectedRoomId) return [];
    return (await api.get<RoomOutOfServicePeriod[]>(`/rooms/${selectedRoomId}/out-of-service-periods`)).data;
  }, [selectedRoomId, periodReloadKey]);

  const properties = propertiesState.data ?? [];
  const categories = categoriesState.data ?? [];
  const allRooms   = (roomsState.data ?? []).map(room => {
    const status = roomStatusOverrides[room.id];
    return status ? { ...room, status } : room;
  });

  const scoped = propFilter === 'ALL' ? allRooms : allRooms.filter(r => r.property_id === propFilter);
  const rooms  = statusFilter === 'ALL' ? scoped : scoped.filter(r => r.status === statusFilter);

  const selectedRoom     = allRooms.find(r => r.id === selectedRoomId) ?? null;
  const occupancyByRoomId = new Map<string, OccupancyDetail>();
  for (const group of reservationsState.data ?? []) {
    for (const stay of group.rooms) {
      if (!stay.room.id || stay.reservation_status !== 'CHECKED_IN') continue;
      occupancyByRoomId.set(stay.room.id, {
        arrivalDate: stay.arrival_date,
        departureDate: stay.departure_date,
        externalReservationId: group.external_reservation_id,
        guestName: stay.guest_name ?? group.primary_guest?.name ?? 'Imported guest',
      });
    }
  }
  const selectedOccupancy = selectedRoom ? occupancyByRoomId.get(selectedRoom.id) ?? null : null;
  const pendingStatusRoom = pendingStatusChange ? allRooms.find(r => r.id === pendingStatusChange.roomId) ?? null : null;
  const filteredCats     = categories.filter(c => !form.property_id || c.property_id === form.property_id);
  const scopedCats       = categories.filter(c => propFilter === 'ALL' || c.property_id === propFilter);
  const uncoveredTypes   = scopedCats.filter(c => !scoped.some(r => r.room_category_id === c.id)).length;
  const availableCount   = scoped.filter(r => r.status === 'AVAILABLE').length;
  const occupiedCount    = scoped.filter(r => r.status === 'OCCUPIED').length;
  const maintenanceCount = scoped.filter(r => r.status === 'MAINTENANCE').length;
  const typeCount        = new Set(scoped.map(r => r.room_category_id)).size;
  const blockCount       = (outOfServiceState.data ?? []).length;
  const pageLoading      = roomsState.loading || reservationsState.loading || propertiesState.loading || categoriesState.loading;
  const pageError        = roomsState.error ?? reservationsState.error ?? propertiesState.error ?? categoriesState.error;

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  async function submitRoom(e: FormEvent) {
    e.preventDefault(); setActionError(null); setSubmitting(true);
    try {
      await api.post('/rooms', form);
      setForm(defaultForm); setShowAddForm(false);
      setReloadKey(v => v + 1); flash('Room added successfully.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setSubmitting(false); }
  }

  async function deleteRoom(id: string) {
    setActionError(null); setDeletingRoomId(id);
    try {
      await api.delete(`/rooms/${id}`);
      if (selectedRoomId === id) setSelectedRoomId(null);
      setReloadKey(v => v + 1); flash('Room deleted.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setDeletingRoomId(null); }
  }

  async function updateStatus() {
    if (!pendingStatusChange) return;
    const { roomId, status } = pendingStatusChange;
    setActionError(null);
    setUpdatingStatus(true);
    try {
      await api.put(`/rooms/${roomId}`, { status });
      setRoomStatusOverrides(current => ({ ...current, [roomId]: status }));
      setPendingStatusChange(null);
      flash('Status updated.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setUpdatingStatus(false); }
  }

  async function submitOutOfServicePeriod(e: FormEvent) {
    e.preventDefault(); if (!selectedRoomId) return;
    setActionError(null); setOutOfServiceSubmitting(true);
    try {
      if (!outOfServiceForm.from_date || !outOfServiceForm.to_date) throw new Error('Select both dates.');
      await api.post(`/rooms/${selectedRoomId}/out-of-service-periods`, outOfServiceForm);
      setOutOfServiceForm(defaultOutOfServiceForm);
      setPeriodReloadKey(v => v + 1); setReloadKey(v => v + 1);
      flash('Date block saved.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setOutOfServiceSubmitting(false); }
  }

  async function deleteOutOfServicePeriod(periodId: string) {
    if (!selectedRoomId) return;
    setActionError(null); setDeletingPeriodId(periodId);
    try {
      await api.delete(`/rooms/${selectedRoomId}/out-of-service-periods/${periodId}`);
      setPeriodReloadKey(v => v + 1); setReloadKey(v => v + 1);
      flash('Block removed.');
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setDeletingPeriodId(null); }
  }

  return (
    <div className="-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex flex-col">

      {/* Page header */}
      <div className="px-5 lg:px-8 pt-6 lg:pt-8 pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Rooms & Inventory</h1>
          <p className="text-[12px] text-slate-400 mt-1">Manage physical rooms, room categories, and maintenance blocks</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAddForm(v => !v); setSelectedRoomId(null); }}
          className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center gap-1.5"
        >
          {showAddForm ? '✕ Cancel' : '+ Add room'}
        </button>
      </div>

      {/* Add room form */}
      {showAddForm && (
        <div className="mx-5 lg:mx-8 mb-4 bg-white border-2 border-indigo-100 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-0.5">New room</p>
          <h3 className="text-[14px] font-bold text-slate-900 mb-4">Add room to inventory</h3>
          <form onSubmit={submitRoom} className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Property</span>
              <CustomSelect
                value={form.property_id}
                onChange={v => setForm({ ...form, property_id: v, room_category_id: '' })}
                options={properties.map(p => ({ label: p.name, value: p.id }))}
                placeholder="Select property"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Room category</span>
              <CustomSelect
                value={form.room_category_id}
                onChange={v => setForm({ ...form, room_category_id: v })}
                options={filteredCats.map(c => ({ label: c.name, value: c.id }))}
                placeholder="Select category"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Room number</span>
              <input
                className={inputCls}
                placeholder="e.g. 301"
                required
                value={form.room_number}
                onChange={e => setForm({ ...form, room_number: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Status</span>
              <CustomSelect
                value={form.status}
                onChange={v => setForm({ ...form, status: v as RoomStatus })}
                options={[
                  { label: 'Available', value: 'AVAILABLE' },
                  { label: 'Occupied',  value: 'OCCUPIED'  },
                  { label: 'Maintenance', value: 'MAINTENANCE' },
                ]}
              />
            </label>
            <div className="col-span-full flex gap-2">
              <button
                type="submit"
                disabled={submitting || !form.property_id || !form.room_category_id || !form.room_number}
                className="h-9 px-5 rounded-xl text-[12.5px] font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Adding…' : 'Add room'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="h-9 px-4 rounded-xl text-[12.5px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Flash messages */}
      {(successMsg || actionError) && (
        <div className="fixed right-5 top-5 z-50 w-[min(24rem,calc(100vw-2.5rem))]">
          {successMsg && <SuccessMsg>{successMsg}</SuccessMsg>}
          {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
        </div>
      )}

      {/* Filters */}
      <div className="flex min-h-8 items-center justify-between gap-3 px-5 lg:px-8 pb-4 flex-wrap">
        <div className="flex max-w-full items-center gap-2 flex-wrap">
          <div className="w-[240px] max-w-full">
            <CustomSelect
              value={propFilter}
              onChange={setPropFilter}
              options={[
                { label: 'All properties', value: 'ALL' },
                ...properties.map(p => ({ label: p.name, value: p.id })),
              ]}
            />
          </div>
          <div className="w-[180px] max-w-full">
            <CustomSelect
              value={statusFilter}
              onChange={v => setStatusFilter(v as RoomStatus | 'ALL')}
              options={[
                { label: 'All statuses', value: 'ALL' },
                { label: 'Available', value: 'AVAILABLE' },
                { label: 'Occupied', value: 'OCCUPIED' },
                { label: 'Maintenance', value: 'MAINTENANCE' },
              ]}
            />
          </div>
        </div>
        <div className="flex h-8 items-center gap-3">
          {pageLoading && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <svg className="h-3.5 w-3.5 animate-spin-icon flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Loading
            </span>
          )}
          <span className="text-[11px] text-slate-400">{rooms.length} room{rooms.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="px-5 lg:px-8 pb-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { label: 'Physical rooms', value: scoped.length,      sub: `${typeCount} room type${typeCount === 1 ? '' : 's'}`, color: 'text-slate-900'   },
          { label: 'Available',      value: availableCount,     sub: 'Ready to sell', color: 'text-emerald-600' },
          { label: 'Occupied',       value: occupiedCount,      sub: 'In-house stays', color: 'text-slate-700'   },
          { label: 'Maintenance',    value: maintenanceCount,   sub: 'Out of rotation', color: 'text-rose-600'    },
          { label: 'Room types',     value: typeCount,          sub: uncoveredTypes > 0 ? `${uncoveredTypes} without rooms` : 'Coverage complete', color: 'text-sky-700'  },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 hover:shadow-sm transition-shadow">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{s.label}</p>
            <p className={`text-[1.5rem] font-bold tracking-tight leading-none tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {pageError && !pageLoading && (
        <div className="px-5 lg:px-8 pb-4">
          <ErrorMsg>{pageError}</ErrorMsg>
        </div>
      )}

      {/* Grid + detail panel */}
      <div className="flex flex-1 min-h-0">
        {/* Room grid */}
        <div className="flex-1 min-w-0 px-5 lg:px-8 py-5">
          <div className={`grid gap-3.5 ${selectedRoom ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'}`}>
            {rooms.map(room => {
              const cfg   = STATUS_CFG[room.status];
              const isSel = selectedRoomId === room.id;
              const occupancy = occupancyByRoomId.get(room.id);
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    setSelectedRoomId(isSel ? null : room.id);
                    setDetailTab('info');
                    setShowAddForm(false);
                    setOutOfServiceForm(defaultOutOfServiceForm);
                    setOpenBlockDatePicker(null);
                  }}
                  className={`relative min-h-[7.25rem] p-3.5 rounded-xl border-2 text-left transition-all hover:scale-[1.03] active:scale-[0.98] active:ring-2 active:ring-slate-200 focus:ring-2 focus:ring-slate-200
                    ${isSel ? `${cfg.cardBorder} ${cfg.cardBg} shadow-md ring-2 ring-slate-200` : `${cfg.cardBorder} ${cfg.cardBg} hover:shadow-md`}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[20px] font-black text-slate-800 leading-none">{room.room_number}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  </div>
                  <p className={`text-[9.5px] font-bold uppercase tracking-wide leading-none mb-1.5 ${cfg.cardText}`}>{cfg.label}</p>
                  <p className="text-[10.5px] text-slate-500 truncate leading-snug">{room.room_category?.name}</p>
                  {occupancy && (
                    <p
                      className="mt-2.5 truncate text-[10.5px] font-semibold leading-snug text-slate-700"
                      title={`${occupancy.guestName} · ${formatRoomStayDate(occupancy.arrivalDate)} to ${formatRoomStayDate(occupancy.departureDate)}`}
                    >
                      {occupancy.guestName}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {rooms.length === 0 && !roomsState.loading && (
            <div className="py-20 text-center text-[13px] text-slate-400">No rooms match your filters.</div>
          )}
        </div>

        {/* Right detail panel */}
        {selectedRoom && (() => {
          const cfg = STATUS_CFG[selectedRoom.status];
          return (
            <aside ref={detailPanelRef} className="w-[340px] flex-shrink-0 border-l border-black/[0.06] bg-white flex flex-col sticky top-4 self-start -mt-28 mb-6" style={{ height: 'calc(100dvh - 160px)', minHeight: '420px' }}>
              {/* Room header */}
              <div className={`px-5 py-5 border-b ${cfg.cardBorder} ${cfg.cardBg} flex-shrink-0`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Room</p>
                    <span className="text-[40px] font-black text-slate-900 leading-none">{selectedRoom.room_number}</span>
                  </div>
                  <button type="button" onClick={() => { setSelectedRoomId(null); setOpenBlockDatePicker(null); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-black/[0.06] text-lg leading-none mt-1">
                    ×
                  </button>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10.5px] font-bold ${cfg.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                </span>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 flex-shrink-0">
                <button type="button" onClick={() => setDetailTab('info')}
                  className={`flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all ${detailTab === 'info' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  Details
                </button>
                <button type="button" onClick={() => setDetailTab('blocks')}
                  className={`flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-all ${detailTab === 'blocks' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  Blocks {blockCount > 0 && `(${blockCount})`}
                </button>
              </div>

              {/* Tab: Details */}
              {detailTab === 'info' && (
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 space-y-4">
                  {[
                    ['Property',      selectedRoom.property?.name],
                    ['Room category', selectedRoom.room_category?.name],
                    ['Room number',   selectedRoom.room_number],
                  ].map(([l, v]) => (
                    <div key={l} className="pb-3 border-b border-slate-50 last:border-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{l}</p>
                      <p className="text-[13px] font-bold text-slate-900">{v ?? '—'}</p>
                    </div>
                  ))}

                  {selectedOccupancy && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Current occupant</p>
                      <div className="space-y-2">
                        {[
                          ['Guest', selectedOccupancy.guestName],
                          ['Stay', `${formatRoomStayDate(selectedOccupancy.arrivalDate)} to ${formatRoomStayDate(selectedOccupancy.departureDate)}`],
                          // ['Reservation', selectedOccupancy.externalReservationId],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-start justify-between gap-3">
                            <span className="text-[10.5px] font-semibold text-slate-400">{label}</span>
                            <span className="text-right text-[12px] font-bold text-slate-800">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status picker */}
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Change status</p>
                    <div className="space-y-2">
                      {(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'] as RoomStatus[]).map(s => {
                        const sc = STATUS_CFG[s];
                        const active = selectedRoom.status === s;
                        const requiresCheckout = s === 'AVAILABLE' && Boolean(selectedOccupancy);
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={updatingStatus || requiresCheckout}
                            onClick={() => !active && setPendingStatusChange({ roomId: selectedRoom.id, status: s })}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all
                              ${active ? `${sc.cardBorder} ${sc.cardBg} font-bold` : 'border-slate-100 hover:border-slate-200 bg-white cursor-pointer'} disabled:cursor-not-allowed disabled:opacity-60`}>
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                            <span className={`text-[12.5px] flex-1 ${active ? sc.cardText : 'text-slate-600'}`}>{sc.label}</span>
                            {active && <span className="text-[10px] font-bold text-slate-400">Current</span>}
                            {requiresCheckout && <span className="text-[10px] font-bold text-slate-400">Checkout required</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2 pt-1">
                    <button type="button" onClick={() => setDetailTab('blocks')}
                      className="w-full h-9 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                      Manage date blocks
                    </button>
                    <button type="button"
                      disabled={deletingRoomId === selectedRoom.id}
                      onClick={() => void deleteRoom(selectedRoom.id)}
                      className="w-full h-9 rounded-xl text-[12px] font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors">
                      {deletingRoomId === selectedRoom.id ? 'Deleting…' : 'Delete room'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: Blocks */}
              {detailTab === 'blocks' && (
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 space-y-4">
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    Dated maintenance windows temporarily remove this room from sellable inventory — smarter than setting a permanent Maintenance status.
                  </p>

                  {/* Add block form */}
                  <form onSubmit={submitOutOfServicePeriod} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
                        <InlineCalendarDatePicker
                          label="From"
                          value={outOfServiceForm.from_date}
                          onChange={value => setOutOfServiceForm({ ...outOfServiceForm, from_date: value })}
                          open={openBlockDatePicker === 'from'}
                          setOpen={open => setOpenBlockDatePicker(open ? 'from' : null)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
                        <InlineCalendarDatePicker
                          align="right"
                          label="To"
                          value={outOfServiceForm.to_date}
                          onChange={value => setOutOfServiceForm({ ...outOfServiceForm, to_date: value })}
                          open={openBlockDatePicker === 'to'}
                          setOpen={open => setOpenBlockDatePicker(open ? 'to' : null)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason</label>
                      <input required placeholder="Bathroom repair"
                        value={outOfServiceForm.reason}
                        onChange={e => setOutOfServiceForm({ ...outOfServiceForm, reason: e.target.value })}
                        className="h-9 px-3 rounded-lg border border-slate-200 text-[11.5px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes (optional)</label>
                      <input placeholder="Additional details"
                        value={outOfServiceForm.notes}
                        onChange={e => setOutOfServiceForm({ ...outOfServiceForm, notes: e.target.value })}
                        className="h-9 px-3 rounded-lg border border-slate-200 text-[11.5px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                    </div>
                    <button type="submit" disabled={outOfServiceSubmitting}
                      className="w-full h-9 rounded-xl text-[12px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {outOfServiceSubmitting ? 'Saving…' : 'Add date block'}
                    </button>
                  </form>

                  {/* Existing blocks */}
                  <div>
                    {outOfServiceState.loading && <LoadingMsg>Loading blocks…</LoadingMsg>}
                    {outOfServiceState.error && <ErrorMsg>{outOfServiceState.error}</ErrorMsg>}
                    {!outOfServiceState.loading && !outOfServiceState.error && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                          {blockCount} scheduled window{blockCount !== 1 ? 's' : ''}
                        </p>
                        {blockCount === 0 && (
                          <p className="text-[11.5px] text-slate-400 py-3 text-center">No blocks configured.</p>
                        )}
                        <div className="space-y-2">
                          {(outOfServiceState.data ?? []).map((period: RoomOutOfServicePeriod) => (
                            <div key={period.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11.5px] font-bold text-slate-900">{period.from_date} → {period.to_date}</p>
                                  <p className="text-[11px] text-slate-600 truncate">{period.reason}</p>
                                  {period.notes && <p className="text-[10.5px] text-slate-400 truncate">{period.notes}</p>}
                                </div>
                                <button type="button"
                                  disabled={deletingPeriodId === period.id}
                                  onClick={() => void deleteOutOfServicePeriod(period.id)}
                                  className="text-[10.5px] font-semibold text-rose-500 hover:text-rose-700 flex-shrink-0 disabled:opacity-50">
                                  {deletingPeriodId === period.id ? '…' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </aside>
          );
        })()}
      </div>

      {pendingStatusChange && pendingStatusRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Confirm status change</p>
            <h3 className="mt-1 text-base font-bold text-slate-900">
              Change room {pendingStatusRoom.room_number} to {STATUS_CFG[pendingStatusChange.status].label}?
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
              This updates the room status used by operations and inventory views.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => setPendingStatusChange(null)}
                className="h-9 px-4 rounded-xl text-[12.5px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => void updateStatus()}
                className="h-9 px-4 rounded-xl text-[12.5px] font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingStatus ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRoomStayDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
