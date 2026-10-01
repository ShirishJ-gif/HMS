import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { api, getApiErrorMessage } from '../api/client';
import { Property, Room, RoomCategory, RoomStatus } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { inputCls, ErrorMsg, FloatingSuccessToast, StatCard } from './ui';

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

// Friendly labels only; reservation and inventory operations still use room IDs.
function roomDisplayName(room: Room, properties: Property[]) {
  const propertyName = room.property?.name || properties.find(property => property.id === room.property_id)?.name || 'Property';
  const villaRoom = /^HMS_VILLA_ROOM_(\d+)$/.exec(room.room_number);
  const roomNumber = room.room_number === 'HMS_WHOLE_VILLA' ? '1' : villaRoom ? String(Number(villaRoom[1])) : room.room_number;
  return `${propertyName.trim().replace(/\s+/g, '_')}_Room_${roomNumber}`;
}

type OccupancyDetail = {
  arrivalDate: string;
  departureDate: string;
  externalReservationId: string;
  guestName: string;
};

type RoomWorkspace = {
  categories: RoomCategory[];
  occupancy: Array<{
    arrival_date: string;
    departure_date: string;
    external_reservation_id: string;
    guest_name: string;
    room_id: string;
  }>;
  properties: Property[];
  rooms: Room[];
};

