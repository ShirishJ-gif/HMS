import { FormEvent, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { HousekeepingPriority, HousekeepingStatus, HousekeepingTask, Property, Room } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { MetricCard, SectionHeading, DetailList, TableCard, Th, Td, labelCls, inputCls, primaryBtn, secondaryBtn, linkBtn, ErrorMsg, SuccessMsg, LoadingMsg } from './ui';

const defaultForm = { property_id: '', room_id: '', status: 'DIRTY' as HousekeepingStatus, priority: 'NORMAL' as HousekeepingPriority, due_date: '', notes: '' };

const toneCols: Record<string, string> = {
  dirty: 'border-t-rose-400',
  cleaning: 'border-t-amber-400',
  cleared: 'border-t-emerald-400',
};

export function HousekeepingPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const tasksState = useAsync(async () => fetchAllPages<HousekeepingTask>('/housekeeping'), [reloadKey]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const roomsState = useAsync(async () => fetchAllPages<Room>('/rooms'), []);
  const tasks = tasksState.data ?? [];
  const properties = propertiesState.data ?? [];
  const rooms = roomsState.data ?? [];
  const today = getLocalDate();
  const dirtyTasks = tasks.filter((t) => t.status === 'DIRTY');
  const cleaningTasks = tasks.filter((t) => t.status === 'CLEANING');
  const clearedTasks = tasks.filter((t) => t.status === 'CLEAN' || t.status === 'INSPECTED');
  const outOfServiceTasks = tasks.filter((t) => t.status === 'OUT_OF_SERVICE');
  const openTaskCount = dirtyTasks.length + cleaningTasks.length + outOfServiceTasks.length;
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < today && !['CLEAN', 'INSPECTED'].includes(t.status));
  const urgentTasks = tasks.filter((t) => ['HIGH', 'URGENT'].includes(t.priority) && !['CLEAN', 'INSPECTED'].includes(t.status));

  async function submitTask(event: FormEvent) {
    event.preventDefault(); setActionError(null); setActionStatus(null); setSubmitting(true);
    try {
      await api.post('/housekeeping', { ...form, due_date: form.due_date || undefined, notes: form.notes || undefined });
      setForm(defaultForm); setActionStatus('Housekeeping task created.'); setReloadKey((v) => v + 1);
    } catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setSubmitting(false); }
  }

  async function updateTask(id: string, status: HousekeepingStatus) {
    setActionError(null); setActionStatus(null); setPendingTaskId(id);
    try { await api.put(`/housekeeping/${id}`, { status }); setActionStatus('Task updated.'); setReloadKey((v) => v + 1); }
    catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setPendingTaskId(null); }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Operations</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Housekeeping</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Track cleaning, inspection, and room-readiness work per physical room before front desk hands the room back into service.
        </p>
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">Operational purpose</strong>
        <span className="text-slate-500 leading-relaxed">Housekeeping status tracks operational readiness only. Dated room blocks and permanent maintenance are managed separately and are what reduce sellable inventory elsewhere in the system.</span>
      </div>

      {/* Snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Open tasks" value={String(openTaskCount)} tone="default" sub="Dirty, cleaning, out-of-service" />
        <MetricCard label="Overdue" value={String(overdueTasks.length)} tone="gold" sub="Past due date" />
        <MetricCard label="Out of service" value={String(outOfServiceTasks.length)} tone="rose" sub="Housekeeping paused" />
        <MetricCard label="Ready rooms" value={String(clearedTasks.length)} tone="green" sub="Clean or inspected" />
      </div>

      {/* Form + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.95fr)] gap-5 items-start">
        <form onSubmit={submitTask} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <SectionHeading eyebrow="Manual task" title="Create housekeeping task" />
          <div className="grid grid-cols-2 gap-4">
            <label className={labelCls}>
              <span>Property</span>
              <CustomSelect onChange={(v) => setForm({ ...form, property_id: v, room_id: '' })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={form.property_id} />
            </label>
            <label className={labelCls}>
              <span>Room</span>
              <CustomSelect onChange={(v) => setForm({ ...form, room_id: v })} options={rooms.filter((r) => !form.property_id || r.property_id === form.property_id).map((r) => ({ label: `${r.room_number} — ${r.room_category.name}`, value: r.id }))} placeholder="Select room" value={form.room_id} />
            </label>
            <label className={labelCls}>
              <span>Status</span>
              <CustomSelect onChange={(v) => setForm({ ...form, status: v as HousekeepingStatus })} options={[{ label: 'Dirty', value: 'DIRTY' }, { label: 'Cleaning', value: 'CLEANING' }, { label: 'Clean', value: 'CLEAN' }, { label: 'Inspected', value: 'INSPECTED' }, { label: 'Out of service', value: 'OUT_OF_SERVICE' }]} value={form.status} />
            </label>
            <label className={labelCls}>
              <span>Priority</span>
              <CustomSelect onChange={(v) => setForm({ ...form, priority: v as HousekeepingPriority })} options={[{ label: 'Low', value: 'LOW' }, { label: 'Normal', value: 'NORMAL' }, { label: 'High', value: 'HIGH' }, { label: 'Urgent', value: 'URGENT' }]} value={form.priority} />
            </label>
            <div className={`${labelCls} col-span-2`}>
              <span>Due date</span>
              <div className="relative">
                  <button
                    className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:max-w-[13rem]"
                    onClick={() => setDueDatePickerOpen((open) => !open)}
                    type="button"
                  >
                    <span>{form.due_date ? formatDueDate(form.due_date) : 'Pick a date'}</span>
                    <CalendarIcon className="h-4 w-4 text-slate-400" />
                  </button>
                {dueDatePickerOpen && (
                  <div className="absolute left-0 top-[3rem] z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <DayPicker
                      animate
                      className="hms-day-picker"
                      defaultMonth={parseDateValue(form.due_date) ?? parseDateValue(today)}
                      fixedWeeks
                      mode="single"
                      onSelect={(date) => {
                        setForm({ ...form, due_date: date ? dateToInputValue(date) : '' });
                        if (date) setDueDatePickerOpen(false);
                      }}
                      selected={parseDateValue(form.due_date)}
                      showOutsideDays
                      weekStartsOn={1}
                    />
                  </div>
                )}
                <p className="mt-2 text-[11px] font-medium text-slate-400">{form.due_date ? `Task will be due on ${formatDueDate(form.due_date)}.` : 'Leave empty when this task has no deadline.'}</p>
              </div>
            </div>
            <label className={`${labelCls} col-span-2`}>
              <span>Notes</span>
              <textarea className={`${inputCls} min-h-[5rem] resize-y`} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Post check-out cleaning required" value={form.notes} />
            </label>
          </div>
          <div className="mt-4">
            <button className={primaryBtn} disabled={submitting} type="submit">{submitting ? 'Creating…' : 'Create task'}</button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <SectionHeading eyebrow="Task mix" title="Readiness load" />
            <div className="grid grid-cols-2 gap-3">
              {[['Dirty', dirtyTasks.length, 'rose'], ['Cleaning', cleaningTasks.length, 'gold'], ['Cleared', clearedTasks.length, 'green'], ['Out of service', outOfServiceTasks.length, 'default']].map(([label, val, tone]) => (
                <div key={String(label)} className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                  <strong className="text-xl font-extrabold text-slate-900">{String(val)}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <SectionHeading eyebrow="Dispatch cues" title="What to release next" />
            <DetailList rows={[
              { label: 'Urgent queue', value: String(urgentTasks.length) },
              { label: 'Overdue tasks', value: String(overdueTasks.length) },
              { label: 'Ready for arrivals', value: String(clearedTasks.length) },
            ]} />
            <p className="text-xs text-slate-400 mt-8 leading-relaxed">Move dirty rooms into cleaning first, then inspect cleared rooms before handing them back to front desk.</p>
          </div>
        </div>
      </div>

      {actionStatus && <SuccessMsg>{actionStatus}</SuccessMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
      {(tasksState.loading || propertiesState.loading || roomsState.loading) && <LoadingMsg>Loading housekeeping…</LoadingMsg>}
      {(tasksState.error || propertiesState.error || roomsState.error) && <ErrorMsg>{tasksState.error ?? propertiesState.error ?? roomsState.error}</ErrorMsg>}

      {/* Kanban board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TaskColumn eyebrow="Immediate attention" tone="dirty" emptyText="No dirty rooms." onUpdate={updateTask} pendingTaskId={pendingTaskId} tasks={dirtyTasks} title="Dirty" />
        <TaskColumn eyebrow="In progress" tone="cleaning" emptyText="No rooms are being cleaned." onUpdate={updateTask} pendingTaskId={pendingTaskId} tasks={cleaningTasks} title="Cleaning" />
        <TaskColumn eyebrow="Ready queue" tone="cleared" emptyText="No cleared tasks." onUpdate={updateTask} pendingTaskId={pendingTaskId} tasks={clearedTasks} title="Cleared" />
      </div>

      {/* Out of service table */}
      {outOfServiceTasks.length > 0 && (
        <TableCard title={`${outOfServiceTasks.length} rooms paused in housekeeping`} eyebrow="Out of service">
          <p className="px-5 py-2 text-xs text-slate-400">Clearing this task updates housekeeping readiness only. Dated maintenance blocks are managed in Rooms &amp; Inventory.</p>
          <table className="w-full min-w-[500px]">
            <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Room</Th><Th>Property</Th><Th>Due</Th><Th>Notes</Th><Th>Action</Th></tr></thead>
            <tbody>
              {outOfServiceTasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                  <Td><span className="font-semibold text-slate-900">{task.room.room_number}</span><br /><span className="text-xs text-slate-400">{task.room.room_category.name}</span></Td>
                  <Td>{task.property.name}</Td>
                  <Td>{task.due_date ?? '—'}</Td>
                  <Td>{task.notes ?? '—'}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button className={linkBtn} disabled={pendingTaskId === task.id} onClick={() => void updateTask(task.id, 'CLEANING')} type="button">{pendingTaskId === task.id ? 'Updating…' : 'Move to cleaning'}</button>
                      <button className={secondaryBtn + ' !text-xs !px-3 !py-1.5'} disabled={pendingTaskId === task.id} onClick={() => void updateTask(task.id, 'INSPECTED')} type="button">Mark inspected</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </section>
  );
}

const priorityColor: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-500', NORMAL: 'bg-sky-50 text-sky-700', HIGH: 'bg-amber-50 text-amber-700', URGENT: 'bg-rose-50 text-rose-700',
};

