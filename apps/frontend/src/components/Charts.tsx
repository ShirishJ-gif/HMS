// import { useRef, useState } from 'react';

// export type ChartPoint = { label: string; value: number };
// export type ChartSegment = { label: string; value: number; color: string };

// export function DonutChart({ segments }: { segments: ChartSegment[] }) {
//   const [hovered, setHovered] = useState<string | null>(null);
//   const total = segments.reduce((sum, segment) => sum + segment.value, 0);
//   const CX = 90, CY = 90, R_OUTER = 68, R_INNER = 43, GAP = 0.025;

//   let angle = -Math.PI / 2;
//   const slices = segments.map((segment) => {
//     const pct = total > 0 ? segment.value / total : 0;
//     const sweep = pct * Math.PI * 2 - GAP;
//     const start = angle + GAP / 2;
//     const end = start + sweep;
//     angle += pct * Math.PI * 2;
//     const radius = hovered === segment.label ? R_OUTER + 5 : R_OUTER;
//     const x1 = CX + radius * Math.cos(start), y1 = CY + radius * Math.sin(start);
//     const x2 = CX + radius * Math.cos(end), y2 = CY + radius * Math.sin(end);
//     const xi1 = CX + R_INNER * Math.cos(start), yi1 = CY + R_INNER * Math.sin(start);
//     const xi2 = CX + R_INNER * Math.cos(end), yi2 = CY + R_INNER * Math.sin(end);
//     const large = sweep > Math.PI ? 1 : 0;
//     const path = `M${xi1},${yi1} L${x1},${y1} A${radius},${radius} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${R_INNER},${R_INNER} 0 ${large} 0 ${xi1},${yi1} Z`;
//     return { ...segment, path, pct };
//   });

//   const active = hovered ? slices.find((slice) => slice.label === hovered) : null;

//   return (
//     <div className="flex flex-col items-center gap-3">
//       <svg width="180" height="180" viewBox="0 0 180 180" style={{ overflow: 'visible' }}>
//         {slices.map((slice) => (
//           <path
//             key={slice.label}
//             d={slice.path}
//             fill={slice.color}
//             opacity={hovered && hovered !== slice.label ? 0.35 : 1}
//             style={{ cursor: 'pointer', transition: 'all 0.18s ease' }}
//             onMouseEnter={() => setHovered(slice.label)}
//             onMouseLeave={() => setHovered(null)}
//           />
//         ))}
//         {active ? (
//           <>
//             <text x={CX} y={CY - 8} textAnchor="middle" style={{ fontSize: 20, fontWeight: 800, fill: active.color }}>{active.value}</text>
//             <text x={CX} y={CY + 8} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 700, fill: '#64748b', letterSpacing: 0.8 }}>{active.label.toUpperCase()}</text>
//             <text x={CX} y={CY + 22} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: active.color }}>{Math.round(active.pct * 100)}%</text>
//           </>
//         ) : (
//           <>
//             <text x={CX} y={CY - 6} textAnchor="middle" style={{ fontSize: 24, fontWeight: 800, fill: '#0f172a' }}>{total}</text>
//             <text x={CX} y={CY + 12} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 700, fill: '#94a3b8', letterSpacing: 1.2 }}>TOTAL</text>
//           </>
//         )}
//       </svg>
//       <div className="w-full space-y-1.5">
//         {slices.map((slice) => (
//           <div
//             key={slice.label}
//             className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${hovered === slice.label ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
//             onMouseEnter={() => setHovered(slice.label)}
//             onMouseLeave={() => setHovered(null)}
//           >
//             <div className="flex items-center gap-2.5 min-w-0">
//               <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
//               <span className="text-[12px] font-semibold text-slate-700 truncate">{slice.label}</span>
//             </div>
//             <div className="flex items-center gap-1.5 flex-shrink-0">
//               <span className="text-[11.5px] font-bold text-slate-900 w-5 text-right">{slice.value}</span>
//               <span className="text-[10px] font-semibold text-slate-400 w-8 text-right">{Math.round(slice.pct * 100)}%</span>
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// export function LineChart({
//   points,
//   stroke,
//   strokeLight,
//   gradTop,
//   label,
//   formatter = (value: number) => value.toString(),
//   suffix = '',
//   yTicks = 4,
// }: {
//   points: ChartPoint[];
//   stroke: string;
//   strokeLight: string;
//   gradTop: string;
//   label: string;
//   formatter?: (value: number) => string;
//   suffix?: string;
//   yTicks?: number;
// }) {
//   const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);
//   const svgRef = useRef<SVGSVGElement>(null);

