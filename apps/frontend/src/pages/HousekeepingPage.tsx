import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { HousekeepingPriority, HousekeepingStatus, HousekeepingTask, Property, Room, RoomCategory } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { ErrorMsg, LoadingMsg, SuccessMsg } from './ui';
import { createPreviewData, isPreviewId } from './previewData';

// ── Real statuses / priorities ─────────────────────────────────────────────
const STATUS_CFG: Record<HousekeepingStatus, { label: string; dot: string }> = {
  DIRTY:          { label: 'Dirty',          dot: 'bg-rose-400'    },
  CLEANING:       { label: 'Cleaning',        dot: 'bg-blue-400'    },
  CLEAN:          { label: 'Clean',           dot: 'bg-emerald-400' },
  INSPECTED:      { label: 'Inspected',       dot: 'bg-teal-500'    },
  OUT_OF_SERVICE: { label: 'Out of service',  dot: 'bg-slate-400'   },
};

const PRIORITY_CFG: Record<HousekeepingPriority, { label: string; badge: string }> = {
  LOW:    { label: 'Low',    badge: 'bg-slate-100 text-slate-500 border-slate-200'          },
  NORMAL: { label: 'Normal', badge: 'bg-blue-50 text-blue-600 border-blue-200'              },
  HIGH:   { label: 'High',   badge: 'bg-amber-50 text-amber-700 border-amber-200'           },
  URGENT: { label: 'Urgent', badge: 'bg-rose-100 text-rose-700 border-rose-300 font-black'  },
};
const priorityRank: Record<HousekeepingPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const priorityFilters = ['All priority', 'Urgent/High', 'Normal/Low'] as const;
type PriorityFilter = (typeof priorityFilters)[number];

type ColDef = {
  status: HousekeepingStatus;
  label: string;
  headerBg: string;
  cardBorder: string;
  nextStatus?: HousekeepingStatus;
  nextLabel?: string;
  nextBtnCls: string;
  emptyText: string;
};

const COLS: ColDef[] = [
  {
    status: 'DIRTY', label: 'Dirty',
    headerBg: 'bg-rose-500', cardBorder: 'border-rose-100',
    nextStatus: 'CLEANING', nextLabel: 'Start cleaning',
    nextBtnCls: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    emptyText: 'No dirty rooms.',
  },
  {
    status: 'CLEANING', label: 'Cleaning',
    headerBg: 'bg-blue-500', cardBorder: 'border-blue-100',
    nextStatus: 'CLEAN', nextLabel: 'Mark clean',
    nextBtnCls: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    emptyText: 'No rooms being cleaned.',
  },
  {
    status: 'CLEAN', label: 'Clean — Awaiting Inspection',
    headerBg: 'bg-emerald-500', cardBorder: 'border-emerald-100',
    nextStatus: 'INSPECTED', nextLabel: 'Approve ✓',
    nextBtnCls: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
    emptyText: 'No rooms awaiting inspection.',
  },
  {
    status: 'INSPECTED', label: 'Completed Today',
    headerBg: 'bg-teal-600', cardBorder: 'border-teal-100',
    nextBtnCls: '',
    emptyText: 'No completed rooms today.',
  },
];

const defaultForm = {
  property_id: '',
  room_id:     '',
  status:      'DIRTY'  as HousekeepingStatus,
  priority:    'NORMAL' as HousekeepingPriority,
  due_date:    '',
  notes:       '',
};

