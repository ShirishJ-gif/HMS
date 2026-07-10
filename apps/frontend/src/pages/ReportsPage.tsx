import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { InlineCalendarDatePicker } from '../components/CalendarDatePicker';
import { CustomSelect } from '../components/CustomSelect';
import { formatCurrency } from '../utils/format';

/* ─── types ──────────────────────────────────────────────────────────────── */
type ReportProperty = { id: string; name: string; code: string };
type ReportStatusSegment = { label: string; value: number; color: string };
type ReportPropertyPerformance = {
  id: string;
  name: string;
  code: string;
  groups: number;
  blocked: number;
  nights: number;
  inhouse: number;
  billed: number;
  balance: number;
  share: number;
};
type ReportChannelReadiness = {
  id: string;
  property_name: string;
  ota_name: string;
  ready: boolean;
  rooms_activated: boolean;
  last_inventory_status: string | null;
  last_bookings_status: string | null;
};
type ReportsData = {
  from: string;
  to: string;
  property_id: string;
  properties: ReportProperty[];
  summary: {
    room_nights_sold: number;
    active_reservation_groups: number;
    billed_total: number;
    paid_total: number;
    refunded_total: number;
    balance_due: number;
    blocked_reservation_groups: number;
    checked_in_room_lines: number;
    reservation_groups: number;
  };
  reservation_posture: ReportStatusSegment[];
  property_performance: ReportPropertyPerformance[];
  payments_by_method: Array<{ provider: string; amount: number }>;
  room_category_performance: Array<{ id: string; name: string; code: string; room_nights: number; billed_total: number }>;
  channel_readiness: ReportChannelReadiness[];
};
type ReportsState = { data: ReportsData | null; error: string | null; loading: boolean };
type ReportRangePreset = 'today' | 'yesterday' | 'last_7' | 'this_month' | 'custom';

const REPORT_RANGE_CHIPS: { label: string; value: ReportRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last_7' },
  { label: 'This month', value: 'this_month' },
  { label: 'Custom', value: 'custom' },
];

let reportsCache: ReportsData | null = null;
let reportsCacheKey = '';
let reportsCacheUpdatedAt = 0;
const reportsCacheTtlMs = 60_000;

/* ─── helper sub-components ──────────────────────────────────────────────── */
function Sparkline({ vals, up }: { vals: number[]; up: boolean }) {
  const w = 80, h = 28;
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const color = up ? '#10b981' : '#f87171';
  const fill  = up ? '#d1fae5' : '#fee2e2';
  const last  = vals[vals.length - 1];
  const lastX = w;
  const lastY = h - ((last - min) / range) * (h - 4) - 2;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
      <polyline fill={fill} stroke="none" points={`0,${h} ${pts} ${lastX},${h}`} opacity="0.3" />
    </svg>
  );
}

function DonutRing({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) {
  const R = 52, cx = 64, cy = 64, stroke = 14;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg width={128} height={128} viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {segments.map((s, i) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0;
        const dash = (pct / 100) * circ;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-(offset / 100) * circ + circ / 4}
            strokeLinecap="butt"
          />
        );
        offset += pct;
        return el;
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fontWeight={600} fill="#94a3b8" letterSpacing={0.5}>GROUPS</text>
    </svg>
  );
}

function HealthDot({ ready }: { ready: boolean }) {
  const color = ready ? '#10b981' : '#f59e0b';
  const label = ready ? 'Healthy' : 'Partial';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex w-2.5 h-2.5">
        {ready && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: color }} />}
        <span className="relative inline-flex rounded-full w-2.5 h-2.5" style={{ backgroundColor: color }} />
      </span>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </span>
  );
}

function SyncStatus({ status }: { status: string | null }) {
  const ok = status === 'SUCCEEDED';
  return (
    <span className={`text-[12px] font-semibold ${ok ? 'text-emerald-600' : status === 'PENDING' ? 'text-amber-600' : 'text-slate-400'}`}>
      {status ?? '—'}
    </span>
  );
}

function ReportDateField({
  align = 'left',
  label,
  onChange,
  open,
  setOpen,
  value,
}: {
  align?: 'left' | 'right';
  label: string;
  onChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
}) {
  return (
    <div className="w-[6.25rem]">
      <InlineCalendarDatePicker
        align={align}
        buttonClassName="flex h-8 w-full min-w-0 items-center rounded-md border border-transparent bg-white px-2.5 text-left text-[11.5px] font-semibold text-slate-700 focus:outline-none"
        label={label}
        onChange={onChange}
        open={open}
        renderTrigger={(pickerLabel) => (
          <>
            <span className="min-w-0">
              <span className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
              <span className="block truncate">{pickerLabel}</span>
            </span>
          </>
        )}
        setOpen={setOpen}
        value={value}
      />
    </div>
  );
}

