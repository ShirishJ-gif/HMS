import { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { BackgroundJob, ChannelConnection, MetricsSummary } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';

type SupportConsolePageProps = {
  eyebrow?: string;
  focusLabel?: string;
  subtitle?: string;
  title?: string;
};

export function SupportConsolePage({
  eyebrow = 'Admin operations',
  focusLabel = 'Readiness, jobs, repair, and runtime support',
  subtitle = 'Track support-facing readiness signals, dead-letter jobs, and repair posture without mixing in mapping or webhook-detail workflows.',
  title = 'Support Console',
}: SupportConsolePageProps) {
  const jobsPerPage = 20;
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [jobsPage, setJobsPage] = useState(1);
  const [pendingRetryJobId, setPendingRetryJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const metricsState = useAsync(async () => (await api.get<MetricsSummary>('/metrics/summary')).data, [reloadKey]);
  const channelsState = useAsync(async () => fetchAllPages<ChannelConnection>('/channels'), [reloadKey]);
  const jobsState = useAsync(async () => fetchAllPages<BackgroundJob>('/background-jobs'), [reloadKey]);

  const channels = (channelsState.data ?? []).filter(
    (connection) => channelFilter === 'ALL' || connection.id === channelFilter,
  );
  const jobs = (jobsState.data ?? []).filter((job) =>
    channelFilter === 'ALL' ? true : job.entity_id === channelFilter || job.property_id === channels.find((item) => item.id === channelFilter)?.property_id,
  );
  const totalJobPages = Math.max(1, Math.ceil(jobs.length / jobsPerPage));
  const pagedJobs = useMemo(
    () => jobs.slice((jobsPage - 1) * jobsPerPage, jobsPage * jobsPerPage),
    [jobs, jobsPage],
  );

  useEffect(() => {
    setJobsPage(1);
  }, [channelFilter]);

  useEffect(() => {
    if (jobsPage > totalJobPages) {
      setJobsPage(totalJobPages);
    }
  }, [jobsPage, totalJobPages]);

  async function retryJob(id: string) {
    setActionError(null);
    setPendingRetryJobId(id);

    try {
      await api.post(`/background-jobs/${id}/retry`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPendingRetryJobId(null);
    }
  }

  const loading = metricsState.loading || channelsState.loading || jobsState.loading;
  const error = metricsState.error || channelsState.error || jobsState.error;
  const failedJobs = jobs.filter((job) => job.status === 'DEAD_LETTER').length;
  const unhealthyChannels = channels.filter((connection) => !connection.provider_config_summary?.setup_status.ready).length;

  return (
    <section className="support-console-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <FilterBar title="Support scope">
        <label>
          Channel connection
          <select onChange={(event) => setChannelFilter(event.target.value)} value={channelFilter}>
            <option value="ALL">All connections</option>
            {channels.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.property.name} · {connection.provider_config_summary?.ota_name ?? connection.provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          Console focus
          <input disabled value={focusLabel} />
        </label>
        <label>
          Retry policy
          <input disabled value="Manual retry for dead-letter jobs" />
        </label>
      </FilterBar>

      {actionError && <p className="error">{actionError}</p>}
      {loading && <p className="muted">Loading support data...</p>}
      {error && <p className="error">{error}</p>}

      <div className="metric-grid">
        <MetricCard label="Unready channels" value={unhealthyChannels.toString()} tone="gold" />
        <MetricCard label="Dead-letter jobs" value={failedJobs.toString()} tone="rose" />
        <MetricCard label="Tracked jobs" value={jobs.length.toString()} tone="blue" />
        <MetricCard label="Runtime buckets" value={(metricsState.data?.current.background_jobs.length ?? 0).toString()} tone="green" />
      </div>

      <div className="reports-layout">
        <div className="reports-main-rail">
          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Connections</p>
                <h3>{channels.length} channel connections</h3>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>OTA</th>
                  <th>Readiness</th>
                  <th>Rooms activated</th>
                  <th>Inventory sync</th>
                  <th>Bookings sync</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((connection) => (
                  <tr key={connection.id}>
                    <td>{connection.property.name}</td>
                    <td>{connection.provider_config_summary?.ota_name ?? connection.provider}</td>
                    <td>
                      <span className={`status-pill ${connection.provider_config_summary?.setup_status.ready ? 'available' : 'queued'}`}>
                        {connection.provider_config_summary?.setup_status.ready ? 'READY' : 'ATTENTION'}
                      </span>
                    </td>
                    <td>{connection.provider_config_summary?.setup_status.rooms_activated ? 'Yes' : 'No'}</td>
                    <td>{connection.sync_summary.inventory.last_status ?? '-'}</td>
                    <td>{connection.sync_summary.bookings.last_status ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Background jobs</p>
                <h3>{jobs.length} jobs</h3>
              </div>
              <div className="table-heading-meta">
                <span className="cell-note">
                  Showing {jobs.length === 0 ? 0 : (jobsPage - 1) * jobsPerPage + 1}-
                  {Math.min(jobsPage * jobsPerPage, jobs.length)} of {jobs.length}
                </span>
                <div className="button-row">
                  <button
                    className="secondary-button compact-button"
                    disabled={jobsPage === 1}
                    onClick={() => setJobsPage((current) => Math.max(1, current - 1))}
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="cell-note">
                    Page {jobsPage} / {totalJobPages}
                  </span>
                  <button
                    className="secondary-button compact-button"
                    disabled={jobsPage === totalJobPages}
                    onClick={() => setJobsPage((current) => Math.min(totalJobPages, current + 1))}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Run at</th>
                  <th>Error</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.type}</td>
                    <td><span className={`status-pill ${job.status === 'SUCCEEDED' ? 'available' : job.status === 'DEAD_LETTER' ? 'failed' : 'queued'}`}>{job.status}</span></td>
                    <td>
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td>{new Date(job.run_at).toLocaleString()}</td>
                    <td>{job.last_error ?? '-'}</td>
                    <td>
                      {job.status === 'DEAD_LETTER' ? (
                        <button
                          className="link-button compact-button"
                          disabled={pendingRetryJobId === job.id}
                          onClick={() => void retryJob(job.id)}
                          type="button"
                        >
                          {pendingRetryJobId === job.id ? 'Retrying...' : 'Retry'}
                        </button>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        <div className="reports-side-rail">
          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Runtime</p>
                <h3>Metrics summary</h3>
              </div>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Uptime</dt>
                <dd>{metricsState.data ? `${Math.round(metricsState.data.uptime_seconds / 60)} min` : '-'}</dd>
              </div>
              <div>
                <dt>Background buckets</dt>
                <dd>{metricsState.data?.current.background_jobs.length ?? 0}</dd>
              </div>
              <div>
                <dt>Sync buckets</dt>
                <dd>{metricsState.data?.current.channel_sync_logs.length ?? 0}</dd>
              </div>
            </dl>
          </article>

          <article className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Operator focus</p>
                <h3>What to clear first</h3>
              </div>
            </div>
            <ul className="attention-list">
              <li>
                <strong>Dead-letter jobs</strong>
                <span>Retry failed webhook, notification, or sync jobs from this console.</span>
              </li>
              <li>
                <strong>Unready channels</strong>
                <span>Watch channels where setup, room activation, or readiness never reached OK.</span>
              </li>
              <li>
                <strong>Repair posture</strong>
                <span>Use this console for cross-system recovery signals; webhook and sync-detail investigation now belongs in Webhooks & Sync Logs.</span>
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
