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
  const dirtyTasks = tasks.filter((task) => task.status === 'DIRTY');
  const cleaningTasks = tasks.filter((task) => task.status === 'CLEANING');
  const clearedTasks = tasks.filter((task) => task.status === 'CLEAN' || task.status === 'INSPECTED');
  const outOfServiceTasks = tasks.filter((task) => task.status === 'OUT_OF_SERVICE');

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

      <div className="booking-layout housekeeping-layout">
        <form className="card booking-form-card" onSubmit={submitTask}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Manual task</p>
              <h3>Create housekeeping task</h3>
            </div>
          </div>
          <div className="booking-form-grid">
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
          </div>
          <div className="booking-form-footer">
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </form>

        <aside className="booking-sidepanel">
          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Task mix</p>
                <h3>Housekeeping load</h3>
              </div>
            </div>
            <div className="signal-grid compact-signal-grid">
              <SignalStat label="Dirty" value={String(dirtyTasks.length)} />
              <SignalStat label="Cleaning" value={String(cleaningTasks.length)} />
              <SignalStat label="Cleared" value={String(clearedTasks.length)} />
            </div>
          </article>
        </aside>
      </div>

      {actionStatus && <p className="success">{actionStatus}</p>}
      {actionError && <p className="error">{actionError}</p>}

      {(tasksState.loading || propertiesState.loading || roomsState.loading) && <p className="muted">Loading housekeeping...</p>}
      {(tasksState.error || propertiesState.error || roomsState.error) && (
        <p className="error">{tasksState.error ?? propertiesState.error ?? roomsState.error}</p>
      )}

      <div className="operations-grid housekeeping-board">
        <TaskColumn
          emptyText="No dirty rooms."
          onUpdate={updateTask}
          pendingTaskId={pendingTaskId}
          tasks={dirtyTasks}
          title="Dirty"
        />
        <TaskColumn
          emptyText="No rooms are being cleaned."
          onUpdate={updateTask}
          pendingTaskId={pendingTaskId}
          tasks={cleaningTasks}
          title="Cleaning"
        />
        <TaskColumn
          emptyText="No cleared tasks."
          onUpdate={updateTask}
          pendingTaskId={pendingTaskId}
          tasks={clearedTasks}
          title="Cleared"
        />
      </div>

      {outOfServiceTasks.length > 0 && (
        <div className="table-card spaced-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Out of service</p>
              <h3>{outOfServiceTasks.length} blocked rooms</h3>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Property</th>
                <th>Due</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {outOfServiceTasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    {task.room.room_number}
                    <br />
                    <span className="muted">{task.room.room_category.name}</span>
                  </td>
                  <td>{task.property.name}</td>
                  <td>{task.due_date ?? '-'}</td>
                  <td>{task.notes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SignalStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function TaskColumn({
  emptyText,
  onUpdate,
  pendingTaskId,
  tasks,
  title,
}: {
  emptyText: string;
  onUpdate: (id: string, status: HousekeepingStatus) => Promise<void>;
  pendingTaskId: string | null;
  tasks: HousekeepingTask[];
  title: string;
}) {
  return (
    <section className="insight-panel operational-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Task board</p>
          <h3>{title}</h3>
        </div>
        <span className="status-pill">{tasks.length}</span>
      </div>
      <div className="operation-stream">
        {tasks.length === 0 ? (
          <p className="muted">{emptyText}</p>
        ) : (
          tasks.map((task) => (
            <article className={`operation-card ${task.status.toLowerCase()}`} key={task.id}>
              <div className="operation-card-header">
                <div>
                  <strong>
                    {task.room.room_number} · {task.room.room_category.name}
                  </strong>
                  <div className="operation-meta">
                    <span>{task.property.name}</span>
                    <span>{task.priority}</span>
                    <span>{task.due_date ?? 'No due date'}</span>
                  </div>
                </div>
                <span className="status-pill">{task.status}</span>
              </div>
              <div className="muted">
                {task.reservation_room
                  ? `${task.reservation_room.external_reservation_id} · room line ${task.reservation_room.external_room_reservation_id}`
                  : 'Manual task'}
              </div>
              {task.notes ? <div>{task.notes}</div> : null}
              <div className="compact-action-row">
                {task.status === 'DIRTY' && (
                  <button
                    className="link-button compact-button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void onUpdate(task.id, 'CLEANING')}
                    type="button"
                  >
                    {pendingTaskId === task.id ? 'Updating...' : 'Start'}
                  </button>
                )}
                {(task.status === 'DIRTY' || task.status === 'CLEANING') && (
                  <button
                    className="link-button compact-button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void onUpdate(task.id, 'CLEAN')}
                    type="button"
                  >
                    {pendingTaskId === task.id ? 'Updating...' : 'Mark clean'}
                  </button>
                )}
                {(task.status === 'CLEAN' || task.status === 'CLEANING') && (
                  <button
                    className="secondary-button compact-button"
                    disabled={pendingTaskId === task.id}
                    onClick={() => void onUpdate(task.id, 'INSPECTED')}
                    type="button"
                  >
                    {pendingTaskId === task.id ? 'Updating...' : 'Inspect'}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
