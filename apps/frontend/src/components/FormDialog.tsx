import { FormEvent, ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ErrorMsg, primaryBtn, secondaryBtn } from '../pages/ui';

export function FormDialog({ title, description, children, busy, error, onClose, onSubmit, submitLabel, busyLabel, submitDisabled = false, compact = false }: {
  title: string; description: string; children: ReactNode; busy: boolean; error: string | null;
  onClose: () => void; onSubmit: (event: FormEvent) => void; submitLabel: string; busyLabel: string; submitDisabled?: boolean; compact?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] ${compact ? 'max-w-xl' : 'max-w-2xl'} overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/30`}>
      <form onSubmit={onSubmit} className="flex max-h-[90dvh] flex-col">
        <header className={`flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 ${compact ? 'py-3' : 'py-4'}`}>
          <div>
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            <p id={descriptionId} className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
          <button type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={busy} onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          {error && <div role="alert" className="mb-4"><ErrorMsg>{error}</ErrorMsg></div>}
          <fieldset disabled={busy} className="min-w-0 disabled:opacity-60">{children}</fieldset>
        </div>
        <footer className={`flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 ${compact ? 'py-3' : 'py-4'}`}>
          <button type="button" disabled={busy} onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" disabled={busy || submitDisabled} className={primaryBtn}>{busy ? busyLabel : submitLabel}</button>
        </footer>
      </form>
    </dialog>, document.body,
  );
}

