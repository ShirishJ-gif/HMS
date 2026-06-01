import { ReactNode } from 'react';

// ── Shared Tailwind class strings ──────────────────────────────────────
export const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition bg-white placeholder:text-slate-400';
export const selectCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white transition appearance-none cursor-pointer';
export const labelCls = 'flex flex-col gap-1.5 text-xs font-semibold text-slate-600';
export const primaryBtn = 'inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition';
export const secondaryBtn = 'inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-lg text-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition';
export const linkBtn = 'inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold px-3 py-2 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed';
export const dangerBtn = 'inline-flex items-center gap-2 bg-white border border-rose-200 text-rose-600 font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-rose-50 disabled:opacity-50 transition';
export const cardCls = 'bg-white border border-slate-100 rounded-xl';

// ── Table primitives ──────────────────────────────────────────────────
export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 px-4 py-3 bg-slate-50/60 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-sm text-slate-700 border-t border-slate-50 ${className}`}>
      {children}
    </td>
  );
}

// ── Metric card ───────────────────────────────────────────────────────
type Tone = 'gold' | 'green' | 'blue' | 'rose' | 'indigo' | 'default';

export function MetricCard({ label, value, tone: _tone = 'default', sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 hover:shadow-sm transition-shadow">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{label}</p>
      <strong className="text-2xl font-bold text-slate-900 tracking-tight leading-none block">{value}</strong>
      {sub && <span className="text-xs text-slate-400 mt-1.5 block">{sub}</span>}
    </div>
  );
}

// ── Signal card ───────────────────────────────────────────────────────
export function SignalCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg p-3.5 border border-slate-100 bg-slate-50/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <strong className="text-sm font-bold text-slate-800 block">{value}</strong>
      <span className="text-xs text-slate-500 mt-0.5 block leading-relaxed">{detail}</span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────
const statusDot: Record<string, string> = {
  available: 'bg-emerald-500', active: 'bg-emerald-500', succeeded: 'bg-emerald-500',
  clean: 'bg-emerald-500', inspected: 'bg-emerald-500', ready: 'bg-emerald-500',
  done: 'bg-emerald-500', live: 'bg-emerald-500', checked_in: 'bg-emerald-500',
  occupied: 'bg-rose-500', error: 'bg-rose-500', failed: 'bg-rose-500',
  dead_letter: 'bg-rose-500', dirty: 'bg-rose-500',
  maintenance: 'bg-amber-500', paused: 'bg-amber-500', queued: 'bg-amber-400',
  pending: 'bg-amber-400', cleaning: 'bg-amber-500', attention: 'bg-amber-500',
  booked: 'bg-sky-500',
  checked_out: 'bg-slate-400', cancelled: 'bg-slate-400', out_of_service: 'bg-slate-400',
  green: 'bg-emerald-500', rose: 'bg-rose-500', gold: 'bg-amber-400',
  blue: 'bg-sky-500', indigo: 'bg-indigo-500', default: 'bg-slate-300',
};

const statusTone: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700', active: 'bg-emerald-50 text-emerald-700',
  succeeded: 'bg-emerald-50 text-emerald-700', clean: 'bg-emerald-50 text-emerald-700',
  inspected: 'bg-emerald-50 text-emerald-700', ready: 'bg-emerald-50 text-emerald-700',
  done: 'bg-emerald-50 text-emerald-700', live: 'bg-emerald-50 text-emerald-700',
  checked_in: 'bg-emerald-50 text-emerald-700',
  occupied: 'bg-rose-50 text-rose-700', error: 'bg-rose-50 text-rose-700',
  failed: 'bg-rose-50 text-rose-700', dead_letter: 'bg-rose-50 text-rose-700',
  dirty: 'bg-rose-50 text-rose-700',
  maintenance: 'bg-amber-50 text-amber-700', paused: 'bg-amber-50 text-amber-700',
  queued: 'bg-amber-50 text-amber-700', pending: 'bg-amber-50 text-amber-700',
  cleaning: 'bg-amber-50 text-amber-700', attention: 'bg-amber-50 text-amber-700',
  booked: 'bg-sky-50 text-sky-700',
  checked_out: 'bg-slate-100 text-slate-600', cancelled: 'bg-slate-100 text-slate-600',
  out_of_service: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700', rose: 'bg-rose-50 text-rose-700',
  gold: 'bg-amber-50 text-amber-700', blue: 'bg-sky-50 text-sky-700',
  indigo: 'bg-indigo-50 text-indigo-700', default: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ label, tone }: { label: string; tone?: string }) {
  const key = (tone ?? label).toLowerCase().replace(/[^a-z_]/g, '_');
  const bgCls = statusTone[key] ?? statusTone.default;
  const dotCls = statusDot[key] ?? statusDot.default;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${bgCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
      {label}
    </span>
  );
}

// ── Page header ───────────────────────────────────────────────────────
export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7 pb-5 border-b border-slate-100">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">{eyebrow}</p>
        <h2 className="text-[1.75rem] font-bold text-slate-900 tracking-tight leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-2xl">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0 pt-1">{children}</div>}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────
export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div>
        {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-0.5">{eyebrow}</p>}
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-all',
            active === tab.id
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          {tab.label}
          {tab.count != null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active === tab.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/60 text-slate-500'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────
type BtnVariant = 'default' | 'primary' | 'danger' | 'ghost';
type BtnSize = 'sm' | 'md';
export function ActionBtn({
  children, onClick, variant = 'default', disabled, size = 'md',
  type = 'button', icon, className = '',
}: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant;
  disabled?: boolean; size?: BtnSize; type?: 'button' | 'submit' | 'reset';
  icon?: ReactNode; className?: string;
}) {
  const base = 'inline-flex items-center gap-1.5 font-medium transition rounded-lg disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes: Record<BtnSize, string> = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  const variants: Record<BtnVariant, string> = {
    default: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300',
    primary: 'bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-950',
    danger: 'border border-rose-200 text-rose-600 hover:bg-rose-50 bg-white',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

// ── Note strip ────────────────────────────────────────────────────────
type NoteVariant = 'info' | 'warning' | 'tip' | 'neutral';
export function NoteStrip({ children, variant = 'info', label }: { children: ReactNode; variant?: NoteVariant; label?: string }) {
  const styles: Record<NoteVariant, string> = {
    info: 'bg-slate-50 border-slate-200 text-slate-600',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    tip: 'bg-indigo-50 border-indigo-100 text-indigo-700',
    neutral: 'bg-white border-slate-200 text-slate-600',
  };
  return (
    <div className={`text-sm border rounded-lg px-4 py-3 leading-relaxed ${styles[variant]}`}>
      {label && <strong className="font-semibold mr-1.5">{label}</strong>}
      <span className="opacity-90">{children}</span>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-0 border-t border-slate-100 my-6" />;
  return (
    <div className="flex items-center gap-3 my-6">
      <hr className="flex-1 border-0 border-t border-slate-100" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <hr className="flex-1 border-0 border-t border-slate-100" />
    </div>
  );
}

// ── Table card wrapper ────────────────────────────────────────────────
export function TableCard({
  title,
  eyebrow,
  actions,
  children,
  scrollClassName = '',
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  scrollClassName?: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-0.5">{eyebrow}</p>}
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={`overflow-x-auto ${scrollClassName}`}>{children}</div>
    </div>
  );
}

// ── Panel card ────────────────────────────────────────────────────────
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-100 rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Info strip ────────────────────────────────────────────────────────
export function InfoStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 items-start bg-indigo-50/50 border border-indigo-100 rounded-lg px-4 py-3 text-sm mb-4">
      <span className="text-indigo-400 mt-px flex-shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
      </span>
      <div>
        <strong className="text-slate-700 text-xs font-bold">{label} </strong>
        <span className="text-slate-500 leading-relaxed">{children}</span>
      </div>
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────
export function ErrorMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">
      <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
      </svg>
      <span>{children}</span>
    </div>
  );
}
export function SuccessMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
      <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
      </svg>
      <span>{children}</span>
    </div>
  );
}
export function LoadingMsg({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
      <svg className="w-4 h-4 animate-spin-icon flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      <span>{children}</span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────
export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{subtitle}</p>}
    </div>
  );
}

// ── Detail list ───────────────────────────────────────────────────────
export function DetailList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-slate-50">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
          <dd className="text-xs font-semibold text-slate-800 text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
