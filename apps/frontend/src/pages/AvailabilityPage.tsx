import { FormEvent, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { AvailabilitySummary, InventoryCalendarSummary, Property, RoomCategory } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

export function AvailabilityPage() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [propertyId, setPropertyId] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(tomorrow);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(null);
  const [inventoryCalendar, setInventoryCalendar] = useState<InventoryCalendarSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [restrictionForm, setRestrictionForm] = useState({
    room_category_id: '',
    from_date: today,
    to_date: today,
    stop_sell: false,
    min_stay: '',
    max_stay: '',
  });
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const categoriesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<RoomCategory>>('/room-categories', { params: { limit: 200 } })).data),
    [],
  );
  const properties = propertiesState.data ?? [];
  const roomCategories = categoriesState.data ?? [];
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
  const topAvailableCategory = availability?.categories.reduce<AvailabilitySummary['categories'][number] | null>(
    (currentTop, category) => (!currentTop || category.available > currentTop.available ? category : currentTop),
    null,
  );

  async function loadAvailability(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const [availabilityResponse, inventoryResponse] = await Promise.all([
        api.get<AvailabilitySummary>('/availability', {
          params: {
            property_id: propertyId,
            from,
            to,
          },
        }),
        api.get<InventoryCalendarSummary>('/inventory-calendar', {
          params: {
            property_id: propertyId,
            from,
            to: previousDate(to),
          },
        }),
      ]);
      setAvailability(availabilityResponse.data);
      setInventoryCalendar(inventoryResponse.data);
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
      if (propertyId) {
        const inventoryResponse = await api.get<InventoryCalendarSummary>('/inventory-calendar', {
          params: {
            property_id: propertyId,
            from,
            to: previousDate(to),
          },
        });
        setInventoryCalendar(inventoryResponse.data);
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
          <p className="eyebrow">Inventory control</p>
          <h2>Availability</h2>
          <p className="page-subtitle">Review category-level sellable inventory before exposing rooms to OTAs.</p>
        </div>
      </div>

      <div className="booking-layout">
        <form className="card booking-form-card" onSubmit={loadAvailability}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Search window</p>
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

        <aside className="booking-sidepanel">
          <div className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Window posture</p>
                <h3>Inventory snapshot</h3>
              </div>
            </div>
            <div className="compact-signal-grid">
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
            </dl>
          </div>

          <div className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Ownership</p>
                <h3>Inventory source</h3>
              </div>
            </div>
            <ul className="attention-list">
              <li>
                <strong>HMS-owned</strong>
                <span>Physical room counts, maintenance holds, and reserved room-stay depletion are calculated in HMS.</span>
              </li>
              <li>
                <strong>Channel reflection</strong>
                <span>Zodomus and OTAs should reflect the sellable inventory that HMS computes here.</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {propertiesState.loading && <p className="muted">Loading properties...</p>}
      {categoriesState.loading && <p className="muted">Loading room types...</p>}
      {(propertiesState.error || categoriesState.error || error) && <p className="error">{propertiesState.error ?? categoriesState.error ?? error}</p>}
      {actionStatus && <p className="success">{actionStatus}</p>}
      {actionError && <p className="error">{actionError}</p>}
      <div className="info-strip">
        <strong>Restriction scope</strong>
        <span>
          Stop-sell, minimum stay, and maximum stay are enforced inside HMS now, but they are <strong>not synced to Zodomus yet</strong>. Treat them as internal-only controls until provider-side restriction sync is confirmed.
        </span>
      </div>

      {availability && (
        <>
          <div className="info-strip">
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

          <div className="availability-summary-grid">
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
          </div>

          <div className="booking-layout restriction-layout">
            <form className="card booking-form-card" onSubmit={submitRestrictions}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Selling rules</p>
                  <h3>Restriction management</h3>
                </div>
                <span className="cell-note">Internal only. Not synced to Zodomus yet.</span>
              </div>
              <div className="booking-form-grid">
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

            <aside className="booking-sidepanel">
              <div className="insight-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">How rules work</p>
                    <h3>Operational effect</h3>
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
                </ul>
              </div>
            </aside>
          </div>

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
                  <p className="eyebrow">Restriction calendar</p>
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

          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Sellable inventory</p>
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
