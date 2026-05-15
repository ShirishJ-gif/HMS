import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Property, Room, RoomCategory, RoomOutOfServicePeriod, RoomStatus } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { MetricCard, StatusBadge, TableCard, SectionHeading, Th, Td, labelCls, inputCls, primaryBtn, secondaryBtn, linkBtn, dangerBtn, ErrorMsg, SuccessMsg, LoadingMsg } from './ui';

const defaultForm = { property_id: '', room_category_id: '', room_number: '', status: 'AVAILABLE' as RoomStatus };
const defaultOutOfServiceForm = { from_date: '', to_date: '', reason: '', notes: '' };

export function RoomsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [periodReloadKey, setPeriodReloadKey] = useState(0);
  const [outOfServiceForm, setOutOfServiceForm] = useState(defaultOutOfServiceForm);
  const [outOfServiceSubmitting, setOutOfServiceSubmitting] = useState(false);
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null);
  const roomsState = useAsync(async () => fetchAllPages<Room>('/rooms', { params: { search: search || undefined } }), [reloadKey, search]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const outOfServicePeriodsState = useAsync(async () => {
    if (!selectedRoomId) return [];
    return (await api.get<RoomOutOfServicePeriod[]>(`/rooms/${selectedRoomId}/out-of-service-periods`)).data;
  }, [selectedRoomId, periodReloadKey]);
  const properties = propertiesState.data ?? [];
  const categories = categoriesState.data ?? [];
  const scopedRooms = (roomsState.data ?? []).filter((r) => propertyFilter === 'ALL' || r.property.id === propertyFilter);
  const rooms = scopedRooms.filter((r) => statusFilter === 'ALL' || r.status === statusFilter);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;
  const availableRooms = scopedRooms.filter((r) => r.status === 'AVAILABLE').length;
  const maintenanceRooms = scopedRooms.filter((r) => r.status === 'MAINTENANCE').length;
  const filteredCategories = categories.filter((c) => propertyFilter === 'ALL' || c.property_id === propertyFilter);
  const categoryCount = new Set(filteredCategories.map((c) => c.id)).size;
  const roomCountByCategory = rooms.reduce((counts, r) => { const key = `${r.property_id}:${r.room_category_id}`; counts.set(key, (counts.get(key) ?? 0) + 1); return counts; }, new Map<string, number>());
  const selectedPropertyName = propertyFilter === 'ALL' ? 'All properties' : properties.find((p) => p.id === propertyFilter)?.name ?? 'Selected property';
  const uncoveredRoomTypes = filteredCategories.filter((c) => !scopedRooms.some((r) => r.room_category_id === c.id)).length;

  async function submitRoom(event: FormEvent) {
    event.preventDefault(); setMessage(null); setActionError(null); setSubmitting(true);
    try { await api.post('/rooms', form); setForm(defaultForm); setMessage('Room created.'); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setSubmitting(false); }
  }

  async function deleteRoom(id: string) {
    setMessage(null); setActionError(null); setDeletingRoomId(id);
    try { await api.delete(`/rooms/${id}`); setMessage('Room deleted.'); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setDeletingRoomId(null); }
  }

  async function submitOutOfServicePeriod(event: FormEvent) {
    event.preventDefault(); if (!selectedRoomId) return;
    setMessage(null); setActionError(null); setOutOfServiceSubmitting(true);
    try {
      await api.post(`/rooms/${selectedRoomId}/out-of-service-periods`, outOfServiceForm);
      setOutOfServiceForm(defaultOutOfServiceForm); setMessage('Out-of-service period saved.');
      setPeriodReloadKey((v) => v + 1); setReloadKey((v) => v + 1);
    } catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setOutOfServiceSubmitting(false); }
  }

  async function deleteOutOfServicePeriod(periodId: string) {
    if (!selectedRoomId) return;
    setMessage(null); setActionError(null); setDeletingPeriodId(periodId);
    try {
      await api.delete(`/rooms/${selectedRoomId}/out-of-service-periods/${periodId}`);
      setMessage('Out-of-service period removed.'); setPeriodReloadKey((v) => v + 1); setReloadKey((v) => v + 1);
    } catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setDeletingPeriodId(null); }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Operations</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Rooms &amp; Inventory</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Manage physical rooms, room-type coverage, and dated maintenance blocks that affect centralized sellable inventory.
        </p>
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">Inventory model</strong>
        <span className="text-slate-500 leading-relaxed">OTAs sell room types, not physical room numbers. This workspace manages the physical rooms that feed centralized room-category inventory and later get assigned at check-in.</span>
      </div>

      {/* <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Physical rooms" value={scopedRooms.length.toString()} tone="blue" />
        <MetricCard label="Available now" value={availableRooms.toString()} tone="green" />
        <MetricCard label="Maintenance" value={maintenanceRooms.toString()} tone="rose" />
        <MetricCard label="Room types" value={categoryCount.toString()} tone="gold" />
      </div> */}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(19rem,1.35fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.775fr)_minmax(21rem,0.9fr)] gap-5 items-stretch">
        <form onSubmit={submitRoom} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col">
          <SectionHeading eyebrow="Physical rooms" title="Add room inventory" />
          <div className="grid grid-cols-2 gap-4">
            <label className={labelCls}>
              <span>Property</span>
              <CustomSelect onChange={(v) => setForm({ ...form, property_id: v, room_category_id: '' })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={form.property_id} />
            </label>
            <label className={labelCls}>
              <span>Room category</span>
              <CustomSelect onChange={(v) => setForm({ ...form, room_category_id: v })} options={categories.filter((c) => !form.property_id || c.property_id === form.property_id).map((c) => ({ label: c.name, value: c.id }))} placeholder="Select category" value={form.room_category_id} />
            </label>
            <label className={labelCls}>
              <span>Room number</span>
              <input className={inputCls} onChange={(e) => setForm({ ...form, room_number: e.target.value })} placeholder="301" required value={form.room_number} />
            </label>
            <label className={labelCls}>
              <span>Status</span>
              <CustomSelect onChange={(v) => setForm({ ...form, status: v as RoomStatus })} options={[{ label: 'Available', value: 'AVAILABLE' }, { label: 'Occupied', value: 'OCCUPIED' }, { label: 'Maintenance', value: 'MAINTENANCE' }]} value={form.status} />
            </label>
          </div>
          <div className="mt-auto pt-5 pb-6">
            <button className={`${primaryBtn} min-w-36 justify-center`} disabled={submitting} type="submit">{submitting ? 'Adding…' : 'Add room'}</button>
          </div>
        </form>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 h-full">
          <SectionHeading eyebrow="Inventory snapshot" title="Current scope" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Physical rooms', value: scopedRooms.length.toString(), tone: 'bg-slate-100 border-slate-200 text-slate-700' },
              { label: 'Sellable now', value: availableRooms.toString(), tone: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
              { label: 'Maintenance', value: maintenanceRooms.toString(), tone: 'bg-rose-50 border-rose-100 text-rose-700' },
              { label: 'Room types', value: categoryCount.toString(), tone: 'bg-amber-50 border-amber-100 text-amber-700' },
            ].map((item) => (
              <div key={item.label} className={`rounded-lg border p-3 min-h-20 flex flex-col justify-between ${item.tone}`}>
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{item.label}</span>
                <span className="text-2xl font-extrabold leading-none">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">Scope</span>
            <span className="text-xs font-bold text-slate-700 leading-snug">{selectedPropertyName}</span>
          </div>
          {uncoveredRoomTypes > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {uncoveredRoomTypes} room type{uncoveredRoomTypes === 1 ? '' : 's'} need physical room coverage.
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 h-full lg:col-start-3">
          <SectionHeading eyebrow="Room model" title="How inventory is represented" />
          <ul className="space-y-3">
            {[
              { label: 'Room types', text: `${categoryCount} room categories define the OTA-sellable inventory model in the current scope.` },
              { label: 'Physical rooms', text: `${scopedRooms.length} room numbers exist for assignment later at check-in and for maintenance tracking.` },
              { label: 'Dated blocks', text: 'Use out-of-service periods for temporary closures instead of leaving a room in permanent maintenance.' },
            ].map((item) => (
              <li key={item.label} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <span className="text-sm font-bold text-slate-800 block mb-1">{item.label}</span>
                <span className="text-sm text-slate-500 leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {message && <SuccessMsg>{message}</SuccessMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      <FilterBar title="Room filters">
        <label className={labelCls}>
          <span>Search rooms</span>
          <input className={inputCls} onChange={(e) => setSearch(e.target.value)} placeholder="Room number, property, or category" value={search} />
        </label>
        <label className={labelCls}>
          <span>Property</span>
          <CustomSelect onChange={setPropertyFilter} options={[{ label: 'All properties', value: 'ALL' }, ...properties.map((p) => ({ label: p.name, value: p.id }))]} value={propertyFilter} />
        </label>
        <label className={labelCls}>
          <span>Status</span>
          <CustomSelect onChange={setStatusFilter} options={[{ label: 'All statuses', value: 'ALL' }, { label: 'Available', value: 'AVAILABLE' }, { label: 'Occupied', value: 'OCCUPIED' }, { label: 'Maintenance', value: 'MAINTENANCE' }]} value={statusFilter} />
        </label>
      </FilterBar>

      {(roomsState.loading || propertiesState.loading || categoriesState.loading) && <LoadingMsg>Loading rooms…</LoadingMsg>}
      {(roomsState.error || propertiesState.error || categoriesState.error) && <ErrorMsg>{roomsState.error ?? propertiesState.error ?? categoriesState.error}</ErrorMsg>}

      <TableCard title={`${rooms.length} rooms configured`} eyebrow="Physical room register">
        <table className="w-full min-w-[600px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Room</Th><Th>Property</Th><Th>Category</Th><Th>Type stock</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                <Td className="font-bold text-slate-900">{room.room_number}</Td>
                <Td>{room.property.name}</Td>
                <Td>{room.room_category.name}</Td>
                <Td className="text-slate-400">{roomCountByCategory.get(`${room.property_id}:${room.room_category_id}`) ?? 0} rooms</Td>
                <Td><StatusBadge label={room.status} /></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button className={`${linkBtn} !text-xs !px-2.5 !py-1 ${selectedRoomId === room.id ? '!bg-indigo-50 !text-indigo-700' : ''}`} onClick={() => { setSelectedRoomId(room.id); setOutOfServiceForm(defaultOutOfServiceForm); }} type="button">
                      {selectedRoomId === room.id ? 'Managing' : 'Manage blocks'}
                    </button>
                    <button className={dangerBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={deletingRoomId === room.id} onClick={() => void deleteRoom(room.id)} type="button">
                      {deletingRoomId === room.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {selectedRoom && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Maintenance windows</p>
            <h3 className="text-base font-bold text-slate-900">{selectedRoom.room_number} · {selectedRoom.property.name}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">Use dated out-of-service periods for temporary maintenance instead of leaving the room in permanent <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-xs">MAINTENANCE</code> status.</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{selectedRoom.room_category.name}</span>
              <StatusBadge label={selectedRoom.status} />
            </div>
          </div>
          <form onSubmit={submitOutOfServicePeriod} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <label className={labelCls}><span>From date</span><input className={inputCls} onChange={(e) => setOutOfServiceForm({ ...outOfServiceForm, from_date: e.target.value })} required type="date" value={outOfServiceForm.from_date} /></label>
            <label className={labelCls}><span>To date</span><input className={inputCls} onChange={(e) => setOutOfServiceForm({ ...outOfServiceForm, to_date: e.target.value })} required type="date" value={outOfServiceForm.to_date} /></label>
            <label className={labelCls}><span>Reason</span><input className={inputCls} onChange={(e) => setOutOfServiceForm({ ...outOfServiceForm, reason: e.target.value })} placeholder="Bathroom repair" required value={outOfServiceForm.reason} /></label>
            <label className={labelCls}><span>Notes</span><input className={inputCls} onChange={(e) => setOutOfServiceForm({ ...outOfServiceForm, notes: e.target.value })} placeholder="Optional details" value={outOfServiceForm.notes} /></label>
            <div className="col-span-full">
              <button className={primaryBtn} disabled={outOfServiceSubmitting} type="submit">{outOfServiceSubmitting ? 'Saving…' : 'Add date block'}</button>
            </div>
          </form>
          {outOfServicePeriodsState.loading && <LoadingMsg>Loading date blocks…</LoadingMsg>}
          {outOfServicePeriodsState.error && <ErrorMsg>{outOfServicePeriodsState.error}</ErrorMsg>}
          {!outOfServicePeriodsState.loading && !outOfServicePeriodsState.error && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{outOfServicePeriodsState.data?.length ?? 0} scheduled windows</p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full min-w-[480px]">
                  <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>From</Th><Th>To</Th><Th>Reason</Th><Th>Notes</Th><Th>Action</Th></tr></thead>
                  <tbody>
                    {outOfServicePeriodsState.data?.length ? outOfServicePeriodsState.data.map((period) => (
                      <tr key={period.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                        <Td>{period.from_date}</Td><Td>{period.to_date}</Td><Td>{period.reason}</Td><Td>{period.notes ?? '—'}</Td>
                        <Td><button className={dangerBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={deletingPeriodId === period.id} onClick={() => void deleteOutOfServicePeriod(period.id)} type="button">{deletingPeriodId === period.id ? 'Removing…' : 'Remove'}</button></Td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-slate-400">No dated out-of-service periods configured for this room.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
