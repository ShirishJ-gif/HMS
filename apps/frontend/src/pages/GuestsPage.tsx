import { FormEvent, useDeferredValue, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Guest, Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { inputCls, labelCls } from './ui';

const defaultForm = { property_id: '', name: '', phone: '', email: '', id_proof: '', address: '' };

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
export function GuestsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const guestsState     = useAsync(async () => fetchAllPages<Guest>('/guests'), [reloadKey]);
  const feedState       = useAsync(async () => fetchAllPages<ReservationGroup>('/bookings/feed'), [reloadKey]);

  const properties    = propertiesState.data ?? [];
  const mergedGuests  = buildGuestDisplayRows(guestsState.data ?? [], feedState.data ?? []);

  const totalCount    = mergedGuests.length;
  const registryCount = mergedGuests.filter(g => g.source === 'GUEST_REGISTRY').length;
  const feedCount     = mergedGuests.filter(g => g.source === 'RESERVATION_FEED').length;
  const withEmail     = mergedGuests.filter(g => g.email).length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const deferredSearch              = useDeferredValue(search);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'GUEST_REGISTRY' | 'RESERVATION_FEED'>('ALL');
  const [propertyFilter, setPropertyFilter] = useState('ALL');

  const [showAdd, setShowAdd]       = useState(false);
  const [addMode, setAddMode]       = useState<'manual' | 'feed'>('manual');
  const [form, setForm]             = useState(defaultForm);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = mergedGuests.filter(g => {
    if (sourceFilter !== 'ALL' && g.source !== sourceFilter) return false;
    if (propertyFilter !== 'ALL' && g.property_id !== propertyFilter) return false;
    return matchesGuestSearch(g, deferredSearch);
  });

  const selected = mergedGuests.find(g => g.id === selectedId) ?? null;

  useEffect(() => {
    if (!actionStatus) return;
    const timeout = window.setTimeout(() => setActionStatus(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [actionStatus]);

  async function submitGuest(e: FormEvent) {
    e.preventDefault();
    setActionError(null); setActionStatus(null); setSubmitting(true);
    try {
      await api.post('/guests', { ...form, email: form.email || undefined });
      setForm(defaultForm);
      setActionStatus('Guest added successfully.');
      setReloadKey(v => v + 1);
      setShowAdd(false);
    } catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setSubmitting(false); }
  }

  function openAdd() {
    setShowAdd(true); setAddMode('manual'); setActionError(null); setActionStatus(null);
  }

  return (
    <div className="relative min-h-screen -mx-5 lg:-mx-8 -my-6 lg:-my-8 bg-[#f5f5f3] flex flex-col">

      {actionStatus && (
        <div className="pointer-events-none absolute right-5 top-20 z-20 lg:right-8">
          <div className="rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-[12.5px] font-semibold text-emerald-700 shadow-lg shadow-slate-900/10">
            {actionStatus}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-5 lg:px-8 pt-6 lg:pt-8 pb-4 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Guests</h1>
          <p className="text-[12px] text-slate-400 mt-1">Guest profiles from registry and reservation feed across all properties</p>
        </div>
        <button onClick={openAdd}
          className="mt-1 h-9 px-4 rounded-lg text-[12px] font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-2 flex-shrink-0 shadow-sm">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Add guest
        </button>
      </div>

      <div className="px-8 py-5 flex flex-col gap-4">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-4 gap-3">
          {([
            ['Total guests',     totalCount],
            ['Registry',         registryCount],
            ['Reservation feed', feedCount],
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
            <div className="flex-1 overflow-y-auto">
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
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

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

      {/* ── Add guest modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[540px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-0">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Guest registry</p>
                <h3 className="text-[17px] font-bold text-slate-900">Add guest</h3>
              </div>
              <button onClick={() => setShowAdd(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-0 px-6 mt-4 border-b border-slate-100">
              {([['manual', 'Manual entry'], ['feed', 'From reservation']] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => setAddMode(mode)}
                  className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors rounded-t
                    ${addMode === mode ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {addMode === 'manual' ? (
                <form id="add-guest-form" onSubmit={submitGuest}>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`${labelCls} col-span-2`}>
                      <span>Property</span>
                      <CustomSelect onChange={v => setForm({ ...form, property_id: v })}
                        options={properties.map(p => ({ label: p.name, value: p.id }))}
                        placeholder="Select property" value={form.property_id} />
                    </label>
                    <label className={labelCls}>
                      <span>Full name <span className="text-rose-400">*</span></span>
                      <input className={inputCls} required placeholder="Aarav Mehta"
                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </label>
                    <label className={labelCls}>
                      <span>Phone <span className="text-rose-400">*</span></span>
                      <input className={inputCls} required placeholder="+91 98765 43210"
                        value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                    </label>
                    <label className={labelCls}>
                      <span>Email</span>
                      <input className={inputCls} type="email" placeholder="guest@example.com"
                        value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </label>
                    <label className={labelCls}>
                      <span>ID proof <span className="text-rose-400">*</span></span>
                      <input className={inputCls} required placeholder="PASSPORT-M1234567"
                        value={form.id_proof} onChange={e => setForm({ ...form, id_proof: e.target.value })} />
                    </label>
                    <label className={`${labelCls} col-span-2`}>
                      <span>Address <span className="text-rose-400">*</span></span>
                      <textarea className={`${inputCls} min-h-[4rem] resize-none`} required
                        placeholder="Bandra West, Mumbai, Maharashtra 400050"
                        value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                    </label>
                  </div>
                  {actionError && (
                    <p className="mt-3 text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{actionError}</p>
                  )}
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
                    <svg className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <p className="text-[12px] text-sky-800 font-medium leading-relaxed">
                      Guests from the OTA reservation feed are automatically created when channel-manager reservations are imported. Use the list on the left to view and search them.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Look up by reservation ID</p>
                    <div className="flex gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="e.g. BKG-12345678" />
                      <button type="button"
                        className="h-9 px-4 rounded-lg text-[12px] font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors flex-shrink-0">
                        Look up
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Paste a reservation ID from your OTA channel to find and preview the associated guest record from the reservation feed.
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">Switch to manual entry?</p>
                    <button onClick={() => setAddMode('manual')}
                      className="h-9 px-4 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors">
                      Enter guest details manually →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
              <button onClick={() => setShowAdd(false)}
                className="h-9 px-4 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              {addMode === 'manual' && (
                <button form="add-guest-form" type="submit" disabled={submitting}
                  className="h-9 px-5 rounded-lg text-[12px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {submitting ? 'Adding…' : 'Add guest'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
