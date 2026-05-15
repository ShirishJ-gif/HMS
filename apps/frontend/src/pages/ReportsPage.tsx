import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Billing, ChannelConnection, DashboardSummary, Property, ReservationGroup } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { formatCurrency } from '../utils/format';
import { MetricCard, SignalCard, StatusBadge, TableCard, Panel, SectionHeading, DetailList, Th, Td, labelCls } from './ui';

type ReportsData = {
  billings: Billing[];
  channels: ChannelConnection[];
  dashboard: DashboardSummary;
  properties: Property[];
  reservationGroups: ReservationGroup[];
};
type ReportsState = {
  data: ReportsData | null;
  error: string | null;
  loading: boolean;
};

let reportsCache: ReportsData | null = null;
let reportsCacheUpdatedAt = 0;
const reportsCacheTtlMs = 60_000;

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
      return () => {
        active = false;
      };
    }

    setReportsState((current) => ({
      ...current,
      error: null,
      loading: !current.data,
    }));

    Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      fetchAllPages<Property>('/properties'),
      fetchAllPages<ReservationGroup>('/bookings/feed'),
      fetchAllPages<Billing>('/billings'),
      fetchAllPages<ChannelConnection>('/channels'),
    ])
      .then(([dashboardResponse, loadedProperties, loadedReservationGroups, loadedBillings, loadedChannels]) => {
        if (!active) return;
        const nextData = {
          billings: loadedBillings,
          channels: loadedChannels,
          dashboard: dashboardResponse.data,
          properties: loadedProperties,
          reservationGroups: loadedReservationGroups,
        };
        reportsCache = nextData;
        reportsCacheUpdatedAt = Date.now();
        setReportsState({ data: nextData, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setReportsState((current) => ({
          data: current.data,
          error: getApiErrorMessage(err),
          loading: false,
        }));
      });

    return () => {
      active = false;
    };
  }, []);

  const properties = reportsState.data?.properties ?? [];
  const singleProperty = properties.length === 1 ? properties[0] : null;
  const hasMultipleProperties = properties.length > 1;
  const selectedProperty = propertyFilter === 'ALL' ? null : properties.find((p) => p.id === propertyFilter) ?? null;
  const propertyScopeTitle = selectedProperty?.name ?? singleProperty?.name ?? (hasMultipleProperties ? 'All properties' : 'Property scope');
  const reservationGroups = (reportsState.data?.reservationGroups ?? []).filter((g) => propertyFilter === 'ALL' || g.property.id === propertyFilter);
  const importedGroups = reservationGroups.filter((g) => !g.import_blocked);
  const blockedGroups = reservationGroups.filter((g) => g.import_blocked);
  const billings = (reportsState.data?.billings ?? []).filter((b) => propertyFilter === 'ALL' || b.reservation_room.property.id === propertyFilter);
  const channels = (reportsState.data?.channels ?? []).filter((c) => propertyFilter === 'ALL' || c.property_id === propertyFilter);
  const roomLines = importedGroups.flatMap((g) => g.rooms.map((r) => ({ group: g, room: r })));
  const roomNightsSold = roomLines.reduce((t, e) => t + calcNights(e.room.arrival_date, e.room.departure_date), 0);
  const activeGroups = importedGroups.filter((g) => ['BOOKED', 'CHECKED_IN'].includes(g.reservation_status)).length;
  const cancelledGroups = importedGroups.filter((g) => g.reservation_status === 'CANCELLED').length;
  const checkedInRoomLines = roomLines.filter((e) => e.room.reservation_status === 'CHECKED_IN').length;
  const balanceDue = billings.reduce((t, b) => t + b.balance_due, 0);
  const billedTotal = billings.reduce((t, b) => t + b.total, 0);
  const paidTotal = billings.reduce((t, b) => t + (b.paid_total - b.refunded_total), 0);
  const propertyPerformance = properties
    .map((p) => {
      const pg = importedGroups.filter((g) => g.property.id === p.id);
      const pb = billings.filter((b) => b.reservation_room.property.id === p.id);
      const rl = pg.flatMap((g) => g.rooms);
      return { id: p.id, name: p.name, reservation_groups: pg.length, blocked_imports: blockedGroups.filter((g) => g.property.id === p.id).length, room_nights: rl.reduce((t, r) => t + calcNights(r.arrival_date, r.departure_date), 0), active_room_lines: rl.filter((r) => r.reservation_status === 'CHECKED_IN').length, billed_total: pb.reduce((t, b) => t + b.total, 0), balance_due: pb.reduce((t, b) => t + b.balance_due, 0) };
    })
    .filter((r) => propertyFilter === 'ALL' || r.id === propertyFilter);
  const channelReadiness = Array.from(channels.reduce((groups, c) => {
    const ex = groups.get(c.property_id);
    if (!ex || rankConn(c) > rankConn(ex)) groups.set(c.property_id, c);
    return groups;
  }, new Map<string, ChannelConnection>()).values()).map((c) => ({ id: c.id, property_name: c.property.name, ota_name: c.provider_config_summary?.ota_name ?? c.provider, ready: c.provider_config_summary?.setup_status.ready ?? false, rooms_activated: c.provider_config_summary?.setup_status.rooms_activated ?? false, last_inventory_status: c.sync_summary.inventory.last_status, last_bookings_status: c.sync_summary.bookings.last_status }));
  const totalGroupsInScope = reservationGroups.length;
  const importedGroupCount = importedGroups.length;
  const statusMix = [
    { label: 'Active', value: activeGroups, className: 'bg-emerald-500' },
    { label: 'Cancelled', value: cancelledGroups, className: 'bg-slate-400' },
    { label: 'Blocked', value: blockedGroups.length, className: 'bg-rose-500' },
  ];
  const postureAttention = [
    blockedGroups.length > 0 ? `${blockedGroups.length} provider booking${blockedGroups.length === 1 ? '' : 's'} blocked from import.` : null,
    balanceDue > 0 ? `${formatCurrency(balanceDue)} remains open across visible folios.` : null,
    channelReadiness.some((row) => !row.ready) ? 'At least one channel connection still needs readiness attention.' : null,
  ].filter((message): message is string => Boolean(message));
  const loading = reportsState.loading && !reportsState.data;
  const error = reportsState.error;

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Overview</p>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Reports &amp; Analytics</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
            Review reservation-group performance, blocked provider bookings, room-night demand, outstanding balance, and OTA readiness.
          </p>
        </div>
        {/* Property scope card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 min-w-[18rem] max-w-[22rem] space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Property scope</p>
              <h3 className="text-base font-bold text-slate-900 leading-tight">{reportsState.loading && !reportsState.data ? 'Loading…' : propertyScopeTitle}</h3>
            </div>
            {properties.length > 0 && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">Active</span>}
          </div>
          {hasMultipleProperties && (
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
              <span>Property</span>
              <CustomSelect disabled={reportsState.loading && !reportsState.data} onChange={setPropertyFilter} options={[{ label: 'All properties', value: 'ALL' }, ...properties.map((p) => ({ label: p.name, value: p.id }))]} value={propertyFilter} />
            </label>
          )}
          {(selectedProperty ?? singleProperty) ? (
            <div className="flex gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">{(selectedProperty ?? singleProperty)?.code}</span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{(selectedProperty ?? singleProperty)?.timezone}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400">{reportsState.loading && !reportsState.data ? 'Loading properties…' : 'Showing all properties.'}</p>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading reports…</p>}
      {error && <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Room nights sold" value={roomNightsSold.toString()} tone="gold" />
        <MetricCard label="Active reservation groups" value={activeGroups.toString()} tone="green" />
        <MetricCard label="Billed total" value={formatCurrency(billedTotal)} tone="blue" />
        <MetricCard label="Balance due" value={formatCurrency(balanceDue)} tone="rose" />
      </div>

      <div className="space-y-5">
        {/* Posture panel */}
        <Panel>
          <SectionHeading eyebrow="Portfolio" title="Reservation-group posture">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{totalGroupsInScope} groups in scope</span>
          </SectionHeading>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] gap-5">
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <PostureTile label="Active groups" value={activeGroups.toString()} detail={formatPercent(activeGroups, importedGroupCount)} tone="green" />
                <PostureTile label="Cancelled" value={cancelledGroups.toString()} detail={formatPercent(cancelledGroups, importedGroupCount)} tone="slate" />
                <PostureTile label="Blocked imports" value={blockedGroups.length.toString()} detail={formatPercent(blockedGroups.length, totalGroupsInScope)} tone="rose" />
                <PostureTile label="Checked-in rooms" value={checkedInRoomLines.toString()} detail={formatPercent(checkedInRoomLines, roomLines.length)} tone="blue" />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status mix</p>
                    <h4 className="text-sm font-bold text-slate-900">Imported vs blocked reservation groups</h4>
                  </div>
                  <span className="text-xs font-bold text-slate-500">{importedGroupCount}/{totalGroupsInScope || 0} imported</span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-200">
                  {statusMix.map((item) => item.value > 0 ? (
                    <span key={item.label} className={item.className} style={{ width: `${Math.max((item.value / Math.max(totalGroupsInScope, 1)) * 100, 4)}%` }} />
                  ) : null)}
                </div>
                <div className="flex flex-wrap gap-3 mt-3">
                  {statusMix.map((item) => (
                    <span key={item.label} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <span className={`w-2 h-2 rounded-full ${item.className}`} />
                      {item.label} {item.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className={postureAttention.length > 0 ? 'bg-amber-50 border border-amber-200 rounded-xl p-4' : 'bg-emerald-50 border border-emerald-200 rounded-xl p-4'}>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${postureAttention.length > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>Attention</p>
                {postureAttention.length > 0 ? (
                  <ul className="space-y-1.5">
                    {postureAttention.map((message) => <li key={message} className="text-xs font-semibold text-amber-800 leading-relaxed">{message}</li>)}
                  </ul>
                ) : (
                  <p className="text-xs font-semibold text-emerald-800 leading-relaxed">No blocked imports, open balance, or channel readiness issues in this scope.</p>
                )}
              </div>
              <DetailList rows={[
                { label: 'Collected total', value: formatCurrency(paidTotal) },
                { label: 'Billed total', value: formatCurrency(billedTotal) },
                { label: 'Today arrivals', value: String(reportsState.data?.dashboard.reservation_room_arrivals_today ?? 0) },
                { label: 'Occupancy snapshot', value: reportsState.data ? `${reportsState.data.dashboard.occupancy_rate}%` : '—' },
                { label: 'Open housekeeping', value: String(reportsState.data?.dashboard.open_housekeeping_tasks ?? 0) },
              ]} />
            </div>
          </div>
        </Panel>

        {/* Property performance table */}
        <TableCard title={`${propertyPerformance.length} property rows`} eyebrow="Property performance">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Property</Th><Th>Res. groups</Th><Th>Blocked</Th><Th>Room nights</Th><Th>In house</Th><Th>Billed</Th><Th>Balance due</Th></tr></thead>
            <tbody>
              {propertyPerformance.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                  <Td className="font-semibold text-slate-900">{row.name}</Td>
                  <Td>{row.reservation_groups}</Td>
                  <Td>{row.blocked_imports}</Td>
                  <Td>{row.room_nights}</Td>
                  <Td>{row.active_room_lines}</Td>
                  <Td>{formatCurrency(row.billed_total)}</Td>
                  <Td className="font-semibold text-rose-600">{formatCurrency(row.balance_due)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

        {/* Channel readiness table */}
        <TableCard title={`${channelReadiness.length} property channel rows`} eyebrow="Channel posture">
          <table className="w-full min-w-[600px]">
            <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Property</Th><Th>OTA</Th><Th>Ready</Th><Th>Rooms activated</Th><Th>Inventory sync</Th><Th>Booking import</Th></tr></thead>
            <tbody>
              {channelReadiness.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                  <Td className="font-semibold text-slate-900">{row.property_name}</Td>
                  <Td>{row.ota_name}</Td>
                  <Td><StatusBadge label={row.ready ? 'READY' : 'PENDING'} tone={row.ready ? 'green' : 'gold'} /></Td>
                  <Td><StatusBadge label={row.rooms_activated ? 'DONE' : 'PENDING'} tone={row.rooms_activated ? 'green' : 'gold'} /></Td>
                  <Td>{row.last_inventory_status ?? '—'}</Td>
                  <Td>{row.last_bookings_status ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </div>
    </section>
  );
}

function rankConn(c: ChannelConnection) {
  return [c.provider !== 'MOCK' ? 1 : 0, c.provider_config_summary?.setup_status.ready ? 1 : 0, c.provider_config_summary?.setup_status.rooms_activated ? 1 : 0, c.sync_summary.inventory.last_status === 'SUCCEEDED' ? 1 : 0, c.sync_summary.bookings.last_status === 'SUCCEEDED' ? 1 : 0].reduce((s, v) => s * 10 + v, 0);
}

function PostureTile({ detail, label, tone, value }: { detail: string; label: string; tone: 'blue' | 'green' | 'rose' | 'slate'; value: string }) {
  const toneClass = {
    blue: 'bg-sky-50 border-sky-100 text-sky-700',
    green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    rose: 'bg-rose-50 border-rose-100 text-rose-700',
    slate: 'bg-slate-50 border-slate-100 text-slate-600',
  }[tone];

  return (
    <div className={`rounded-xl border p-3.5 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mb-1">{label}</p>
      <strong className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none block">{value}</strong>
      <span className="text-xs font-semibold mt-1.5 block">{detail}</span>
    </div>
  );
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return '0% of scope';
  return `${Math.round((value / total) * 100)}% of scope`;
}

function calcNights(ci: string, co: string) {
  if (!ci || !co) return 0;
  return Math.max(0, Math.round((new Date(`${co}T00:00:00Z`).getTime() - new Date(`${ci}T00:00:00Z`).getTime()) / 86400000));
}
