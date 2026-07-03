import { useMemo, useState } from 'react';
import { CustomSelect } from '../../components/CustomSelect';
import { formatDate, formatLabel } from './shared';
import type { PlatformApiTrace, PlatformHealth, PlatformIntegrationSummary, PlatformLogs } from './types';

type StatTone = 'emerald' | 'sky' | 'amber' | 'violet' | 'rose' | 'slate';
type TimeRange = '15m' | '1h' | '24h' | 'all';
type ApiKindFilter = 'ALL' | 'SYSTEM' | 'ZODOMUS';
type StatusFilter = 'ALL' | 'SUCCEEDED' | 'FAILED' | 'PENDING';
type Point = { label: string; requests: number; latency: number; errors: number };
type EndpointRow = { endpoint: string; method: string; status: string; latency: string; requests: number; errorRate: string; checked: string };
type IncidentRow = { id: string; time: string; severity: string; message: string; endpoint: string; retry: string };

export function ApiMonitorPage({
  health,
  integrations,
  logs,
  traces,
  loading,
}: {
  health: PlatformHealth | null;
  integrations: PlatformIntegrationSummary | null;
  logs: PlatformLogs | null;
  traces: PlatformApiTrace[];
  loading: boolean;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [kindFilter, setKindFilter] = useState<ApiKindFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const filteredTraces = useMemo(
    () => filterTraces(traces, timeRange, kindFilter, statusFilter),
    [kindFilter, statusFilter, timeRange, traces],
  );
  const completedTraces = filteredTraces.filter((trace) => trace.status !== 'PENDING');
  const failedTraces = completedTraces.filter(isFailedTrace);
  const averageLatency = average(completedTraces.map((trace) => trace.duration_ms).filter(isNumber));
  const errorRate = completedTraces.length ? (failedTraces.length / completedTraces.length) * 100 : 0;
  const requestsLastMinute = filteredTraces.filter((trace) => Date.now() - Date.parse(trace.started_at) <= 60_000).length;
  const points = buildTrafficPoints(filteredTraces, timeRange);
  const endpointRows = buildEndpointRows(health, filteredTraces);
  const incidentRows = buildIncidentRows(health, logs, filteredTraces);
  const otaRows = buildOtaRows(integrations);

  function exportLogs() {
    const payload = {
      exported_at: new Date().toISOString(),
      filters: { time_range: timeRange, api_type: kindFilter, status: statusFilter },
      summary: {
        traces: filteredTraces.length,
        completed_traces: completedTraces.length,
        failed_traces: failedTraces.length,
        average_latency_ms: averageLatency,
        error_rate_percent: Number(errorRate.toFixed(1)),
      },
      endpoint_rows: endpointRows,
      incident_rows: incidentRows,
      traces: filteredTraces,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-monitor-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <PulseIcon />
          </span>
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-950">API Health Monitor</h3>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              Live backend health, trace latency, OTA sync load, and errors
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportLogs}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Export Logs
          </button>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <FilterPill
          label="Time Range"
          value={timeRange}
          onChange={(value) => setTimeRange(value as TimeRange)}
          options={[
            { value: '15m', label: 'Last 15 min' },
            { value: '1h', label: 'Last 1 hour' },
            { value: '24h', label: 'Last 24 hours' },
            { value: 'all', label: 'All traces' },
          ]}
        />
        <FilterPill
          label="API Type"
          value={kindFilter}
          onChange={(value) => setKindFilter(value as ApiKindFilter)}
          options={[
            { value: 'ALL', label: 'All traces' },
            { value: 'SYSTEM', label: 'System API' },
            { value: 'ZODOMUS', label: 'Zodomus API' },
          ]}
        />
        <FilterPill
          label="Status"
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'SUCCEEDED', label: 'Succeeded' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'PENDING', label: 'Pending' },
          ]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="API Status"
          value={health?.status === 'ok' ? 'Healthy' : health?.status ? 'Degraded' : loading ? 'Loading' : 'Unknown'}
          detail={health ? `${health.service} · ${health.environment}` : 'Waiting for platform health'}
          delta={health?.checks.api.status === 'ok' ? 'Online' : 'Issue'}
          tone={health?.status === 'ok' ? 'emerald' : 'amber'}
          spark={points.map((point) => point.requests)}
        />
        <KpiCard
          title="Avg Response Time"
          value={averageLatency == null ? (health?.checks.data_queries.latency_ms ? `${health.checks.data_queries.latency_ms}ms` : '-') : `${averageLatency}ms`}
          detail={completedTraces.length ? `${completedTraces.length} completed traced calls` : 'Using health-check latency until traces exist'}
          delta={averageLatency != null && averageLatency > 500 ? 'Slow' : 'Normal'}
          tone={averageLatency != null && averageLatency > 500 ? 'amber' : 'sky'}
          spark={points.map((point) => point.latency)}
        />
        <KpiCard
          title="Error Rate"
          value={`${errorRate.toFixed(1)}%`}
          detail={`${failedTraces.length} failed of ${completedTraces.length} completed calls`}
          delta={failedTraces.length ? 'Review' : 'Stable'}
          tone={failedTraces.length ? 'rose' : 'emerald'}
          spark={points.map((point) => point.errors)}
        />
        <KpiCard
          title="Requests / Minute"
          value={String(requestsLastMinute)}
          detail={`${filteredTraces.length} of ${traces.length} traces shown`}
          delta="Live buffer"
          tone="violet"
          spark={points.map((point) => point.requests)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <PerformancePanel points={points} hasData={filteredTraces.length > 0} timeRange={timeRange} />
        <OtaSyncPanel rows={otaRows} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <EndpointPanel rows={endpointRows} />
        <LogsPanel rows={incidentRows} />
      </div>

      {incidentRows[0] && (
        <div className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
              <AlertIcon />
            </span>
            <div>
              <p className="text-[13px] font-black uppercase tracking-wide text-rose-700">Critical Alert</p>
              <p className="mt-1 text-[12px] font-medium text-rose-900">{incidentRows[0].message}</p>
            </div>
          </div>
          <span className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-[12px] font-black text-rose-600">
            {incidentRows[0].endpoint}
          </span>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, detail, delta, tone, spark }: { title: string; value: string; detail: string; delta: string; tone: StatTone; spark: number[] }) {
  const toneClasses = toneClass(tone);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border ${toneClasses}`}>
          {tone === 'emerald' ? <ShieldIcon /> : tone === 'amber' || tone === 'rose' ? <AlertIcon /> : <PulseIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-slate-600">{title}</p>
          <p className={`mt-1 truncate text-2xl font-black ${tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-950'}`}>{value}</p>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{detail}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${toneClasses}`}>{delta}</span>
        <Sparkline values={spark} tone={tone} />
      </div>
    </section>
  );
}

function PerformancePanel({ points, hasData, timeRange }: { points: Point[]; hasData: boolean; timeRange: TimeRange }) {
  const W = 760;
  const H = 300;
  const left = 42;
  const right = 42;
  const top = 28;
  const bottom = 38;
  const chartW = W - left - right;
  const chartH = H - top - bottom;
  const maxRequests = Math.max(...points.map((point) => point.requests), 1);
  const maxLatency = Math.max(...points.map((point) => point.latency), 1);
  const maxError = Math.max(...points.map((point) => point.errors), 1);
  const step = chartW / Math.max(points.length - 1, 1);
  const requestPoints = points.map((point, index) => ({
    x: left + index * step,
    y: top + chartH - (point.requests / maxRequests) * chartH,
  }));
  const latencyPath = linePath(points.map((point, index) => ({
    x: left + index * step,
    y: top + chartH - (point.latency / maxLatency) * chartH,
  })));
  const errorPath = linePath(points.map((point, index) => ({
    x: left + index * step,
    y: top + chartH - (point.errors / maxError) * chartH,
  })));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-black text-slate-900">API Load & Performance Over Time</h3>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-sky-500" /> Requests</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-emerald-500" /> Avg Latency</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-rose-500" /> Failed</span>
          </div>
        </div>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700">
          {timeRangeLabel(timeRange)}
        </span>
      </div>
      {!hasData && (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-[12px] font-semibold text-slate-500">
          No API traces in memory yet. Use the app for a minute, then refresh this page.
        </div>
      )}
      <svg className="mt-3 h-[300px] w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="API load and performance chart">
        {[0, Math.ceil(maxRequests / 2), maxRequests].map((tick) => {
          const y = top + chartH - (tick / maxRequests) * chartH;
          return (
            <g key={tick}>
              <line x1={left} x2={W - right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={tick === 0 ? undefined : '4 5'} />
              <text x={left - 10} y={y + 4} textAnchor="end" className="fill-sky-500 text-[10px] font-bold">{tick}</text>
            </g>
          );
        })}
        <path d={areaPath(requestPoints, top + chartH)} fill="#3b82f6" opacity="0.14" />
        <path d={linePath(requestPoints)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        <path d={latencyPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
        <path d={errorPath} fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinejoin="round" />
        {points.map((point, index) => {
          const x = left + index * step;
          const show = index % 2 === 0 || index === points.length - 1;
          return show ? <text key={point.label} x={x} y={H - 12} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">{point.label}</text> : null;
        })}
      </svg>
    </section>
  );
}

function OtaSyncPanel({ rows }: { rows: ReturnType<typeof buildOtaRows> }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-black text-slate-900">OTA Sync Health</h3>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700">{rows.length} channels</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)_repeat(4,auto)] items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 shadow-sm">
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-black text-white ${providerBg(row.tone)}`}>{row.code}</span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-slate-900">{row.name}</p>
              <p className={`mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold ${row.failed > 0 ? 'text-rose-700' : 'text-emerald-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" /> {row.status}</p>
            </div>
            <SmallCol label="Updated" value={row.updated} />
            <SmallCol label="Provider" value={row.provider} />
            <SmallCol label="Syncs" value={row.syncLogs} />
            <SmallCol label="Failed" value={row.failed} bad={row.failed > 0} />
          </div>
        )) : (
          <EmptyState text="No integration channels returned by the platform API." />
        )}
      </div>
    </section>
  );
}

