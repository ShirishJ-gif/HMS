import { formatConnectionLabel, SetupBadge, SummaryTile } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';
import { CustomSelect } from '../components/CustomSelect';

export function ChannelManagerPage({ workspace }: { workspace: ChannelWorkspace }) {
  return (
    <section className="channel-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Integrations</p>
          <h2>Channel Manager</h2>
          <p className="page-subtitle">
            Connect OTA distribution through Zodomus, complete provider onboarding, and manage channel readiness from one workspace.
          </p>
        </div>
      </div>

      {workspace.loading && <p className="muted">Loading channel data...</p>}
      {workspace.error && <p className="error">{workspace.error}</p>}
      {workspace.status && <p className="success">{workspace.status}</p>}

      <div className="channel-summary-grid">
        <SummaryTile label="Configured connections" value={workspace.zodomusConnections.length.toString()} detail="Saved OTA links in HMS" />
        <SummaryTile
          label="Ready links"
          value={workspace.zodomusConnections.filter((connection) => connection.provider_config_summary?.setup_status.ready).length.toString()}
          detail="Connections ready for live sync"
        />
        <SummaryTile
          label="Automation enabled"
          value={workspace.zodomusConnections.filter((connection) => connection.provider_config_summary?.automation?.enabled).length.toString()}
          detail="Connections with scheduled sync enabled"
        />
      </div>

      <div className="channel-workspace">
        <aside className="channel-rail">
          <form className="channel-panel" onSubmit={workspace.createConnection}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">New connection</p>
                <h3>Add OTA connection</h3>
              </div>
            </div>
            <label>
              Hotel property
              <CustomSelect
                onChange={workspace.setPropertyId}
                options={workspace.properties.map((property) => ({
                  label: property.name,
                  value: property.id,
                }))}
                placeholder="Select property"
                value={workspace.propertyId}
              />
            </label>
            <label>
              OTA
              <CustomSelect
                onChange={(value) => workspace.setZodomusOtaKey(value as typeof workspace.zodomusOtaKey)}
                options={workspace.zodomusOtaOptions.map((option) => ({
                  label: option.label,
                  value: option.key,
                }))}
                value={workspace.zodomusOtaKey}
              />
            </label>
            <label>
              Zodomus property ID
              <input
                onChange={(event) => workspace.setZodomusPropertyId(event.target.value)}
                placeholder="999999"
                required
                value={workspace.zodomusPropertyId}
              />
            </label>
            <button className="primary-button" disabled={workspace.pendingAction === 'create-connection'} type="submit">
              {workspace.pendingAction === 'create-connection' ? 'Saving...' : 'Save connection'}
            </button>
          </form>

          <section className="channel-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Connection</p>
                <h3>Select OTA</h3>
              </div>
            </div>
            <label>
              OTA connection
              <CustomSelect
                disabled={workspace.zodomusConnections.length === 0}
                onChange={workspace.selectConnection}
                options={workspace.zodomusConnections.map((connection) => ({
                  label: formatConnectionLabel(connection),
                  value: connection.id,
                }))}
                placeholder="Select connection"
                value={workspace.selectedConnectionId}
              />
            </label>
            {workspace.selectedConnection ? (
              <div className="connection-card">
                <div>
                  <span className={`status-pill ${workspace.selectedConnection.status.toLowerCase()}`}>{workspace.selectedConnection.status}</span>
                  <h4>{formatConnectionLabel(workspace.selectedConnection)}</h4>
                  <p>{workspace.selectedConnection.property.name}</p>
                </div>
                <dl>
                  <div><dt>OTA</dt><dd>{workspace.selectedConnection.provider_config_summary?.ota_name ?? '-'}</dd></div>
                  <div><dt>Zodomus property ID</dt><dd>{workspace.selectedConnection.external_hotel_id ?? '-'}</dd></div>
                  <div><dt>Mapped</dt><dd>{workspace.selectedConnection.room_mappings.length} rooms / {workspace.selectedConnection.rate_mappings.length} rates</dd></div>
                  <div><dt>Readiness</dt><dd>{workspace.persistedSetupStatus?.ready ? 'Ready for sync' : 'Setup pending'}</dd></div>
                </dl>
                <button className="secondary-button" disabled={workspace.pendingAction === 'delete-connection'} onClick={() => void workspace.deleteConnection()} type="button">
                  {workspace.pendingAction === 'delete-connection' ? 'Removing...' : 'Remove connection'}
                </button>
                <div className="button-row">
                  <button className="secondary-button" disabled={workspace.pendingAction === 'pause-connection'} onClick={() => void workspace.pauseConnection()} type="button">Pause</button>
                  <button className="secondary-button" disabled={workspace.pendingAction === 'resume-connection'} onClick={() => void workspace.resumeConnection()} type="button">Resume</button>
                  <button className="secondary-button" disabled={workspace.pendingAction === 'disconnect-connection'} onClick={() => void workspace.disconnectConnection()} type="button">Disconnect</button>
                </div>
              </div>
            ) : (
              <p className="muted">Add an OTA connection to start onboarding.</p>
            )}
          </section>

          {workspace.selectedConnection && (
            <>
              <section className="channel-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Workspace</p>
                    <h3>Readiness status</h3>
                  </div>
                </div>
                <div className="wizard-summary">
                  <SetupBadge done={Boolean(workspace.persistedSetupStatus?.activated)} label="Activated" />
                  <SetupBadge done={Boolean(workspace.persistedSetupStatus?.catalog_loaded)} label="IDs loaded" />
                  <SetupBadge done={workspace.selectedConnection.room_mappings.length > 0} label="Rooms mapped" />
                  <SetupBadge done={workspace.selectedConnection.rate_mappings.length > 0} label="Rates mapped" />
                  <SetupBadge done={Boolean(workspace.persistedSetupStatus?.rooms_activated)} label="Rooms activated" />
                  <SetupBadge done={Boolean(workspace.persistedSetupStatus?.ready)} label="Ready" />
                </div>
                <div className="channel-readiness-grid">
                  <ReadinessStat label="Provider rooms" value={String(workspace.mappingHealth.providerRooms)} />
                  <ReadinessStat label="Provider products" value={String(workspace.mappingHealth.providerRates)} />
                  <ReadinessStat
                    label="Mapped rooms"
                    value={`${workspace.mappingHealth.mappedRooms}/${workspace.mappingHealth.localRoomCategories}`}
                  />
                  <ReadinessStat
                    label="Mapped rates"
                    value={`${workspace.mappingHealth.mappedRates}/${workspace.mappingHealth.localRatePlans}`}
                  />
                </div>
              </section>

              <section className="channel-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Mapping health</p>
                    <h3>Room and rate coverage</h3>
                  </div>
                </div>
                <div className="channel-readiness-grid">
                  <ReadinessStat label="HMS room categories" value={String(workspace.mappingHealth.localRoomCategories)} />
                  <ReadinessStat label="Provider rooms" value={String(workspace.mappingHealth.providerRooms)} />
                  <ReadinessStat label="HMS rate plans" value={String(workspace.mappingHealth.localRatePlans)} />
                  <ReadinessStat label="Provider products" value={String(workspace.mappingHealth.providerRates)} />
                </div>
                {(workspace.mappingHealth.needsMoreRoomCategories || workspace.mappingHealth.needsMoreRatePlans) && (
                  <div className="channel-warning-banner">
                    <strong>HMS catalog does not fully match the provider catalog.</strong>
                    <span>
                      {workspace.mappingHealth.needsMoreRoomCategories
                        ? `Add ${workspace.mappingHealth.localRoomCategoryShortfall} more HMS room categor${workspace.mappingHealth.localRoomCategoryShortfall === 1 ? 'y' : 'ies'} or reduce provider rooms. `
                        : ''}
                      {workspace.mappingHealth.needsMoreRatePlans
                        ? `Add ${workspace.mappingHealth.localRatePlanShortfall} more HMS rate plan${workspace.mappingHealth.localRatePlanShortfall === 1 ? '' : 's'} or deactivate extra provider products.`
                        : ''}
                    </span>
                  </div>
                )}
                {(workspace.mappingHealth.unmappedRoomCategories.length > 0 || workspace.mappingHealth.unmappedRatePlans.length > 0) && (
                  <div className="channel-gap-grid">
                    <article className="channel-gap-card">
                      <p className="eyebrow">Unmapped rooms</p>
                      <h4>{workspace.mappingHealth.unmappedRoomCategories.length}</h4>
                      <p>
                        {workspace.mappingHealth.unmappedRoomCategories.length > 0
                          ? workspace.mappingHealth.unmappedRoomCategories
                              .slice(0, 4)
                              .map((category) => `${category.name} (${category.code})`)
                              .join(', ')
                          : 'All HMS room categories are mapped.'}
                      </p>
                    </article>
                    <article className="channel-gap-card">
                      <p className="eyebrow">Unmapped rates</p>
                      <h4>{workspace.mappingHealth.unmappedRatePlans.length}</h4>
                      <p>
                        {workspace.mappingHealth.unmappedRatePlans.length > 0
                          ? workspace.mappingHealth.unmappedRatePlans
                              .slice(0, 4)
                              .map((ratePlan) => `${ratePlan.name} (${ratePlan.code})`)
                              .join(', ')
                          : 'All current HMS rate plans are mapped.'}
                      </p>
                    </article>
                  </div>
                )}
              </section>
            </>
          )}
        </aside>

        <div className="channel-main">
          {workspace.selectedConnection && (
            <>
              <section className="channel-panel channel-guidance-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Next step</p>
                    <h3>Operator runbook</h3>
                    <p className="channel-panel-intro">
                      Follow this sequence and stop when the provider reports a blocker. Do not continue to sync until the setup path is clear.
                    </p>
                  </div>
                  <span className={`channel-mode-badge ${workspace.persistedSetupStatus?.ready ? 'active' : 'idle'}`}>
                    {workspace.persistedSetupStatus?.ready ? 'Ready for sync' : 'Needs setup'}
                  </span>
                </div>
                <div className="channel-next-step-card">
                  <strong>{workspace.nextSetupAction}</strong>
                  <span>
                    The steps below reflect the current connection state, mapping counts, and provider check results for this OTA link.
                  </span>
                </div>
                <div className="channel-runbook-grid">
                  {workspace.setupRunbook.map((step, index) => (
                    <article className={`channel-runbook-step ${step.done ? 'done' : 'pending'}`} key={step.key}>
                      <span className="channel-runbook-order">0{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <p>{step.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {workspace.channelWarnings.length > 0 && (
                <section className="channel-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Action needed</p>
                      <h3>Setup blockers</h3>
                    </div>
                  </div>
                  <ul className="attention-list">
                    {workspace.channelWarnings.map((warning) => (
                      <li key={warning}>
                        <strong>Resolve before full sync</strong>
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="channel-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Provider IDs</p>
                    <h3>Room and rate IDs</h3>
                  </div>
                </div>
                <div className="channel-provider-copy">
                  {workspace.persistedSetupStatus?.last_check_message && (
                    <p className="muted">
                      Last provider check: {workspace.persistedSetupStatus.last_check_message}
                      {workspace.persistedSetupStatus.last_check_code ? ` (${workspace.persistedSetupStatus.last_check_code})` : ''}
                    </p>
                  )}
                  {workspace.persistedSetupStatus?.last_activation_message && (
                    <p className="muted">
                      Last activation: {workspace.persistedSetupStatus.last_activation_message}
                      {workspace.persistedSetupStatus.last_activation_code ? ` (${workspace.persistedSetupStatus.last_activation_code})` : ''}
                    </p>
                  )}
                  {workspace.persistedSetupStatus?.last_rooms_activation_message && (
                    <p className="muted">
                      Last room activation: {workspace.persistedSetupStatus.last_rooms_activation_message}
                      {workspace.persistedSetupStatus.last_rooms_activation_code ? ` (${workspace.persistedSetupStatus.last_rooms_activation_code})` : ''}
                    </p>
                  )}
                </div>
                {workspace.parsedProviderCheckStatuses && workspace.parsedProviderCheckStatuses.length > 0 && (
                  <div className="channel-provider-status-grid">
                    {workspace.parsedProviderCheckStatuses.map((status) => (
                      <article className="channel-provider-status-card" key={status.label}>
                        <span>{status.label}</span>
                        <strong>{status.value}</strong>
                      </article>
                    ))}
                  </div>
                )}
                <div className="button-row">
                  <button className="secondary-button" disabled={!workspace.canLoadCatalog || workspace.pendingAction === 'load-provider-catalog'} onClick={() => void workspace.loadProviderCatalog()} type="button">
                    {workspace.pendingAction === 'load-provider-catalog' ? 'Loading...' : 'Load IDs'}
                  </button>
                  <button className="secondary-button" disabled={!workspace.selectedConnection || workspace.pendingAction === 'property-check'} onClick={() => void workspace.runPropertyCheck()} type="button">Run property check</button>
                  <button className="secondary-button" disabled={!workspace.selectedConnection || workspace.pendingAction === 'property-activate'} onClick={() => void workspace.reactivateProperty()} type="button">Re-activate property</button>
                  <button className="primary-button" disabled={!workspace.canActivateMappedRooms || workspace.pendingAction === 'activate-mapped-rooms'} onClick={() => void workspace.activateMappedRooms()} type="button">Activate mapped rooms</button>
                </div>
              </section>

              <div className="channel-operations-layout">
                <form className="channel-panel channel-operations-panel" onSubmit={workspace.saveAutomationSettings}>
                  <div className="section-heading channel-operations-heading">
                    <div>
                      <p className="eyebrow">Operations</p>
                      <h3>Automation controls</h3>
                      <p className="channel-panel-intro">
                        Configure live sync cadence for this OTA link without losing visibility into the exact timings now in effect.
                      </p>
                    </div>
                    <span className={`channel-mode-badge ${workspace.automationEnabled ? 'active' : 'idle'}`}>
                      {workspace.automationEnabled ? 'Automation live' : 'Manual mode'}
                    </span>
                  </div>
                  <label className={`channel-automation-toggle${workspace.automationEnabled ? ' active' : ''}`}>
                    <input
                      checked={workspace.automationEnabled}
                      onChange={(event) => workspace.setAutomationEnabled(event.target.checked)}
                      type="checkbox"
                    />
                    <span className="channel-automation-copy">
                      <strong>Enable automatic sync</strong>
                      <span>
                        {workspace.automationEnabled
                          ? 'Inventory, rate, and reservation jobs will run on the schedule below.'
                          : 'Keep this connection in manual mode while onboarding, testing, or troubleshooting.'}
                      </span>
                    </span>
                    <span aria-hidden="true" className="channel-automation-switch">
                      <span />
                    </span>
                  </label>
                  <div className="channel-operations-stat-grid">
                    <AutomationStatCard label="Inventory" value={formatIntervalValue(workspace.inventoryInterval, 'min')} />
                    <AutomationStatCard label="Rates" value={formatIntervalValue(workspace.ratesInterval, 'min')} />
                    <AutomationStatCard
                      label="Reservation import"
                      value={formatIntervalValue(workspace.reservationImportInterval, 'min')}
                    />
                    <AutomationStatCard label="Sync window" value={formatIntervalValue(workspace.syncWindowDays, 'days')} />
                  </div>
                  <div className="channel-operations-groups">
                    <section className="channel-operations-group">
                      <div className="channel-operations-group-header">
                        <strong>Sync cadence</strong>
                        <span>Decide how often each scheduled sync job should run.</span>
                      </div>
                      <div className="split-fields">
                        <label>
                          Inventory minutes
                          <input min="1" onChange={(event) => workspace.setInventoryInterval(event.target.value)} type="number" value={workspace.inventoryInterval} />
                        </label>
                        <label>
                          Rate minutes
                          <input min="1" onChange={(event) => workspace.setRatesInterval(event.target.value)} type="number" value={workspace.ratesInterval} />
                        </label>
                        <label>
                          Reservation import minutes
                          <input
                            min="1"
                            onChange={(event) => workspace.setReservationImportInterval(event.target.value)}
                            type="number"
                            value={workspace.reservationImportInterval}
                          />
                        </label>
                        <label>
                          Sync window days
                          <input min="1" onChange={(event) => workspace.setSyncWindowDays(event.target.value)} type="number" value={workspace.syncWindowDays} />
                        </label>
                      </div>
                    </section>
                  </div>
                  <div className="channel-panel-footer">
                    <p className="channel-panel-footnote">Changes apply only to the currently selected OTA connection.</p>
                    <button className="primary-button channel-panel-submit" disabled={workspace.pendingAction === 'save-automation'} type="submit">
                      <span className="channel-panel-submit-copy">
                        <strong>{workspace.pendingAction === 'save-automation' ? 'Saving automation...' : 'Apply automation'}</strong>
                        <span>Update cadence for this OTA link</span>
                      </span>
                    </button>
                  </div>
                </form>

                <form className="channel-panel channel-admin-panel" onSubmit={workspace.submitProviderReservationEvent}>
                  <div className="section-heading channel-operations-heading">
                    <div>
                      <p className="eyebrow">Admin tools</p>
                      <h3>Provider reservation event</h3>
                      <p className="channel-panel-intro">
                        Send a provider-side test event and immediately inspect how the resulting reservation state lands in HMS.
                      </p>
                    </div>
                    <span className="channel-mode-badge neutral">Test hook</span>
                  </div>
                  <div className="channel-admin-highlight">
                    <div className="channel-admin-highlight-copy">
                      <span className="channel-admin-highlight-label">Selected event</span>
                      <strong>{formatProviderEventLabel(workspace.providerReservationEventStatus)}</strong>
                      <p>{describeProviderReservationEvent(workspace.providerReservationEventStatus)}</p>
                    </div>
                    <span className="channel-admin-highlight-badge">Syncs back into HMS</span>
                  </div>
                  <div className="channel-admin-form-grid">
                    <label>
                      Event
                      <select
                        onChange={(event) =>
                          workspace.setProviderReservationEventStatus(
                            event.target.value as (typeof workspace.providerReservationEventOptions)[number],
                          )
                        }
                        value={workspace.providerReservationEventStatus}
                      >
                        {workspace.providerReservationEventOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatProviderEventLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Reservation ID
                      <input
                        onChange={(event) => workspace.setProviderReservationId(event.target.value)}
                        placeholder={
                          workspace.providerReservationEventStatus === 'new'
                            ? 'Optional for new events'
                            : 'Required for modified or cancelled'
                        }
                        value={workspace.providerReservationId}
                      />
                    </label>
                  </div>
                  <div className="channel-panel-footer">
                    <p className="channel-panel-footnote">
                      Use the reservation ID for modified or cancelled events so HMS updates the intended imported stay.
                    </p>
                    <button
                      className="primary-button"
                      disabled={workspace.pendingAction === 'provider-reservation-event'}
                      type="submit"
                    >
                      {workspace.pendingAction === 'provider-reservation-event'
                        ? 'Sending...'
                        : `Send ${formatProviderEventLabel(workspace.providerReservationEventStatus)} event`}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function AutomationStatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="channel-automation-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ReadinessStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="channel-automation-stat channel-readiness-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatIntervalValue(value: string, unit: string) {
  const normalized = value.trim() || '-';
  return normalized === '-' ? normalized : `${normalized} ${unit}`;
}

function formatProviderEventLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeProviderReservationEvent(value: string) {
  if (value === 'new') {
    return 'Creates a fresh provider test reservation. Reservation ID can stay empty for this event.';
  }

  if (value === 'modified') {
    return 'Replays an update for an existing imported reservation using the reservation ID you provide.';
  }

  if (value === 'cancelled') {
    return 'Triggers a provider-side cancellation for the reservation ID so HMS can reconcile the imported stay.';
  }

  return 'Sends a provider-side test event and syncs the resulting reservation state back into HMS.';
}
