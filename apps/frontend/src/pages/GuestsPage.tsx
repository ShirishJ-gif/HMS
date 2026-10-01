import { ArrowUpRight, CalendarDays, Building2, ChevronDown, ChevronLeft, ChevronRight, Mail, MapPin, Phone, Plus, Users, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, getApiErrorMessage } from '../api/client';
import { Property } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { DelayedSpinnerOverlay } from '../components/Spinner';
import { ActionBtn, ErrorMsg, SearchInput, inputCls, labelCls } from './ui';

type DisplayGuest = {
  id: string; property_id: string; name: string; phone: string; email: string | null;
  id_proof: string; address: string; property?: { id: string; name: string; code: string };
  created_at?: string; updated_at?: string;
  source: 'GUEST_REGISTRY' | 'RESERVATION_FEED';
  import_blocked: boolean; import_error: string | null; reservation_ids: string[];
};

type GuestDirectoryResponse = {
  guests: DisplayGuest[];
  meta: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
  properties: Property[];
  summary: {
    reservation_feed: number;
    repeat_guests: number;
    total_guests: number;
    with_email: number;
  };
};

const guestPageLimit = 50;
const guestSearchDebounceMs = 550;
const emptyGuestForm = {
  property_id: '',
  name: '',
  phone: '',
  email: '',
  id_proof: '',
  address: '',
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

/* ══ Main page ══ */
export function GuestsPage({ activePropertyId = '' }: { activePropertyId?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'GUEST_REGISTRY' | 'RESERVATION_FEED'>('ALL');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'ALL');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [directory, setDirectory] = useState<GuestDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestForm, setGuestForm] = useState(emptyGuestForm);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestFormError, setGuestFormError] = useState<string | null>(null);

  const properties = directory?.properties ?? [];
  const guests = directory?.guests ?? [];
  const meta = directory?.meta ?? { limit: guestPageLimit, page: 1, total: 0, total_pages: 1 };
  const guestIds = guests.map(g => g.id).join('|');

  useEffect(() => {
    if (activePropertyId) setPropertyFilter(activePropertyId);
    if (activePropertyId) setGuestForm(current => ({ ...current, property_id: activePropertyId }));
  }, [activePropertyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, guestSearchDebounceMs);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [propertyFilter, sourceFilter]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadDirectory() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<GuestDirectoryResponse>('/guests/directory', {
          params: {
            limit: guestPageLimit,
            page,
            property_id: propertyFilter,
            search: debouncedSearch.trim() || undefined,
            source: sourceFilter,
          },
          signal: controller.signal,
        });
        if (!active) return;
        setDirectory(response.data);
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;
        setError(getApiErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDirectory();

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch, page, propertyFilter, sourceFilter]);

  useEffect(() => {
    if (selectedId && guests.some(g => g.id === selectedId)) return;
    setSelectedId(null);
  }, [guestIds, selectedId]);

  async function createGuest(event: FormEvent) {
    event.preventDefault();
    setGuestFormError(null);
    const formPropertyId = activePropertyId || (propertyFilter !== 'ALL' ? propertyFilter : '') || guestForm.property_id;
    if (!formPropertyId) {
      setGuestFormError('Select a property from the top bar or property filter first.');
      return;
    }
    if (!guestForm.name.trim() || !guestForm.phone.trim()) {
      setGuestFormError('Name and phone are required.');
      return;
    }

    setGuestSubmitting(true);
    try {
      await api.post('/guests', {
        property_id: formPropertyId,
        name: guestForm.name.trim(),
        phone: guestForm.phone.trim(),
        email: guestForm.email.trim() || undefined,
        id_proof: 'Not provided',
        address: 'Not provided',
      });
      setGuestForm({ ...emptyGuestForm, property_id: formPropertyId });
      setShowAddGuest(false);
      setSourceFilter('GUEST_REGISTRY');
      setPage(1);
      setDirectory(null);
      setLoading(true);
      const response = await api.get<GuestDirectoryResponse>('/guests/directory', {
        params: {
          limit: guestPageLimit,
          page: 1,
          property_id: formPropertyId,
          source: 'GUEST_REGISTRY',
        },
      });
      setDirectory(response.data);
    } catch (saveError) {
      setGuestFormError(getApiErrorMessage(saveError));
    } finally {
      setGuestSubmitting(false);
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen -mx-5 lg:-mx-8 -my-6 lg:-my-8 bg-[#f5f5f3] flex flex-col tracking-normal [&_*]:tracking-normal">
      <DelayedSpinnerOverlay loading={loading} />
      {/* ── Header ── */}
      <div className="px-5 lg:px-8 pt-6 lg:pt-8 pb-4 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Guests</h1>
          <p className="text-[12px] text-slate-400 mt-1">Guest directory</p>
        </div>
        <ActionBtn variant="primary" onClick={() => {
          setGuestForm(current => ({ ...current, property_id: activePropertyId || (propertyFilter !== 'ALL' ? propertyFilter : current.property_id) }));
          setGuestFormError(null);
          setShowAddGuest(true);
        }}>
          <Plus size={15} />
          Add guest
        </ActionBtn>
      </div>

      <div className="px-5 lg:px-8 py-5 flex flex-col gap-4">
        {showAddGuest && (
          <AddGuestDialog busy={guestSubmitting} onClose={() => setShowAddGuest(false)}>
            <form onSubmit={createGuest}>
              <fieldset disabled={guestSubmitting} className="space-y-4 p-5">
                {guestFormError && <ErrorMsg>{guestFormError}</ErrorMsg>}
                {!activePropertyId && propertyFilter === 'ALL' ? (
                  <label className={labelCls}>
                    <span>Property</span>
                    <select required className={inputCls} value={guestForm.property_id} onChange={event => setGuestForm(current => ({ ...current, property_id: event.target.value }))}>
                      <option value="">Select property</option>
                      {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
                    </select>
                  </label>
                ) : <p className="text-xs text-slate-500">{properties.find(property => property.id === (activePropertyId || propertyFilter))?.name}</p>}
                <label className={labelCls}>
                  <span>Name <span className="text-rose-500">*</span></span>
                  <input autoFocus required autoComplete="name" className={inputCls} value={guestForm.name} onChange={event => setGuestForm(current => ({ ...current, name: event.target.value }))} />
                </label>
                <label className={labelCls}>
                  <span>Phone <span className="text-rose-500">*</span></span>
                  <input required type="tel" autoComplete="tel" className={inputCls} value={guestForm.phone} onChange={event => setGuestForm(current => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className={labelCls}>
                  <span>Email <span className="font-normal text-slate-400">(optional)</span></span>
                  <input className={inputCls} type="email" autoComplete="email" value={guestForm.email} onChange={event => setGuestForm(current => ({ ...current, email: event.target.value }))} />
                </label>
              </fieldset>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <ActionBtn disabled={guestSubmitting} onClick={() => setShowAddGuest(false)}>Cancel</ActionBtn>
                <ActionBtn type="submit" variant="primary" disabled={guestSubmitting}>{guestSubmitting ? 'Saving...' : 'Save guest'}</ActionBtn>
              </div>
            </form>
          </AddGuestDialog>
        )}

        {/* ── Filter row ── */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Name, phone, email…"
            className="relative w-64"
          />
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
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <h2 className="text-sm font-semibold text-slate-800">Guest profiles <span className="ml-2 text-slate-400 font-normal">{meta.total.toLocaleString()}</span></h2>
          {meta.total > 0 && <p className="text-xs text-slate-500">{(meta.page - 1) * meta.limit + 1}-{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</p>}
        </div>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        {!loading && !error && guests.length === 0 && (
          <div className="py-16 text-center border-y border-slate-200">
            <Users size={32} className="mx-auto mb-3 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">No guests found</h3>
            <button type="button" onClick={() => { setSearch(''); setSourceFilter('ALL'); setPropertyFilter(activePropertyId || 'ALL'); }} className="mt-3 text-sm font-semibold text-slate-600 hover:text-slate-900">Clear filters</button>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] items-start gap-4" aria-busy={loading}>
          {guests.map(g => {
            const expanded = selectedId === g.id;
            return (
              <article key={g.id} className={`min-w-0 overflow-hidden rounded-lg border bg-white transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5 focus-within:border-slate-300 focus-within:shadow-md motion-reduce:hover:translate-y-0 motion-reduce:transition-none ${expanded ? 'border-slate-300' : 'border-black/[0.06]'}`}>
                <button type="button" className="group/guest block w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-400" aria-expanded={expanded} aria-controls={`guest-details-${g.id}`} aria-label={`${expanded ? 'Close' : 'View'} profile for ${g.name}`} onClick={() => setSelectedId(expanded ? null : g.id)}>
                  <div className="relative h-[76px] border-b border-black/[0.04] bg-[#f5f5f3] px-5 pt-4">
                    <div className="flex justify-end">
                      <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold ${g.source === 'GUEST_REGISTRY' ? 'bg-white text-slate-600' : 'bg-sky-50 text-sky-700'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${g.source === 'GUEST_REGISTRY' ? 'bg-slate-400' : 'bg-sky-500'}`} />
                        {g.source === 'GUEST_REGISTRY' ? 'Registry' : 'Reservation feed'}
                      </span>
                    </div>
                    <div className={`absolute left-5 top-9 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white text-lg font-bold shadow-sm transition-transform duration-200 group-hover/guest:scale-105 motion-reduce:transition-none ${avatarColor(g.id)}`}>{initials(g.name)}</div>
                  </div>
                  <div className="px-5 pb-4 pt-9">
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900" title={g.name}>{g.name}</h3>
                      {g.import_blocked && <span className="shrink-0 rounded bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">Blocked</span>}
                      {!g.import_blocked && g.reservation_ids.length > 1 && <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Repeat guest</span>}
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500"><Building2 size={13} className="shrink-0" /><span className="truncate" title={g.property?.name}>{g.property?.name || 'No property assigned'}</span></p>
                    <div className="mt-5 space-y-3 text-xs text-slate-600">
                      <p className="flex items-center gap-2.5"><Phone size={14} className="shrink-0 text-slate-400" /><span className="truncate">{g.phone || 'No phone provided'}</span></p>
                      <p className="flex items-center gap-2.5"><Mail size={14} className="shrink-0 text-slate-400" /><span className="truncate" title={g.email || undefined}>{g.email || 'No email provided'}</span></p>
                    </div>
                    <div className="relative mt-5 h-[64px] border-t border-slate-100">
                      <div className="absolute inset-0 flex items-center justify-between gap-3 transition-opacity duration-150 motion-reduce:transition-none [@media(hover:hover)]:group-hover/guest:invisible [@media(hover:hover)]:group-hover/guest:opacity-0 group-focus-visible/guest:invisible group-focus-visible/guest:opacity-0">
                        <div className="flex items-center gap-2.5">
                          <CalendarDays size={18} strokeWidth={1.5} className="text-slate-400" />
                          <span className="text-[11px] leading-4 text-slate-500">Linked<br />reservations</span>
                        </div>
                        <span className="text-2xl font-bold tabular-nums text-slate-900">{String(g.reservation_ids.length).padStart(2, '0')}</span>
                      </div>
                      <div className="invisible absolute inset-0 flex items-center gap-2.5 opacity-0 transition-opacity duration-150 motion-reduce:transition-none [@media(hover:hover)]:group-hover/guest:visible [@media(hover:hover)]:group-hover/guest:opacity-100 group-focus-visible/guest:visible group-focus-visible/guest:opacity-100">
                        <MapPin size={18} strokeWidth={1.5} className="shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-semibold text-slate-400">Address</p>
                          <p className="line-clamp-2 break-words text-xs text-slate-600">{g.address && g.address !== 'Not provided' ? g.address : 'Not provided'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={`flex h-12 items-center justify-between border-t px-5 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${expanded ? 'border-zinc-600 bg-zinc-600 text-white' : 'border-slate-100 bg-slate-50/60 text-slate-600 group-hover/guest:border-zinc-600 group-hover/guest:bg-zinc-600 group-hover/guest:text-white group-focus-visible/guest:bg-zinc-600 group-focus-visible/guest:text-white'}`}>
                    <span>{expanded ? 'Close profile' : 'View profile'}</span>
                    {expanded ? <ChevronDown size={16} className="rotate-180" /> : <ArrowUpRight size={17} className="transition-transform duration-200 group-hover/guest:translate-x-0.5 group-hover/guest:-translate-y-0.5 motion-reduce:transition-none" />}
                  </div>
                </button>
                {expanded && <GuestProfileDialog guest={g} onClose={() => setSelectedId(null)} />}
              </article>
            );
          })}
        </div>
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 py-4">
            <p className="text-xs text-slate-500">Page {meta.page} of {meta.total_pages}</p>
            <div className="flex gap-2">
              <button type="button" title="Previous page" aria-label="Previous page" disabled={loading || meta.page <= 1} onClick={() => setPage(current => Math.max(current - 1, 1))} className="grid h-[34px] w-[34px] place-items-center rounded-md border border-slate-200 bg-white text-slate-700 enabled:hover:bg-slate-50 enabled:hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
              <button type="button" title="Next page" aria-label="Next page" disabled={loading || meta.page >= meta.total_pages} onClick={() => setPage(current => Math.min(current + 1, meta.total_pages))} className="grid h-[34px] w-[34px] place-items-center rounded-md border border-slate-200 bg-white text-slate-700 enabled:hover:bg-slate-50 enabled:hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GuestProfileDialog({ guest, onClose }: { guest: DisplayGuest; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} id={`guest-details-${guest.id}`} aria-labelledby="guest-profile-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      } }}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/30 motion-safe:animate-page-in">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="min-w-0"><p className="text-xs text-slate-500">Guest profile</p><h2 id="guest-profile-title" className="mt-1 break-words text-base font-semibold">{guest.name}</h2></div>
        <button type="button" aria-label="Close guest profile" title="Close guest profile" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"><X size={18} /></button>
      </header>
      <div className="space-y-4 p-5">
        <section><h3 className="text-xs font-semibold">Linked reservations <span className="text-slate-400">({guest.reservation_ids.length})</span></h3>
          {guest.reservation_ids.length ? <ul className="mt-3 space-y-2">{guest.reservation_ids.map(id => <li key={id} className="break-all font-mono text-xs text-slate-500">{id}</li>)}</ul> : <p className="mt-3 text-xs text-slate-400">No linked reservations</p>}
        </section>
        {guest.import_blocked && <div className="break-words border-l-2 border-rose-400 pl-3 text-xs text-rose-700"><p className="mb-1 font-semibold">Import blocked</p>{guest.import_error || 'Review the channel manager for details.'}</div>}
      </div>
    </dialog>, document.body,
  );
}

function AddGuestDialog({ children, busy, onClose }: { children: ReactNode; busy: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="add-guest-title" aria-describedby="add-guest-description" aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/30">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div><h2 id="add-guest-title" className="text-base font-semibold">Add guest</h2><p id="add-guest-description" className="mt-1 text-xs text-slate-500">Create a guest profile for your property.</p></div>
        <button type="button" aria-label="Close add guest" disabled={busy} onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40"><X size={18} /></button>
      </header>
      {children}
    </dialog>, document.body,
  );
}