function EndpointPanel({ rows }: { rows: EndpointRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <PanelHeader title="Endpoint Health" action={`${rows.length} endpoints`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
            <tr>
              {['Endpoint', 'Method', 'Status', 'Avg Latency', 'Requests', 'Error Rate', 'Last Checked'].map((head) => (
                <th key={head} className="px-4 py-3">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[12px]">
            {rows.map((row) => (
              <tr key={`${row.method}-${row.endpoint}`}>
                <td className="px-4 py-3 font-bold text-slate-900">{row.endpoint}</td>
                <td className="px-4 py-3"><MethodPill method={row.method} /></td>
                <td className="px-4 py-3"><StatusText status={row.status} /></td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.latency}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.requests}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.errorRate}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.checked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState text="No endpoint checks or traces are available yet." />}
    </section>
  );
}

function LogsPanel({ rows }: { rows: IncidentRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <PanelHeader title="Recent Incidents / Logs" action={`${rows.length} rows`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left">
          <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
            <tr>
              {['Time', 'Severity', 'Message', 'Endpoint', 'Retry'].map((head) => (
                <th key={head} className="px-4 py-3">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[12px]">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.time}</td>
                <td className="px-4 py-3"><SeverityPill severity={row.severity} /></td>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.message}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.endpoint}</td>
                <td className="px-4 py-3"><RetryState value={row.retry} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState text="No failed traces, webhook failures, job failures, or health incidents." />}
    </section>
  );
}

function buildTrafficPoints(traces: PlatformApiTrace[], timeRange: TimeRange): Point[] {
  const now = Date.now();
  const rangeMs = timeRangeMs(timeRange) ?? 60 * 60_000;
  const bucketMs = Math.max(60_000, Math.floor(rangeMs / 12));
  return Array.from({ length: 12 }, (_, index) => {
    const start = now - (12 - index) * bucketMs;
    const end = start + bucketMs;
    const bucket = traces.filter((trace) => {
      const time = Date.parse(trace.started_at);
      return time >= start && time < end;
    });
    const failed = bucket.filter(isFailedTrace);
    const latency = average(bucket.map((trace) => trace.duration_ms).filter(isNumber)) ?? 0;
    return {
      label: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(start)),
      requests: bucket.length,
      latency,
      errors: failed.length,
    };
  });
}

function buildEndpointRows(health: PlatformHealth | null, traces: PlatformApiTrace[]): EndpointRow[] {
  const grouped = new Map<string, PlatformApiTrace[]>();
  for (const trace of traces) {
    const key = `${trace.method} ${trace.path}`;
    grouped.set(key, [...(grouped.get(key) ?? []), trace]);
  }

  const rows = Array.from(grouped.entries()).map(([key, records]) => {
    const [method, ...pathParts] = key.split(' ');
    const path = pathParts.join(' ');
    const completed = records.filter((record) => record.status !== 'PENDING');
    const failed = records.filter(isFailedTrace);
    const avgLatency = average(completed.map((record) => record.duration_ms).filter(isNumber));
    const latest = records.reduce((current, record) => Date.parse(record.started_at) > Date.parse(current.started_at) ? record : current, records[0]);
    return {
      endpoint: path,
      method,
      status: failed.length ? 'Failing' : avgLatency != null && avgLatency > 500 ? 'Slow' : 'Healthy',
      latency: avgLatency == null ? '--' : `${avgLatency}ms`,
      requests: records.length,
      errorRate: completed.length ? `${((failed.length / completed.length) * 100).toFixed(1)}%` : '0.0%',
      checked: formatDate(latest.started_at),
    };
  });

  if (rows.length) return rows.sort((a, b) => b.requests - a.requests).slice(0, 8);

  return (health?.critical_apis ?? []).map((route) => ({
    endpoint: route.path,
    method: route.method,
    status: route.status === 'ok' ? 'Healthy' : 'Slow',
    latency: route.latency_ms == null ? '--' : `${route.latency_ms}ms`,
    requests: 0,
    errorRate: route.status === 'ok' ? '0.0%' : '100.0%',
    checked: formatDate(route.last_checked_at),
  }));
}

function buildOtaRows(integrations: PlatformIntegrationSummary | null) {
  const issueCounts = new Map<string, number>();
  for (const issue of integrations?.recent_sync_issues ?? []) {
    issueCounts.set(issue.channel.name, (issueCounts.get(issue.channel.name) ?? 0) + 1);
  }

  return (integrations?.channels ?? []).slice(0, 8).map((channel) => {
    const failed = issueCounts.get(channel.name) ?? 0;
    return {
      id: channel.id,
      name: channel.name,
      provider: channel.provider,
      code: channel.name.trim().charAt(0).toUpperCase() || channel.provider.charAt(0).toUpperCase(),
      tone: providerTone(channel.name || channel.provider),
      status: channel.status === 'ACTIVE' && failed === 0 ? 'Connected' : failed > 0 ? 'Issue' : formatLabel(channel.status),
      updated: formatDate(channel.updated_at),
      syncLogs: channel.counts.sync_logs,
      failed,
    };
  });
}

function buildIncidentRows(health: PlatformHealth | null, logs: PlatformLogs | null, traces: PlatformApiTrace[]): IncidentRow[] {
  const traceRows = traces.filter(isFailedTrace).slice(0, 8).map((trace) => ({
    id: trace.id,
    time: formatDate(trace.started_at),
    severity: trace.status_code && trace.status_code >= 500 ? 'High' : 'Medium',
    message: trace.error_message ?? `${trace.method} ${trace.path} failed`,
    endpoint: trace.path,
    retry: trace.status === 'FAILED' ? 'Failed' : 'Review',
    timestamp: trace.started_at,
  }));
  const webhookRows = (logs?.webhooks ?? []).filter((item) => item.status === 'FAILED').slice(0, 5).map((item) => ({
    id: item.id,
    time: formatDate(item.received_at),
    severity: 'High',
    message: item.processing_error ?? `${item.provider} ${item.event_type} webhook failed`,
    endpoint: item.domain,
    retry: 'Failed',
    timestamp: item.received_at,
  }));
  const jobRows = (logs?.jobs ?? []).filter((item) => item.status === 'DEAD_LETTER' || item.last_error).slice(0, 5).map((item) => ({
    id: item.id,
    time: formatDate(item.updated_at),
    severity: 'High',
    message: item.last_error ?? `${item.type} job failed`,
    endpoint: item.type,
    retry: item.status,
    timestamp: item.updated_at,
  }));
  const healthRows = (health?.recent_incidents ?? []).map((item) => ({
    id: item.id,
    time: formatDate(item.occurred_at),
    severity: formatLabel(item.severity),
    message: item.message,
    endpoint: item.area,
    retry: 'Review',
    timestamp: item.occurred_at,
  }));

  return [...traceRows, ...webhookRows, ...jobRows, ...healthRows]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 8);
}

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-[12rem]">
      <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <CustomSelect
        value={value}
        onChange={onChange}
        options={options}
      />
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <h3 className="text-[14px] font-black text-slate-900">{title}</h3>
      <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700">{action}</span>
    </div>
  );
}

