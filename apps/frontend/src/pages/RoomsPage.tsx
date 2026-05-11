import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Property, Room, RoomCategory, RoomOutOfServicePeriod, RoomStatus } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';

const defaultForm = {
  property_id: '',
  room_category_id: '',
  room_number: '',
  status: 'AVAILABLE' as RoomStatus,
};

const defaultOutOfServiceForm = {
  from_date: '',
  to_date: '',
  reason: '',
  notes: '',
};

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
  const roomsState = useAsync(
    async () => fetchAllPages<Room>('/rooms', { params: { search: search || undefined } }),
    [reloadKey, search],
  );
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const outOfServicePeriodsState = useAsync(
    async () => {
      if (!selectedRoomId) {
        return [];
      }

      return (
        await api.get<RoomOutOfServicePeriod[]>(`/rooms/${selectedRoomId}/out-of-service-periods`)
      ).data;
    },
    [selectedRoomId, periodReloadKey],
  );
  const properties = propertiesState.data ?? [];
  const categories = categoriesState.data ?? [];
  const scopedRooms = (roomsState.data ?? []).filter((room) => {
    if (propertyFilter !== 'ALL' && room.property.id !== propertyFilter) {
      return false;
    }

    return true;
  });
  const rooms = scopedRooms.filter((room) => {
    if (propertyFilter !== 'ALL' && room.property.id !== propertyFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && room.status !== statusFilter) {
      return false;
    }

    return true;
  });
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const availableRooms = scopedRooms.filter((room) => room.status === 'AVAILABLE').length;
  const occupiedRooms = scopedRooms.filter((room) => room.status === 'OCCUPIED').length;
  const maintenanceRooms = scopedRooms.filter((room) => room.status === 'MAINTENANCE').length;
  const filteredCategories = categories.filter((category) => propertyFilter === 'ALL' || category.property_id === propertyFilter);
  const categoryCount = new Set(filteredCategories.map((category) => category.id)).size;
  const roomCountByCategory = rooms.reduce((counts, room) => {
    const key = `${room.property_id}:${room.room_category_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  async function submitRoom(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setActionError(null);
    setSubmitting(true);

    try {
      await api.post('/rooms', form);
      setForm(defaultForm);
      setMessage('Room created.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteRoom(id: string) {
    setMessage(null);
    setActionError(null);
    setDeletingRoomId(id);

    try {
      await api.delete(`/rooms/${id}`);
      setMessage('Room deleted.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setDeletingRoomId(null);
    }
  }

  async function submitOutOfServicePeriod(event: FormEvent) {
    event.preventDefault();
    if (!selectedRoomId) {
      return;
    }

    setMessage(null);
    setActionError(null);
    setOutOfServiceSubmitting(true);

    try {
      await api.post(`/rooms/${selectedRoomId}/out-of-service-periods`, outOfServiceForm);
      setOutOfServiceForm(defaultOutOfServiceForm);
      setMessage('Out-of-service period saved.');
      setPeriodReloadKey((value) => value + 1);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setOutOfServiceSubmitting(false);
    }
  }

  async function deleteOutOfServicePeriod(periodId: string) {
    if (!selectedRoomId) {
      return;
    }

    setMessage(null);
    setActionError(null);
    setDeletingPeriodId(periodId);

    try {
      await api.delete(`/rooms/${selectedRoomId}/out-of-service-periods/${periodId}`);
      setMessage('Out-of-service period removed.');
      setPeriodReloadKey((value) => value + 1);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setDeletingPeriodId(null);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Rooms &amp; Inventory</h2>
          <p className="page-subtitle">
            Manage physical rooms, room-type coverage, and dated maintenance blocks that affect centralized sellable inventory.
          </p>
        </div>
      </div>

      <div className="info-strip">
        <strong>Inventory model</strong>
        <span>
          OTAs sell room types, not physical room numbers. This workspace manages the physical rooms that feed centralized room-category inventory and later get assigned at check-in.
        </span>
      </div>

      <div className="operations-snapshot-grid">
        <SnapshotCard
          detail="Physical rooms currently loaded for the filtered view."
          label="Physical rooms"
          tone="blue"
          value={scopedRooms.length.toString()}
        />
        <SnapshotCard
          detail="Sellable rooms that are not occupied or under permanent maintenance."
          label="Available now"
          tone="green"
          value={availableRooms.toString()}
        />
        <SnapshotCard
          detail="Permanent maintenance rooms are excluded from sellable inventory."
          label="Maintenance"
          tone="rose"
          value={maintenanceRooms.toString()}
        />
        <SnapshotCard
          detail="Room categories represented by the current property scope."
          label="Room types"
          tone="gold"
          value={categoryCount.toString()}
        />
      </div>

      <div className="booking-layout rooms-workspace">
        <form className="card booking-form-card rooms-form-card" onSubmit={submitRoom}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Physical rooms</p>
              <h3>Add room inventory</h3>
            </div>
          </div>
          <div className="booking-form-grid">
            <label>
              Property
              <select
                onChange={(event) => setForm({ ...form, property_id: event.target.value, room_category_id: '' })}
                required
                value={form.property_id}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Room category
              <select
                onChange={(event) => setForm({ ...form, room_category_id: event.target.value })}
                required
                value={form.room_category_id}
              >
                <option value="">Select category</option>
                {categories
                  .filter((category) => !form.property_id || category.property_id === form.property_id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Room number
              <input
                onChange={(event) => setForm({ ...form, room_number: event.target.value })}
                placeholder="301"
                required
                value={form.room_number}
              />
            </label>
            <label>
              Status
              <select
                onChange={(event) => setForm({ ...form, status: event.target.value as RoomStatus })}
                value={form.status}
              >
                <option value="AVAILABLE">Available</option>
                <option value="OCCUPIED">Occupied</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </label>
          </div>
          <div className="booking-form-footer">
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Adding...' : 'Add room'}
            </button>
          </div>
        </form>

        <aside className="booking-sidepanel rooms-sidepanel">
          <div className="insight-panel rooms-sidepanel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Room model</p>
                <h3>How inventory is represented</h3>
              </div>
            </div>
            <ul className="attention-list">
              <li>
                <strong>Room types</strong>
                <span>{categoryCount} room categories define the OTA-sellable inventory model in the current scope.</span>
              </li>
              <li>
                <strong>Physical rooms</strong>
                <span>{scopedRooms.length} room numbers exist for assignment later at check-in and for maintenance tracking.</span>
              </li>
              <li>
                <strong>Dated blocks</strong>
                <span>Use out-of-service periods for temporary closures instead of leaving a room in permanent maintenance.</span>
              </li>
            </ul>
          </div>

          {/* <div className="insight-panel rooms-sidepanel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Current posture</p>
                <h3>Inventory status mix</h3>
              </div>
            </div>
            <div className="compact-signal-grid rooms-status-row">
              <SignalStat label="Available" value={availableRooms} />
              <SignalStat label="Occupied" value={occupiedRooms} />
              <SignalStat label="Maintenance" value={maintenanceRooms} />
            </div>
          </div> */}
        </aside>
      </div>

      {message && <p className="success">{message}</p>}
      {actionError && <p className="error">{actionError}</p>}
      <FilterBar title="Room filters">
        <label>
          Search rooms
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Room number, property, or category"
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
            <option value="AVAILABLE">Available</option>
            <option value="OCCUPIED">Occupied</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </label>
      </FilterBar>

      {(roomsState.loading || propertiesState.loading || categoriesState.loading) && <p className="muted">Loading rooms...</p>}
      {(roomsState.error || propertiesState.error || categoriesState.error) && (
        <p className="error">{roomsState.error ?? propertiesState.error ?? categoriesState.error}</p>
      )}

      <div className="table-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Physical room register</p>
            <h3>{rooms.length} rooms configured</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Property</th>
              <th>Category</th>
              <th>Type stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.room_number}</td>
                <td>{room.property.name}</td>
                <td>{room.room_category.name}</td>
                <td>{roomCountByCategory.get(`${room.property_id}:${room.room_category_id}`) ?? 0} rooms</td>
                <td>
                  <span className={`status-pill ${room.status.toLowerCase()}`}>{room.status}</span>
                </td>
                <td>
                  <button
                    className="link-button"
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setOutOfServiceForm(defaultOutOfServiceForm);
                    }}
                    type="button"
                  >
                    {selectedRoomId === room.id ? 'Managing blocks' : 'Manage blocks'}
                  </button>
                  {' · '}
                  <button
                    className="link-button"
                    disabled={deletingRoomId === room.id}
                    onClick={() => void deleteRoom(room.id)}
                    type="button"
                  >
                    {deletingRoomId === room.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRoom && (
        <div className="card rooms-maintenance-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Maintenance windows</p>
              <h3>
                {selectedRoom.room_number} · {selectedRoom.property.name}
              </h3>
              <p className="page-subtitle">
                Use dated out-of-service periods for temporary maintenance instead of leaving the room in permanent{' '}
                <code>MAINTENANCE</code> status.
              </p>
              <div className="rooms-maintenance-header-meta">
                <span className="rooms-maintenance-chip">{selectedRoom.room_category.name}</span>
                <span className={`rooms-maintenance-chip status ${selectedRoom.status.toLowerCase()}`}>{selectedRoom.status}</span>
                <span className="rooms-maintenance-chip subdued">Temporary closure planner</span>
              </div>
            </div>
          </div>

          <form className="form-grid rooms-maintenance-form" onSubmit={submitOutOfServicePeriod}>
            <label>
              From date
              <input
                onChange={(event) => setOutOfServiceForm({ ...outOfServiceForm, from_date: event.target.value })}
                required
                type="date"
                value={outOfServiceForm.from_date}
              />
            </label>
            <label>
              To date
              <input
                onChange={(event) => setOutOfServiceForm({ ...outOfServiceForm, to_date: event.target.value })}
                required
                type="date"
                value={outOfServiceForm.to_date}
              />
            </label>
            <label>
              Reason
              <input
                onChange={(event) => setOutOfServiceForm({ ...outOfServiceForm, reason: event.target.value })}
                placeholder="Bathroom repair"
                required
                value={outOfServiceForm.reason}
              />
            </label>
            <label>
              Notes
              <input
                onChange={(event) => setOutOfServiceForm({ ...outOfServiceForm, notes: event.target.value })}
                placeholder="Optional details"
                value={outOfServiceForm.notes}
              />
            </label>
            <button className="primary-button" disabled={outOfServiceSubmitting} type="submit">
              {outOfServiceSubmitting ? 'Saving...' : 'Add date block'}
            </button>
          </form>

          {outOfServicePeriodsState.loading && <p className="muted">Loading date blocks...</p>}
          {outOfServicePeriodsState.error && <p className="error">{outOfServicePeriodsState.error}</p>}

          {!outOfServicePeriodsState.loading && !outOfServicePeriodsState.error && (
            <div className="rooms-maintenance-periods">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Existing blocks</p>
                  <h3>{outOfServicePeriodsState.data?.length ?? 0} scheduled windows</h3>
                </div>
              </div>
              <table className="rooms-maintenance-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Reason</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfServicePeriodsState.data?.length ? (
                    outOfServicePeriodsState.data.map((period) => (
                      <tr key={period.id}>
                        <td>{period.from_date}</td>
                        <td>{period.to_date}</td>
                        <td>{period.reason}</td>
                        <td>{period.notes ?? '—'}</td>
                        <td>
                          <button
                            className="link-button"
                            disabled={deletingPeriodId === period.id}
                            onClick={() => void deleteOutOfServicePeriod(period.id)}
                            type="button"
                          >
                            {deletingPeriodId === period.id ? 'Removing...' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={5}>
                        No dated out-of-service periods configured for this room.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SnapshotCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: 'blue' | 'gold' | 'green' | 'rose';
  value: string;
}) {
  return (
    <article className="channel-summary-card operations-snapshot-card">
      <p>{label}</p>
      <strong className={`tone-${tone}`}>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function SignalStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
