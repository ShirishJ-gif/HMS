import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

type CustomSelectOption = {
  label: string;
  value: string;
};

type CustomSelectProps = {
  disabled?: boolean;
  lockWhenSingleOption?: boolean;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  value: string;
};

export function CustomSelect({
  disabled = false,
  lockWhenSingleOption = false,
  onChange,
  options,
  placeholder = 'Select option',
  value,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const buttonId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const shouldLockToSingleOption = lockWhenSingleOption && options.length === 1;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleWindowBlur() { setOpen(false); }
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (!open) setHighlightedIndex(options.findIndex((o) => o.value === value));
  }, [open, options, value]);

  function commitSelection(nextValue: string) {
    if (nextValue !== value) onChange(nextValue);
    setOpen(false);
  }

  function moveHighlight(direction: 1 | -1) {
    const nextIndex = highlightedIndex < 0 ? 0 : highlightedIndex + direction;
    if (nextIndex < 0) { setHighlightedIndex(options.length - 1); return; }
    if (nextIndex >= options.length) { setHighlightedIndex(0); return; }
    setHighlightedIndex(nextIndex);
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); setHighlightedIndex(options.findIndex((o) => o.value === value)); return; }
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      if (highlightedIndex >= 0 && options[highlightedIndex]) commitSelection(options[highlightedIndex].value);
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  }

  if (shouldLockToSingleOption) {
    return (
      <div ref={rootRef} className="relative">
        <div className="flex items-center w-full min-h-[2.6rem] border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-600 text-sm font-medium cursor-default">
          <span>{selectedOption?.label ?? options[0]?.label ?? placeholder}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        id={buttonId}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((c) => !c)}
        onKeyDown={handleButtonKeyDown}
        className={[
          'flex items-center justify-between w-full min-h-[2.6rem] border rounded-lg px-3 py-2 text-sm text-left transition-all duration-150',
          'bg-white font-medium cursor-pointer',
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200' : 'text-slate-700 hover:border-slate-300',
          open ? 'border-indigo-400 ring-2 ring-indigo-500/15' : 'border-slate-200',
        ].join(' ')}
      >
        <span className={selectedOption ? 'text-slate-800' : 'text-slate-400'}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          className={`ml-2 w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          aria-labelledby={buttonId}
          id={listboxId}
          role="listbox"
          className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 py-1.5 max-h-64 overflow-y-auto scrollbar-none"
        >
          {options.length > 0 ? options.map((option, index) => {
            const selected = option.value === value;
            const highlighted = index === highlightedIndex;
            return (
              <button
                key={option.value}
                aria-selected={selected}
                role="option"
                type="button"
                onClick={() => commitSelection(option.value)}
                className={[
                  'flex items-center justify-between w-full px-3 py-2.5 text-sm text-left rounded-lg mx-1 transition-colors',
                  'w-[calc(100%-8px)]',
                  selected ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-700',
                  highlighted && !selected ? 'bg-slate-50' : '',
                  'hover:bg-slate-50',
                ].join(' ')}
              >
                <span>{option.label}</span>
                {selected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          }) : (
            <div className="px-3 py-3 text-sm text-slate-400 text-center">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}
