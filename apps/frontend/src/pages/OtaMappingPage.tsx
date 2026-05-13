import { CatalogList, formatConnectionLabel, MappingTable, SummaryTile } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';
import { CustomSelect } from '../components/CustomSelect';

export function OtaMappingPage({ workspace }: { workspace: ChannelWorkspace }) {
  return (
    <section className="channel-page">
      <div className="page-header ota-mapping-header">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2>OTA Mapping</h2>
          <p className="page-subtitle">
            Map HMS room categories and rate plans to Zodomus provider IDs so OTA inventory and rates can sync correctly.
          </p>
        </div>
        <section className="ota-mapping-connection-card">
          <div className="ota-mapping-connection-topline">
            <div>
              <p className="eyebrow">OTA connection</p>
              <h3>{workspace.selectedConnection ? formatConnectionLabel(workspace.selectedConnection) : 'Select OTA'}</h3>
            </div>
            {workspace.selectedConnection ? <span className="channel-mode-badge active">Active</span> : null}
          </div>
          {workspace.zodomusConnections.length > 1 ? (
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
          ) : (
            <div className="ota-mapping-connection-single">
              <span className="ota-mapping-connection-single-label">OTA connection</span>
            </div>
          )}
          {workspace.selectedConnection ? (
            <div className="ota-mapping-connection-meta">
              <span className="status-pill active">{workspace.selectedConnection.provider_config_summary?.ota_name ?? workspace.selectedConnection.provider}</span>
              <span className="status-pill">{workspace.selectedConnection.property.code}</span>
              <span className="status-pill">{workspace.selectedConnection.external_hotel_id ?? 'No property ID'}</span>
            </div>
          ) : (
            <p className="muted">Choose a saved Zodomus connection to start mapping rooms and rates.</p>
          )}
        </section>
      </div>

      {workspace.loading && <p className="muted">Loading mapping data...</p>}
      {workspace.error && <p className="error">{workspace.error}</p>}
      {workspace.status && <p className="success">{workspace.status}</p>}

      <div className="channel-summary-grid ota-mapping-summary-grid">
        <SummaryTile label="Configured connections" value={workspace.zodomusConnections.length.toString()} detail="Saved OTA links in HMS" />
        <SummaryTile label="Room mappings" value={workspace.zodomusConnections.reduce((total, connection) => total + connection.room_mappings.length, 0).toString()} detail="Mapped HMS room categories" />
        <SummaryTile label="Rate mappings" value={workspace.zodomusConnections.reduce((total, connection) => total + connection.rate_mappings.length, 0).toString()} detail="Mapped HMS rate plans" />
      </div>

      <div className="ota-mapping-main">
        <div className="channel-main">
          {workspace.selectedConnection && (
            <>
              <section className="channel-panel ota-mapping-posture-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Mapping posture</p>
                    <h3>Local HMS vs provider catalog</h3>
                  </div>
                </div>
                <div className="channel-readiness-grid ota-mapping-posture-grid">
                  <SummaryTile
                    label="HMS room categories"
                    value={String(workspace.mappingHealth.localRoomCategories)}
                    detail="Room categories currently available for this property."
                  />
                  <SummaryTile
                    label="Provider rooms"
                    value={String(workspace.mappingHealth.providerRooms)}
                    detail="Rooms returned by the provider catalog for this connection."
                  />
                  <SummaryTile
                    label="HMS rate plans"
                    value={String(workspace.mappingHealth.localRatePlans)}
                    detail="Local rate plans that can be mapped from HMS."
                  />
                  <SummaryTile
                    label="Provider products"
                    value={String(workspace.mappingHealth.providerRates)}
                    detail="Provider room-rate products currently exposed by Zodomus."
                  />
                </div>
                {(workspace.mappingHealth.needsMoreRoomCategories || workspace.mappingHealth.needsMoreRatePlans) && (
                  <div className="channel-warning-banner">
                    <strong>Catalog mismatch detected.</strong>
                    <span>
                      {workspace.mappingHealth.needsMoreRoomCategories
                        ? `Provider has ${workspace.mappingHealth.providerRooms} rooms but HMS only has ${workspace.mappingHealth.localRoomCategories} room categories. `
                        : ''}
                      {workspace.mappingHealth.needsMoreRatePlans
                        ? `Provider has ${workspace.mappingHealth.providerRates} products but HMS only has ${workspace.mappingHealth.localRatePlans} rate plans, so some provider products cannot be mapped yet.`
                        : ''}
                    </span>
                  </div>
                )}
              </section>

              <section className="channel-panel ota-mapping-provider-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Provider IDs</p>
                    <h3>Load room and rate IDs</h3>
                  </div>
                </div>
                <p className="muted">
                  Room mappings and rate mappings use the provider catalog loaded for this connection.
                </p>
                <div className="button-row">
                  <button className="secondary-button" disabled={!workspace.canLoadCatalog || workspace.pendingAction === 'load-provider-catalog'} onClick={() => void workspace.loadProviderCatalog()} type="button">
                    {workspace.pendingAction === 'load-provider-catalog' ? 'Loading...' : workspace.canMap ? 'Reload IDs' : 'Load IDs'}
                  </button>
                </div>
              </section>

              {workspace.canMap && (
                <section className="channel-panel ota-mapping-catalog-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Provider IDs</p>
                      <h3>Available room and rate IDs</h3>
                    </div>
                  </div>
                  <div className="split-panels">
                    <CatalogList emptyText="No room IDs were returned." items={workspace.catalogRooms} title="Rooms" valueKey="external_room_id" />
                    <CatalogList emptyText="No rate IDs were returned." items={workspace.catalogRates} title="Rates" valueKey="external_rate_id" />
                  </div>
                </section>
              )}

              <div className="channel-action-grid ota-mapping-action-grid">
                <form className="channel-panel ota-mapping-form-panel" onSubmit={workspace.createRoomMapping}>
                  <div className="section-heading"><div><p className="eyebrow">Rooms</p><h3>Map rooms</h3></div></div>
                  {!workspace.canMap && <p className="muted">Load room and rate IDs before creating mappings.</p>}
                  {workspace.mappingHealth.unmappedRoomCategories.length > 0 && (
                    <p className="channel-panel-intro">
                      Remaining unmapped room categories: {workspace.mappingHealth.unmappedRoomCategories.map((category) => category.code).join(', ')}.
                    </p>
                  )}
                  <div className="ota-mapping-form-fields">
                    <label>
                      HMS room category
                      <CustomSelect
                        disabled={!workspace.canMap}
                        onChange={workspace.setRoomCategoryId}
                        options={workspace.scopedCategories.map((category) => ({
                          label: `${category.name} (${category.code})`,
                          value: category.id,
                        }))}
                        placeholder="Select category"
                        value={workspace.roomCategoryId}
                      />
                    </label>
                    <label>
                      Provider room ID
                      {workspace.hasCatalogRooms ? (
                        <CustomSelect
                          disabled={!workspace.canMap}
                          onChange={workspace.setExternalRoomId}
                          options={workspace.catalogRooms.map((room) => ({
                            label: room.external_room_name ? `${room.external_room_name} - ${room.external_room_id}` : room.external_room_id,
                            value: room.external_room_id,
                          }))}
                          value={workspace.externalRoomId}
                        />
                      ) : (
                        <input disabled={!workspace.canMap} onChange={(event) => workspace.setExternalRoomId(event.target.value)} placeholder="Provider room ID" required value={workspace.externalRoomId} />
                      )}
                    </label>
                  </div>
                  <button className="primary-button" disabled={!workspace.canMap || workspace.pendingAction === 'create-room-mapping'} type="submit">Save room mapping</button>
                </form>

                <form className="channel-panel ota-mapping-form-panel" onSubmit={workspace.createRateMapping}>
                  <div className="section-heading"><div><p className="eyebrow">Rates</p><h3>Map rates</h3></div></div>
                  {!workspace.canMap && <p className="muted">Load room and rate IDs before creating mappings.</p>}
                  {workspace.mappingHealth.needsMoreRatePlans && (
                    <div className="channel-warning-banner">
                      <strong>More HMS rate plans are needed.</strong>
                      <span>
                        Zodomus currently exposes {workspace.mappingHealth.providerRates} provider products, but HMS only has {workspace.mappingHealth.localRatePlans} local rate plans for this property.
                      </span>
                    </div>
                  )}
                  {workspace.mappingHealth.unmappedRatePlans.length > 0 && (
                    <p className="channel-panel-intro">
                      Remaining unmapped rate plans: {workspace.mappingHealth.unmappedRatePlans.map((ratePlan) => ratePlan.code).join(', ')}.
                    </p>
                  )}
                  <div className="ota-mapping-form-fields">
                    <label>
                      HMS rate plan
                      <CustomSelect
                        disabled={!workspace.canMap}
                        onChange={workspace.setRatePlanId}
                        options={workspace.scopedRatePlans.map((ratePlan) => ({
                          label: `${ratePlan.name} (${ratePlan.code})`,
                          value: ratePlan.id,
                        }))}
                        placeholder="Select rate plan"
                        value={workspace.ratePlanId}
                      />
                    </label>
                    <label>
                      Provider rate ID
                      {workspace.hasCatalogRates ? (
                        <CustomSelect
                          disabled={!workspace.canMap}
                          onChange={(value) => {
                            const [roomId, rateId] = value.split('::');
                            workspace.setExternalRateRoomId(roomId);
                            workspace.setExternalRateId(rateId ?? '');
                          }}
                          options={workspace.filteredCatalogRates.map((rate) => ({
                            label: rate.external_rate_name ? `${rate.external_rate_name} - ${rate.external_rate_id}` : rate.external_rate_id,
                            value: `${rate.external_room_id ?? ''}::${rate.external_rate_id}`,
                          }))}
                          value={`${workspace.externalRateRoomId}::${workspace.externalRateId}`}
                        />
                      ) : (
                        <input
                          disabled={!workspace.canMap}
                          onChange={(event) => {
                            workspace.setExternalRateId(event.target.value);
                            workspace.setExternalRateRoomId(workspace.selectedRoomMappingForRatePlan?.external_room_id ?? '');
                          }}
                          placeholder="Provider rate ID"
                          required
                          value={workspace.externalRateId}
                        />
                      )}
                    </label>
                  </div>
                  {workspace.selectedRoomMappingForRatePlan && (
                    <p className="muted">
                      This HMS rate plan belongs to provider room <strong>{workspace.selectedRoomMappingForRatePlan.external_room_id}</strong>.
                    </p>
                  )}
                  {workspace.mappingHealth.rateMappingGap > 0 && (
                    <p className="muted">
                      Provider still has <strong>{workspace.mappingHealth.rateMappingGap}</strong> product
                      {workspace.mappingHealth.rateMappingGap === 1 ? '' : 's'} without HMS mappings.
                    </p>
                  )}
                  <button className="primary-button" disabled={!workspace.canMap || workspace.pendingAction === 'create-rate-mapping'} type="submit">Save rate mapping</button>
                </form>
              </div>

              <div className="mapping-grid">
                <MappingTable
                  emptyText="No room mappings yet."
                  rows={workspace.selectedConnection.room_mappings.map((mapping) => ({
                    id: mapping.id,
                    internal: `${mapping.room_category.name} (${mapping.room_category.code})`,
                    external: mapping.external_room_id,
                  }))}
                  title="Mapped rooms"
                />
                <MappingTable
                  emptyText="No rate mappings yet."
                  rows={workspace.selectedConnection.rate_mappings.map((mapping) => ({
                    id: mapping.id,
                    internal: `${mapping.rate_plan.name} (${mapping.rate_plan.code})`,
                    external: mapping.external_room_id ? `${mapping.external_room_id} / ${mapping.external_rate_id}` : mapping.external_rate_id,
                  }))}
                  title="Mapped rates"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
