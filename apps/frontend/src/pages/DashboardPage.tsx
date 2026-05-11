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

  useEffect(() => {
    if (data) {
      setLastUpdatedAt(new Date());
    }
  }, [data]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 15000);

    const refreshOnFocus = () => {
      setReloadKey((value) => value + 1);
    };

    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        setReloadKey((value) => value + 1);
      }
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Dashboard</h2>
          <p className="page-subtitle">
            Watch today&apos;s hotel operating posture, OTA-imported stay pressure, and financial/open-task signals from one overview.
          </p>
        </div>
        <div className="dashboard-refresh-controls">
          <span className="dashboard-refresh-label">Live summary</span>
          <div className="dashboard-refresh-row">
            <button
              aria-label={loading ? 'Refreshing dashboard summary' : 'Refresh dashboard summary'}
              className="dashboard-refresh-button"
              disabled={loading}
              onClick={() => setReloadKey((value) => value + 1)}
              type="button"
            >
              <RefreshIcon spinning={loading} />
              <span>{loading ? 'Refreshing...' : 'Refresh now'}</span>
            </button>
            <span aria-live="polite" className="dashboard-refresh-meta">
              {lastUpdatedAt ? `Updated ${formatRefreshTimestamp(lastUpdatedAt)}` : 'Syncing every 15 seconds'}
            </span>
          </div>
        </div>
      </div>

      {loading && <p className="muted">Loading dashboard...</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="metric-grid">
            <MetricCard label="Reservation groups today" value={data.reservation_groups_today.toString()} tone="gold" />
            <MetricCard label="Occupancy" value={`${data.occupancy_rate}%`} tone="green" />
            <MetricCard label="Revenue today" value={formatCurrency(data.revenue_today)} tone="blue" />
            <MetricCard label="Rooms occupied" value={`${data.occupied_rooms}/${data.total_rooms}`} tone="rose" />
          </div>

          <div className="dashboard-compact-grid">
            <article className="insight-panel insight-panel-primary">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Today</p>
                  <h3>Operating posture</h3>
                </div>
                <span className={`status-pill ${data.occupancy_rate >= 75 ? 'occupied' : 'available'}`}>
                  {data.occupancy_rate >= 75 ? 'High occupancy' : 'Stable occupancy'}
                </span>
              </div>
              <div className="signal-grid">
                <SignalCard
                  label="Check-in pressure"
                  value={data.reservation_room_arrivals_today > 6 ? 'Busy' : 'Normal'}
                  detail={`${data.reservation_room_arrivals_today} room-stay arrivals due today`}
                />
                <SignalCard
                  label="Room coverage"
                  value={data.total_rooms === 0 ? 'Setup needed' : 'Live'}
                  detail={`${data.total_rooms} physical rooms configured`}
                />
                <SignalCard
                  label="Revenue pace"
                  value={data.revenue_today > 0 ? 'Collecting' : 'Flat'}
                  detail={formatCurrency(data.revenue_today)}
                />
                <SignalCard
                  label="Departures"
                  value={data.reservation_room_departures_today > 0 ? data.reservation_room_departures_today.toString() : 'Quiet'}
                  detail={`${data.reservation_room_departures_today} room-stay departures due today`}
                />
              </div>
            </article>

            <article className="insight-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Attention points</p>
                  <h3>What to watch</h3>
                </div>
              </div>
              <ul className="attention-list">
                <li>
                  <strong>OTA arrivals</strong>
                  <span>{data.active_reservation_groups} active reservation groups are currently in play across OTA-imported stays.</span>
                </li>
                <li>
                  <strong>Payments</strong>
                  <span>{formatCurrency(data.pending_balance_total)} remains open across pending and partial invoices.</span>
                </li>
                <li>
                  <strong>Operations</strong>
                  <span>{data.open_housekeeping_tasks} housekeeping tasks are still open and should be cleared before the next OTA arrival wave.</span>
                </li>
              </ul>
            </article>
          </div>
        </>
      )}
    </section>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={spinning ? 'dashboard-refresh-icon spinning' : 'dashboard-refresh-icon'}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
    >
      <path d="M20 11a8 8 0 0 0-14.8-4" />
      <path d="M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14.8 4" />
      <path d="M20 19v-4h-4" />
    </svg>
  );
}

function formatRefreshTimestamp(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function SignalCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
