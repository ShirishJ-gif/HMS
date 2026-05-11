import { CatalogList, formatConnectionLabel, MappingTable, SummaryTile } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';

export function OtaMappingPage({ workspace }: { workspace: ChannelWorkspace }) {
  return (
    <section className="channel-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2>OTA Mapping</h2>
          <p className="page-subtitle">
            Map HMS room categories and rate plans to Zodomus provider IDs so OTA inventory and rates can sync correctly.
          </p>
        </div>
      </div>

      {workspace.loading && <p className="muted">Loading mapping data...</p>}
      {workspace.error && <p className="error">{workspace.error}</p>}
      {workspace.status && <p className="success">{workspace.status}</p>}

      <div className="channel-summary-grid">
        <SummaryTile label="Configured connections" value={workspace.zodomusConnections.length.toString()} detail="Saved OTA links in HMS" />
        <SummaryTile label="Room mappings" value={workspace.zodomusConnections.reduce((total, connection) => total + connection.room_mappings.length, 0).toString()} detail="Mapped HMS room categories" />
        <SummaryTile label="Rate mappings" value={workspace.zodomusConnections.reduce((total, connection) => total + connection.rate_mappings.length, 0).toString()} detail="Mapped HMS rate plans" />
      </div>

      <div className="channel-workspace">
        <aside className="channel-rail">
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
          </section>
        </aside>

        <div className="channel-main">
          {workspace.selectedConnection && (
            <>
              <section className="channel-panel">
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
                <section className="channel-panel">
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

              <div className="channel-action-grid">
                <form className="channel-panel" onSubmit={workspace.createRoomMapping}>
                  <div className="section-heading"><div><p className="eyebrow">Rooms</p><h3>Map rooms</h3></div></div>
                  {!workspace.canMap && <p className="muted">Load room and rate IDs before creating mappings.</p>}
                  <label>
                    HMS room category
                    <select disabled={!workspace.canMap} onChange={(event) => workspace.setRoomCategoryId(event.target.value)} required value={workspace.roomCategoryId}>
                      <option value="">Select category</option>
                      {workspace.scopedCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name} ({category.code})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Provider room ID
                    {workspace.hasCatalogRooms ? (
                      <select disabled={!workspace.canMap} onChange={(event) => workspace.setExternalRoomId(event.target.value)} required value={workspace.externalRoomId}>
                        {workspace.catalogRooms.map((room) => (
                          <option key={room.external_room_id} value={room.external_room_id}>
                            {room.external_room_name ? `${room.external_room_name} - ${room.external_room_id}` : room.external_room_id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input disabled={!workspace.canMap} onChange={(event) => workspace.setExternalRoomId(event.target.value)} placeholder="Provider room ID" required value={workspace.externalRoomId} />
                    )}
                  </label>
                  <button className="primary-button" disabled={!workspace.canMap || workspace.pendingAction === 'create-room-mapping'} type="submit">Save room mapping</button>
                </form>

                <form className="channel-panel" onSubmit={workspace.createRateMapping}>
                  <div className="section-heading"><div><p className="eyebrow">Rates</p><h3>Map rates</h3></div></div>
                  {!workspace.canMap && <p className="muted">Load room and rate IDs before creating mappings.</p>}
                  <label>
                    HMS rate plan
                    <select disabled={!workspace.canMap} onChange={(event) => workspace.setRatePlanId(event.target.value)} required value={workspace.ratePlanId}>
                      <option value="">Select rate plan</option>
                      {workspace.scopedRatePlans.map((ratePlan) => (
                        <option key={ratePlan.id} value={ratePlan.id}>{ratePlan.name} ({ratePlan.code})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Provider rate ID
                    {workspace.hasCatalogRates ? (
                      <select
                        disabled={!workspace.canMap}
                        onChange={(event) => {
                          const [roomId, rateId] = event.target.value.split('::');
                          workspace.setExternalRateRoomId(roomId);
                          workspace.setExternalRateId(rateId ?? '');
                        }}
                        required
                        value={`${workspace.externalRateRoomId}::${workspace.externalRateId}`}
                      >
                        {workspace.filteredCatalogRates.map((rate) => (
                          <option key={`${rate.external_room_id ?? 'none'}-${rate.external_rate_id}`} value={`${rate.external_room_id ?? ''}::${rate.external_rate_id}`}>
                            {rate.external_rate_name ? `${rate.external_rate_name} - ${rate.external_rate_id}` : rate.external_rate_id}
                          </option>
                        ))}
                      </select>
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
                  {workspace.selectedRoomMappingForRatePlan && (
                    <p className="muted">
                      This HMS rate plan belongs to provider room <strong>{workspace.selectedRoomMappingForRatePlan.external_room_id}</strong>.
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
