import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { AvailabilitySummary, InventoryCalendarSummary, Property, RoomCategory } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { usePersistedPropertyId } from '../hooks/usePersistedPropertyId';
import { formatCurrency } from '../utils/format';

const AVAILABILITY_STORAGE_KEY = 'hms_availability_state';

type PersistedAvailabilityQuery = {
  propertyId: string;
  from: string;
  to: string;
};

type PersistedAvailabilityState = {
  lastLoadedQuery: PersistedAvailabilityQuery;
  availability: AvailabilitySummary;
  inventoryCalendar: InventoryCalendarSummary;
};

export function AvailabilityPage() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [propertyId, setPropertyId] = usePersistedPropertyId();
  const persistedAvailabilityState = useMemo(() => readPersistedAvailabilityState(), []);
  const restoredQuery = persistedAvailabilityState?.lastLoadedQuery ?? null;
  const shouldRestorePersistedResults = restoredQuery != null && (!propertyId || restoredQuery.propertyId === propertyId);
  const [from, setFrom] = useState(shouldRestorePersistedResults ? restoredQuery.from : today);
  const [to, setTo] = useState(shouldRestorePersistedResults ? restoredQuery.to : tomorrow);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(
    shouldRestorePersistedResults ? persistedAvailabilityState?.availability ?? null : null,
  );
  const [inventoryCalendar, setInventoryCalendar] = useState<InventoryCalendarSummary | null>(
    shouldRestorePersistedResults ? persistedAvailabilityState?.inventoryCalendar ?? null : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [lastLoadedQuery, setLastLoadedQuery] = useState<PersistedAvailabilityQuery | null>(
    shouldRestorePersistedResults ? restoredQuery : null,
  );
  const [restrictionForm, setRestrictionForm] = useState({
    room_category_id: '',
    from_date: today,
    to_date: today,
    stop_sell: false,
    min_stay: '',
    max_stay: '',
  });
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const properties = propertiesState.data ?? [];
  const roomCategories = categoriesState.data ?? [];

  useEffect(() => {
    if (!propertyId && restoredQuery?.propertyId) {
      setPropertyId(restoredQuery.propertyId);
    }
  }, [propertyId, restoredQuery, setPropertyId]);

  useEffect(() => {
    if (!propertiesState.data) {
      return;
    }

    if (properties.length === 0) {
      if (propertyId) setPropertyId('');
      return;
    }

    if (!propertyId || !properties.some((property) => property.id === propertyId)) {
      setPropertyId(properties[0].id);
    }
  }, [properties, propertyId, setPropertyId]);

  const propertyCategories = useMemo(
    () => roomCategories.filter((category) => category.property_id === propertyId),
    [roomCategories, propertyId],
  );
  const totalInventory = availability?.categories.reduce((sum, category) => sum + category.total_inventory, 0) ?? 0;
  const totalReservedRoomStays = availability?.categories.reduce((sum, category) => sum + category.reserved_room_stays, 0) ?? 0;
  const totalOutOfService = availability?.categories.reduce((sum, category) => sum + category.out_of_service, 0) ?? 0;
  const totalAvailable = availability?.categories.reduce((sum, category) => sum + category.available, 0) ?? 0;
  const sellThroughRate = totalInventory === 0 ? 0 : Math.round((totalReservedRoomStays / totalInventory) * 100);
  const queryDays = buildDateRange(from, to).map((date) => ({
    date,
    dayLabel: new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' }),
    shortDate: new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));
  const stopSellCount =
    inventoryCalendar?.categories.reduce(
      (sum, category) => sum + category.rows.filter((row) => row.stop_sell).length,
      0,
    ) ?? 0;
  const restrictedNightCount =
    inventoryCalendar?.categories.reduce(
      (sum, category) =>
        sum + category.rows.filter((row) => row.stop_sell || row.min_stay != null || row.max_stay != null).length,
      0,
    ) ?? 0;
  const topAvailableCategory = availability?.categories.reduce<AvailabilitySummary['categories'][number] | null>(
    (currentTop, category) => (!currentTop || category.available > currentTop.available ? category : currentTop),
    null,
  );

  async function fetchAvailabilitySnapshot(query: PersistedAvailabilityQuery) {
    const [availabilityResponse, inventoryResponse] = await Promise.all([
      api.get<AvailabilitySummary>('/availability', {
        params: {
          property_id: query.propertyId,
          from: query.from,
          to: query.to,
        },
      }),
      api.get<InventoryCalendarSummary>('/inventory-calendar', {
        params: {
          property_id: query.propertyId,
          from: query.from,
          to: previousDate(query.to),
        },
      }),
    ]);

    return {
      availability: availabilityResponse.data,
      inventoryCalendar: inventoryResponse.data,
    };
  }

  async function loadAvailability(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const query = { propertyId, from, to };
      const snapshot = await fetchAvailabilitySnapshot(query);
      setAvailability(snapshot.availability);
      setInventoryCalendar(snapshot.inventoryCalendar);
      setLastLoadedQuery(query);
      writePersistedAvailabilityState({
        lastLoadedQuery: query,
        availability: snapshot.availability,
        inventoryCalendar: snapshot.inventoryCalendar,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load availability');
    }
  }

  async function submitRestrictions(event: FormEvent) {
    event.preventDefault();
    if (!propertyId) {
      setActionError('Select a property before saving restrictions.');
      return;
    }

    setActionError(null);
    setActionStatus(null);
    setPendingAction('save-restrictions');

    try {
      await api.post('/inventory/restrictions', {
        property_id: propertyId,
        room_category_id: restrictionForm.room_category_id,
        from_date: restrictionForm.from_date,
        to_date: restrictionForm.to_date,
        stop_sell: restrictionForm.stop_sell,
        min_stay: restrictionForm.min_stay ? Number(restrictionForm.min_stay) : undefined,
        max_stay: restrictionForm.max_stay ? Number(restrictionForm.max_stay) : undefined,
      });
      setActionStatus('Restrictions saved. Reload availability to review the updated calendar.');
      if (lastLoadedQuery) {
        const inventoryResponse = await api.get<InventoryCalendarSummary>('/inventory-calendar', {
          params: {
            property_id: lastLoadedQuery.propertyId,
            from: lastLoadedQuery.from,
            to: previousDate(lastLoadedQuery.to),
          },
        });
        setInventoryCalendar(inventoryResponse.data);
        if (availability) {
          writePersistedAvailabilityState({
            lastLoadedQuery,
            availability,
            inventoryCalendar: inventoryResponse.data,
          });
        }
      }
    } catch (saveError) {
      setActionError(getApiErrorMessage(saveError));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2>Availability &amp; Rates</h2>
          <p className="page-subtitle">
            Control OTA-facing sellable inventory, review rate posture, and manage internal restriction rules from one commercial workspace.
          </p>
        </div>
      </div>

      <div className="booking-layout availability-workspace">
        <form className="card booking-form-card availability-query-card" onSubmit={loadAvailability}>
          <div className="section-heading">
              <div>
                <p className="eyebrow">Commercial window</p>
                <h3>Availability query</h3>
              </div>
            </div>
          <div className="booking-form-grid">
            <label>
              Property
              <select onChange={(event) => setPropertyId(event.target.value)} required value={propertyId}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                onChange={(event) => setFrom(event.target.value)}
                placeholder="2026-05-01"
                required
                type="date"
                value={from}
              />
            </label>
            <label>
              To
              <input onChange={(event) => setTo(event.target.value)} placeholder="2026-05-03" required type="date" value={to} />
            </label>
          </div>
          <div className="booking-form-footer">
            <button className="primary-button" type="submit">
              Check availability
            </button>
          </div>
        </form>

        <aside className="booking-sidepanel availability-sidepanel">
          <div className="insight-panel availability-sidepanel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Window posture</p>
                <h3>Availability snapshot</h3>
              </div>
            </div>
            <div className="compact-signal-grid availability-window-row">
              <SignalStat label="Total keys" value={totalInventory} />
              <SignalStat label="Reserved stays" value={totalReservedRoomStays} />
              <SignalStat label="Sellable" value={totalAvailable} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>Out of service</dt>
                <dd>{totalOutOfService}</dd>
              </div>
              <div>
                <dt>Property</dt>
                <dd>{availability?.property_name ?? 'Not loaded'}</dd>
              </div>
              <div>
                <dt>Date window</dt>
                <dd>
                  {availability ? `${availability.from} to ${availability.to}` : `${from} to ${to}`}
                </dd>
              </div>
              <div>
                <dt>Restricted nights</dt>
                <dd>{restrictedNightCount}</dd>
              </div>
            </dl>
          </div>

          {/* <div className="insight-panel availability-sidepanel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Commercial rules</p>
                <h3>What this workspace controls</h3>
              </div>
            </div>
            <ul className="attention-list">
              <li>
                <strong>Inventory depth</strong>
                <span>Physical room counts, maintenance holds, and reserved room-stay depletion are calculated in HMS.</span>
              </li>
              <li>
                <strong>Rate posture</strong>
                <span>Starting rates are shown by room category so revenue teams can see which categories still have sellable depth.</span>
              </li>
              <li>
                <strong>Channel reflection</strong>
                <span>Zodomus and OTAs should reflect the sellable inventory that HMS computes here after outbound sync catches up.</span>
              </li>
            </ul>
          </div> */}
        </aside>
      </div>

      {propertiesState.loading && <p className="muted">Loading properties...</p>}
      {categoriesState.loading && <p className="muted">Loading room types...</p>}
      {(propertiesState.error || categoriesState.error || error) && <p className="error">{propertiesState.error ?? categoriesState.error ?? error}</p>}
      {actionStatus && <p className="success">{actionStatus}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {/* Restriction management is hidden for now until the commercial flow is ready again.
      <div className="info-strip availability-restriction-strip">
        <strong>Restriction scope</strong>
        <span>
          Stop-sell, minimum stay, and maximum stay are enforced inside HMS now, but they are <strong>not synced to Zodomus yet</strong>. Treat them as internal-only controls until provider-side restriction sync is confirmed.
        </span>
      </div>
      */}

      {availability && (
        <>
          <div className="info-strip availability-commercial-strip">
            <strong>Commercial view</strong>
            <span>
              {sellThroughRate}% of inventory is already committed by imported room stays in this window. Use the category board below to see which room groups still have clean sellable depth.
            </span>
          </div>

          <div className="info-strip">
            <strong>System ownership</strong>
            <span>
              Availability on this screen is HMS truth. OTAs and the channel manager should receive the reduced sellable count after reservation import and maintenance changes.
            </span>
          </div>

          {/* Stay window is hidden for now until this page shows true per-night availability detail.
          <div className="availability-calendar-strip">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Stay window</p>
                <h3>Queried nights</h3>
              </div>
              <span className="cell-note">Current API returns category totals for the selected window, not per-night availability.</span>
            </div>
            <div className="availability-calendar-grid" style={{ gridTemplateColumns: `repeat(${Math.max(queryDays.length, 1)}, minmax(4.25rem, 1fr))` }}>
              {queryDays.map((day) => (
                <div className="availability-calendar-day" key={day.date}>
                  <strong>{day.dayLabel}</strong>
                  <span>{day.shortDate}</span>
                </div>
              ))}
            </div>
          </div>
          */}

          <div className="availability-summary-grid availability-posture-grid">
            <article className="availability-highlight-card">
              <p className="eyebrow">Best remaining depth</p>
              <h3>{topAvailableCategory?.name ?? 'No category loaded'}</h3>
              <strong>{topAvailableCategory?.available ?? 0} sellable rooms</strong>
              <span>
                Starting rate {topAvailableCategory?.lowest_rate == null ? '-' : formatCurrency(topAvailableCategory.lowest_rate)}
              </span>
            </article>
            <article className="availability-highlight-card">
              <p className="eyebrow">Committed inventory</p>
              <h3>{sellThroughRate}% sold</h3>
              <strong>{totalReservedRoomStays} reserved room stays</strong>
              <span>{totalAvailable} still sellable in this search window</span>
            </article>
            <article className="availability-highlight-card">
              <p className="eyebrow">Restriction posture</p>
              <h3>{stopSellCount} stop-sell nights</h3>
              <strong>{restrictedNightCount} restricted room nights</strong>
              <span>Includes stop-sell plus min/max-stay rules stored in the inventory calendar.</span>
            </article>
          </div>

          {/* Restriction management is hidden for now until this workflow is reintroduced cleanly.
          <div className="booking-layout restriction-layout availability-restriction-layout">
            <form className="card booking-form-card availability-restriction-card" onSubmit={submitRestrictions}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Selling rules</p>
                  <h3>Restriction management</h3>
                </div>
                <span className="cell-note">Internal only. Not synced to Zodomus yet.</span>
              </div>
              <div className="booking-form-grid availability-restriction-grid">
                <label>
                  Room type
                  <select
                    required
                    value={restrictionForm.room_category_id}
                    onChange={(event) => setRestrictionForm((current) => ({ ...current, room_category_id: event.target.value }))}
                  >
                    <option value="">Select room type</option>
                    {propertyCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  From
                  <input
                    type="date"
                    required
                    value={restrictionForm.from_date}
                    onChange={(event) => setRestrictionForm((current) => ({ ...current, from_date: event.target.value }))}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    required
                    value={restrictionForm.to_date}
                    onChange={(event) => setRestrictionForm((current) => ({ ...current, to_date: event.target.value }))}
                  />
                </label>
                <label>
                  Min stay
                  <input
                    type="number"
                    min={1}
                    placeholder="Optional"
                    value={restrictionForm.min_stay}
                    onChange={(event) => setRestrictionForm((current) => ({ ...current, min_stay: event.target.value }))}
                  />
                </label>
                <label>
                  Max stay
                  <input
                    type="number"
                    min={1}
                    placeholder="Optional"
                    value={restrictionForm.max_stay}
                    onChange={(event) => setRestrictionForm((current) => ({ ...current, max_stay: event.target.value }))}
                  />
                </label>
                <label className="toggle-field">
                  <span>Stop sell</span>
                  <input
                    type="checkbox"
                    checked={restrictionForm.stop_sell}
                    onChange={(event) => setRestrictionForm((current) => ({ ...current, stop_sell: event.target.checked }))}
                  />
                </label>
              </div>
              <div className="booking-form-footer">
                <button className="primary-button" disabled={pendingAction === 'save-restrictions'} type="submit">
                  {pendingAction === 'save-restrictions' ? 'Saving...' : 'Save restrictions'}
                </button>
              </div>
              <p className="cell-note" style={{ marginTop: '0.75rem' }}>
                These rules affect HMS allocation decisions immediately for direct bookings and imported OTA reservations, but OTA selling rules remain unchanged until outbound restriction sync is implemented.
              </p>
            </form>

            <aside className="booking-sidepanel availability-sidepanel">
              <div className="insight-panel availability-sidepanel-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">How rules work</p>
                    <h3>Commercial effect</h3>
                  </div>
                </div>
                <ul className="attention-list">
                  <li>
                    <strong>Stop sell</strong>
                    <span>Closes the room type for new selling even if physical inventory exists.</span>
                  </li>
                  <li>
                    <strong>Min / max stay</strong>
                    <span>Direct booking and OTA intake now use these values when allocating inventory inside HMS, but Zodomus does not receive them yet.</span>
                  </li>
                  <li>
                    <strong>CTA / CTD</strong>
                    <span>Closed-to-arrival and closed-to-departure rules are part of the target commercial model, but this frontend does not expose them yet.</span>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
          */}

          <div className="availability-category-grid">
            {availability.categories.map((category) => {
              const committedPercent =
                category.total_inventory === 0 ? 0 : Math.min(100, Math.round((category.reserved_room_stays / category.total_inventory) * 100));
              const maintenancePercent =
                category.total_inventory === 0
                  ? 0
                  : Math.min(100, Math.round((category.out_of_service / category.total_inventory) * 100));

              return (
                <article className="availability-category-card" key={category.room_category_id}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Room category</p>
                      <h3>{category.name}</h3>
                    </div>
                    <span className={category.available > 0 ? 'status-pill available' : 'status-pill occupied'}>
                      {category.available} left
                    </span>
                  </div>
                  <div className="availability-meter">
                    <div className="availability-meter-bar">
                      <span className="availability-meter-booked" style={{ width: `${committedPercent}%` }} />
                      <span className="availability-meter-maintenance" style={{ width: `${maintenancePercent}%` }} />
                    </div>
                    <div className="availability-meter-labels">
                      <span>{committedPercent}% committed</span>
                      <span>{maintenancePercent}% out</span>
                    </div>
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>Total</dt>
                      <dd>{category.total_inventory}</dd>
                    </div>
                    <div>
                      <dt>Reserved stays</dt>
                      <dd>{category.reserved_room_stays}</dd>
                    </div>
                    <div>
                      <dt>Out of service</dt>
                      <dd>{category.out_of_service}</dd>
                    </div>
                    <div>
                      <dt>Starting rate</dt>
                      <dd>{category.lowest_rate == null ? '-' : formatCurrency(category.lowest_rate)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          {inventoryCalendar && (
            <div className="table-card">
              <div className="table-heading">
                <div>
                  <p className="eyebrow">Inventory calendar</p>
                  <h3>Per-night inventory rules</h3>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Room type</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Blocked</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th>Stop sell</th>
                    <th>Min stay</th>
                    <th>Max stay</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryCalendar.categories.flatMap((category) =>
                    category.rows.map((row) => (
                      <tr key={`${category.room_category_id}:${row.date}`}>
                        <td>{category.name}</td>
                        <td>{row.date}</td>
                        <td>{row.total_rooms}</td>
                        <td>{row.blocked_rooms}</td>
                        <td>{row.reserved_rooms}</td>
                        <td>{row.available_rooms}</td>
                        <td>
                          <span className={row.stop_sell ? 'status-pill error' : 'status-pill available'}>
                            {row.stop_sell ? 'Closed (internal only)' : 'Open'}
                          </span>
                        </td>
                        <td>{row.min_stay ?? '-'}</td>
                        <td>{row.max_stay ?? '-'}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-card availability-rate-posture-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Rate posture</p>
                <h3>
                  {availability.property_name}: {availability.from} to {availability.to}
                </h3>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Total</th>
                  <th>Booked</th>
                  <th>Out of service</th>
                  <th>Available</th>
                  <th>Starting rate</th>
                </tr>
              </thead>
              <tbody>
                {availability.categories.map((category) => (
                  <tr key={category.room_category_id}>
                    <td>{category.name}</td>
                    <td>{category.total_inventory}</td>
                    <td>{category.reserved_room_stays}</td>
                    <td>{category.out_of_service}</td>
                    <td>
                      <span className={category.available > 0 ? 'status-pill available' : 'status-pill occupied'}>
                        {category.available}
                      </span>
                    </td>
                    <td>{category.lowest_rate == null ? '-' : formatCurrency(category.lowest_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function readPersistedAvailabilityState(): PersistedAvailabilityState | null {
  try {
    const rawState = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    if (!rawState) {
      return null;
    }

    return JSON.parse(rawState) as PersistedAvailabilityState;
  } catch {
    localStorage.removeItem(AVAILABILITY_STORAGE_KEY);
    return null;
  }
}

function writePersistedAvailabilityState(state: PersistedAvailabilityState) {
  localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(state));
}

function SignalStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function buildDateRange(startDate: string, endDateExclusive: string) {
  if (!startDate || !endDateExclusive || startDate >= endDateExclusive) {
    return [];
  }

  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDateExclusive}T00:00:00.000Z`);

  while (current < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
