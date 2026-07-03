import { useMemo, useState } from 'react';
import { samplePlatformHealth } from './sampleData';
import { DataPanel, HealthLine, HealthRow, Metric, Row, formatDate, formatLabel, formatLatency, formatUptime, propertyLabel } from './shared';
import type { PlatformApiTrace, PlatformHealth, PlatformProperty } from './types';

type ApiRouteSignal = {
  id: string;
  name: string;
  method: string;
  path: string;
  status: 'ok' | 'degraded' | 'error';
  calls: number;
  failedCalls: number;
  latency: number | null;
  lastCheckedAt: string;
  actorSummaries: string[];
  propertyTraffic: PropertyTrafficSignal[];
  x: number;
  y: number;
};

type PropertyTrafficSignal = {
  id: string;
  label: string;
  calls: number;
  failedCalls: number;
  latency: number | null;
  lastCalledAt: string;
};

const trafficWindowMs = 15 * 60 * 1000;

const sampleRouteLoad: Record<string, { calls: number; failedCalls: number }> = {
  '/auth/login': { calls: 460, failedCalls: 2 },
  '/platform-admin/properties': { calls: 210, failedCalls: 0 },
  '/bookings/groups': { calls: 890, failedCalls: 6 },
  '/rooms': { calls: 640, failedCalls: 0 },
  '/channels/sync': { calls: 164, failedCalls: 18 },
  '/webhooks/zodomus': { calls: 118, failedCalls: 12 },
};

export function Overview({
  health,
  properties,
  traces,
  loading,
}: {
  health: PlatformHealth | null;
  properties: PlatformProperty[];
  traces: PlatformApiTrace[];
  loading: boolean;
}) {
  return <OverviewContent health={health} properties={properties} traces={traces} loading={loading} sampleMode={false} />;
}

export function ApiHealthSamplePage() {
  const sampleProperties = [
    { id: 'sample-a', name: 'Harbour Grand Hotel', code: 'HBR-GRD' },
    { id: 'sample-b', name: 'Riverside Suites', code: 'RVR-STE' },
    { id: 'sample-c', name: 'Urban Nest Hotel', code: 'URB-NST' },
  ] as PlatformProperty[];

  return (
    <OverviewContent
      health={samplePlatformHealth}
      properties={sampleProperties}
      traces={[]}
      loading={false}
      sampleMode
    />
  );
}

