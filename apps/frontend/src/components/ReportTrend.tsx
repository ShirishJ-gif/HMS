import { useState } from 'react';
import type { ReportsData } from '../features/reports/types';
import { formatCurrency } from '../utils/format';

export function ReportTrend({
  trend,
  metric,
  disabled,
}: {
  trend: ReportsData['trend'];
  metric: 'billed' | 'collected';
  disabled: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const activePoint = trend.find((point) => point.from === (previewDate ?? selectedDate));
  const previous = (point: ReportsData['trend'][number]) =>
    metric === 'billed' ? point.previous_billed : point.previous_collected;
  const values = trend.flatMap((point) => [point[metric], previous(point)]);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const y = (value: number) => 160 - ((value - min) / (max - min)) * 130;
  const x = (index: number) => 64 + ((index + 0.5) * 552) / Math.max(1, trend.length);
  const short = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const compact = (amount: number) =>
    new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-indigo-500" />
          Selected period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-amber-500" />
          Previous period · aligned by day
        </span>
      </div>
      <svg
        viewBox="0 0 640 198"
        className="w-full"
        role="group"
        aria-label="Selected period bars compared with the previous period line"
        onMouseLeave={() => setPreviewDate(null)}
      >
        {[max, (max + min) / 2, min].map((value, index) => (
          <g key={index}>
            <line x1="64" x2="616" y1={y(value)} y2={y(value)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x="55" y={y(value) + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {compact(value)}
            </text>
          </g>
        ))}
        <line x1="64" x2="616" y1={y(0)} y2={y(0)} stroke="#94a3b8" />
        {trend.map((point, index) => {
          const current = point[metric];
          const width = Math.min(42, 360 / trend.length);
          const title = `${short(point.from)}–${short(point.to)}: ${formatCurrency(current)}; previous ${short(point.previous_from)}–${short(point.previous_to)}: ${formatCurrency(previous(point))}`;
          return (
            <g key={point.from}>
              {activePoint === point && (
                <rect
                  x={x(index) - 276 / trend.length}
                  y="24"
                  width={552 / trend.length}
                  height="140"
                  rx="4"
                  fill="#eef2ff"
                  pointerEvents="none"
                />
              )}
              <rect
                x={x(index) - width / 2}
                y={Math.min(y(0), y(current))}
                width={width}
                height={Math.abs(y(current) - y(0))}
                rx="3"
                fill={current < 0 ? '#fb7185' : '#6366f1'}
              />
              <rect
                x={x(index) - width / 2}
                y="24"
                width={width}
                height="140"
                fill="transparent"
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                aria-pressed={selectedDate === point.from}
                aria-label={title}
                className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                onMouseEnter={() => {
                  if (!disabled) setPreviewDate(point.from);
                }}
                onFocus={() => {
                  if (!disabled) setPreviewDate(point.from);
                }}
                onBlur={() => setPreviewDate(null)}
                onClick={() => {
                  if (!disabled) setSelectedDate(point.from);
                }}
                onKeyDown={(event) => {
                  if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    setSelectedDate(point.from);
                  } else if (event.key === 'Escape') {
                    setSelectedDate(null);
                    setPreviewDate(null);
                  }
                }}
              >
                <title>{title}</title>
              </rect>
              {(trend.length <= 7 || index % 2 === 0 || index === trend.length - 1) && (
                <text x={x(index)} y="187" textAnchor="middle" fontSize="10" fill="#64748b">
                  {short(point.from)}
                </text>
              )}
            </g>
          );
        })}
        <polyline
          points={trend.map((point, index) => `${x(index)},${y(previous(point))}`).join(' ')}
          fill="none"
          stroke="#d97706"
          strokeWidth="2"
          strokeDasharray="5 4"
          pointerEvents="none"
        />
        {trend.map((point, index) => (
          <circle key={point.from} cx={x(index)} cy={y(previous(point))} r="3" fill="#d97706" pointerEvents="none" />
        ))}
      </svg>
      <div
        role="status"
        aria-label="Chart comparison"
        className="mt-2 grid min-h-24 grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs"
      >
        <div>
          <p className="font-medium text-slate-600">Selected period</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {activePoint ? `${short(activePoint.from)} – ${short(activePoint.to)}` : 'Hover or select a bar'}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-indigo-700">
            {activePoint ? formatCurrency(activePoint[metric]) : '—'}
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-600">Previous period</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {activePoint ? `${short(activePoint.previous_from)} – ${short(activePoint.previous_to)}` : 'Aligned by day'}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-amber-700">
            {activePoint ? formatCurrency(previous(activePoint)) : '—'}
          </p>
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        Hover or focus to compare. Click to keep a comparison selected. Refunds can put collections below zero.
      </p>
    </div>
  );
}
