import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { DashboardSummary, ReservationGroup } from '../api/types';
import { PaginatedResponse } from '../api/pagination';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { MetricCard, SignalCard, StatusBadge, Panel, PageHeader, SectionHeading, Divider, ErrorMsg, LoadingMsg, TableCard, Th, Td } from './ui';
import { createPreviewData } from './previewData';

export function DashboardPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const { data, error, loading } = useAsync(
    async () => {
      if (previewDataEnabled) return createPreviewData().dashboard;
      return (await api.get<DashboardSummary>('/dashboard/summary')).data;
    },
    [previewDataEnabled, reloadKey],
  );
  const { data: recentData } = useAsync(
    async () => {
      if (previewDataEnabled) {
        const reservations = createPreviewData().reservationGroups;
        return {
          data: reservations,
          meta: { page: 1, limit: reservations.length, total: reservations.length, total_pages: 1 },
        } satisfies PaginatedResponse<ReservationGroup>;
      }
      return (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', { params: { page: 1, limit: 25, status: 'BOOKED' } })).data;
    },
    [previewDataEnabled, reloadKey],
  );
  const recentReservations = (recentData?.data ?? [])
    .filter((reservation) => reservation.reservation_status === 'BOOKED')
    .map((reservation) => ({
      reservation,
      arrival: reservation.rooms[0]?.arrival_date ?? reservation.arrival_date ?? null,
      departure: reservation.rooms[reservation.rooms.length - 1]?.departure_date ?? reservation.departure_date ?? null,
    }))
    .filter((entry) => !entry.arrival || entry.arrival >= getLocalDate())
    .sort((left, right) => (left.arrival ?? '').localeCompare(right.arrival ?? ''))
    .slice(0, 5);

  useEffect(() => { if (data) setLastUpdatedAt(new Date()); }, [data]);

  useEffect(() => {
    const id = window.setInterval(() => setReloadKey((v) => v + 1), 15000);
    const onFocus = () => setReloadKey((v) => v + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') setReloadKey((v) => v + 1); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const refreshBtn = (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={() => setReloadKey((v) => v + 1)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition"
      >
        <svg aria-hidden="true" className={`w-3 h-3 ${loading ? 'animate-spin-icon' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M20 19v-4h-4"/>
        </svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
      <span aria-live="polite" className="text-[11px] text-slate-400">
        {lastUpdatedAt ? `Updated ${formatTime(lastUpdatedAt)}` : 'Auto-syncs every 15 s'}
      </span>
    </div>
  );

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Live operating posture, OTA reservation pressure, and today's financial signals."
      >
        {refreshBtn}
      </PageHeader>

      {loading && !data && <LoadingMsg>Loading dashboard…</LoadingMsg>}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricCard label="Reservations today" value={data.reservation_groups_today.toString()} sub="Active groups" />
            <MetricCard label="Occupancy rate" value={`${data.occupancy_rate}%`} sub={`${data.occupied_rooms} of ${data.total_rooms} rooms`} />
            <MetricCard label="Available rooms" value={String(data.total_rooms - data.occupied_rooms)} sub={`of ${data.total_rooms} total`} />
            <MetricCard label="Revenue today" value={formatCurrency(data.revenue_today)} sub="Collected" />
            <MetricCard label="Open HK tasks" value={String(data.open_housekeeping_tasks)} sub="Housekeeping queue" />
          </div>

          {/* Room utilisation bar */}
          {data.total_rooms > 0 && (
            <Panel className="!py-4">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex-shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-0.5">Room utilisation</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {data.occupied_rooms} occupied · {data.total_rooms - data.occupied_rooms} free
                  </p>
                </div>
                <div className="flex-1 min-w-[100px]">
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${Math.min(data.occupancy_rate, 100)}%` }}
                    />
                  </div>
                </div>
                <StatusBadge
                  label={`${data.occupancy_rate}%`}
                  tone={data.occupancy_rate >= 75 ? 'rose' : data.occupancy_rate >= 50 ? 'gold' : 'green'}
                />
              </div>
            </Panel>
          )}

          {/* Recent reservations */}
          {recentReservations.length > 0 && (
            <TableCard eyebrow="Upcoming arrivals" title="Booked reservations">
              <table className="min-w-full text-[12.5px]">
                <thead>
                  <tr>
                    <Th>Guest</Th>
                    <Th>Ref</Th>
                    <Th>Property</Th>
                    <Th>Arrival</Th>
                    <Th>Departure</Th>
                    <Th>Rooms</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentReservations.map(({ reservation: r, arrival, departure }) => {
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <Td className="font-medium text-slate-800 max-w-[140px] truncate">
                          {r.primary_guest?.name ?? 'Guest'}
                        </Td>
                        <Td className="text-slate-400 font-mono text-[11px]">{r.external_reservation_id}</Td>
                        <Td className="text-slate-500">{r.property.name}</Td>
                        <Td className="text-slate-500">{arrival ? fmtDate(arrival) : '—'}</Td>
                        <Td className="text-slate-500">{departure ? fmtDate(departure) : '—'}</Td>
                        <Td className="text-slate-500">{r.rooms.length}</Td>
                        <Td className="text-slate-700 font-medium">
                          {r.total_amount != null ? formatCurrency(r.total_amount) : '—'}
                        </Td>
                        <Td>
                          <StatusBadge
                            label={r.reservation_status.replace(/_/g, ' ')}
                            tone={
                              r.reservation_status === 'CHECKED_IN' ? 'green' :
                              r.reservation_status === 'CHECKED_OUT' ? 'slate' :
                              r.reservation_status === 'CANCELLED' ? 'rose' : 'gold'
                            }
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>
          )}

          {/* Operating posture + watch list */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

            {/* Operating posture */}
            <Panel>
              <SectionHeading eyebrow="Today" title="Operating posture">
                <StatusBadge
                  label={data.occupancy_rate >= 75 ? 'High occupancy' : 'Stable'}
                  tone={data.occupancy_rate >= 75 ? 'rose' : 'green'}
                />
              </SectionHeading>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1">
                <SignalCard
                  label="Check-in pressure"
                  value={data.reservation_room_arrivals_today > 6 ? 'Busy' : 'Normal'}
                  detail={`${data.reservation_room_arrivals_today} room arrivals today`}
                />
                <SignalCard
                  label="Room coverage"
                  value={data.total_rooms === 0 ? 'Setup needed' : 'Live'}
                  detail={`${data.total_rooms} rooms configured`}
                />
                <SignalCard
                  label="Revenue pace"
                  value={data.revenue_today > 0 ? 'Collecting' : 'Flat'}
                  detail={formatCurrency(data.revenue_today)}
                />
                <SignalCard
                  label="Departures"
                  value={data.reservation_room_departures_today > 0 ? data.reservation_room_departures_today.toString() : 'Quiet'}
                  detail={`${data.reservation_room_departures_today} departures today`}
                />
              </div>

              <Divider />

              {/* Financials strip */}
              <div className="grid grid-cols-3 gap-5">
                <Stat label="Active groups" value={data.active_reservation_groups} note="OTA reservation groups in play" />
                <Stat label="Pending balance" value={formatCurrency(data.pending_balance_total)} note="Across open invoices" />
                <Stat label="HK queue" value={data.open_housekeeping_tasks} note="Open tasks to clear" />
              </div>
            </Panel>

            {/* OTA revenue pie */}
            <Panel>
              <SectionHeading eyebrow="Revenue" title="OTA by revenue" />
              <div className="mt-2">
                <OtaRevenuePie rows={data.revenue_by_ota} />
              </div>
            </Panel>

            {/*
            Watch list kept for rollback.
            <Panel>
              <SectionHeading eyebrow="Attention" title="What to watch" />
              <ul className="mt-1 divide-y divide-slate-50">
                {[
                  {
                    label: 'OTA arrivals',
                    icon: 'calendar',
                    text: `${data.active_reservation_groups} active reservation groups across OTA-imported stays.`,
                    urgent: data.active_reservation_groups > 0,
                  },
                  {
                    label: 'Open payments',
                    icon: 'wallet',
                    text: `${formatCurrency(data.pending_balance_total)} across pending and partial invoices.`,
                    urgent: data.pending_balance_total > 0,
                  },
                  {
                    label: 'Housekeeping',
                    icon: 'sparkles',
                    text: `${data.open_housekeeping_tasks} task${data.open_housekeeping_tasks === 1 ? '' : 's'} open — clear before next arrival wave.`,
                    urgent: data.open_housekeeping_tasks > 0,
                  },
                ].map((item) => (
                  <li key={item.label} className="flex gap-3 py-3.5">
                    <span className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${item.urgent ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}>
                      <WatchIcon name={item.icon} />
                    </span>
                    <div>
                      <p className="text-[12px] font-semibold text-slate-800 leading-tight">{item.label}</p>
                      <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            */}
          </div>
        </>
      )}
    </section>
  );
}