/* ─── decorative sparkline data (trend shapes only, no historical API) ───── */
const SPARK_UP_A   = [30,38,28,44,40,52,48,60,54,68,58,72];
const SPARK_UP_B   = [18,20,22,19,24,21,26,28,25,30,27,34];
const SPARK_UP_C   = [60,68,72,65,80,75,88,84,90,96,92,100];
const SPARK_DOWN_A = [22,20,26,24,18,22,20,16,18,14,16,12];

const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const REV_BAR_PCT = [68, 72, 58, 84, 90, 100];

/* ─── main component ─────────────────────────────────────────────────────── */
export function ReportsPage() {
  const today = getLocalDate();
  const initialRange = getReportPresetRange('today', today);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState<ReportRangePreset>('today');
  const [openDatePicker, setOpenDatePicker] = useState<'from' | 'to' | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const initialCacheKey = `ALL:${initialRange.from}:${initialRange.to}`;
  const initialReportsCache = reportsCacheKey === initialCacheKey ? reportsCache : null;
  const [reportsState, setReportsState] = useState<ReportsState>(() => ({
    data: initialReportsCache,
    error: null,
    loading: !initialReportsCache,
  }));

  useEffect(() => {
    let active = true;
    const cacheKey = `${propertyFilter}:${from}:${to}`;
    const hasFreshCache = reportsCache && reportsCacheKey === cacheKey && Date.now() - reportsCacheUpdatedAt < reportsCacheTtlMs;
    if (hasFreshCache) {
      setReportsState({ data: reportsCache, error: null, loading: false });
      return () => { active = false; };
    }
    setReportsState((c) => ({ ...c, error: null, loading: !c.data }));
    api.get<ReportsData>('/reports/analytics', {
      params: { property_id: propertyFilter, from, to },
    })
      .then((res) => {
        if (!active) return;
        const nextData = res.data;
        reportsCache = nextData;
        reportsCacheKey = cacheKey;
        reportsCacheUpdatedAt = Date.now();
        setReportsState({ data: nextData, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setReportsState((c) => ({ data: c.data, error: getApiErrorMessage(err), loading: false }));
      });
    return () => { active = false; };
  }, [from, propertyFilter, to]);

  /* ── derived data ── */
  const properties  = reportsState.data?.properties ?? [];
  const hasMultiple = properties.length > 1;
  const selectedProperty = propertyFilter === 'ALL' ? null : properties.find((p) => p.id === propertyFilter) ?? null;
  const summary = reportsState.data?.summary;
  const roomNightsSold = summary?.room_nights_sold ?? 0;
  const activeGroups = summary?.active_reservation_groups ?? 0;
  const balanceDue = summary?.balance_due ?? 0;
  const billedTotal = summary?.billed_total ?? 0;
  const paidTotal = summary?.paid_total ?? 0;
  const blockedGroupCount = summary?.blocked_reservation_groups ?? 0;
  const statusSegments = reportsState.data?.reservation_posture ?? [];
  const donutTotal = statusSegments.reduce((total, segment) => total + segment.value, 0);
  const propertyPerformance = reportsState.data?.property_performance ?? [];
  const channelReadiness = reportsState.data?.channel_readiness ?? [];

  const postureAttention = [
    blockedGroupCount > 0 ? `${blockedGroupCount} provider booking${blockedGroupCount === 1 ? '' : 's'} blocked from import.` : null,
    balanceDue > 0 ? `${formatCurrency(balanceDue)} remains open across visible folios.` : null,
    channelReadiness.some((r) => !r.ready) ? 'At least one channel connection needs readiness attention.' : null,
  ].filter((m): m is string => Boolean(m));

  const loading = reportsState.loading && !reportsState.data;
  const error   = reportsState.error;
  function applyRangePreset(preset: ReportRangePreset) {
    setRangePreset(preset);
    if (preset === 'custom') return;
    const nextRange = getReportPresetRange(preset, today);
    setFrom(nextRange.from);
    setTo(nextRange.to);
  }

  function updateFromDate(value: string) {
    setFrom(value);
    if (value > to) setTo(value);
    setRangePreset('custom');
  }

  function updateToDate(value: string) {
    setTo(value);
    if (value < from) setFrom(value);
    setRangePreset('custom');
  }

  const kpis = [
    { label: 'Room nights sold',   value: roomNightsSold.toString(), delta: '+trend', up: true,  spark: SPARK_UP_A },
    { label: 'Active res groups',  value: activeGroups.toString(),   delta: '+trend', up: true,  spark: SPARK_UP_B },
    { label: 'Billed total',       value: formatCurrency(billedTotal), delta: '+trend', up: true, spark: SPARK_UP_C },
    { label: 'Balance due',        value: formatCurrency(balanceDue),  delta: balanceDue > 0 ? 'Open' : 'Clear', up: balanceDue === 0, spark: SPARK_DOWN_A },
  ];

  const liveChanCount = channelReadiness.filter((r) => r.ready).length;

  /* ── scope label ── */
  const scopeLabel = selectedProperty?.name ?? (properties.length === 1 ? properties[0]?.name : 'All properties') ?? 'All properties';

  return (
    <div className="space-y-5">
      <div className="w-full space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Overview</span>
              <span className="text-slate-300">·</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Reports</span>
            </div>
            <h1 className="text-[27px] font-bold text-slate-900 tracking-tight leading-none">Reports &amp; Analytics</h1>
            <p className="text-[13px] text-slate-500 mt-1.5">Performance, demand, financials, and channel readiness across your portfolio.</p>
          </div>

          {/* Property scope card */}
          <div className="flex-shrink-0 bg-white border border-black/[0.07] rounded-xl px-4 py-3 shadow-sm min-w-[200px]">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">Property scope</p>
            {hasMultiple ? (
              <div className="relative">
                <CustomSelect
                  disabled={loading}
                  onChange={setPropertyFilter}
                  options={[
                    { label: 'All properties', value: 'ALL' },
                    ...properties.map((p) => ({ label: p.name, value: p.id })),
                  ]}
                  value={propertyFilter}
                />
              </div>
            ) : (
              <p className="text-[13px] font-semibold text-slate-800">
                {loading ? 'Loading…' : scopeLabel}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-emerald-600">Live data</span>
            </div>
          </div>
        </div>

        {/* ── Date range scope ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {REPORT_RANGE_CHIPS.map((chip) => (
              <button
                className={`h-8 rounded-md px-3 text-[11.5px] font-semibold transition-colors ${
                  rangePreset === chip.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500'
                }`}
                key={chip.value}
                onClick={() => applyRangePreset(chip.value)}
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="flex h-10 items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1">
                <ReportDateField
                  label="From"
                  value={from}
                  open={openDatePicker === 'from'}
                  setOpen={(open) => setOpenDatePicker(open ? 'from' : null)}
                  onChange={updateFromDate}
                />
                <span className="-ml-1 mr-5 text-slate-300">→</span>
                <ReportDateField
                  align="right"
                  label="To"
                  value={to}
                  open={openDatePicker === 'to'}
                  setOpen={(open) => setOpenDatePicker(open ? 'to' : null)}
                  onChange={updateToDate}
                />
              </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-black/[0.06] p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <p className="min-w-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 leading-tight">{k.label}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${k.up ? 'bg-emerald-50 text-emerald-700' : balanceDue > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {k.delta}
                </span>
              </div>
              <strong className="text-[1.55rem] font-bold text-slate-900 tracking-tight leading-none block mb-3 truncate">{k.value}</strong>
              <Sparkline vals={k.spark} up={k.up} />
            </div>
          ))}
        </div>

        {/* ── Middle row: revenue chart + posture donut ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">

          {/* Revenue trend */}
          <div className="bg-white rounded-xl border border-black/[0.06] p-5 xl:mr-8">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Finance</p>
                <h2 className="text-sm font-semibold text-slate-800">Revenue trend (last 6 months)</h2>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                MTD: <span className="text-slate-700">{formatCurrency(billedTotal)}</span>
              </span>
            </div>
            <div className="flex items-end gap-2.5 h-[120px]">
              {REV_BAR_PCT.map((pct, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full rounded-md overflow-hidden bg-slate-100 flex items-end" style={{ height: 96 }}>
                    <div
                      className="w-full rounded-md transition-all duration-500"
                      style={{
                        height: `${pct}%`,
                        background: i === REV_BAR_PCT.length - 1
                          ? 'linear-gradient(180deg,#334155 0%,#1e293b 100%)'
                          : 'linear-gradient(180deg,#cbd5e1 0%,#94a3b8 100%)',
                      }}
                    />
                  </div>
                  <span className={`text-[10px] font-semibold ${i === REV_BAR_PCT.length - 1 ? 'text-slate-800' : 'text-slate-400'}`}>{MONTHS[i]}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-5 mt-4 pt-4 border-t border-slate-50">
              {[
                { label: 'Collected',        value: formatCurrency(paidTotal) },
                { label: 'Pending invoices', value: formatCurrency(balanceDue) },
                { label: 'Billed total',     value: formatCurrency(billedTotal) },
              ].map((r) => (
                <div key={r.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{r.label}</p>
                  <p className="text-sm font-bold text-slate-800">{r.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reservation posture donut */}
          <div className="bg-white rounded-xl border border-black/[0.06] p-5 xl:w-[380px] xl:justify-self-end">
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Posture</p>
              <h2 className="text-sm font-semibold text-slate-800">Reservation group status</h2>
            </div>
            <div className="flex items-center gap-4">
              <DonutRing segments={statusSegments} total={donutTotal} />
              <div className="space-y-2.5 flex-1">
                {statusSegments.map((s) => {
                  const pct = donutTotal > 0 ? Math.round((s.value / donutTotal) * 100) : 0;
                  return (
                    <div key={s.label} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-[12px] text-slate-600">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 w-7 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attention / all-clear banner */}
            {postureAttention.length > 0 ? (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-1">⚠ Attention</p>
                <ul className="space-y-1">
                  {postureAttention.map((msg) => (
                    <li key={msg} className="text-[11.5px] text-amber-800 leading-relaxed">{msg}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-1">✓ All clear</p>
                <p className="text-[11.5px] text-emerald-800">No blocked imports, open balance, or channel issues.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Property performance ── */}
        <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Property performance</p>
              <h2 className="text-sm font-semibold text-slate-800">{propertyPerformance.length} {propertyPerformance.length === 1 ? 'property' : 'properties'} in scope</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  {['Property', 'Res. groups', 'Blocked', 'Room nights', 'In house', 'Revenue share', 'Billed', 'Balance due'].map((h) => (
                    <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-5 py-3 bg-slate-50/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {propertyPerformance.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-6 text-sm text-slate-400 text-center">{loading ? 'Loading…' : 'No data'}</td></tr>
                )}
                {propertyPerformance.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 uppercase">{row.code.slice(0, 3)}</div>
                        <span className="text-[13px] font-semibold text-slate-900">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-600">{row.groups}</td>
                    <td className="px-5 py-3.5">
                      {row.blocked > 0
                        ? <span className="text-[12px] font-semibold text-rose-600">{row.blocked}</span>
                        : <span className="text-[12px] text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-600">{row.nights}</td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-600">{row.inhouse}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-slate-700" style={{ width: `${row.share}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700">{row.share}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-slate-800">{formatCurrency(row.billed)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[12px] font-semibold ${row.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatCurrency(row.balance)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Channel readiness ── */}
        <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Channel posture</p>
              <h2 className="text-sm font-semibold text-slate-800">OTA connections &amp; sync health</h2>
            </div>
            {channelReadiness.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {liveChanCount} / {channelReadiness.length} fully live
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  {['Property', 'OTA', 'Health', 'Rooms activated', 'Inventory sync', 'Booking import'].map((h) => (
                    <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-5 py-3 bg-slate-50/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {channelReadiness.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-6 text-sm text-slate-400 text-center">{loading ? 'Loading…' : 'No channel connections'}</td></tr>
                )}
                {channelReadiness.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-slate-900">{row.property_name}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[11px] font-semibold">{row.ota_name}</span>
                    </td>
                    <td className="px-5 py-3.5"><HealthDot ready={row.ready} /></td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${row.rooms_activated ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${row.rooms_activated ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        {row.rooms_activated ? 'Done' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5"><SyncStatus status={row.last_inventory_status} /></td>
                    <td className="px-5 py-3.5"><SyncStatus status={row.last_bookings_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateToInputValue(date);
}

function dateToInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getReportPresetRange(preset: Exclude<ReportRangePreset, 'custom'>, today: string) {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'last_7') return { from: addDays(today, -6), to: today };
  const current = new Date(`${today}T00:00:00`);
  const start = new Date(current.getFullYear(), current.getMonth(), 1);
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  return { from: dateToInputValue(start), to: dateToInputValue(end) };
}
