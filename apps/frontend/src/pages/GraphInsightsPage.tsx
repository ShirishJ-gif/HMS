import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Billing, DashboardSummary, Property, ReservationGroup } from '../api/types';
import { formatCurrency } from '../utils/format';
import { ErrorMsg, LoadingMsg, MetricCard, PageHeader, Panel, SectionHeading, StatusBadge } from './ui';

type GraphInsightsData = {
  billings: Billing[];
  dashboard: DashboardSummary;
  properties: Property[];
  reservationGroups: ReservationGroup[];
};

type GraphInsightsState = {
  data: GraphInsightsData | null;
  error: string | null;
  loading: boolean;
};

const statusColors: Record<string, string> = {
  BOOKED: '#38bdf8',
  CHECKED_IN: '#10b981',
  CHECKED_OUT: '#94a3b8',
  CANCELLED: '#f43f5e',
  BLOCKED: '#f59e0b',
};

let graphInsightsCache: GraphInsightsData | null = null;
let graphInsightsCacheUpdatedAt = 0;
const graphInsightsCacheTtlMs = 60_000;

export function GraphInsightsPage() {
  const [state, setState] = useState<GraphInsightsState>(() => ({
    data: graphInsightsCache,
    error: null,
    loading: !graphInsightsCache,
  }));

  useEffect(() => {
    let active = true;
    const hasFreshCache = graphInsightsCache && Date.now() - graphInsightsCacheUpdatedAt < graphInsightsCacheTtlMs;
    if (hasFreshCache) {
      setState({ data: graphInsightsCache, error: null, loading: false });
      return () => { active = false; };
    }

    setState((current) => ({ ...current, error: null, loading: !current.data }));
    Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      fetchAllPages<Property>('/properties'),
      fetchAllPages<ReservationGroup>('/bookings/feed', { params: { include_cancelled: true } }),
      fetchAllPages<Billing>('/billings'),
    ])
      .then(([dashboardResponse, properties, reservationGroups, billings]) => {
        if (!active) return;
        const data = {
          billings,
          dashboard: dashboardResponse.data,
          properties,
          reservationGroups,
        };
        graphInsightsCache = data;
        graphInsightsCacheUpdatedAt = Date.now();
        setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState((current) => ({ data: current.data, error: getApiErrorMessage(error), loading: false }));
      });

    return () => { active = false; };
  }, []);

  const data = state.data;
  const reservationGroups = data?.reservationGroups ?? [];
  const billings = data?.billings ?? [];
  const dashboard = data?.dashboard ?? null;
  const properties = data?.properties ?? [];

  const blockedGroups = reservationGroups.filter((group) => group.import_blocked).length;
  const activeGroups = reservationGroups.filter((group) => ['BOOKED', 'CHECKED_IN'].includes(group.reservation_status)).length;
  const totalRevenue = billings.reduce((total, billing) => total + billing.total, 0);
  const paidTotal = billings.reduce((total, billing) => total + billing.paid_total - billing.refunded_total, 0);
  const balanceDue = billings.reduce((total, billing) => total + billing.balance_due, 0);
  const collectionRate = totalRevenue > 0 ? Math.round((paidTotal / totalRevenue) * 100) : 0;

  const propertyBars = buildPropertyBars(properties, reservationGroups, billings);
  const sourceSegments = buildSourceSegments(reservationGroups);
  const statusSegments = buildStatusSegments(reservationGroups, blockedGroups);
  const pacePoints = buildPacePoints(reservationGroups);
  const maxPropertyRevenue = Math.max(...propertyBars.map((row) => row.revenue), 1);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Graph Insights"
        subtitle="Visual operating snapshots for occupancy, source mix, revenue concentration, and reservation pace."
      >
        <StatusBadge label={state.loading ? 'Refreshing' : 'Live graphs'} tone={state.loading ? 'gold' : 'green'} />
      </PageHeader>

      {state.loading && !data ? <LoadingMsg>Loading graph data...</LoadingMsg> : null}
      {state.error ? <ErrorMsg>{state.error}</ErrorMsg> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Occupancy"
          value={`${dashboard?.occupancy_rate ?? 0}%`}
          sub={`${dashboard?.occupied_rooms ?? 0} of ${dashboard?.total_rooms ?? 0} rooms occupied`}
        />
        <MetricCard label="Active groups" value={String(activeGroups)} sub="Booked or checked in" />
        <MetricCard label="Collection rate" value={`${collectionRate}%`} sub={`${formatCurrency(paidTotal)} collected`} />
        <MetricCard label="Blocked imports" value={String(blockedGroups)} sub="Provider bookings needing review" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <Panel className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-400 to-slate-800" />
          <SectionHeading eyebrow="Today" title="Occupancy gauge">
            <StatusBadge
              label={(dashboard?.occupancy_rate ?? 0) >= 75 ? 'High demand' : 'Stable'}
              tone={(dashboard?.occupancy_rate ?? 0) >= 75 ? 'rose' : 'green'}
            />
          </SectionHeading>
          <OccupancyGauge value={dashboard?.occupancy_rate ?? 0} />
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Arrivals" value={dashboard?.reservation_room_arrivals_today ?? 0} />
            <MiniStat label="Departures" value={dashboard?.reservation_room_departures_today ?? 0} />
            <MiniStat label="HK open" value={dashboard?.open_housekeeping_tasks ?? 0} />
          </div>
        </Panel>

        <Panel>
          <SectionHeading eyebrow="Booking flow" title="Reservation pace by booked date" />
          <LineChart points={pacePoints} />
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{reservationGroups.length} reservation groups</span>
            <span>Grouped into the latest six booking buckets.</span>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
        <Panel>
          <SectionHeading eyebrow="Portfolio" title="Revenue by property" />
          <div className="space-y-4">
            {propertyBars.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No property revenue to graph yet.</p>
            ) : (
              propertyBars.map((row) => {
                const width = Math.max(4, Math.round((row.revenue / maxPropertyRevenue) * 100));
                return (
                  <div key={row.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                        <p className="text-[11px] text-slate-400">{row.groups} groups · {row.nights} room nights</p>
                      </div>
                      <p className="flex-shrink-0 text-sm font-bold text-slate-900">{formatCurrency(row.revenue)}</p>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-800 via-slate-600 to-emerald-400 transition-all duration-700"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeading eyebrow="Mix" title="Source and status split" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
            <div className="flex justify-center">
              <DonutChart segments={sourceSegments} total={reservationGroups.length} label="Sources" />
            </div>
            <LegendList segments={sourceSegments} />
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Reservation status</p>
            <StackedBar segments={statusSegments} total={Math.max(reservationGroups.length + blockedGroups, 1)} />
            <LegendList segments={statusSegments} compact />
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeading eyebrow="Finance" title="Collection waterfall" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <WaterfallCard label="Billed total" value={totalRevenue} tone="slate" />
          <WaterfallCard label="Collected" value={paidTotal} tone="emerald" />
          <WaterfallCard label="Balance due" value={balanceDue} tone={balanceDue > 0 ? 'rose' : 'emerald'} />
        </div>
      </Panel>
    </section>
  );
}

function OccupancyGauge({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = 70;
  const circumference = Math.PI * radius;
  const dash = (safeValue / 100) * circumference;

  return (
    <div className="flex justify-center pt-2">
      <svg width="220" height="132" viewBox="0 0 220 132" role="img" aria-label={`Occupancy ${safeValue}%`}>
        <path d="M40 104a70 70 0 0 1 140 0" fill="none" stroke="#e2e8f0" strokeWidth="18" strokeLinecap="round" />
        <path
          d="M40 104a70 70 0 0 1 140 0"
          fill="none"
          stroke="url(#occupancy-gradient)"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          strokeWidth="18"
        />
        <defs>
          <linearGradient id="occupancy-gradient" x1="40" x2="180" y1="104" y2="104">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <text x="110" y="90" textAnchor="middle" className="fill-slate-900 text-[34px] font-bold">{safeValue}%</text>
        <text x="110" y="112" textAnchor="middle" className="fill-slate-400 text-[11px] font-semibold uppercase tracking-widest">occupied</text>
      </svg>
    </div>
  );
}

function LineChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const width = 720;
  const height = 220;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const plotted = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 52) + 26;
    const y = height - 34 - (point.value / maxValue) * 150;
    return { ...point, x, y };
  });
  const line = plotted.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `26,${height - 34} ${line} ${width - 26},${height - 34}`;

  return (
    <div className="overflow-x-auto">
      <svg className="min-w-[620px]" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Reservation pace line chart">
        {[0, 1, 2, 3].map((tick) => {
          const y = 36 + tick * 45;
          return <line key={tick} x1="26" x2={width - 26} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="1" />;
        })}
        <polygon points={area} fill="url(#pace-area)" opacity="0.7" />
        <polyline points={line} fill="none" stroke="#0f172a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {plotted.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="5" fill="#10b981" stroke="#fff" strokeWidth="3" />
            <text x={point.x} y={height - 10} textAnchor="middle" className="fill-slate-400 text-[11px] font-semibold">{point.label}</text>
            <text x={point.x} y={point.y - 12} textAnchor="middle" className="fill-slate-700 text-[11px] font-bold">{point.value}</text>
          </g>
        ))}
        <defs>
          <linearGradient id="pace-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function DonutChart({ segments, total, label }: { segments: ChartSegment[]; total: number; label: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width="156" height="156" viewBox="0 0 156 156" role="img" aria-label={`${label} donut chart`}>
      <circle cx="78" cy="78" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {segments.map((segment) => {
        const percent = total > 0 ? segment.value / total : 0;
        const dash = percent * circumference;
        const circle = (
          <circle
            key={segment.label}
            cx="78"
            cy="78"
            fill="none"
            r={radius}
            stroke={segment.color}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset * circumference + circumference * 0.25}
            strokeLinecap="butt"
            strokeWidth="16"
          />
        );
        offset += percent;
        return circle;
      })}
      <text x="78" y="76" textAnchor="middle" className="fill-slate-900 text-[26px] font-bold">{total}</text>
      <text x="78" y="96" textAnchor="middle" className="fill-slate-400 text-[10px] font-bold uppercase tracking-widest">{label}</text>
    </svg>
  );
}

