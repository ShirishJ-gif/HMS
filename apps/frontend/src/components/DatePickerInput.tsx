import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { CalendarGrid, dateToInputValue, formatDatePickerLabel, parseDateValue } from './CalendarDatePicker';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

// Uses the same calendar grid and styling as Reports, with form validation and
// a positioned popup that stays visible inside scrolling panels and dialogs.
export function DatePickerInput({ label, value, onChange, min, max, required = false, disabled = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [popup, setPopup] = useState<{ host: HTMLElement; style: CSSProperties } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const validationRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    const outOfRange = Boolean(value && ((min && value < min) || (max && value > max)));
    validationRef.current?.setCustomValidity(outOfRange ? 'Choose a date within the allowed range.' : '');
    setInvalid(false);
  }, [value, min, max]);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open || disabled) { setPopup(null); return; }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const host = trigger.closest('dialog') ?? document.body;
    function position() {
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      // Keep the popup in the dialog's top layer, but let it use the viewport.
      // Restricting it to the form's bounds clips most of the month grid.
      const leftLimit = 8;
      const rightLimit = innerWidth - 8;
      const topLimit = 8;
      const bottomLimit = innerHeight - 8;
      const width = Math.min(296, rightLimit - leftLimit);
      const height = panelRef.current ? panelRef.current.scrollHeight + 2 : required ? 410 : 450;
      const below = Math.max(0, bottomLimit - bounds.bottom - 6);
      const above = Math.max(0, bounds.top - topLimit - 6);
      const upwards = below < height && above > below;
      const maxHeight = Math.min(height, bottomLimit - topLimit);
      const preferredTop = upwards ? bounds.top - maxHeight - 6 : bounds.bottom + 6;
      setPopup({ host, style: { position: 'fixed', width,
        left: Math.max(leftLimit, Math.min(bounds.left, rightLimit - width)),
        top: Math.max(topLimit, Math.min(preferredTop, bottomLimit - maxHeight)),
        maxHeight,
      } });
    }
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, disabled, required, popup?.host]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && popup) {
      const day = panelRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)')
        ?? panelRef.current?.querySelector<HTMLButtonElement>('.pricing-calendar__day:not(:disabled)');
      day?.focus({ preventScroll: true });
    }
  }, [open, Boolean(popup)]);

  const initialDate = value || (min && min > dateToInputValue(new Date()) ? min : max && max < dateToInputValue(new Date()) ? max : '');
  return <div className="relative min-w-0 w-full">
    <input ref={validationRef} type="text" aria-hidden="true" tabIndex={-1} required={required} disabled={disabled}
      value={value} onChange={() => {}} className="pointer-events-none absolute h-px w-px opacity-0"
      onInvalid={event => { event.preventDefault(); setInvalid(true); setOpen(true); triggerRef.current?.focus(); }} />
    <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-invalid={invalid || undefined} disabled={disabled} onClick={() => setOpen(current => !current)}
      className={`${className ?? 'h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800'} flex w-full min-w-0 items-center justify-between gap-2 text-left transition-colors hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 ${invalid ? 'border-rose-400' : ''}`}>
      <span className={`truncate ${value ? '' : 'text-slate-400'}`}>{value ? formatDatePickerLabel(value) : 'Pick a date'}</span>
      <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
    </button>
    {open && popup && !disabled && createPortal(
      <div ref={panelRef} id={panelId} role="dialog" aria-label={`Choose ${label.toLowerCase()}`} style={popup.style}
        className="z-[100] overflow-y-auto overscroll-contain rounded-2xl border border-emerald-100 bg-white text-slate-800 shadow-2xl">
        <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-600">{label}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-slate-800">{value ? formatDatePickerLabel(value) : 'Choose a calendar date'}</p>
        </div>
        <div className="p-3"><CalendarGrid selectedDate={parseDateValue(initialDate)} min={min} max={max} onSelect={date => { onChange(dateToInputValue(date)); close(true); }} /></div>
        {!required && <div className="border-t border-slate-100 px-3 py-2"><button type="button" onClick={() => { onChange(''); close(true); }} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">Clear date</button></div>}
      </div>, popup.host,
    )}
  </div>;
}
