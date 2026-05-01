import { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import {
  BackgroundJob,
  ChannelConnection,
  ChannelProvider,
  ChannelSyncLog,
  ChannelSyncType,
  MetricsSummary,
  Property,
  RatePlan,
  RoomCategory,
  WebhookEvent,
} from '../api/types';
import { FilterBar } from '../components/FilterBar';

const providers: ChannelProvider[] = ['MOCK', 'SITEMINDER', 'BOOKING_COM', 'AIRBNB'];
const syncTypes: ChannelSyncType[] = ['INVENTORY', 'RATES', 'BOOKINGS'];

export function ChannelsPage() {
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummary | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [connectionFilter, setConnectionFilter] = useState('ALL');
  const [providerFilter, setProviderFilter] = useState<'ALL' | ChannelProvider>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'ERROR'>('ALL');
  const [propertyId, setPropertyId] = useState('');
  const [provider, setProvider] = useState<ChannelProvider>('MOCK');
  const [name, setName] = useState('Mock OTA Gateway');
  const [externalHotelId, setExternalHotelId] = useState('MOCK-HOTEL-001');
  const [roomCategoryId, setRoomCategoryId] = useState('');
  const [externalRoomId, setExternalRoomId] = useState('');
  const [ratePlanId, setRatePlanId] = useState('');
  const [externalRateId, setExternalRateId] = useState('');
  const [syncType, setSyncType] = useState<ChannelSyncType>('INVENTORY');
  const [from, setFrom] = useState('2026-05-01');
  const [to, setTo] = useState('2026-05-03');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId);
  const selectedPropertyId = selectedConnection?.property_id ?? propertyId;
  const scopedCategories = useMemo(
    () => categories.filter((category) => category.property_id === selectedPropertyId),
    [categories, selectedPropertyId],
  );
  const scopedRatePlans = useMemo(
    () => ratePlans.filter((ratePlan) => ratePlan.property_id === selectedPropertyId),
    [ratePlans, selectedPropertyId],
  );
  const activeConnections = connections.filter((connection) => connection.status === 'ACTIVE').length;
  const mappedRoomCount = connections.reduce((total, connection) => total + connection.room_mappings.length, 0);
  const mappedRateCount = connections.reduce((total, connection) => total + connection.rate_mappings.length, 0);
  const visibleConnections = connections.filter((connection) => {
    if (connectionFilter !== 'ALL' && connection.id !== connectionFilter) {
      return false;
    }

    if (providerFilter !== 'ALL' && connection.provider !== providerFilter) {
      return false;
    }

    if (statusFilter !== 'ALL' && connection.status !== statusFilter) {
      return false;
    }

    return true;
  });
  const selectedSyncLogs = selectedConnection?.recent_sync_logs ?? [];
  const visibleJobs = backgroundJobs.filter((job) => {
    if (connectionFilter !== 'ALL' && job.property_id !== selectedPropertyId) {
      return false;
    }
    return true;
  });
  const visibleWebhookEvents = webhookEvents.filter((event) => {
    if (connectionFilter !== 'ALL' && event.property_id !== selectedPropertyId) {
      return false;
    }
    return true;
  });
  const deadLetterJobs = visibleJobs.filter((job) => job.status === 'DEAD_LETTER').length;
  const failedSyncs = selectedSyncLogs.filter((log) => log.status === 'FAILED').length;
  const failedWebhooks = visibleWebhookEvents.filter((event) => event.status === 'FAILED').length;

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [connectionResponse, propertyResponse, categoryResponse, ratePlanResponse, backgroundJobResponse, webhookEventResponse, metricsResponse] = await Promise.all([
        api.get<PaginatedResponse<ChannelConnection>>('/channels', { params: { limit: 100 } }),
        api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } }),
        api.get<PaginatedResponse<RoomCategory>>('/room-categories', { params: { limit: 100 } }),
        api.get<PaginatedResponse<RatePlan>>('/rate-plans', { params: { limit: 100 } }),
        api.get<PaginatedResponse<BackgroundJob>>('/background-jobs', { params: { limit: 50 } }),
        api.get<PaginatedResponse<WebhookEvent>>('/webhook-events', { params: { limit: 50 } }),
        api.get<MetricsSummary>('/metrics/summary'),
      ]);
      const loadedConnections = unwrapList(connectionResponse.data);
      const loadedProperties = unwrapList(propertyResponse.data);

      setConnections(loadedConnections);
      setProperties(loadedProperties);
      setCategories(unwrapList(categoryResponse.data));
      setRatePlans(unwrapList(ratePlanResponse.data));
      setBackgroundJobs(backgroundJobResponse.data.data);
      setWebhookEvents(webhookEventResponse.data.data);
      setMetricsSummary(metricsResponse.data);

      if (!selectedConnectionId && loadedConnections[0]) {
        setSelectedConnectionId(loadedConnections[0].id);
      }

      if (!propertyId && loadedProperties[0]) {
        setPropertyId(loadedProperties[0].id);
      }
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setRoomCategoryId('');
    setRatePlanId('');
  }, [selectedPropertyId]);

  async function runAction(actionName: string, action: () => Promise<void>) {
    setStatus(null);
    setError(null);
    setPendingAction(actionName);

    try {
      await action();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setPendingAction(null);
    }
  }

  async function createConnection(event: React.FormEvent) {
    event.preventDefault();

    await runAction('create-connection', async () => {
      const response = await api.post<ChannelConnection>('/channels', {
        property_id: propertyId,
        provider,
        name,
        external_hotel_id: externalHotelId || undefined,
      });

      setSelectedConnectionId(response.data.id);
      setStatus('Channel connection created.');
      await loadData();
    });
  }

  async function createRoomMapping(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedConnectionId) return;

    await runAction('create-room-mapping', async () => {
      await api.post(`/channels/${selectedConnectionId}/room-mappings`, {
        room_category_id: roomCategoryId,
        external_room_id: externalRoomId,
      });

      setExternalRoomId('');
      setStatus('Room mapping created.');
      await loadData();
    });
  }

  async function createRateMapping(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedConnectionId) return;

    await runAction('create-rate-mapping', async () => {
      await api.post(`/channels/${selectedConnectionId}/rate-mappings`, {
        rate_plan_id: ratePlanId,
        external_rate_id: externalRateId,
      });

      setExternalRateId('');
      setStatus('Rate mapping created.');
      await loadData();
    });
  }

  async function triggerSync(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedConnectionId) return;

    await runAction('trigger-sync', async () => {
      const response = await api.post(`/channels/${selectedConnectionId}/sync`, {
        sync_type: syncType,
        from: syncType === 'INVENTORY' ? from : undefined,
        to: syncType === 'INVENTORY' ? to : undefined,
      });

      setStatus(`${syncType} sync ${response.data.status === 'QUEUED' ? 'queued.' : 'updated.'}`);
      await loadData();
    });
  }

  async function retryBackgroundJob(jobId: string) {
    setStatus(null);
    setError(null);
    setRetryingJobId(jobId);

    try {
      await api.post(`/background-jobs/${jobId}/retry`);
      setStatus('Background job queued for retry.');
      await loadData();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setRetryingJobId(null);
    }
  }

  return (
    <section className="channel-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2>Channel Manager</h2>
          <p className="page-subtitle">
            Manage OTA connections, external IDs, and manual syncs from one operational workspace.
          </p>
        </div>
      </div>

      {loading && <p className="muted">Loading channel data...</p>}
      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}

      <div className="channel-summary-grid">
        <SummaryTile label="Connections" value={connections.length.toString()} detail={`${activeConnections} active`} />
        <SummaryTile label="Room mappings" value={mappedRoomCount.toString()} detail={`${categories.length} internal categories`} />
        <SummaryTile label="Rate mappings" value={mappedRateCount.toString()} detail={`${ratePlans.length} internal rate plans`} />
      </div>

      <div className="channel-summary-grid">
        <SummaryTile label="Dead-letter jobs" value={deadLetterJobs.toString()} detail="Needs operator retry" />
        <SummaryTile label="Failed syncs" value={failedSyncs.toString()} detail="Selected workspace" />
        <SummaryTile label="Failed webhooks" value={failedWebhooks.toString()} detail="Selected workspace" />
      </div>

      <div className="info-strip">
        <strong>Control point</strong>
        <span>
          Keep one active property workspace selected while creating mappings. Syncs queue in the background and recent results appear in the activity ledger below.
        </span>
      </div>

      <FilterBar title="Channel filters">
        <label>
          Workspace
          <select onChange={(event) => setConnectionFilter(event.target.value)} value={connectionFilter}>
            <option value="ALL">All connections</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select onChange={(event) => setProviderFilter(event.target.value as 'ALL' | ChannelProvider)} value={providerFilter}>
            <option value="ALL">All providers</option>
            {providers.map((providerOption) => (
              <option key={providerOption} value={providerOption}>
                {providerOption}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ERROR">Error</option>
          </select>
        </label>
      </FilterBar>

      <div className="channel-workspace">
        <aside className="channel-rail">
          <div className="channel-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Connection</p>
                <h3>Active workspace</h3>
              </div>
            </div>
            <label>
              Selected connection
              <select
                disabled={connections.length === 0}
                onChange={(event) => setSelectedConnectionId(event.target.value)}
                value={selectedConnectionId}
              >
                <option value="">Select connection</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name} - {connection.provider}
                  </option>
                ))}
              </select>
            </label>

            {selectedConnection ? (
              <div className="connection-card">
                <div>
                  <span className={`status-pill ${selectedConnection.status.toLowerCase()}`}>
                    {selectedConnection.status}
                  </span>
                  <h4>{selectedConnection.name}</h4>
                  <p>{selectedConnection.property.name}</p>
                </div>
                <dl>
                  <div>
                    <dt>Provider</dt>
                    <dd>{selectedConnection.provider}</dd>
                  </div>
                  <div>
                    <dt>Hotel ID</dt>
                    <dd>{selectedConnection.external_hotel_id ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Mapped</dt>
                    <dd>
                      {selectedConnection.room_mappings.length} rooms / {selectedConnection.rate_mappings.length} rates
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="muted">Create a connection before adding mappings or running syncs.</p>
            )}
          </div>

          <form className="channel-panel" onSubmit={createConnection}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">New channel</p>
                <h3>Create connection</h3>
              </div>
            </div>
            <label>
              Property
              <select onChange={(event) => setPropertyId(event.target.value)} required value={propertyId}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="split-fields">
              <label>
                Provider
                <select onChange={(event) => setProvider(event.target.value as ChannelProvider)} value={provider}>
                  {providers.map((providerOption) => (
                    <option key={providerOption} value={providerOption}>
                      {providerOption}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input
                  onChange={(event) => setName(event.target.value)}
                  placeholder="SiteMinder Gateway"
                  required
                  value={name}
                />
              </label>
            </div>
            <label>
              External hotel ID
              <input
                onChange={(event) => setExternalHotelId(event.target.value)}
                placeholder="HOTEL-12345"
                value={externalHotelId}
              />
            </label>
            <button className="primary-button" disabled={pendingAction === 'create-connection'} type="submit">
              {pendingAction === 'create-connection' ? 'Saving...' : 'Save connection'}
            </button>
          </form>
        </aside>

        <div className="channel-main">
          <div className="channel-action-grid">
            <form className="channel-panel" onSubmit={createRoomMapping}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Rooms</p>
                  <h3>Map category</h3>
                </div>
              </div>
              <label>
                Internal room category
                <select
                  disabled={!selectedConnection}
                  onChange={(event) => setRoomCategoryId(event.target.value)}
                  required
                  value={roomCategoryId}
                >
                  <option value="">Select category</option>
                  {scopedCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                External room ID
                <input
                  disabled={!selectedConnection}
                  onChange={(event) => setExternalRoomId(event.target.value)}
                  placeholder="OTA-DELUXE"
                  required
                  value={externalRoomId}
                />
              </label>
              <button
                className="primary-button"
                disabled={!selectedConnection || pendingAction === 'create-room-mapping'}
                type="submit"
              >
                {pendingAction === 'create-room-mapping' ? 'Saving...' : 'Add mapping'}
              </button>
            </form>

            <form className="channel-panel" onSubmit={createRateMapping}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Rates</p>
                  <h3>Map rate plan</h3>
                </div>
              </div>
              <label>
                Internal rate plan
                <select
                  disabled={!selectedConnection}
                  onChange={(event) => setRatePlanId(event.target.value)}
                  required
                  value={ratePlanId}
                >
                  <option value="">Select rate plan</option>
                  {scopedRatePlans.map((ratePlan) => (
                    <option key={ratePlan.id} value={ratePlan.id}>
                      {ratePlan.name} ({ratePlan.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                External rate ID
                <input
                  disabled={!selectedConnection}
                  onChange={(event) => setExternalRateId(event.target.value)}
                  placeholder="OTA-DELUXE-FLEX"
                  required
                  value={externalRateId}
                />
              </label>
              <button
                className="primary-button"
                disabled={!selectedConnection || pendingAction === 'create-rate-mapping'}
                type="submit"
              >
                {pendingAction === 'create-rate-mapping' ? 'Saving...' : 'Add mapping'}
              </button>
            </form>

            <form className="channel-panel sync-panel" onSubmit={triggerSync}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Manual sync</p>
                  <h3>Push updates</h3>
                </div>
              </div>
              <div className="split-fields">
                <label>
                  Sync type
                  <select
                    disabled={!selectedConnection}
                    onChange={(event) => setSyncType(event.target.value as ChannelSyncType)}
                    value={syncType}
                  >
                    {syncTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  From
                  <input
                    disabled={!selectedConnection || syncType !== 'INVENTORY'}
                    onChange={(event) => setFrom(event.target.value)}
                    type="date"
                    value={from}
                  />
                </label>
              </div>
              <label>
                To
                <input
                  disabled={!selectedConnection || syncType !== 'INVENTORY'}
                  onChange={(event) => setTo(event.target.value)}
                  type="date"
                  value={to}
                />
              </label>
              <button
                className="primary-button"
                disabled={!selectedConnection || pendingAction === 'trigger-sync'}
                type="submit"
              >
                {pendingAction === 'trigger-sync' ? 'Syncing...' : 'Sync now'}
              </button>
            </form>
          </div>

          {selectedConnection && (
            <div className="mapping-grid">
              <MappingTable
                emptyText="No room mappings yet."
                rows={selectedConnection.room_mappings.map((mapping) => ({
                  id: mapping.id,
                  internal: `${mapping.room_category.name} (${mapping.room_category.code})`,
                  external: mapping.external_room_id,
                }))}
                title="Room mappings"
              />
              <MappingTable
                emptyText="No rate mappings yet."
                rows={selectedConnection.rate_mappings.map((mapping) => ({
                  id: mapping.id,
                  internal: `${mapping.rate_plan.name} (${mapping.rate_plan.code})`,
                  external: mapping.external_rate_id,
                }))}
                title="Rate mappings"
              />
            </div>
          )}
        </div>
      </div>

      <div className="table-card spaced-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Connected channels</p>
            <h3>{visibleConnections.length} connections</h3>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Property</th>
              <th>Status</th>
              <th>Room mappings</th>
              <th>Rate mappings</th>
              <th>Last sync</th>
            </tr>
          </thead>
          <tbody>
            {visibleConnections.map((connection) => (
              <tr key={connection.id}>
                <td>
                  <strong>{connection.name}</strong>
                  <span className="cell-note">{connection.provider}</span>
                </td>
                <td>{connection.property.name}</td>
                <td>
                  <span className={`status-pill ${connection.status.toLowerCase()}`}>{connection.status}</span>
                </td>
                <td>{connection.room_mappings.length}</td>
                <td>{connection.rate_mappings.length}</td>
                <td>{connection.recent_sync_logs[0]?.status ?? 'No syncs'}</td>
              </tr>
            ))}
            {visibleConnections.length === 0 && (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  No channel connections match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="operations-grid">
        <OperationalSurface
          emptyText="No sync activity yet."
          items={selectedSyncLogs}
          kicker="Recent activity"
          renderActions={() => null}
          renderMeta={(log) => (
            <>
              <span>{log.sync_type}</span>
              <span>{new Date(log.created_at).toLocaleString()}</span>
            </>
          )}
          renderStatus={(log) => (
            <span className={`status-pill ${log.status.toLowerCase()}`}>{log.status}</span>
          )}
          renderTitle={(log) => `${log.sync_type} sync`}
          renderTone={(log) => log.status.toLowerCase()}
          renderTrailing={(log) => log.error_message ?? 'No sync errors recorded.'}
          title={`${selectedSyncLogs.length} sync logs`}
        />
        <OperationalSurface
          emptyText="No background jobs in scope."
          items={visibleJobs}
          kicker="Worker queue"
          renderActions={(job) =>
            job.status === 'DEAD_LETTER' ? (
              <button
                className="secondary-button compact-button"
                disabled={retryingJobId === job.id}
                onClick={() => void retryBackgroundJob(job.id)}
                type="button"
              >
                {retryingJobId === job.id ? 'Retrying...' : 'Retry'}
              </button>
            ) : null
          }
          renderMeta={(job) => (
            <>
              <span>{job.type}</span>
              <span>{new Date(job.run_at).toLocaleString()}</span>
            </>
          )}
          renderStatus={(job) => (
            <span className={`status-pill ${backgroundJobTone(job).toLowerCase()}`}>{job.status}</span>
          )}
          renderTitle={(job) => job.entity_type ? `${job.type} · ${job.entity_type}` : job.type}
          renderTone={backgroundJobTone}
          renderTrailing={(job) => job.last_error ?? `Attempts ${job.attempts}/${job.max_attempts}`}
          title={`${visibleJobs.length} background jobs`}
        />
        <OperationalSurface
          emptyText="No webhook events in scope."
          items={visibleWebhookEvents}
          kicker="Webhook stream"
          renderActions={() => null}
          renderMeta={(event) => (
            <>
              <span>{event.domain}</span>
              <span>{new Date(event.received_at).toLocaleString()}</span>
            </>
          )}
          renderStatus={(event) => (
            <span className={`status-pill ${webhookTone(event).toLowerCase()}`}>{event.status}</span>
          )}
          renderTitle={(event) => `${event.provider} · ${event.event_type}`}
          renderTone={webhookTone}
          renderTrailing={(event) => event.processing_error ?? event.external_event_id ?? 'No processing errors recorded.'}
          title={`${visibleWebhookEvents.length} webhook events`}
        />
      </div>

      {metricsSummary && (
        <div className="table-card spaced-card">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Operations health</p>
              <h3>Live monitoring snapshot</h3>
            </div>
            <span className="cell-note">Updated {new Date(metricsSummary.timestamp).toLocaleString()}</span>
          </div>
          <div className="monitoring-grid">
            <MetricBucket
              label="Background jobs"
              value={metricsSummary.current.background_jobs.reduce((sum, entry) => sum + entry.count, 0)}
              note={summarizeMetricEntries(metricsSummary.current.background_jobs.map((entry) => `${entry.status}: ${entry.count}`))}
            />
            <MetricBucket
              label="Webhook events"
              value={metricsSummary.current.webhook_events.reduce((sum, entry) => sum + entry.count, 0)}
              note={summarizeMetricEntries(metricsSummary.current.webhook_events.map((entry) => `${entry.status}: ${entry.count}`))}
            />
            <MetricBucket
              label="Channel sync logs"
              value={metricsSummary.current.channel_sync_logs.reduce((sum, entry) => sum + entry.count, 0)}
              note={summarizeMetricEntries(metricsSummary.current.channel_sync_logs.map((entry) => `${entry.status}: ${entry.count}`))}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function MappingTable({
  emptyText,
  rows,
  title,
}: {
  emptyText: string;
  rows: Array<{ id: string; internal: string; external: string }>;
  title: string;
}) {
  return (
    <div className="mapping-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Mapping ledger</p>
          <h3>{title}</h3>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Internal</th>
            <th>External ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.internal}</td>
              <td>{row.external}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="empty-cell" colSpan={2}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OperationalSurface<T>({
  emptyText,
  items,
  kicker,
  renderActions,
  renderMeta,
  renderStatus,
  renderTitle,
  renderTone,
  renderTrailing,
  title,
}: {
  emptyText: string;
  items: T[];
  kicker: string;
  renderActions: (item: T) => React.ReactNode;
  renderMeta: (item: T) => React.ReactNode;
  renderStatus: (item: T) => React.ReactNode;
  renderTitle: (item: T) => string;
  renderTone: (item: T) => string;
  renderTrailing: (item: T) => string;
  title: string;
}) {
  return (
    <div className="mapping-card operational-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{kicker}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="operation-stream">
        {items.length === 0 && <div className="empty-state-card">{emptyText}</div>}
        {items.map((item, index) => (
          <article className={`operation-card ${renderTone(item)}`} key={index}>
            <div className="operation-card-header">
              <div>
                <strong>{renderTitle(item)}</strong>
                <div className="operation-meta">{renderMeta(item)}</div>
              </div>
              {renderStatus(item)}
            </div>
            <p className="operation-trailing">{renderTrailing(item)}</p>
            <div className="compact-action-row">{renderActions(item)}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function backgroundJobTone(job: BackgroundJob) {
  if (job.status === 'DEAD_LETTER') return 'failed';
  if (job.status === 'PROCESSING') return 'queued';
  if (job.status === 'SUCCEEDED') return 'succeeded';
  return 'pending';
}

function webhookTone(event: WebhookEvent) {
  if (event.status === 'FAILED') return 'failed';
  if (event.status === 'PROCESSED') return 'succeeded';
  return 'queued';
}

function MetricBucket({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function summarizeMetricEntries(entries: string[]) {
  return entries.length > 0 ? entries.join(' · ') : 'No current records';
}
