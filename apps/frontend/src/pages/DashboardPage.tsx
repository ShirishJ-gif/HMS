import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { DashboardSummary, ReservationGroup } from '../api/types';
import { PaginatedResponse } from '../api/pagination';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { MetricCard, SignalCard, StatusBadge, Panel, PageHeader, SectionHeading, Divider, ErrorMsg, LoadingMsg, TableCard, Th, Td } from './ui';

export function DashboardPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const { data, error, loading } = useAsync(
    async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    [reloadKey],
  );
  const { data: recentData } = useAsync(
    async () => (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', { params: { page: 1, limit: 5 } })).data,
    [reloadKey],
  );
  const recentReservations = recentData?.data ?? [];

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
    <section className="space-y-6 max-w-[1280px]">
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
            <TableCard eyebrow="Latest activity" title="Recent reservations">
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
                  {recentReservations.map((r) => {
                    const arrival = r.rooms[0]?.arrival_date ?? r.arrival_date ?? null;
                    const departure = r.rooms[r.rooms.length - 1]?.departure_date ?? r.departure_date ?? null;
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

            {/* Watch list */}
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
          </div>
        </>
      )}
    </section>
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

function fmtDate(s: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(s));
}
