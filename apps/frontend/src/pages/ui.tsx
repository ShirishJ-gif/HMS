import { ReactNode } from 'react';

// ── Shared Tailwind class strings ──────────────────────────────────────
export const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition bg-white placeholder:text-slate-400';
export const selectCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white transition appearance-none cursor-pointer';
export const labelCls = 'flex flex-col gap-1.5 text-xs font-semibold text-slate-600';
export const primaryBtn = 'inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-lg shadow-sm text-sm transition';
export const secondaryBtn = 'inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-lg shadow-sm text-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition';
export const linkBtn = 'inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold px-3 py-2 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed';
export const dangerBtn = 'inline-flex items-center gap-2 bg-white border border-rose-200 text-rose-600 font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-rose-50 disabled:opacity-50 transition';
export const cardCls = 'bg-white border border-slate-200 rounded-xl shadow-sm';

// ── Table primitives ──────────────────────────────────────────────────
export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 px-4 py-3 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-sm text-slate-700 ${className}`}>
      {children}
    </td>
  );
}

// ── Metric card ───────────────────────────────────────────────────────
type Tone = 'gold' | 'green' | 'blue' | 'rose' | 'indigo' | 'default';

const toneBar: Record<Tone, string> = {
  gold: 'from-amber-400 to-amber-500',
  green: 'from-emerald-500 to-emerald-600',
  blue: 'from-sky-500 to-sky-600',
  rose: 'from-rose-500 to-rose-600',
  indigo: 'from-indigo-500 to-indigo-600',
  default: 'from-slate-300 to-slate-400',
};

export function MetricCard({ label, value, tone = 'default', sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r rounded-t-2xl ${toneBar[tone]}`} />
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">{label}</p>
      <strong className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none block">{value}</strong>
      {sub && <span className="text-xs text-slate-400 mt-1.5 block">{sub}</span>}
    </div>
  );
}

// ── Signal card ───────────────────────────────────────────────────────
export function SignalCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</p>
      <strong className="text-base font-bold text-slate-900 block">{value}</strong>
      <span className="text-xs text-slate-500 mt-0.5 block leading-relaxed">{detail}</span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────
const statusTone: Record<string, string> = {
  // green
  available: 'bg-emerald-50 text-emerald-700',
  active: 'bg-emerald-50 text-emerald-700',
  succeeded: 'bg-emerald-50 text-emerald-700',
  clean: 'bg-emerald-50 text-emerald-700',
  inspected: 'bg-emerald-50 text-emerald-700',
  ready: 'bg-emerald-50 text-emerald-700',
  done: 'bg-emerald-50 text-emerald-700',
  live: 'bg-emerald-50 text-emerald-700',
  checked_in: 'bg-emerald-50 text-emerald-700',
  // rose
  occupied: 'bg-rose-50 text-rose-700',
  error: 'bg-rose-50 text-rose-700',
  failed: 'bg-rose-50 text-rose-700',
  dead_letter: 'bg-rose-50 text-rose-700',
  dirty: 'bg-rose-50 text-rose-700',
  // amber
  maintenance: 'bg-amber-50 text-amber-700',
  paused: 'bg-amber-50 text-amber-700',
  queued: 'bg-amber-50 text-amber-700',
  pending: 'bg-amber-50 text-amber-700',
  cleaning: 'bg-amber-50 text-amber-700',
  attention: 'bg-amber-50 text-amber-700',
  booked: 'bg-sky-50 text-sky-700',
  checked_out: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-slate-100 text-slate-600',
  out_of_service: 'bg-slate-100 text-slate-600',
  // tone overrides
  green: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
  gold: 'bg-amber-50 text-amber-700',
  blue: 'bg-sky-50 text-sky-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  default: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ label, tone }: { label: string; tone?: string }) {
  const key = (tone ?? label).toLowerCase().replace(/[^a-z_]/g, '_');
  const cls = statusTone[key] ?? statusTone.default;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

// ── Page header ───────────────────────────────────────────────────────
export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">{eyebrow}</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────
export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        {eyebrow && <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">{eyebrow}</p>}
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Table card wrapper ────────────────────────────────────────────────
export function TableCard({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          {eyebrow && <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">{eyebrow}</p>}
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

// ── Panel card ────────────────────────────────────────────────────────
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Info strip ────────────────────────────────────────────────────────
export function InfoStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm mb-4">
      <strong className="text-slate-800 flex-shrink-0">{label}</strong>
      <span className="text-slate-500 leading-relaxed">{children}</span>
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────
export function ErrorMsg({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{children}</p>;
}
export function SuccessMsg({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">{children}</p>;
}
export function LoadingMsg({ children = 'Loading…' }: { children?: ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

// ── Detail list ───────────────────────────────────────────────────────
export function DetailList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="space-y-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-3 border-t border-slate-50 pt-2 first:border-0 first:pt-0">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
          <dd className="text-xs font-bold text-slate-800 text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
