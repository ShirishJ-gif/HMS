import { useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { BackgroundJob, ChannelConnection, MetricsSummary, WebhookEvent } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';

export function SupportConsolePage() {
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [pendingRetryJobId, setPendingRetryJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const metricsState = useAsync(async () => (await api.get<MetricsSummary>('/metrics/summary')).data, [reloadKey]);
  const channelsState = useAsync(
    async () => unwrapList((await api.get<PaginatedResponse<ChannelConnection>>('/channels', { params: { limit: 100 } })).data),
    [reloadKey],
  );
  const jobsState = useAsync(
    async () => (await api.get<PaginatedResponse<BackgroundJob>>('/background-jobs', { params: { limit: 100 } })).data,
    [reloadKey],
  );
  const webhooksState = useAsync(
    async () => (await api.get<PaginatedResponse<WebhookEvent>>('/webhook-events', { params: { limit: 100 } })).data,
    [reloadKey],
  );

  const channels = (channelsState.data ?? []).filter(
    (connection) => channelFilter === 'ALL' || connection.id === channelFilter,
  );
  const jobs = (jobsState.data?.data ?? []).filter((job) =>
    channelFilter === 'ALL' ? true : job.entity_id === channelFilter || job.property_id === channels.find((item) => item.id === channelFilter)?.property_id,
  );
  const webhooks = (webhooksState.data?.data ?? []).filter((event) =>
    channelFilter === 'ALL' ? true : event.property_id === channels.find((item) => item.id === channelFilter)?.property_id,
  );

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

  const loading = metricsState.loading || channelsState.loading || jobsState.loading || webhooksState.loading;
  const error = metricsState.error || channelsState.error || jobsState.error || webhooksState.error;
  const failedJobs = jobs.filter((job) => job.status === 'DEAD_LETTER').length;
  const failedWebhooks = webhooks.filter((event) => event.status === 'FAILED').length;
  const unhealthyChannels = channels.filter((connection) => !connection.provider_config_summary?.setup_status.ready).length;

  return (
    <section className="support-console-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin operations</p>
          <h2>Support Console</h2>
          <p className="page-subtitle">
            Track connection readiness, failed jobs, webhook events, and sync posture from one operator surface.
          </p>
        </div>
      </div>

      <FilterBar title="Support scope">
        <label>
          Channel connection
          <select onChange={(event) => setChannelFilter(event.target.value)} value={channelFilter}>
            <option value="ALL">All connections</option>
            {channelsState.data?.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.property.name} · {connection.provider_config_summary?.ota_name ?? connection.provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          Console focus
          <input disabled value="Readiness, jobs, webhooks, and sync health" />
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
        <MetricCard label="Failed webhooks" value={failedWebhooks.toString()} tone="blue" />
        <MetricCard label="Tracked jobs" value={(jobsState.data?.meta.total ?? jobs.length).toString()} tone="green" />
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
                <h3>{jobsState.data?.meta.total ?? jobs.length} jobs</h3>
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
                {jobs.map((job) => (
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

          <div className="table-card">
            <div className="table-heading">
              <div>
                <p className="eyebrow">Webhook events</p>
                <h3>{webhooksState.data?.meta.total ?? webhooks.length} events</h3>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Event type</th>
                  <th>Status</th>
                  <th>Duplicate</th>
                  <th>Received</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((event) => (
                  <tr key={event.id}>
                    <td>{event.provider}</td>
                    <td>{event.event_type}</td>
                    <td><span className={`status-pill ${event.status === 'PROCESSED' ? 'available' : event.status === 'FAILED' ? 'failed' : 'queued'}`}>{event.status}</span></td>
                    <td>{event.duplicate ? 'Yes' : 'No'}</td>
                    <td>{new Date(event.received_at).toLocaleString()}</td>
                    <td>{event.processing_error ?? '-'}</td>
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
                <dt>Webhook buckets</dt>
                <dd>{metricsState.data?.current.webhook_events.length ?? 0}</dd>
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
                <strong>Webhook failures</strong>
                <span>Failed or duplicate webhook events are visible here before they become booking drift.</span>
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
