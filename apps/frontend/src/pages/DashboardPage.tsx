import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Check,
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
import { groupDashboardCollections } from '../utils/dashboard-collections';
import { useWorkspaceState } from '../hooks/useWorkspaceState';
import { useSavedFilters } from '../hooks/useSavedFilters';
import { useReportingToday } from '../hooks/useReportingToday';
import { isReportingSelection, reportingRange } from '../utils/reporting-period';
import { workspacePanel, type DashboardFocus } from '../components/WorkspaceUI';
import { CalendarDatePickerField } from '../components/CalendarDatePicker';
import { createPreviewData } from './previewData';
import type { ReportSelection } from './ReportsPage';

export type DashboardDestination = 'reports' | 'bookings' | 'payments' | 'housekeeping' | 'availability' | 'setup';
type DashboardPreset = 'today' | 'last_7' | 'this_month' | 'custom';
type DashboardSelection = { preset: DashboardPreset; range: { from: string; to: string } };
const presets: Array<{ value: DashboardPreset; label: string }> = [
  { value: 'today', label: 'Today' }, { value: 'last_7', label: 'Last 7 days' },
  { value: 'this_month', label: 'This month' }, { value: 'custom', label: 'Custom range' },
];
function addDays(value: string, count: number) {
  return new Date(new Date(`${value}T00:00:00Z`).getTime() + count * 86400000).toISOString().slice(0, 10);
}
const presetRange = reportingRange;
const isDashboardSelection = (value: unknown): value is DashboardSelection => isReportingSelection(value)
  && ['today', 'last_7', 'this_month', 'custom'].includes(value.preset);
type ScheduleTab = 'arrivals' | 'departures' | 'upcoming_arrivals';
const panel = workspacePanel;
const button =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50';
const colors = ['#6366f1', '#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185'];
const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const chartAmount = (amount: number) => {
  const absolute = Math.abs(amount);
  const divisor = absolute >= 10000000 ? 10000000 : absolute >= 100000 ? 100000 : absolute >= 1000 ? 1000 : 1;
  const suffix = divisor === 10000000 ? 'Cr' : divisor === 100000 ? 'L' : divisor === 1000 ? 'k' : '';
  return `${amount < 0 ? '−' : ''}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: divisor === 1 ? 2 : 1 }).format(absolute / divisor)}${suffix}`;
};
function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm leading-6 text-slate-500">{children}</div>;
}