//   const W = 520, H = 180, PAD_L = 42, PAD_R = 12, PAD_T = 14, PAD_B = 28;
//   const plotW = W - PAD_L - PAD_R;
//   const plotH = H - PAD_T - PAD_B;
//   const max = Math.max(...points.map((point) => point.value), 1);
//   const min = Math.min(...points.map((point) => point.value));
//   const rawRange = max - min;
//   const vMin = Math.max(0, min - rawRange * 0.12);
//   const vMax = max + rawRange * 0.12;
//   const vRange = Math.max(vMax - vMin, 1);
//   const px = (index: number) => PAD_L + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
//   const py = (value: number) => PAD_T + plotH - ((value - vMin) / vRange) * plotH;
//   const plotted = points.map((point, index) => ({ ...point, x: px(index), y: py(point.value) }));
//   const linePath = bezierPath(plotted);
//   const areaPath = plotted.length > 0
//     ? `${linePath} L${plotted[plotted.length - 1].x},${PAD_T + plotH} L${plotted[0].x},${PAD_T + plotH} Z`
//     : '';
//   const yTickVals = Array.from({ length: yTicks }, (_, index) => vMin + (index / (yTicks - 1)) * vRange);
//   const latest = plotted[plotted.length - 1];
//   const gradId = `grad-${label}`;

//   function handleMouseMove(event: { clientX: number }) {
//     const svg = svgRef.current;
//     if (!svg) return;
//     const rect = svg.getBoundingClientRect();
//     const mx = ((event.clientX - rect.left) / rect.width) * W;
//     let closest = 0, minDist = Infinity;
//     plotted.forEach((point, index) => {
//       const distance = Math.abs(point.x - mx);
//       if (distance < minDist) {
//         minDist = distance;
//         closest = index;
//       }
//     });
//     setTooltip({ i: closest, x: plotted[closest].x, y: plotted[closest].y });
//   }

