import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import type { DashboardSummary, DashboardStay } from '../api/types';
import { formatCurrency } from '../utils/format';
import { useWorkspaceState } from '../hooks/useWorkspaceState';
import { workspacePanel, type DashboardFocus } from '../components/WorkspaceUI';
import { InlineCalendarDatePicker } from '../components/CalendarDatePicker';
import { createPreviewData } from './previewData';

export type DashboardDestination = 'reports' | 'bookings' | 'payments' | 'housekeeping' | 'availability' | 'setup';
type ScheduleTab = 'arrivals' | 'departures' | 'upcoming_arrivals';
const panel = workspacePanel;
const button =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50';
const colors = ['#6366f1', '#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185'];
const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm leading-6 text-slate-500">{children}</div>;
}

export function DashboardPage({
  previewDataEnabled = false,
  activePropertyId = '',
  onNavigate,
  onOpenFolio,
}: {
  previewDataEnabled?: boolean;
  activePropertyId?: string;
  onNavigate?: (page: DashboardDestination, focus?: DashboardFocus) => void;
  onOpenFolio?: (groupId: string) => void;
}) {
  const scopeKey = `${previewDataEnabled ? 'sample' : 'live'}:${activePropertyId}`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [selectedDate, setSelectedDate] = useWorkspaceState(`${scopeKey}:date`, '');
  const requestedDate = selectedDate || today;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useWorkspaceState(`${scopeKey}:completed`, false);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useWorkspaceState<{ key: string; data: DashboardSummary } | null>('dashboard:data', null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useWorkspaceState<ScheduleTab>(`${scopeKey}:tab`, 'arrivals');
  const [page, setPage] = useWorkspaceState(`${scopeKey}:page`, 1);
  const scheduleRef = useRef<HTMLElement>(null);
  const data = state?.key === scopeKey ? state.data : null;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const load = previewDataEnabled
      ? Promise.resolve(createPreviewData(requestedDate).dashboard)
      : api
          .get<DashboardSummary>('/dashboard/summary', {
            params: { property_id: activePropertyId || undefined, date: requestedDate },
            signal: controller.signal,
          })
          .then((response) => response.data);
    load
      .then((summary) => {
        if (!controller.signal.aborted) setState({ key: scopeKey, data: summary });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scopeKey, requestedDate, refresh]);
  useEffect(() => {
    if (previewDataEnabled) return;
    const update = () => {
      if (document.visibilityState === 'visible') setRefresh((value) => value + 1);
    };
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [previewDataEnabled]);
  const date = data?.date ?? requestedDate;
  const isToday = date === today;
  const updating = loading || (!error && data?.date !== requestedDate);
  function chooseDate(value: string) {
    setSelectedDate(value === today ? '' : value);
    setPage(1);
    setCalendarOpen(false);
  }
  function moveDay(offset: number) {
    chooseDate(
      new Date(new Date(`${requestedDate}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10),
    );
  }
  const scopeName = data
    ? data.properties.length === 1
      ? data.properties[0].name
      : `${data.properties.length} properties`
    : 'Your property workspace';
  function selectTab(next: ScheduleTab, scroll = false) {
    setTab(next);
    setPage(1);
    if (scroll)
      window.requestAnimationFrame(() => {
        scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        scheduleRef.current?.focus({ preventScroll: true });
      });
  }
  const allSchedule = data?.[tab] ?? [];
  const completedCount = tab === 'upcoming_arrivals' ? 0 : allSchedule.filter((row) => row.pending_rooms === 0).length;
  const schedule = allSchedule
    .filter((row) => tab === 'upcoming_arrivals' || showCompleted || row.pending_rooms > 0)
    .sort((a, b) => b.pending_rooms - a.pending_rooms);
  const totalPages = Math.max(1, Math.ceil(schedule.length / 5));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = schedule.slice((currentPage - 1) * 5, currentPage * 5);
  const maxCollection = Math.max(1, ...(data?.collections_trend ?? []).map((point) => Math.abs(point.amount)));
  const monthGross = data?.revenue_by_ota.reduce((sum, row) => sum + row.collected, 0) ?? 0;
  const weekTotal = data?.collections_trend.reduce((sum, point) => sum + point.amount, 0) ?? 0;
  const attention: Array<{
    title: string;
    description: string;
    page: DashboardDestination;
    focus: DashboardFocus['kind'];
    tone: 'amber' | 'slate';
  }> = data
    ? [
        ...(data.unassigned_arrivals_today
          ? [
              {
                title: `${data.unassigned_arrivals_today} arriving ${data.unassigned_arrivals_today === 1 ? 'room needs' : 'rooms need'} assignment`,
                description: 'Assign rooms before guests check in.',
                page: 'bookings' as const,
                focus: 'unassigned_arrivals' as const,
                tone: 'amber' as const,
              },
            ]
          : []),
        ...(data.overdue_housekeeping_tasks
          ? [
              {
                title: `${data.overdue_housekeeping_tasks} overdue housekeeping ${data.overdue_housekeeping_tasks === 1 ? 'task' : 'tasks'}`,
                description: 'Review the rooms waiting to be prepared.',
                page: 'housekeeping' as const,
                focus: 'overdue_housekeeping' as const,
                tone: 'amber' as const,
              },
            ]
          : []),
        ...(data.pending_departures_today
          ? [
              {
                title: `${data.pending_departures_today} ${data.pending_departures_today === 1 ? 'room still needs' : 'rooms still need'} checkout`,
                description: `Review departures and folios for ${isToday ? 'today' : shortDate(date)}.`,
                page: 'bookings' as const,
                focus: 'pending_departures' as const,
                tone: 'slate' as const,
              },
            ]
          : []),
        ...(data.pending_balance_total > 0
          ? [
              {
                title: `${formatCurrency(data.pending_balance_total)} outstanding`,
                description: `${data.unpaid_invoice_count} open ${data.unpaid_invoice_count === 1 ? 'invoice' : 'invoices'} across visible stays.`,
                page: 'payments' as const,
                focus: 'outstanding_folios' as const,
                tone: 'slate' as const,
              },
            ]
          : []),
      ]
    : [];

  return (
    <section className="space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            {requestedDate === today ? 'Today at a glance' : 'Your day at a glance'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">Your front desk, room status, and collections in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onNavigate && (
            <button type="button" className={button} onClick={() => onNavigate('reports')}>
              View reports
              <ArrowUpRight size={14} />
            </button>
          )}
          <button
            type="button"
            className={`${button} !border-slate-800 !bg-slate-800 !text-white`}
            disabled={updating}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={14} className={updating ? 'animate-spin' : ''} />
            {updating && data ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Dashboard date"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setCalendarOpen(false);
        }}
      >
        <button type="button" className={button} aria-label="Previous day" onClick={() => moveDay(-1)}>
          <ChevronLeft size={16} />
        </button>
        <InlineCalendarDatePicker
          label="Dashboard date"
          value={requestedDate}
          open={calendarOpen}
          setOpen={setCalendarOpen}
          onChange={chooseDate}
          buttonClassName={button}
          panelClassName="-translate-x-12 max-w-[calc(100vw-3rem)] sm:translate-x-0"
          renderTrigger={() => (
            <>
              <CalendarDays size={16} />
              <span>
                {new Date(`${requestedDate}T00:00:00Z`).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </>
          )}
        />
        <button type="button" className={button} aria-label="Next day" onClick={() => moveDay(1)}>
          <ChevronRight size={16} />
        </button>
        <button type="button" className={button} disabled={requestedDate === today} onClick={() => chooseDate(today)}>
          Today
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <CalendarDays size={14} />
            {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            })}
          </span>
          <span>{scopeName}</span>
          <span>IST · Asia/Kolkata</span>
        </div>
        <span role="status" className="inline-flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-amber-500' : previewDataEnabled ? 'bg-indigo-500' : 'bg-emerald-500'}`}
          />
          {updating && data
            ? `Updating · showing ${shortDate(date)}`
            : data
              ? `${error ? 'Last successful update' : previewDataEnabled ? 'Sample data' : 'Updated'} · ${new Date(data.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : loading
                ? 'Loading dashboard…'
                : 'Unavailable'}
        </span>
      </div>
      {requestedDate !== today && (
        <p className="text-xs leading-5 text-slate-500">
          Arrivals, departures and collections follow the selected date. Room status, housekeeping and outstanding
          balances are current; reservation progress shows its latest status.
        </p>
      )}
      {previewDataEnabled && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-800">
          Sample workspace: Harbour Grand Demo. These figures illustrate the dashboard and are separate from your
          selected property.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">
            {data
              ? 'Could not refresh. The figures below are from the last successful update.'
              : 'Could not load the dashboard.'}
          </p>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {!data && loading && (
        <div
          className="workspace-skeleton grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-busy="true"
          aria-label="Loading dashboard"
        >
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={`${panel} h-40 p-4`}>
              <div className="h-3 w-28 rounded animate-shimmer" />
              <div className="mt-6 h-8 w-20 rounded animate-shimmer" />
              <div className="mt-5 h-3 w-40 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      )}
      {data && (
        <fieldset
          disabled={updating || Boolean(error)}
          aria-busy={updating}
          className="workspace-results min-w-0 space-y-5"
        >
          {data.total_rooms === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
              <span>Add your rooms to start tracking occupancy and room status.</span>
              {onNavigate && (
                <button type="button" className={button} onClick={() => onNavigate('setup')}>
                  Open property setup
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => selectTab('arrivals', true)}
              className={`${panel} p-4 text-left transition-colors hover:border-indigo-300`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Arrivals {isToday ? 'today' : shortDate(date)}
                </span>
                <LogIn size={18} className="text-indigo-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <strong className="text-2xl font-bold tracking-tight text-slate-900">
                  {data.reservation_room_arrivals_today}
                </strong>
                <span className="text-xs text-slate-400">room check-ins</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${data.pending_arrivals_today ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}
                >
                  {data.pending_arrivals_today} remaining
                </span>
                <span className="text-xs text-slate-500">
                  {data.reservation_room_arrivals_today - data.pending_arrivals_today} checked in
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => selectTab('departures', true)}
              className={`${panel} p-4 text-left transition-colors hover:border-indigo-300`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Departures {isToday ? 'today' : shortDate(date)}
                </span>
                <LogOut size={18} className="text-sky-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <strong className="text-2xl font-bold tracking-tight text-slate-900">
                  {data.reservation_room_departures_today}
                </strong>
                <span className="text-xs text-slate-400">room checkouts</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${data.pending_departures_today ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}
                >
                  {data.pending_departures_today} remaining
                </span>
                <span className="text-xs text-slate-500">
                  {data.reservation_room_departures_today - data.pending_departures_today} checked out
                </span>
              </div>
            </button>
            <div className={`${panel} p-4`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Current occupancy</span>
                <BedDouble size={18} className="text-emerald-500" />
              </div>
              <strong className="mt-3 block text-2xl font-bold tracking-tight text-slate-900">
                {data.total_rooms ? `${data.occupancy_rate.toFixed(1)}%` : '—'}
              </strong>
              <p className="mt-4 text-xs leading-6 text-slate-500">
                {data.occupied_rooms} occupied of {data.total_rooms} configured rooms
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('payments')}
              disabled={!onNavigate}
              className={`${panel} p-4 text-left transition-colors enabled:hover:border-indigo-300`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Net collected {isToday ? 'today' : shortDate(date)}
                </span>
                <CreditCard size={18} className="text-violet-500" />
              </div>
              <strong className="mt-3 block text-2xl font-bold tracking-tight text-slate-900">
                {formatCurrency(data.revenue_today)}
              </strong>
              <p className="mt-4 flex items-center gap-1 text-xs leading-6 text-slate-500">
                {data.revenue_today === data.revenue_yesterday ? (
                  isToday ? (
                    'Same as yesterday'
                  ) : (
                    'Same as the previous day'
                  )
                ) : (
                  <>
                    {data.revenue_today > data.revenue_yesterday ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownLeft size={13} />
                    )}
                    {formatCurrency(Math.abs(data.revenue_today - data.revenue_yesterday))}{' '}
                    {data.revenue_today > data.revenue_yesterday ? 'more' : 'less'} than{' '}
                    {isToday ? 'yesterday' : 'the previous day'}
                  </>
                )}
              </p>
            </button>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
            {/* Independent desktop columns; mobile keeps the schedule and attention cards first. */}
            <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
              <section
                ref={scheduleRef}
                tabIndex={-1}
                aria-label="Guest schedule"
                className={`${panel} order-1 xl:order-none min-w-0 scroll-mt-4 overflow-hidden outline-none`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Guest schedule</h2>
                    <p className="mt-1 text-xs text-slate-500">Plan arrivals, room assignments, and departures.</p>
                  </div>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('bookings')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Reservations
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
                <div
                  className="flex flex-wrap gap-1 border-b border-slate-100 px-5 pb-3"
                  role="group"
                  aria-label="Schedule view"
                >
                  {(
                    [
                      { id: 'arrivals', label: 'Arrivals' },
                      { id: 'departures', label: 'Departures' },
                      { id: 'upcoming_arrivals', label: 'Next 6 days' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={tab === item.id}
                      onClick={() => selectTab(item.id)}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === item.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {item.label}
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${tab === item.id ? 'bg-white/15' : 'bg-slate-100'}`}
                      >
                        {data[item.id].length}
                      </span>
                    </button>
                  ))}
                </div>
                {completedCount > 0 && (
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                    <span>
                      {allSchedule.length - completedCount} pending · {completedCount} completed
                    </span>
                    <button
                      type="button"
                      aria-pressed={showCompleted}
                      onClick={() => {
                        setShowCompleted((value) => !value);
                        setPage(1);
                      }}
                      className="font-semibold text-indigo-600 hover:underline"
                    >
                      {showCompleted ? 'Hide completed' : `Show completed (${completedCount})`}
                    </button>
                  </div>
                )}
                {visibleRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          {['Guest', 'Stay', 'Rooms', 'Progress', ''].map((title, index) => (
                            <th key={index} scope="col" className="px-5 py-3 font-semibold">
                              {title || <span className="sr-only">Actions</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleRows.map((row) => (
                          <ScheduleRow
                            key={`${row.id}:${row.arrival}:${row.departure}`}
                            row={row}
                            tab={tab}
                            onOpenFolio={onOpenFolio}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-5 text-sm text-slate-500">
                    <CalendarDays size={22} className="shrink-0 text-slate-300" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700">
                        {completedCount > 0 && !showCompleted
                          ? tab === 'arrivals'
                            ? 'All arrivals checked in'
                            : 'All departures checked out'
                          : tab === 'arrivals'
                            ? `No arrivals scheduled for ${isToday ? 'today' : shortDate(date)}`
                            : tab === 'departures'
                              ? `No departures scheduled for ${isToday ? 'today' : shortDate(date)}`
                              : 'No arrivals in the next six days'}
                      </p>
                      <p className="mt-1 text-xs">
                        {tab === 'arrivals'
                          ? 'Check the next six days to prepare for upcoming guests.'
                          : 'New bookings and status updates will appear here.'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                  <span>
                    {data.reservation_groups_today} bookings created {isToday ? 'today' : `on ${shortDate(date)}`} ·{' '}
                    {data.active_reservation_groups} active groups
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={button}
                        disabled={currentPage === 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className={button}
                        disabled={currentPage === totalPages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <section className={`${panel} order-3 xl:order-none min-w-0 p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      {isToday ? 'Collections over the last 7 days' : `Collections · 7 days ending ${shortDate(date)}`}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">Payments received, less refunds · payment date in IST</p>
                  </div>
                  <div className="text-right">
                    <strong className="block text-xl font-bold text-slate-900">{formatCurrency(weekTotal)}</strong>
                    <span className="text-xs text-slate-500">7-day net total</span>
                  </div>
                </div>
                {data.collections_trend.some((point) => point.amount !== 0) ? (
                  <div className="mt-6">
                    <div className="mb-2 flex justify-between text-[10px] text-slate-400">
                      <span>Net collections</span>
                      <span>Largest daily amount: {formatCurrency(maxCollection)}</span>
                    </div>
                    <div className="flex h-28 items-end gap-3 border-b border-slate-100 pb-2">
                      {data.collections_trend.map((point) => (
                        <div key={point.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                          <div
                            tabIndex={0}
                            role="img"
                            aria-label={`${shortDate(point.date)}: ${formatCurrency(point.amount)}`}
                            title={`${shortDate(point.date)}: ${formatCurrency(point.amount)}`}
                            className={`w-full rounded-t-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${point.amount < 0 ? 'bg-rose-400' : point.date === data.date ? 'bg-indigo-600' : 'bg-indigo-300'}`}
                            style={{
                              height: Math.max(point.amount === 0 ? 0 : 3, (Math.abs(point.amount) / maxCollection) * 78),
                            }}
                          />
                          <span className="whitespace-nowrap text-center text-[10px] text-slate-500">
                            {shortDate(point.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Refunds exceeding collections appear in rose.</p>
                  </div>
                ) : (
                  <Empty>No payments or refunds in this seven-day period.</Empty>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                  {[
                    { label: `Received ${isToday ? 'today' : shortDate(date)}`, amount: data.collected_today },
                    { label: `Refunded ${isToday ? 'today' : shortDate(date)}`, amount: data.refunded_today },
                    { label: `Month to ${isToday ? 'date' : shortDate(date)} · net`, amount: data.revenue_month_to_date },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs leading-5 text-slate-500">{item.label}</p>
                      <p className="mt-1 break-words text-sm font-bold text-slate-800">{formatCurrency(item.amount)}</p>
                    </div>
                  ))}
                </div>
                <details className="mt-4 text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium">View daily amounts</summary>
                  <dl className="mt-3 space-y-2">
                    {data.collections_trend.map((point) => (
                      <div key={point.date} className="flex justify-between">
                        <dt>{shortDate(point.date)}</dt>
                        <dd>{formatCurrency(point.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </section>
              <section className={`${panel} order-5 xl:order-none min-w-0 overflow-hidden`}>
                <div className="p-4">
                  <h2 className="text-sm font-bold text-slate-900">Collections by booking source</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Month to {isToday ? 'date' : shortDate(date)} · includes direct and OTA bookings · bar shows share of
                    gross collections
                  </p>
                </div>
                {data.revenue_by_ota.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          {['Source', 'Collected', 'Refunded', 'Net'].map((label) => (
                            <th key={label} scope="col" className="px-5 py-3 font-semibold">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.revenue_by_ota.map((row, index) => (
                          <tr key={row.label}>
                            <td className="min-w-36 px-5 py-3.5">
                              <span className="text-xs font-semibold text-slate-700">{row.label}</span>
                              <div className="mt-2 h-1.5 max-w-36 rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${monthGross ? (row.collected / monthGross) * 100 : 0}%`,
                                    background: colors[index % colors.length],
                                  }}
                                />
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-600">
                              {formatCurrency(row.collected)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-600">
                              {formatCurrency(row.refunded)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-800">
                              {formatCurrency(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>No collections or refunds for this month through {shortDate(date)}.</Empty>
                )}
              </section>
            </div>
            <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
              <aside className={`${panel} order-2 xl:order-none p-4`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Needs attention</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {attention.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Items to review in your property workspace.</p>
                {attention.length ? (
                  <div className="mt-4 divide-y divide-slate-100">
                    {attention.map((item) => (
                      <button
                        type="button"
                        key={item.title}
                        disabled={!onNavigate}
                        onClick={() =>
                          onNavigate?.(item.page, {
                            kind: item.focus,
                            propertyId: previewDataEnabled ? '' : activePropertyId,
                            date: item.focus === 'overdue_housekeeping' ? today : date,
                          })
                        }
                        className="flex w-full items-start gap-3 py-3 text-left enabled:hover:opacity-75"
                      >
                        <span
                          className={`mt-0.5 rounded-lg p-1.5 ${item.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}
                        >
                          <Clock3 size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs font-semibold leading-5 text-slate-800">{item.title}</strong>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
                        </span>
                        <ChevronRight size={14} className="mt-1 shrink-0 text-slate-400" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                    <Check size={18} className="mb-2 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-800">Nothing in this watch list</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700">
                      No unassigned arrivals, overdue housekeeping, pending departures, or outstanding invoices.
                    </p>
                  </div>
                )}
              </aside>
              <section className={`${panel} order-4 xl:order-none p-4`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Room status</h2>
                  <BedDouble size={18} className="text-slate-400" />
                </div>
                <p className="mt-1 text-xs text-slate-500">Physical room status right now</p>
                <div
                  className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`${data.occupied_rooms} occupied, ${data.available_rooms} unoccupied, ${data.out_of_service_rooms} out of service`}
                >
                  {[
                    { value: data.occupied_rooms, color: 'bg-indigo-500' },
                    { value: data.available_rooms, color: 'bg-emerald-400' },
                    { value: data.out_of_service_rooms, color: 'bg-amber-400' },
                  ].map((item) => (
                    <span
                      key={item.color}
                      className={item.color}
                      style={{ width: `${data.total_rooms ? (item.value / data.total_rooms) * 100 : 0}%` }}
                    />
                  ))}
                </div>
                <dl className="mt-5 space-y-3">
                  {[
                    { label: 'Occupied', value: data.occupied_rooms, color: 'bg-indigo-500' },
                    { label: 'Unoccupied', value: data.available_rooms, color: 'bg-emerald-400' },
                    { label: 'Out of service', value: data.out_of_service_rooms, color: 'bg-amber-400' },
                  ].map((item) => (
                    <div className="flex items-center gap-2 text-sm" key={item.label}>
                      <span className={`h-2 w-2 rounded-full ${item.color}`} />
                      <dt className="text-slate-600">{item.label}</dt>
                      <dd className="ml-auto font-bold text-slate-800">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-xs leading-5 text-slate-500">
                  Unoccupied rooms may still need cleaning or be reserved. Check Availability for rooms you can sell.
                </p>
                {onNavigate && (
                  <button type="button" className={`${button} mt-4 w-full`} onClick={() => onNavigate('availability')}>
                    Open availability
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </section>
              <section className={`${panel} order-6 xl:order-none p-4`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Housekeeping</h2>
                  <Sparkles size={18} className="text-slate-400" />
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <strong className="text-2xl font-bold text-slate-900">{data.open_housekeeping_tasks}</strong>
                  <span className="text-xs text-slate-500">open tasks</span>
                </div>
                <dl className="mt-4 space-y-3">
                  {data.housekeeping_by_status.map((row) => (
                    <div key={row.status} className="flex justify-between text-xs">
                      <dt className="text-slate-500">
                        {row.status === 'DIRTY'
                          ? 'Waiting for cleaning'
                          : row.status === 'CLEANING'
                            ? 'Cleaning in progress'
                            : 'Out of service'}
                      </dt>
                      <dd className="font-semibold text-slate-800">{row.count}</dd>
                    </div>
                  ))}
                </dl>
                {data.overdue_housekeeping_tasks > 0 && (
                  <p className="mt-4 rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
                    {data.overdue_housekeeping_tasks} tasks past their due date
                  </p>
                )}
                {onNavigate && (
                  <button type="button" className={`${button} mt-5 w-full`} onClick={() => onNavigate('housekeeping')}>
                    Open housekeeping
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </section>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-400">
            {previewDataEnabled
              ? 'Demo figures are illustrative.'
              : 'Refreshes every minute while this page is visible.'}{' '}
            Collections use payment and refund dates in IST. Outstanding balances reflect current unpaid amounts,
            excluding OTA metadata charges.
          </p>
        </fieldset>
      )}
    </section>
  );
}

function ScheduleRow({
  row,
  tab,
  onOpenFolio,
}: {
  row: DashboardStay;
  tab: ScheduleTab;
  onOpenFolio?: (id: string) => void;
}) {
  const pending = row.pending_rooms > 0;
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-5 py-4">
        <p className="whitespace-nowrap text-xs font-semibold text-slate-800">{row.guest_name}</p>
        <p className="mt-1 text-[11px] text-slate-400">{row.reference}</p>
        <p className="mt-1 text-[11px] text-slate-500">{row.property_name}</p>
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-600">
        {shortDate(row.arrival)} → {shortDate(row.departure)}
      </td>
      <td className="px-5 py-4">
        <p className="text-xs font-medium text-slate-700">
          {row.room_count} {row.room_count === 1 ? 'room' : 'rooms'}
        </p>
        <p className="mt-1 max-w-36 text-[11px] leading-5 text-slate-400">{row.room_labels}</p>
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
        >
          {tab === 'upcoming_arrivals'
            ? 'Upcoming'
            : pending
              ? `${row.pending_rooms} ${tab === 'arrivals' ? 'to check in' : 'to check out'}`
              : tab === 'arrivals'
                ? 'Checked in'
                : 'Checked out'}
        </span>
        {row.unassigned_rooms > 0 && tab !== 'departures' && (
          <p className="mt-1.5 text-[11px] text-amber-700">{row.unassigned_rooms} unassigned</p>
        )}
      </td>
      <td className="px-5 py-4">
        {onOpenFolio && (
          <button
            type="button"
            onClick={() => onOpenFolio(row.id)}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-indigo-600 hover:underline"
          >
            Folio
            <ChevronRight size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
