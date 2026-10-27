import { FormEvent, useEffect, useState } from 'react';
import { BedDouble, House, Pencil } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { FormDialog } from './FormDialog';
import { inputCls, labelCls } from '../pages/ui';

export type VillaSettings = {
  property_id: string; room_category_id: string; room_id: string; rate_plan_id: string;
  room_rate_plan_id: string; nightly_rate: number | null; whole_villa_rate: number | null; per_room_rate: number | null;
  total_rooms: number; min_rooms: number; max_rooms: number; currency: string;
};

export function VillaRateSettings({ propertyId, onSaved, title = 'Villa sales options' }: { propertyId: string; onSaved?: () => void; title?: string }) {
  const [savedSettings, setSavedSettings] = useState<VillaSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [wholeRate, setWholeRate] = useState('');
  const [roomRate, setRoomRate] = useState('');
  const [totalRooms, setTotalRooms] = useState('1');
  const [minRooms, setMinRooms] = useState('1');
  const [maxRooms, setMaxRooms] = useState('1');
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function fillForm(data: VillaSettings) {
    setWholeRate(data.whole_villa_rate?.toString() ?? data.nightly_rate?.toString() ?? '');
    setRoomRate(data.per_room_rate?.toString() ?? '');
    setTotalRooms(String(data.total_rooms)); setMinRooms(String(data.min_rooms));
    setMaxRooms(String(data.max_rooms)); setCurrency(data.currency);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setMessage(null); setSavedSettings(null); setEditing(false);
    api.get<VillaSettings>(`/properties/${propertyId}/villa`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setSavedSettings(data); fillForm(data); } })
      .catch(err => { if (!controller.signal.aborted) setError(getApiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [propertyId]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const { data } = await api.patch<VillaSettings>(`/properties/${propertyId}/villa/rate`, { whole_villa_rate: wholeRate ? Number(wholeRate) : undefined, per_room_rate: roomRate ? Number(roomRate) : undefined, total_rooms: Number(totalRooms), min_rooms: Number(minRooms), max_rooms: Number(maxRooms) });
      setSavedSettings(data); fillForm(data); setEditing(false);
      setMessage('Villa sales options saved.'); onSaved?.();
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setSaving(false); }
  }
  if (loading) return <p className="text-sm text-slate-500">Loading villa settings…</p>;
  function closeEditor() {
    if (saving) return;
    if (savedSettings) fillForm(savedSettings);
    setEditing(false);
    setError(null);
  }
  const money = (value: number | null | undefined) => value == null ? 'Not set' : `${savedSettings?.currency ?? 'INR'} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return <>
    <section className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-1 text-[11px] text-slate-500">Nightly pricing and room limits for your property</p>
        </div>
        <button type="button" disabled={!savedSettings} onClick={() => { if (savedSettings) fillForm(savedSettings); setError(null); setMessage(null); setEditing(true); }} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50">
          <Pencil size={13} aria-hidden="true" /> Edit
        </button>
      </div>
      {savedSettings && <div className="px-5 py-6 sm:px-6 sm:py-7">
        <dl className="grid grid-cols-6 gap-y-6 xl:grid-cols-[1.35fr_1.35fr_1fr_1fr_1fr]">
          <div className="col-span-6 min-w-0 sm:col-span-3 sm:pr-6 xl:col-span-1">
            <dt className="flex h-5 items-center gap-2 text-[11px] font-medium text-slate-500"><House size={15} aria-hidden="true" /> Whole villa</dt>
            <dd className="mt-3 break-words text-[26px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">{money(savedSettings.whole_villa_rate ?? savedSettings.nightly_rate)}</dd>
            <dd className="mt-1.5 text-[11px] text-slate-500">per night · entire property</dd>
          </div>
          <div className="col-span-6 min-w-0 sm:col-span-3 sm:border-l sm:border-slate-200 sm:px-6 xl:col-span-1">
            <dt className="flex h-5 items-center gap-2 text-[11px] font-medium text-slate-500"><BedDouble size={15} aria-hidden="true" /> Per room</dt>
            <dd className="mt-3 break-words text-[26px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">{money(savedSettings.per_room_rate)}</dd>
            <dd className="mt-1.5 text-[11px] text-slate-500">per night · individual room</dd>
          </div>
          {[
            ['Total rooms', savedSettings.total_rooms, 'at the property'],
            ['Minimum booking', savedSettings.min_rooms, 'rooms per booking'],
            ['Maximum booking', savedSettings.max_rooms, 'rooms per booking'],
          ].map(([label, value, description]) => <div key={label} className="col-span-2 min-w-0 border-t border-slate-100 pr-3 pt-5 xl:col-span-1 xl:border-l xl:border-t-0 xl:border-slate-200 xl:px-5 xl:pt-0">
            <dt className="flex min-h-5 items-center text-[11px] font-medium text-slate-500">{label}</dt>
            <dd className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">{value}</dd>
            <dd className="mt-1.5 text-[11px] text-slate-500">{description}</dd>
          </div>)}
        </dl>
      </div>}
      <div aria-live="polite" className={(!editing && error) || message ? 'border-t border-slate-100 px-5 py-3 text-xs sm:px-6' : ''}>{!editing && error && <p className="text-rose-700">{error}</p>}{message && <p className="text-emerald-700">{message}</p>}</div>
    </section>
    {editing && <FormDialog title="Edit villa sales options" description="Update nightly rates and room limits for your property."
      compact busy={saving} error={error} onClose={closeEditor} onSubmit={save} submitLabel="Save sales options" busyLabel="Saving…">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={`${labelCls} min-w-0`}>
            <span>Whole-villa rate ({currency})</span>
            <input autoFocus type="number" min="0.01" max="99999999.99" step="0.01" required disabled={loading || saving} value={wholeRate} onChange={event => setWholeRate(event.target.value)} className={inputCls} />
            <span className="text-[11px] font-normal text-slate-400">Per night · entire property</span>
          </label>
          <label className={`${labelCls} min-w-0`}>
            <span>Per-room rate ({currency})</span>
            <input type="number" min="0.01" max="99999999.99" step="0.01" required={savedSettings?.per_room_rate != null} disabled={loading || saving} value={roomRate} onChange={event => setRoomRate(event.target.value)} className={inputCls} />
            <span className="text-[11px] font-normal text-slate-400">Per night · optional</span>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <label className={`${labelCls} min-w-0`}><span>Total rooms</span><input type="number" min="1" max="20" required disabled={loading || saving} value={totalRooms} onChange={event => setTotalRooms(event.target.value)} className={inputCls} /></label>
          <label className={`${labelCls} min-w-0`}><span>Minimum booking</span><input type="number" min="1" max="20" required disabled={loading || saving} value={minRooms} onChange={event => setMinRooms(event.target.value)} className={inputCls} /></label>
          <label className={`${labelCls} min-w-0`}><span>Maximum booking</span><input type="number" min="1" max="20" required disabled={loading || saving} value={maxRooms} onChange={event => setMaxRooms(event.target.value)} className={inputCls} /></label>
        </div>
      </div>
    </FormDialog>}
  </>;
}
