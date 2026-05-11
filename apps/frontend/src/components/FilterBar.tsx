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
  className,
  compact = false,
  title = 'Filters',
  description,
  actions,
}: FilterBarProps) {
  const classNames = ['filter-bar'];
  if (compact) {
    classNames.push('filter-bar-compact');
  }
  if (className) {
    classNames.push(className);
  }

  return (
    <div className={classNames.join(' ')}>
      <div className="filter-bar-header">
        <div className="filter-bar-copy">
          <p className="eyebrow">Refine view</p>
          <h3>{title}</h3>
          {description ? <p className="filter-bar-description">{description}</p> : null}
        </div>
        {actions ? <div className="filter-bar-actions">{actions}</div> : null}
      </div>
      <div className="filter-bar-grid">{children}</div>
    </div>
  );
}
