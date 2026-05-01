import { FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { Guest, Property } from '../api/types';
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

export function GuestsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const guestsState = useAsync(
    async () =>
      (
        await api.get<PaginatedResponse<Guest>>('/guests', {
          params: { search: search || undefined },
        })
      ).data,
    [reloadKey, search],
  );
  const propertiesState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } })).data),
    [reloadKey],
  );
  const properties = propertiesState.data ?? [];
  const guests = (guestsState.data?.data ?? []).filter((guest) =>
    propertyFilter === 'ALL' ? true : guest.property_id === propertyFilter,
  );

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
          <p className="eyebrow">Guest registry</p>
          <h2>Guests</h2>
          <p className="page-subtitle">Create guest profiles before assigning reservations.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submitGuest}>
        <label>
          Property
          <select
            onChange={(event) => setForm({ ...form, property_id: event.target.value })}
            required
            value={form.property_id}
          >
            <option value="">Select property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
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
          <select onChange={(event) => setPropertyFilter(event.target.value)} value={propertyFilter}>
            <option value="ALL">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      {(guestsState.loading || propertiesState.loading) && <p className="muted">Loading guests...</p>}
      {(guestsState.error || propertiesState.error) && <p className="error">{guestsState.error ?? propertiesState.error}</p>}

      <div className="table-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Guest records</p>
            <h3>{guestsState.data?.meta.total ?? guests.length} guests registered</h3>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
