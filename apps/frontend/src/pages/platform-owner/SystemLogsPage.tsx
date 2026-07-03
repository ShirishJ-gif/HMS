import { Activity, AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CustomSelect } from '../../components/CustomSelect';
import { formatDate, formatLabel, propertyLabel } from './shared';
import type { PlatformLogs, PlatformProperty } from './types';

export function SystemLogs({ logs, properties }: { logs: PlatformLogs | null; properties: PlatformProperty[] }) {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'issues' | 'jobs' | 'webhooks' | 'audit'>('all');
  const [logSearch, setLogSearch] = useState('');
  const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);
  const propertyFilterOptions = useMemo(() => [
    { label: 'All properties', value: '' },
    ...properties.map((property) => ({
      label: property.name,
      value: property.id,
    })),
  ], [properties]);
  const filteredJobs = propertyFilter
    ? logs?.jobs.filter((job) => job.property?.id === propertyFilter) ?? []
    : logs?.jobs ?? [];
  const filteredWebhooks = propertyFilter
    ? logs?.webhooks.filter((event) => event.property?.id === propertyFilter) ?? []
    : logs?.webhooks ?? [];
  const filteredAuditLogs = propertyFilter
    ? logs?.audit_logs.filter((log) => log.property_id === propertyFilter) ?? []
    : logs?.audit_logs ?? [];
  const failedJobs = filteredJobs.filter((job) => job.status !== 'COMPLETED' && job.status !== 'SUCCESS');
  const failedWebhooks = filteredWebhooks.filter((event) => event.status !== 'PROCESSED' && event.status !== 'SUCCESS');
  const allActivity = [
    ...filteredJobs.map((job) => ({
      id: `job-${job.id}`,
      kind: 'job' as const,
      title: formatLabel(job.type),
      meta: `${propertyLabel(job.property)} · ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}`,
      detail: job.last_error ?? 'Background job updated',
      status: job.status,
      at: job.updated_at,
    })),
    ...filteredWebhooks.map((event) => ({
      id: `webhook-${event.id}`,
      kind: 'webhook' as const,
      title: `${event.provider} ${formatLabel(event.event_type)}`,
      meta: `${propertyLabel(event.property)} · ${event.domain}`,
      detail: event.processing_error ?? 'Webhook event received',
      status: event.status,
      at: event.received_at,
    })),
    ...filteredAuditLogs.map((log) => ({
      id: `audit-${log.id}`,
      kind: 'audit' as const,
      title: log.summary,
      meta: `${propertyLabel(log.property_id ? propertyById.get(log.property_id) ?? null : null)} · ${log.user?.email ?? 'System'}`,
      detail: formatLabel(log.action),
      status: 'AUDIT',
      at: log.created_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const normalizedSearch = logSearch.trim().toLowerCase();
  const recentActivity = allActivity
    .filter((item) => {
      if (activityFilter === 'issues') return systemStatusTone(item.status, item.kind).severity === 'bad';
      if (activityFilter === 'jobs') return item.kind === 'job';
      if (activityFilter === 'webhooks') return item.kind === 'webhook';
      if (activityFilter === 'audit') return item.kind === 'audit';
      return true;
    })
    .filter((item) => {
      if (!normalizedSearch) return true;
      return `${item.title} ${item.meta} ${item.detail} ${item.status}`.toLowerCase().includes(normalizedSearch);
    })
    .slice(0, 16);
  const attentionItems = [
    ...failedJobs.map((job) => ({
      id: `job-${job.id}`,
      title: formatLabel(job.type),
      meta: `${propertyLabel(job.property)} · ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}`,
      detail: job.last_error ?? 'Job did not complete successfully.',
      status: job.status,
      source: 'Job',
      at: job.updated_at,
    })),
    ...failedWebhooks.map((event) => ({
      id: `webhook-${event.id}`,
      title: `${event.provider} · ${formatLabel(event.event_type)}`,
      meta: `${propertyLabel(event.property)} · ${event.domain}`,
      detail: event.processing_error ?? 'Webhook did not process successfully.',
      status: event.status,
      source: 'Webhook',
      at: event.received_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const activityFilterOptions = [
    { label: 'All', value: 'all' as const },
    { label: 'Issues', value: 'issues' as const },
    { label: 'Jobs', value: 'jobs' as const },
    { label: 'Webhooks', value: 'webhooks' as const },
    { label: 'Audit', value: 'audit' as const },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="text-[15px] font-black text-slate-900">System activity console</h3>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">Background jobs, webhook processing, and audit activity across properties.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-[minmax(12rem,18rem)_minmax(12rem,1fr)] xl:w-auto">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Property</span>
              <div className="mt-1">
                <CustomSelect
                  options={propertyFilterOptions}
                  value={propertyFilter}
                  onChange={setPropertyFilter}
                  placeholder="All properties"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Search logs</span>
              <div className="mt-1 flex min-h-[2.6rem] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                <Activity className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  value={logSearch}
                  onChange={(event) => setLogSearch(event.target.value)}
                  placeholder="Search status, provider, error..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <LogSummaryCard icon={<Clock3 className="h-4 w-4" />} label="Background jobs" value={filteredJobs.length} tone={failedJobs.length ? 'warn' : 'neutral'} />
          <LogSummaryCard icon={<Activity className="h-4 w-4" />} label="Webhook events" value={filteredWebhooks.length} tone={failedWebhooks.length ? 'bad' : 'good'} />
          <LogSummaryCard icon={<ShieldCheck className="h-4 w-4" />} label="Audit records" value={filteredAuditLogs.length} tone="neutral" />
          <LogSummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="Needs attention" value={failedJobs.length + failedWebhooks.length} tone={failedJobs.length + failedWebhooks.length ? 'bad' : 'good'} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-slate-900">Activity timeline</h3>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{recentActivity.length} shown · {allActivity.length} total events</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activityFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setActivityFilter(option.value)}
                  className={`rounded-md border px-2.5 py-1.5 text-[10px] font-black transition ${
                    activityFilter === option.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative p-4">
            <div className="absolute bottom-4 left-[2.05rem] top-4 hidden w-px bg-slate-200 lg:block" aria-hidden="true" />
            {recentActivity.length ? recentActivity.map((item) => (
              <SystemActivityRow key={item.id} item={item} />
            )) : <div className="px-4 py-8 text-center text-[13px] text-slate-500">No system activity found.</div>}
          </div>
        </section>

        <div className="space-y-5">
          <AttentionQueue items={attentionItems.slice(0, 8)} />
          <AuditSnapshot
            logs={filteredAuditLogs.slice(0, 6).map((log) => ({
              id: log.id,
              title: log.summary,
              meta: `${log.user?.email ?? 'System'} · ${formatDate(log.created_at)}`,
              action: formatLabel(log.action),
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function LogSummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const toneClass = {
    good: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-100 bg-amber-50 text-amber-700',
    bad: 'border-rose-100 bg-rose-50 text-rose-700',
    neutral: 'border-slate-100 bg-slate-50 text-slate-600',
  }[tone];

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
        </div>
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>{icon}</span>
      </div>
    </div>
  );
}

function SystemActivityRow({
  item,
}: {
  item: { kind: 'job' | 'webhook' | 'audit'; title: string; meta: string; detail: string; status: string; at: string };
}) {
  const tone = systemStatusTone(item.status, item.kind);

  return (
    <div className="relative grid gap-3 rounded-lg border border-transparent px-3 py-3 transition hover:border-slate-200 hover:bg-slate-50/70 lg:grid-cols-[8rem_minmax(0,1fr)_8rem] lg:items-center">
      <div className="flex items-center gap-2">
        <span className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-4 ring-white ${tone.icon}`}>
          {item.kind === 'job' && <Clock3 className="h-4 w-4" />}
          {item.kind === 'webhook' && <Activity className="h-4 w-4" />}
          {item.kind === 'audit' && <ShieldCheck className="h-4 w-4" />}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{item.kind}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black text-slate-900">{item.title}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{item.meta}</p>
        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.detail}</p>
      </div>
      <div className="flex items-center justify-between gap-2 lg:block lg:text-right">
        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${tone.badge}`}>{formatLabel(item.status)}</span>
        <p className="mt-1 text-[10px] font-semibold text-slate-400">{formatDate(item.at)}</p>
      </div>
    </div>
  );
}

function AttentionQueue({
  items,
}: {
  items: Array<{ id: string; title: string; meta: string; detail: string; status: string; source: string; at: string }>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-[14px] font-bold text-slate-900">Attention queue</h3>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">Only failed or blocked events.</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${items.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{items.length}</span>
      </div>
      <div className="space-y-2 p-3">
        {items.length ? items.map((item) => {
          const tone = systemStatusTone(item.status);
          return (
            <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700">{item.source}</span>
                  <p className="truncate text-[13px] font-black text-slate-900">{item.title}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{item.meta}</p>
                </div>
                <span className={`flex-shrink-0 rounded-md px-2 py-1 text-[10px] font-black ${tone.badge}`}>{formatLabel(item.status)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">{item.detail}</p>
              <p className="mt-2 text-[10px] font-semibold text-slate-400">{formatDate(item.at)}</p>
            </div>
          );
        }) : (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-5 text-center">
            <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" aria-hidden="true" />
            <p className="mt-2 text-[13px] font-bold text-emerald-700">No issues in this filter.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AuditSnapshot({
  logs,
}: {
  logs: Array<{ id: string; title: string; meta: string; action: string }>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-900">Audit snapshot</h3>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">Latest account and property changes.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {logs.length ? logs.map((log) => (
          <div key={log.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-[12px] font-bold text-slate-800">{log.title}</p>
                <p className="mt-1 truncate text-[10.5px] font-semibold text-slate-500">{log.meta}</p>
              </div>
              <span className="flex-shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[9.5px] font-black text-slate-600">{log.action}</span>
            </div>
          </div>
        )) : <div className="px-4 py-6 text-[13px] text-slate-500">No audit records found.</div>}
      </div>
    </section>
  );
}

function systemStatusTone(status: string, kind?: 'job' | 'webhook' | 'audit') {
  const normalized = status.toUpperCase();
  if (kind === 'audit' || normalized === 'AUDIT') {
    return { badge: 'bg-slate-100 text-slate-600', icon: 'bg-slate-100 text-slate-600', severity: 'neutral' as const };
  }
  if (['COMPLETED', 'SUCCESS', 'PROCESSED', 'OK'].includes(normalized)) {
    return { badge: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-50 text-emerald-700', severity: 'good' as const };
  }
  if (['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(normalized)) {
    return { badge: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-700', severity: 'warn' as const };
  }
  return { badge: 'bg-rose-50 text-rose-700', icon: 'bg-rose-50 text-rose-700', severity: 'bad' as const };
}

