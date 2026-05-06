import { useState } from 'react';
import { api } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { Billing, ChannelConnection, DashboardSummary, Property, ReservationGroup } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

export function ReportsPage() {
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const dashboardState = useAsync(async () => (await api.get<DashboardSummary>('/dashboard/summary')).data, []);
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const reservationGroupsState = useAsync(
    async () => (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/groups', { params: { limit: 200 } })).data,
    [],
  );
  const billingsState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Billing>>('/billings', { params: { limit: 200 } })).data),
    [],
  );
  const channelsState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<ChannelConnection>>('/channels', { params: { limit: 100 } })).data),
    [],
  );

  const properties = propertiesState.data ?? [];
  const reservationGroups = (reservationGroupsState.data?.data ?? []).filter(
    (group) => propertyFilter === 'ALL' || group.property.id === propertyFilter,
  );
  const billings = (billingsState.data ?? []).filter(
    (billing) => propertyFilter === 'ALL' || billing.reservation_room.property.id === propertyFilter,
  );
  const channels = (channelsState.data ?? []).filter(
    (connection) => propertyFilter === 'ALL' || connection.property_id === propertyFilter,
  );

  const roomLines = reservationGroups.flatMap((group) => group.rooms.map((room) => ({ group, room })));
  const roomNightsSold = roomLines.reduce((total, entry) => total + calculateNights(entry.room.arrival_date, entry.room.departure_date), 0);
  const activeGroups = reservationGroups.filter((group) => ['BOOKED', 'CHECKED_IN'].includes(group.reservation_status)).length;
  const cancelledGroups = reservationGroups.filter((group) => group.reservation_status === 'CANCELLED').length;
  const checkedInRoomLines = roomLines.filter((entry) => entry.room.reservation_status === 'CHECKED_IN').length;
  const balanceDue = billings.reduce((total, billing) => total + billing.balance_due, 0);
  const billedTotal = billings.reduce((total, billing) => total + billing.total, 0);
  const paidTotal = billings.reduce((total, billing) => total + (billing.paid_total - billing.refunded_total), 0);

  const sourceMix = roomLines.reduce<Record<string, number>>((counts, entry) => {
    const key = entry.group.source ?? 'ZODOMUS';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const propertyPerformance = properties
    .map((property) => {
      const propertyGroups = reservationGroups.filter((group) => group.property.id === property.id);
      const propertyBillings = billings.filter((billing) => billing.reservation_room.property.id === property.id);
      const propertyRoomLines = propertyGroups.flatMap((group) => group.rooms);
      return {
        id: property.id,
        name: property.name,
        reservation_groups: propertyGroups.length,
        room_nights: propertyRoomLines.reduce((total, room) => total + calculateNights(room.arrival_date, room.departure_date), 0),
        active_room_lines: propertyRoomLines.filter((room) => room.reservation_status === 'CHECKED_IN').length,
        billed_total: propertyBillings.reduce((total, billing) => total + billing.total, 0),
        balance_due: propertyBillings.reduce((total, billing) => total + billing.balance_due, 0),
      };
    })
    .filter((row) => propertyFilter === 'ALL' || row.id === propertyFilter);

  const channelReadiness = channels.map((connection) => ({
    id: connection.id,
    property_name: connection.property.name,
    ota_name: connection.provider_config_summary?.ota_name ?? connection.provider,
    ready: connection.provider_config_summary?.setup_status.ready ?? false,
    rooms_activated: connection.provider_config_summary?.setup_status.rooms_activated ?? false,
    last_inventory_status: connection.sync_summary.inventory.last_status,
    last_bookings_status: connection.sync_summary.bookings.last_status,
  }));

  const loading =
    dashboardState.loading ||
    propertiesState.loading ||
    reservationGroupsState.loading ||
    billingsState.loading ||
    channelsState.loading;
  const error =
    dashboardState.error ||
    propertiesState.error ||
    reservationGroupsState.error ||
    billingsState.error ||
    channelsState.error;

  return (
    <section className="reports-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Management</p>
          <h2>Reports</h2>
          <p className="page-subtitle">
            Review reservation-group performance, room-night demand, outstanding balance, and OTA readiness without leaving HMS operations.
          </p>
        </div>
      </div>

      <FilterBar title="Report scope">
        <label>
          Property
          <select onChange={(event) => setPropertyFilter(event.target.value)} value={propertyFilter}>
            <option value="ALL">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data model
          <input disabled value="ReservationGroup + ReservationRoom" />
        </label>
        <label>
          Revenue scope
          <input disabled value="Imported folios and room-line invoices" />
        </label>
      </FilterBar>

      {loading && <p className="muted">Loading reports...</p>}
      {error && <p className="error">{error}</p>}

      <div className="metric-grid">
        <MetricCard label="Room nights sold" value={roomNightsSold.toString()} tone="gold" />
        <MetricCard label="Active reservation groups" value={activeGroups.toString()} tone="green" />
        <MetricCard label="Billed total" value={formatCurrency(billedTotal)} tone="blue" />
        <MetricCard label="Balance due" value={formatCurrency(balanceDue)} tone="rose" />
      </div>

      <div className="reports-layout">
        <div className="reports-main-rail">
          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Portfolio</p>
                <h3>Reservation-group posture</h3>
              </div>
            </div>
            <div className="signal-grid compact-signal-grid">
              <SignalCard label="Room lines checked in" value={checkedInRoomLines.toString()} detail="Currently in house" />
              <SignalCard label="Cancelled groups" value={cancelledGroups.toString()} detail="Grouped reservation cancellations" />
              <SignalCard
                label="Today's arrivals"
                value={(dashboardState.data?.reservation_room_arrivals_today ?? 0).toString()}
                detail="Imported room-stay arrivals"
              />
            </div>
            <dl className="detail-list">
              <div>
                <dt>Collected total</dt>
                <dd>{formatCurrency(paidTotal)}</dd>
              </div>
              <div>
                <dt>Occupancy snapshot</dt>
                <dd>{dashboardState.data ? `${dashboardState.data.occupancy_rate}%` : '-'}</dd>
              </div>
              <div>
                <dt>Open housekeeping tasks</dt>
                <dd>{dashboardState.data?.open_housekeeping_tasks ?? 0}</dd>
              </div>
            </dl>
          </article>

          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Property performance</p>
                <h3>{propertyPerformance.length} property rows</h3>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Reservation groups</th>
                  <th>Room nights</th>
                  <th>In house</th>
                  <th>Billed</th>
                  <th>Balance due</th>
                </tr>
              </thead>
              <tbody>
                {propertyPerformance.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.reservation_groups}</td>
                    <td>{row.room_nights}</td>
                    <td>{row.active_room_lines}</td>
                    <td>{formatCurrency(row.billed_total)}</td>
                    <td>{formatCurrency(row.balance_due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Channel posture</p>
                <h3>{channelReadiness.length} configured connections</h3>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>OTA</th>
                  <th>Ready</th>
                  <th>Rooms activated</th>
                  <th>Inventory sync</th>
                  <th>Booking import</th>
                </tr>
              </thead>
              <tbody>
                {channelReadiness.map((row) => (
                  <tr key={row.id}>
                    <td>{row.property_name}</td>
                    <td>{row.ota_name}</td>
                    <td><span className={`status-pill ${row.ready ? 'available' : 'queued'}`}>{row.ready ? 'READY' : 'PENDING'}</span></td>
                    <td><span className={`status-pill ${row.rooms_activated ? 'available' : 'queued'}`}>{row.rooms_activated ? 'DONE' : 'PENDING'}</span></td>
                    <td>{row.last_inventory_status ?? '-'}</td>
                    <td>{row.last_bookings_status ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="reports-side-rail">
          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Source mix</p>
                <h3>Imported room-line volume</h3>
              </div>
            </div>
            <div className="reports-stack">
              {Object.entries(sourceMix)
                .sort((left, right) => right[1] - left[1])
                .map(([source, count]) => (
                  <div className="report-inline-stat" key={source}>
                    <strong>{source}</strong>
                    <span>{count} room lines</span>
                  </div>
                ))}
              {Object.keys(sourceMix).length === 0 && <div className="empty-state-card">No imported room lines in the selected scope.</div>}
            </div>
          </article>
        </div>
      </div>
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

function calculateNights(checkInDate: string, checkOutDate: string) {
  if (!checkInDate || !checkOutDate) {
    return 0;
  }

  const start = new Date(`${checkInDate}T00:00:00.000Z`);
  const end = new Date(`${checkOutDate}T00:00:00.000Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}
