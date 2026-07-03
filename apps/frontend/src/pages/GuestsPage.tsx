import { useDeferredValue, useEffect, useState } from 'react';
import { fetchAllPages } from '../api/pagination';
import { Guest, Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';

type DisplayGuest = {
  id: string; property_id: string; name: string; phone: string; email: string | null;
  id_proof: string; address: string; property?: { id: string; name: string; code: string };
  created_at?: string; updated_at?: string;
  source: 'GUEST_REGISTRY' | 'RESERVATION_FEED';
  import_blocked: boolean; import_error: string | null; reservation_ids: string[];
};

/* ── Avatar helpers ── */
const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

function avatarColor(id: string) {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Detail field ── */
const FIELD_ICONS: Record<string, JSX.Element> = {
  phone: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 5.9 5.9l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  email: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  id:    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M8 10h.01M8 14h.01M12 10h4M12 14h4"/></svg>,
  map:   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
};

function GuestDetailField({ icon, label, value, mono }: { icon: string; label: string; value: string; mono: boolean }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="flex items-center gap-1.5 mb-1.5 text-slate-400">
        {FIELD_ICONS[icon]}
        <span className="text-[9.5px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-[12.5px] font-semibold text-slate-700 leading-snug ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</p>
    </div>
  );
}

/* ══ Main page ══ */
export function GuestsPage({ activePropertyId = '' }: { activePropertyId?: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const guestsState     = useAsync(async () => fetchAllPages<Guest>('/guests'), [reloadKey]);
  const feedState       = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/feed'), [reloadKey]);

  const properties    = propertiesState.data ?? [];
  const mergedGuests  = buildGuestDisplayRows(guestsState.data ?? [], feedState.data ?? []);
  const totalCount    = mergedGuests.length;
  const feedCount     = mergedGuests.filter(g => g.source === 'RESERVATION_FEED').length;
  const withEmail     = mergedGuests.filter(g => g.email).length;
  const repeatGuests  = mergedGuests.filter(g => g.reservation_ids.length > 1).length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const deferredSearch              = useDeferredValue(search);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'GUEST_REGISTRY' | 'RESERVATION_FEED'>('ALL');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'ALL');

  const filtered = mergedGuests.filter(g => {
    if (sourceFilter !== 'ALL' && g.source !== sourceFilter) return false;
    if (propertyFilter !== 'ALL' && g.property_id !== propertyFilter) return false;
    return matchesGuestSearch(g, deferredSearch);
  });

  const selected = filtered.find(g => g.id === selectedId) ?? null;
  const filteredIds = filtered.map(g => g.id).join('|');

  useEffect(() => {
    if (activePropertyId) setPropertyFilter(activePropertyId);
  }, [activePropertyId]);

  useEffect(() => {
    if (selectedId && filtered.some(g => g.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filteredIds, selectedId]);

  return (
    <div className="relative min-h-screen -mx-5 lg:-mx-8 -my-6 lg:-my-8 bg-[#f5f5f3] flex flex-col">
      {/* ── Header ── */}
      <div className="px-5 lg:px-8 pt-6 lg:pt-8 pb-4 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Guests</h1>
          <p className="text-[12px] text-slate-400 mt-1">Search guest contacts, IDs, and reservation-linked profiles across properties</p>
        </div>
      </div>

      <div className="px-5 lg:px-8 py-5 flex flex-col gap-4">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            ['Total guests',     totalCount],
            ['Reservation feed', feedCount],
            ['Repeat guests',    repeatGuests],
            ['With email',       withEmail],
          ] as [string, number][]).map(([label, val]) => (
            <div key={label} className="bg-white rounded-xl border border-black/[0.06] px-4 py-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
              <p className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">{val}</p>
            </div>
          ))}
        </div>

        {/* ── Filter row ── */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone, email…"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-black/[0.07] text-[12.5px] text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-200 transition-all" />
          </div>
          <div className="w-[220px] max-w-full">
            <CustomSelect
              onChange={value => setSourceFilter(value as typeof sourceFilter)}
              value={sourceFilter}
              options={[
                { label: 'All profiles', value: 'ALL' },
                { label: 'Registry', value: 'GUEST_REGISTRY' },
                { label: 'Reservation feed', value: 'RESERVATION_FEED' },
              ]}
            />
          </div>
          {properties.length > 1 && (
            <div className="w-[260px] max-w-full">
              <CustomSelect onChange={setPropertyFilter} value={propertyFilter}
                options={[{ label: 'All properties', value: 'ALL' }, ...properties.map(p => ({ label: p.name, value: p.id }))]} />
            </div>
          )}
          <span className="ml-auto text-[11px] text-slate-400 flex-shrink-0">{filtered.length} profiles</span>
        </div>

        {/* ── Split panel ── */}
        <div className="flex gap-3" style={{ height: 580 }}>

          {/* Guest list */}
          <div className="flex flex-col bg-white rounded-xl border border-black/[0.06] overflow-hidden flex-shrink-0" style={{ width: 340 }}>
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-100">
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">{filtered.length} guest{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-none">
              {(guestsState.loading && !guestsState.data) && (
                <div className="px-4 py-10 text-center text-[12px] text-slate-400">Loading guests…</div>
              )}
              {!guestsState.loading && filtered.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] font-medium text-slate-400">No guests match your filters</p>
                </div>
              )}
              {filtered.map(g => {
                const isSel = g.id === selectedId;
                return (
                  <button key={g.id} onClick={() => setSelectedId(g.id)}
                    className={`w-full text-left px-4 py-3.5 border-b border-slate-50 flex items-start gap-3 transition-colors ${isSel ? 'bg-slate-100' : 'hover:bg-slate-50/70'}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 ${avatarColor(g.id)} ${isSel ? 'ring-2 ring-slate-300' : ''}`}>
                      {initials(g.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-[13px] font-bold leading-tight truncate ${isSel ? 'text-slate-900' : 'text-slate-800'}`}>{g.name}</p>
                        {g.import_blocked && (
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center" title="Import blocked">
                            <svg className="w-2.5 h-2.5 text-rose-500" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01"/>
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{g.phone}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold ${g.source === 'GUEST_REGISTRY' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>
                          {g.source === 'GUEST_REGISTRY' ? 'Registry' : 'Feed'}
                        </span>
                        {g.property?.code && <span className="text-[9.5px] text-slate-400 font-medium">{g.property.code}</span>}
                        {g.reservation_ids.length > 0 && (
                          <span className="text-[9.5px] text-slate-400 font-medium">· {g.reservation_ids.length} stay{g.reservation_ids.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="flex-1 bg-white rounded-xl border border-black/[0.06] overflow-hidden flex flex-col min-w-0">
              {/* Header */}
              <div className="flex-shrink-0 px-6 py-5 border-b border-slate-100" style={{ background: '#f9f8f6' }}>
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[16px] font-extrabold flex-shrink-0 ${avatarColor(selected.id)}`}>
                    {initials(selected.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[20px] font-bold text-slate-900 tracking-tight leading-tight">{selected.name}</h2>
                      {selected.import_blocked && (
                        <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Blocked</span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-slate-500 mt-0.5">{selected.property?.name ?? '—'}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${selected.source === 'GUEST_REGISTRY' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>
                        {selected.source === 'GUEST_REGISTRY' ? 'Registry' : 'Reservation feed'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto scrollbar-none p-6 space-y-5">

                {/* Contact */}
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">Contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <GuestDetailField icon="phone" label="Phone"    value={selected.phone}            mono={false} />
                    <GuestDetailField icon="email" label="Email"    value={selected.email ?? '—'}     mono={false} />
                    <GuestDetailField icon="id"    label="ID proof" value={selected.id_proof}         mono />
                    <GuestDetailField icon="map"   label="Address"  value={selected.address}          mono={false} />
                  </div>
                </div>

                {/* Stay summary */}
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">Stay history</p>
                  <div className="flex gap-3">
                    <div className="flex-1 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Total stays</p>
                      <p className="text-[22px] font-extrabold text-slate-900 leading-none">{selected.reservation_ids.length}</p>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Source</p>
                      <p className="text-[12px] font-bold text-slate-700 leading-none mt-1">
                        {selected.source === 'GUEST_REGISTRY' ? 'Manual registry' : 'Reservation feed'}
                      </p>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Property</p>
                      <p className="text-[12px] font-bold text-slate-700 leading-none mt-1">{selected.property?.code ?? '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Reservation IDs */}
                {selected.reservation_ids.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Reservation IDs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.reservation_ids.map(rid => (
                        <span key={rid} className="font-mono text-[10.5px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600">{rid}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blocked warning */}
                {selected.import_blocked && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex gap-2.5">
                    <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                    </svg>
                    <div>
                      <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-0.5">Import blocked</p>
                      <p className="text-[12px] text-rose-600 font-medium leading-relaxed">
                        {selected.import_error ?? 'This guest came from a blocked OTA provider reservation. Review the channel manager for details.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-xl border border-black/[0.06] flex items-center justify-center min-w-0">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-slate-600">Select a guest to view details</p>
                <p className="text-[11px] text-slate-400 mt-1">{filtered.length} profile{filtered.length !== 1 ? 's' : ''} available</p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/* ── Business logic helpers (unchanged) ── */
function buildGuestDisplayRows(guests: Guest[], reservationFeed: ReservationGroup[]): DisplayGuest[] {
  const bySignature = new Map<string, DisplayGuest>();
  for (const guest of guests) {
    const row: DisplayGuest = { ...guest, source: 'GUEST_REGISTRY', import_blocked: false, import_error: null, reservation_ids: [] };
    bySignature.set(guestSignature(row.property_id, row.name, row.phone, row.email), row);
  }
  for (const group of reservationFeed) {
    const guestName  = group.primary_guest?.name?.trim();
    const guestPhone = group.primary_guest?.phone?.trim();
    const guestEmail = group.primary_guest?.email?.trim() ?? null;
    if (!guestName || !guestPhone) continue;
    const signature = guestSignature(group.property_id, guestName, guestPhone, guestEmail);
    const existing  = bySignature.get(signature);
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
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [guest.name, guest.phone, guest.email ?? '', guest.id_proof, guest.address, guest.property?.name ?? '', guest.property?.code ?? '', ...guest.reservation_ids]
    .join(' ').toLowerCase().includes(q);
}