// ─── Main page ─────────────────────────────────────────────────────────────────
export function RoomsPage({ embedded = false, propertyId, showHeading = true }: { embedded?: boolean; propertyId?: string | null; showHeading?: boolean } = {}) {
  const [reloadKey, setReloadKey]               = useState(0);
  const [form, setForm]                         = useState({ ...defaultForm, property_id: propertyId ?? '' });
  const [showAddForm, setShowAddForm]           = useState(false);
  const [selectedRoomId, setSelectedRoomId]     = useState<string | null>(null);
  const [propFilter, setPropFilter]             = useState(propertyId ?? 'ALL');
  const [statusFilter, setStatusFilter]         = useState<RoomStatus | 'ALL'>('ALL');
  const [toastMessage, setToastMessage]         = useState<string | null>(null);
  const [actionError, setActionError]           = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
  const [deletingRoomId, setDeletingRoomId]     = useState<string | null>(null);
  const successTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    setPropFilter(propertyId);
    setForm(current => ({
      ...current,
      property_id: propertyId,
      room_category_id: current.property_id === propertyId ? current.room_category_id : '',
    }));
  }, [propertyId]);

  const workspaceState = useAsync(async () => (await api.get<RoomWorkspace>('/rooms/workspace')).data, [reloadKey]);
  const properties = workspaceState.data?.properties ?? [];
  const categories = workspaceState.data?.categories ?? [];
  const allRooms = workspaceState.data?.rooms ?? [];

  const scoped = propFilter === 'ALL' ? allRooms : allRooms.filter(r => r.property_id === propFilter);
  const rooms = (statusFilter === 'ALL' ? [...scoped] : scoped.filter(r => r.status === statusFilter))
    .sort((a, b) => roomDisplayName(a, properties).localeCompare(roomDisplayName(b, properties), undefined, { numeric: true }));

  const selectedRoom     = allRooms.find(r => r.id === selectedRoomId) ?? null;
  const selectedProperty = propertyId ? properties.find(p => p.id === propertyId) ?? null : null;
  const occupancyByRoomId = new Map<string, OccupancyDetail>();
  for (const stay of workspaceState.data?.occupancy ?? []) {
    occupancyByRoomId.set(stay.room_id, {
      arrivalDate: stay.arrival_date,
      departureDate: stay.departure_date,
      externalReservationId: stay.external_reservation_id,
      guestName: stay.guest_name,
    });
  }
  const selectedOccupancy = selectedRoom ? occupancyByRoomId.get(selectedRoom.id) ?? null : null;
  const filteredCats     = categories.filter(c => !form.property_id || c.property_id === form.property_id);
  const scopedCats       = categories.filter(c => propFilter === 'ALL' || c.property_id === propFilter);
  const uncoveredTypes   = scopedCats.filter(c => !scoped.some(r => r.room_category_id === c.id)).length;
  const availableCount   = scoped.filter(r => r.status === 'AVAILABLE').length;
  const occupiedCount    = scoped.filter(r => r.status === 'OCCUPIED').length;
  const maintenanceCount = scoped.filter(r => r.status === 'MAINTENANCE').length;
  const typeCount        = new Set(scoped.map(r => r.room_category_id)).size;
  const pageLoading      = workspaceState.loading;
  const pageError        = workspaceState.error;

  function flash(msg: string) {
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }

    setToastMessage(msg);
    successTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      successTimeoutRef.current = null;
    }, 3000);
  }

  async function submitRoom(e: FormEvent) {
    e.preventDefault(); setActionError(null); setSubmitting(true);
    try {
      await api.post('/rooms', form);
      setForm({ ...defaultForm, property_id: propertyId ?? '' }); setShowAddForm(false);
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

  return (
    <div className={embedded ? 'flex min-h-full flex-col bg-white' : `-mx-5 lg:-mx-8 ${showHeading ? '-my-6 lg:-my-8' : ''} flex flex-col`}>
      <FloatingSuccessToast message={toastMessage} onClose={() => setToastMessage(null)} />

      {/* Standalone heading; setup already supplies its own heading. */}
      {showHeading && (
        <div className={`${embedded ? 'px-5 lg:px-6 pt-5' : 'px-5 lg:px-8 pt-6 lg:pt-8'} pb-4`}>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{embedded ? 'Setup step 2' : 'Operations'}</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Rooms & Inventory</h1>
          <p className="text-[12px] text-slate-400 mt-1">
            {embedded && selectedProperty
              ? `Add physical rooms for ${selectedProperty.name}.`
              : 'Manage physical rooms and room categories'}
          </p>
        </div>
      )}

      {/* {embedded && (
        <div className="mx-5 lg:mx-6 mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/55 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">Room inventory</p>
            <p className="mt-1 text-[13px] font-semibold text-emerald-950">
              {selectedProperty ? selectedProperty.name : 'Select a property'} needs physical rooms before OTA mapping.
            </p>
          </div>
        </div>
      )} */}

      {/* Flash messages */}
      {actionError && !selectedRoom && (
        <div className="fixed right-5 top-5 z-50 w-[min(24rem,calc(100vw-2.5rem))]">
          <ErrorMsg>{actionError}</ErrorMsg>
        </div>
      )}

      {/* Filters */}
      <div className={`flex min-h-8 items-center justify-between gap-3 ${embedded ? 'px-5 lg:px-6' : 'px-5 lg:px-8'} pb-4 flex-wrap`}>
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
      <div className={`${embedded ? 'px-5 lg:px-6' : 'px-5 lg:px-8'} pb-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`}>
        {[
          { label: 'Physical rooms', value: scoped.length,      sub: `${typeCount} room type${typeCount === 1 ? '' : 's'}`, color: 'text-slate-900'   },
          { label: 'Available',      value: availableCount,     sub: 'Ready to sell', color: 'text-emerald-600' },
          { label: 'Occupied',       value: occupiedCount,      sub: 'In-house stays', color: 'text-slate-700'   },
          { label: 'Maintenance',    value: maintenanceCount,   sub: 'Out of rotation', color: 'text-rose-600'    },
          { label: 'Room types',     value: typeCount,          sub: uncoveredTypes > 0 ? `${uncoveredTypes} without rooms` : 'Coverage complete', color: 'text-sky-700'  },
        ].map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            sub={s.sub}
            className="hover:shadow-sm transition-shadow"
            valueClassName={`text-[1.5rem] tabular-nums ${s.color}`}
          />
        ))}
      </div>

      {/* Error */}
      {pageError && !pageLoading && (
        <div className="px-5 lg:px-8 pb-4">
          <ErrorMsg>{pageError}</ErrorMsg>
        </div>
      )}

      {/* Room grid */}
      <div className="flex flex-1 min-h-0">
        {/* Room grid */}
        <div className={`flex-1 min-w-0 ${embedded ? 'px-5 lg:px-6' : 'px-5 lg:px-8'} pb-4`}>
          <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {rooms.map(room => {
              const cfg   = STATUS_CFG[room.status];
              const isSel = selectedRoomId === room.id;
              const occupancy = occupancyByRoomId.get(room.id);
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setActionError(null);
                    setShowAddForm(false);
                  }}
                  className={`relative min-h-[7.25rem] p-3.5 rounded-xl border-2 text-left transition-colors active:ring-2 active:ring-slate-200 focus:ring-2 focus:ring-slate-200
                    ${isSel ? `${cfg.cardBorder} ${cfg.cardBg} shadow-md ring-2 ring-slate-200` : `${cfg.cardBorder} ${cfg.cardBg} hover:shadow-md`}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="min-w-0 break-words text-[14px] font-semibold text-slate-800 leading-snug">{roomDisplayName(room, properties)}</span>
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
          {rooms.length === 0 && !workspaceState.loading && (
            <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-12 text-center">
              <p className="text-[14px] font-bold text-slate-900">No physical rooms yet</p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500">Add room numbers for the selected property so OTA mapping can use real inventory.</p>
            </div>
          )}
        </div>

      </div>

      {/* Add room form */}
      {showAddForm && (
        <div className={`${embedded ? 'mx-5 lg:mx-6' : 'mx-5 lg:mx-8'} mb-4 bg-white border-2 border-emerald-100 rounded-2xl p-5 shadow-sm`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">New room</p>
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

      {!showAddForm && (
        <div className="flex min-h-32 items-center justify-center px-5 py-8 lg:px-8">
          <button type="button" onClick={() => { setShowAddForm(true); setSelectedRoomId(null); setActionError(null); }}
            className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-lg font-normal leading-none text-emerald-600">+</span>
            Add room
          </button>
        </div>
      )}

      {selectedRoom && (
        <RoomDetailsModal
          key={selectedRoom.id}
          room={selectedRoom}
          name={roomDisplayName(selectedRoom, properties)}
          occupancy={selectedOccupancy}
          busy={deletingRoomId === selectedRoom.id}
          error={actionError}
          onClose={() => { setSelectedRoomId(null); setActionError(null); }}
          onDelete={() => void deleteRoom(selectedRoom.id)}
        />
      )}
    </div>
  );
}

function formatRoomStayDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function RoomDetailsModal({ room, name, occupancy, busy, error, onClose, onDelete }: {
  room: Room; name: string; occupancy: OccupancyDetail | null; busy: boolean;
  error: string | null; onClose: () => void; onDelete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const cfg = STATUS_CFG[room.status];
  useScrollLock(true);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/30">
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold">Room details</h2>
          <button type="button" aria-label="Close room details" disabled={busy} onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5">
          {error && <div role="alert"><ErrorMsg>{error}</ErrorMsg></div>}
          <div>
            <p className="text-sm font-semibold leading-relaxed [overflow-wrap:anywhere]">{name}</p>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${cfg.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            {[
              ['Property', room.property?.name],
              ['Room category', room.room_category?.name],
            ].map(([label, value]) => <div key={label} className="min-w-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="mt-1 font-medium [overflow-wrap:anywhere]">{value || '—'}</dd>
            </div>)}
          </dl>
          {occupancy && <section className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current stay</h3>
            <p className="text-xs font-semibold [overflow-wrap:anywhere]">{occupancy.guestName}</p>
            <p className="text-xs text-slate-500">{formatRoomStayDate(occupancy.arrivalDate)} to {formatRoomStayDate(occupancy.departureDate)}</p>
          </section>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <button type="button" disabled={busy} onClick={onDelete}
            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40">
            {busy ? 'Deleting…' : 'Delete room'}
          </button>
          <button type="button" disabled={busy} onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Close</button>
        </footer>
      </div>
    </dialog>, document.body,
  );
}
