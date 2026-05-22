import { CatalogList, formatConnectionLabel, MappingTable, SummaryTile } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';
import { CustomSelect } from '../components/CustomSelect';
import { labelCls, primaryBtn, secondaryBtn, ErrorMsg, LoadingMsg, SuccessMsg } from './ui';

export function OtaMappingPage({ workspace }: { workspace: ChannelWorkspace }) {
  const totalRoomMappings = workspace.zodomusConnections.reduce((total, connection) => total + connection.room_mappings.length, 0);
  const totalRateMappings = workspace.zodomusConnections.reduce((total, connection) => total + connection.rate_mappings.length, 0);
  const roomCompletion = workspace.mappingHealth.localRoomCategories > 0
    ? Math.round(((workspace.mappingHealth.localRoomCategories - workspace.mappingHealth.unmappedRoomCategories.length) / workspace.mappingHealth.localRoomCategories) * 100)
    : 0;
  const rateCompletion = workspace.mappingHealth.localRatePlans > 0
    ? Math.round(((workspace.mappingHealth.localRatePlans - workspace.mappingHealth.unmappedRatePlans.length) / workspace.mappingHealth.localRatePlans) * 100)
    : 0;

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Commercial</p>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">OTA Mapping</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
            Map HMS room categories and rate plans to Zodomus provider IDs so OTA inventory and rates can sync correctly.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 min-w-[18rem] max-w-[23rem] space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">OTA connection</p>
              <h3 className="text-base font-bold text-slate-900 leading-tight">{workspace.selectedConnection ? formatConnectionLabel(workspace.selectedConnection) : 'Select OTA'}</h3>
            </div>
            {workspace.selectedConnection && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">Active</span>}
          </div>
          {workspace.selectedConnection ? (
            <div className="flex gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">{workspace.selectedConnection.provider_config_summary?.ota_name ?? workspace.selectedConnection.provider}</span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{workspace.selectedConnection.property.code}</span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{workspace.selectedConnection.external_hotel_id ?? 'No property ID'}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Choose a saved Zodomus connection to start mapping rooms and rates.</p>
          )}
        </div>
      </div>

      {workspace.loading && <LoadingMsg>Loading mapping data...</LoadingMsg>}
      {workspace.error && <ErrorMsg>{workspace.error}</ErrorMsg>}
      {workspace.status && <SuccessMsg>{workspace.status}</SuccessMsg>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryTile label="Configured connections" value={workspace.zodomusConnections.length.toString()} detail="Saved OTA links in HMS" />
        <SummaryTile label="Room mappings" value={totalRoomMappings.toString()} detail="Mapped HMS room categories" />
        <SummaryTile label="Rate mappings" value={totalRateMappings.toString()} detail="Mapped HMS rate plans" />
      </div>

      {!workspace.selectedConnection ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Mapping workspace</p>
          <h3 className="text-base font-bold text-slate-900">Select an OTA connection</h3>
          <p className="text-sm text-slate-500 mt-1">Choose a saved Zodomus connection before loading provider IDs or creating mappings.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-5 items-stretch">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Mapping posture</p>
                  <h3 className="text-base font-bold text-slate-900">Local HMS vs provider catalog</h3>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">{Math.round((roomCompletion + rateCompletion) / 2)}% covered</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryTile label="HMS room categories" value={String(workspace.mappingHealth.localRoomCategories)} detail="Room categories for this property." />
                <SummaryTile label="Provider rooms" value={String(workspace.mappingHealth.providerRooms)} detail="Rooms from provider catalog." />
                <SummaryTile label="HMS rate plans" value={String(workspace.mappingHealth.localRatePlans)} detail="Local HMS rate plans." />
                <SummaryTile label="Provider products" value={String(workspace.mappingHealth.providerRates)} detail="Provider room-rate products." />
              </div>
              {(workspace.mappingHealth.needsMoreRoomCategories || workspace.mappingHealth.needsMoreRatePlans) && (
                <div className="flex gap-3 items-start bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                  <strong className="text-amber-800 flex-shrink-0">Catalog mismatch detected.</strong>
                  <span className="text-amber-700 leading-relaxed">
                    {workspace.mappingHealth.needsMoreRoomCategories ? `Provider has ${workspace.mappingHealth.providerRooms} rooms but HMS only has ${workspace.mappingHealth.localRoomCategories} room categories. ` : ''}
                    {workspace.mappingHealth.needsMoreRatePlans ? `Provider has ${workspace.mappingHealth.providerRates} products but HMS only has ${workspace.mappingHealth.localRatePlans} rate plans.` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 h-full flex flex-col justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Provider IDs</p>
                <h3 className="text-base font-bold text-slate-900">Load room and rate IDs</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">Room and rate mappings use the provider catalog loaded for this connection.</p>
              </div>
              <button className={secondaryBtn} disabled={!workspace.canLoadCatalog || workspace.pendingAction === 'load-provider-catalog'} onClick={() => void workspace.loadProviderCatalog()} type="button">
                {workspace.pendingAction === 'load-provider-catalog' ? 'Loading...' : workspace.canMap ? 'Reload IDs' : 'Load IDs'}
              </button>
            </div>
          </div>

          {workspace.canMap && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Provider IDs</p>
                <h3 className="text-base font-bold text-slate-900">Available room and rate IDs</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CatalogList emptyText="No room IDs were returned." items={workspace.catalogRooms} title="Rooms" valueKey="external_room_id" />
                <CatalogList emptyText="No rate IDs were returned." items={workspace.catalogRates} title="Rates" valueKey="external_rate_id" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <form onSubmit={workspace.createRoomMapping} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Rooms</p>
                <h3 className="text-base font-bold text-slate-900">Map rooms</h3>
              </div>
              {!workspace.canMap && <p className="text-xs text-slate-400">Load room and rate IDs before creating mappings.</p>}
              {workspace.mappingHealth.unmappedRoomCategories.length > 0 && (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Remaining unmapped: {workspace.mappingHealth.unmappedRoomCategories.map((category) => category.code).join(', ')}
                </p>
              )}
              <label className={labelCls}>
                <span>HMS room category</span>
                <CustomSelect
                  disabled={!workspace.canMap}
                  onChange={workspace.setRoomCategoryId}
                  options={workspace.scopedCategories.map((category) => ({ label: `${category.name} (${category.code})`, value: category.id }))}
                  placeholder="Select category"
                  value={workspace.roomCategoryId}
                />
              </label>
              <label className={labelCls}>
                <span>Provider room ID</span>
                {workspace.hasCatalogRooms ? (
                  <CustomSelect
                    disabled={!workspace.canMap}
                    onChange={workspace.setExternalRoomId}
                    options={workspace.catalogRooms.map((room) => ({ label: room.external_room_name ? `${room.external_room_name} - ${room.external_room_id}` : room.external_room_id, value: room.external_room_id }))}
                    value={workspace.externalRoomId}
                  />
                ) : (
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition" disabled={!workspace.canMap} onChange={(event) => workspace.setExternalRoomId(event.target.value)} placeholder="Provider room ID" required value={workspace.externalRoomId} />
                )}
              </label>
              <button className={primaryBtn} disabled={!workspace.canMap || workspace.pendingAction === 'create-room-mapping'} type="submit">Save room mapping</button>
            </form>

            <form onSubmit={workspace.createRateMapping} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Rates</p>
                <h3 className="text-base font-bold text-slate-900">Map rates</h3>
              </div>
              {!workspace.canMap && <p className="text-xs text-slate-400">Load room and rate IDs before creating mappings.</p>}
              {workspace.mappingHealth.needsMoreRatePlans && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                  <strong className="text-amber-800 block mb-1">More HMS rate plans are needed.</strong>
                  <span className="text-amber-700">Zodomus exposes {workspace.mappingHealth.providerRates} products, but HMS only has {workspace.mappingHealth.localRatePlans} local rate plans.</span>
                </div>
              )}
              {workspace.mappingHealth.unmappedRatePlans.length > 0 && (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Remaining unmapped: {workspace.mappingHealth.unmappedRatePlans.map((ratePlan) => ratePlan.code).join(', ')}
                </p>
              )}
              <label className={labelCls}>
                <span>HMS rate plan</span>
                <CustomSelect
                  disabled={!workspace.canMap}
                  onChange={workspace.setRatePlanId}
                  options={workspace.scopedRatePlans.map((ratePlan) => ({ label: `${ratePlan.name} (${ratePlan.code})`, value: ratePlan.id }))}
                  placeholder="Select rate plan"
                  value={workspace.ratePlanId}
                />
              </label>
              <label className={labelCls}>
                <span>Provider rate ID</span>
                {workspace.hasCatalogRates ? (
                  <CustomSelect
                    disabled={!workspace.canMap}
                    onChange={(value) => { const [roomId, rateId] = value.split('::'); workspace.setExternalRateRoomId(roomId); workspace.setExternalRateId(rateId ?? ''); }}
                    options={workspace.filteredCatalogRates.map((rate) => ({ label: rate.external_rate_name ? `${rate.external_rate_name} - ${rate.external_rate_id}` : rate.external_rate_id, value: `${rate.external_room_id ?? ''}::${rate.external_rate_id}` }))}
                    value={`${workspace.externalRateRoomId}::${workspace.externalRateId}`}
                  />
                ) : (
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition" disabled={!workspace.canMap} onChange={(event) => { workspace.setExternalRateId(event.target.value); workspace.setExternalRateRoomId(workspace.selectedRoomMappingForRatePlan?.external_room_id ?? ''); }} placeholder="Provider rate ID" required value={workspace.externalRateId} />
                )}
              </label>
              {workspace.selectedRoomMappingForRatePlan && (
                <p className="text-xs text-slate-500">This rate plan belongs to provider room <strong className="text-slate-800">{workspace.selectedRoomMappingForRatePlan.external_room_id}</strong>.</p>
              )}
              {workspace.mappingHealth.rateMappingGap > 0 && (
                <p className="text-xs text-slate-500">Provider still has <strong className="text-slate-800">{workspace.mappingHealth.rateMappingGap}</strong> product{workspace.mappingHealth.rateMappingGap === 1 ? '' : 's'} without HMS mappings.</p>
              )}
              <button className={primaryBtn} disabled={!workspace.canMap || workspace.pendingAction === 'create-rate-mapping'} type="submit">Save rate mapping</button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
        </div>
      )}
    </section>
  );
}
