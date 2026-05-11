import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
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
  const tasksState = useAsync(async () => fetchAllPages<HousekeepingTask>('/housekeeping'), [reloadKey]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const roomsState = useAsync(async () => fetchAllPages<Room>('/rooms'), []);
  const tasks = tasksState.data ?? [];
  const properties = propertiesState.data ?? [];
  const rooms = roomsState.data ?? [];
  const today = getLocalDate();
  const dirtyTasks = tasks.filter((task) => task.status === 'DIRTY');
  const cleaningTasks = tasks.filter((task) => task.status === 'CLEANING');
  const clearedTasks = tasks.filter((task) => task.status === 'CLEAN' || task.status === 'INSPECTED');
  const outOfServiceTasks = tasks.filter((task) => task.status === 'OUT_OF_SERVICE');
  const openTaskCount = dirtyTasks.length + cleaningTasks.length + outOfServiceTasks.length;
  const overdueTasks = tasks.filter(
    (task) =>
      task.due_date &&
      task.due_date < today &&
      !['CLEAN', 'INSPECTED'].includes(task.status),
  );
  const urgentTasks = tasks.filter(
    (task) =>
      ['HIGH', 'URGENT'].includes(task.priority) &&
      !['CLEAN', 'INSPECTED'].includes(task.status),
  );

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
          <p className="page-subtitle">
            Track cleaning, inspection, and room-readiness work per physical room before front desk hands the room back into service.
          </p>
        </div>
      </div>

      <div className="info-strip">
        <strong>Operational purpose</strong>
        <span>
          Housekeeping status tracks operational readiness only. Dated room blocks and permanent maintenance are managed separately and are what reduce sellable inventory elsewhere in the system.
        </span>
      </div>

      <div className="housekeeping-snapshot-grid">
        <HousekeepingSignalCard detail="Dirty, cleaning, and out-of-service tasks still in play" label="Open tasks" value={String(openTaskCount)} />
        <HousekeepingSignalCard detail="Tasks with due dates before today" label="Overdue" value={String(overdueTasks.length)} />
        <HousekeepingSignalCard
          detail="Rooms paused in housekeeping. This alone does not change OTA inventory."
          label="Out of service"
          value={String(outOfServiceTasks.length)}
        />
        <HousekeepingSignalCard detail="Rooms marked clean or inspected" label="Ready rooms" value={String(clearedTasks.length)} />
      </div>

      <div className="booking-layout housekeeping-layout">
        <form className="card booking-form-card housekeeping-form-card" onSubmit={submitTask}>
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

        <aside className="booking-sidepanel housekeeping-sidepanel">
          <article className="insight-panel housekeeping-sidepanel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Task mix</p>
                <h3>Readiness load</h3>
              </div>
            </div>
            <div className="signal-grid compact-signal-grid housekeeping-status-row">
              <SignalStat label="Dirty" value={String(dirtyTasks.length)} />
              <SignalStat label="Cleaning" value={String(cleaningTasks.length)} />
              <SignalStat label="Cleared" value={String(clearedTasks.length)} />
              <SignalStat label="Out of service" value={String(outOfServiceTasks.length)} />
            </div>
          </article>

          <article className="insight-panel housekeeping-sidepanel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Dispatch cues</p>
                <h3>What to release next</h3>
              </div>
            </div>
            <dl className="detail-list housekeeping-dispatch-list">
              <div>
                <dt>Urgent queue</dt>
                <dd>{urgentTasks.length}</dd>
              </div>
              <div>
                <dt>Overdue tasks</dt>
                <dd>{overdueTasks.length}</dd>
              </div>
              <div>
                <dt>Ready for arrivals</dt>
                <dd>{clearedTasks.length}</dd>
              </div>
            </dl>
            <p className="housekeeping-sidepanel-note">
              Move dirty rooms into cleaning first, then inspect cleared rooms before handing them back to front desk. Remove date blocks or maintenance separately in Rooms &amp; Inventory.
            </p>
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
          eyebrow="Immediate attention"
          tone="dirty"
          emptyText="No dirty rooms."
          onUpdate={updateTask}
          pendingTaskId={pendingTaskId}
          tasks={dirtyTasks}
          title="Dirty"
        />
        <TaskColumn
          eyebrow="In progress"
          tone="cleaning"
          emptyText="No rooms are being cleaned."
          onUpdate={updateTask}
          pendingTaskId={pendingTaskId}
          tasks={cleaningTasks}
          title="Cleaning"
        />
        <TaskColumn
          eyebrow="Ready queue"
          tone="cleared"
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
              <h3>{outOfServiceTasks.length} rooms paused in housekeeping</h3>
              <p className="page-subtitle">
                Clearing this task updates housekeeping readiness only. Dated maintenance blocks and permanent room maintenance are managed in Rooms &amp; Inventory.
              </p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Property</th>
                <th>Due</th>
                <th>Notes</th>
                <th>Action</th>
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
                  <td>
                    <div className="compact-action-row">
                      <button
                        className="link-button compact-button"
                        disabled={pendingTaskId === task.id}
                        onClick={() => void updateTask(task.id, 'CLEANING')}
                        type="button"
                      >
                        {pendingTaskId === task.id ? 'Updating...' : 'Move to cleaning'}
                      </button>
                      <button
                        className="secondary-button compact-button"
                        disabled={pendingTaskId === task.id}
                        onClick={() => void updateTask(task.id, 'INSPECTED')}
                        type="button"
                      >
                        {pendingTaskId === task.id ? 'Updating...' : 'Mark inspected'}
                      </button>
                    </div>
                  </td>
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

function HousekeepingSignalCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="signal-card housekeeping-signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function TaskColumn({
  eyebrow,
  tone,
  emptyText,
  onUpdate,
  pendingTaskId,
  tasks,
  title,
}: {
  eyebrow: string;
  tone: 'dirty' | 'cleaning' | 'cleared';
  emptyText: string;
  onUpdate: (id: string, status: HousekeepingStatus) => Promise<void>;
  pendingTaskId: string | null;
  tasks: HousekeepingTask[];
  title: string;
}) {
  return (
    <section className={`insight-panel operational-surface housekeeping-column housekeeping-column-${tone}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
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
                  <div className="operation-meta housekeeping-operation-meta">
                    <span className="housekeeping-task-tag">{task.property.name}</span>
                    <span className={`housekeeping-task-tag priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    <span className="housekeeping-task-tag">{task.due_date ?? 'No due date'}</span>
                  </div>
                </div>
                <span className={`status-pill ${task.status.toLowerCase()}`}>{task.status}</span>
              </div>
              <div className="muted housekeeping-reference">
                {task.reservation_room
                  ? `${task.reservation_room.external_reservation_id} · room line ${task.reservation_room.external_room_reservation_id}`
                  : 'Manual task'}
              </div>
              {task.notes ? <div className="housekeeping-note">{task.notes}</div> : null}
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

function getLocalDate() {
  const now = new Date();
  const offsetMillis = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMillis).toISOString().slice(0, 10);
}
