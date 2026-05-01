import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { AvailabilitySummary, Property } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';

export function AvailabilityPage() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [propertyId, setPropertyId] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(tomorrow);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [],
  );
  const properties = propertiesState.data ?? [];
  const totalInventory = availability?.categories.reduce((sum, category) => sum + category.total_inventory, 0) ?? 0;
  const totalBooked = availability?.categories.reduce((sum, category) => sum + category.booked, 0) ?? 0;
  const totalOutOfService = availability?.categories.reduce((sum, category) => sum + category.out_of_service, 0) ?? 0;
  const totalAvailable = availability?.categories.reduce((sum, category) => sum + category.available, 0) ?? 0;
  const sellThroughRate = totalInventory === 0 ? 0 : Math.round((totalBooked / totalInventory) * 100);
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
      const response = await api.get<AvailabilitySummary>('/availability', {
        params: {
          property_id: propertyId,
          from,
          to,
        },
      });
      setAvailability(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load availability');
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
              <SignalStat label="Booked" value={totalBooked} />
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
        </aside>
      </div>

      {propertiesState.loading && <p className="muted">Loading properties...</p>}
      {(propertiesState.error || error) && <p className="error">{propertiesState.error ?? error}</p>}

      {availability && (
        <>
          <div className="info-strip">
            <strong>Commercial view</strong>
            <span>
              {sellThroughRate}% of inventory is already committed in this window. Use the category board below to see which room groups still have clean sellable depth.
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
              <strong>{totalBooked} booked rooms</strong>
              <span>{totalAvailable} still sellable in this search window</span>
            </article>
          </div>

          <div className="availability-category-grid">
            {availability.categories.map((category) => {
              const committedPercent =
                category.total_inventory === 0 ? 0 : Math.min(100, Math.round((category.booked / category.total_inventory) * 100));
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
                      <span>{committedPercent}% booked</span>
                      <span>{maintenancePercent}% out</span>
                    </div>
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>Total</dt>
                      <dd>{category.total_inventory}</dd>
                    </div>
                    <div>
                      <dt>Booked</dt>
                      <dd>{category.booked}</dd>
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
                    <td>{category.booked}</td>
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
