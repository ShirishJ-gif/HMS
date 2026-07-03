import type { ReactNode } from 'react';
import type { PlatformSection, PlatformUser, PropertyRef } from './types';

export function Metric({
  label,
  value,
  detail,
  tone = 'neutral',
  compact = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  compact?: boolean;
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700',
  }[tone];

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 truncate font-bold ${compact ? 'text-lg' : 'text-2xl'} ${toneClass}`}>{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p>}
    </div>
  );
}

export function TinyStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5">
      <p className="text-[12px] font-bold text-slate-800">{value}</p>
      <p className="truncate text-[10px] font-semibold text-slate-400">{label}</p>
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export function IntegrationStatusValue({ status }: { status: string }) {
  const active = status.toUpperCase() === 'ACTIVE';

  return (
    <span className="inline-flex items-center gap-1.5">
      {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {formatLabel(status)}
    </span>
  );
}

export function StatusDonutChart({
  title,
  rows,
  palette,
}: {
  title: string;
  rows: Array<[string, number]>;
  palette: 'rooms' | 'reservations';
}) {
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <p className="text-[12px] font-bold text-slate-700">{title}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[7.5rem_1fr] sm:items-center">
        <div className="relative h-28 w-28">
          <svg className="h-28 w-28 -rotate-90" viewBox="0 0 88 88" aria-label={title}>
            <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            {total > 0 && rows.map(([label, value], index) => {
              const length = (value / total) * circumference;
              const segment = (
                <circle
                  key={label}
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  stroke={statusChartColor(label, palette, index)}
                  strokeWidth="10"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
              offset += length;
              return segment;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black leading-none text-slate-900">{total}</span>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Total</span>
          </div>
        </div>
        <div className="space-y-2">
          {rows.length ? rows.map(([label, value], index) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: statusChartColor(label, palette, index) }} />
                <span className="truncate text-[12px] font-semibold text-slate-600">{label}</span>
              </span>
              <span className="text-[12px] font-black text-slate-900">{value}</span>
            </div>
          )) : <p className="text-[12px] text-slate-400">No records</p>}
        </div>
      </div>
    </div>
  );
}

export function statusChartColor(label: string, palette: 'rooms' | 'reservations', index: number) {
  const normalized = label.toLowerCase();
  if (normalized.includes('available')) return '#10b981';
  if (normalized.includes('occupied') || normalized.includes('checked in')) return '#3b82f6';
  if (normalized.includes('maintenance') || normalized.includes('cancel')) return '#f43f5e';
  if (normalized.includes('booked')) return '#f59e0b';
  if (normalized.includes('checked out')) return '#64748b';

  const fallback = palette === 'rooms'
    ? ['#10b981', '#3b82f6', '#f43f5e', '#8b5cf6']
    : ['#f59e0b', '#3b82f6', '#64748b', '#ef4444'];
  return fallback[index % fallback.length];
}

export function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.length ? rows : <div className="px-4 py-6 text-[13px] text-slate-500">No records</div>}
      </div>
    </div>
  );
}

export function HealthLine({ label, value, status }: { label: string; value: string; status: 'ok' | 'degraded' | 'error' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-slate-700">{label}</p>
        <p className="truncate text-[11px] text-slate-500">{value}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

export function HealthRow({ title, meta, status }: { title: string; meta: string; status: 'ok' | 'degraded' | 'error' }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">{meta}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

export function StatusBadge({ status }: { status: 'ok' | 'degraded' | 'error' }) {
  const classes = {
    ok: 'bg-emerald-50 text-emerald-700',
    degraded: 'bg-amber-50 text-amber-700',
    error: 'bg-rose-50 text-rose-700',
  }[status];

  return <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${classes}`}>{formatLabel(status)}</span>;
}

export function Row({
  title,
  meta,
  value,
  muted = false,
  action,
}: {
  title: string;
  meta: string;
  value: ReactNode;
  muted?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className={`truncate text-[13px] font-bold ${muted ? 'text-slate-400' : 'text-slate-800'}`}>{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{meta}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="max-w-[120px] truncate rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}

export function DeleteButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-rose-100 bg-white px-2 py-1 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function titleForSection(section: PlatformSection) {
  const titles: Record<PlatformSection, string> = {
    'platform-overview': 'API Health',
    'platform-api-sample': 'API Sample',
    'platform-api-monitor': 'API Monitor',
    'platform-properties': 'Properties',
    'platform-integrations': 'Integrations',
    'platform-integration-sample': 'Sample Map',
    'platform-users': 'Users',
    'platform-logs': 'System Logs',
  };
  return titles[section];
}

export function propertyLabel(property: PropertyRef) {
  return property ? `${property.name} (${property.code})` : 'No property';
}

export function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatLatency(value?: number | null) {
  return value == null ? undefined : `${value} ms`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function scrollPlatformContentToTop() {
  const scrollRoot = document.querySelector<HTMLElement>('[data-scroll-lock-root="true"]');
  scrollRoot?.scrollTo({ top: 0 });
}

export function ConfirmUserDeleteModal({
  user,
  pending,
  onCancel,
  onConfirm,
}: {
  user: Pick<PlatformUser, 'id' | 'email'>;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Delete user?</h3>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">
          This will permanently delete <span className="font-semibold text-slate-800">{user.email}</span> and revoke their sessions.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-9 rounded-lg border border-rose-600 bg-rose-600 px-4 text-[12px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? 'Deleting...' : 'Delete user'}
          </button>
        </div>
      </div>
    </div>
  );
}
