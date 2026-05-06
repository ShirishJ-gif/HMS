import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
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
    async () => (await api.get<PaginatedResponse<Room>>('/rooms', { params: { search: search || undefined } })).data,
    [reloadKey, search],
  );
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const categoriesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<RoomCategory>>('/room-categories', { params: { limit: 100 } })).data),
    [],
  );
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
  const rooms = (roomsState.data?.data ?? []).filter((room) => {
    if (propertyFilter !== 'ALL' && room.property.id !== propertyFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && room.status !== statusFilter) {
      return false;
    }

    return true;
  });
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

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
          <p className="eyebrow">Inventory</p>
          <h2>Rooms</h2>
          <p className="page-subtitle">
            Add the property room inventory here. Bulk room upload is not part of this MVP yet.
          </p>
        </div>
      </div>

      <div className="info-strip">
        <strong>Single-property MVP</strong>
        <span>
          Treat this screen as the property setup area for rooms. A future Property module can add hotel profile,
          amenities, photos, policies, and CSV import.
        </span>
      </div>

      <form className="card form-grid" onSubmit={submitRoom}>
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
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Adding...' : 'Add room'}
        </button>
      </form>

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
            <p className="eyebrow">Room inventory</p>
            <h3>{roomsState.data?.meta.total ?? rooms.length} rooms configured</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Property</th>
              <th>Category</th>
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
        <div className="card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Date blocks</p>
              <h3>
                {selectedRoom.room_number} · {selectedRoom.property.name}
              </h3>
              <p className="page-subtitle">
                Use dated out-of-service periods for temporary maintenance instead of leaving the room in permanent
                `MAINTENANCE` status.
              </p>
            </div>
          </div>

          <form className="form-grid" onSubmit={submitOutOfServicePeriod}>
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
            <table>
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
          )}
        </div>
      )}
    </section>
  );
}
