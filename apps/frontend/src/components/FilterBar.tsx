import { ReactNode } from 'react';

type FilterBarProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  title?: string;
  description?: string;
  actions?: ReactNode;
};

export function FilterBar({
  children,
  className = '',
  compact = false,
  title = 'Filters',
  description,
  actions,
}: FilterBarProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4 ${compact ? 'max-w-2xl' : ''} ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Refine view</p>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {description && <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
