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

const triggerChevron =
  'relative flex w-full min-h-[3.25rem] items-center justify-between rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 pr-11 text-left text-sm font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-all before:pointer-events-none before:absolute before:right-[1.1rem] before:top-1/2 before:h-0.5 before:w-[0.48rem] before:-translate-y-1/2 before:rounded-full before:bg-slate-500 before:transition-transform after:pointer-events-none after:absolute after:right-[0.95rem] after:top-1/2 after:h-0.5 after:w-[0.48rem] after:-translate-y-1/2 after:rounded-full after:bg-slate-500 after:transition-transform';

const menuClass =
  'absolute left-0 right-0 top-[calc(100%+0.45rem)] z-40 grid max-h-72 gap-0.5 overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-200/60 backdrop-blur-md [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

const optionClass =
  'flex w-full items-center justify-between gap-4 rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-indigo-200/80 hover:bg-indigo-50/80';

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
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleWindowBlur() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(options.findIndex((option) => option.value === value));
    }
  }, [open, options, value]);

  function commitSelection(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  function moveHighlight(direction: 1 | -1) {
    const nextIndex = highlightedIndex < 0 ? 0 : highlightedIndex + direction;

    if (nextIndex < 0) {
      setHighlightedIndex(options.length - 1);
      return;
    }

    if (nextIndex >= options.length) {
      setHighlightedIndex(0);
      return;
    }

    setHighlightedIndex(nextIndex);
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(options.findIndex((option) => option.value === value));
        return;
      }
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }

      if (highlightedIndex >= 0 && options[highlightedIndex]) {
        commitSelection(options[highlightedIndex].value);
      }
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  if (shouldLockToSingleOption) {
    return (
      <div className="relative" ref={rootRef}>
        <div
          className={`${triggerChevron} before:rotate-45 after:-rotate-45 cursor-default border-slate-200/90`}
          role="textbox"
          aria-readonly="true"
        >
          <span>{selectedOption?.label ?? options[0]?.label ?? placeholder}</span>
        </div>
      </div>
    );
  }

  const triggerState =
    open
      ? 'before:-rotate-45 after:rotate-45 border-indigo-400 ring-2 ring-indigo-500/15'
      : 'before:rotate-45 after:-rotate-45 border-slate-200/90 hover:border-slate-300';

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${triggerChevron} ${triggerState} disabled:cursor-not-allowed disabled:border-slate-200/80 disabled:bg-slate-50 disabled:text-slate-400`}
        disabled={disabled}
        id={buttonId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        type="button"
      >
        <span className={selectedOption ? '' : 'text-slate-400'}>{selectedOption?.label ?? placeholder}</span>
      </button>
      {open ? (
        <div aria-labelledby={buttonId} className={menuClass} id={listboxId} role="listbox">
          {options.length > 0 ? (
            options.map((option, index) => {
              const selected = option.value === value;
              const highlighted = index === highlightedIndex;

              return (
                <button
                  aria-selected={selected}
                  className={`${optionClass} ${
                    selected
                      ? 'border-emerald-200/90 bg-emerald-50/90'
                      : ''
                  } ${highlighted && !selected ? 'border-indigo-200/90 bg-indigo-50/90' : ''}`}
                  key={option.value}
                  onClick={() => commitSelection(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                  {selected ? (
                    <strong className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-700">Selected</strong>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2.5 text-sm font-semibold text-slate-500">No options available</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
