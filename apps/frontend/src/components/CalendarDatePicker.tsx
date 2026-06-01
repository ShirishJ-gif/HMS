import { useEffect, useRef, useState } from 'react';

type PickerProps = {
  align?: 'left' | 'right';
  onChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
};

export function CalendarDatePickerField({ align = 'left', label, onChange, open, setOpen, value }: PickerProps & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <CalendarDatePicker align={align} label={label} onChange={onChange} open={open} setOpen={setOpen} value={value} />
    </label>
  );
}

export function InlineCalendarDatePicker({ align = 'left', label = 'Date range', onChange, open, setOpen, value }: PickerProps & { label?: string }) {
  return <CalendarDatePicker align={align} compact label={label} onChange={onChange} open={open} setOpen={setOpen} value={value} />;
}

function CalendarDatePicker({ align, compact = false, label, onChange, open, setOpen, value }: PickerProps & { compact?: boolean; label: string }) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseDateValue(value);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open, setOpen]);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        className={compact
          ? 'flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-[11.5px] font-semibold text-slate-800 transition hover:border-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15'
          : 'flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:border-emerald-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15'}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="truncate">{value ? formatDatePickerLabel(value) : compact ? 'Pick date' : 'Pick a date'}</span>
        <CalendarIcon className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} flex-shrink-0 text-slate-400`} />
      </button>
      {open && (
        <div className={`absolute ${compact ? 'top-[2.5rem]' : 'top-[3rem]'} z-30 w-[18.5rem] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl shadow-slate-950/12 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-600">{label}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-slate-800">{value ? formatDatePickerLabel(value) : 'Choose a calendar date'}</p>
          </div>
          <div className="p-3">
            <CalendarGrid selectedDate={selectedDate} onSelect={(date) => { onChange(dateToInputValue(date)); setOpen(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarGrid({ onSelect, selectedDate }: { onSelect: (date: Date) => void; selectedDate?: Date }) {
  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const todayValue = dateToInputValue(new Date());
  const selectedValue = selectedDate ? dateToInputValue(selectedDate) : '';
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });

  return (
    <div className="pricing-calendar">
      <div className="pricing-calendar__nav">
        <button aria-label="Previous month" onClick={() => setViewDate(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} type="button">‹</button>
        <strong>{monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button aria-label="Next month" onClick={() => setViewDate(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} type="button">›</button>
      </div>
      <div className="pricing-calendar__weekdays">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="pricing-calendar__grid">
        {days.map((date) => {
          const value = dateToInputValue(date);
          return (
            <button
              className={[
                'pricing-calendar__day',
                date.getMonth() === monthStart.getMonth() ? '' : 'pricing-calendar__day--muted',
                value === todayValue ? 'pricing-calendar__day--today' : '',
                value === selectedValue ? 'pricing-calendar__day--selected' : '',
              ].filter(Boolean).join(' ')}
              key={value}
              onClick={() => onSelect(date)}
              type="button"
            >
              <span>{date.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function formatDatePickerLabel(value: string) {
  return parseDateValue(value)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) ?? value;
}

function parseDateValue(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function dateToInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function CalendarIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}
