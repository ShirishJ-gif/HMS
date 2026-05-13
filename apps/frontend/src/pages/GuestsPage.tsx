import { FormEvent, useDeferredValue, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Guest, Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';

const defaultForm = {
  property_id: '',
  name: '',
  phone: '',
  email: '',
  id_proof: '',
  address: '',
};

type DisplayGuest = {
  id: string;
  property_id: string;
  name: string;
  phone: string;
  email: string | null;
  id_proof: string;
  address: string;
  property?: { id: string; name: string; code: string };
  created_at?: string;
  updated_at?: string;
  source: 'GUEST_REGISTRY' | 'RESERVATION_FEED';
  import_blocked: boolean;
  import_error: string | null;
  reservation_ids: string[];
};

export function GuestsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const properties = propertiesState.data ?? [];

  async function submitGuest(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setActionStatus(null);
    setSubmitting(true);

    try {
      await api.post('/guests', {
        ...form,
        email: form.email || undefined,
      });
      setForm(defaultForm);
      setActionStatus('Guest created.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Guests</h2>
          <p className="page-subtitle">
            Maintain guest records used by OTA-imported reservations, repeat-stay operations, and front-desk verification.
          </p>
        </div>
      </div>

      <div className="info-strip">
        <strong>Guest profile scope</strong>
        <span>
          Guest records support reservation intake and stay operations. Preference tagging, blacklist workflows, and stay-history enrichments are future extensions.
        </span>
      </div>

      <form className="card form-grid" onSubmit={submitGuest}>
        <label>
          Property
          <CustomSelect
            onChange={(value) => setForm({ ...form, property_id: value })}
            options={properties.map((property) => ({
              label: property.name,
              value: property.id,
            }))}
            placeholder="Select property"
            value={form.property_id}
          />
        </label>
        <label>
          Name
          <input
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Aarav Mehta"
            required
            value={form.name}
          />
        </label>
        <label>
          Phone
          <input
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="+919876543210"
            required
            value={form.phone}
          />
        </label>
        <label>
          Email
          <input
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="guest@example.com"
            type="email"
            value={form.email}
          />
        </label>
        <label>
          ID proof
          <input
            onChange={(event) => setForm({ ...form, id_proof: event.target.value })}
            placeholder="PASSPORT-M1234567"
            required
            value={form.id_proof}
          />
        </label>
        <label className="wide-field">
          Address
          <textarea
            onChange={(event) => setForm({ ...form, address: event.target.value })}
            placeholder="Bandra West, Mumbai, Maharashtra"
            required
            value={form.address}
          />
        </label>
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Adding...' : 'Add guest'}
        </button>
      </form>

      {actionStatus && <p className="success">{actionStatus}</p>}
      {actionError && <p className="error">{actionError}</p>}
      <GuestRegistrySection properties={properties} reloadKey={reloadKey} />
    </section>
  );
}

function GuestRegistrySection({
  properties,
  reloadKey,
}: {
  properties: Property[];
  reloadKey: number;
}) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const guestsState = useAsync(async () => fetchAllPages<Guest>('/guests'), [reloadKey]);
  const reservationFeedState = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/feed'), [reloadKey]);
  const isInitialLoading =
    (guestsState.loading && guestsState.data == null) ||
    (reservationFeedState.loading && reservationFeedState.data == null);
  const isRefreshing = !isInitialLoading && (guestsState.loading || reservationFeedState.loading);
  const mergedGuests = buildGuestDisplayRows(guestsState.data ?? [], reservationFeedState.data ?? []);
  const guests = mergedGuests.filter((guest) => {
    if (propertyFilter !== 'ALL' && guest.property_id !== propertyFilter) {
      return false;
    }

    return matchesGuestSearch(guest, deferredSearch);
  });

  return (
    <>
      <FilterBar title="Guest filters">
        <label>
          Search guests
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, phone, email, or ID proof"
            value={search}
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
      </FilterBar>

      {isInitialLoading && <p className="muted">Loading guests...</p>}
      {isRefreshing && <p className="muted">Refreshing guests...</p>}
      {guestsState.error || reservationFeedState.error ? (
        <p className="error">{guestsState.error ?? reservationFeedState.error}</p>
      ) : null}

      <div className="table-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Guest registry</p>
            <h3>{guests.length} visible guest profiles</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Property</th>
              <th>Phone</th>
              <th>Email</th>
              <th>ID proof</th>
              <th>Address</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => (
              <tr key={guest.id}>
                <td>{guest.name}</td>
                <td>{guest.property?.name ?? '-'}</td>
                <td>{guest.phone}</td>
                <td>{guest.email ?? '-'}</td>
                <td>{guest.id_proof}</td>
                <td>{guest.address}</td>
                <td>
                  <strong>{guest.source === 'GUEST_REGISTRY' ? 'Registry' : 'Reservation feed'}</strong>
                  {guest.import_blocked ? (
                    <>
                      <br />
                      <span className="cell-note">{guest.import_error ?? 'Import blocked'}</span>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function buildGuestDisplayRows(guests: Guest[], reservationFeed: ReservationGroup[]): DisplayGuest[] {
  const bySignature = new Map<string, DisplayGuest>();

  for (const guest of guests) {
    const row: DisplayGuest = {
      ...guest,
      source: 'GUEST_REGISTRY',
      import_blocked: false,
      import_error: null,
      reservation_ids: [],
    };
    bySignature.set(guestSignature(row.property_id, row.name, row.phone, row.email), row);
  }

  for (const group of reservationFeed) {
    const guestName = group.primary_guest?.name?.trim();
    const guestPhone = group.primary_guest?.phone?.trim();
    const guestEmail = group.primary_guest?.email?.trim() ?? null;
    if (!guestName || !guestPhone) {
      continue;
    }

    const signature = guestSignature(group.property_id, guestName, guestPhone, guestEmail);
    const existing = bySignature.get(signature);
    if (existing) {
      existing.reservation_ids = Array.from(new Set([...existing.reservation_ids, group.external_reservation_id]));
      if (!existing.import_error && group.import_error) {
        existing.import_error = group.import_error;
      }
      existing.import_blocked = existing.import_blocked || Boolean(group.import_blocked);
      continue;
    }

    bySignature.set(signature, {
      id: `feed-guest:${signature}`,
      property_id: group.property_id,
      name: guestName,
      phone: guestPhone,
      email: guestEmail,
      id_proof: '-',
      address: group.import_blocked ? 'From provider reservation feed' : 'From reservation feed',
      property: group.property,
      source: 'RESERVATION_FEED',
      import_blocked: Boolean(group.import_blocked),
      import_error: group.import_error ?? null,
      reservation_ids: [group.external_reservation_id],
      created_at: group.created_at,
      updated_at: group.updated_at,
    });
  }

  return Array.from(bySignature.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function guestSignature(propertyId: string, name: string, phone: string, email: string | null) {
  return [propertyId, name.trim().toLowerCase(), phone.trim(), (email ?? '').trim().toLowerCase()].join('::');
}

function matchesGuestSearch(guest: DisplayGuest, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    guest.name,
    guest.phone,
    guest.email ?? '',
    guest.id_proof,
    guest.address,
    guest.property?.name ?? '',
    guest.property?.code ?? '',
    ...guest.reservation_ids,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}