function OverviewContent({
  health,
  properties,
  traces,
  loading,
  sampleMode,
}: {
  health: PlatformHealth | null;
  properties: PlatformProperty[];
  traces: PlatformApiTrace[];
  loading: boolean;
  sampleMode: boolean;
}) {
  return (
    <>
      {sampleMode && (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-[13px] font-semibold text-sky-800">
          Sample-only API traffic. This does not create database records or call real endpoints.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Service" value={health?.status ?? (loading ? '...' : 'unknown')} detail={health?.service} tone={health?.status === 'ok' ? 'good' : 'warn'} />
        <Metric label="Database" value={health?.checks.database.status ?? (loading ? '...' : 'unknown')} detail={formatLatency(health?.checks.database.latency_ms)} tone={health?.checks.database.status === 'ok' ? 'good' : 'bad'} />
        <Metric label="Query check" value={health?.checks.data_queries.status ?? '...'} detail={formatLatency(health?.checks.data_queries.latency_ms)} tone={health?.checks.data_queries.status === 'ok' ? 'good' : 'bad'} />
        <Metric label="Failed jobs 24h" value={health?.error_activity_24h.failed_background_jobs ?? 0} tone={(health?.error_activity_24h.failed_background_jobs ?? 0) > 0 ? 'bad' : 'neutral'} />
        <Metric label="Sync failures 24h" value={health?.error_activity_24h.failed_or_partial_syncs ?? 0} tone={(health?.error_activity_24h.failed_or_partial_syncs ?? 0) > 0 ? 'bad' : 'neutral'} />
        <Metric label="Webhook failures 24h" value={health?.error_activity_24h.webhook_failures ?? 0} tone={(health?.error_activity_24h.webhook_failures ?? 0) > 0 ? 'bad' : 'neutral'} />
      </div>

      <ApiTrafficMap health={health} traces={traces} properties={properties} sampleMode={sampleMode} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-[14px] font-bold text-slate-900">Backend service</h3>
            <div className="mt-4 space-y-3">
              <HealthLine label="Service" value={health?.service ?? 'hms-backend'} status={health?.status ?? 'degraded'} />
              <HealthLine label="Environment" value={health?.environment ?? 'unknown'} status="ok" />
              <HealthLine label="Version" value={health?.version ?? 'unknown'} status="ok" />
              <HealthLine label="Uptime" value={formatUptime(health?.uptime_seconds ?? 0)} status={health?.status ?? 'degraded'} />
              <HealthLine label="Last checked" value={health ? formatDate(health.timestamp) : 'Not checked'} status={health?.status ?? 'degraded'} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-[14px] font-bold text-slate-900">Database and data checks</h3>
            <div className="mt-4 space-y-3">
              <HealthLine label="Connection" value={formatLatency(health?.checks.database.latency_ms) ?? 'No latency'} status={health?.checks.database.status ?? 'error'} />
              <HealthLine label="Properties query" value={`${health?.checks.data_queries.properties_checked ?? properties.length} rows`} status={health?.checks.data_queries.status ?? 'error'} />
              <HealthLine label="Users query" value={`${health?.checks.data_queries.users_checked ?? 0} rows`} status={health?.checks.data_queries.status ?? 'error'} />
              <HealthLine label="Reservations query" value={`${health?.checks.data_queries.reservations_checked ?? 0} rows`} status={health?.checks.data_queries.status ?? 'error'} />
              <HealthLine label="Channels query" value={`${health?.checks.data_queries.channels_checked ?? 0} rows`} status={health?.checks.data_queries.status ?? 'error'} />
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <DataPanel title="Critical API routes">
            {health?.critical_apis.map((route) => (
              <HealthRow
                key={`${route.method}-${route.path}`}
                title={route.name}
                meta={`${route.method} ${route.path}${route.latency_ms == null ? '' : ` · ${route.latency_ms} ms`}`}
                status={route.status}
              />
            ))}
          </DataPanel>

          <DataPanel title="Integration health">
            {health && (
              <HealthRow
                title="Zodomus"
                meta={
                  health.integrations.zodomus.latest_successful_sync
                    ? `Last successful ${health.integrations.zodomus.latest_successful_sync.sync_type} sync · ${formatDate(health.integrations.zodomus.latest_successful_sync.created_at)}`
                    : 'No successful sync recorded'
                }
                status={health.integrations.zodomus.status}
              />
            )}
          </DataPanel>

          <DataPanel title="Recent incidents">
            {health?.recent_incidents.map((incident) => (
              <Row
                key={incident.id}
                title={`${incident.area} · ${formatLabel(incident.severity)}`}
                meta={`${propertyLabel(incident.property)} · ${incident.message}`}
                value={formatDate(incident.occurred_at)}
              />
            ))}
          </DataPanel>
        </section>
      </div>
    </>
  );
}

function ApiTrafficMap({ health, traces, properties, sampleMode }: { health: PlatformHealth | null; traces: PlatformApiTrace[]; properties: PlatformProperty[]; sampleMode: boolean }) {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const routes = useMemo(() => buildRouteSignals(health, traces, properties, sampleMode), [health, properties, sampleMode, traces]);
  const filteredRoutes = useMemo(() => filterRouteSignals(routes, appliedQuery), [appliedQuery, routes]);
  const totalCalls = routes.reduce((sum, route) => sum + route.calls, 0);
  const totalFailed = routes.reduce((sum, route) => sum + route.failedCalls, 0);
  const avgLatency = average(routes.map((route) => route.latency).filter((value): value is number => value != null));
  const healthyRoutes = routes.filter((route) => route.status === 'ok').length;
  const problemRoutes = filteredRoutes.filter((route) => route.status !== 'ok' || route.failedCalls > 0);
  const propertyRows = matchingPropertyRows(routes, query);
  const appliedLabel = appliedQuery.trim();
  const showPropertyMatches = query.trim().length > 0;
  const applySearch = (nextQuery = query) => {
    setAppliedQuery(nextQuery.trim());
    setQuery(nextQuery.trim());
  };
  const selectPropertySearch = (nextQuery: string) => {
    setAppliedQuery(nextQuery.trim());
    setQuery('');
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-slate-900">API traffic health map</h3>
          <p className="mt-1 text-[12px] text-slate-500">
            Moving lines mean healthy traffic. Red stopped lines mean critical-route failures in the last 15 minutes or degraded checks.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(13rem,1fr)_30rem] xl:w-[46rem]">
          <div className="relative">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch();
                if (event.key === 'Escape') {
                  setQuery('');
                  setAppliedQuery('');
                }
              }}
              placeholder="Search route, user, property"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            {showPropertyMatches && (
              <div className="absolute left-0 right-0 top-11 z-20 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/80">
                {propertyRows.length ? propertyRows.slice(0, 6).map((row) => (
                  <button
                    key={row.property.id}
                    type="button"
                    onClick={() => selectPropertySearch(row.property.label)}
                    className={`block w-full rounded-md px-2 py-2 text-left transition hover:bg-slate-100 ${row.property.failedCalls > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[12px] font-medium text-slate-700">{row.property.label}</p>
                    </div>
                  </button>
                )) : (
                  <div className="rounded-md bg-slate-50 px-2 py-3 text-[12px] font-bold text-slate-500">
                    No matching property traffic in the current window.
                  </div>
                )}
              </div>
            )}
            {appliedLabel && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-indigo-50 px-2 py-1.5 text-[11px] font-bold text-indigo-700">
                <span className="min-w-0 truncate">Showing: {appliedLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedQuery('');
                    setQuery('');
                  }}
                  className="flex-shrink-0 rounded bg-white px-2 py-0.5 text-[10px] font-black text-indigo-700"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <MiniMetric label="Calls" value={totalCalls || '-'} />
            <MiniMetric label="Failed" value={totalFailed} tone={totalFailed > 0 ? 'bad' : 'good'} />
            <MiniMetric label="Latency" value={avgLatency == null ? '-' : `${avgLatency}ms`} />
            <MiniMetric label="Healthy" value={`${healthyRoutes}/${routes.length || 0}`} tone={healthyRoutes === routes.length ? 'good' : 'warn'} />
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative min-h-[760px] bg-slate-50/80">
          {filteredRoutes.length ? (
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1040 760" role="img" aria-label="API health traffic map">
              <defs>
                <filter id="apiNodeShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#0f172a" floodOpacity="0.08" />
                </filter>
              </defs>
              <circle cx="520" cy="376" r="44" fill="#ffffff" stroke="#dbeafe" strokeWidth="1.4" filter="url(#apiNodeShadow)" />
              <text x="520" y="368" textAnchor="middle" className="fill-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">HMS</text>
              <text x="520" y="391" textAnchor="middle" className="fill-slate-950 text-[20px] font-black">API</text>
              {filteredRoutes.map((route) => {
                const isBad = route.status !== 'ok' || route.failedCalls > 0;
                const stroke = isBad ? '#f43f5e' : '#10b981';
                const pulseSize = Math.max(5, Math.min(16, route.calls / (sampleMode ? 55 : 4)));
                const lineStart = centerCircleEdgePoint(route.x, route.y);
                return (
                  <g key={route.id}>
                    <line
                      x1={lineStart.x}
                      y1={lineStart.y}
                      x2={route.x}
                      y2={route.y}
                      stroke={stroke}
                      strokeWidth={isBad ? 2.2 : 2}
                      strokeLinecap="round"
                      strokeDasharray={isBad ? '8 8' : '5 10'}
                      className={isBad ? '' : 'animate-api-flow-line'}
                    />
                    <circle cx={route.x} cy={route.y} r={pulseSize} fill={stroke} opacity={isBad ? 0.18 : 0.14} className={isBad ? '' : 'animate-api-beep'} />
                    <circle cx={route.x} cy={route.y} r="4.5" fill={stroke} />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="flex h-[760px] items-center justify-center px-4 text-center text-[13px] font-semibold text-slate-500">
              {routes.length ? 'No matching API signals.' : 'No API health checks are available yet.'}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0">
            {filteredRoutes.map((route) => (
              <RouteNode key={route.id} route={route} sampleMode={sampleMode} />
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white p-4 xl:border-l xl:border-t-0">
          <h4 className="text-[12px] font-bold text-slate-800">Problem signals</h4>
          <div className="mt-3 space-y-2">
            {problemRoutes.length ? problemRoutes.map((route) => (
              <div key={route.id} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[12px] font-black text-rose-950">{route.name}</p>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-rose-700">{route.failedCalls} failed</span>
                </div>
                <p className="mt-1 truncate text-[11px] font-semibold text-rose-700">{route.method} {route.path}</p>
                <p className="mt-1 text-[10.5px] text-rose-600">{formatLatency(route.latency) ?? 'No latency'} avg · last check {formatDate(route.lastCheckedAt)}</p>
                <p className="mt-1 truncate text-[10.5px] font-semibold text-rose-700">
                  {route.actorSummaries.length ? route.actorSummaries.join(' · ') : 'No user or property attached'}
                </p>
              </div>
              )) : (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-4 text-[12px] font-bold text-emerald-700">
                  {query.trim() ? 'No matching failed or degraded API signals.' : 'No failed or degraded API signals.'}
                </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RouteNode({ route, sampleMode }: { route: ApiRouteSignal; sampleMode: boolean }) {
  const left = `${(route.x / 1040) * 100}%`;
  const top = `${(route.y / 760) * 100}%`;
  const isBad = route.status !== 'ok' || route.failedCalls > 0;

  return (
    <div
      className={`absolute w-[13.5rem] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white px-3 py-2 shadow-sm ${
        isBad ? 'border-rose-200' : 'border-emerald-100'
      }`}
      style={{ left, top }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-black text-slate-900">{route.name}</p>
          <p className="mt-0.5 truncate text-[10.5px] font-semibold text-slate-500">{route.method} {route.path}</p>
        </div>
        <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black ${isBad ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {isBad ? 'Issue' : 'OK'}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <NodeStat label={sampleMode ? 'calls' : 'checks'} value={route.calls} />
        <NodeStat label="fail" value={route.failedCalls} bad={route.failedCalls > 0} />
        <NodeStat label="ms" value={route.latency ?? '-'} />
      </div>
    </div>
  );
}

function NodeStat({ label, value, bad = false }: { label: string; value: string | number; bad?: boolean }) {
  return (
    <div className="rounded-md bg-slate-50 px-1.5 py-1">
      <p className={`text-[11px] font-black ${bad ? 'text-rose-700' : 'text-slate-800'}`}>{value}</p>
      <p className="text-[9px] font-bold uppercase text-slate-400">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = {
    neutral: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700',
  }[tone];

  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5">
      <p className={`truncate text-[13px] font-black ${toneClass}`}>{value}</p>
      <p className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function buildRouteSignals(health: PlatformHealth | null, traces: PlatformApiTrace[], properties: PlatformProperty[], sampleMode: boolean): ApiRouteSignal[] {
  const criticalRoutes = health?.critical_apis ?? [];
  const routeMatchers = criticalRoutes.map((route) => ({
    route,
    key: traceKey(route.method, route.path),
    pattern: routePattern(route.method, route.path),
  }));
  const groupedTraces = groupOperationalTraces(traces, routeMatchers.map((matcher) => ({ key: matcher.key, pattern: matcher.pattern })));
  const propertyNames = new Map(properties.map((property) => [property.id, propertyLabel(property)]));

  return criticalRoutes.map((route, index) => {
    const key = routeMatchers[index]?.key ?? traceKey(route.method, route.path);
    const records = groupedTraces.get(key) ?? [];
    const sampled = sampleRouteLoad[route.path];
    const completed = records.filter((record) => record.status !== 'PENDING');
    const failedCalls = sampleMode
      ? sampled?.failedCalls ?? (route.status === 'ok' ? 0 : 4)
      : records.length
        ? records.filter(isFailedTrace).length
        : route.status === 'ok'
          ? 0
          : 1;
    const avgLatency = records.length
      ? average(completed.map((record) => record.duration_ms).filter((value): value is number => value != null))
      : route.latency_ms;
    const latestTrace = latestTraceRecord(records);
    const point = routePoint(index, criticalRoutes.length);

    return {
      id: `${route.method}-${route.path}`,
      name: route.name,
      method: route.method,
      path: route.path,
      status: failedCalls > 0 ? 'error' as const : route.status,
      calls: sampleMode ? sampled?.calls ?? 90 : records.length || 1,
      failedCalls,
      latency: avgLatency,
      lastCheckedAt: latestTrace?.started_at ?? route.last_checked_at,
      actorSummaries: actorSummaries(records.filter(isFailedTrace), propertyNames),
      propertyTraffic: propertyTraffic(records, propertyNames),
      x: point.x,
      y: point.y,
    };
  });
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function groupOperationalTraces(traces: PlatformApiTrace[], routeMatchers: Array<{ key: string; pattern: RegExp }>) {
  const grouped = new Map<string, PlatformApiTrace[]>();
  const since = Date.now() - trafficWindowMs;
  for (const trace of traces) {
    if (trace.direction !== 'INBOUND') continue;
    if (Date.parse(trace.started_at) < since) continue;
    const normalizedTrace = traceKey(trace.method, trace.path);
    const matcher = routeMatchers.find((candidate) => candidate.pattern.test(normalizedTrace));
    if (!matcher) continue;
    const key = matcher.key;
    grouped.set(key, [...(grouped.get(key) ?? []), trace]);
  }
  return grouped;
}

function traceKey(method: string, path: string) {
  return `${method.toUpperCase()} ${path.split('?')[0] || '/'}`;
}

function routePattern(method: string, path: string) {
  const escaped = path
    .split('?')[0]
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:id/g, '[^/]+');
  return new RegExp(`^${method.toUpperCase()} ${escaped}$`);
}

function routePoint(index: number, total: number) {
  const centerX = 520;
  const centerY = 376;
  const radiusX = 382;
  const radiusY = 288;
  const angle = -Math.PI / 2 + (index / Math.max(total, 1)) * Math.PI * 2;
  return {
    x: Math.round(centerX + Math.cos(angle) * radiusX),
    y: Math.round(centerY + Math.sin(angle) * radiusY),
  };
}

function centerCircleEdgePoint(targetX: number, targetY: number) {
  const centerX = 520;
  const centerY = 376;
  const radius = 44;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: Math.round(centerX + (dx / length) * radius),
    y: Math.round(centerY + (dy / length) * radius),
  };
}

function isFailedTrace(trace: PlatformApiTrace) {
  return trace.status === 'FAILED' || (trace.status_code != null && trace.status_code >= 400);
}

function latestTraceRecord(records: PlatformApiTrace[]) {
  return records.reduce<PlatformApiTrace | null>((latest, record) => {
    if (!latest) return record;
    return Date.parse(record.started_at) > Date.parse(latest.started_at) ? record : latest;
  }, null);
}

function actorSummaries(records: PlatformApiTrace[], propertyNames: Map<string, string>) {
  const summaries = new Set<string>();
  for (const record of records) {
    if (record.property_id) {
      summaries.add(propertyNames.get(record.property_id) ?? `Property ${shortId(record.property_id)}`);
    } else if (record.property_ids.length) {
      summaries.add(`${record.property_ids.length} org properties`);
    } else if (record.user_email) {
      summaries.add(record.user_email);
    } else {
      summaries.add('Unauthenticated');
    }
  }
  return Array.from(summaries).slice(0, 3);
}

function propertyTraffic(records: PlatformApiTrace[], propertyNames: Map<string, string>) {
  const grouped = new Map<string, { id: string; label: string; records: PlatformApiTrace[] }>();

  for (const record of records) {
    const propertyIds = record.property_id ? [record.property_id] : record.property_ids;
    for (const propertyId of propertyIds) {
      const label = propertyNames.get(propertyId) ?? `Property ${shortId(propertyId)}`;
      const existing = grouped.get(propertyId) ?? { id: propertyId, label, records: [] };
      existing.records.push(record);
      grouped.set(propertyId, existing);
    }
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const completed = entry.records.filter((record) => record.status !== 'PENDING');
      return {
        id: entry.id,
        label: entry.label,
        calls: entry.records.length,
        failedCalls: entry.records.filter(isFailedTrace).length,
        latency: average(completed.map((record) => record.duration_ms).filter((value): value is number => value != null)),
        lastCalledAt: latestTraceRecord(entry.records)?.started_at ?? new Date().toISOString(),
      };
    })
    .sort((a, b) => b.failedCalls - a.failedCalls || b.calls - a.calls || a.label.localeCompare(b.label));
}

function filterRouteSignals(routes: ApiRouteSignal[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return routes;

  return routes.filter((route) =>
    [
      route.name,
      route.method,
      route.path,
      route.status,
      ...route.actorSummaries,
      ...route.propertyTraffic.flatMap((property) => [property.id, property.label]),
    ].some((value) => value.toLowerCase().includes(normalized)),
  );
}

function matchingPropertyRows(routes: ApiRouteSignal[], query: string) {
  const normalized = query.trim().toLowerCase();
  const byProperty = new Map<string, PropertyTrafficSignal>();

  for (const route of routes) {
    for (const property of route.propertyTraffic) {
      if (normalized && !property.id.toLowerCase().includes(normalized) && !property.label.toLowerCase().includes(normalized)) continue;
      const existing = byProperty.get(property.id);
      if (!existing) {
        byProperty.set(property.id, property);
        continue;
      }

      byProperty.set(property.id, {
        ...existing,
        calls: existing.calls + property.calls,
        failedCalls: existing.failedCalls + property.failedCalls,
        latency: average([existing.latency, property.latency].filter((value): value is number => value != null)),
        lastCalledAt: Date.parse(property.lastCalledAt) > Date.parse(existing.lastCalledAt) ? property.lastCalledAt : existing.lastCalledAt,
      });
    }
  }

  return Array.from(byProperty.values())
    .sort((a, b) => b.failedCalls - a.failedCalls || b.calls - a.calls || a.label.localeCompare(b.label))
    .map((property) => ({ property }));
}

function shortId(value: string) {
  return value.slice(0, 8);
}
