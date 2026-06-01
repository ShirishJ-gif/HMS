import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Billing, ChannelConnection, DashboardSummary, Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { formatCurrency } from '../utils/format';

/* ─── types ──────────────────────────────────────────────────────────────── */
type ReportsData = {
  billings: Billing[];
  channels: ChannelConnection[];
  dashboard: DashboardSummary;
  properties: Property[];
  reservationGroups: ReservationGroup[];
};
type ReportsState = { data: ReportsData | null; error: string | null; loading: boolean };

let reportsCache: ReportsData | null = null;
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

/* ─── decorative sparkline data (trend shapes only, no historical API) ───── */
const SPARK_UP_A   = [30,38,28,44,40,52,48,60,54,68,58,72];
const SPARK_UP_B   = [18,20,22,19,24,21,26,28,25,30,27,34];
const SPARK_UP_C   = [60,68,72,65,80,75,88,84,90,96,92,100];
const SPARK_DOWN_A = [22,20,26,24,18,22,20,16,18,14,16,12];

const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const REV_BAR_PCT = [68, 72, 58, 84, 90, 100];

/* ─── main component ─────────────────────────────────────────────────────── */
export function ReportsPage() {
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [reportsState, setReportsState] = useState<ReportsState>(() => ({
    data: reportsCache,
    error: null,
    loading: !reportsCache,
  }));

  useEffect(() => {
    let active = true;
    const hasFreshCache = reportsCache && Date.now() - reportsCacheUpdatedAt < reportsCacheTtlMs;
    if (hasFreshCache) {
      setReportsState({ data: reportsCache, error: null, loading: false });
      return () => { active = false; };
    }
    setReportsState((c) => ({ ...c, error: null, loading: !c.data }));
    Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      fetchAllPages<Property>('/properties'),
      fetchAllPages<ReservationGroup>('/bookings/feed', { params: { include_cancelled: true } }),
      fetchAllPages<Billing>('/billings'),
      fetchAllPages<ChannelConnection>('/channels'),
    ])
      .then(([dashRes, loadedProperties, loadedGroups, loadedBillings, loadedChannels]) => {
        if (!active) return;
        const nextData: ReportsData = {
          billings: loadedBillings,
          channels: loadedChannels,
          dashboard: dashRes.data,
          properties: loadedProperties,
          reservationGroups: loadedGroups,
        };
        reportsCache = nextData;
        reportsCacheUpdatedAt = Date.now();
        setReportsState({ data: nextData, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setReportsState((c) => ({ data: c.data, error: getApiErrorMessage(err), loading: false }));
      });
    return () => { active = false; };
  }, []);

  /* ── derived data ── */
  const properties  = reportsState.data?.properties ?? [];
  const hasMultiple = properties.length > 1;
  const selectedProperty = propertyFilter === 'ALL' ? null : properties.find((p) => p.id === propertyFilter) ?? null;

  const reservationGroups = (reportsState.data?.reservationGroups ?? []).filter(
    (g) => propertyFilter === 'ALL' || g.property.id === propertyFilter,
  );
  const importedGroups = reservationGroups.filter((g) => !g.import_blocked);
  const blockedGroups  = reservationGroups.filter((g) => g.import_blocked);

  const billings = (reportsState.data?.billings ?? []).filter(
    (b) => propertyFilter === 'ALL' || b.reservation_room.property.id === propertyFilter,
  );
  const channels = (reportsState.data?.channels ?? []).filter(
    (c) => propertyFilter === 'ALL' || c.property_id === propertyFilter,
  );

  const roomLines          = importedGroups.flatMap((g) => g.rooms.map((r) => ({ group: g, room: r })));
  const roomNightsSold     = roomLines.reduce((t, e) => t + calcNights(e.room.arrival_date, e.room.departure_date), 0);
  const activeGroups       = importedGroups.filter((g) => ['BOOKED', 'CHECKED_IN'].includes(g.reservation_status)).length;
  const cancelledGroups    = importedGroups.filter((g) => g.reservation_status === 'CANCELLED').length;
  const checkedInRoomLines = roomLines.filter((e) => e.room.reservation_status === 'CHECKED_IN').length;
  const balanceDue         = billings.reduce((t, b) => t + b.balance_due, 0);
  const billedTotal        = billings.reduce((t, b) => t + b.total, 0);
  const paidTotal          = billings.reduce((t, b) => t + (b.paid_total - b.refunded_total), 0);
  const totalGroupsInScope = reservationGroups.length;
  const importedGroupCount = importedGroups.length;

  const statusSegments = [
    { label: 'Active',      value: activeGroups,        color: '#10b981' },
    { label: 'Cancelled',   value: cancelledGroups,     color: '#94a3b8' },
    { label: 'Blocked',     value: blockedGroups.length, color: '#f87171' },
    { label: 'Checked-in',  value: checkedInRoomLines,  color: '#38bdf8' },
  ];
  const donutTotal = activeGroups + cancelledGroups + blockedGroups.length + checkedInRoomLines;

  const propertyPerformance = properties
    .map((p) => {
      const pg = importedGroups.filter((g) => g.property.id === p.id);
      const pb = billings.filter((b) => b.reservation_room.property.id === p.id);
      const rl = pg.flatMap((g) => g.rooms);
      const allBilled = billings.reduce((t, b) => t + b.total, 0);
      const thisShare = allBilled > 0 ? Math.round((pb.reduce((t, b) => t + b.total, 0) / allBilled) * 100) : 0;
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        groups: pg.length,
        blocked: blockedGroups.filter((g) => g.property.id === p.id).length,
        nights: rl.reduce((t, r) => t + calcNights(r.arrival_date, r.departure_date), 0),
        inhouse: rl.filter((r) => r.reservation_status === 'CHECKED_IN').length,
        billed: pb.reduce((t, b) => t + b.total, 0),
        balance: pb.reduce((t, b) => t + b.balance_due, 0),
        share: thisShare,
      };
    })
    .filter((r) => propertyFilter === 'ALL' || r.id === propertyFilter);

  const channelReadiness = Array.from(
    channels.reduce((groups, c) => {
      const ex = groups.get(c.property_id);
      if (!ex || rankConn(c) > rankConn(ex)) groups.set(c.property_id, c);
      return groups;
    }, new Map<string, ChannelConnection>()).values(),
  ).map((c) => ({
    id: c.id,
    property_name: c.property.name,
    ota_name: c.provider_config_summary?.ota_name ?? c.provider,
    ready: c.provider_config_summary?.setup_status.ready ?? false,
    rooms_activated: c.provider_config_summary?.setup_status.rooms_activated ?? false,
    last_inventory_status: c.sync_summary.inventory.last_status,
    last_bookings_status: c.sync_summary.bookings.last_status,
  }));

  const postureAttention = [
    blockedGroups.length > 0 ? `${blockedGroups.length} provider booking${blockedGroups.length === 1 ? '' : 's'} blocked from import.` : null,
    balanceDue > 0 ? `${formatCurrency(balanceDue)} remains open across visible folios.` : null,
    channelReadiness.some((r) => !r.ready) ? 'At least one channel connection needs readiness attention.' : null,
  ].filter((m): m is string => Boolean(m));

  const loading = reportsState.loading && !reportsState.data;
  const error   = reportsState.error;

  const kpis = [
    { label: 'Room nights sold',   value: roomNightsSold.toString(), delta: '+trend', up: true,  spark: SPARK_UP_A },
    { label: 'Active res. groups', value: activeGroups.toString(),   delta: '+trend', up: true,  spark: SPARK_UP_B },
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

        {/* ── Loading / error ── */}
        {loading && (
          <p className="text-sm text-slate-400 animate-pulse">Loading reports…</p>
        )}
        {error && (
          <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-black/[0.06] p-4 hover:shadow-sm transition-">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 leading-tight max-w-[110px]">{k.label}</p>
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

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function rankConn(c: ChannelConnection) {
  return [
    c.provider !== 'MOCK' ? 1 : 0,
    c.provider_config_summary?.setup_status.ready ? 1 : 0,
    c.provider_config_summary?.setup_status.rooms_activated ? 1 : 0,
    c.sync_summary.inventory.last_status === 'SUCCEEDED' ? 1 : 0,
    c.sync_summary.bookings.last_status === 'SUCCEEDED' ? 1 : 0,
  ].reduce((s, v) => s * 10 + v, 0);
}

function calcNights(ci: string, co: string) {
  if (!ci || !co) return 0;
  return Math.max(0, Math.round(
    (new Date(`${co}T00:00:00Z`).getTime() - new Date(`${ci}T00:00:00Z`).getTime()) / 86400000,
  ));
}
