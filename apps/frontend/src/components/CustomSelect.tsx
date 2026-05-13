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
      <div className="custom-select custom-select-locked" ref={rootRef}>
        <div className="custom-select-trigger" role="textbox" aria-readonly="true">
          <span>{selectedOption?.label ?? options[0]?.label ?? placeholder}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`custom-select${disabled ? ' disabled' : ''}${open ? ' open' : ''}`} ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="custom-select-trigger"
        disabled={disabled}
        id={buttonId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        type="button"
      >
        <span className={selectedOption ? '' : 'placeholder'}>{selectedOption?.label ?? placeholder}</span>
      </button>
      {open ? (
        <div aria-labelledby={buttonId} className="custom-select-menu" id={listboxId} role="listbox">
          {options.length > 0 ? (
            options.map((option, index) => {
              const selected = option.value === value;
              const highlighted = index === highlightedIndex;

              return (
                <button
                  aria-selected={selected}
                  className={`custom-select-option${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}`}
                  key={option.value}
                  onClick={() => commitSelection(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                  {selected ? <strong>Selected</strong> : null}
                </button>
              );
            })
          ) : (
            <div className="custom-select-empty">No options available</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
