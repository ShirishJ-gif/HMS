import { FormEvent, useDeferredValue, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Guest, Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';
import { inputCls, labelCls, primaryBtn, secondaryBtn, Td, Th } from './ui';

const defaultForm = { property_id: '', name: '', phone: '', email: '', id_proof: '', address: '' };

type DisplayGuest = {
  id: string; property_id: string; name: string; phone: string; email: string | null;
  id_proof: string; address: string; property?: { id: string; name: string; code: string };
  created_at?: string; updated_at?: string;
  source: 'GUEST_REGISTRY' | 'RESERVATION_FEED'; import_blocked: boolean; import_error: string | null; reservation_ids: string[];
};
type AsyncDataState<T> = { data: T | null; error: string | null; loading: boolean };

export function GuestsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const guestsState = useAsync(async () => fetchAllPages<Guest>('/guests'), [reloadKey]);
  const reservationFeedState = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/feed'), [reloadKey]);
  const properties = propertiesState.data ?? [];
  const selectedFormProperty = properties.find((property) => property.id === form.property_id) ?? null;
  const mergedGuests = buildGuestDisplayRows(guestsState.data ?? [], reservationFeedState.data ?? []);
  const registryGuestCount = mergedGuests.filter((guest) => guest.source === 'GUEST_REGISTRY').length;
  const feedGuestCount = mergedGuests.filter((guest) => guest.source === 'RESERVATION_FEED').length;
  const blockedGuestCount = mergedGuests.filter((guest) => guest.import_blocked).length;
  const guestsWithEmailCount = mergedGuests.filter((guest) => guest.email).length;

  async function submitGuest(event: FormEvent) {
    event.preventDefault(); setActionError(null); setActionStatus(null); setSubmitting(true);
    try {
      await api.post('/guests', { ...form, email: form.email || undefined });
      setForm(defaultForm); setActionStatus('Guest created.'); setReloadKey((v) => v + 1);
    } catch (error) { setActionError(getApiErrorMessage(error)); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Operations</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Guests</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Maintain guest records used by OTA-imported reservations, repeat-stay operations, and front-desk verification.
        </p>
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">Guest profile scope</strong>
        <span className="text-slate-500 leading-relaxed">Guest records support reservation intake and stay operations. Preference tagging, blacklist workflows, and stay-history enrichments are future extensions.</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,46rem)_18rem] gap-5 items-start max-w-[66rem]">
        <form onSubmit={submitGuest} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Guest registry</p>
            <h3 className="text-sm font-bold text-slate-900">Add guest</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <label className={labelCls}>
              <span>Property</span>
              <CustomSelect onChange={(v) => setForm({ ...form, property_id: v })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={form.property_id} />
            </label>
            <label className={labelCls}>
              <span>Name</span>
              <input className={inputCls} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aarav Mehta" required value={form.name} />
            </label>
            <label className={labelCls}>
              <span>Phone</span>
              <input className={inputCls} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+919876543210" required value={form.phone} />
            </label>
            <label className={labelCls}>
              <span>Email</span>
              <input className={inputCls} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="guest@example.com" type="email" value={form.email} />
            </label>
            <label className={labelCls}>
              <span>ID proof</span>
              <input className={inputCls} onChange={(e) => setForm({ ...form, id_proof: e.target.value })} placeholder="PASSPORT-M1234567" required value={form.id_proof} />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              <span>Address</span>
              <textarea className={`${inputCls} min-h-[5rem] resize-y`} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Bandra West, Mumbai, Maharashtra" required value={form.address} />
            </label>
          </div>
          <div className="mt-4">
            <button className={`${primaryBtn} w-40 justify-center text-center`} disabled={submitting} type="submit">{submitting ? 'Adding…' : 'Add guest'}</button>
          </div>
        </form>

        <aside className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Registry summary</p>
            <h3 className="text-sm font-bold text-slate-900">{mergedGuests.length} guest profiles</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Registry', value: registryGuestCount },
              { label: 'Feed', value: feedGuestCount },
              { label: 'Blocked', value: blockedGuestCount },
              { label: 'Email', value: guestsWithEmailCount },
            ].map((row) => (
              <div key={row.label} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{row.label}</span>
                <strong className="text-lg font-extrabold text-slate-900 leading-none">{row.value}</strong>
              </div>
            ))}
          </div>
          <div className={`mt-16 ${blockedGuestCount > 0 ? 'bg-rose-50 border border-rose-200 rounded-xl p-3' : 'bg-emerald-50 border border-emerald-200 rounded-xl p-3'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${blockedGuestCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>Import posture</p>
            <p className={`text-xs font-semibold leading-relaxed ${blockedGuestCount > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
              {blockedGuestCount > 0 ? `${blockedGuestCount} guest profile${blockedGuestCount === 1 ? '' : 's'} came from blocked provider reservations.` : 'No blocked reservation-feed guests in the current registry.'}
            </p>
          </div>
        </aside>
      </div>

      {actionStatus && <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">{actionStatus}</p>}
      {actionError && <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{actionError}</p>}

      <GuestRegistrySection guestsState={guestsState} properties={properties} reservationFeedState={reservationFeedState} />
    </section>
  );
}

function GuestRegistrySection({ guestsState, properties, reservationFeedState }: { guestsState: AsyncDataState<Guest[]>; properties: Property[]; reservationFeedState: AsyncDataState<ReservationGroup[]> }) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const isInitialLoading = (guestsState.loading && guestsState.data == null) || (reservationFeedState.loading && reservationFeedState.data == null);
  const mergedGuests = buildGuestDisplayRows(guestsState.data ?? [], reservationFeedState.data ?? []);
  const guests = mergedGuests.filter((guest) => {
    if (propertyFilter !== 'ALL' && guest.property_id !== propertyFilter) return false;
    return matchesGuestSearch(guest, deferredSearch);
  });

  return (
    <>
      <FilterBar title="Guest filters">
        <label className={`${labelCls} min-w-[16rem] lg:w-[20rem]`}>
          <span>Search guests</span>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
            </svg>
            <input className={`${inputCls} pl-9`} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, email, or ID proof" type="search" value={search} />
          </div>
        </label>
        <label className={`${labelCls} min-w-[13rem] lg:w-[16rem]`}>
          <span>Property</span>
          <CustomSelect onChange={setPropertyFilter} options={[{ label: 'All properties', value: 'ALL' }, ...properties.map((p) => ({ label: p.name, value: p.id }))]} value={propertyFilter} />
        </label>
      </FilterBar>

      {isInitialLoading && <p className="text-sm text-slate-400">Loading guests…</p>}
      {(guestsState.error || reservationFeedState.error) && (
        <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{guestsState.error ?? reservationFeedState.error}</p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Guest registry</p>
            <h3 className="text-sm font-bold text-slate-900">{guests.length} visible guest profiles</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <Th>Name</Th><Th>Property</Th><Th>Phone</Th><Th>Email</Th><Th>ID proof</Th><Th>Address</Th><Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {guests.map((guest) => (
                <tr key={guest.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                  <Td className="font-semibold text-slate-900">{guest.name}</Td>
                  <Td>{guest.property?.name ?? '—'}</Td>
                  <Td>{guest.phone}</Td>
                  <Td>{guest.email ?? '—'}</Td>
                  <Td className="font-mono text-xs">{guest.id_proof}</Td>
                  <Td className="max-w-[160px] truncate">{guest.address}</Td>
                  <Td>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${guest.source === 'GUEST_REGISTRY' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>
                      {guest.source === 'GUEST_REGISTRY' ? 'Registry' : 'Reservation feed'}
                    </span>
                    {guest.import_blocked && <p className="text-[11px] text-rose-500 font-semibold mt-0.5">{guest.import_error ?? 'Import blocked'}</p>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function buildGuestDisplayRows(guests: Guest[], reservationFeed: ReservationGroup[]): DisplayGuest[] {
  const bySignature = new Map<string, DisplayGuest>();
  for (const guest of guests) {
    const row: DisplayGuest = { ...guest, source: 'GUEST_REGISTRY', import_blocked: false, import_error: null, reservation_ids: [] };
    bySignature.set(guestSignature(row.property_id, row.name, row.phone, row.email), row);
  }
  for (const group of reservationFeed) {
    const guestName = group.primary_guest?.name?.trim();
    const guestPhone = group.primary_guest?.phone?.trim();
    const guestEmail = group.primary_guest?.email?.trim() ?? null;
    if (!guestName || !guestPhone) continue;
    const signature = guestSignature(group.property_id, guestName, guestPhone, guestEmail);
    const existing = bySignature.get(signature);
    if (existing) {
      existing.reservation_ids = Array.from(new Set([...existing.reservation_ids, group.external_reservation_id]));
      if (!existing.import_error && group.import_error) existing.import_error = group.import_error;
      existing.import_blocked = existing.import_blocked || Boolean(group.import_blocked);
      continue;
    }
    bySignature.set(signature, {
      id: `feed-guest:${signature}`, property_id: group.property_id, name: guestName, phone: guestPhone, email: guestEmail,
      id_proof: '-', address: group.import_blocked ? 'From provider reservation feed' : 'From reservation feed',
      property: group.property, source: 'RESERVATION_FEED', import_blocked: Boolean(group.import_blocked),
      import_error: group.import_error ?? null, reservation_ids: [group.external_reservation_id],
      created_at: group.created_at, updated_at: group.updated_at,
    });
  }
  return Array.from(bySignature.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function guestSignature(propertyId: string, name: string, phone: string, email: string | null) {
  return [propertyId, name.trim().toLowerCase(), phone.trim(), (email ?? '').trim().toLowerCase()].join('::');
}

function matchesGuestSearch(guest: DisplayGuest, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [guest.name, guest.phone, guest.email ?? '', guest.id_proof, guest.address, guest.property?.name ?? '', guest.property?.code ?? '', ...guest.reservation_ids].join(' ').toLowerCase().includes(query);
}
