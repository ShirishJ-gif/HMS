import { DatePickerInput } from '../components/DatePickerInput';
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, LockKeyhole, RefreshCw, Unlock } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { Property } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useVillaCalendar } from '../hooks/useVillaCalendar';
import { ActionBtn, ErrorMsg, inputCls, labelCls } from './ui';

type Block = { id: string; from_date: string; to_date: string; reason: string; source: string; source_name?: string | null };
const isImported = (block: Block) => block.source.startsWith('ICAL_IMPORT:');
const blockSource = (block: Block) => isImported(block) ? block.source_name || 'Synced calendar' : block.source === 'GOOGLE_CALENDAR' ? 'Google Calendar' : 'Manual';
const isAirbnb = (name: string) => name.toLowerCase().includes('airbnb');
const sourceTone = (name: string, imported: boolean) => !imported ? 'bg-amber-100 text-amber-800' : isAirbnb(name) ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function VillaAvailabilityPage({ property, properties, onPropertyChange }: { property: Property; properties: Property[]; onPropertyChange: (id: string) => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [from, setFrom] = useState(() => dateKey(new Date()));
  const [to, setTo] = useState(() => dateKey(new Date()));
  const [reason, setReason] = useState('');
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const { calendar, loading, error: calendarError } = useVillaCalendar(property.id, month, reload);
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
    event.preventDefault(); setPending('block'); setError(null);
    try { await api.post('/inventory/block', { property_id: property.id, from_date: from, to_date: to, blocked_rooms: 1, reason, source: 'MANUAL' }); setReason(''); setReload(value => value + 1); }
    catch (err) { setError(getApiErrorMessage(err)); }
    finally { setPending(null); }
  }
  async function unblock(block: Block) {
    setPending(block.id); setError(null);
    try { await api.delete(`/inventory/blocks/${block.id}`, { params: { delete_google_event: true } }); setReload(value => value + 1); }
    catch (err) { setError(getApiErrorMessage(err)); }
    finally { setPending(null); }
  }
  const rows = calendar?.categories[0]?.rows ?? [];
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <div className="-mx-5 -my-6 min-h-screen bg-[#f5f5f3] lg:-mx-8 lg:-my-8">
    <header className="border-b border-black/[0.06] bg-white px-5 py-6 lg:px-8">
      <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Rental Villas</p>
      <h1 className="text-[22px] font-bold text-slate-900">Availability &amp; Rates</h1>
      <div className="mt-4 max-w-sm"><CustomSelect value={property.id} onChange={onPropertyChange} options={properties.map(item => ({ label: item.name, value: item.id }))} /></div>
    </header>
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {calendarError && <ErrorMsg>{calendarError}</ErrorMsg>}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Refresh availability" title="Refresh availability" disabled={loading} onClick={() => setReload(value => value + 1)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
              <button type="button" aria-label="Previous month" title="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white"><ChevronLeft size={16} /></button>
              <ActionBtn size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</ActionBtn>
              <button type="button" aria-label="Next month" title="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Available</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-500" />Reserved</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" />Blocked</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-500" />Airbnb</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-indigo-500" />Synced calendar</span>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-slate-200 bg-white" aria-busy={loading}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="border-b border-r border-slate-200 bg-slate-50 py-2 text-center text-[10px] font-semibold text-slate-500">{day}</div>)}
            {Array.from({ length: month.getDay() }, (_, i) => <div key={`blank-${i}`} className="min-h-20 border-b border-r border-slate-200 bg-slate-50/50 sm:min-h-28" />)}
            {Array.from({ length: days }, (_, i) => {
              const date = dateKey(new Date(month.getFullYear(), month.getMonth(), i + 1));
              const row = rows.find(item => item.date === date);
              const dateBlocks = blocks.filter(block => block.from_date <= date && block.to_date >= date);
              const sources = Array.from(new Map(dateBlocks.map(block => [blockSource(block), { name: blockSource(block), imported: isImported(block) }])).values());
              const imported = dateBlocks.some(isImported);
              const status = !row ? (loading && !calendar ? 'Loading' : '') : row.reserved_rooms > 0 ? 'Reserved' : row.blocked_rooms > 0 || row.stop_sell || row.available_rooms < 1 ? 'Blocked' : 'Available';
              const airbnb = sources.some(source => source.imported && isAirbnb(source.name));
              const tone = status === 'Available' ? 'text-emerald-700 bg-emerald-50/40' : status === 'Reserved' ? 'text-sky-700 bg-sky-50' : status === 'Blocked' ? airbnb ? 'text-rose-700 bg-rose-50' : imported ? 'text-indigo-700 bg-indigo-50/60' : 'text-amber-700 bg-amber-50' : 'text-slate-400';
              return <button key={date} type="button" disabled={!row || Boolean(pending)} onClick={() => { setFrom(date); setTo(date); }} title={dateBlocks.map(block => `${blockSource(block)}: ${block.reason}`).join('\n')} aria-label={`${date}: ${status}${sources.length ? ` - ${sources.map(source => source.name).join(', ')}` : ''}`} aria-pressed={date >= from && date <= to} className={`flex h-32 min-w-0 flex-col items-start gap-1 overflow-hidden border-b border-r border-slate-200 px-1 py-2 text-left sm:px-3 ${tone} ${date >= from && date <= to ? 'ring-1 ring-inset ring-slate-400' : ''}`}>
                <span className="mb-1 text-xs font-semibold">{i + 1}</span>{status && <span className="max-w-full text-[8px] font-medium sm:text-[11px]">{status}</span>}
                {sources.slice(0, 2).map(source => <span key={source.name} title={source.name} className={`block max-w-full truncate rounded px-1 py-0.5 text-[9px] font-semibold sm:text-[10px] ${sourceTone(source.name, source.imported)}`}>{source.name}</span>)}
                {sources.length > 2 && <span className="text-[9px]">+{sources.length - 2}</span>}
              </button>;
            })}
          </div>
        </section>
        <aside className="space-y-6 border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <form onSubmit={blockDates} className="space-y-3 border-t border-slate-200 pt-5">
            <h2 className="text-sm font-bold text-slate-900">Block villa dates</h2>
            <label className={labelCls}><span>From</span><DatePickerInput label="From" required value={from} onChange={value => { setFrom(value); if (value > to) setTo(value); }} className={inputCls} /></label>
            <label className={labelCls}><span>Through</span><DatePickerInput label="Through" required min={from} value={to} onChange={setTo} className={inputCls} /></label>
            <label className={labelCls}><span>Reason</span><input required maxLength={180} value={reason} onChange={event => setReason(event.target.value)} className={inputCls} /></label>
            <ActionBtn type="submit" icon={<LockKeyhole size={14} />} disabled={Boolean(pending) || loading}>{pending === 'block' ? 'Blocking...' : 'Block dates'}</ActionBtn>
          </form>
        </aside>
      </div>
      <section className="border-t border-slate-200 pt-5">
        <h2 className="text-sm font-bold text-slate-900">Blocked dates</h2>
        {!blocksLoading && blocks.length === 0 && <p className="mt-3 text-xs text-slate-500">No date blocks.</p>}
        <div className="divide-y divide-slate-200">{blocks.map(block => <div key={block.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0"><span className={`mb-1 inline-block max-w-full break-words rounded px-2 py-0.5 text-[10px] font-semibold ${sourceTone(blockSource(block), isImported(block))}`}>{isImported(block) ? `Synced: ${blockSource(block)}` : blockSource(block)}</span><p className="text-xs font-semibold text-slate-700">{block.from_date} to {block.to_date}</p><p className="mt-1 break-words text-xs text-slate-500">{block.reason}</p></div>
          {!isImported(block) && <ActionBtn size="sm" icon={<Unlock size={14} />} disabled={Boolean(pending)} onClick={() => void unblock(block)}>{pending === block.id ? 'Unblocking...' : 'Unblock'}</ActionBtn>}
        </div>)}</div>
      </section>
    </div>
  </div>;
}
