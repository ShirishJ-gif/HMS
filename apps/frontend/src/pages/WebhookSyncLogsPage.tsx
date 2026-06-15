import { useEffect, useMemo, useState } from 'react';
import { ChannelSyncLog, ChannelSyncState, InventoryReconciliation } from '../api/types';
import { formatConnectionLabel, SummaryTile, SyncStateCard, formatDateTime, formatInventorySnapshot, formatSignedNumber } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';
import { PageHeader, NoteStrip, secondaryBtn, Th, Td, ErrorMsg, LoadingMsg, SuccessMsg } from './ui';

export function WebhookSyncLogsPage({ workspace }: { workspace: ChannelWorkspace }) {
  const syncLogsPerPage = 8;
  const [syncLogPage, setSyncLogPage] = useState(1);
  const [selectedSyncLog, setSelectedSyncLog] = useState<ChannelSyncLog | null>(null);
  const selectedConnection = workspace.selectedConnection;
  const hasSavedConnections = workspace.zodomusConnections.length > 0;
  const providerSummary = selectedConnection?.provider_config_summary;
  const syncSummary = selectedConnection?.sync_summary ?? defaultSyncSummary;
  const connectionStatusTone = mapTone(selectedConnection?.status);
  const webhookProcessedCount = workspace.webhookEvents.filter((e) => e.status === 'PROCESSED').length;
  const webhookFailedCount = workspace.webhookEvents.filter((e) => e.status === 'FAILED').length;
  const webhookReplayCount = workspace.webhookEvents.filter((e) => e.duplicate).length;
  const sortedSyncLogs = useMemo(() => [...workspace.syncLogs].sort((a, b) => compareDateDesc(a.created_at, b.created_at)), [workspace.syncLogs]);
  const totalSyncLogPages = Math.max(1, Math.ceil(sortedSyncLogs.length / syncLogsPerPage));
  const visibleSyncLogs = sortedSyncLogs.slice((syncLogPage - 1) * syncLogsPerPage, syncLogPage * syncLogsPerPage);

  useEffect(() => { setSyncLogPage(1); setSelectedSyncLog(null); }, [workspace.selectedConnectionId, workspace.syncLogs.length]);
  useEffect(() => { if (syncLogPage > totalSyncLogPages) setSyncLogPage(totalSyncLogPages); }, [syncLogPage, totalSyncLogPages]);

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Integrations"
        title="Connection diagnostics"
        subtitle="Follow one OTA connection from sync health through recent attempts, row-level failures, inventory drift, and the property-scoped webhook ledger."
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 w-full max-w-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">OTA connection</p>
              <h3 className="text-sm font-bold text-slate-900">{selectedConnection ? formatConnectionLabel(selectedConnection) : hasSavedConnections ? 'Select OTA' : 'No OTA connection'}</h3>
            </div>
            {selectedConnection && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${connectionToneClass(connectionStatusTone)}`}>{selectedConnection.status}</span>}
          </div>
          {selectedConnection ? (
            <div className="flex flex-wrap gap-1.5">
              {[selectedConnection.property.code, selectedConnection.provider, providerSummary?.environment ?? 'Default'].map((tag) => (
                <span key={tag} className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">{tag}</span>
              ))}
            </div>
          ) : <p className="text-xs text-slate-400">{hasSavedConnections ? 'Choose a saved Zodomus connection to inspect sync health and webhook intake.' : 'Add an OTA connection from OTA Mapping to start sync and webhook monitoring.'}</p>}
        </div>
      </PageHeader>

      {workspace.loading && <LoadingMsg>Loading channel diagnostics...</LoadingMsg>}
      {workspace.error && <ErrorMsg>{workspace.error}</ErrorMsg>}
      {workspace.status && <SuccessMsg>{workspace.status}</SuccessMsg>}

      {selectedConnection ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryTile label="Inventory sync" value={syncSummary.inventory.last_status ?? 'Never run'} detail={formatSyncSnapshotDetail(syncSummary.inventory)} />
            <SummaryTile label="Rates sync" value={syncSummary.rates.last_status ?? 'Never run'} detail={formatSyncSnapshotDetail(syncSummary.rates)} />
            <SummaryTile label="Reservation import" value={syncSummary.bookings.last_status ?? 'Never run'} detail={formatSyncSnapshotDetail(syncSummary.bookings)} />
            <SummaryTile label="Inventory drift" value={formatReconciliationValue(workspace.inventoryReconciliation, workspace.inventoryReconciliationLoading)} detail={formatReconciliationDetail(workspace.inventoryReconciliation, workspace.inventoryReconciliationLoading)} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.07fr)_minmax(21rem,0.93fr)] gap-5 items-stretch">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Workspace</p>
                <h3 className="text-base font-bold text-slate-900">Connection snapshot</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[['Property', selectedConnection.property.name], ['Provider', selectedConnection.provider], ['External hotel', selectedConnection.external_hotel_id ?? 'Not linked'], ['Sync window', `${workspace.syncWindowDays} day(s)`], ['Environment', providerSummary?.environment ?? 'Default'], ['Ready state', providerSummary?.setup_status.ready ? 'Ready' : 'Needs action']].map(([label, value]) => (
                  <div key={String(label)} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{label}</span>
                    <strong className="text-sm font-bold text-slate-900">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                {[{ eyebrow: 'Connection-scoped', title: 'Primary diagnostics', desc: 'Sync health, sync logs, failed inventory rows, and inventory reconciliation are tied directly to this connection ID.' }, { eyebrow: 'Property-scoped', title: 'Webhook ledger', desc: 'Webhook events are filtered by property, so they describe inbound traffic for this property rather than only this single connection.' }].map((card) => (
                  <div key={card.title} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{card.eyebrow}</p>
                    <h4 className="text-sm font-bold text-slate-900 mb-1">{card.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-full">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
                <h3 className="text-base font-bold text-slate-900">Manual sync runbook</h3>
              </div>
              <div className="space-y-3">
                {[{ eyebrow: 'Inventory', title: workspace.syncGuidance.inventory.title, when: workspace.syncGuidance.inventory.when, warning: workspace.syncGuidance.inventory.warning }, { eyebrow: 'Rates', title: workspace.syncGuidance.rates.title, when: workspace.syncGuidance.rates.when, warning: workspace.syncGuidance.rates.warning }].map((card) => (
                  <div key={card.title} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{card.eyebrow}</p>
                    <h4 className="text-sm font-bold text-slate-900 mb-1">{card.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{card.when}</p>
                    {card.warning && <p className="text-xs text-slate-500 leading-relaxed mt-1">{card.warning}</p>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{workspace.syncGuidance.queueHint}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(23rem,0.82fr)] gap-5 items-stretch">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-full">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
                  <h3 className="text-base font-bold text-slate-900">Sync health</h3>
                </div>
                <div className="flex gap-2">
                  <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={workspace.pendingAction === 'inventory-sync'} onClick={() => void workspace.runInventorySync()} type="button">{workspace.pendingAction === 'inventory-sync' ? 'Queueing...' : 'Sync inventory'}</button>
                  <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={workspace.pendingAction === 'rates-sync'} onClick={() => void workspace.runRatesSync()} type="button">{workspace.pendingAction === 'rates-sync' ? 'Queueing...' : 'Sync rates'}</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3 gap-4">
                <SyncStateCard label="Inventory" state={syncSummary.inventory} />
                <SyncStateCard label="Rates" state={syncSummary.rates} />
                <SyncStateCard label="Reservation import" state={syncSummary.bookings} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">Automation currently compares or pushes a {workspace.syncWindowDays}-day window from today. Use the detailed logs below for request and provider payloads.</p>
              {!providerSummary?.setup_status.ready && <p className="text-xs text-slate-500 leading-relaxed">This connection is not yet ready. Manual sync calls can still be queued from HMS, but the provider may reject them until setup and final checks are complete.</p>}
            </div>

            <InventoryRowAnalytics workspace={workspace} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(23rem,0.82fr)] gap-5 items-start">
            <SyncLogsPanel
              selectedSyncLog={selectedSyncLog}
              setSelectedSyncLog={setSelectedSyncLog}
              sortedSyncLogs={sortedSyncLogs}
              syncLogPage={syncLogPage}
              syncLogsPerPage={syncLogsPerPage}
              totalSyncLogPages={totalSyncLogPages}
              visibleSyncLogs={visibleSyncLogs}
              workspace={workspace}
              setSyncLogPage={setSyncLogPage}
            />
            <div className="space-y-5">
              <InventoryReconciliationPanel workspace={workspace} />
              <BackgroundJobHealthPanel workspace={workspace} />
              <WebhookEventsPanel failedCount={webhookFailedCount} processedCount={webhookProcessedCount} replayCount={webhookReplayCount} workspace={workspace} />
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{hasSavedConnections ? 'Connection' : 'OTA mapping'}</p>
          <h3 className="text-base font-bold text-slate-900 mb-2">{hasSavedConnections ? 'Choose a workspace' : 'No OTA connections yet'}</h3>
          <p className="text-sm text-slate-500">{hasSavedConnections ? 'Select a saved OTA connection to load its sync health, row analytics, drift checks, and webhook ledger.' : 'Add an OTA connection from OTA Mapping before reviewing sync health and webhook logs.'}</p>
        </div>
      )}
    </section>
  );
}

function InventoryRowAnalytics({ workspace }: { workspace: ChannelWorkspace }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-full">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Failed inventory rows</p>
        <h3 className="text-sm font-bold text-slate-900">Persisted row analytics</h3>
      </div>
      {workspace.inventoryRowResultsLoading && <LoadingMsg>Loading row-level inventory failures...</LoadingMsg>}
      {workspace.inventoryRowResultsError && <ErrorMsg>{workspace.inventoryRowResultsError}</ErrorMsg>}
      {workspace.inventoryRowResults ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[{ label: 'Stored row attempts', value: workspace.inventoryRowResults.summary.total_rows }, { label: 'Failed row attempts', value: workspace.inventoryRowResults.summary.failed_rows }, { label: 'Failed rooms', value: workspace.inventoryRowResults.summary.failed_rooms }, { label: 'Succeeded rows', value: workspace.inventoryRowResults.summary.succeeded_rows }].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{s.label}</span>
                <strong className="text-sm font-bold text-slate-900">{s.value}</strong>
              </div>
            ))}
          </div>
          {workspace.inventoryRowResults.recent_failed_rows.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Recent failures</p>
              <table className="w-full text-xs min-w-[400px]">
                <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Date</Th><Th>Provider room</Th><Th>Available</Th><Th>Error</Th></tr></thead>
                <tbody>
                  {workspace.inventoryRowResults.recent_failed_rows.slice(0, 8).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                      <Td>{row.sync_date}</Td><Td className="font-mono text-slate-500">{row.external_room_id}</Td><Td>{row.available}</Td><Td className="text-rose-600 max-w-[12rem] truncate">{row.error_message ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-slate-400">No failed inventory rows persisted for this connection yet.</p>}
        </div>
      ) : null}
    </div>
  );
}

function SyncLogsPanel({ selectedSyncLog, setSelectedSyncLog, setSyncLogPage, sortedSyncLogs, syncLogPage, syncLogsPerPage, totalSyncLogPages, visibleSyncLogs, workspace }: {
  selectedSyncLog: ChannelSyncLog | null;
  setSelectedSyncLog: (log: ChannelSyncLog | null) => void;
  setSyncLogPage: (updater: (current: number) => number) => void;
  sortedSyncLogs: ChannelSyncLog[];
  syncLogPage: number;
  syncLogsPerPage: number;
  totalSyncLogPages: number;
  visibleSyncLogs: ChannelSyncLog[];
  workspace: ChannelWorkspace;
}) {
  const [drawerLog, setDrawerLog] = useState<ChannelSyncLog | null>(selectedSyncLog);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (selectedSyncLog) {
      setDrawerLog(selectedSyncLog);
      const frame = window.requestAnimationFrame(() => setDrawerOpen(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setDrawerOpen(false);
    const timeout = window.setTimeout(() => setDrawerLog(null), 500);
    return () => window.clearTimeout(timeout);
  }, [selectedSyncLog]);

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Sync logs</p>
            <h3 className="text-sm font-bold text-slate-900">Recent connection attempts</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">{workspace.syncLogs.length}</span>
            {sortedSyncLogs.length > syncLogsPerPage && <span className="text-xs text-slate-400">p{syncLogPage}/{totalSyncLogPages}</span>}
          </div>
        </div>
        {workspace.syncLogsLoading && <LoadingMsg>Loading sync logs...</LoadingMsg>}
        {workspace.syncLogsError && <ErrorMsg>{workspace.syncLogsError}</ErrorMsg>}
        {sortedSyncLogs.length > 0 ? (
          <div className="space-y-2">
            {visibleSyncLogs.map((log) => {
              const syncSummary = summarizeSyncLog(log);
              const toneClass = logToneClass(mapTone(log.status));
              return (
                <button key={log.id} className={`w-full text-left p-3 rounded-xl border transition-colors hover:bg-slate-50 ${selectedSyncLog?.id === log.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`} onClick={() => setSelectedSyncLog(log)} type="button">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${toneClass}`}>{log.status}</span>
                      <strong className="text-xs font-bold text-slate-900">{log.sync_type}</strong>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">{shortId(log.id)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 leading-relaxed">{syncSummary.inlineSummary}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{formatDateTime(log.created_at)}</span>
                  </div>
                  {syncSummary.metrics.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {syncSummary.metrics.map((metric) => (
                        <span
                          key={metric.label}
                          className={`inline-flex items-center text-[11px] font-semibold ${
                            metric.tone === 'failed' ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {metric.value} {metric.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {syncSummary.errorText && <p className="text-[11px] text-rose-600 leading-relaxed mt-0.5">{syncSummary.errorText}</p>}
                </button>
              );
            })}
            {sortedSyncLogs.length > syncLogsPerPage && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={syncLogPage === 1} onClick={() => setSyncLogPage((c) => Math.max(1, c - 1))} type="button">Newer</button>
                <span className="text-xs text-slate-400">Showing {(syncLogPage - 1) * syncLogsPerPage + 1}-{Math.min(syncLogPage * syncLogsPerPage, sortedSyncLogs.length)} of {sortedSyncLogs.length}</span>
                <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={syncLogPage === totalSyncLogPages} onClick={() => setSyncLogPage((c) => Math.min(totalSyncLogPages, c + 1))} type="button">Older</button>
              </div>
            )}
          </div>
        ) : <p className="text-xs text-slate-400">No sync logs available for this connection yet.</p>}
      </div>

      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ease-out ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!drawerLog}>
        <button className="absolute inset-0 w-full h-full bg-slate-900/10 cursor-default" onClick={() => setSelectedSyncLog(null)} tabIndex={drawerOpen ? 0 : -1} type="button" aria-label="Close selected sync log" />
        <aside className={`absolute right-0 top-0 h-full w-full max-w-[34rem] bg-white border-l border-slate-200 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform transform-gpu ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-modal="true" aria-label="Selected sync log payloads">
          {drawerLog && (
            <div className={`h-full overflow-y-auto p-5 space-y-4 transition-opacity duration-200 ease-out ${drawerOpen ? 'opacity-100 delay-100' : 'opacity-0'}`}>
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Selected log</p>
                  <h3 className="text-base font-bold text-slate-900">{drawerLog.sync_type}</h3>
                  <p className="text-xs text-slate-400 mt-1">{formatDateTime(drawerLog.created_at)}</p>
                </div>
                <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} onClick={() => setSelectedSyncLog(null)} type="button">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[['Status', drawerLog.status], ['Type', drawerLog.sync_type], ['Created', formatDateTime(drawerLog.created_at)], ['ID', drawerLog.id]].map(([label, value]) => (
                  <div key={String(label)} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{label}</span>
                    <strong className="text-xs font-semibold text-slate-900 break-all">{value}</strong>
                  </div>
                ))}
              </div>
              {[
                { label: 'Request payload', value: drawerLog.request_payload },
                { label: 'Response payload', value: drawerLog.response_payload },
              ].map(({ label, value }) => (
                <div key={String(label)}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                  <pre className="text-[11px] text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{formatPayloadPreview(value)}</pre>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function InventoryReconciliationPanel({ workspace }: { workspace: ChannelWorkspace }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Operations</p>
          <h3 className="text-base font-bold text-slate-900">Inventory reconciliation</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={workspace.inventoryReconciliationLoading || workspace.pendingAction === 'refresh-reconciliation'} onClick={() => void workspace.refreshInventoryReconciliation()} type="button">{workspace.pendingAction === 'refresh-reconciliation' ? 'Refreshing...' : 'Refresh'}</button>
          <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={!workspace.inventoryReconciliation?.compared_window || workspace.pendingAction === 'resync-reconciliation' || workspace.inventoryReconciliationLoading} onClick={() => void workspace.resyncInventoryDriftWindow()} type="button">{workspace.pendingAction === 'resync-reconciliation' ? 'Queueing...' : 'Re-sync'}</button>
          <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={workspace.latestInventorySyncLog?.status !== 'PARTIAL_FAILED' || workspace.pendingAction === 'retry-failed-inventory-rows' || workspace.inventoryReconciliationLoading} onClick={() => void workspace.retryFailedInventoryRows()} type="button">{workspace.pendingAction === 'retry-failed-inventory-rows' ? 'Queueing...' : 'Retry rows'}</button>
          <button className={`${secondaryBtn} !text-xs !px-3 !py-1.5`} disabled={workspace.latestRateSyncLog?.status !== 'PARTIAL_FAILED' || workspace.pendingAction === 'retry-failed-rate-rows'} onClick={() => void workspace.retryFailedRateRows()} type="button">{workspace.pendingAction === 'retry-failed-rate-rows' ? 'Queueing...' : 'Retry rates'}</button>
        </div>
      </div>
      {workspace.inventoryReconciliationLoading && <LoadingMsg>Calculating current HMS inventory drift...</LoadingMsg>}
      {workspace.inventoryReconciliationError && <ErrorMsg>{workspace.inventoryReconciliationError}</ErrorMsg>}
      {workspace.inventoryReconciliation && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[{ label: 'Status', value: workspace.inventoryReconciliation.status ?? '—' }, { label: 'Compared window', value: formatComparedWindow(workspace.inventoryReconciliation.compared_window) }, { label: 'Total rows', value: String(workspace.inventoryReconciliation.summary.compared_row_count ?? 0) }, { label: 'Drift rows', value: String(workspace.inventoryReconciliation.drift_rows?.length ?? 0) }].map((s) => (
              <div key={s.label} className={`border rounded-lg p-3 ${s.label === 'Status' && workspace.inventoryReconciliation?.status === 'DRIFT_DETECTED' ? 'bg-rose-50 border-rose-200' : s.label === 'Status' && workspace.inventoryReconciliation?.status === 'IN_SYNC' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{s.label}</span>
                <strong className="text-sm font-bold text-slate-900">{s.value}</strong>
              </div>
            ))}
          </div>
          {workspace.inventoryReconciliation.drift_rows && workspace.inventoryReconciliation.drift_rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[600px]">
                <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Date</Th><Th>Provider room</Th><Th>HMS room</Th><Th>Status</Th><Th>Last pushed</Th><Th>Current HMS</Th><Th>Delta</Th></tr></thead>
                <tbody>
                  {workspace.inventoryReconciliation.drift_rows.slice(0, 12).map((row) => (
                    <tr key={`${row.date}-${row.external_room_id}`} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                      <Td>{row.date}</Td><Td className="font-mono text-slate-500">{row.external_room_id}</Td><Td className="font-mono text-slate-500">{row.room_category_code ?? '—'}</Td><Td>{row.status}</Td><Td>{formatInventorySnapshot(row.last_pushed)}</Td><Td>{formatInventorySnapshot(row.current_expected)}</Td><Td className={row.delta && row.delta.available !== 0 ? 'text-rose-600 font-bold' : ''}>{row.delta ? formatSignedNumber(row.delta.available) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-slate-400">No inventory drift is currently detected for the latest successful sync window.</p>}
        </>
      )}
    </div>
  );
}

function BackgroundJobHealthPanel({ workspace }: { workspace: ChannelWorkspace }) {
  const now = Date.now();
  const pendingJobs = workspace.backgroundJobs.filter((job) => job.status === 'PENDING');
  const processingJobs = workspace.backgroundJobs.filter((job) => job.status === 'PROCESSING');
  const deadLetterJobs = workspace.backgroundJobs.filter((job) => job.status === 'DEAD_LETTER');
  const stuckJobs = workspace.backgroundJobs.filter((job) => {
    const updatedAt = new Date(job.updated_at).getTime();
    return (job.status === 'PENDING' || job.status === 'PROCESSING') && Number.isFinite(updatedAt) && now - updatedAt > 10 * 60_000;
  });
  const healthTone = deadLetterJobs.length > 0 ? 'failed' : stuckJobs.length > 0 ? 'queued' : 'available';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Worker health</p>
          <h3 className="text-base font-bold text-slate-900">Background jobs</h3>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${logToneClass(healthTone)}`}>
          {deadLetterJobs.length > 0 ? 'Attention' : stuckJobs.length > 0 ? 'Delayed' : 'Healthy'}
        </span>
      </div>
      {workspace.backgroundJobsLoading && <LoadingMsg>Loading background jobs...</LoadingMsg>}
      {workspace.backgroundJobsError && <ErrorMsg>{workspace.backgroundJobsError}</ErrorMsg>}
      <div className="grid grid-cols-2 gap-3">
        {[{ label: 'Pending', value: pendingJobs.length }, { label: 'Processing', value: processingJobs.length }, { label: 'Dead letter', value: deadLetterJobs.length }, { label: 'Stuck >10m', value: stuckJobs.length }].map((item) => (
          <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{item.label}</span>
            <strong className="text-sm font-bold text-slate-900">{item.value}</strong>
          </div>
        ))}
      </div>
      {(deadLetterJobs.length > 0 || stuckJobs.length > 0) ? (
        <div className="space-y-2">
          {[...deadLetterJobs, ...stuckJobs].slice(0, 5).map((job) => (
            <div key={job.id} className="border border-slate-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-800">{job.type}</strong>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${logToneClass(mapTone(job.status))}`}>{job.status}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(job.updated_at)} · attempts {job.attempts}/{job.max_attempts}</p>
              {job.last_error && <p className="text-[11px] text-rose-600 mt-1 line-clamp-2">{job.last_error}</p>}
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-slate-400">No stuck or dead-letter jobs for this workspace.</p>}
    </div>
  );
}

function WebhookEventsPanel({ failedCount, processedCount, replayCount, workspace }: { failedCount: number; processedCount: number; replayCount: number; workspace: ChannelWorkspace }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Webhook events</p>
          <h3 className="text-base font-bold text-slate-900">Property-scoped inbound ledger</h3>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">{workspace.webhookEvents.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SummaryTile label="Loaded" value={String(workspace.webhookEvents.length)} detail="Fetched events" />
        <SummaryTile label="Processed" value={String(processedCount)} detail="Completed events" />
        <SummaryTile label="Failed" value={String(failedCount)} detail="Failed events" />
        <SummaryTile label="Replays" value={String(replayCount)} detail="Duplicate events" />
      </div>
      {workspace.webhookEventsLoading && <LoadingMsg>Loading webhook events...</LoadingMsg>}
      {workspace.webhookEventsError && <ErrorMsg>{workspace.webhookEventsError}</ErrorMsg>}
      {workspace.webhookEvents.length > 0 ? (
        <div className="space-y-2">
          {workspace.webhookEvents.slice(0, 8).map((event) => {
            const toneClass = logToneClass(mapTone(event.status));
            return (
              <details key={event.id} className="group bg-white border border-slate-200 rounded-xl overflow-hidden">
                <summary className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer list-none hover:bg-slate-50/60">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${toneClass}`}>{event.status}</span>
                      <strong className="text-xs font-bold text-slate-900">{event.event_type}</strong>
                      <span className="text-[10px] text-slate-400">{formatDateTime(event.received_at)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{event.provider} · {event.domain} · {event.duplicate ? 'Replay detected' : 'Primary event'}</p>
                    {event.processing_error && <p className="text-[11px] text-rose-600">{event.processing_error}</p>}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{shortId(event.id)}</span>
                </summary>
                <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-2">
                    {[['Provider', event.provider], ['Domain', event.domain], ['Received', formatDateTime(event.received_at)], ['Processed', event.processed_at ? formatDateTime(event.processed_at) : 'Not processed'], ['External event', event.external_event_id ?? 'None'], ['Property', event.property_id ?? 'Global'], ['Duplicate', event.duplicate ? 'Yes' : 'No'], ['Dedupe key', event.dedupe_key]].map(([label, value]) => (
                      <div key={String(label)} className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{label}</span>
                        <strong className="text-xs font-semibold text-slate-900 break-all">{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : <p className="text-xs text-slate-400">No webhook events match this property scope yet.</p>}
    </div>
  );
}

function connectionToneClass(tone: string) {
  if (tone === 'available') return 'bg-emerald-50 text-emerald-700';
  if (tone === 'failed') return 'bg-rose-50 text-rose-700';
  if (tone === 'queued') return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

function logToneClass(tone: string) {
  if (tone === 'available') return 'bg-emerald-50 text-emerald-700';
  if (tone === 'failed') return 'bg-rose-50 text-rose-700';
  if (tone === 'queued') return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

const emptySyncState: ChannelSyncState = {
  last_error: null,
  last_status: null,
  last_synced_at: null,
  next_due_at: null,
};

const defaultSyncSummary = {
  bookings: emptySyncState,
  inventory: emptySyncState,
  rates: emptySyncState,
};

function formatSyncSnapshotDetail(state: { last_synced_at: string | null; next_due_at: string | null; last_error: string | null }) {
  if (state.last_error) return state.last_error;
  if (state.last_synced_at) return `Last run: ${formatDateTime(state.last_synced_at)}`;
  if (state.next_due_at) return `Next due: ${formatDateTime(state.next_due_at)}`;
  return 'No completed sync recorded yet.';
}

function formatReconciliationValue(reconciliation: InventoryReconciliation | null | undefined, loading: boolean) {
  if (loading) return 'Refreshing';
  if (!reconciliation) return 'No baseline';
  if (reconciliation.status === 'IN_SYNC') return 'In sync';
  if (reconciliation.status === 'DRIFT_DETECTED') return 'Drift detected';
  return 'No baseline';
}

function formatReconciliationDetail(reconciliation: InventoryReconciliation | null | undefined, loading: boolean) {
  if (loading) return 'Recomputing the latest compared window.';
  if (!reconciliation) return 'No reconciliation snapshot is loaded yet.';
  if (reconciliation.latest_synced_at) return `Last baseline: ${formatDateTime(reconciliation.latest_synced_at)}`;
  return reconciliation.message ?? 'No successful inventory baseline has been stored yet.';
}

function formatComparedWindow(window: InventoryReconciliation['compared_window']) {
  return window ? `${window.from} to ${window.to}` : '—';
}

function summarizeSyncLog(log: ChannelSyncLog) {
  const requestPayload = asRecord(log.request_payload);
  const responsePayload = asRecord(log.response_payload);
  const responseSummary = asRecord(responsePayload?.summary);
  const parts = [requestWindowLabel(requestPayload), readString(responsePayload?.message), readString(responsePayload?.status_message)].filter((v): v is string => Boolean(v && v.trim().length > 0));
  return {
    inlineSummary: parts[0] ?? 'Expand to inspect request and response payloads.',
    metrics: summarizeRowCounts(responseSummary),
    errorText: log.error_message ?? parts[1] ?? null,
  };
}

function requestWindowLabel(payload: Record<string, unknown> | null) { const from = readString(payload?.from); const to = readString(payload?.to); if (from && to) return `${from} to ${to}`; return null; }
function summarizeRowCounts(summary: Record<string, unknown> | null) {
  const failed = readNumber(summary?.failed_rows);
  const succeeded = readNumber(summary?.succeeded_rows);
  const metrics: Array<{ label: string; value: number; tone: 'failed' | 'succeeded' }> = [];
  if (typeof failed === 'number' && failed > 0) metrics.push({ label: 'failed', value: failed, tone: 'failed' });
  if (typeof succeeded === 'number') metrics.push({ label: 'succeeded', value: succeeded, tone: 'succeeded' });
  return metrics;
}

function formatPayloadPreview(value: unknown) { if (value == null) return 'No payload stored.'; try { const t = JSON.stringify(value, null, 2); return t.length > 900 ? `${t.slice(0, 900)}\n...` : t; } catch { return String(value); } }

function mapTone(status: string | null | undefined) {
  switch (status) {
    case 'ACTIVE': case 'SUCCEEDED': case 'PROCESSED': case 'IN_SYNC': return 'available';
    case 'FAILED': case 'DEAD_LETTER': return 'failed';
    case 'PARTIAL_FAILED': case 'PENDING': case 'PROCESSING': case 'PAUSED': case 'RECEIVED': case 'DRIFT_DETECTED': return 'queued';
    default: return '';
  }
}

function shortId(value: string) { return value.length > 8 ? value.slice(0, 8) : value; }
function compareDateDesc(left: string, right: string) { return new Date(right).getTime() - new Date(left).getTime(); }
function asRecord(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; return value as Record<string, unknown>; }
function readString(value: unknown) { return typeof value === 'string' && value.trim().length > 0 ? value : null; }
function readNumber(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