function TaskColumn({ eyebrow, tone, emptyText, onUpdate, pendingTaskId, tasks, title }: {
  eyebrow: string; tone: 'dirty' | 'cleaning' | 'cleared'; emptyText: string;
  onUpdate: (id: string, status: HousekeepingStatus) => Promise<void>; pendingTaskId: string | null; tasks: HousekeepingTask[]; title: string;
}) {
  const headerColor = { dirty: 'bg-rose-50 border-rose-200', cleaning: 'bg-amber-50 border-amber-200', cleared: 'bg-emerald-50 border-emerald-200' }[tone];
  const titleColor = { dirty: 'text-rose-700', cleaning: 'text-amber-700', cleared: 'text-emerald-700' }[tone];
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${headerColor}`}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">{eyebrow}</p>
          <h3 className={`text-sm font-bold ${titleColor}`}>{title}</h3>
        </div>
        <span className="w-7 h-7 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center">{tasks.length}</span>
      </div>
      <div className="p-3 space-y-2.5 max-h-[28rem] overflow-y-auto scrollbar-none">
        {tasks.length === 0 ? (
          <p className="text-xs text-center text-slate-400 py-6">{emptyText}</p>
        ) : tasks.map((task) => (
          <div key={task.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-sm font-bold text-slate-900">{task.room.room_number}</span>
                <span className="text-xs text-slate-500 ml-1.5">{task.room.room_category.name}</span>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${priorityColor[task.priority] ?? 'bg-slate-100 text-slate-500'}`}>{task.priority}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">{task.property.name}</span>
              <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-400">{task.due_date ?? 'No due date'}</span>
            </div>
            {task.reservation_room ? (
              <p className="text-[11px] text-slate-400 font-mono">{task.reservation_room.external_reservation_id}</p>
            ) : <p className="text-[11px] text-slate-400">Manual task</p>}
            {task.notes && <p className="text-xs text-slate-500 bg-white border border-slate-100 rounded px-2 py-1">{task.notes}</p>}
            <div className="flex items-center gap-2">
              {task.status === 'DIRTY' && <button className={linkBtn + ' !text-xs !px-2.5 !py-1'} disabled={pendingTaskId === task.id} onClick={() => void onUpdate(task.id, 'CLEANING')} type="button">Start</button>}
              {(task.status === 'DIRTY' || task.status === 'CLEANING') && <button className={linkBtn + ' !text-xs !px-2.5 !py-1'} disabled={pendingTaskId === task.id} onClick={() => void onUpdate(task.id, 'CLEAN')} type="button">Mark clean</button>}
              {(task.status === 'CLEAN' || task.status === 'CLEANING') && <button className={secondaryBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={pendingTaskId === task.id} onClick={() => void onUpdate(task.id, 'INSPECTED')} type="button">Inspect</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDueDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function parseDateValue(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

function dateToInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function CalendarIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