function StackedBar({ segments, total }: { segments: ChartSegment[]; total: number }) {
  return (
    <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
      {segments.map((segment) => (
        <div
          key={segment.label}
          className="h-full"
          style={{ width: `${Math.max(0, (segment.value / total) * 100)}%`, backgroundColor: segment.color }}
          title={`${segment.label}: ${segment.value}`}
        />
      ))}
    </div>
  );
}

function LegendList({ segments, compact = false }: { segments: ChartSegment[]; compact?: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'space-y-2.5'}>
      {segments.map((segment) => (
        <div key={segment.label} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="truncate text-[12px] font-medium text-slate-600">{segment.label}</span>
          </div>
          <span className="text-[12px] font-bold text-slate-800">{segment.value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function WaterfallCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'rose' }) {
  const toneClass = {
    slate: 'from-slate-700 to-slate-900',
    emerald: 'from-emerald-400 to-emerald-600',
    rose: 'from-rose-400 to-rose-600',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(value)}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
        <div className={`h-full w-full rounded-full bg-gradient-to-r ${toneClass}`} />
      </div>
    </div>
  );
}

type ChartSegment = {
  label: string;
  value: number;
  color: string;
};

function buildPropertyBars(properties: Property[], reservationGroups: ReservationGroup[], billings: Billing[]) {
  return properties
    .map((property) => {
      const groups = reservationGroups.filter((group) => group.property.id === property.id && !group.import_blocked);
      const propertyBillings = billings.filter((billing) => billing.reservation_room.property.id === property.id);
      return {
        id: property.id,
        name: property.name,
        groups: groups.length,
        nights: groups.reduce((total, group) => (
          total + group.rooms.reduce((roomTotal, room) => roomTotal + calcNights(room.arrival_date, room.departure_date), 0)
        ), 0),
        revenue: propertyBillings.reduce((total, billing) => total + billing.total, 0),
      };
    })
    .filter((row) => row.groups > 0 || row.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

function buildSourceSegments(groups: ReservationGroup[]): ChartSegment[] {
  const colors = ['#0f172a', '#10b981', '#38bdf8', '#f59e0b', '#f43f5e', '#94a3b8'];
  const counts = new Map<string, number>();
  groups.forEach((group) => {
    const label = normalizeSource(group.source);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value], index) => ({ label, value, color: colors[index] ?? '#94a3b8' }));
}

function buildStatusSegments(groups: ReservationGroup[], blockedGroups: number): ChartSegment[] {
  const counts = new Map<string, number>();
  groups.forEach((group) => counts.set(group.reservation_status, (counts.get(group.reservation_status) ?? 0) + 1));
  if (blockedGroups > 0) counts.set('BLOCKED', blockedGroups);
  return Array.from(counts.entries()).map(([status, value]) => ({
    label: status.replace(/_/g, ' '),
    value,
    color: statusColors[status] ?? '#94a3b8',
  }));
}

function buildPacePoints(groups: ReservationGroup[]) {
  const buckets = new Map<string, number>();
  groups.forEach((group) => {
    const date = group.booked_at ?? group.created_at;
    const label = monthLabel(date);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  });

  const points = Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
  if (points.length === 0) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((label) => ({ label, value: 0 }));
  }
  return points.slice(-6);
}

function monthLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { month: 'short' });
}

function normalizeSource(value: string | null) {
  if (!value) return 'Direct';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function calcNights(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round(
    (new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86400000,
  ));
}