//   return (
//     <div>
//       <div className="relative">
//         <svg ref={svgRef} className="w-full" height={H} viewBox={`0 0 ${W} ${H}`} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} style={{ cursor: 'crosshair' }}>
//           <defs>
//             <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
//               <stop offset="0%" stopColor={gradTop} stopOpacity="0.55" />
//               <stop offset="70%" stopColor={gradTop} stopOpacity="0.08" />
//               <stop offset="100%" stopColor={gradTop} stopOpacity="0" />
//             </linearGradient>
//           </defs>
//           {yTickVals.map((value, index) => {
//             const gy = py(value);
//             return (
//               <g key={index}>
//                 <line x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke={index === 0 ? '#e2e8f0' : '#f1f5f9'} strokeWidth={index === 0 ? '1' : '0.75'} strokeDasharray={index === 0 ? '' : '3 4'} />
//                 <text x={PAD_L - 5} y={gy + 4} textAnchor="end" style={{ fontSize: 9, fill: '#b0bac7', fontWeight: 500 }}>{formatter(Math.round(value))}</text>
//               </g>
//             );
//           })}
//           <path d={areaPath} fill={`url(#${gradId})`} />
//           <path d={linePath} fill="none" stroke={strokeLight} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" />
//           <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
//           {tooltip && (
//             <>
//               <line x1={plotted[tooltip.i].x} x2={plotted[tooltip.i].x} y1={PAD_T} y2={PAD_T + plotH} stroke={stroke} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
//               <circle cx={plotted[tooltip.i].x} cy={plotted[tooltip.i].y} r="6" fill={stroke} stroke="#fff" strokeWidth="2.5" opacity="0.9" />
//             </>
//           )}
//           {plotted.filter((_, index) => shouldShowDateTick(index, plotted.length)).map((point) => (
//             <text key={`${point.label}-${point.x}`} x={point.x} y={H - 8} textAnchor="middle" style={{ fontSize: 9, fill: '#b0bac7', fontWeight: 600 }}>{point.label}</text>
//           ))}
//         </svg>
//         {tooltip && (() => {
//           const point = plotted[tooltip.i];
//           const isRight = point.x > W * 0.65;
//           return (
//             <div
//               className="pointer-events-none absolute z-10 rounded-xl shadow-xl text-[11px] font-semibold whitespace-nowrap border"
//               style={{
//                 background: 'rgba(15,23,42,0.92)',
//                 borderColor: 'rgba(255,255,255,0.08)',
//                 padding: '7px 12px',
//                 top: `${Math.max(2, (point.y / H * 100)) - 6}%`,
//                 left: isRight ? undefined : `${(point.x / W * 100) + 2}%`,
//                 right: isRight ? `${(1 - point.x / W) * 100 + 2}%` : undefined,
//                 transform: 'translateY(-50%)',
//               }}
//             >
//               <div style={{ color: '#94a3b8', fontSize: 9, marginBottom: 2 }}>{points[tooltip.i].label}</div>
//               <div style={{ color: strokeLight, fontSize: 13, fontWeight: 800 }}>{formatter(points[tooltip.i].value)}{suffix}</div>
//             </div>
//           );
//         })()}
//       </div>
//       <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-1">
//         <div className="flex items-center gap-2">
//           <span className="w-6 h-0.5 rounded-full" style={{ backgroundColor: stroke }} />
//           <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">30-day trend</span>
//         </div>
//         <div className="flex items-center gap-1.5">
//           <span className="text-[10.5px] text-slate-400 font-medium">Latest</span>
//           <span className="text-[14px] font-extrabold text-slate-900">{latest ? formatter(latest.value) + suffix : '-'}</span>
//         </div>
//       </div>
//     </div>
//   );
// }

// export function BarChart({ points, stroke }: { points: ChartPoint[]; stroke: string }) {
//   const [hovered, setHovered] = useState<number | null>(null);
//   const max = Math.max(...points.map((point) => point.value), 1);
//   const avg = points.reduce((sum, point) => sum + point.value, 0) / Math.max(points.length, 1);
//   const plotHeight = 146;
//   return (
//     <div>
//       <div className="flex h-[180px] flex-col justify-end">
//         <div className="flex h-[146px] w-full items-end gap-[3px] border-b border-slate-100 pb-1">
//           {points.map((point, index) => {
//             const h = point.value > 0 ? Math.max(10, Math.round((point.value / max) * plotHeight)) : 4;
//             return (
//               <div key={index} className="relative flex flex-1 flex-col items-center justify-end" onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}>
//                 {hovered === index && (
//                   <div className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-slate-800 px-1.5 py-0.5 text-[9.5px] font-bold text-white pointer-events-none">
//                     {point.label}: {point.value}
//                   </div>
//                 )}
//                 <div className="w-full rounded-t-sm transition-all duration-150" style={{ height: h, backgroundColor: stroke, opacity: hovered === index ? 1 : 0.6 }} />
//               </div>
//             );
//           })}
//         </div>
//         <div className="mt-1.5 flex gap-[3px]">
//           {points.map((point, index) => (
//             <div key={`${point.label}-${index}`} className="flex-1 text-center">
//               {shouldShowDateTick(index, points.length) && (
//                 <span className="block text-[9px] font-semibold text-slate-400 whitespace-nowrap">{point.label}</span>
//               )}
//             </div>
//           ))}
//         </div>
//       </div>
//       <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-2.5">
//         <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">30-day avg</span>
//         <span className="text-[13px] font-extrabold text-slate-900">{avg.toFixed(1)}/day</span>
//       </div>
//     </div>
//   );
// }

