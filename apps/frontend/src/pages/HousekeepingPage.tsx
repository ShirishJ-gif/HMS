import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { HousekeepingPriority, HousekeepingStatus, HousekeepingTask, Property, Room } from '../api/types';
import { useAsync } from '../hooks/useAsync';

const defaultForm = {
  property_id: '',
  room_id: '',
  status: 'DIRTY' as HousekeepingStatus,
  priority: 'NORMAL' as HousekeepingPriority,
  due_date: '',
  notes: '',
};

export function HousekeepingPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const tasksState = useAsync(
    async () => (await api.get<PaginatedResponse<HousekeepingTask>>('/housekeeping')).data,
    [reloadKey],
  );
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const roomsState = useAsync(async () => (await api.get<PaginatedResponse<Room>>('/rooms', { params: { limit: 100 } })).data, []);
  const tasks = tasksState.data?.data ?? [];
  const properties = propertiesState.data ?? [];
  const rooms = roomsState.data?.data ?? [];

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setActionStatus(null);
    setSubmitting(true);

    try {
      await api.post('/housekeeping', {
        ...form,
        due_date: form.due_date || undefined,
        notes: form.notes || undefined,
      });
      setForm(defaultForm);
      setActionStatus('Housekeeping task created.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateTask(id: string, status: HousekeepingStatus) {
    setActionError(null);
    setActionStatus(null);
    setPendingTaskId(id);

    try {
      await api.put(`/housekeeping/${id}`, { status });
      setActionStatus('Housekeeping task updated.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingTaskId(null);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Housekeeping</h2>
          <p className="page-subtitle">Track cleaning, inspection, and out-of-service tasks per physical room.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submitTask}>
        <label>
          Property
          <select
            onChange={(event) => setForm({ ...form, property_id: event.target.value, room_id: '' })}
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
          Room
          <select onChange={(event) => setForm({ ...form, room_id: event.target.value })} required value={form.room_id}>
            <option value="">Select room</option>
            {rooms
              .filter((room) => !form.property_id || room.property_id === form.property_id)
              .map((room) => (
                <option key={room.id} value={room.id}>
                  {room.room_number} - {room.room_category.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Status
          <select
            onChange={(event) => setForm({ ...form, status: event.target.value as HousekeepingStatus })}
            value={form.status}
          >
            <option value="DIRTY">Dirty</option>
            <option value="CLEANING">Cleaning</option>
            <option value="CLEAN">Clean</option>
            <option value="INSPECTED">Inspected</option>
            <option value="OUT_OF_SERVICE">Out of service</option>
          </select>
        </label>
        <label>
          Priority
          <select
            onChange={(event) => setForm({ ...form, priority: event.target.value as HousekeepingPriority })}
            value={form.priority}
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <label>
          Due date
          <input
            onChange={(event) => setForm({ ...form, due_date: event.target.value })}
            placeholder="2026-05-01"
            type="date"
            value={form.due_date}
          />
        </label>
        <label className="wide-field">
          Notes
          <textarea
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Post check-out cleaning required"
            value={form.notes}
          />
        </label>
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Creating...' : 'Create task'}
        </button>
      </form>

      {actionStatus && <p className="success">{actionStatus}</p>}
      {actionError && <p className="error">{actionError}</p>}

      {(tasksState.loading || propertiesState.loading || roomsState.loading) && <p className="muted">Loading housekeeping...</p>}
      {(tasksState.error || propertiesState.error || roomsState.error) && (
        <p className="error">{tasksState.error ?? propertiesState.error ?? roomsState.error}</p>
      )}

      <div className="table-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Task board</p>
            <h3>{tasks.length} housekeeping tasks</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>Room</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Due</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.property.name}</td>
                <td>
                  {task.room.room_number}
                  <br />
                  <span className="muted">{task.room.room_category.name}</span>
                </td>
                <td>
                  <span className="status-pill">{task.status}</span>
                </td>
                <td>{task.priority}</td>
                <td>{task.due_date ?? '-'}</td>
                <td>{task.notes ?? '-'}</td>
                <td className="action-row">
                  <button
                    className="link-button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void updateTask(task.id, 'CLEANING')}
                    type="button"
                  >
                    {pendingTaskId === task.id ? 'Updating...' : 'Start'}
                  </button>
                  <button
                    className="link-button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void updateTask(task.id, 'INSPECTED')}
                    type="button"
                  >
                    {pendingTaskId === task.id ? 'Updating...' : 'Inspect'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
