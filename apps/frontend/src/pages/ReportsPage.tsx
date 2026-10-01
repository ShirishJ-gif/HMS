import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { CalendarDatePickerField } from '../components/CalendarDatePicker';
import { CustomSelect } from '../components/CustomSelect';
import { groupReportFolios } from '../utils/report-folios';
import { formatCurrency } from '../utils/format';
import { useWorkspaceState } from '../hooks/useWorkspaceState';
import { workspacePanel, MetricHelp } from '../components/WorkspaceUI';
import { ReportTrend } from '../components/ReportTrend';
import { exportReport } from '../features/reports/export';
import type { ReportsData } from '../features/reports/types';

type Preset = 'today' | 'yesterday' | 'last_7' | 'this_month' | 'last_month' | 'custom';
export type ReportSelection = { preset: Preset; range: { from: string; to: string }; property: string };
type Detail =
  | { kind: 'reservations'; status?: string }
  | { kind: 'folios'; outstanding?: boolean }
  | { kind: 'transactions' };
const presets: Array<{ label: string; value: Preset }> = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last_7' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'Custom', value: 'custom' },
];
const panel = workspacePanel;
const action =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50';
const percent = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)}%`);
const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function todayDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function rangeFor(preset: Preset) {
  const today = todayDate();
  if (preset === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) };
  if (preset === 'last_7') return { from: addDays(today, -6), to: today };
  if (preset === 'this_month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === 'last_month') {
    const end = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  return { from: today, to: today };
}
function Comparison({
  current,
  previous,
  points = false,
}: {
  current: number | null;
  previous: number | null;
  points?: boolean;
}) {
  if (current == null || previous == null) return <span className="text-slate-400">No comparison available</span>;
  const delta = current - previous;
  if (delta === 0) return <span className="text-slate-500">No change from previous period</span>;
  if (!points && previous === 0) return <span className="text-slate-500">Previous period: 0</span>;
  const value = points ? Math.abs(delta) : Math.abs((delta / previous) * 100);
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-slate-600">
      <Icon size={13} />
      {value.toFixed(1)}
      {points ? ' pp' : '%'} {delta > 0 ? 'higher' : 'lower'} than previous
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-9 text-center text-sm leading-6 text-slate-500">{children}</p>;
}
function ReportSkeleton() {
  return (
    <div aria-label="Loading report" aria-busy="true" className="workspace-skeleton space-y-5">
      <div aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${panel} h-44 p-5`}>
            <div className="animate-shimmer h-3 w-28 rounded" />
            <div className="animate-shimmer mt-6 h-8 w-24 rounded" />
            <div className="animate-shimmer mt-5 h-3 w-3/4 rounded" />
            <div className="animate-shimmer mt-3 h-3 w-full rounded" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${panel} h-32 p-4`}>
            <div className="animate-shimmer h-3 w-28 rounded" />
            <div className="animate-shimmer mt-4 h-6 w-24 rounded" />
            <div className="animate-shimmer mt-3 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {[0, 1].map((i) => (
          <div key={i} className={`${panel} p-5`}>
            <div className="animate-shimmer h-4 w-40 rounded" />
            <div className="animate-shimmer mt-3 h-3 w-3/4 rounded" />
            <div className="animate-shimmer mt-6 h-44 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:px-5 [&_td]:py-3.5 [&_td]:align-top [&_td]:text-slate-700">
          {children}
        </tbody>
      </table>
    </div>
  );
}
function Status({ value }: { value: string | null }) {
  const failed = value === 'FAILED' || value === 'PARTIAL_FAILED';
  return (
    <span
      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${failed ? 'bg-rose-50 text-rose-700' : value === 'SUCCEEDED' || value === 'CHECKED_IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
    >
      {value ? value.toLowerCase().replace(/_/g, ' ') : 'Not synced'}
    </span>
  );
}

export function ReportsPage({
  onOpenFolio,
  onOpenPayments,
  initialSelection,
  onSelectionChange,
}: {
  onOpenFolio?: (groupId: string) => void;
  onOpenPayments?: () => void;
  initialSelection?: ReportSelection;
  onSelectionChange?: (selection: ReportSelection) => void;
}) {
  const [preset, setPreset] = useState<Preset>(initialSelection?.preset ?? 'this_month');
  const [range, setRange] = useState(() => initialSelection?.range ?? rangeFor('this_month'));
  const [draft, setDraft] = useState(range);
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null);
  const [property, setProperty] = useState(initialSelection?.property ?? 'ALL');
  const [properties, setProperties] = useState<ReportsData['properties']>([]);
  const [data, setData] = useWorkspaceState<ReportsData | null>('reports:data', null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useWorkspaceState<Detail | null>('reports:detail', null);
  const detailRef = useRef<HTMLElement>(null);
  const [detailPage, setDetailPage] = useWorkspaceState('reports:detailPage', 1);
  const [sort, setSort] = useWorkspaceState<'billed' | 'balance' | 'nights'>('reports:sort', 'billed');
  const [chartMetric, setChartMetric] = useWorkspaceState<'billed' | 'collected'>('reports:chartMetric', 'billed');
  useEffect(() => {
    onSelectionChange?.({ preset, range, property });
  }, [preset, range, property, onSelectionChange]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<ReportsData>('/reports/analytics', {
        params: { property_id: property, ...range },
        signal: controller.signal,
      })
      .then(({ data: next }) => {
        if (controller.signal.aborted) return;
        setData(next);
        setProperties(next.properties);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [property, range.from, range.to, refresh]);
  // Keep the last successful period mounted during updates, but never show another property's results.
  const report = data?.property_id === property ? data : null;
  const periodMatches = report?.from === range.from && report.to === range.to;
  const updating = loading || (!error && !periodMatches);
  const resultsUnavailable = updating || Boolean(error) || !periodMatches;
  const scope =
    property === 'ALL'
      ? properties.length === 1
        ? properties[0].name
        : 'All properties'
      : (properties.find((p) => p.id === property)?.name ?? 'Selected property');
  const villasOnly =
    report &&
    report.property_performance.length > 0 &&
    report.property_performance.every((p) => p.property_type === 'RENTAL_VILLAS');
  const draftDays = (new Date(draft.to).getTime() - new Date(draft.from).getTime()) / 86400000 + 1;
  const validDraft = Number.isFinite(draftDays) && draftDays >= 1 && draftDays <= 366;
  function showDetail(next: Detail) {
    setDetail(next);
    setDetailPage(1);
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      detailRef.current?.focus({ preventScroll: true });
    });
  }
  function applyPreset(next: Preset) {
    setPreset(next);
    setOpenPicker(null);
    if (next !== 'custom') {
      const value = rangeFor(next);
      setRange(value);
      setDraft(value);
    } else setDraft(range);
  }
  const summary = report?.summary;
  const previous = report?.comparison.summary;
  const cards =
    summary && previous
      ? [
          {
            label: villasOnly ? 'Villa room nights' : 'Room nights sold',
            value: summary.room_nights_sold.toLocaleString(),
            current: summary.room_nights_sold,
            previous: previous.room_nights_sold,
            hint: 'Booked nights within your date range',
            detail: { kind: 'reservations' } as Detail,
          },
          {
            label: 'Room occupancy',
            value: percent(summary.occupancy_rate),
            current: summary.occupancy_rate,
            previous: previous.occupancy_rate,
            points: true,
            hint: `${summary.room_nights_sold} booked / ${summary.available_room_nights} available room nights`,
          },
          {
            label: 'Average nightly rate',
            value: summary.average_daily_rate == null ? '—' : formatCurrency(summary.average_daily_rate),
            current: summary.average_daily_rate,
            previous: previous.average_daily_rate,
            hint: 'Billed room charges per booked room night',
          },
          {
            label: 'Allocated billed',
            value: formatCurrency(summary.billed_total),
            current: summary.billed_total,
            previous: previous.billed_total,
            hint: 'Stay-date allocation · includes tax & extras',
            detail: { kind: 'folios' } as Detail,
          },
        ]
      : [];
  const trend = report?.trend ?? [];
  const reservationFolios = groupReportFolios(report?.folios ?? []);
  const outstandingReservations = reservationFolios.filter(folio => folio.balance > 0);
  const outstandingDetail = detail?.kind === 'folios' && detail.outstanding;

  const reservations =
    report?.reservations.filter(
      (r) => detail?.kind !== 'reservations' || !detail.status || r.status === detail.status,
    ) ?? [];
  const folios = outstandingDetail ? outstandingReservations : reservationFolios;
  const detailCount =
    detail?.kind === 'reservations'
      ? reservations.length
      : detail?.kind === 'folios'
        ? folios.length
        : (report?.transactions.length ?? 0);
  const detailTitle =
    detail?.kind === 'folios'
      ? detail.outstanding
        ? 'Outstanding folios'
        : 'Folios for stays in this period'
      : detail?.kind === 'transactions'
        ? 'Payment transactions'
        : detail?.status
          ? `${detail.status.toLowerCase().replace(/_/g, ' ')} reservations`
          : 'Reservations in this period';
  const currentDetailPage = Math.min(detailPage, Math.max(1, Math.ceil(detailCount / 10)));
  const offset = (currentDetailPage - 1) * 10;
  const folioLink = (id: string, label = 'Open folio') =>
    onOpenFolio ? (
      <button
        type="button"
        onClick={() => onOpenFolio(id)}
        className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-indigo-600 hover:underline"
      >
        {label}
        <ChevronRight size={14} />
      </button>
    ) : null;

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Performance overview</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports &amp; Analytics</h1>
          <p className="mt-1.5 text-sm text-slate-500">Understand your bookings, revenue, and collections.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={action} type="button" disabled={updating} onClick={() => setRefresh((value) => value + 1)}>
            <RefreshCw size={14} className={updating ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className={`${action} !border-slate-800 !bg-slate-800 !text-white hover:!bg-slate-700`}
            disabled={!report || resultsUnavailable}
            onClick={() => report && !resultsUnavailable && exportReport(report)}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </header>

      <section aria-label="Report filters" className={`${panel} p-4`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-full sm:w-56">
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">Property</label>
            <CustomSelect
              value={property}
              onChange={setProperty}
              options={[
                { label: 'All properties', value: 'ALL' },
                ...properties.map((p) => ({ label: p.name, value: p.id })),
              ]}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-xs font-semibold text-slate-500">Reporting period</p>
            <div className="flex flex-wrap gap-1">
              {presets.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  aria-pressed={preset === p.value}
                  onClick={() => applyPreset(p.value)}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${preset === p.value ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {preset === 'custom' && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            {(['from', 'to'] as const).map((field) => (
              <div key={field} className="w-40">
                <CalendarDatePickerField
                  label={field === 'from' ? 'From' : 'To (inclusive)'}
                  value={draft[field]}
                  onChange={(value) => setDraft((current) => ({ ...current, [field]: value }))}
                  open={openPicker === field}
                  setOpen={(open) => setOpenPicker(open ? field : null)}
                />
              </div>
            ))}
            <button
              type="button"
              className={action}
              disabled={!validDraft}
              onClick={() => {
                setRange({ ...draft });
                setOpenPicker(null);
              }}
            >
              Apply dates
            </button>
            {!validDraft && (
              <p className="text-xs text-rose-600" role="alert">
                Choose an end date on or after the start, within 366 days.
              </p>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>
            <strong className="font-medium text-slate-700">{scope}</strong> · {dateLabel(report?.from ?? range.from)} –{' '}
            {dateLabel(report?.to ?? range.to)}, {(report?.to ?? range.to).slice(0, 4)}
            {report && (
              <>
                {' '}
                · Compared with {dateLabel(report.comparison.from)} – {dateLabel(report.comparison.to)}
              </>
            )}
          </span>
          <span role="status">
            {updating
              ? report && !periodMatches
                ? 'Updating… showing previous period'
                : 'Updating report…'
              : error
                ? report
                  ? 'Update failed · showing previous report'
                  : 'Report unavailable'
                : report
                  ? `Updated ${new Date(report.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Report unavailable'}
          </span>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
          {report && ' The last successfully loaded report is still shown below.'}
          <button type="button" className="ml-3 font-semibold underline" onClick={() => setRefresh((v) => v + 1)}>
            Try again
          </button>
        </div>
      )}
      {updating && !report && <ReportSkeleton />}
      {report && summary && (
        <fieldset
          aria-label="Report results"
          aria-busy={updating}
          disabled={resultsUnavailable}
          className="workspace-results min-w-0 space-y-5 border-0 p-0"
        >
          {report.properties.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              No properties are available in your workspace yet. Your reports will populate as properties, reservations
              and payments are added.
            </div>
          ) : (
            summary.reservation_groups === 0 &&
            report.transactions.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                No stays or payment activity in this period. Try{' '}
                <button
                  type="button"
                  onClick={() => applyPreset('last_month')}
                  className="font-semibold text-indigo-600 underline"
                >
                  last month
                </button>{' '}
                or choose a custom date range.
              </div>
            )
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className={`${panel} p-5`}>
                <p className="text-xs font-semibold text-slate-500">
                  {card.label}
                  <MetricHelp label={card.label}>
                    {card.label === 'Room occupancy'
                      ? 'Booked room nights divided by available room nights. Maintenance and dated out-of-service periods are excluded; historical capacity uses current inventory.'
                      : card.label === 'Allocated billed'
                        ? 'Each stay’s invoice is spread across its nights. This shows the portion within these dates, including tax and billable extras; it is not cash collected.'
                        : card.label === 'Average nightly rate'
                          ? 'Billed room charges divided by booked room nights. Tax and extras are excluded.'
                          : 'The number of booked nights across rooms, excluding checkout day, cancellations and blocked imports.'}
                  </MetricHelp>
                </p>
                <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
                  {card.detail ? (
                    <button
                      type="button"
                      onClick={() => showDetail(card.detail!)}
                      className="flex items-center gap-2 text-left hover:text-emerald-600 transition-colors"
                      aria-label={`View ${card.label.toLowerCase()} details`}
                    >
                      {card.value}
                      <ChevronRight size={17} className="text-slate-400" />
                    </button>
                  ) : (
                    card.value
                  )}
                </div>
                <p className="mt-3 text-xs">
                  <Comparison current={card.current} previous={card.previous} points={card.points} />
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{card.hint}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => showDetail({ kind: 'transactions' })}
              className={`${panel} p-4 text-left hover:border-indigo-300`}
            >
              <span className="flex items-center justify-between text-xs font-semibold text-slate-500">
                Net collected
                <ChevronRight size={15} />
              </span>
              <strong className="mt-2 block text-xl text-slate-900">{formatCurrency(summary.paid_total)}</strong>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {formatCurrency(summary.gross_collected)} received · {formatCurrency(summary.refunded_total)} refunded
              </span>
            </button>
            <button
              type="button"
              onClick={() => showDetail({ kind: 'folios', outstanding: true })}
              className={`${panel} p-4 text-left hover:border-indigo-300`}
            >
              <span className="flex items-center justify-between text-xs font-semibold text-slate-500">
                Outstanding balance
                <ChevronRight size={15} />
              </span>
              <strong className={`mt-2 block text-xl ${summary.balance_due > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                {formatCurrency(summary.balance_due)}
              </strong>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Current balance for stays in this period
              </span>
            </button>
            <button
              type="button"
              onClick={() => showDetail({ kind: 'reservations', status: 'CANCELLED' })}
              className={`${panel} p-4 text-left hover:border-indigo-300`}
            >
              <span className="flex items-center justify-between text-xs font-semibold text-slate-500">
                Cancelled reservations
                <ChevronRight size={15} />
              </span>
              <strong className="mt-2 block text-xl text-slate-900">
                {summary.cancelled_reservation_groups}{' '}
                <span className="text-sm font-medium text-slate-400">
                  / {summary.reservation_groups - summary.blocked_reservation_groups} imported
                </span>
              </strong>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {summary.cancellation_rate == null
                  ? 'No reservation groups in this period'
                  : `${percent(summary.cancellation_rate)} of reservation groups in this period`}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-4" data-report-column="primary">
              <section className={`${panel} min-w-0 p-5`} aria-label="Revenue trend">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Revenue &amp; collections</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {dateLabel(report.from)} – {dateLabel(report.to)} ·{' '}
                      {chartMetric === 'billed' ? 'Allocated across stay nights' : 'By payment date (UTC)'}
                    </p>
                  </div>
                  <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
                    {(['billed', 'collected'] as const).map((metric) => (
                      <button
                        type="button"
                        key={metric}
                        aria-pressed={chartMetric === metric}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${chartMetric === metric ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                        onClick={() => setChartMetric(metric)}
                      >
                        {metric === 'billed' ? 'Billed' : 'Collected'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex items-baseline gap-2">
                  <strong className="text-2xl font-bold tracking-tight text-slate-900">
                    {formatCurrency(chartMetric === 'billed' ? summary.billed_total : summary.paid_total)}
                  </strong>
                  <span className="text-xs text-slate-500">selected period</span>
                </div>
                <ReportTrend
                  key={`${report.property_id}:${report.from}:${report.to}`}
                  trend={trend}
                  metric={chartMetric}
                  disabled={resultsUnavailable}
                />
                <details className="mt-4 text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium">View chart data</summary>
                  <Table
                    headings={[
                      'Dates',
                      'Billed',
                      'Net collected',
                      'Previous dates',
                      'Previous billed',
                      'Previous collected',
                    ]}
                  >
                    {trend.map((point) => (
                      <tr key={point.from}>
                        <td>
                          {dateLabel(point.from)} – {dateLabel(point.to)}
                        </td>
                        <td>{formatCurrency(point.billed)}</td>
                        <td>{formatCurrency(point.collected)}</td>
                        <td>
                          {dateLabel(point.previous_from)} – {dateLabel(point.previous_to)}
                        </td>
                        <td>{formatCurrency(point.previous_billed)}</td>
                        <td>{formatCurrency(point.previous_collected)}</td>
                      </tr>
                    ))}
                  </Table>
                </details>
              </section>
              {/* <section className={`${panel} overflow-hidden`} aria-label="Expenses by category">
                <div className="p-5">
                  <h2 className="text-sm font-bold text-slate-900">Expenses by category</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Expense dates · {dateLabel(report.from)} – {dateLabel(report.to)} · includes pending and approved
                    entries; voided excluded.
                  </p>
                </div>
                {report.expenses_by_category?.length ? (
                  <Table headings={['Category', 'Currency', 'Entries', 'Expense amount', 'Recorded paid']}>
                    {report.expenses_by_category.map((row) => (
                      <tr key={`${row.currency}:${row.category}`}>
                        <td className="capitalize">{row.category.toLowerCase().replace(/_/g, ' ')}</td>
                        <td>{row.currency}</td>
                        <td>{row.count}</td>
                        <td className="tabular-nums">
                          {row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="tabular-nums">
                          {row.recorded_paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          {row.unknown_payment_count > 0 && (
                            <p className="mt-1 text-xs text-amber-700">
                              Payment unknown for {row.unknown_payment_count}{' '}
                              {row.unknown_payment_count === 1 ? 'entry' : 'entries'}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty>No expenses recorded for these dates.</Empty>
                )}
              </section> */}
            </div>
            <div className="min-w-0 space-y-4" data-report-column="secondary">
              <section className={`${panel} p-5`} aria-label="Reservation status">
                <h2 className="text-sm font-bold text-slate-900">Reservation status</h2>
                <p className="mt-1 text-xs text-slate-500">Current status of groups with stays in this period</p>
                <div className="my-5 flex items-center gap-4">
                  <div
                    className="relative h-28 w-28 shrink-0 rounded-full"
                    role="img"
                    aria-label={`${summary.reservation_groups} reservation groups`}
                    style={{
                      background: summary.reservation_groups
                        ? `conic-gradient(${report.reservation_posture
                            .map((segment, i, all) => {
                              const start =
                                (all.slice(0, i).reduce((sum, s) => sum + s.value, 0) / summary.reservation_groups) *
                                100;
                              return `${segment.color} ${start}% ${start + (segment.value / summary.reservation_groups) * 100}%`;
                            })
                            .join(',')})`
                        : '#f1f5f9',
                    }}
                  >
                    <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white">
                      <strong className="text-xl text-slate-900">{summary.reservation_groups}</strong>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">groups</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {report.reservation_posture.map((segment) => (
                      <button
                        type="button"
                        key={segment.status}
                        onClick={() => showDetail({ kind: 'reservations', status: segment.status })}
                        className="flex w-full items-center gap-2 rounded-lg py-1.5 text-xs hover:bg-slate-50"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
                        <span className="text-slate-600">{segment.label}</span>
                        <strong className="ml-auto text-slate-800">{segment.value}</strong>
                        <span className="w-9 text-right text-slate-400">
                          {summary.reservation_groups
                            ? Math.round((segment.value / summary.reservation_groups) * 1000) / 10
                            : 0}
                          %
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {summary.blocked_reservation_groups > 0 && (
                  <button
                    type="button"
                    className="w-full rounded-lg bg-amber-50 p-3 text-left text-xs font-medium text-amber-800"
                    onClick={() => showDetail({ kind: 'reservations', status: 'BLOCKED' })}
                  >
                    {summary.blocked_reservation_groups} blocked imports need attention →
                  </button>
                )}
                {summary.reservation_groups === 0 ? (
                  <p className="text-xs text-slate-500">No reservations match this period.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => showDetail({ kind: 'reservations' })}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    View all reservations →
                  </button>
                )}
              </section>
              <section className={`${panel} p-5`} aria-label="Payment follow-up">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-slate-900">Payment follow-up</h2>
                  {outstandingReservations.length > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-amber-700">
                      {outstandingReservations.length} unpaid {outstandingReservations.length === 1 ? 'stay' : 'stays'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">Current balances for stays in this period.</p>
                {outstandingReservations.length ? (
                  <>
                    <div className="mt-3 divide-y divide-slate-100">
                      {outstandingReservations.slice(0, 5).map((reservation) => (
                        <div key={reservation.group_id} className="flex items-start justify-between gap-3 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800" title={reservation.guest_name}>
                              {reservation.guest_name}
                            </p>
                            <p
                              className="mt-1 break-all text-[11px] text-slate-500"
                              title={`${reservation.invoice_count} open ${reservation.invoice_count === 1 ? 'invoice' : 'invoices'}`}
                            >
                              {reservation.reference}
                            </p>
                            {report.property_performance.length > 1 && (
                              <p className="mt-1 truncate text-[11px] text-slate-400" title={reservation.property_name}>
                                {reservation.property_name}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-semibold tabular-nums text-amber-700">
                              {formatCurrency(reservation.balance)}
                            </p>
                            <div className="mt-1.5">{folioLink(reservation.group_id)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500">Showing {Math.min(5, outstandingReservations.length)} of {outstandingReservations.length} unpaid reservations · latest stays first.</p>
                    {onOpenPayments && <button type="button" onClick={onOpenPayments} className="mt-2 text-xs font-semibold text-emerald-600 hover:underline">View all in Payments &amp; Folios →</button>}
                  </>
                ) : (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                    {report.folios.length
                      ? 'No outstanding balances on invoiced stays in this period.'
                      : 'No invoices for stays in this period yet.'}
                  </div>
                )}
              </section>
              {/* <section className={`${panel} min-w-0 overflow-hidden`}>
                <div className="p-5">
                  <h2 className="text-sm font-bold text-slate-900">Collections by payment method</h2>
                  <p className="mt-1 text-xs text-slate-500">Payment dates within the selected period · UTC</p>
                </div>
                {report.payments_by_method.length ? (
                  <Table headings={['Method', 'Collected', 'Refunded', 'Net']}>
                    {report.payments_by_method.map((row) => (
                      <tr key={row.provider}>
                        <td className="font-medium">{row.provider}</td>
                        <td>{formatCurrency(row.collected)}</td>
                        <td>{formatCurrency(row.refunded)}</td>
                        <td className="font-semibold">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty>No payments recorded in this period.</Empty>
                )}
              </section> */}
              {/* <section className={`${panel} min-w-0 overflow-hidden`}>
                <div className="p-5">
                  <h2 className="text-sm font-bold text-slate-900">Room category performance</h2>
                  <p className="mt-1 text-xs text-slate-500">Booked nights and allocated billed amounts</p>
                </div>
                {report.room_category_performance.length ? (
                  <Table headings={['Category', 'Room nights', 'Allocated billed']}>
                    {report.room_category_performance.map((row) => (
                      <tr key={row.id}>
                        <td className="font-medium">
                          {row.name}
                          <p className="mt-1 text-xs font-normal text-slate-400">{row.property_name}</p>
                        </td>
                        <td>{row.room_nights}</td>
                        <td className="font-semibold">{formatCurrency(row.billed_total)}</td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty>No room category activity for these dates.</Empty>
                )}
              </section> */}
            </div>
          </div>

          <section className={`${panel} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Property performance</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {report.property_performance.length}{' '}
                  {report.property_performance.length === 1 ? 'property' : 'properties'} · select a name to focus the
                  report
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Sort by
                <select
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                >
                  <option value="billed">Billed revenue</option>
                  <option value="balance">Outstanding balance</option>
                  <option value="nights">Room nights</option>
                </select>
              </label>
            </div>
            {report.property_performance.length ? (
              <Table
                headings={[
                  'Property',
                  'Groups',
                  'Room nights',
                  'Occupancy',
                  'Avg. nightly rate',
                  'Allocated billed',
                  'Balance due',
                ]}
              >
                {[...report.property_performance]
                  .sort((a, b) => b[sort] - a[sort])
                  .map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="font-semibold text-indigo-600 hover:underline"
                          onClick={() => setProperty(row.id)}
                        >
                          {row.name}
                        </button>
                        <p className="mt-1 text-xs text-slate-400">
                          {row.property_type === 'RENTAL_VILLAS' ? 'Villa' : 'Hotel'}
                        </p>
                      </td>
                      <td>{row.groups}</td>
                      <td>{row.nights}</td>
                      <td>{percent(row.occupancy_rate)}</td>
                      <td className="whitespace-nowrap">
                        {row.average_daily_rate == null ? '—' : formatCurrency(row.average_daily_rate)}
                      </td>
                      <td className="whitespace-nowrap font-semibold">{formatCurrency(row.billed)}</td>
                      <td className="whitespace-nowrap">{formatCurrency(row.balance)}</td>
                    </tr>
                  ))}
              </Table>
            ) : (
              <Empty>No properties available in this scope.</Empty>
            )}
          </section>

          {report.channel_readiness.length > 0 && (
            <section className={`${panel} overflow-hidden`}>
              <div className="p-5">
                <h2 className="text-sm font-bold text-slate-900">Channel sync status</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Current connection status · independent of reporting dates
                </p>
              </div>
              <Table headings={['Property / channel', 'Readiness', 'Inventory sync', 'Booking import']}>
                {report.channel_readiness.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">
                      {row.property_name}
                      <p className="mt-1 text-xs text-slate-500">{row.ota_name}</p>
                    </td>
                    <td>
                      <span className={`text-xs font-semibold ${row.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {row.ready ? 'Ready · latest syncs passed' : 'Needs review'}
                      </span>
                    </td>
                    <td>
                      <Status value={row.last_inventory_status} />
                      <p className="mt-1 text-xs text-slate-400">
                        {row.last_inventory_at ? new Date(row.last_inventory_at).toLocaleString() : 'No sync recorded'}
                      </p>
                    </td>
                    <td>
                      <Status value={row.last_bookings_status} />
                      <p className="mt-1 text-xs text-slate-400">
                        {row.last_bookings_at ? new Date(row.last_bookings_at).toLocaleString() : 'No import recorded'}
                      </p>
                    </td>
                  </tr>
                ))}
              </Table>
            </section>
          )}

          {detail && (
            <section
              ref={detailRef}
              tabIndex={-1}
              className={`${panel} scroll-mt-4 overflow-hidden outline-none ring-1 ring-indigo-100`}
              aria-label={detailTitle}
            >
              <div className="flex items-center justify-between gap-3 p-5">
                <div>
                  <h2 className="text-sm font-bold capitalize text-slate-900">{detailTitle}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {detailCount} {detail.kind === 'folios' ? 'reservations' : 'records'} ·{' '}
                    {detail.kind === 'folios'
                      ? 'Full folio amounts, not prorated; balances are current.'
                      : 'Matches the selected report scope.'}
                  </p>
                </div>
                <button type="button" className={action} onClick={() => setDetail(null)}>
                  Close details
                </button>
              </div>
              {detailCount === 0 ? (
                <Empty>No matching records for this period.</Empty>
              ) : detail.kind === 'reservations' ? (
                <Table headings={['Reservation / guest', 'Property', 'Stay dates', 'Status', 'Room nights', 'Details']}>
                  {reservations.slice(offset, offset + 10).map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium">
                        {row.reference}
                        <p className="mt-1 text-xs text-slate-500">{row.guest_name}</p>
                      </td>
                      <td>{row.property_name}</td>
                      <td className="whitespace-nowrap">
                        {row.from} → {row.to}
                      </td>
                      <td>
                        <Status value={row.status} />
                      </td>
                      <td>{row.room_nights}</td>
                      <td>{row.status !== 'BLOCKED' && folioLink(row.id)}</td>
                    </tr>
                  ))}
                </Table>
              ) : detail.kind === 'folios' ? (
                <Table
                  headings={[
                    'Reservation / guest',
                    'Property',
                    'Booking total',
                    'Net paid',
                    'Current balance',
                    'Details',
                  ]}
                >
                  {folios.slice(outstandingDetail ? 0 : offset, outstandingDetail ? 5 : offset + 10).map((row) => (
                    <tr key={row.group_id}>
                      <td className="font-medium">
                        {row.reference}
                        <p className="mt-1 text-xs text-slate-500">{row.guest_name}</p>
                        <p className="mt-1 text-xs text-slate-400">{row.invoice_count} {row.invoice_count === 1 ? 'invoice' : 'invoices'} combined</p>
                      </td>
                      <td>{row.property_name}</td>
                      <td>{formatCurrency(row.total)}</td>
                      <td>{formatCurrency(row.paid)}</td>
                      <td className="font-semibold">{formatCurrency(row.balance)}</td>
                      <td>{folioLink(row.group_id)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Table headings={['Date (UTC)', 'Reservation', 'Property', 'Method', 'Status', 'Amount', 'Details']}>
                  {report.transactions.slice(offset, offset + 10).map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{row.date.slice(0, 10)}</td>
                      <td>{row.reference}</td>
                      <td>{row.property_name}</td>
                      <td>{row.provider}</td>
                      <td>
                        <Status value={row.status} />
                      </td>
                      <td>{formatCurrency(row.amount)}</td>
                      <td>{row.group_id && folioLink(row.group_id)}</td>
                    </tr>
                  ))}
                </Table>
              )}
              {outstandingDetail && detailCount > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-xs text-slate-500">
                <span>Showing {Math.min(5, detailCount)} of {detailCount} unpaid reservations · latest stays first.</span>
                {onOpenPayments && <button type="button" onClick={onOpenPayments} className="font-semibold mt-4 text-emerald-600 hover:underline">View all in Payments &amp; Folios →</button>}
              </div>}
              {!outstandingDetail && detailCount > 10 && (
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-4 text-xs text-slate-500">
                  <span>
                    Page {currentDetailPage} of {Math.ceil(detailCount / 10)}
                  </span>
                  <button
                    type="button"
                    className={action}
                    disabled={currentDetailPage === 1}
                    onClick={() => setDetailPage(currentDetailPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={action}
                    disabled={offset + 10 >= detailCount}
                    onClick={() => setDetailPage(currentDetailPage + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}

          <details className={`${panel} px-5 py-4 text-xs leading-6 text-slate-500`}>
            <summary className="cursor-pointer font-semibold text-slate-700">How these numbers are calculated</summary>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>
                Stay dates are inclusive of arrival and exclude checkout. Cancelled room lines, cancelled groups, and
                blocked imports do not contribute sold nights or allocated revenue.
              </li>
              <li>
                Billed amounts are spread evenly across each stay’s nights, including tax and billable extras; OTA
                metadata charges are excluded. Average nightly rate uses billed room charges only; stays without an
                invoice contribute nights but no billed revenue.
              </li>
              <li>
                Occupancy uses the current room inventory and excludes rooms currently in maintenance and dated
                out-of-service periods. It is an estimate for historical periods if room inventory changed. Villa room
                nights count rooms individually, including rooms in whole-villa bookings.
              </li>
              <li>
                Collections use payment creation dates in UTC and current transaction statuses. Refunds use the refund
                transaction’s creation date and reduce net collections.
              </li>
              <li>
                Outstanding balances are current full-folio balances for stays overlapping the selected period,
                including cancelled stays with amounts still owed. They are not a historical closing balance.
              </li>
              <li>
                Reservation statuses are current, mutually exclusive group statuses. Comparisons use the immediately
                preceding period of equal length. “This month” means month to date.
              </li>
            </ul>
          </details>
        </fieldset>
      )}
    </div>
  );
}
