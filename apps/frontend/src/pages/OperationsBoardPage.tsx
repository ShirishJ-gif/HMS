import { ReactNode, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { Billing, DashboardSummary, HousekeepingTask, Property, ReservationGroup } from '../api/types';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

type BoardRow = {
  reservation_group_id: string;
  reservation_group_status: ReservationGroup['reservation_status'];
  external_reservation_id: string;
  property: ReservationGroup['property'];
  primary_guest_name: string;
  room: ReservationGroup['rooms'][number];
};

export function OperationsBoardPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReservationRoomActionId, setPendingReservationRoomActionId] = useState<string | null>(null);
  const today = getLocalDate();
  const dashboardState = useAsync(async () => (await api.get<DashboardSummary>('/dashboard/summary')).data, [reloadKey]);
  const reservationGroupsState = useAsync(
    async () =>
      (
        await api.get<PaginatedResponse<ReservationGroup>>('/bookings/groups', {
          params: { limit: 200 },
        })
      ).data,
    [reloadKey],
  );
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const housekeepingState = useAsync(
    async () => (await api.get<PaginatedResponse<HousekeepingTask>>('/housekeeping', { params: { limit: 200 } })).data,
    [reloadKey],
  );
  const billingsState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Billing>>('/billings', { params: { limit: 200 } })).data),
    [reloadKey],
  );

  async function checkInReservationRoom(id: string) {
    setActionError(null);
    setPendingReservationRoomActionId(id);

    try {
      await api.put(`/bookings/groups/rooms/${id}/checkin`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingReservationRoomActionId(null);
    }
  }

  async function checkOutReservationRoom(id: string) {
    setActionError(null);
    setPendingReservationRoomActionId(id);

    try {
      await api.put(`/bookings/groups/rooms/${id}/checkout`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingReservationRoomActionId(null);
    }
  }

  async function sendReservationRoomReminder(id: string) {
    setActionError(null);
    setPendingReservationRoomActionId(id);

    try {
      await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingReservationRoomActionId(null);
    }
  }

  const properties = propertiesState.data ?? [];
  const reservationGroups = (reservationGroupsState.data?.data ?? []).filter(
    (group) => propertyFilter === 'ALL' || group.property.id === propertyFilter,
  );
  const tasks = (housekeepingState.data?.data ?? []).filter(
    (task) => propertyFilter === 'ALL' || task.property.id === propertyFilter,
  );
  const billings = (billingsState.data ?? []).filter(
    (billing) => propertyFilter === 'ALL' || billing.reservation_room.property.id === propertyFilter,
  );

  const roomBalanceByReservationRoomId = new Map<string, number>();
  const groupBalanceByReservationGroupId = new Map<string, number>();

  for (const billing of billings) {
    roomBalanceByReservationRoomId.set(
      billing.reservation_room_id,
      (roomBalanceByReservationRoomId.get(billing.reservation_room_id) ?? 0) + billing.balance_due,
    );
    groupBalanceByReservationGroupId.set(
      billing.reservation_room.reservation_group_id,
      (groupBalanceByReservationGroupId.get(billing.reservation_room.reservation_group_id) ?? 0) + billing.balance_due,
    );
  }

  const openTasksByRoomId = new Map<string, HousekeepingTask[]>();

  for (const task of tasks) {
    if (task.status === 'CLEAN') {
      continue;
    }

    const current = openTasksByRoomId.get(task.room_id) ?? [];
    current.push(task);
    openTasksByRoomId.set(task.room_id, current);
  }

  const allRows: BoardRow[] = reservationGroups.flatMap((group) =>
    group.rooms.map((room) => ({
      reservation_group_id: group.id,
      reservation_group_status: group.reservation_status,
      external_reservation_id: group.external_reservation_id,
      property: group.property,
      primary_guest_name: group.primary_guest?.name ?? 'Imported guest',
      room,
    })),
  );

  const arrivals = allRows
    .filter((row) => row.room.arrival_date === today && row.room.reservation_status === 'BOOKED')
    .sort((left, right) => {
      const propertyCompare = left.property.name.localeCompare(right.property.name);
      return propertyCompare !== 0 ? propertyCompare : left.primary_guest_name.localeCompare(right.primary_guest_name);
    });
  const inHouse = allRows
    .filter((row) => row.room.reservation_status === 'CHECKED_IN')
    .sort((left, right) => left.room.departure_date.localeCompare(right.room.departure_date));
  const departures = allRows
    .filter((row) => row.room.departure_date === today && ['CHECKED_IN', 'CHECKED_OUT'].includes(row.room.reservation_status))
    .sort((left, right) => left.primary_guest_name.localeCompare(right.primary_guest_name));
  const lateArrivals = allRows.filter((row) => row.room.arrival_date < today && row.room.reservation_status === 'BOOKED');
  const blockedRooms = allRows.filter((row) => row.room.room.id && (openTasksByRoomId.get(row.room.room.id) ?? []).length > 0);

  return (
    <section className="operations-board-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Front desk</p>
          <h2>Operations Board</h2>
          <p className="page-subtitle">
            Run arrivals, departures, and in-house stays from one staff board. This screen keeps imported OTA room stays actionable without sending staff into channel or ledger details.
          </p>
        </div>
      </div>

      <FilterBar title="Desk filters">
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
          Service date
          <input disabled type="date" value={today} />
        </label>
      </FilterBar>

      {actionError && <p className="error">{actionError}</p>}
      {(dashboardState.loading || reservationGroupsState.loading || propertiesState.loading || housekeepingState.loading || billingsState.loading) && (
        <p className="muted">Loading front desk operations...</p>
      )}
      {(dashboardState.error || reservationGroupsState.error || propertiesState.error || housekeepingState.error || billingsState.error) && (
        <p className="error">
          {dashboardState.error ?? reservationGroupsState.error ?? propertiesState.error ?? housekeepingState.error ?? billingsState.error}
        </p>
      )}

      <div className="operations-snapshot-grid">
        <SnapshotCard
          label="Arrivals today"
          value={(dashboardState.data?.reservation_room_arrivals_today ?? arrivals.length).toString()}
          tone="gold"
          detail={`${lateArrivals.length} late arrivals still waiting`}
        />
        <SnapshotCard
          label="In house now"
          value={inHouse.length.toString()}
          tone="green"
          detail={`${blockedRooms.length} stays touch rooms with open housekeeping`}
        />
        <SnapshotCard
          label="Departures today"
          value={(dashboardState.data?.reservation_room_departures_today ?? departures.length).toString()}
          tone="blue"
          detail={`${departures.filter((row) => row.room.reservation_status === 'CHECKED_OUT').length} already checked out`}
        />
        <SnapshotCard
          label="Pending folio balance"
          value={formatCurrency(dashboardState.data?.pending_balance_total ?? 0)}
          tone="rose"
          detail={`${dashboardState.data?.open_housekeeping_tasks ?? tasks.length} open housekeeping tasks`}
        />
      </div>

      <div className="operations-board-layout">
        <div className="operations-main-rail">
          <div className="operations-columns">
            <BoardSection
              title="Arrivals today"
              eyebrow="Front desk"
              emptyText="No room-stay arrivals are due today."
              rows={arrivals}
              renderRow={(row) => (
                <StayActionCard
                  key={row.room.id}
                  row={row}
                  balanceDue={groupBalanceByReservationGroupId.get(row.reservation_group_id) ?? 0}
                  housekeepingTasks={row.room.room.id ? openTasksByRoomId.get(row.room.room.id) ?? [] : []}
                  primaryAction={
                    <button
                      className="link-button compact-button"
                      disabled={pendingReservationRoomActionId === row.room.id}
                      onClick={() => void checkInReservationRoom(row.room.id)}
                      type="button"
                    >
                      {pendingReservationRoomActionId === row.room.id ? 'Processing...' : 'Check in'}
                    </button>
                  }
                  secondaryAction={
                    <button
                      className="secondary-button compact-button"
                      disabled={pendingReservationRoomActionId === row.room.id}
                      onClick={() => void sendReservationRoomReminder(row.room.id)}
                      type="button"
                    >
                      {pendingReservationRoomActionId === row.room.id ? 'Processing...' : 'Send reminder'}
                    </button>
                  }
                />
              )}
            />
            <BoardSection
              title="In house"
              eyebrow="Live stays"
              emptyText="No imported room stays are currently checked in."
              rows={inHouse}
              renderRow={(row) => (
                <StayActionCard
                  key={row.room.id}
                  row={row}
                  balanceDue={groupBalanceByReservationGroupId.get(row.reservation_group_id) ?? 0}
                  housekeepingTasks={row.room.room.id ? openTasksByRoomId.get(row.room.room.id) ?? [] : []}
                  primaryAction={
                    <button
                      className="link-button compact-button"
                      disabled={pendingReservationRoomActionId === row.room.id}
                      onClick={() => void checkOutReservationRoom(row.room.id)}
                      type="button"
                    >
                      {pendingReservationRoomActionId === row.room.id ? 'Processing...' : 'Check out'}
                    </button>
                  }
                />
              )}
            />
            <BoardSection
              title="Departures today"
              eyebrow="Turnover"
              emptyText="No imported room stays depart today."
              rows={departures}
              renderRow={(row) => (
                <StayActionCard
                  key={row.room.id}
                  row={row}
                  balanceDue={groupBalanceByReservationGroupId.get(row.reservation_group_id) ?? 0}
                  housekeepingTasks={row.room.room.id ? openTasksByRoomId.get(row.room.room.id) ?? [] : []}
                  primaryAction={
                    row.room.reservation_status === 'CHECKED_IN' ? (
                      <button
                        className="link-button compact-button"
                        disabled={pendingReservationRoomActionId === row.room.id}
                        onClick={() => void checkOutReservationRoom(row.room.id)}
                        type="button"
                      >
                        {pendingReservationRoomActionId === row.room.id ? 'Processing...' : 'Check out'}
                      </button>
                    ) : undefined
                  }
                />
              )}
            />
          </div>
        </div>

        <div className="operations-side-rail">
          {(lateArrivals.length > 0 || (dashboardState.data?.open_housekeeping_tasks ?? tasks.length) > 0 || (dashboardState.data?.pending_balance_total ?? 0) > 0) && (
            <article className="insight-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Action needed</p>
                  <h3>Priority queue</h3>
                </div>
              </div>
              <ul className="attention-list">
                <li>
                  <strong>Late arrivals</strong>
                  <span>{lateArrivals.length} room stays are still booked with an arrival date before today.</span>
                </li>
                <li>
                  <strong>Housekeeping blockers</strong>
                  <span>{dashboardState.data?.open_housekeeping_tasks ?? tasks.length} open tasks may block room turnover.</span>
                </li>
                <li>
                  <strong>Pending collections</strong>
                  <span>{formatCurrency(dashboardState.data?.pending_balance_total ?? 0)} remains to be collected across imported folios.</span>
                </li>
              </ul>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function SnapshotCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: 'gold' | 'green' | 'blue' | 'rose';
  detail: string;
}) {
  return (
    <article className={`metric-card operations-snapshot-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function BoardSection({
  title,
  eyebrow,
  rows,
  emptyText,
  renderRow,
}: {
  title: string;
  eyebrow: string;
  rows: BoardRow[];
  emptyText: string;
  renderRow: (row: BoardRow) => ReactNode;
}) {
  return (
    <article className="insight-panel operations-section">
      <div className="table-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className="status-pill">{rows.length}</span>
      </div>
      <div className="operations-card-stack">
        {rows.length === 0 ? <p className="muted">{emptyText}</p> : rows.map((row) => renderRow(row))}
      </div>
    </article>
  );
}

function StayActionCard({
  row,
  balanceDue,
  housekeepingTasks,
  primaryAction,
  secondaryAction,
}: {
  row: BoardRow;
  balanceDue: number;
  housekeepingTasks: HousekeepingTask[];
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  const assignedRoom = row.room.room.room_number;
  const departureToday = row.room.departure_date === getLocalDate();

  return (
    <article className="operations-stay-card">
      <div className="operations-stay-header">
        <div>
          <strong>{row.room.guest_name ?? row.primary_guest_name}</strong>
          <p>
            {row.property.name} · {row.external_reservation_id}
          </p>
        </div>
        <span className={`status-pill ${row.room.reservation_status.toLowerCase()}`}>{row.room.reservation_status}</span>
      </div>
      <div className="operations-stay-meta">
        <span>{row.room.room_category.name}</span>
        <span>{assignedRoom ? `Room ${assignedRoom}` : 'Auto-assign at check-in'}</span>
        <span>
          {row.room.arrival_date} to {row.room.departure_date}
        </span>
      </div>
      <div className="operations-tag-row">
        {row.room.adults != null || row.room.children != null ? (
          <span className="operations-tag">
            {row.room.adults ?? 0} adults / {row.room.children ?? 0} children
          </span>
        ) : null}
        {housekeepingTasks.length > 0 ? <span className="operations-tag warning">Housekeeping open</span> : null}
        {balanceDue > 0 ? <span className="operations-tag danger">Balance {formatCurrency(balanceDue)}</span> : null}
        {departureToday && row.room.reservation_status === 'CHECKED_IN' ? <span className="operations-tag">Due out today</span> : null}
      </div>
      <div className="operations-stay-footer">
        <div className="operations-stay-facts">
          <span>Rate: {row.room.rate_plan.name}</span>
          <span>Total: {row.room.total_amount == null ? '-' : formatCurrency(row.room.total_amount)}</span>
        </div>
        {(primaryAction || secondaryAction) && <div className="compact-action-row">{primaryAction}{secondaryAction}</div>}
      </div>
    </article>
  );
}

function getLocalDate() {
  const now = new Date();
  const offsetMillis = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMillis).toISOString().slice(0, 10);
}