const OTA_REVENUE_COLORS = ['#334155', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e'];
const OTA_REVENUE_COLOR_BY_LABEL: Record<string, string> = {
  airbnb: '#fb7185',
  expedia: '#f59e0b',
  direct: '#10b981',
  'walk in': '#10b981',
};

function OtaRevenuePie({ rows }: { rows: Array<{ label: string; amount: number }> }) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const segments = rows.map((row, index) => ({
    label: row.label,
    value: row.amount,
    color: OTA_REVENUE_COLOR_BY_LABEL[row.label.trim().toLowerCase()] ?? OTA_REVENUE_COLORS[index % OTA_REVENUE_COLORS.length],
  }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="flex flex-col items-center gap-3">
      {segments.length > 0 ? (
        <PieChart
          centerLabel="TOTAL"
          centerValue="100%"
          onSelect={setSelectedLabel}
          selectedLabel={selectedLabel}
          segments={segments}
          total={total}
        />
      ) : (
        <div className="flex h-[150px] w-[150px] items-center justify-center rounded-full border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[11px] font-semibold text-slate-400">
          No OTA revenue
        </div>
      )}
      <div className="w-full space-y-1.5">
        {segments.map((segment) => {
          const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <button
              key={segment.label}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                selectedLabel === segment.label ? 'bg-slate-100' : 'hover:bg-slate-50'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300`}
              onClick={() => setSelectedLabel((current) => current === segment.label ? null : segment.label)}
              type="button"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="truncate text-[12px] font-semibold text-slate-700">{segment.label}</span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <span className="w-10 text-right text-[11.5px] font-bold text-slate-900">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PieChart({
  centerLabel,
  centerValue,
  onSelect,
  selectedLabel,
  segments,
  total,
}: {
  centerLabel: string;
  centerValue: string;
  onSelect: (label: string | null) => void;
  selectedLabel: string | null;
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  const cx = 90, cy = 90, rOuter = 68, rInner = 43, gap = 0.025;
  let angle = -Math.PI / 2;
  const slices = segments.map((segment) => {
    const pct = total > 0 ? segment.value / total : 0;
    const sweep = pct * Math.PI * 2 - gap;
    const start = angle + gap / 2;
    const end = start + sweep;
    angle += pct * Math.PI * 2;
    const x1 = cx + rOuter * Math.cos(start), y1 = cy + rOuter * Math.sin(start);
    const x2 = cx + rOuter * Math.cos(end), y2 = cy + rOuter * Math.sin(end);
    const xi1 = cx + rInner * Math.cos(start), yi1 = cy + rInner * Math.sin(start);
    const xi2 = cx + rInner * Math.cos(end), yi2 = cy + rInner * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${xi1},${yi1} L${x1},${y1} A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${rInner},${rInner} 0 ${large} 0 ${xi1},${yi1} Z`;
    return { ...segment, path };
  });
  const selected = selectedLabel ? slices.find((slice) => slice.label === selectedLabel) ?? null : null;
  const selectedPct = selected && total > 0 ? Math.round((selected.value / total) * 100) : null;

  return (
    <svg className="h-[180px] w-[180px]" viewBox="0 0 180 180" aria-label="OTA revenue pie chart">
      {slices.map((slice) => (
        <path
          key={slice.label}
          aria-label={`${slice.label} ${total > 0 ? Math.round((slice.value / total) * 100) : 0}%`}
          className="cursor-pointer transition-opacity focus:outline-none"
          d={slice.path}
          fill={slice.color}
          opacity={selectedLabel && selectedLabel !== slice.label ? 0.35 : 1}
          onClick={() => onSelect(selectedLabel === slice.label ? null : slice.label)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(selectedLabel === slice.label ? null : slice.label);
            }
          }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" className="pointer-events-none fill-slate-900 text-[18px] font-extrabold">
        {selectedPct == null ? centerValue : `${selectedPct}%`}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" className="pointer-events-none fill-slate-400 text-[9px] font-bold tracking-[0.12em]">
        {selected ? selected.label.toUpperCase().slice(0, 14) : centerLabel}
      </text>
    </svg>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{note}</p>
    </div>
  );
}

function WatchIcon({ name }: { name: string }) {
  const p = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24', className: 'w-3.5 h-3.5',
  };
  switch (name) {
    case 'calendar':  return <svg {...p}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>;
    case 'wallet':    return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M15 12h6M17 10v4"/></svg>;
    case 'sparkles':  return <svg {...p}><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2Z"/><path d="m5 14 .7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7Z"/></svg>;
    default: return null;
  }
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
}

function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function fmtDate(s: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(s));
}