export function DashboardPage({
  previewDataEnabled = false,
  activePropertyId = '',
  onNavigate,
  onOpenFolio,
  onOpenReports,
}: {
  previewDataEnabled?: boolean;
  activePropertyId?: string;
  onNavigate?: (page: DashboardDestination, focus?: DashboardFocus) => void;
  onOpenFolio?: (groupId: string) => void;
  onOpenReports?: (selection: ReportSelection) => void;
}) {
  const scopeKey = `${previewDataEnabled ? 'sample' : 'live'}:${activePropertyId}`;
  const today = useReportingToday();
  const [selection, setSelection] = useSavedFilters<DashboardSelection>(`dashboard:${scopeKey}:period`, () => ({ preset: 'today', range: { from: today, to: today } }), isDashboardSelection);
  const range = selection.preset === 'custom' ? selection.range : presetRange(selection.preset, today);
  const [customOpen, setCustomOpen] = useState(selection.preset === 'custom');
  const [draft, setDraft] = useState(range);
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null);
  const draftDays = (new Date(`${draft.to}T00:00:00Z`).getTime() - new Date(`${draft.from}T00:00:00Z`).getTime()) / 86400000 + 1;
  const validDraft = Boolean(draft.from && draft.to && Number.isInteger(draftDays) && draftDays >= 1 && draftDays <= 366);
  const [showCompleted, setShowCompleted] = useSavedFilters(`dashboard:${scopeKey}:completed`, () => false, (value): value is boolean => typeof value === 'boolean');
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useWorkspaceState<{ key: string; data: DashboardSummary } | null>('dashboard:data', null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useSavedFilters<ScheduleTab>(`dashboard:${scopeKey}:tab`, () => 'arrivals', (value): value is ScheduleTab => typeof value === 'string' && ['arrivals', 'departures', 'upcoming_arrivals'].includes(value));
  const [page, setPage] = useWorkspaceState(`${scopeKey}:page`, 1);
  const scheduleRef = useRef<HTMLElement>(null);
  const data = state?.key === scopeKey ? state.data : null;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const load = previewDataEnabled
      ? Promise.resolve(createPreviewData(range.to, range.from).dashboard)
      : api
          .get<DashboardSummary>('/dashboard/summary', {
            params: { property_id: activePropertyId || undefined, from: range.from, to: range.to },
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
  }, [scopeKey, range.from, range.to, refresh]);
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
  const period = data?.period;
  const shownRange = period ? { from: period.from, to: period.to } : range;
  const isSingleDay = shownRange.from === shownRange.to;
  const isToday = isSingleDay && shownRange.to === today;
  const periodLabel = isToday ? 'today' : isSingleDay ? shortDate(shownRange.to) : `${shortDate(shownRange.from)} – ${shortDate(shownRange.to)}`;
  const updating = loading || (!error && (period?.from !== range.from || period?.to !== range.to));
  function applyPreset(preset: DashboardPreset) {
    setOpenPicker(null);
    setCustomOpen(preset === 'custom');
    if (preset === 'custom') { setDraft(range); return; }
    setSelection({ preset, range: presetRange(preset, today) });
    setShowCompleted(preset !== 'today');
    setPage(1);
  }
  useEffect(() => {
    setCustomOpen(selection.preset === 'custom');
    setDraft(selection.preset === 'custom' ? selection.range : presetRange(selection.preset, today));
    setOpenPicker(null);
  }, [scopeKey]);
  const schedules = { arrivals: period?.arrivals ?? [], departures: period?.departures ?? [], upcoming_arrivals: data?.current?.upcoming_arrivals ?? [] };
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
  const allSchedule = schedules[tab];
  const completedCount = tab === 'upcoming_arrivals' ? 0 : allSchedule.filter((row) => row.pending_rooms === 0).length;
  const schedule = allSchedule
    .filter((row) => tab === 'upcoming_arrivals' || showCompleted || row.pending_rooms > 0)
    .sort((a, b) => b.pending_rooms - a.pending_rooms);
  const totalPages = Math.max(1, Math.ceil(schedule.length / 5));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = schedule.slice((currentPage - 1) * 5, currentPage * 5);
  const collectionChart = groupDashboardCollections(period?.collections_trend ?? []);
  const maxCollection = Math.max(1, ...collectionChart.buckets.map((point) => Math.abs(point.amount)));
  const periodGross = period?.revenue_by_source.reduce((sum, row) => sum + row.collected, 0) ?? 0;
  const periodTotal = period?.collections_trend.reduce((sum, point) => sum + point.amount, 0) ?? 0;
  const attention: Array<{
    title: string;
    description: string;
    page: DashboardDestination;
    focus: DashboardFocus['kind'];
    tone: 'amber' | 'slate';
  }> = data
    ? [
        ...((data.current?.unassigned_arrivals ?? 0)
          ? [
              {
                title: `${(data.current?.unassigned_arrivals ?? 0)} arriving ${(data.current?.unassigned_arrivals ?? 0) === 1 ? 'room needs' : 'rooms need'} assignment`,
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
        ...((data.current?.pending_departures ?? 0)
          ? [
              {
                title: `${(data.current?.pending_departures ?? 0)} ${(data.current?.pending_departures ?? 0) === 1 ? 'room still needs' : 'rooms still need'} checkout`,
                description: 'Review departures and folios for today.',
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
            {range.from === today && range.to === today ? 'Today at a glance' : 'Your period at a glance'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">Your front desk, room status, and collections in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(onOpenReports || onNavigate) && (
            <button type="button" className={button} disabled={updating || Boolean(error)} onClick={() => onOpenReports ? onOpenReports({ preset: selection.preset, range }) : onNavigate?.('reports')}>
              View detailed report
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
      <section aria-label="Dashboard date range" className={`${panel} p-4`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500">Reporting period</p>
          <button type="button" className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-indigo-500" onClick={() => {
            applyPreset('today'); setDraft(presetRange('today', today)); setTab('arrivals'); setShowCompleted(false);
          }}>Reset filters</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map(preset => <button key={preset.value} type="button" aria-pressed={customOpen ? preset.value === 'custom' : selection.preset === preset.value}
            onClick={() => applyPreset(preset.value)}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${(customOpen ? preset.value === 'custom' : selection.preset === preset.value) ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
            {preset.label}
          </button>)}
        </div>
        {customOpen && <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          {(['from', 'to'] as const).map(field => <div key={field} className="w-40">
            <CalendarDatePickerField label={field === 'from' ? 'From' : 'To (inclusive)'} value={draft[field]}
              onChange={value => setDraft(current => ({ ...current, [field]: value }))}
              open={openPicker === field} setOpen={open => setOpenPicker(open ? field : null)} />
          </div>)}
          <button type="button" className={button} disabled={!validDraft} onClick={() => {
            setSelection({ preset: 'custom', range: { ...draft } });
            setOpenPicker(null); setPage(1); setShowCompleted(true);
          }}>Apply dates</button>
          {!validDraft && <p role="alert" className="text-xs text-rose-600">Choose an end date on or after the start, within 366 days.</p>}
        </div>}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <CalendarDays size={14} />
            {isSingleDay ? `${shortDate(shownRange.to)}, ${shownRange.to.slice(0, 4)}` : `${shortDate(shownRange.from)}, ${shownRange.from.slice(0, 4)} – ${shortDate(shownRange.to)}, ${shownRange.to.slice(0, 4)}`}
          </span>
          <span>{scopeName}</span>
          <span>IST · Asia/Kolkata</span>
        </div>
        <span role="status" className="inline-flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-amber-500' : previewDataEnabled ? 'bg-indigo-500' : 'bg-emerald-500'}`}
          />
          {updating && data
            ? `Updating · showing ${periodLabel}`
            : data
              ? `${error ? 'Last successful update' : previewDataEnabled ? 'Sample data' : 'Updated'} · ${new Date(data.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : loading
                ? 'Loading dashboard…'
                : 'Unavailable'}
        </span>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Arrivals, departures, bookings, and collections follow this period. Current room status, housekeeping,
        outstanding balances, and urgent tasks reflect now. Reservation progress shows its latest status.
      </p>
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
          className="workspace-skeleton grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
          aria-busy="true"
          aria-label="Loading dashboard"
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className={`${panel} h-40 p-4`}>
              <div className="h-3 w-28 rounded animate-shimmer" />
              <div className="mt-6 h-8 w-20 rounded animate-shimmer" />
              <div className="mt-5 h-3 w-40 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      )}
      {data && period && (
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <button
              type="button"
              onClick={() => selectTab('arrivals', true)}
              className={`${panel} p-4 text-left transition-colors hover:border-indigo-300`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Arrivals {periodLabel}
                </span>
                <LogIn size={18} className="text-indigo-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <strong className="text-2xl font-bold tracking-tight text-slate-900">
                  {period.arrivals_count}
                </strong>
                <span className="text-xs text-slate-400">room check-ins</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${period.pending_arrivals ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}
                >
                  {period.pending_arrivals} remaining
                </span>
                <span className="text-xs text-slate-500">
                  {period.arrivals_count - period.pending_arrivals} checked in
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
                  Departures {periodLabel}
                </span>
                <LogOut size={18} className="text-sky-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <strong className="text-2xl font-bold tracking-tight text-slate-900">
                  {period.departures_count}
                </strong>
                <span className="text-xs text-slate-400">room checkouts</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${period.pending_departures ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}
                >
                  {period.pending_departures} remaining
                </span>
                <span className="text-xs text-slate-500">
                  {period.departures_count - period.pending_departures} checked out
                </span>
              </div>
            </button>
            <div className={`${panel} p-4`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Bookings created</span>
                <CalendarDays size={18} className="text-indigo-500" />
              </div>
              <strong className="mt-3 block text-2xl font-bold text-slate-900">{period.bookings_created}</strong>
              <p className="mt-4 text-xs leading-6 text-slate-500">Created {periodLabel} · all booking sources</p>
            </div>
            <div className={`${panel} p-4`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Current occupancy</span>
                <BedDouble size={18} className="text-emerald-500" />
              </div>
              <strong className="mt-3 block text-2xl font-bold tracking-tight text-slate-900">
                {data.total_rooms ? `${data.occupancy_rate.toFixed(1)}%` : '—'}
              </strong>
              <p className="mt-4 text-xs leading-6 text-slate-500">
                {data.occupied_rooms} occupied of {data.total_rooms} configured rooms · now
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
                  Net collected {periodLabel}
                </span>
                <CreditCard size={18} className="text-violet-500" />
              </div>
              <strong className="mt-3 block text-2xl font-bold tracking-tight text-slate-900">
                {formatCurrency(period.net_collected)}
              </strong>
              <p className="mt-4 flex items-center gap-1 text-xs leading-6 text-slate-500">
                {period.net_collected === period.previous_net_collected ? (
                  isSingleDay ? 'Same as the previous day' : 'Same as the previous period'
                ) : (
                  <>
                    {period.net_collected > period.previous_net_collected ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownLeft size={13} />
                    )}
                    {formatCurrency(Math.abs(period.net_collected - period.previous_net_collected))}{' '}
                    {period.net_collected > period.previous_net_collected ? 'more' : 'less'} than{' '}
                    {isSingleDay ? 'the previous day' : `the previous ${period.days} days`}
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
                      { id: 'upcoming_arrivals', label: 'Next 6 days · Current' },
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
                        {schedules[item.id].length}
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
                            ? `No arrivals scheduled for ${periodLabel}`
                            : tab === 'departures'
                              ? `No departures scheduled for ${periodLabel}`
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
                    {period.bookings_created} bookings created {isToday ? 'today' : `during ${periodLabel}`} ·{' '}
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
                      Collections · {periodLabel}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">Payments received, less refunds · payment date in IST</p>
                  </div>
                  <div className="text-right">
                    <strong className="block text-xl font-bold text-slate-900">{formatCurrency(periodTotal)}</strong>
                    <span className="text-xs text-slate-500">Selected period · net total</span>
                  </div>
                </div>
                {period.collected !== 0 || period.refunded !== 0 ? (
                  <div className="mt-6">
                    <div className="mb-3 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
                      <span className="capitalize">{collectionChart.granularity} net collections</span>
                      <span>Full selected period</span>
                    </div>
                    <div role="group" aria-label={`${collectionChart.granularity} net collections chart`} className="flex items-end gap-1 border-b border-slate-100 pb-2 sm:gap-3">
                      {collectionChart.buckets.map((point, index) => {
                        const dateLabel = point.from === point.to ? shortDate(point.from) : `${shortDate(point.from)} – ${shortDate(point.to)}`;
                        const tickLabel = collectionChart.granularity === 'monthly'
                          ? new Date(`${point.from}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
                          : shortDate(point.from);
                        return <div key={point.from} className="flex min-w-0 flex-1 flex-col gap-2">
                          <div
                            tabIndex={0}
                            role="img"
                            aria-label={`${dateLabel}: ${formatCurrency(point.amount)}`}
                            title={`${dateLabel}: ${formatCurrency(point.amount)}`}
                            className="flex h-40 flex-col items-center justify-end rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                          >
                            <span className={`mb-2 max-w-full truncate text-[9px] font-semibold sm:text-[11px] ${point.amount < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                              {chartAmount(point.amount)}
                            </span>
                            <div
                              className={`w-full max-w-16 shrink-0 rounded-t ${point.amount < 0 ? 'bg-rose-400' : point.amount === 0 ? 'bg-slate-200' : 'bg-indigo-500'}`}
                              style={{ height: Math.max(point.amount === 0 ? 2 : 4, (Math.abs(point.amount) / maxCollection) * 120) }}
                            />
                          </div>
                          <span title={dateLabel} className={`whitespace-nowrap text-center text-[9px] text-slate-500 sm:text-[10px] ${collectionChart.buckets.length > 7 && index % 2 !== 0 && index !== collectionChart.buckets.length - 1 ? 'invisible sm:visible' : ''}`}>
                            {tickLabel}
                          </span>
                        </div>;
                      })}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      {collectionChart.granularity === 'weekly' ? 'Grouped into 7-day periods from the start date. ' : collectionChart.granularity === 'monthly' ? 'Grouped by month within the selected dates. ' : ''}
                      Refunds exceeding collections appear in rose.
                    </p>
                  </div>
                ) : (
                  <Empty>No payments or refunds in this period.</Empty>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                  {[
                    { label: `Received ${periodLabel}`, amount: period.collected },
                    { label: `Refunded ${periodLabel}`, amount: period.refunded },
                    { label: 'Net collected', amount: period.net_collected },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs leading-5 text-slate-500">{item.label}</p>
                      <p className="mt-1 break-words text-sm font-bold text-slate-800">{formatCurrency(item.amount)}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className={`${panel} order-5 xl:order-none min-w-0 overflow-hidden`}>
                <div className="p-4">
                  <h2 className="text-sm font-bold text-slate-900">Collections by booking source</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Selected period · includes direct and OTA bookings · bar shows share of
                    gross collections
                  </p>
                </div>
                {period.revenue_by_source.length ? (
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
                        {period.revenue_by_source.map((row, index) => (
                          <tr key={row.label}>
                            <td className="min-w-36 px-5 py-3.5">
                              <span className="text-xs font-semibold text-slate-700">{row.label}</span>
                              <div className="mt-2 h-1.5 max-w-36 rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${periodGross ? (row.collected / periodGross) * 100 : 0}%`,
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
                  <Empty>No collections or refunds in this period.</Empty>
                )}
              </section>
            </div>
            <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
              <aside className={`${panel} order-2 xl:order-none p-4`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Needs attention · Current</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {attention.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Today’s arrivals and departures, plus current tasks and balances.</p>
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
                            date: data.current?.date ?? today,
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
                  <h2 className="text-sm font-bold text-slate-900">Room status · Current</h2>
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
                  <h2 className="text-sm font-bold text-slate-900">Housekeeping · Current</h2>
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
