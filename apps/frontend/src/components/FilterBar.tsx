import { ReactNode } from 'react';

type FilterBarProps = {
  children: ReactNode;
  title?: string;
};

export function FilterBar({ children, title = 'Filters' }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-header">
        <p className="eyebrow">Refine view</p>
        <h3>{title}</h3>
      </div>
      <div className="filter-bar-grid">{children}</div>
    </div>
  );
}
