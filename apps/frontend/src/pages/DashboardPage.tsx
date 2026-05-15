import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { DashboardSummary } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

export function DashboardPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const { data, error, loading } = useAsync(
    async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    [reloadKey],
  );

  useEffect(() => { if (data) setLastUpdatedAt(new Date()); }, [data]);

  useEffect(() => {
    const id = window.setInterval(() => setReloadKey((v) => v + 1), 15000);
    const onFocus = () => setReloadKey((v) => v + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') setReloadKey((v) => v + 1); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return (
    <section className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Overview</p>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-xl">
            Watch today's hotel operating posture, OTA-imported stay pressure, and financial signals from one overview.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Live summary</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => setReloadKey((v) => v + 1)}
            aria-label={loading ? 'Refreshing…' : 'Refresh now'}
            className="flex items-center gap-2 border border-emerald-200 rounded-full px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 transition"
          >
            <svg
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin-icon' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
            >
              <path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M20 19v-4h-4"/>
            </svg>
            {loading ? 'Refreshing…' : 'Refresh now'}
          </button>
          <span aria-live="polite" className="text-xs text-slate-400">
            {lastUpdatedAt ? `Updated ${formatTime(lastUpdatedAt)}` : 'Syncing every 15 s'}
          </span>
        </div>
      </div>

      {loading && !data && <p className="text-sm text-slate-400">Loading dashboard…</p>}
      {error && <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>}

      {data && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Reservation groups today" value={data.reservation_groups_today.toString()} tone="gold" />
            <MetricCard label="Occupancy rate" value={`${data.occupancy_rate}%`} tone="green" />
            <MetricCard label="Revenue today" value={formatCurrency(data.revenue_today)} tone="blue" />
            <MetricCard label="Rooms occupied" value={`${data.occupied_rooms}/${data.total_rooms}`} tone="rose" />
          </div>

          {/* Insight panels */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Operating posture */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Today</p>
                  <h3 className="text-base font-bold text-slate-900">Operating posture</h3>
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${data.occupancy_rate >= 75 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {data.occupancy_rate >= 75 ? 'High occupancy' : 'Stable occupancy'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SignalCard label="Check-in pressure" value={data.reservation_room_arrivals_today > 6 ? 'Busy' : 'Normal'} detail={`${data.reservation_room_arrivals_today} room arrivals today`} />
                <SignalCard label="Room coverage" value={data.total_rooms === 0 ? 'Setup needed' : 'Live'} detail={`${data.total_rooms} rooms configured`} />
                <SignalCard label="Revenue pace" value={data.revenue_today > 0 ? 'Collecting' : 'Flat'} detail={formatCurrency(data.revenue_today)} />
                <SignalCard label="Departures" value={data.reservation_room_departures_today > 0 ? data.reservation_room_departures_today.toString() : 'Quiet'} detail={`${data.reservation_room_departures_today} departures today`} />
              </div>
            </div>

            {/* Watch list */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Attention points</p>
                <h3 className="text-base font-bold text-slate-900">What to watch</h3>
              </div>
              <ul className="space-y-4">
                {[
                  { label: 'OTA arrivals', text: `${data.active_reservation_groups} active reservation groups in play across OTA-imported stays.` },
                  { label: 'Payments', text: `${formatCurrency(data.pending_balance_total)} open across pending and partial invoices.` },
                  { label: 'Operations', text: `${data.open_housekeeping_tasks} housekeeping tasks open — clear before next OTA arrival wave.` },
                ].map((item) => (
                  <li key={item.label} className="flex flex-col gap-1 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                    <span className="text-xs font-bold text-slate-800">{item.label}</span>
                    <span className="text-sm text-slate-500 leading-relaxed">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'gold' | 'green' | 'blue' | 'rose' }) {
  const toneMap = {
    gold: { bar: 'from-amber-400 to-amber-500', label: 'text-amber-700 bg-amber-50', text: 'text-slate-900' },
    green: { bar: 'from-emerald-500 to-emerald-600', label: 'text-emerald-700 bg-emerald-50', text: 'text-slate-900' },
    blue: { bar: 'from-sky-500 to-sky-600', label: 'text-sky-700 bg-sky-50', text: 'text-slate-900' },
    rose: { bar: 'from-rose-500 to-rose-600', label: 'text-rose-700 bg-rose-50', text: 'text-slate-900' },
  };
  const t = toneMap[tone];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r rounded-t-2xl ${t.bar}`} />
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">{label}</p>
      <strong className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">{value}</strong>
    </div>
  );
}

function SignalCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</p>
      <strong className="text-base font-bold text-slate-900 block">{value}</strong>
      <span className="text-xs text-slate-500 mt-0.5 leading-relaxed">{detail}</span>
    </div>
  );
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
}
