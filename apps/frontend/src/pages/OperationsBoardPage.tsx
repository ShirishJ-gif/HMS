import { ReactNode, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { Billing, DashboardSummary, HousekeepingTask, Property, ReservationGroup } from '../api/types';
import { fetchAllPages } from '../api/pagination';
import { CustomSelect } from '../components/CustomSelect';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingReservationRoomActionId, setPendingReservationRoomActionId] = useState<string | null>(null);
  const today = getLocalDate();
  const dashboardState = useAsync(async () => (await api.get<DashboardSummary>('/dashboard/summary')).data, [reloadKey]);
  const reservationGroupsState = useAsync(
    async () => fetchAllPages<ReservationGroup>('/bookings/groups'),
    [reloadKey],
  );
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const housekeepingState = useAsync(async () => fetchAllPages<HousekeepingTask>('/housekeeping'), [reloadKey]);
  const billingsState = useAsync(async () => fetchAllPages<Billing>('/billings'), [reloadKey]);

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
  const hasPropertyFilter = propertyFilter !== 'ALL';
  const propertyScopeLabel = propertyFilter === 'ALL' ? 'All properties' : properties.find((property) => property.id === propertyFilter)?.name ?? 'Selected property';
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const reservationGroups = (reservationGroupsState.data ?? []).filter(
    (group) => propertyFilter === 'ALL' || group.property.id === propertyFilter,
  );
  const tasks = (housekeepingState.data ?? []).filter(
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
  const filteredRows = normalizedSearchQuery.length === 0 ? allRows : allRows.filter((row) => matchesBoardSearch(row, normalizedSearchQuery));

  const arrivals = filteredRows
    .filter((row) => row.room.arrival_date === today && row.room.reservation_status === 'BOOKED')
    .sort((left, right) => {
      const propertyCompare = left.property.name.localeCompare(right.property.name);
      return propertyCompare !== 0 ? propertyCompare : left.primary_guest_name.localeCompare(right.primary_guest_name);
    });
  const inHouse = filteredRows
    .filter((row) => row.room.reservation_status === 'CHECKED_IN')
    .sort((left, right) => left.room.departure_date.localeCompare(right.room.departure_date));
  const departures = filteredRows
    .filter((row) => row.room.departure_date === today && ['CHECKED_IN', 'CHECKED_OUT'].includes(row.room.reservation_status))
    .sort((left, right) => left.primary_guest_name.localeCompare(right.primary_guest_name));
  const lateArrivals = filteredRows.filter((row) => row.room.arrival_date < today && row.room.reservation_status === 'BOOKED');
  const checkInQueue = [...lateArrivals, ...arrivals].sort((left, right) => {
    const leftLate = left.room.arrival_date < today;
    const rightLate = right.room.arrival_date < today;

    if (leftLate !== rightLate) {
      return leftLate ? -1 : 1;
    }

    const arrivalCompare = left.room.arrival_date.localeCompare(right.room.arrival_date);
    if (arrivalCompare !== 0) {
      return arrivalCompare;
    }

    const propertyCompare = left.property.name.localeCompare(right.property.name);
    return propertyCompare !== 0 ? propertyCompare : left.primary_guest_name.localeCompare(right.primary_guest_name);
  });
  const visibleRows = [...checkInQueue, ...departures, ...inHouse];
  const blockedRows = visibleRows.filter((row) => row.room.room.id && (openTasksByRoomId.get(row.room.room.id) ?? []).length > 0);
  const balanceRows = visibleRows.filter((row) => (groupBalanceByReservationGroupId.get(row.reservation_group_id) ?? 0) > 0);
  const visibleBalanceTotal = Array.from(
    new Set(visibleRows.map((row) => row.reservation_group_id)),
    (reservationGroupId) => groupBalanceByReservationGroupId.get(reservationGroupId) ?? 0,
  ).reduce((sum, value) => sum + value, 0);
  const hasSearchFilter = normalizedSearchQuery.length > 0;
  const activeFilterCount = Number(hasPropertyFilter) + Number(hasSearchFilter);
  const arrivalsMetricValue = hasSearchFilter ? arrivals.length : dashboardState.data?.reservation_room_arrivals_today ?? arrivals.length;
  const departuresMetricValue = hasSearchFilter ? departures.length : dashboardState.data?.reservation_room_departures_today ?? departures.length;
  const pendingBalanceMetricValue = hasSearchFilter ? visibleBalanceTotal : dashboardState.data?.pending_balance_total ?? visibleBalanceTotal;
  const priorityQueueItems = [
    {
      key: 'late',
      label: 'Late arrivals',
      value: lateArrivals.length.toString(),
      detail: 'Booked before today and still waiting for check-in.',
      targetId: lateArrivals[0] ? getStayCardId(lateArrivals[0].room.id) : 'operations-check-in',
    },
    {
      key: 'housekeeping',
      label: 'Room readiness',
      value: blockedRows.length.toString(),
      detail: 'Stays touching rooms with open housekeeping or readiness work.',
      targetId: blockedRows[0] ? getStayCardId(blockedRows[0].room.id) : 'operations-in-house',
    },
    {
      key: 'balance',
      label: 'Pending collections',
      value: formatCurrency(dashboardState.data?.pending_balance_total ?? 0),
      detail: 'Imported folios with balance still due before check-out.',
      targetId: balanceRows[0] ? getStayCardId(balanceRows[0].room.id) : 'operations-in-house',
    },
  ].filter((item) => {
    if (item.key === 'balance') {
      return (dashboardState.data?.pending_balance_total ?? 0) > 0;
    }

    return Number(item.value) > 0;
  });

  return (
    <section className="operations-board-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Front desk</p>
          <h2>Operations Board</h2>
          <p className="page-subtitle">
            Run check-ins, departures, and in-house stays from one staff board without dropping into channel or ledger detail.
          </p>
          <div className="operations-header-meta">
            <span className="operations-header-chip">Service date {formatDisplayDate(today)}</span>
            <span className="operations-header-chip">{propertyScopeLabel}</span>
            <span className="operations-header-chip">{checkInQueue.length} in check-in queue</span>
          </div>
        </div>
      </div>

      <FilterBar
        actions={
          <div className="operations-filter-actions">
            <div className="operations-filter-summary">
              <strong>{visibleRows.length}</strong>
              <span>{hasSearchFilter ? 'stays match search' : 'stays in board scope'}</span>
            </div>
            <div className="operations-filter-summary">
              <strong>{activeFilterCount}</strong>
              <span>{activeFilterCount === 1 ? 'active filter' : 'active filters'}</span>
            </div>
            <button
              className="secondary-button operations-filter-reset"
              disabled={!hasPropertyFilter && !hasSearchFilter}
              onClick={() => {
                setPropertyFilter('ALL');
                setSearchQuery('');
              }}
              type="button"
            >
              Reset filters
            </button>
          </div>
        }
        className="operations-filter-bar"
        description="Scope the board by property or jump straight to a guest, room, reservation, category, or rate plan without losing the live queue."
        title="Refine operations view"
      >
        <label>
          Quick search
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Guest, room, reservation, category, or rate plan"
            type="search"
            value={searchQuery}
          />
        </label>
        <label>
          Property
          <CustomSelect
            onChange={setPropertyFilter}
            options={[
              { label: 'All properties', value: 'ALL' },
              ...properties.map((property) => ({
                label: property.name,
                value: property.id,
              })),
            ]}
            value={propertyFilter}
          />
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
          value={arrivalsMetricValue.toString()}
          tone="gold"
          detail={`${lateArrivals.length} late arrivals still waiting`}
        />
        <SnapshotCard
          label="In house now"
          value={inHouse.length.toString()}
          tone="green"
          detail={`${blockedRows.length} stays touch rooms with open housekeeping`}
        />
        <SnapshotCard
          label="Departures today"
          value={departuresMetricValue.toString()}
          tone="blue"
          detail={`${departures.filter((row) => row.room.reservation_status === 'CHECKED_OUT').length} already checked out`}
        />
        <SnapshotCard
          label="Pending folio balance"
          value={formatCurrency(pendingBalanceMetricValue)}
          tone="rose"
          detail={`${dashboardState.data?.open_housekeeping_tasks ?? tasks.length} open housekeeping tasks`}
        />
      </div>

      <div className="operations-board-layout">
        <BoardSection
          className="operations-frontdesk-section"
          sectionId="operations-check-in"
          title="Check-in queue"
          eyebrow="Front desk"
          description="Late arrivals float to the top so the desk can clear missed arrivals before working the standard service-day queue."
          emptyText="No booked room stays need check-in right now."
          emptyStateDetail="All arrivals are clear for the current scope. Late arrivals and same-day check-ins will appear here."
          emptyStateTitle="All check-ins cleared"
          rows={checkInQueue}
          renderRow={(row) => (
            <StayActionCard
              key={row.room.id}
              row={row}
              balanceDue={groupBalanceByReservationGroupId.get(row.reservation_group_id) ?? 0}
              housekeepingTasks={row.room.room.id ? openTasksByRoomId.get(row.room.room.id) ?? [] : []}
              variant="live"
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
          className="operations-turnover-section"
          sectionId="operations-departures"
          title="Departures today"
          eyebrow="Turnover"
          description="Departing stays stay grouped here with checkout state, folio balance, and room-readiness blockers in one scan."
          emptyText="No imported room stays depart today."
          emptyStateDetail="No in-house stays are due to leave today in the current property scope."
          emptyStateTitle="No departures waiting"
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
        <article className="insight-panel operations-section operations-action-needed-section">
          <div className="section-heading">
            <div className="operations-section-copy">
              <p className="eyebrow">Action needed</p>
              <div className="operations-section-title-row">
                <h3>Priority queue</h3>
                <span className="status-pill">{priorityQueueItems.length}</span>
              </div>
              <p className="operations-section-description">
                Jump to the next queue that needs intervention instead of scanning the full board top to bottom.
              </p>
            </div>
          </div>
          {priorityQueueItems.length > 0 ? (
            <div className="operations-priority-list">
              {priorityQueueItems.map((item) => (
                <button
                  className="operations-priority-item"
                  key={item.key}
                  onClick={() => scrollToBoardTarget(item.targetId)}
                  type="button"
                >
                  <span className="operations-priority-value">{item.value}</span>
                  <span className="operations-priority-copy">
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyBoardState
              detail="Late arrivals, housekeeping blockers, and pending balances will surface here when intervention is needed."
              title="Front desk is clear"
            />
          )}
        </article>
        <BoardSection
          className="operations-live-stays-section"
          contentClassName="operations-live-card-list"
          sectionId="operations-in-house"
          title="In house"
          eyebrow="Live stays"
          description="Checked-in stays keep departure timing, folio pressure, and room readiness visible without opening the full reservation."
          emptyText="No imported room stays are currently checked in."
          emptyStateDetail="Checked-in stays will appear here with departure timing, folio balance, and room readiness context."
          emptyStateTitle="No active in-house stays"
          rows={inHouse}
          renderRow={(row) => (
            <StayActionCard
              key={row.room.id}
              row={row}
              balanceDue={groupBalanceByReservationGroupId.get(row.reservation_group_id) ?? 0}
              housekeepingTasks={row.room.room.id ? openTasksByRoomId.get(row.room.room.id) ?? [] : []}
              variant="live"
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
  emptyStateDetail,
  emptyStateTitle,
  renderRow,
  className,
  contentClassName,
  sectionId,
  description,
}: {
  title: string;
  eyebrow: string;
  rows: BoardRow[];
  emptyText: string;
  emptyStateDetail?: string;
  emptyStateTitle?: string;
  renderRow: (row: BoardRow) => ReactNode;
  className?: string;
  contentClassName?: string;
  sectionId?: string;
  description?: string;
}) {
  return (
    <article className={`insight-panel operations-section${className ? ` ${className}` : ''}`} id={sectionId}>
      <div className="table-heading operations-section-heading">
        <div className="operations-section-copy">
          <p className="eyebrow">{eyebrow}</p>
          <div className="operations-section-title-row">
            <h3>{title}</h3>
            <span className="status-pill">{rows.length}</span>
          </div>
          {description ? <p className="operations-section-description">{description}</p> : null}
        </div>
      </div>
      <div className={contentClassName ?? 'operations-card-stack'}>
        {rows.length === 0 ? (
          <EmptyBoardState detail={emptyStateDetail ?? emptyText} title={emptyStateTitle ?? 'Nothing to work right now'} />
        ) : (
          rows.map((row) => renderRow(row))
        )}
      </div>
    </article>
  );
}

function EmptyBoardState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state-card operations-empty-state">
      <span className="operations-empty-badge">All clear</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function StayActionCard({
  row,
  balanceDue,
  housekeepingTasks,
  primaryAction,
  secondaryAction,
  variant = 'default',
}: {
  row: BoardRow;
  balanceDue: number;
  housekeepingTasks: HousekeepingTask[];
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  variant?: 'default' | 'live';
}) {
  const assignedRoom = row.room.room.room_number;
  const guestName = row.room.guest_name ?? row.primary_guest_name;
  const lateArrival = row.room.arrival_date < getLocalDate() && row.room.reservation_status === 'BOOKED';
  const departureToday = row.room.departure_date === getLocalDate();
  const operationalNote = getOperationalNote({
    lateArrival,
    balanceDue,
    departureToday,
    housekeepingTaskCount: housekeepingTasks.length,
    reservationStatus: row.room.reservation_status,
  });
  const stayFacts = [
    { label: 'Category', value: row.room.room_category.name },
    { label: 'Stay', value: formatStayWindow(row.room.arrival_date, row.room.departure_date) },
    { label: 'Rate plan', value: row.room.rate_plan.name },
    { label: 'Total', value: row.room.total_amount == null ? '-' : formatCurrency(row.room.total_amount) },
  ];
  const cardClassName = [
    'operations-stay-card',
    lateArrival ? 'operations-stay-card-late' : '',
    variant === 'live' ? 'operations-stay-card-live' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const metaClassName =
    variant === 'live'
      ? 'operations-stay-meta operations-stay-meta-live'
      : 'operations-stay-meta';
  const tags = (
    <>
      {departureToday && row.room.reservation_status === 'CHECKED_IN' ? <span className="operations-tag">Due out today</span> : null}
      {row.room.adults != null || row.room.children != null ? (
        <span className="operations-tag">
          {row.room.adults ?? 0} adults / {row.room.children ?? 0} children
        </span>
      ) : null}
      {housekeepingTasks.length > 0 ? <span className="operations-tag warning">Readiness work open</span> : null}
      {balanceDue > 0 ? <span className="operations-tag danger">Balance {formatCurrency(balanceDue)}</span> : null}
    </>
  );

  return (
    <article className={cardClassName} id={getStayCardId(row.room.id)}>
      <div className="operations-stay-header">
        <div className="operations-stay-identity">
          <div className="operations-stay-topline">
            <span className="operations-stay-room">{assignedRoom ? `Room ${assignedRoom}` : 'Room assignment pending'}</span>
            {lateArrival ? <span className="operations-stay-flag">Late arrival</span> : null}
          </div>
          <strong className="operations-stay-guest">{guestName}</strong>
          <div className="operations-stay-context-row">
            <span className="operations-stay-context-pill">{row.property.name}</span>
            <span className="operations-stay-context-pill subdued">{row.external_reservation_id}</span>
          </div>
        </div>
        <span className={`status-pill ${row.room.reservation_status.toLowerCase()}`}>{row.room.reservation_status}</span>
      </div>
      {variant === 'live' ? (
        <div className="operations-live-body">
          <div className="operations-live-main">
            <div className={metaClassName}>
              {stayFacts.map((fact) => (
                <div className="operations-stay-kv" key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
            {operationalNote ? (
              <div className="operations-runbook">
                <p className="operations-runbook-note">{operationalNote}</p>
              </div>
            ) : null}
          </div>
          <aside className="operations-live-sidepanel">
            <div className="operations-tag-row operations-live-tag-row">{tags}</div>
            {(primaryAction || secondaryAction) && (
              <div className="compact-action-row operations-stay-actions operations-live-actions">
                {primaryAction}
                {secondaryAction}
              </div>
            )}
          </aside>
        </div>
      ) : null}
      {variant !== 'live' ? (
        <>
          <div className={metaClassName}>
            {stayFacts.map((fact) => (
              <div className="operations-stay-kv" key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
          <div className="operations-tag-row">{tags}</div>
          {operationalNote ? (
            <div className="operations-runbook">
              <p className="operations-runbook-note">{operationalNote}</p>
            </div>
          ) : null}
          <div className="operations-stay-footer">
            {(primaryAction || secondaryAction) && (
              <div className="compact-action-row operations-stay-actions">
                {primaryAction}
                {secondaryAction}
              </div>
            )}
          </div>
        </>
      ) : null}
    </article>
  );
}

function getOperationalNote({
  lateArrival,
  balanceDue,
  departureToday,
  housekeepingTaskCount,
  reservationStatus,
}: {
  lateArrival: boolean;
  balanceDue: number;
  departureToday: boolean;
  housekeepingTaskCount: number;
  reservationStatus: ReservationGroup['reservation_status'];
}) {
  if (lateArrival) {
    return 'Arrival date already passed. Clear this stay before standard same-day check-ins.';
  }

  if (housekeepingTaskCount > 0) {
    return 'Room still has open housekeeping or readiness work that front desk should resolve before handoff.';
  }

  if (balanceDue > 0) {
    return 'Outstanding folio balance is still open and should be cleared before the stay closes.';
  }

  if (departureToday && reservationStatus === 'CHECKED_IN') {
    return 'Guest is due out today. Keep folio review and room turnover aligned with checkout timing.';
  }

  return null;
}

function getStayCardId(reservationRoomId: string) {
  return `operations-stay-${reservationRoomId}`;
}

function scrollToBoardTarget(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
}

function formatStayWindow(arrivalDate: string, departureDate: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return `${formatter.format(parseCalendarDate(arrivalDate))} to ${formatter.format(parseCalendarDate(departureDate))}`;
}

function parseCalendarDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parseCalendarDate(value));
}

function matchesBoardSearch(row: BoardRow, normalizedQuery: string) {
  const searchableText = [
    row.room.guest_name,
    row.primary_guest_name,
    row.property.name,
    row.external_reservation_id,
    row.room.room.room_number,
    row.room.room_category.name,
    row.room.rate_plan.name,
  ]
    .filter(Boolean)
    .join(' ');

  return normalizeSearchValue(searchableText).includes(normalizedQuery);
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function getLocalDate() {
  const now = new Date();
  const offsetMillis = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMillis).toISOString().slice(0, 10);
}