// function bezierPath(points: Array<ChartPoint & { x: number; y: number }>) {
//   if (points.length < 2) return '';
//   let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
//   for (let i = 1; i < points.length; i++) {
//     const tx = (points[i].x - points[i - 1].x) * 0.38;
//     d += ` C${(points[i - 1].x + tx).toFixed(2)},${points[i - 1].y.toFixed(2)} ${(points[i].x - tx).toFixed(2)},${points[i].y.toFixed(2)} ${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
//   }
//   return d;
// }

// function shouldShowDateTick(index: number, count: number) {
//   if (index % 7 === 0) return true;
//   const previousWeeklyTick = Math.floor((count - 1) / 7) * 7;
//   return index === count - 1 && index - previousWeeklyTick >= 4;
// }



// import { useEffect, useState } from 'react';
// import { api } from '../api/client';
// import { Billing, DashboardSummary, ReservationGroup } from '../api/types';
// import { PaginatedResponse } from '../api/pagination';
// import { fetchAllPages } from '../api/pagination';
// import { BarChart, ChartPoint, ChartSegment, DonutChart, LineChart } from '../components/Charts';
// import { useAsync } from '../hooks/useAsync';
// import { formatCurrency } from '../utils/format';
// import { MetricCard, StatusBadge, Panel, PageHeader, SectionHeading, ErrorMsg, LoadingMsg, TableCard, Th, Td } from './ui';

// const SOURCE_COLORS = ['#7B9DD6', '#6DBDA4', '#A897D4', '#D4A26A', '#C47E8F', '#64B5C8'];

// export function DashboardPage() {
//   const [reloadKey, setReloadKey] = useState(0);
//   const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
//   const { data, error, loading } = useAsync(
//     async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
//     [reloadKey],
//   );
//   const { data: recentData } = useAsync(
//     async () => (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', { params: { page: 1, limit: 25, status: 'BOOKED' } })).data,
//     [reloadKey],
//   );
//   const { data: chartData } = useAsync(
//     async () => {
//       const [reservationGroups, billings] = await Promise.all([
//         fetchAllPages<ReservationGroup>('/bookings/feed', { params: { include_cancelled: true } }),
//         fetchAllPages<Billing>('/billings'),
//       ]);
//       return { billings, reservationGroups };
//     },
//     [reloadKey],
//   );
//   const recentReservations = (recentData?.data ?? [])
//     .filter((reservation) => reservation.reservation_status === 'BOOKED')
//     .map((reservation) => ({
//       reservation,
//       arrival: reservation.rooms[0]?.arrival_date ?? reservation.arrival_date ?? null,
//       departure: reservation.rooms[reservation.rooms.length - 1]?.departure_date ?? reservation.departure_date ?? null,
//     }))
//     .filter((entry) => !entry.arrival || entry.arrival >= getLocalDate())
//     .sort((left, right) => (left.arrival ?? '').localeCompare(right.arrival ?? ''))
//     .slice(0, 6);
//   const chartReservationGroups = chartData?.reservationGroups ?? [];
//   const chartBillings = chartData?.billings ?? [];

//   useEffect(() => { if (data) setLastUpdatedAt(new Date()); }, [data]);

//   useEffect(() => {
//     const id = window.setInterval(() => setReloadKey((v) => v + 1), 15000);
//     const onFocus = () => setReloadKey((v) => v + 1);
//     const onVisible = () => { if (document.visibilityState === 'visible') setReloadKey((v) => v + 1); };
//     window.addEventListener('focus', onFocus);
//     document.addEventListener('visibilitychange', onVisible);
//     return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
//   }, []);