function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function HousekeepingPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const [reloadKey,    setReloadKey]    = useState(0);
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState(defaultForm);
  const [submitting,   setSubmitting]   = useState(false);
  const [pendingId,    setPendingId]    = useState<string | null>(null);
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [showOos,      setShowOos]      = useState(false);
  const [taskOverrides, setTaskOverrides] = useState<Record<string, Partial<HousekeepingTask>>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('All priority');
  const [dueTodayOnly, setDueTodayOnly] = useState(false);

  const tasksState      = useAsync(async () => fetchAllPages<HousekeepingTask>('/housekeeping'), [reloadKey]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const roomsState      = useAsync(async () => fetchAllPages<Room>('/rooms'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);

  useEffect(() => {
    setTaskOverrides({});
  }, [tasksState.data]);

  const previewData = previewDataEnabled ? createPreviewData() : null;
  const tasks      = (previewData?.housekeeping ?? tasksState.data ?? []).map(task => ({ ...task, ...taskOverrides[task.id] }));
  const properties = previewData?.properties ?? propertiesState.data ?? [];
  const rooms      = previewData?.rooms ?? roomsState.data ?? [];
  const categories = previewData?.categories ?? categoriesState.data ?? [];

  const today        = getLocalDate();
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    categories.forEach(category => names.add(category.name));
    tasks.forEach(task => names.add(task.room.room_category.name));
    return ['All categories', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [categories, tasks]);
  const filteredTasks = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return tasks
      .filter(t => categoryFilter === 'All categories' || t.room.room_category.name === categoryFilter)
      .filter(t => !dueTodayOnly || t.due_date === today || t.completed_at?.slice(0, 10) === today)
      .filter(t => {
        if (priorityFilter === 'Urgent/High') return t.priority === 'URGENT' || t.priority === 'HIGH';
        if (priorityFilter === 'Normal/Low') return t.priority === 'NORMAL' || t.priority === 'LOW';
        return true;
      })
      .filter(t => {
        if (!normalized) return true;
        return [
          t.room.room_number,
          t.room.room_category.name,
          t.property.name,
          t.notes ?? '',
          t.reservation_room?.external_reservation_id ?? '',
          t.reservation_room?.external_room_reservation_id ?? '',
        ].join(' ').toLowerCase().includes(normalized);
      })
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.room.room_number.localeCompare(b.room.room_number));
  }, [categoryFilter, dueTodayOnly, priorityFilter, searchQuery, tasks, today]);
  const activeTasks  = filteredTasks.filter(t => !t.completed_at);
  const completedTodayTasks = filteredTasks.filter(t => t.completed_at?.slice(0, 10) === today);
  const oosTasks     = activeTasks.filter(t => t.status === 'OUT_OF_SERVICE');
  const openCount    = activeTasks.filter(t => !['CLEAN','INSPECTED'].includes(t.status)).length;
  const readyCount   = activeTasks.filter(t => t.status === 'CLEAN').length + completedTodayTasks.length;
  const urgentCount  = activeTasks.filter(t => ['HIGH','URGENT'].includes(t.priority) && !['CLEAN','INSPECTED'].includes(t.status)).length;
  const overdueCount = activeTasks.filter(t => t.due_date && t.due_date < today && !['CLEAN','INSPECTED'].includes(t.status)).length;
  const total        = activeTasks.length + completedTodayTasks.length;
  const pct          = total > 0 ? Math.round(readyCount / total * 100) : 0;

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  function setF(key: keyof typeof defaultForm, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function submitTask(e: FormEvent) {
    e.preventDefault();
    if (!form.property_id || !form.room_id) return;
    setErrorMsg(null); setSubmitting(true);
    try {
      await api.post('/housekeeping', {
        property_id: form.property_id,
        room_id:     form.room_id,
        status:      form.status,
        priority:    form.priority,
        notes:       form.notes     || undefined,
        due_date:    form.due_date  || undefined,
      });
      setForm(defaultForm);
      setShowModal(false);
      setReloadKey(v => v + 1);
      flash('Task created and added to the board.');
    } catch (err) { setErrorMsg(getApiErrorMessage(err)); }
    finally { setSubmitting(false); }
  }

  async function updateTask(id: string, status: HousekeepingStatus) {
    if (isPreviewId(id)) {
      setErrorMsg('Sample preview records are read-only. Turn off sample data to update housekeeping tasks.');
      return;
    }
    setErrorMsg(null); setPendingId(id);
    const completedAt = status === 'INSPECTED' ? new Date().toISOString() : null;
    setTaskOverrides(current => ({
      ...current,
      [id]: {
        status,
        completed_at: completedAt,
      },
    }));
    try {
      await api.put(`/housekeeping/${id}`, { status });
      setReloadKey(v => v + 1);
    } catch (err) {
      setTaskOverrides(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setErrorMsg(getApiErrorMessage(err));
    }
    finally { setPendingId(null); }
  }

  const loading  =
    (!previewData && tasksState.loading && !tasksState.data) ||
    (propertiesState.loading && !propertiesState.data) ||
    (roomsState.loading && !roomsState.data) ||
    (categoriesState.loading && !categoriesState.data);
  const loadErr  = tasksState.error ?? propertiesState.error ?? roomsState.error ?? categoriesState.error;

  const filteredRooms = rooms.filter(r => !form.property_id || r.property_id === form.property_id);

  return (
    <div className="-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex flex-col min-h-0">

      {/* ── Page header ── */}
      <div className="px-5 lg:px-8 pt-6 lg:pt-8 pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Housekeeping</h1>
          <p className="text-[12px] text-slate-400 mt-1">Track cleaning, inspection, and room-readiness across all properties</p>
        </div>
        {/* <button type="button" onClick={() => setShowModal(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-[12.5px] font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <span className="text-[16px] leading-none">+</span> New task
        </button> */}
      </div>

      {/* ── Filters ── */}
      <div className="px-5 lg:px-8 pb-4">
        <div className="flex w-full flex-wrap items-center gap-2">
          <input
            className="h-10 w-full max-w-[320px] rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search room, category, reservation, note"
            value={searchQuery}
          />
          <div className="w-[190px] max-w-full">
            <CustomSelect
              onChange={setCategoryFilter}
              options={categoryOptions.map(option => ({ label: option, value: option }))}
              value={categoryFilter}
            />
          </div>
          <SegmentedControl
            options={priorityFilters}
            value={priorityFilter}
            onChange={value => setPriorityFilter(value as PriorityFilter)}
          />
          <button
            className={`h-10 rounded-lg border px-3 text-[12px] font-bold transition ${dueTodayOnly ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setDueTodayOnly(v => !v)}
            type="button"
          >
            Due today
          </button>
          <span className="ml-auto text-[11px] font-semibold text-slate-400">
            Showing {filteredTasks.length}/{tasks.length}
          </span>
          {(searchQuery || categoryFilter !== 'All categories' || priorityFilter !== 'All priority' || dueTodayOnly) && (
            <button
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-500 transition hover:bg-slate-50"
              onClick={() => { setSearchQuery(''); setCategoryFilter('All categories'); setPriorityFilter('All priority'); setDueTodayOnly(false); }}
              type="button"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className="px-5 lg:px-8 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Open tasks',     value: String(openCount),     sub: `${total} total task${total === 1 ? '' : 's'}`, color: openCount > 0 ? 'text-amber-600' : 'text-slate-500' },
          { label: 'Ready rooms',    value: String(readyCount),    sub: `${pct}% ready`, color: readyCount > 0 ? 'text-emerald-600' : 'text-slate-500' },
          { label: 'Urgent',         value: String(urgentCount),   sub: urgentCount > 0 ? 'Priority queue' : 'No urgent tasks', color: urgentCount > 0 ? 'text-rose-600' : 'text-slate-500' },
          { label: 'Overdue',        value: String(overdueCount),  sub: overdueCount > 0 ? 'Past due date' : 'On schedule', color: overdueCount > 0 ? 'text-rose-600' : 'text-slate-500' },
          { label: 'Out of service', value: String(oosTasks.length), sub: 'Unavailable rooms', color: oosTasks.length > 0 ? 'text-slate-700' : 'text-slate-400' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 hover:shadow-sm transition-shadow">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{s.label}</p>
            <p className={`text-[1.5rem] font-bold tracking-tight leading-none tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Progress */}
      {/* <div className="px-5 lg:px-8 pb-4">
        <div className="flex items-center gap-3 bg-white rounded-xl border border-black/[0.06] px-4 py-3">
          <div className="w-28 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12px] font-bold text-slate-700">{pct}% ready</span>
        </div>
      </div> */}

      {/* Messages */}
      {successMsg && <div className="mx-5 lg:mx-8 mt-3"><SuccessMsg>{successMsg}</SuccessMsg></div>}
      {errorMsg   && <div className="mx-5 lg:mx-8 mt-3"><ErrorMsg>{errorMsg}</ErrorMsg></div>}
      {loading    && <div className="mx-5 lg:mx-8 mt-3"><LoadingMsg>Loading housekeeping tasks…</LoadingMsg></div>}
      {loadErr    && <div className="mx-5 lg:mx-8 mt-3"><ErrorMsg>{loadErr}</ErrorMsg></div>}

      {/* ── Kanban board ── */}
      <div className="flex-1 min-h-0 px-5 lg:px-8 py-5 overflow-hidden">
        <div className="flex gap-3 h-full overflow-x-auto pb-2" style={{ minHeight: '520px' }}>

          {/* Pipeline columns */}
          {COLS.map(col => {
            const colTasks = col.status === 'INSPECTED'
              ? completedTodayTasks
              : activeTasks.filter(t => t.status === col.status);
            const scrollColumn = colTasks.length > 6;
            return (
              <div key={col.status} className="flex flex-col flex-1 min-w-[220px] max-w-[300px]">
                {/* Column header */}
                <div className={`${col.headerBg} rounded-t-2xl px-4 py-3 flex items-center justify-between flex-shrink-0`}>
                  <p className="text-[12px] font-bold text-white leading-tight">{col.label}</p>
                  <span className="text-[14px] font-black text-white/80 tabular-nums">{colTasks.length}</span>
                </div>
                {/* Cards */}
                <div className={`flex-1 min-h-0 bg-slate-100/70 rounded-b-2xl overflow-y-auto p-2 space-y-2 ${scrollColumn ? 'max-h-[520px]' : ''}`}>
                  {colTasks.length === 0 && (
                    <p className="py-8 text-center text-[11px] text-slate-400">{col.emptyText}</p>
                  )}
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task} col={col}
                      pending={pendingId === task.id}
                      onAdvance={col.nextStatus ? () => void updateTask(task.id, col.nextStatus!) : undefined} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Out-of-service collapsed column */}
          <div className="flex flex-col flex-1 min-w-[220px] max-w-[300px]">
            <button type="button" onClick={() => setShowOos(v => !v)}
              className="bg-slate-500 rounded-t-2xl px-4 py-3 flex items-center justify-between hover:bg-slate-600 transition-colors flex-shrink-0">
              <p className="text-[12px] font-bold text-white">Out of Service</p>
              <span className="text-[14px] font-black text-white/80">{oosTasks.length}</span>
            </button>
            <div className={`flex-1 bg-slate-100/70 rounded-b-2xl ${showOos ? `p-2 space-y-2 overflow-y-auto ${oosTasks.length > 6 ? 'max-h-[520px]' : ''}` : ''}`}>
              {!showOos ? (
                <button type="button" onClick={() => setShowOos(true)}
                  className="w-full h-12 text-[10.5px] text-slate-400 hover:text-slate-600 transition-colors">
                  {oosTasks.length} room{oosTasks.length !== 1 ? 's' : ''} — tap to view
                </button>
              ) : oosTasks.map(task => (
                <div key={task.id} className="bg-white rounded-xl border border-slate-200 px-3 py-3 shadow-sm space-y-2">
                  <div>
                    <p className="text-[13px] font-black text-slate-800">{task.room.room_number}</p>
                    <p className="text-[10px] text-slate-400">{task.room.room_category.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{task.property.name}</p>
                  </div>
                  {task.notes && <p className="text-[10.5px] text-slate-500 bg-slate-50 rounded px-2 py-1 border border-slate-100">{task.notes}</p>}
                  <button type="button" disabled={pendingId === task.id}
                    onClick={() => void updateTask(task.id, 'CLEANING')}
                    className="w-full h-7 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors">
                    {pendingId === task.id ? '…' : 'Move to cleaning'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── New task modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-[16px] font-bold text-slate-900">New housekeeping task</h3>
                <p className="text-[11.5px] text-slate-400 mt-0.5">Manually add a task to the board</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xl leading-none transition-colors">×</button>
            </div>

            <form onSubmit={submitTask}>
              <div className="px-6 py-5 space-y-5">

                {/* Property */}
                <div>
                  <ModalLabel>Property</ModalLabel>
                  <div className="space-y-1.5">
                    {properties.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { setF('property_id', p.id); setF('room_id', ''); }}
                        className={`w-full h-9 px-3 rounded-lg text-[12px] font-semibold text-left border transition-colors
                          ${form.property_id === p.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        {p.name}
                      </button>
                    ))}
                    {properties.length === 0 && propertiesState.loading && (
                      <p className="text-[11px] text-slate-400">Loading properties…</p>
                    )}
                  </div>
                </div>

                {/* Room */}
                <div>
                  <ModalLabel>Room</ModalLabel>
                  {!form.property_id ? (
                    <p className="text-[11.5px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">Select a property first</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                      {filteredRooms.map(r => (
                        <button key={r.id} type="button"
                          onClick={() => setF('room_id', r.id)}
                          className={`h-9 rounded-lg text-[11px] font-bold border transition-colors
                            ${form.room_id === r.id ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {r.room_number}
                        </button>
                      ))}
                      {filteredRooms.length === 0 && (
                        <p className="col-span-3 text-[11px] text-slate-400">No rooms found for this property.</p>
                      )}
                    </div>
                  )}
                  {form.room_id && (() => {
                    const r = rooms.find(r => r.id === form.room_id);
                    return r ? <p className="mt-1.5 text-[11px] text-slate-500">{r.room_number} — {r.room_category.name}</p> : null;
                  })()}
                </div>

                {/* Status + Priority row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <ModalLabel>Initial status</ModalLabel>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(['DIRTY','CLEANING','CLEAN','INSPECTED','OUT_OF_SERVICE'] as HousekeepingStatus[]).map(s => (
                        <button key={s} type="button" onClick={() => setF('status', s)}
                          className={`h-8 rounded-lg text-[10.5px] font-bold border transition-colors
                            ${form.status === s ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {STATUS_CFG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <ModalLabel>Priority</ModalLabel>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(['LOW','NORMAL','HIGH','URGENT'] as HousekeepingPriority[]).map(p => (
                        <button key={p} type="button" onClick={() => setF('priority', p)}
                          className={`h-8 rounded-lg text-[10.5px] font-bold border transition-colors
                            ${form.priority === p ? 'bg-slate-900 text-white border-slate-900' : `border-slate-200 text-slate-600 hover:bg-slate-50`}`}>
                          {PRIORITY_CFG[p].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Due date */}
                <div>
                  <ModalLabel>Due date (optional)</ModalLabel>
                  <input type="date" value={form.due_date}
                    onChange={e => setF('due_date', e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                </div>

                {/* Notes */}
                <div>
                  <ModalLabel>Notes (optional)</ModalLabel>
                  <textarea rows={3}
                    placeholder="e.g. VIP arrival at 3 pm, requires extra towels…"
                    value={form.notes} onChange={e => setF('notes', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-[12.5px] text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                </div>

                {errorMsg && <ErrorMsg>{errorMsg}</ErrorMsg>}
              </div>

              <div className="px-6 pb-6 flex items-center gap-3">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 h-11 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  disabled={submitting || !form.property_id || !form.room_id}
                  className="flex-1 h-11 rounded-xl text-[13px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {submitting ? 'Creating…' : 'Add to board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Task card ──────────────────────────────────────────────────────────────
function TaskCard({ task, col, pending, onAdvance }: {
  task: HousekeepingTask;
  col: ColDef;
  pending: boolean;
  onAdvance?: () => void;
}) {
  const pcfg = PRIORITY_CFG[task.priority];
  return (
    <div className={`bg-white rounded-xl border ${col.cardBorder} px-3.5 py-3 shadow-sm space-y-2`}>
      {/* Room + priority */}
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-[14px] font-black text-slate-900 leading-none">{task.room.room_number}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{task.room.room_category.name}</p>
        </div>
        {task.priority !== 'NORMAL' && (
          <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${pcfg.badge}`}>
            {pcfg.label}
          </span>
        )}
      </div>

      {/* Property */}
      <p className="text-[10.5px] text-slate-400 truncate">{task.property.name}</p>

      {/* Notes */}
      {task.notes && (
        <p className="text-[10.5px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100 leading-snug">{task.notes}</p>
      )}

      {/* Due date */}
      {task.due_date && (
        <p className="text-[10px] text-slate-400">
          Due: <span className={`font-semibold ${task.due_date < new Date().toISOString().slice(0,10) ? 'text-rose-600' : 'text-slate-700'}`}>{task.due_date}</span>
        </p>
      )}

      {/* Reservation link */}
      {task.reservation_room && (
        <p className="text-[9.5px] font-mono text-slate-300 truncate">{task.reservation_room.external_reservation_id}</p>
      )}

      {/* Advance button */}
      {onAdvance ? (
        <button type="button" disabled={pending} onClick={onAdvance}
          className={`w-full h-7 rounded-lg text-[10.5px] font-bold transition-colors border disabled:opacity-50 ${col.nextBtnCls}`}>
          {pending ? '…' : `${col.nextLabel} →`}
        </button>
      ) : (
        <div className="flex items-center justify-center h-7">
          <span className="text-[10px] font-bold text-teal-600">✓ Ready for guest</span>
        </div>
      )}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-10 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      {options.map(option => (
        <button
          className={`h-full rounded-md px-3 text-[12px] font-semibold transition ${value === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ModalLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{children}</p>;
}
