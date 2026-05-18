import { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { BackgroundJob, ChannelConnection, MetricsSummary } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { MetricCard, StatusBadge, TableCard, Panel, SectionHeading, DetailList, Th, Td, labelCls, inputCls, secondaryBtn, linkBtn, ErrorMsg, LoadingMsg } from './ui';

type Props = { eyebrow?: string; focusLabel?: string; subtitle?: string; title?: string; };
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

export function SupportConsolePage({
  eyebrow = 'Admin operations',
  focusLabel = 'Readiness, jobs, repair, and runtime support',
  subtitle = 'Track support-facing readiness signals, dead-letter jobs, and repair posture without mixing in mapping or webhook-detail workflows.',
  title = 'Support Console',
}: Props) {
  const jobsPerPage = 10;
  const [channelFilter, setChannelFilter] = useState('ALL');
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
    .filter((job) => channelFilter === 'ALL' ? true : job.entity_id === channelFilter || job.property_id === channels.find((c) => c.id === channelFilter)?.property_id)
    .sort((a, b) => { const d = new Date(b.run_at).getTime() - new Date(a.run_at).getTime(); return d === 0 ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : d; });
  const totalJobPages = Math.max(1, Math.ceil(jobs.length / jobsPerPage));
  const pagedJobs = useMemo(() => jobs.slice((jobsPage - 1) * jobsPerPage, jobsPage * jobsPerPage), [jobs, jobsPage]);
  const failedJobs = jobs.filter((j) => j.status === 'DEAD_LETTER').length;
  const unhealthyChannels = channels.filter((c) => !c.provider_config_summary?.setup_status.ready).length;
  const loading = supportState.loading && !supportState.data;
  const error = supportState.error;

  useEffect(() => {
    let active = true;
    const hasFreshCache =
      supportConsoleCache &&
      reloadKey === 0 &&
      Date.now() - supportConsoleCacheUpdatedAt < supportConsoleCacheTtlMs;

    if (hasFreshCache) {
      setSupportState({ data: supportConsoleCache, error: null, loading: false });
      return () => {
        active = false;
      };
    }

    setSupportState((current) => ({
      ...current,
      error: null,
      loading: !current.data,
    }));

    Promise.all([
      api.get<MetricsSummary>('/metrics/summary'),
      fetchAllPages<ChannelConnection>('/channels'),
      fetchAllPages<BackgroundJob>('/background-jobs'),
    ])
      .then(([metricsResponse, loadedChannels, loadedJobs]) => {
        if (!active) return;
        const nextData = {
          channels: loadedChannels,
          jobs: loadedJobs,
          metrics: metricsResponse.data,
        };
        supportConsoleCache = nextData;
        supportConsoleCacheUpdatedAt = Date.now();
        setSupportState({ data: nextData, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSupportState((current) => ({
          data: current.data,
          error: getApiErrorMessage(err),
          loading: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);
  useEffect(() => { setJobsPage(1); }, [channelFilter]);
  useEffect(() => { if (jobsPage > totalJobPages) setJobsPage(totalJobPages); }, [jobsPage, totalJobPages]);

  async function retryJob(id: string) {
    setActionError(null); setPendingRetryJobId(id);
    try { await api.post(`/background-jobs/${id}/retry`); setReloadKey((v) => v + 1); }
    catch (err) { setActionError(getApiErrorMessage(err)); }
    finally { setPendingRetryJobId(null); }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">{eyebrow}</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">{subtitle}</p>
      </div>

      <FilterBar title="Support scope">
        <label className={`${labelCls} min-w-[16rem] flex-1 lg:flex-none lg:w-[17rem]`}>
          <span>Channel connection</span>
          <CustomSelect
            disabled={supportState.loading && allChannels.length === 0}
            onChange={setChannelFilter}
            options={[
              { label: 'All connections', value: 'ALL' },
              ...allChannels.map((c) => ({
                label: `${c.property.name} - ${c.provider_config_summary?.ota_name ?? c.provider}`,
                value: c.id,
              })),
            ]}
            value={channelFilter}
          />
        </label>
        <label className={`${labelCls} min-w-[17rem]`}>
          <span>Console focus</span>
          <input className={inputCls} disabled value={focusLabel} />
        </label>
        <label className={`${labelCls} min-w-[17rem]`}>
          <span>Retry policy</span>
          <input className={inputCls} disabled value="Manual retry for dead-letter jobs" />
        </label>
      </FilterBar>

      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}
      {loading && <LoadingMsg>Loading support data…</LoadingMsg>}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Unready channels" value={unhealthyChannels.toString()} tone="gold" />
        <MetricCard label="Dead-letter jobs" value={failedJobs.toString()} tone="rose" />
        <MetricCard label="Tracked jobs" value={jobs.length.toString()} tone="blue" />
        <MetricCard label="Runtime buckets" value={(supportState.data?.metrics.current.background_jobs.length ?? 0).toString()} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-5 items-start">
        <div className="space-y-5">
          {/* Channels table */}
          <TableCard title={`${channels.length} channel connections`} eyebrow="Connections">
            <table className="w-full min-w-[640px]">
              <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Property</Th><Th>OTA</Th><Th>Readiness</Th><Th>Rooms activated</Th><Th>Inventory sync</Th><Th>Bookings sync</Th></tr></thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                    <Td className="font-semibold text-slate-900">{c.property.name}</Td>
                    <Td>{c.provider_config_summary?.ota_name ?? c.provider}</Td>
                    <Td><StatusBadge label={c.provider_config_summary?.setup_status.ready ? 'READY' : 'ATTENTION'} tone={c.provider_config_summary?.setup_status.ready ? 'green' : 'gold'} /></Td>
                    <Td>{c.provider_config_summary?.setup_status.rooms_activated ? 'Yes' : 'No'}</Td>
                    <Td>{c.sync_summary.inventory.last_status ?? '—'}</Td>
                    <Td>{c.sync_summary.bookings.last_status ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          {/* Background jobs table */}
          <TableCard
            title={`${jobs.length} jobs`}
            eyebrow="Background jobs"
            actions={
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Page {jobsPage}/{totalJobPages}</span>
                <button className={secondaryBtn + ' !px-3 !py-1.5 !text-xs'} disabled={jobsPage === 1} onClick={() => setJobsPage((p) => Math.max(1, p - 1))} type="button">Prev</button>
                <button className={secondaryBtn + ' !px-3 !py-1.5 !text-xs'} disabled={jobsPage === totalJobPages} onClick={() => setJobsPage((p) => Math.min(totalJobPages, p + 1))} type="button">Next</button>
              </div>
            }
          >
            <table className="w-full min-w-[640px]">
              <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Type</Th><Th>Status</Th><Th>Attempts</Th><Th>Run at</Th><Th>Error</Th><Th>Action</Th></tr></thead>
              <tbody>
                {pagedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0">
                    <Td className="font-mono text-xs">{job.type}</Td>
                    <Td><StatusBadge label={job.status} tone={job.status === 'SUCCEEDED' ? 'green' : job.status === 'DEAD_LETTER' ? 'rose' : 'gold'} /></Td>
                    <Td>{job.attempts}/{job.max_attempts}</Td>
                    <Td className="text-xs">{new Date(job.run_at).toLocaleString()}</Td>
                    <Td className="text-xs text-rose-600 max-w-[200px] truncate">{job.last_error ?? '—'}</Td>
                    <Td>
                      {job.status === 'DEAD_LETTER' ? (
                        <button className={linkBtn} disabled={pendingRetryJobId === job.id} onClick={() => void retryJob(job.id)} type="button">
                          {pendingRetryJobId === job.id ? 'Retrying…' : 'Retry'}
                        </button>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </div>

        {/* Side rail */}
        <div className="space-y-4">
          <Panel>
            <SectionHeading eyebrow="Runtime" title="Metrics summary" />
            <DetailList rows={[
              { label: 'Uptime', value: supportState.data ? `${Math.round(supportState.data.metrics.uptime_seconds / 60)} min` : '—' },
              { label: 'Background buckets', value: String(supportState.data?.metrics.current.background_jobs.length ?? 0) },
              { label: 'Sync buckets', value: String(supportState.data?.metrics.current.channel_sync_logs.length ?? 0) },
            ]} />
          </Panel>

          <Panel>
            <SectionHeading eyebrow="Operator focus" title="What to clear first" />
            <ul className="space-y-3">
              {[
                { label: 'Dead-letter jobs', text: 'Retry failed webhook, notification, or sync jobs from this console.' },
                { label: 'Unready channels', text: 'Watch channels where setup, room activation, or readiness never reached OK.' },
                { label: 'Repair posture', text: 'Use this console for cross-system recovery signals; webhook detail investigation belongs in Webhooks & Sync Logs.' },
              ].map((item) => (
                <li key={item.label} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                  <span className="text-xs font-bold text-slate-800 block mb-0.5">{item.label}</span>
                  <span className="text-xs text-slate-500 leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </section>
  );
}