//   const refreshBtn = (
//     <div className="flex flex-col items-end gap-1">
//       <button
//         type="button"
//         disabled={loading}
//         onClick={() => setReloadKey((v) => v + 1)}
//         className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition"
//       >
//         <svg aria-hidden="true" className={`w-3 h-3 ${loading ? 'animate-spin-icon' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
//           <path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M20 19v-4h-4"/>
//         </svg>
//         {loading ? 'Refreshing…' : 'Refresh'}
//       </button>
//       <span aria-live="polite" className="text-[11px] text-slate-400">
//         {lastUpdatedAt ? `Updated ${formatTime(lastUpdatedAt)}` : 'Auto-syncs every 15 s'}
//       </span>
//     </div>
//   );

//   return (
//     <section className="space-y-6">
//       <PageHeader
//         eyebrow="Overview"
//         title="Dashboard"
//         subtitle="Live operating posture, OTA reservation pressure, and today's financial signals."
//       >
//         {refreshBtn}
//       </PageHeader>

//       {loading && !data && <LoadingMsg>Loading dashboard…</LoadingMsg>}
//       {error && <ErrorMsg>{error}</ErrorMsg>}

//       {data && (
//         <>
//           {(() => {
//             const sourceSegments = buildSourceSegments(chartReservationGroups);
//             const occupancySeries = buildOccupancySeries(chartReservationGroups, data.total_rooms);
//             const revenueSeries = buildRevenueSeries(chartBillings);
//             const bookingsSeries = buildBookingsSeries(chartReservationGroups);
//             const latestOccupancy = occupancySeries[occupancySeries.length - 1]?.value ?? 0;
//             const latestRevenue = revenueSeries[revenueSeries.length - 1]?.value ?? 0;

//             return (
//               <>
//           {/* KPI row */}
//           <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
//             <MetricCard label="Reservations today" value={data.reservation_groups_today.toString()} sub="Active groups" />
//             <MetricCard label="Occupancy rate" value={`${data.occupancy_rate}%`} sub={`${data.occupied_rooms} of ${data.total_rooms} rooms`} />
//             <MetricCard label="Available rooms" value={String(data.total_rooms - data.occupied_rooms)} sub={`of ${data.total_rooms} total`} />
//             <MetricCard label="Revenue today" value={formatCurrency(data.revenue_today)} sub="Collected" />
//             <MetricCard label="Open HK tasks" value={String(data.open_housekeeping_tasks)} sub="Housekeeping queue" />
//           </div>

//           {/* Room utilisation bar */}
//           {data.total_rooms > 0 && (
//             <Panel className="!py-4">
//               <div className="flex flex-wrap items-center gap-5">
//                 <div className="flex-shrink-0">
//                   <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-0.5">Room utilisation</p>
//                   <p className="text-sm font-semibold text-slate-800">
//                     {data.occupied_rooms} occupied · {data.total_rooms - data.occupied_rooms} free
//                   </p>
//                 </div>
//                 <div className="flex-1 min-w-[100px]">
//                   <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
//                     <div
//                       className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
//                       style={{ width: `${Math.min(data.occupancy_rate, 100)}%` }}
//                     />
//                   </div>
//                 </div>
//                 <StatusBadge
//                   label={`${data.occupancy_rate}%`}
//                   tone={data.occupancy_rate >= 75 ? 'rose' : data.occupancy_rate >= 50 ? 'gold' : 'green'}
//                 />
//               </div>
//             </Panel>
//           )}