function SmallCol({ label, value, bad = false }: { label: string; value: string | number; bad?: boolean }) {
  return (
    <div className="hidden min-w-[4.2rem] sm:block">
      <p className="text-[9px] font-bold text-slate-400">{label}</p>
      <p className={`mt-1 text-[11px] font-black ${bad ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: StatTone }) {
  const normalized = values.length ? values : [0, 0, 0, 0];
  const max = Math.max(...normalized, 1);
  const points = normalized.map((value, index) => `${index * (96 / Math.max(normalized.length - 1, 1))},${32 - (value / max) * 24}`).join(' ');
  return (
    <svg width="96" height="38" viewBox="0 0 96 38" aria-hidden="true">
      <polyline points={points} fill="none" stroke={toneColor(tone)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MethodPill({ method }: { method: string }) {
  const get = method === 'GET';
  return <span className={`rounded-md px-2 py-1 text-[10px] font-black ${get ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>{method}</span>;
}

function StatusText({ status }: { status: string }) {
  const classes = status === 'Healthy'
    ? 'text-emerald-700 bg-emerald-50'
    : status === 'Slow'
      ? 'text-amber-700 bg-amber-50'
      : 'text-rose-700 bg-rose-50';
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-black ${classes}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function SeverityPill({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const classes = normalized === 'high' ? 'bg-rose-50 text-rose-700' : normalized === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700';
  return <span className={`rounded-md px-2 py-1 text-[10px] font-black ${classes}`}>{severity}</span>;
}

function RetryState({ value }: { value: string }) {
  const classes = value === 'Success' ? 'text-emerald-700' : value === 'Failed' || value === 'DEAD_LETTER' ? 'text-rose-700' : value === 'Retrying' ? 'text-amber-700' : 'text-slate-500';
  return <span className={`text-[11px] font-black ${classes}`}>{formatLabel(value)}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-6 text-[13px] font-semibold text-slate-500">{text}</div>;
}

function PulseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h4l2-7 4 14 2-7h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4 3 20h18L12 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 9v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function isFailedTrace(trace: PlatformApiTrace) {
  return trace.status === 'FAILED' || (trace.status_code != null && trace.status_code >= 400);
}

function filterTraces(
  traces: PlatformApiTrace[],
  timeRange: TimeRange,
  kindFilter: ApiKindFilter,
  statusFilter: StatusFilter,
) {
  const rangeMs = timeRangeMs(timeRange);
  const cutoff = rangeMs == null ? null : Date.now() - rangeMs;
  return traces
    .filter((trace) => isOperationalTrace(trace))
    .filter((trace) => (cutoff == null ? true : Date.parse(trace.started_at) >= cutoff))
    .filter((trace) => (kindFilter === 'ALL' ? true : trace.kind === kindFilter))
    .filter((trace) => {
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'FAILED') return isFailedTrace(trace);
      return trace.status === statusFilter;
    });
}

function isOperationalTrace(trace: PlatformApiTrace) {
  if (trace.path.startsWith('/api-call-traces')) return false;
  if (trace.path.startsWith('/platform-admin')) return false;
  if (trace.screen_name?.toLowerCase().startsWith('platform ')) return false;
  return true;
}

function timeRangeMs(timeRange: TimeRange) {
  if (timeRange === '15m') return 15 * 60_000;
  if (timeRange === '1h') return 60 * 60_000;
  if (timeRange === '24h') return 24 * 60 * 60_000;
  return null;
}

function timeRangeLabel(timeRange: TimeRange) {
  if (timeRange === '15m') return 'Last 15 min';
  if (timeRange === '1h') return 'Last 1 hour';
  if (timeRange === '24h') return 'Last 24 hours';
  return 'All traces';
}

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function providerTone(value: string): StatTone {
  const lower = value.toLowerCase();
  if (lower.includes('booking')) return 'sky';
  if (lower.includes('expedia')) return 'amber';
  if (lower.includes('airbnb')) return 'rose';
  if (lower.includes('zodomus')) return 'violet';
  return 'slate';
}

function providerBg(tone: StatTone) {
  return {
    emerald: 'bg-emerald-600',
    sky: 'bg-sky-700',
    amber: 'bg-amber-400',
    violet: 'bg-violet-600',
    rose: 'bg-rose-500',
    slate: 'bg-slate-600',
  }[tone];
}

function toneClass(tone: StatTone) {
  return {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  }[tone];
}

function toneColor(tone: StatTone) {
  return {
    emerald: '#059669',
    sky: '#2563eb',
    amber: '#f59e0b',
    violet: '#7c3aed',
    rose: '#f43f5e',
    slate: '#64748b',
  }[tone];
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function areaPath(points: Array<{ x: number; y: number }>, baseline: number) {
  if (!points.length) return '';
  return `${linePath(points)} L ${points[points.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L ${points[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}
