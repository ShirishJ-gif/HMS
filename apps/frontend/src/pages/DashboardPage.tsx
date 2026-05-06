import { api } from '../api/client';
import { DashboardSummary } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

export function DashboardPage() {
  const { data, error, loading } = useAsync(
    async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    [],
  );

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Live snapshot</p>
          <h2>Dashboard</h2>
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
                  <strong>Inventory</strong>
                  <span>{data.active_reservation_groups} active reservation groups are currently in play across imported OTA stays.</span>
                </li>
                <li>
                  <strong>Payments</strong>
                  <span>{formatCurrency(data.pending_balance_total)} remains open across pending and partial invoices.</span>
                </li>
                <li>
                  <strong>Operations</strong>
                  <span>{data.open_housekeeping_tasks} housekeeping tasks are still open and should be cleared before the next arrival wave.</span>
                </li>
              </ul>
            </article>
          </div>
        </>
      )}
    </section>
  );
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