//           <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px] gap-5 items-stretch">
//             {recentReservations.length > 0 && (
//               <TableCard eyebrow="Upcoming arrivals" title="Booked reservations">
//                 <table className="min-w-[1240px] text-[12.5px]">
//                   <thead>
//                     <tr>
//                       <Th className="px-6">Guest</Th>
//                       <Th className="w-[210px] px-6">Ref</Th>
//                       <Th className="px-6">Property</Th>
//                       <Th className="px-6">Arrival</Th>
//                       <Th className="px-6">Departure</Th>
//                       <Th className="w-[112px] px-6">Rooms</Th>
//                       <Th className="px-6">Amount</Th>
//                       <Th className="px-6">Status</Th>
//                     </tr>
//                   </thead>
//                   <tbody className="divide-y divide-slate-50">
//                     {recentReservations.map(({ reservation: r, arrival, departure }) => {
//                       return (
//                         <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
//                           <Td className="max-w-[180px] truncate px-6 font-medium text-slate-800">
//                             {r.primary_guest?.name ?? 'Guest'}
//                           </Td>
//                           <Td className="max-w-[210px] px-6 text-slate-400 font-mono text-[10.5px]">
//                             <span className="block truncate" title={r.external_reservation_id}>{r.external_reservation_id}</span>
//                           </Td>
//                           <Td className="max-w-[240px] truncate px-6 text-slate-500">{r.property.name}</Td>
//                           <Td className="whitespace-nowrap px-6 text-slate-500">{arrival ? fmtDate(arrival) : '—'}</Td>
//                           <Td className="whitespace-nowrap px-6 text-slate-500">{departure ? fmtDate(departure) : '—'}</Td>
//                           <Td className="px-6 text-slate-500">{r.rooms.length}</Td>
//                           <Td className="whitespace-nowrap px-6 text-slate-700 font-medium">
//                             {r.total_amount != null ? formatCurrency(r.total_amount) : '—'}
//                           </Td>
//                           <Td className="px-6">
//                             <StatusBadge
//                               label={r.reservation_status.replace(/_/g, ' ')}
//                               tone={
//                                 r.reservation_status === 'CHECKED_IN' ? 'green' :
//                                 r.reservation_status === 'CHECKED_OUT' ? 'slate' :
//                                 r.reservation_status === 'CANCELLED' ? 'rose' : 'gold'
//                               }
//                             />
//                           </Td>
//                         </tr>
//                       );
//                     })}
//                   </tbody>
//                 </table>
//               </TableCard>
//             )}

//             <Panel className="h-full !p-4">
//               <SectionHeading eyebrow="Reservations" title="Reservations by source" />
//               {sourceSegments.length > 0 ? (
//                 <DonutChart segments={sourceSegments} />
//               ) : (
//                 <EmptyChartState>No reservation source data yet.</EmptyChartState>
//               )}
//             </Panel>
//           </div>

//           {/* Trend charts — 3-column row */}
//           <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
//             <Panel>
//               <SectionHeading eyebrow="Last 30 days" title="Occupancy trend">
//                 <StatusBadge label={`${latestOccupancy}% today`} tone={latestOccupancy >= 75 ? 'rose' : latestOccupancy >= 50 ? 'gold' : 'green'} />
//               </SectionHeading>
//               <LineChart points={occupancySeries} stroke="#5B80C8" strokeLight="#93B4E0" gradTop="#7B9DD6" label="occ" formatter={v => `${Math.round(v)}%`} />
//             </Panel>

//             <Panel>
//               <SectionHeading eyebrow="Last 30 days" title="Revenue trend">
//                 <StatusBadge label={formatCurrency(latestRevenue)} tone={latestRevenue > 0 ? 'green' : 'default'} />
//               </SectionHeading>
//               <LineChart points={revenueSeries} stroke="#3D9E82" strokeLight="#6DBDA4" gradTop="#6DBDA4" label="rev" formatter={formatCurrency} />
//             </Panel>

//             <Panel>
//               <SectionHeading eyebrow="Last 30 days" title="Bookings trend">
//                 <StatusBadge label={`${bookingsSeries[bookingsSeries.length - 1]?.value ?? 0} today`} tone="gold" />
//               </SectionHeading>
//               <BarChart points={bookingsSeries} stroke="#D4A26A" />
//             </Panel>
//           </div>

//               </>
//             );
//           })()}
//         </>
//       )}
//     </section>
//   );
// }

