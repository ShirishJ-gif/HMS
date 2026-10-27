import { useEffect, useRef, useState } from 'react';
import type { ReportsData } from '../features/reports/types';
import { formatCurrency } from '../utils/format';
import { groupReportTrend } from '../utils/report-trend';

const short = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const compact = (amount: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);

export function ReportTrend({ trend, disabled }: { trend: ReportsData['trend']; disabled: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const clearOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setActiveDate(null);
    };
    document.addEventListener('pointerdown', clearOutside);
    return () => document.removeEventListener('pointerdown', clearOutside);
  }, []);
  const points = groupReportTrend(trend, width < 440 ? 3 : width < 600 ? 4 : 6);
  const activePoint = disabled ? undefined : points.find(point => point.from === activeDate);
  const values = points.flatMap(point => [point.billed, point.collected]);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const y = (value: number) => 190 - ((value - min) / (max - min)) * 140;
  const step = (width - 54) / Math.max(1, points.length);
  const x = (index: number) => 44 + (index + 0.5) * step;
  const barWidth = Math.min(30, step * 0.29);
  const rangeLabel = (from: string, to: string) => from === to ? short(from) : `${short(from)} – ${short(to)}`;
  return <div ref={container} className="mt-4 min-w-0">
    <svg viewBox={`0 0 ${width} 244`} className="w-full" role="group" aria-label="Room revenue and collected by period, shown side by side" onMouseLeave={() => setActiveDate(null)}>
      {[max, (max + min) / 2, min].map((value, index) => <g key={index}>
        <line x1="44" x2={width - 10} y1={y(value)} y2={y(value)} stroke="#e2e8f0" strokeDasharray="3 3" />
        <text x="38" y={y(value) + 4} textAnchor="end" fontSize="9" fill="#64748b">{compact(value)}</text>
      </g>)}
      <line x1="44" x2={width - 10} y1={y(0)} y2={y(0)} stroke="#94a3b8" />
      {points.map((point, index) => {
        const title = `${rangeLabel(point.from, point.to)}: Room revenue ${formatCurrency(point.billed)}, Period collections ${formatCurrency(point.collected)}`;
        return <g key={point.from}>
          {activePoint === point && <rect x={x(index) - step / 2 + 2} y="25" width={step - 4} height="184" rx="4" fill="#f1f5f9" opacity="0.7" pointerEvents="none" />}
          {(['billed', 'collected'] as const).map((metric, metricIndex) => {
            const amount = point[metric];
            const center = x(index) + (metricIndex === 0 ? -1 : 1) * (barWidth / 2 + 3);
            const color = metric === 'billed' ? '#6366f1' : '#10b981';
            return <g key={metric}>
              <rect x={center - barWidth / 2} y={amount === 0 ? y(0) - 1 : Math.min(y(0), y(amount))} width={barWidth} height={Math.max(2, Math.abs(y(amount) - y(0)))} rx="2" fill={color} />
              <text x={center} y={amount < 0 ? y(amount) + 13 : y(amount) - 7} textAnchor="middle" fontSize="9" fontWeight="600" fill={metric === 'billed' ? '#4338ca' : '#047857'}>{compact(amount)}</text>
            </g>;
          })}
          <text x={x(index)} y="223" textAnchor="middle" fontSize="10" fill="#64748b">{short(point.from)}</text>
          {point.to !== point.from && <text x={x(index)} y="237" textAnchor="middle" fontSize="9" fill="#94a3b8">– {short(point.to)}</text>}
          <rect x={x(index) - step / 2} y="24" width={step} height="216" fill="transparent" role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-expanded={activePoint === point} aria-label={title}
            className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
            onMouseEnter={() => { if (!disabled) setActiveDate(point.from); }}
            onFocus={() => { if (!disabled) setActiveDate(point.from); }}
            onBlur={() => setActiveDate(null)}
            onClick={() => { if (!disabled) setActiveDate(point.from); }}
            onKeyDown={event => {
              if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setActiveDate(point.from); }
              else if (event.key === 'Escape') setActiveDate(null);
            }}><title>{title}</title></rect>
        </g>;
      })}
    </svg>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">Amounts in INR · adjacent dates grouped to fit. Period collections is net of refunds and can fall below zero. Hover, focus or tap a pair for exact amounts and the previous period.</p>
    {activePoint && <div role="status" aria-label="Chart comparison" className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs sm:grid-cols-2">
      {([
        { label: 'Selected period', from: activePoint.from, to: activePoint.to, billed: activePoint.billed, collected: activePoint.collected },
        { label: 'Previous period', from: activePoint.previous_from, to: activePoint.previous_to, billed: activePoint.previous_billed, collected: activePoint.previous_collected },
      ]).map(period => <div key={period.label} className="min-w-0">
        <p className="font-semibold text-slate-700">{period.label}</p>
        <p className="mt-1 text-[11px] text-slate-500">{rangeLabel(period.from, period.to)}</p>
        <dl className="mt-2 space-y-1.5">
          <div className="flex flex-wrap justify-between gap-x-2"><dt className="text-indigo-700">Room revenue</dt><dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(period.billed)}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-2"><dt className="text-emerald-700">Period collections</dt><dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(period.collected)}</dd></div>
        </dl>
      </div>)}
    </div>}
  </div>;
}
