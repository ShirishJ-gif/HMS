import { DatePickerInput } from '../components/DatePickerInput';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, LockKeyhole, RefreshCw, Unlock, X } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { Property } from '../api/types';
import { useVillaCalendar } from '../hooks/useVillaCalendar';
import { ActionBtn, ErrorMsg, inputCls, labelCls } from './ui';

type Block = { id: string; from_date: string; to_date: string; reason: string; source: string; source_name?: string | null };
const isImported = (block: Block) => block.source.startsWith('ICAL_IMPORT:');
const blockSource = (block: Block) => isImported(block) ? block.source_name?.trim().toLowerCase() === 'airbnb' ? 'Airbnb calendar' : block.source_name || 'Synced calendar' : block.source === 'GOOGLE_CALENDAR' ? 'Google Calendar' : 'Manual';
const isAirbnb = (name: string) => name.toLowerCase().includes('airbnb');
const sourceTone = (name: string, imported: boolean) => !imported ? 'bg-amber-100 text-amber-800' : isAirbnb(name) ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const calendarStates = {
  available: { label: 'Available', tone: 'bg-emerald-50 text-emerald-800' },
  reserved: { label: 'Reserved', tone: 'bg-sky-50 text-sky-800' },
  blocked: { label: 'Blocked', tone: 'bg-amber-50 text-amber-800' },
  airbnb: { label: 'Unavailable · Airbnb', tone: 'bg-rose-50 text-rose-800' },
  synced: { label: 'Unavailable · Synced calendar', tone: 'bg-indigo-50 text-indigo-800' },
};