// function formatTime(d: Date) {
//   return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
// }

// function getLocalDate() {
//   const now = new Date();
//   return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// }

// function fmtDate(s: string) {
//   return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(s));
// }

// function buildSourceSegments(groups: ReservationGroup[]): ChartSegment[] {
//   const counts = new Map<string, number>();
//   for (const group of groups) {
//     if (group.import_blocked || group.reservation_status === 'CANCELLED') continue;
//     const label = sourceLabel(group);
//     counts.set(label, (counts.get(label) ?? 0) + 1);
//   }

//   const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
//   const visible = sorted.slice(0, 5);
//   const otherTotal = sorted.slice(5).reduce((total, [, value]) => total + value, 0);
//   const entries = otherTotal > 0 ? [...visible, ['Other', otherTotal] as const] : visible;

//   return entries.map(([label, value], index) => ({
//     label,
//     value,
//     color: SOURCE_COLORS[index % SOURCE_COLORS.length],
//   }));
// }

// function sourceLabel(group: ReservationGroup) {
//   const raw = group.source?.trim() || (group.channel_connection_id ? 'OTA' : 'Direct');
//   return raw
//     .replace(/_/g, ' ')
//     .toLowerCase()
//     .replace(/\b\w/g, (letter) => letter.toUpperCase());
// }

// function buildOccupancySeries(groups: ReservationGroup[], totalRooms: number): ChartPoint[] {
//   const days = lastNDays(30);
//   return days.map((day) => {
//     const occupiedRoomNights = groups.reduce((total, group) => {
//       if (group.import_blocked) return total;
//       return total + group.rooms.filter((room) => (
//         room.reservation_status !== 'CANCELLED' &&
//         room.arrival_date <= day &&
//         room.departure_date > day
//       )).length;
//     }, 0);
//     const value = totalRooms > 0 ? Math.round((occupiedRoomNights / totalRooms) * 100) : 0;
//     return { label: chartDateLabel(day), value };
//   });
// }

// function buildRevenueSeries(billings: Billing[]): ChartPoint[] {
//   const days = lastNDays(30);
//   const revenueByDay = new Map(days.map((day) => [day, 0]));

//   for (const billing of billings) {
//     for (const payment of billing.payments) {
//       const day = payment.created_at.slice(0, 10);
//       if (!revenueByDay.has(day)) continue;
//       const signedAmount = payment.status === 'REFUNDED' ? -payment.amount : payment.status === 'SUCCEEDED' ? payment.amount : 0;
//       revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + signedAmount);
//     }
//   }

//   return days.map((day) => ({
//     label: chartDateLabel(day),
//     value: Math.max(0, revenueByDay.get(day) ?? 0),
//   }));
// }

// function lastNDays(count: number) {
//   const today = new Date(`${getLocalDate()}T00:00:00`);
//   return Array.from({ length: count }, (_, index) => toDateKey(addDays(today, index - count + 1)));
// }

// function addDays(date: Date, days: number) {
//   const next = new Date(date);
//   next.setDate(next.getDate() + days);
//   return next;
// }

// function toDateKey(date: Date) {
//   return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// }

// function chartDateLabel(day: string) {
//   return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00`));
// }

// function buildBookingsSeries(groups: ReservationGroup[]): ChartPoint[] {
//   const days = lastNDays(30);
//   const countByDay = new Map(days.map((day) => [day, 0]));
//   for (const group of groups) {
//     if (group.import_blocked || group.reservation_status === 'CANCELLED') continue;
//     const day = group.created_at.slice(0, 10);
//     if (countByDay.has(day)) countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
//   }
//   return days.map((day) => ({ label: chartDateLabel(day), value: countByDay.get(day) ?? 0 }));
// }

// function EmptyChartState({ children }: { children: string }) {
//   return (
//     <div className="flex min-h-[156px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-sm font-medium text-slate-400">
//       {children}
//     </div>
//   );
// }
