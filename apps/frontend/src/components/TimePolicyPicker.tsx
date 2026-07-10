import { Clock3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function formatPropertyTime(value: string) {
  const [hoursText, minutes = '00'] = value.split(':');
  const hours = Number(hoursText);
  if (!Number.isFinite(hours)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${suffix}`;
}

function parsePolicyTime(value: string) {
  const [hoursText, minutesText = '00'] = value.split(':');
  const hours24 = Number(hoursText);
  const minute = Number(minutesText);
  const safeHours24 = Number.isFinite(hours24) ? hours24 : 0;
  return {
    hour12: safeHours24 % 12 || 12,
    minute: Number.isFinite(minute) ? minute : 0,
    period: safeHours24 >= 12 ? 'PM' : 'AM',
  };
}

function buildPolicyTime(hour12: number, minute: number, period: string) {
  const normalizedHour = period === 'PM' ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function sanitizeTypedTime(value: string) {
  const [rawHours = '', rawMinutes = ''] = value.replace(/[^\d:]/g, '').split(':');
  const hours = rawHours.slice(0, 2);
  const minutes = rawMinutes.slice(0, 2);
  const safeHours = hours.length === 2 && Number(hours) > 23 ? '23' : hours;
  const safeMinutes = minutes.length === 2 && Number(minutes) > 59 ? '59' : minutes;
  return value.includes(':') ? `${safeHours}:${safeMinutes}` : safeHours;
}

export function TimePolicyPicker({
  editable = false,
  invalid = false,
  minuteStep = 5,
  onChange,
  showClockIcon = false,
  value,
}: {
  editable?: boolean;
  invalid?: boolean;
  minuteStep?: number;
  onChange: (value: string) => void;
  showClockIcon?: boolean;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { hour12, minute, period } = parsePolicyTime(value);
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const normalizedMinuteStep = minuteStep > 0 && minuteStep <= 60 ? minuteStep : 5;
  const minutes = Array.from(
    { length: Math.ceil(60 / normalizedMinuteStep) },
    (_, index) => index * normalizedMinuteStep,
  ).filter((option) => option < 60);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function commit(nextHour = hour12, nextMinute = minute, nextPeriod = period) {
    onChange(buildPolicyTime(nextHour, nextMinute, nextPeriod));
  }

  return (
    <div className="relative" ref={rootRef}>
      {editable ? (
        <div className={`flex h-11 w-full items-center overflow-hidden rounded-lg border bg-white transition-colors ${invalid ? 'border-rose-300 ring-2 ring-rose-500/10' : open ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-slate-200 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/15 hover:border-slate-300'}`}>
          <input
            aria-label="Time"
            className="min-w-0 flex-1 bg-transparent px-3.5 text-[13px] font-bold text-slate-900 outline-none placeholder:text-slate-400"
            inputMode="numeric"
            maxLength={5}
            placeholder="HH:mm"
            value={value}
            onChange={(event) => onChange(sanitizeTypedTime(event.target.value))}
          />
          <button
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label="Open time picker"
            className="flex h-full w-11 shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {showClockIcon ? (
              <Clock3 className="h-4 w-4" strokeWidth={2.2} />
            ) : (
              <span className="text-xs font-bold">...</span>
            )}
          </button>
        </div>
      ) : (
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`flex h-11 w-full items-center justify-between rounded-lg border bg-white px-3.5 text-left outline-none transition-colors ${invalid ? 'border-rose-300 ring-2 ring-rose-500/10' : open ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-slate-200 hover:border-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15'}`}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="text-[13px] font-bold text-slate-900">{formatPropertyTime(value)}</span>
          {showClockIcon && (
            <Clock3 className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
          )}
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
          <div className="flex items-center justify-between border-b border-slate-100 bg-stone-50 px-3.5 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Select time</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{formatPropertyTime(value)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 p-3">
            <div>
              <p className="mb-2 text-center text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Hour</p>
              <div className="scrollbar-none max-h-44 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-1">
                {hours.map((hour) => (
                  <button
                    className={`w-full rounded-lg px-2 py-2.5 text-[12px] font-bold transition ${hour === hour12 ? 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                    key={hour}
                    onClick={() => commit(hour)}
                    type="button"
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-center text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Min</p>
              <div className="scrollbar-none max-h-44 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-1">
                {minutes.map((option) => (
                  <button
                    className={`w-full rounded-lg px-2 py-2.5 text-[12px] font-bold transition ${option === minute ? 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                    key={option}
                    onClick={() => commit(hour12, option)}
                    type="button"
                  >
                    {String(option).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-center text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">AM/PM</p>
              <div className="scrollbar-none max-h-44 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-1">
                {['AM', 'PM'].map((option) => (
                  <button
                    className={`w-full rounded-lg px-2 py-2.5 text-[12px] font-bold transition ${option === period ? 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                    key={option}
                    onClick={() => commit(hour12, minute, option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-3 py-2.5">
            <button
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-9 rounded-lg border border-emerald-600 bg-emerald-600 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700"
              onClick={() => setOpen(false)}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