export function VillaAvailabilityPage({ property }: { property: Property }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [from, setFrom] = useState(() => dateKey(new Date()));
  const [to, setTo] = useState(() => dateKey(new Date()));
  const [reason, setReason] = useState('');
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { calendar, loading, error: calendarError } = useVillaCalendar(property.id, month, reload);
  useEffect(() => {
    if (selectedDate) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [selectedDate]);
  useEffect(() => {
    const controller = new AbortController();
    setBlocksLoading(true); setError(null);
    api.get<Block[]>('/inventory/blocks', { params: { property_id: property.id }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setBlocks(data); })
      .catch(err => { if (!controller.signal.aborted) setError(getApiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setBlocksLoading(false); });
    return () => controller.abort();
  }, [property.id, reload]);
  async function blockDates(event: FormEvent) {
    event.preventDefault();
    if (pending || loading || blocksLoading || !from || !to || from > to || !reason.trim()) return;
    setPending('block'); setActionError(null);
    try { await api.post('/inventory/block', { property_id: property.id, from_date: from, to_date: to, blocked_rooms: 1, reason: reason.trim(), source: 'MANUAL' }); setReason(''); setSelectedDate(null); setReload(value => value + 1); }
    catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setPending(null); }
  }
  async function unblock(block: Block) {
    setPending(block.id); setActionError(null);
    try { await api.delete(`/inventory/blocks/${block.id}`, { params: { delete_google_event: true } }); setSelectedDate(null); setReload(value => value + 1); }
    catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setPending(null); }
  }
  const rows = calendar?.categories[0]?.rows ?? [];
  const selectedRow = rows.find(row => row.date === selectedDate);
  const selectedBlocks = blocks.filter(block => selectedDate && block.from_date <= selectedDate && block.to_date >= selectedDate);
  const canBlock = Boolean(selectedRow && selectedRow.reserved_rooms === 0 && selectedRow.blocked_rooms === 0 && !selectedRow.stop_sell && selectedRow.available_rooms > 0 && selectedBlocks.length === 0);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <div className="-mx-5 -my-6 min-h-screen bg-[#f5f5f3] lg:-mx-8 lg:-my-8">
    <header className="border-b border-black/[0.06] bg-white px-5 py-6 lg:px-8">
      <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Rental Villas</p>
      <h1 className="text-[22px] font-bold text-slate-900">Availability &amp; Rates</h1>
    </header>
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {calendarError && <ErrorMsg>{calendarError}</ErrorMsg>}
      <div className="min-w-0">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Refresh availability" title="Refresh availability" disabled={loading || blocksLoading} onClick={() => setReload(value => value + 1)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white disabled:opacity-50"><RefreshCw size={14} className={loading || blocksLoading ? 'animate-spin' : ''} /></button>
              <button type="button" aria-label="Previous month" title="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white"><ChevronLeft size={16} /></button>
              <ActionBtn size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</ActionBtn>
              <button type="button" aria-label="Next month" title="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div aria-label="Calendar legend" className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
            {Object.values(calendarStates).map(state => <span key={state.label} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className={`h-4 w-4 rounded border border-current/20 ${state.tone}`} />{state.label}</span>)}
          </div>
          <p className="mb-4 text-xs text-slate-500">Click a date to block it or view its details. Airbnb and synced dates are managed in their source calendar.</p>
          <div aria-label="Villa availability calendar" className="grid grid-cols-7 border-l border-t border-slate-200 bg-white" aria-busy={loading || blocksLoading}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="border-b border-r border-slate-200 bg-slate-50 py-2 text-center text-[10px] font-semibold text-slate-500">{day}</div>)}
            {Array.from({ length: month.getDay() }, (_, i) => <div key={`blank-${i}`} className="min-h-20 border-b border-r border-slate-200 bg-slate-50/50 sm:min-h-28" />)}
            {Array.from({ length: days }, (_, i) => {
              const date = dateKey(new Date(month.getFullYear(), month.getMonth(), i + 1));
              const row = rows.find(item => item.date === date);
              const dateBlocks = blocks.filter(block => block.from_date <= date && block.to_date >= date);
              const sources = Array.from(new Map(dateBlocks.map(block => [blockSource(block), { name: blockSource(block), imported: isImported(block) }])).values());
              const imported = dateBlocks.some(isImported);
              const airbnb = sources.some(source => source.imported && isAirbnb(source.name));
              const state = !row ? null : row.reserved_rooms > 0 ? calendarStates.reserved : row.blocked_rooms > 0 || row.stop_sell || row.available_rooms < 1 || dateBlocks.length > 0 ? airbnb ? calendarStates.airbnb : imported ? calendarStates.synced : calendarStates.blocked : calendarStates.available;
              const status = state === calendarStates.airbnb || state === calendarStates.synced ? date < today ? 'Previously unavailable' : 'Unavailable' : state?.label ?? (loading ? 'Loading' : 'Unavailable');
              return <button key={date} type="button" disabled={!row || loading || blocksLoading || Boolean(error) || Boolean(calendarError) || Boolean(pending)} onClick={() => { setFrom(date); setTo(date); setReason(''); setActionError(null); setSelectedDate(date); }} title={dateBlocks.map(block => `${blockSource(block)}: ${block.reason}`).join('\n')} aria-haspopup="dialog" aria-label={`${date}: ${status}${sources.length ? ` - ${sources.map(source => source.name).join(', ')}` : ''}`} aria-pressed={selectedDate === date} className={`flex h-32 min-w-0 flex-col items-start gap-1 overflow-hidden border-b border-r border-slate-200 px-1 py-2 text-left transition-shadow hover:shadow-[inset_0_0_0_2px_currentColor] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-700 disabled:cursor-wait sm:px-3 ${state?.tone ?? 'text-slate-400'} ${selectedDate === date ? 'ring-2 ring-inset ring-slate-500' : ''}`}>
                <span className="mb-1 text-xs font-semibold">{i + 1}</span>{status && <span className="max-w-full text-[8px] font-medium sm:text-[11px]">{status}</span>}
                {sources.slice(0, 2).map(source => <span key={source.name} title={source.name} className={`block max-w-full break-words rounded px-1 py-0.5 text-[9px] font-semibold sm:text-[10px] ${sourceTone(source.name, source.imported)}`}>{source.name}</span>)}
                {sources.length > 2 && <span className="text-[9px]">+{sources.length - 2}</span>}
              </button>;
            })}
          </div>
        </section>
      </div>
      <dialog ref={dialogRef} aria-labelledby="villa-date-title" onCancel={event => { if (pending) event.preventDefault(); }} onClose={() => { if (!dialogRef.current?.open) setSelectedDate(null); }} className="fixed inset-0 !m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-900/40">
        {selectedDate && <>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><h2 id="villa-date-title" className="text-base font-bold text-slate-900">{canBlock ? 'Block villa dates' : 'Date details'}</h2><p className="mt-1 text-sm text-slate-500">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
            <button type="button" aria-label="Close date details" disabled={Boolean(pending)} onClick={() => setSelectedDate(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>
          {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
          {canBlock ? <form onSubmit={blockDates} className="space-y-4">
            <p className="text-xs text-slate-500">Block this date, or extend the range below. Both dates are included.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}><span>From</span><DatePickerInput label="From" required disabled={Boolean(pending)} value={from} onChange={value => { setFrom(value); if (value > to) setTo(value); }} className={inputCls} /></label>
              <label className={labelCls}><span>Through</span><DatePickerInput label="Through" required disabled={Boolean(pending)} min={from} value={to} onChange={setTo} className={inputCls} /></label>
            </div>
            <label className={labelCls}><span>Reason</span><input required disabled={Boolean(pending)} maxLength={180} placeholder="e.g. Maintenance or owner stay" value={reason} onChange={event => setReason(event.target.value)} className={inputCls} /></label>
            <div className="flex justify-end gap-2"><ActionBtn disabled={Boolean(pending)} onClick={() => setSelectedDate(null)}>Cancel</ActionBtn><ActionBtn type="submit" icon={<LockKeyhole size={14} />} disabled={Boolean(pending) || loading || blocksLoading || !reason.trim() || !from || !to || from > to}>{pending === 'block' ? 'Blocking...' : 'Block dates'}</ActionBtn></div>
          </form> : <div className="space-y-4">
            {Boolean(selectedRow?.reserved_rooms) && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">This date is reserved. Manage the booking in Reservations.</p>}
            {selectedBlocks.map(block => <div key={block.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${sourceTone(blockSource(block), isImported(block))}`}>{blockSource(block)}</span>
              <p className="text-xs font-semibold">{block.from_date} to {block.to_date}</p><p className="break-words text-sm text-slate-500">{block.reason}</p>
              {isImported(block) ? <p className="text-xs text-slate-500">{selectedDate < today ? 'Previously unavailable. This calendar history is kept after refresh; it does not confirm a booking.' : `Change these dates in ${blockSource(block)}. Current and future dates update on the next calendar sync; past dates are kept as history.`}</p> : <><p className="text-xs text-slate-500">Unblocking removes this entire date range{block.source === 'GOOGLE_CALENDAR' ? ' and its linked Google Calendar event' : ''}.</p><ActionBtn size="sm" icon={<Unlock size={14} />} disabled={Boolean(pending) || loading || blocksLoading} onClick={() => void unblock(block)}>{pending === block.id ? 'Unblocking...' : 'Unblock dates'}</ActionBtn></>}
            </div>)}
            {!selectedBlocks.length && !selectedRow?.reserved_rooms && <p className="text-sm text-slate-500">This date is unavailable due to an inventory restriction.</p>}
          </div>}
        </>}
      </dialog>
    </div>
  </div>;
}
