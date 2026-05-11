import { ChannelSyncLog, InventoryReconciliation } from '../api/types';
import {
  formatConnectionLabel,
  SummaryTile,
  SyncStateCard,
  formatDateTime,
  formatInventorySnapshot,
  formatSignedNumber,
} from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';

export function WebhookSyncLogsPage({ workspace }: { workspace: ChannelWorkspace }) {
  const selectedConnection = workspace.selectedConnection;
  const providerSummary = selectedConnection?.provider_config_summary;
  const connectionStatusTone = mapTone(selectedConnection?.status);
  const webhookProcessedCount = workspace.webhookEvents.filter((event) => event.status === 'PROCESSED').length;
  const webhookFailedCount = workspace.webhookEvents.filter((event) => event.status === 'FAILED').length;
  const webhookReplayCount = workspace.webhookEvents.filter((event) => event.duplicate).length;

  return (
    <section className="channel-page webhook-sync-page">
      <div className="page-header webhook-sync-header">
        <div>
          <p className="eyebrow">Integrations</p>
          <h2>Connection diagnostics</h2>
          <p className="page-subtitle">
            Follow one OTA connection from sync health through recent attempts, row-level failures, inventory drift, and the property-scoped webhook
            ledger.
          </p>
        </div>
        {selectedConnection ? (
          <div className="webhook-sync-header-meta">
            <span className={`status-pill ${connectionStatusTone}`}>{selectedConnection.status}</span>
            <span className="status-pill">{selectedConnection.property.code}</span>
            <span className="status-pill">{selectedConnection.provider}</span>
          </div>
        ) : null}
      </div>

      {workspace.loading && <p className="muted">Loading channel diagnostics...</p>}
      {workspace.error && <p className="error">{workspace.error}</p>}
      {workspace.status && <p className="success">{workspace.status}</p>}

      <div className="channel-workspace webhook-sync-workspace">
        <aside className="channel-rail webhook-sync-rail">
          <section className="channel-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Connection</p>
                <h3>Select OTA</h3>
              </div>
            </div>
            <label>
              OTA connection
              <select disabled={workspace.zodomusConnections.length === 0} onChange={(event) => workspace.selectConnection(event.target.value)} value={workspace.selectedConnectionId}>
                <option value="">Select connection</option>
                {workspace.zodomusConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {formatConnectionLabel(connection)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              {workspace.zodomusConnections.length} saved connection{workspace.zodomusConnections.length === 1 ? '' : 's'} available in this workspace.
            </p>
          </section>
        </aside>

        <div className="channel-main webhook-sync-main">
          {selectedConnection ? (
            <>
              <div className="channel-summary-grid webhook-sync-summary-grid">
                <SummaryTile
                  label="Inventory sync"
                  value={selectedConnection.sync_summary.inventory.last_status ?? 'Never run'}
                  detail={formatSyncSnapshotDetail(selectedConnection.sync_summary.inventory)}
                />
                <SummaryTile
                  label="Rates sync"
                  value={selectedConnection.sync_summary.rates.last_status ?? 'Never run'}
                  detail={formatSyncSnapshotDetail(selectedConnection.sync_summary.rates)}
                />
                <SummaryTile
                  label="Reservation import"
                  value={selectedConnection.sync_summary.bookings.last_status ?? 'Never run'}
                  detail={formatSyncSnapshotDetail(selectedConnection.sync_summary.bookings)}
                />
                <SummaryTile
                  label="Inventory drift"
                  value={formatReconciliationValue(workspace.inventoryReconciliation, workspace.inventoryReconciliationLoading)}
                  detail={formatReconciliationDetail(workspace.inventoryReconciliation, workspace.inventoryReconciliationLoading)}
                />
              </div>

              <section className="channel-panel webhook-sync-wide-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Workspace</p>
                    <h3>Connection snapshot</h3>
                  </div>
                  <span className={`status-pill ${connectionStatusTone}`}>{selectedConnection.status}</span>
                </div>
                <div className="webhook-sync-facts">
                  <article className="webhook-sync-fact">
                    <span>Property</span>
                    <strong>{selectedConnection.property.name}</strong>
                  </article>
                  <article className="webhook-sync-fact">
                    <span>Provider</span>
                    <strong>{selectedConnection.provider}</strong>
                  </article>
                  <article className="webhook-sync-fact">
                    <span>External hotel</span>
                    <strong>{selectedConnection.external_hotel_id ?? 'Not linked'}</strong>
                  </article>
                  <article className="webhook-sync-fact">
                    <span>Sync window</span>
                    <strong>{workspace.syncWindowDays} day(s)</strong>
                  </article>
                  <article className="webhook-sync-fact">
                    <span>Environment</span>
                    <strong>{providerSummary?.environment ?? 'Default'}</strong>
                  </article>
                  <article className="webhook-sync-fact">
                    <span>Ready state</span>
                    <strong>{providerSummary?.setup_status.ready ? 'Ready' : 'Needs action'}</strong>
                  </article>
                </div>
                <div className="webhook-sync-scope-grid">
                  <article className="webhook-sync-scope-note">
                    <p className="eyebrow">Connection-scoped</p>
                    <h4>Primary diagnostics</h4>
                    <p>Sync health, sync logs, failed inventory rows, and inventory reconciliation are tied directly to this connection ID.</p>
                  </article>
                  <article className="webhook-sync-scope-note">
                    <p className="eyebrow">Property-scoped</p>
                    <h4>Webhook ledger</h4>
                    <p>Webhook events are filtered by property, so they describe inbound traffic for this property rather than only this single connection.</p>
                  </article>
                </div>
              </section>

              <section className="channel-panel webhook-sync-wide-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Operations</p>
                    <h3>Sync health</h3>
                  </div>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={workspace.pendingAction === 'inventory-sync'}
                      onClick={() => void workspace.runInventorySync()}
                      type="button"
                    >
                      {workspace.pendingAction === 'inventory-sync' ? 'Queueing...' : 'Sync inventory'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={workspace.pendingAction === 'rates-sync'}
                      onClick={() => void workspace.runRatesSync()}
                      type="button"
                    >
                      {workspace.pendingAction === 'rates-sync' ? 'Queueing...' : 'Sync rates'}
                    </button>
                  </div>
                </div>
                <div className="split-panels webhook-sync-compact-cards">
                  <SyncStateCard label="Inventory" state={selectedConnection.sync_summary.inventory} />
                  <SyncStateCard label="Rates" state={selectedConnection.sync_summary.rates} />
                  <SyncStateCard label="Reservation import" state={selectedConnection.sync_summary.bookings} />
                </div>
                <p className="muted">
                  Automation currently compares or pushes a {workspace.syncWindowDays}-day window from today. Use the detailed logs below for request and
                  provider payloads.
                </p>
              </section>

              <div className="webhook-sync-log-grid">
                <section className="channel-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Sync logs</p>
                      <h3>Recent connection attempts</h3>
                    </div>
                    <span className="status-pill">{workspace.syncLogs.length}</span>
                  </div>
                  {workspace.syncLogsLoading ? <p className="muted">Loading sync logs…</p> : null}
                  {workspace.syncLogsError ? <p className="error">{workspace.syncLogsError}</p> : null}
                  {workspace.syncLogs.length > 0 ? (
                    <div className="diagnostic-log-list">
                      {workspace.syncLogs.slice(0, 12).map((log, index) => {
                        const syncSummary = summarizeSyncLog(log);

                        return (
                          <details className="diagnostic-log-item" key={log.id} open={index === 0}>
                            <summary>
                              <div className="diagnostic-log-top">
                                <div className="diagnostic-log-title">
                                  <span className={`status-pill ${mapTone(log.status)}`}>{log.status}</span>
                                  <strong>{log.sync_type}</strong>
                                  <span className="diagnostic-log-time">{formatDateTime(log.created_at)}</span>
                                </div>
                                <span className="diagnostic-log-id">{shortId(log.id)}</span>
                              </div>
                              <div className="diagnostic-log-meta">
                                <span>{syncSummary.inlineSummary}</span>
                                {syncSummary.errorText ? <span className="diagnostic-error-text">{syncSummary.errorText}</span> : null}
                              </div>
                            </summary>
                            <div className="diagnostic-log-details">
                              <div className="diagnostic-kv-grid">
                                <DetailStat label="Created" value={formatDateTime(log.created_at)} />
                                <DetailStat label="Status" value={log.status} />
                                <DetailStat label="Type" value={log.sync_type} />
                                <DetailStat label="Sync log ID" value={log.id} />
                              </div>
                              <div className="diagnostic-json-grid">
                                <PayloadBlock label="Request payload" value={log.request_payload} />
                                <PayloadBlock label="Response payload" value={log.response_payload} />
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted">No sync logs are available for this connection yet.</p>
                  )}
                </section>

                <section className="channel-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Failed inventory rows</p>
                      <h3>Persisted row analytics</h3>
                    </div>
                  </div>
                  {workspace.inventoryRowResultsLoading ? <p className="muted">Loading row-level inventory failures…</p> : null}
                  {workspace.inventoryRowResultsError ? <p className="error">{workspace.inventoryRowResultsError}</p> : null}
                  {workspace.inventoryRowResults ? (
                    <>
                      <div className="split-panels webhook-sync-compact-cards">
                        <SummaryTile
                          detail="Historical inventory row attempts persisted for this connection across sync runs."
                          label="Stored row attempts"
                          value={String(workspace.inventoryRowResults.summary.total_rows)}
                        />
                        <SummaryTile
                          detail="Historical failed row attempts across the persisted inventory sync runs."
                          label="Failed row attempts"
                          value={String(workspace.inventoryRowResults.summary.failed_rows)}
                        />
                        <SummaryTile
                          detail="Distinct provider rooms that have at least one persisted failed row attempt."
                          label="Failed rooms"
                          value={String(workspace.inventoryRowResults.summary.failed_rooms)}
                        />
                        <SummaryTile
                          detail="Rows that completed successfully and were persisted."
                          label="Succeeded rows"
                          value={String(workspace.inventoryRowResults.summary.succeeded_rows)}
                        />
                      </div>
                      <div className="split-panels webhook-sync-mini-grid">
                        <div className="mapping-card">
                          <div className="section-heading">
                            <div>
                              <p className="eyebrow">Recent failures</p>
                              <h3>Latest failed room/date rows</h3>
                            </div>
                          </div>
                          {workspace.inventoryRowResults.recent_failed_rows.length > 0 ? (
                            <div className="mapping-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Provider room</th>
                                    <th>Available</th>
                                    <th>Error</th>
                                    <th>Seen</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {workspace.inventoryRowResults.recent_failed_rows.slice(0, 10).map((row) => (
                                    <tr key={row.id}>
                                      <td>{row.sync_date}</td>
                                      <td>{row.external_room_id}</td>
                                      <td>{row.available}</td>
                                      <td>{row.error_message ?? '-'}</td>
                                      <td>{formatDateTime(row.created_at)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="muted">No failed inventory rows have been persisted for this connection yet.</p>
                          )}
                        </div>
                        <div className="mapping-card">
                          <div className="section-heading">
                            <div>
                              <p className="eyebrow">Recurring rooms</p>
                              <h3>Most failure-prone provider rooms</h3>
                            </div>
                          </div>
                          {workspace.inventoryRowResults.grouped_failures.length > 0 ? (
                            <div className="mapping-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Provider room</th>
                                    <th>Failures</th>
                                    <th>Last date</th>
                                    <th>Last failure</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {workspace.inventoryRowResults.grouped_failures.slice(0, 10).map((row) => (
                                    <tr key={row.external_room_id}>
                                      <td>{row.external_room_id}</td>
                                      <td>{row.failure_count}</td>
                                      <td>{row.last_failed_date ?? '-'}</td>
                                      <td>{row.last_failed_at ? formatDateTime(row.last_failed_at) : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="muted">No recurring failed rooms are currently persisted.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </section>
              </div>

              <section className="channel-panel webhook-sync-wide-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Operations</p>
                    <h3>Inventory reconciliation</h3>
                  </div>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={workspace.inventoryReconciliationLoading || workspace.pendingAction === 'refresh-reconciliation'}
                      onClick={() => void workspace.refreshInventoryReconciliation()}
                      type="button"
                    >
                      {workspace.pendingAction === 'refresh-reconciliation' ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!workspace.inventoryReconciliation?.compared_window || workspace.pendingAction === 'resync-reconciliation' || workspace.inventoryReconciliationLoading}
                      onClick={() => void workspace.resyncInventoryDriftWindow()}
                      type="button"
                    >
                      {workspace.pendingAction === 'resync-reconciliation' ? 'Queueing...' : 'Re-sync compared window'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={workspace.latestInventorySyncLog?.status !== 'PARTIAL_FAILED' || workspace.pendingAction === 'retry-failed-inventory-rows' || workspace.inventoryReconciliationLoading}
                      onClick={() => void workspace.retryFailedInventoryRows()}
                      type="button"
                    >
                      {workspace.pendingAction === 'retry-failed-inventory-rows' ? 'Queueing...' : 'Retry failed rows'}
                    </button>
                  </div>
                </div>
                {workspace.inventoryReconciliationLoading ? <p className="muted">Calculating current HMS inventory drift…</p> : null}
                {workspace.inventoryReconciliationError ? <p className="error">{workspace.inventoryReconciliationError}</p> : null}
                {workspace.inventoryReconciliation ? (
                  <>
                    <div className="wizard-summary">
                      <span className={`status-pill ${mapTone(workspace.inventoryReconciliation.status)}`}>{formatReconciliationValue(workspace.inventoryReconciliation, false)}</span>
                      {workspace.inventoryReconciliation.compared_window ? (
                        <span className="status-pill">
                          Window: {workspace.inventoryReconciliation.compared_window.from} to {workspace.inventoryReconciliation.compared_window.to}
                        </span>
                      ) : null}
                      {workspace.inventoryReconciliation.latest_synced_at ? (
                        <span className="status-pill">Last baseline: {formatDateTime(workspace.inventoryReconciliation.latest_synced_at)}</span>
                      ) : null}
                    </div>
                    <div className="split-panels webhook-sync-compact-cards">
                      <SummaryTile
                        detail="Rows compared across the latest successful inventory window."
                        label="Compared rows"
                        value={String(workspace.inventoryReconciliation.summary.compared_row_count)}
                      />
                      <SummaryTile
                        detail="Rows whose HMS inventory still matches the last pushed snapshot."
                        label="Unchanged"
                        value={String(workspace.inventoryReconciliation.summary.unchanged_rows)}
                      />
                      <SummaryTile
                        detail="Rows that differ, disappeared, or were added since the last successful push."
                        label="Drift rows"
                        value={String(
                          workspace.inventoryReconciliation.summary.drifted_rows +
                            workspace.inventoryReconciliation.summary.snapshot_only_rows +
                            workspace.inventoryReconciliation.summary.current_only_rows,
                        )}
                      />
                      <SummaryTile
                        detail="Net HMS available-room change across the compared window."
                        label="Availability delta"
                        value={formatSignedNumber(workspace.inventoryReconciliation.summary.total_available_delta)}
                      />
                    </div>
                    {workspace.inventoryReconciliation.drift_rows.length > 0 ? (
                      <div className="mapping-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Provider room</th>
                              <th>HMS room</th>
                              <th>Status</th>
                              <th>Last pushed</th>
                              <th>Current HMS</th>
                              <th>Availability delta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.inventoryReconciliation.drift_rows.slice(0, 12).map((row) => (
                              <tr key={`${row.date}-${row.external_room_id}`}>
                                <td>{row.date}</td>
                                <td>{row.external_room_id}</td>
                                <td>{row.room_category_code ?? '-'}</td>
                                <td>{row.status}</td>
                                <td>{formatInventorySnapshot(row.last_pushed)}</td>
                                <td>{formatInventorySnapshot(row.current_expected)}</td>
                                <td>{row.delta ? formatSignedNumber(row.delta.available) : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">No inventory drift is currently detected for the latest successful sync window.</p>
                    )}
                  </>
                ) : null}
              </section>

              <section className="channel-panel webhook-sync-wide-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Webhook events</p>
                    <h3>Property-scoped inbound ledger</h3>
                  </div>
                  <span className="status-pill">{workspace.webhookEvents.length}</span>
                </div>
                <div className="split-panels webhook-sync-compact-cards">
                  <SummaryTile label="Loaded events" value={String(workspace.webhookEvents.length)} detail="Current fetched event window after property filtering." />
                  <SummaryTile label="Processed" value={String(webhookProcessedCount)} detail="Events in the loaded window that completed processing." />
                  <SummaryTile label="Failed" value={String(webhookFailedCount)} detail="Events in the loaded window that currently show processing failure." />
                  <SummaryTile label="Replays" value={String(webhookReplayCount)} detail="Events marked duplicate or replayed within the same loaded window." />
                </div>
                <p className="muted">This section stays on the page for inbound-event context, but it is intentionally lower priority than connection-scoped sync diagnostics.</p>
                {workspace.webhookEventsLoading ? <p className="muted">Loading webhook events…</p> : null}
                {workspace.webhookEventsError ? <p className="error">{workspace.webhookEventsError}</p> : null}
                {workspace.webhookEvents.length > 0 ? (
                  <div className="diagnostic-log-list">
                    {workspace.webhookEvents.slice(0, 12).map((event, index) => (
                      <details className="diagnostic-log-item" key={event.id} open={index === 0}>
                        <summary>
                          <div className="diagnostic-log-top">
                            <div className="diagnostic-log-title">
                              <span className={`status-pill ${mapTone(event.status)}`}>{event.status}</span>
                              <strong>{event.event_type}</strong>
                              <span className="diagnostic-log-time">{formatDateTime(event.received_at)}</span>
                            </div>
                            <span className="diagnostic-log-id">{shortId(event.id)}</span>
                          </div>
                          <div className="diagnostic-log-meta">
                            <span>
                              {event.provider} · {event.domain} · {event.duplicate ? 'Replay detected' : 'Primary event'}
                            </span>
                            {event.processing_error ? <span className="diagnostic-error-text">{event.processing_error}</span> : null}
                          </div>
                        </summary>
                        <div className="diagnostic-log-details">
                          <div className="diagnostic-kv-grid">
                            <DetailStat label="Provider" value={event.provider} />
                            <DetailStat label="Domain" value={event.domain} />
                            <DetailStat label="Received" value={formatDateTime(event.received_at)} />
                            <DetailStat label="Processed" value={event.processed_at ? formatDateTime(event.processed_at) : 'Not processed'} />
                            <DetailStat label="External event" value={event.external_event_id ?? 'None'} />
                            <DetailStat label="Property" value={event.property_id ?? 'Global'} />
                            <DetailStat label="Duplicate" value={event.duplicate ? 'Yes' : 'No'} />
                            <DetailStat label="Dedupe key" value={event.dedupe_key} />
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No webhook events match this property scope yet.</p>
                )}
              </section>
            </>
          ) : (
            <section className="channel-panel webhook-sync-wide-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Connection</p>
                  <h3>Choose a workspace</h3>
                </div>
              </div>
              <p className="muted">Select a saved OTA connection to load its sync health, row analytics, drift checks, and webhook ledger.</p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostic-kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PayloadBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="diagnostic-json-block">
      <p className="eyebrow">{label}</p>
      <pre>{formatPayloadPreview(value)}</pre>
    </div>
  );
}

function summarizeSyncLog(log: ChannelSyncLog) {
  const requestPayload = asRecord(log.request_payload);
  const responsePayload = asRecord(log.response_payload);
  const responseSummary = asRecord(responsePayload?.summary);
  const parts = [
    requestWindowLabel(requestPayload),
    summarizeRowCounts(responseSummary),
    readString(responsePayload?.message),
    readString(responsePayload?.status_message),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return {
    inlineSummary: parts[0] ?? 'Expand to inspect request and response payloads.',
    errorText: log.error_message ?? parts[1] ?? null,
  };
}

function formatSyncSnapshotDetail(state: {
  last_synced_at: string | null;
  next_due_at: string | null;
  last_error: string | null;
}) {
  if (state.last_error) return state.last_error;
  if (state.last_synced_at) return `Last run: ${formatDateTime(state.last_synced_at)}`;
  if (state.next_due_at) return `Next due: ${formatDateTime(state.next_due_at)}`;
  return 'No completed sync recorded yet.';
}

function formatReconciliationValue(reconciliation: InventoryReconciliation | null | undefined, loading: boolean) {
  if (loading) return 'Refreshing';
  if (!reconciliation) return 'No baseline';

  switch (reconciliation.status) {
    case 'IN_SYNC':
      return 'In sync';
    case 'DRIFT_DETECTED':
      return 'Drift detected';
    default:
      return 'No baseline';
  }
}

function formatReconciliationDetail(reconciliation: InventoryReconciliation | null | undefined, loading: boolean) {
  if (loading) return 'Recomputing the latest compared window.';
  if (!reconciliation) return 'No reconciliation snapshot is loaded yet.';
  if (reconciliation.latest_synced_at) return `Last baseline: ${formatDateTime(reconciliation.latest_synced_at)}`;
  return reconciliation.message ?? 'No successful inventory baseline has been stored yet.';
}

function requestWindowLabel(payload: Record<string, unknown> | null) {
  const from = readString(payload?.from);
  const to = readString(payload?.to);
  if (from && to) return `${from} to ${to}`;
  return null;
}

function summarizeRowCounts(summary: Record<string, unknown> | null) {
  const failedRows = readNumber(summary?.failed_rows);
  const succeededRows = readNumber(summary?.succeeded_rows);
  const comparedRows = readNumber(summary?.compared_row_count);
  const parts = [
    typeof failedRows === 'number' ? `${failedRows} failed` : null,
    typeof succeededRows === 'number' ? `${succeededRows} succeeded` : null,
    typeof comparedRows === 'number' ? `${comparedRows} compared` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatPayloadPreview(value: unknown) {
  if (value == null) return 'No payload stored.';

  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 900 ? `${text.slice(0, 900)}\n…` : text;
  } catch {
    return String(value);
  }
}

function mapTone(status: string | null | undefined) {
  switch (status) {
    case 'ACTIVE':
    case 'SUCCEEDED':
    case 'PROCESSED':
    case 'IN_SYNC':
      return 'available';
    case 'FAILED':
    case 'DEAD_LETTER':
      return 'failed';
    case 'PARTIAL_FAILED':
    case 'PENDING':
    case 'PROCESSING':
    case 'PAUSED':
    case 'RECEIVED':
    case 'DRIFT_DETECTED':
      return 'queued';
    default:
      return '';
  }
}

function shortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
