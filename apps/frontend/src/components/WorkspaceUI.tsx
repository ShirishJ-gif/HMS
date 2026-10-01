import { useId } from 'react';
import { Info } from 'lucide-react';

export const workspacePanel = 'workspace-panel rounded-xl border border-slate-200 bg-white';
export const workspaceAction =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50';

export function MetricHelp({ label, children }: { label: string; children: string }) {
  const id = useId();
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        className="rounded text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <Info size={13} />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 p-3 text-left text-xs font-normal normal-case leading-5 tracking-normal text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {children}
      </span>
    </span>
  );
}

export type DashboardFocus = {
  kind: 'unassigned_arrivals' | 'pending_departures' | 'overdue_housekeeping' | 'outstanding_folios';
  propertyId: string;
  date: string;
};
export const focusLabels: Record<DashboardFocus['kind'], string> = {
  unassigned_arrivals: 'Unassigned arrivals',
  pending_departures: 'Pending departures',
  overdue_housekeeping: 'Overdue housekeeping',
  outstanding_folios: 'Outstanding folios',
};
export function FocusBanner({
  focus,
  clear,
  onReturn,
}: {
  focus: DashboardFocus;
  clear: () => void;
  onReturn?: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-900">
      <span>
        <strong>{focusLabels[focus.kind]}</strong>
        {focus.kind !== 'outstanding_folios' && ` · ${focus.date}`} · Dashboard selection
      </span>
      <div className="flex gap-4">
        {onReturn && (
          <button type="button" onClick={onReturn} className="font-semibold hover:underline">
            ← Dashboard
          </button>
        )}
        <button type="button" onClick={clear} className="font-semibold hover:underline">
          Clear selection
        </button>
      </div>
    </div>
  );
}
