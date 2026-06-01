import { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { BackgroundJob, ChannelConnection, MetricsSummary } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { ErrorMsg, LoadingMsg, StatusBadge, Th, Td } from './ui';

type SupportConsoleData = {
  channels: ChannelConnection[];
  jobs: BackgroundJob[];
  metrics: MetricsSummary;
};
type SupportConsoleState = {
  data: SupportConsoleData | null;
  error: string | null;
  loading: boolean;
};

let supportConsoleCache: SupportConsoleData | null = null;
let supportConsoleCacheUpdatedAt = 0;
const supportConsoleCacheTtlMs = 60_000;

const JOB_STATUS_STYLE: Record<string, string> = {
  SUCCEEDED:   'bg-emerald-50 text-emerald-700',
  DEAD_LETTER: 'bg-rose-50 text-rose-700',
  PENDING:     'bg-amber-50 text-amber-700',
  RUNNING:     'bg-sky-50 text-sky-700',
};

export function SupportConsolePage() {
  const jobsPerPage = 15;
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [jobStatusFilter, setJobStatusFilter] = useState<'ALL' | 'DEAD_LETTER' | 'SUCCEEDED' | 'PENDING'>('ALL');
  const [jobsPage, setJobsPage] = useState(1);
  const [pendingRetryJobId, setPendingRetryJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [supportState, setSupportState] = useState<SupportConsoleState>(() => ({
    data: supportConsoleCache,
    error: null,
    loading: !supportConsoleCache,
  }));

  const allChannels = supportState.data?.channels ?? [];
  const channels = allChannels.filter((c) => channelFilter === 'ALL' || c.id === channelFilter);
  const jobs = (supportState.data?.jobs ?? [])
    .filter((job) => {
      if (channelFilter !== 'ALL' && job.entity_id !== channelFilter && job.property_id !== channels.find((c) => c.id === channelFilter)?.property_id) return false;
      if (jobStatusFilter !== 'ALL' && job.status !== jobStatusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const d = new Date(b.run_at).getTime() - new Date(a.run_at).getTime();
      return d === 0 ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : d;
    });

  const totalJobPages = Math.max(1, Math.ceil(jobs.length / jobsPerPage));
  const pagedJobs = useMemo(() => jobs.slice((jobsPage - 1) * jobsPerPage, jobsPage * jobsPerPage), [jobs, jobsPage]);
  const failedJobs = (supportState.data?.jobs ?? []).filter((j) => j.status === 'DEAD_LETTER').length;
  const unhealthyChannels = allChannels.filter((c) => !c.provider_config_summary?.setup_status.ready).length;
  const loading = supportState.loading && !supportState.data;

  useEffect(() => {
    let active = true;
    const hasFreshCache = supportConsoleCache && reloadKey === 0 && Date.now() - supportConsoleCacheUpdatedAt < supportConsoleCacheTtlMs;
    if (hasFreshCache) { setSupportState({ data: supportConsoleCache, error: null, loading: false }); return () => { active = false; }; }
    setSupportState((c) => ({ ...c, error: null, loading: !c.data }));
    Promise.all([
      api.get<MetricsSummary>('/metrics/summary'),
      fetchAllPages<ChannelConnection>('/channels'),
      fetchAllPages<BackgroundJob>('/background-jobs'),
    ])
      .then(([metricsRes, loadedChannels, loadedJobs]) => {
        if (!active) return;
        const nextData = { channels: loadedChannels, jobs: loadedJobs, metrics: metricsRes.data };
        supportConsoleCache = nextData; supportConsoleCacheUpdatedAt = Date.now();
        setSupportState({ data: nextData, error: null, loading: false });
      })
      .catch((err: unknown) => { if (!active) return; setSupportState((c) => ({ ...c, error: getApiErrorMessage(err), loading: false })); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => { setJobsPage(1); }, [channelFilter, jobStatusFilter]);
  useEffect(() => { if (jobsPage > totalJobPages) setJobsPage(totalJobPages); }, [jobsPage, totalJobPages]);

  async function retryJob(id: string) {
    setActionError(null); setPendingRetryJobId(id);
    try { await api.post(`/background-jobs/${id}/retry`); setReloadKey((v) => v + 1); }
    catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setPendingRetryJobId(null); }
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Admin</span>
            <span className="text-slate-300">·</span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Support Console</span>
          </div>
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">Support Console</h1>
          <p className="text-[13px] text-slate-500 mt-1.5">Track channel readiness, dead-letter jobs, and runtime health.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Channel filter */}
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap select-none">Channel</span>
            <div className="w-64">
              <CustomSelect
                options={[
                  { label: 'All connections', value: 'ALL' },
                  ...allChannels.map((c) => ({
                    label: `${c.property.name} - ${c.provider_config_summary?.ota_name ?? c.provider}`,
                    value: c.id,
                  })),
                ]}
                value={channelFilter}
                onChange={setChannelFilter}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => { supportConsoleCache = null; setReloadKey(v => v + 1); }}
            className="h-9 px-3.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Unready channels',  value: unhealthyChannels, warn: unhealthyChannels > 0 },
          { label: 'Dead-letter jobs',  value: failedJobs,        warn: failedJobs > 0 },
          { label: 'Total tracked jobs',value: jobs.length,       warn: false },
          { label: 'Runtime uptime',    value: supportState.data ? `${Math.round(supportState.data.metrics.uptime_seconds / 60)}m` : '—', warn: false },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-black/[0.06] px-4 py-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{k.label}</p>
            <p className={`text-[1.5rem] font-bold tracking-tight leading-none ${k.warn ? 'text-rose-600' : 'text-slate-900'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {loading && <LoadingMsg>Loading support data…</LoadingMsg>}
      {supportState.error && <ErrorMsg>{supportState.error}</ErrorMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      {/* ── Main content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_17rem] gap-5 items-start">
        <div className="space-y-5">

          {/* Channel connections */}
          <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Connections</p>
                <h3 className="text-[13.5px] font-bold text-slate-900">{channels.length} channel connection{channels.length !== 1 ? 's' : ''}</h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <Th>Property</Th><Th>OTA</Th><Th>Readiness</Th><Th>Rooms activated</Th><Th>Inventory sync</Th><Th>Bookings sync</Th>
                  </tr>
                </thead>
                <tbody>
                  {channels.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-[12px] text-slate-400 font-medium">No channel connections found.</td></tr>
                  )}
                  {channels.map((c) => {
                    const ready = c.provider_config_summary?.setup_status.ready;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                        <Td className="font-semibold text-slate-900">{c.property.name}</Td>
                        <Td>{c.provider_config_summary?.ota_name ?? c.provider}</Td>
                        <Td>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {ready ? 'Ready' : 'Attention'}
                          </span>
                        </Td>
                        <Td>{c.provider_config_summary?.setup_status.rooms_activated ? <span className="text-emerald-600 font-semibold text-[12px]">Yes</span> : <span className="text-slate-400 text-[12px]">No</span>}</Td>
                        <Td>
                          {c.sync_summary.inventory.last_status ? (
                            <StatusBadge label={c.sync_summary.inventory.last_status} tone={c.sync_summary.inventory.last_status === 'SUCCEEDED' ? 'green' : 'gold'} />
                          ) : <span className="text-slate-400 text-[12px]">—</span>}
                        </Td>
                        <Td>
                          {c.sync_summary.bookings.last_status ? (
                            <StatusBadge label={c.sync_summary.bookings.last_status} tone={c.sync_summary.bookings.last_status === 'SUCCEEDED' ? 'green' : 'gold'} />
                          ) : <span className="text-slate-400 text-[12px]">—</span>}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Background jobs */}
          <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Background jobs</p>
                <h3 className="text-[13.5px] font-bold text-slate-900">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter chips */}
                {(['ALL', 'DEAD_LETTER', 'SUCCEEDED', 'PENDING'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setJobStatusFilter(s)}
                    className={`h-7 px-2.5 rounded-full text-[10.5px] font-semibold transition-colors ${jobStatusFilter === s ? 'bg-slate-800 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                    {s === 'ALL' ? 'All' : s === 'DEAD_LETTER' ? 'Dead-letter' : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <Th>Type</Th><Th>Status</Th><Th>Attempts</Th><Th>Run at</Th><Th>Last error</Th><Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {pagedJobs.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-[12px] text-slate-400 font-medium">No jobs match the current filter.</td></tr>
                  )}
                  {pagedJobs.map((job) => (
                    <tr key={job.id} className={`border-b border-slate-50 last:border-0 transition-colors ${job.status === 'DEAD_LETTER' ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-slate-50/60'}`}>
                      <Td>
                        <span className="font-mono text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{job.type}</span>
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${JOB_STATUS_STYLE[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {job.status.replace(/_/g, ' ')}
                        </span>
                      </Td>
                      <Td>
                        <span className={`text-[12px] font-semibold ${job.attempts >= job.max_attempts ? 'text-rose-600' : 'text-slate-700'}`}>
                          {job.attempts}<span className="text-slate-400 font-normal">/{job.max_attempts}</span>
                        </span>
                      </Td>
                      <Td className="text-[11.5px] text-slate-500 whitespace-nowrap">{new Date(job.run_at).toLocaleString()}</Td>
                      <Td className="max-w-[220px]">
                        {job.last_error ? (
                          <span className="text-[11px] text-rose-600 font-medium truncate block" title={job.last_error}>{job.last_error}</span>
                        ) : <span className="text-slate-400 text-[12px]">—</span>}
                      </Td>
                      <Td>
                        {job.status === 'DEAD_LETTER' ? (
                          <button
                            type="button"
                            disabled={pendingRetryJobId === job.id}
                            onClick={() => void retryJob(job.id)}
                            className="h-7 px-3 rounded-lg bg-slate-800 text-white text-[11px] font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {pendingRetryJobId === job.id ? 'Retrying…' : 'Retry'}
                          </button>
                        ) : <span className="text-slate-300 text-[12px]">—</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalJobPages > 1 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">Page {jobsPage} of {totalJobPages} · {jobs.length} jobs</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" disabled={jobsPage === 1} onClick={() => setJobsPage(1)}
                    className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">«</button>
                  <button type="button" disabled={jobsPage === 1} onClick={() => setJobsPage(p => Math.max(1, p - 1))}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">Prev</button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalJobPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(jobsPage - 2, totalJobPages - 4));
                      const page = start + i;
                      return (
                        <button key={page} type="button" onClick={() => setJobsPage(page)}
                          className={`h-8 w-8 rounded-lg text-[11.5px] font-semibold transition-colors ${page === jobsPage ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" disabled={jobsPage === totalJobPages} onClick={() => setJobsPage(p => Math.min(totalJobPages, p + 1))}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">Next</button>
                  <button type="button" disabled={jobsPage === totalJobPages} onClick={() => setJobsPage(totalJobPages)}
                    className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">»</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Side rail ── */}
        <div className="space-y-4">

          {/* Runtime metrics */}
          <div className="bg-white rounded-xl border border-black/[0.06] p-5">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">Runtime metrics</p>
            <div className="space-y-3">
              {[
                { label: 'Uptime',               value: supportState.data ? `${Math.round(supportState.data.metrics.uptime_seconds / 60)} min` : '—' },
                { label: 'Background buckets',   value: String(supportState.data?.metrics.current.background_jobs.length ?? 0) },
                { label: 'Sync log buckets',     value: String(supportState.data?.metrics.current.channel_sync_logs.length ?? 0) },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-[12px] text-slate-600 font-medium">{r.label}</span>
                  <span className="text-[13px] font-bold text-slate-900">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Operator checklist */}
          <div className="bg-white rounded-xl border border-black/[0.06] p-5">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">What to clear first</p>
            <div className="space-y-3.5">
              {[
                { icon: '', label: 'Dead-letter jobs',    text: 'Retry failed webhook, notification, or sync jobs from the jobs table above.' },
                { icon: '', label: 'Unready channels',    text: 'Investigate channels where setup or room activation never reached OK.' },
                { icon: '', label: 'Repair posture',      text: 'Use this console for cross-system recovery. Webhook detail investigation belongs in Webhooks & Sync Logs.' },
              ].map(item => (
                <div key={item.label} className="flex gap-3 pt-3.5 border-t border-slate-50 first:border-0 first:pt-0">
                  <span className="text-sm flex-shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-[12px] font-bold text-slate-800 mb-0.5">{item.label}</p>
                    <p className="text-[11.5px] text-slate-500 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
