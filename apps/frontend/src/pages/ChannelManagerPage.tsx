import { formatConnectionLabel, SetupBadge, SummaryTile } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';
import { CustomSelect } from '../components/CustomSelect';
import { labelCls, inputCls, primaryBtn, secondaryBtn, ErrorMsg, LoadingMsg, SuccessMsg } from './ui';

export function ChannelManagerPage({ workspace }: { workspace: ChannelWorkspace }) {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Integrations</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Channel Manager</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Connect OTA distribution through Zodomus, complete provider onboarding, and manage channel readiness from one workspace.
        </p>
      </div>

      {workspace.loading && <LoadingMsg>Loading channel data…</LoadingMsg>}
      {workspace.error && <ErrorMsg>{workspace.error}</ErrorMsg>}
      {workspace.status && <SuccessMsg>{workspace.status}</SuccessMsg>}

      <div className="grid grid-cols-3 gap-4">
        <SummaryTile label="Configured connections" value={workspace.zodomusConnections.length.toString()} detail="Saved OTA links in HMS" />
        <SummaryTile label="Ready links" value={workspace.zodomusConnections.filter((c) => c.provider_config_summary?.setup_status.ready).length.toString()} detail="Connections ready for live sync" />
        <SummaryTile label="Automation enabled" value={workspace.zodomusConnections.filter((c) => c.provider_config_summary?.automation?.enabled).length.toString()} detail="Connections with scheduled sync enabled" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)] gap-5 items-start">
        {/* Left rail */}
        <aside className="space-y-4">
          {/* Add connection form */}
          <form onSubmit={workspace.createConnection} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">New connection</p>
              <h3 className="text-base font-bold text-slate-900">Add OTA connection</h3>
            </div>
            <label className={labelCls}>
              <span>Hotel property</span>
              <CustomSelect onChange={workspace.setPropertyId} options={workspace.properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={workspace.propertyId} />
            </label>
            <label className={labelCls}>
              <span>OTA</span>
              <CustomSelect onChange={(v) => workspace.setZodomusOtaKey(v as typeof workspace.zodomusOtaKey)} options={workspace.zodomusOtaOptions.map((o) => ({ label: o.label, value: o.key }))} value={workspace.zodomusOtaKey} />
            </label>
            <label className={labelCls}>
              <span>Price model</span>
              <CustomSelect onChange={workspace.setZodomusPriceModelId} options={workspace.priceModelOptions.map((m) => ({ label: `${m.id} - ${m.model}`, value: String(m.id) }))} value={workspace.zodomusPriceModelId} />
            </label>
            <label className={labelCls}>
              <span>Zodomus property ID</span>
              <input className={inputCls} onChange={(e) => workspace.setZodomusPropertyId(e.target.value)} placeholder="999999" required value={workspace.zodomusPropertyId} />
            </label>
            <button className={primaryBtn} disabled={workspace.pendingAction === 'create-connection'} type="submit">{workspace.pendingAction === 'create-connection' ? 'Saving…' : 'Save connection'}</button>
          </form>

          {/* Select connection */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Connection</p>
              <h3 className="text-base font-bold text-slate-900">Select OTA</h3>
            </div>
            <label className={labelCls}>
              <span>OTA connection</span>
              <CustomSelect disabled={workspace.zodomusConnections.length === 0} onChange={workspace.selectConnection} options={workspace.zodomusConnections.map((c) => ({ label: formatConnectionLabel(c), value: c.id }))} placeholder="Select connection" value={workspace.selectedConnectionId} />
            </label>
            {workspace.selectedConnection ? (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${workspace.selectedConnection.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{workspace.selectedConnection.status}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{formatConnectionLabel(workspace.selectedConnection)}</h4>
                  <p className="text-xs text-slate-500">{workspace.selectedConnection.property.name}</p>
                  <dl className="space-y-1.5 mt-2">
                    {[['OTA', workspace.selectedConnection.provider_config_summary?.ota_name ?? '—'], ['Zodomus property ID', workspace.selectedConnection.external_hotel_id ?? '—'], ['Mapped', `${workspace.selectedConnection.room_mappings.length} rooms / ${workspace.selectedConnection.rate_mappings.length} rates`], ['Readiness', workspace.persistedSetupStatus?.ready ? 'Ready for sync' : 'Setup pending']].map(([dt, dd]) => (
                      <div key={String(dt)} className="flex items-center gap-2 text-xs">
                        <dt className="text-slate-400 w-28 flex-shrink-0">{dt}</dt>
                        <dd className="text-slate-700 font-medium">{dd}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <button className="inline-flex items-center justify-center w-full border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-rose-700 font-semibold px-4 py-2.5 rounded-lg shadow-sm text-sm transition" disabled={workspace.pendingAction === 'delete-connection'} onClick={() => void workspace.deleteConnection()} type="button">{workspace.pendingAction === 'delete-connection' ? 'Removing…' : 'Remove connection'}</button>
                <div className="flex gap-2">
                  <button className="inline-flex flex-1 items-center justify-center bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-amber-800 font-bold px-2 py-2 rounded-lg text-xs transition" disabled={workspace.pendingAction === 'pause-connection'} onClick={() => void workspace.pauseConnection()} type="button">Pause</button>
                  <button className="inline-flex flex-1 items-center justify-center bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-emerald-800 font-bold px-2 py-2 rounded-lg text-xs transition" disabled={workspace.pendingAction === 'resume-connection'} onClick={() => void workspace.resumeConnection()} type="button">Resume</button>
                  <button className="inline-flex flex-1 items-center justify-center bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-rose-800 font-bold px-2 py-2 rounded-lg text-xs transition" disabled={workspace.pendingAction === 'disconnect-connection'} onClick={() => void workspace.disconnectConnection()} type="button">Disconnect</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Add an OTA connection to start onboarding.</p>
            )}
          </div>

          {/* Readiness status */}
          {workspace.selectedConnection && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Workspace</p>
                  <h3 className="text-sm font-bold text-slate-900">Readiness status</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[['Activated', Boolean(workspace.persistedSetupStatus?.activated)], ['IDs loaded', Boolean(workspace.persistedSetupStatus?.catalog_loaded)], ['Rooms mapped', workspace.selectedConnection.room_mappings.length > 0], ['Rates mapped', workspace.selectedConnection.rate_mappings.length > 0], ['Rooms activated', Boolean(workspace.persistedSetupStatus?.rooms_activated)], ['Ready', Boolean(workspace.persistedSetupStatus?.ready)]].map(([label, done]) => (
                    <SetupBadge key={String(label)} done={Boolean(done)} label={String(label)} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['Provider rooms', String(workspace.mappingHealth.providerRooms)], ['Provider products', String(workspace.mappingHealth.providerRates)], [`Mapped rooms`, `${workspace.mappingHealth.mappedRooms}/${workspace.mappingHealth.localRoomCategories}`], [`Mapped rates`, `${workspace.mappingHealth.mappedRates}/${workspace.mappingHealth.localRatePlans}`]].map(([label, value]) => (
                    <div key={String(label)} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{label}</span>
                      <strong className="text-sm font-bold text-slate-900">{value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Mapping health</p>
                  <h3 className="text-sm font-bold text-slate-900">Room and rate coverage</h3>
                </div>
                {(workspace.mappingHealth.needsMoreRoomCategories || workspace.mappingHealth.needsMoreRatePlans) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                    <strong className="text-amber-800 block mb-1">HMS catalog does not fully match the provider catalog.</strong>
                    <span className="text-amber-700 text-xs">
                      {workspace.mappingHealth.needsMoreRoomCategories ? `Add ${workspace.mappingHealth.localRoomCategoryShortfall} more HMS room categor${workspace.mappingHealth.localRoomCategoryShortfall === 1 ? 'y' : 'ies'} or reduce provider rooms. ` : ''}
                      {workspace.mappingHealth.needsMoreRatePlans ? `Add ${workspace.mappingHealth.localRatePlanShortfall} more HMS rate plan${workspace.mappingHealth.localRatePlanShortfall === 1 ? '' : 's'}.` : ''}
                    </span>
                  </div>
                )}
                {!(workspace.mappingHealth.needsMoreRoomCategories || workspace.mappingHealth.needsMoreRatePlans || workspace.mappingHealth.unmappedRoomCategories.length > 0 || workspace.mappingHealth.unmappedRatePlans.length > 0) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <strong className="text-sm font-bold text-emerald-800 block">Mapping coverage is complete.</strong>
                    <span className="text-xs text-emerald-700 leading-relaxed">All available HMS room categories and rate plans are mapped for this connection.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {[{ title: 'Unmapped rooms', count: workspace.mappingHealth.unmappedRoomCategories.length, items: workspace.mappingHealth.unmappedRoomCategories.slice(0, 4).map((c) => `${c.name} (${c.code})`), empty: 'All HMS rooms mapped.' }, { title: 'Unmapped rates', count: workspace.mappingHealth.unmappedRatePlans.length, items: workspace.mappingHealth.unmappedRatePlans.slice(0, 4).map((r) => `${r.name} (${r.code})`), empty: 'All HMS rates mapped.' }].map((panel) => (
                    <div key={panel.title} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-1">{panel.title}</p>
                      <strong className="text-lg font-extrabold text-slate-900 block">{panel.count}</strong>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{panel.count > 0 ? panel.items.join(', ') : panel.empty}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Main area */}
        <div className="space-y-5">
          {workspace.selectedConnection && (
            <>
              {/* Operator runbook */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Next step</p>
                    <h3 className="text-base font-bold text-slate-900">Operator runbook</h3>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-lg">Follow this sequence and stop when the provider reports a blocker. Do not continue to sync until the setup path is clear.</p>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${workspace.persistedSetupStatus?.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{workspace.persistedSetupStatus?.ready ? 'Ready for sync' : 'Needs setup'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <strong className="text-sm font-bold text-slate-800 block">{workspace.nextSetupAction}</strong>
                  <span className="text-xs text-slate-400 mt-0.5 block leading-relaxed">The steps below reflect the current connection state, mapping counts, and provider check results for this OTA link.</span>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {workspace.setupRunbook.map((step, index) => (
                    <div key={step.key} className={`border rounded-xl p-3.5 ${step.done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                      <span className={`text-[11px] font-bold block mb-1 ${step.done ? 'text-emerald-600' : 'text-slate-400'}`}>0{index + 1}</span>
                      <strong className={`text-xs font-bold block ${step.done ? 'text-emerald-800' : 'text-slate-800'}`}>{step.label}</strong>
                      <p className={`text-[11px] mt-0.5 leading-relaxed ${step.done ? 'text-emerald-700' : 'text-slate-500'}`}>{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Setup blockers */}
              {workspace.channelWarnings.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Action needed</p>
                    <h3 className="text-base font-bold text-slate-900">Setup blockers</h3>
                  </div>
                  <ul className="space-y-2">
                    {workspace.channelWarnings.map((warning) => (
                      <li key={warning} className="flex gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
                        <strong className="text-xs font-bold text-rose-800 flex-shrink-0">Resolve before full sync</strong>
                        <span className="text-xs text-rose-700 leading-relaxed">{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Provider IDs panel */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Provider IDs</p>
                  <h3 className="text-base font-bold text-slate-900">Room and rate IDs</h3>
                </div>
                {workspace.persistedSetupStatus?.last_check_message && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">Last provider check: {workspace.persistedSetupStatus.last_check_message}{workspace.persistedSetupStatus.last_check_code ? ` (${workspace.persistedSetupStatus.last_check_code})` : ''}</p>}
                {workspace.persistedSetupStatus?.last_activation_message && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">Last activation: {workspace.persistedSetupStatus.last_activation_message}{workspace.persistedSetupStatus.last_activation_code ? ` (${workspace.persistedSetupStatus.last_activation_code})` : ''}</p>}
                {workspace.persistedSetupStatus?.last_rooms_activation_message && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">Last room activation: {workspace.persistedSetupStatus.last_rooms_activation_message}{workspace.persistedSetupStatus.last_rooms_activation_code ? ` (${workspace.persistedSetupStatus.last_rooms_activation_code})` : ''}</p>}
                {workspace.parsedProviderCheckStatuses && workspace.parsedProviderCheckStatuses.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {workspace.parsedProviderCheckStatuses.map((status) => (
                      <div key={status.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{status.label}</span>
                        <strong className="text-sm font-bold text-slate-900">{status.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:gap-4">
                  <label className={labelCls + ' w-full xl:flex-1 xl:max-w-[28rem]'}>
                    <span>Price model</span>
                    <CustomSelect disabled={!workspace.selectedConnection || workspace.providerPriceModelsLoading} onChange={workspace.setZodomusPriceModelId} options={workspace.priceModelOptions.map((m) => ({ label: `${m.id} - ${m.model}`, value: String(m.id) }))} value={workspace.zodomusPriceModelId} />
                  </label>
                  <div className="flex flex-wrap gap-2 xl:flex-1 xl:justify-start">
                    <button className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors" disabled={!workspace.canLoadCatalog || workspace.pendingAction === 'load-provider-catalog'} onClick={() => void workspace.loadProviderCatalog()} type="button">{workspace.pendingAction === 'load-provider-catalog' ? 'Loading…' : 'Load IDs'}</button>
                    <button className="inline-flex items-center justify-center px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors" disabled={!workspace.selectedConnection || workspace.pendingAction === 'property-check'} onClick={() => void workspace.runPropertyCheck()} type="button">Run property check</button>
                    <button className="inline-flex items-center justify-center px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors" disabled={!workspace.selectedConnection || workspace.pendingAction === 'property-activate'} onClick={() => void workspace.reactivateProperty()} type="button">Re-activate property</button>
                    <button className="inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors" disabled={!workspace.canActivateMappedRooms || workspace.pendingAction === 'activate-mapped-rooms'} onClick={() => void workspace.activateMappedRooms()} type="button">Activate mapped rooms</button>
                  </div>
                </div>
                {workspace.providerPriceModelsError && <p className="text-xs text-slate-400">Using fallback price model labels: {workspace.providerPriceModelsError}</p>}
              </div>

              {/* Automation controls + Admin tools */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <form onSubmit={workspace.saveAutomationSettings} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Operations</p>
                      <h3 className="text-base font-bold text-slate-900">Automation controls</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">Configure live sync cadence for this OTA link.</p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${workspace.automationEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{workspace.automationEnabled ? 'Automation live' : 'Manual mode'}</span>
                  </div>

                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${workspace.automationEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <input checked={workspace.automationEnabled} onChange={(e) => workspace.setAutomationEnabled(e.target.checked)} type="checkbox" className="w-4 h-4 rounded accent-emerald-600" />
                    <span>
                      <strong className="text-sm font-bold text-slate-800 block">Enable automatic sync</strong>
                      <span className="text-xs text-slate-500">{workspace.automationEnabled ? 'Inventory, rate, and reservation jobs will run on the schedule below.' : 'Keep this connection in manual mode while onboarding or troubleshooting.'}</span>
                    </span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {[['Inventory', workspace.inventoryInterval, 'min'], ['Rates', workspace.ratesInterval, 'min'], ['Reservation import', workspace.reservationImportInterval, 'min'], ['Sync window', workspace.syncWindowDays, 'days'], ['Full sync window', workspace.fullSyncWindowDays, 'days']].map(([label, val]) => (
                      <div key={String(label)} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{label}</span>
                        <strong className="text-sm font-bold text-slate-900">{val || '—'}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className={labelCls}><span>Inventory minutes</span><input className={inputCls} min="1" onChange={(e) => workspace.setInventoryInterval(e.target.value)} type="number" value={workspace.inventoryInterval} /></label>
                    <label className={labelCls}><span>Rate minutes</span><input className={inputCls} min="1" onChange={(e) => workspace.setRatesInterval(e.target.value)} type="number" value={workspace.ratesInterval} /></label>
                    <label className={labelCls}><span>Reservation import (min)</span><input className={inputCls} min="1" onChange={(e) => workspace.setReservationImportInterval(e.target.value)} type="number" value={workspace.reservationImportInterval} /></label>
                    <label className={labelCls}><span>Sync window days</span><input className={inputCls} min="1" onChange={(e) => workspace.setSyncWindowDays(e.target.value)} type="number" value={workspace.syncWindowDays} /></label>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400">Changes apply only to the currently selected OTA connection.</p>
                    <button className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap shadow-sm transition-colors" disabled={workspace.pendingAction === 'save-automation'} type="submit">{workspace.pendingAction === 'save-automation' ? 'Saving…' : 'Apply automation'}</button>
                  </div>
                </form>

                <form onSubmit={workspace.submitProviderReservationEvent} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Admin tools</p>
                      <h3 className="text-base font-bold text-slate-900">Provider reservation event</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">Send a provider-side test event and inspect how the resulting reservation state lands in HMS.</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">Test hook</span>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">Selected event</span>
                    <strong className="text-sm font-bold text-indigo-900 block">{formatProviderEventLabel(workspace.providerReservationEventStatus)}</strong>
                    <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">{describeProviderReservationEvent(workspace.providerReservationEventStatus)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className={labelCls}>
                      <span>Event</span>
                      <select className={inputCls} onChange={(e) => workspace.setProviderReservationEventStatus(e.target.value as (typeof workspace.providerReservationEventOptions)[number])} value={workspace.providerReservationEventStatus}>
                        {workspace.providerReservationEventOptions.map((option) => (
                          <option key={option} value={option}>{formatProviderEventLabel(option)}</option>
                        ))}
                      </select>
                    </label>
                    <label className={labelCls}>
                      <span>Reservation ID</span>
                      <input className={inputCls} onChange={(e) => workspace.setProviderReservationId(e.target.value)} placeholder={workspace.providerReservationEventStatus === 'new' ? 'Optional for new events' : 'Required for modified or cancelled'} value={workspace.providerReservationId} />
                    </label>
                  </div>

                  <button className="inline-flex items-center justify-center w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors" disabled={workspace.pendingAction === 'provider-reservation-event'} type="submit">{workspace.pendingAction === 'provider-reservation-event' ? 'Sending…' : `Send ${formatProviderEventLabel(workspace.providerReservationEventStatus)} event`}</button>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400">Use summary backfill once at production go-live to import future reservations that existed before the channel-manager connection.</p>
                    <button className="inline-flex items-center justify-center w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-indigo-800 font-bold text-xs px-4 py-2.5 rounded-lg transition-colors" disabled={!workspace.selectedConnection || !workspace.persistedSetupStatus?.ready || workspace.pendingAction === 'reservations-summary-backfill'} onClick={() => void workspace.backfillExistingReservations()} type="button">{workspace.pendingAction === 'reservations-summary-backfill' ? 'Queueing…' : 'Backfill existing future reservations'}</button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-400">Use full sync after Booking/Zodomus confirms the channel-manager connection, or for deliberate long-range repair.</p>
                    <div className="flex gap-2">
                      <button className="inline-flex flex-1 items-center justify-center bg-sky-50 hover:bg-sky-100 border border-sky-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-sky-800 font-bold text-xs px-3 py-2.5 rounded-lg transition-colors" disabled={!workspace.selectedConnection || !workspace.persistedSetupStatus?.ready || workspace.pendingAction === 'full-inventory-sync'} onClick={() => void workspace.runFullInventorySync()} type="button">{workspace.pendingAction === 'full-inventory-sync' ? 'Queueing…' : `Full ${workspace.fullSyncWindowDays}-day inventory sync`}</button>
                      <button className="inline-flex flex-1 items-center justify-center bg-violet-50 hover:bg-violet-100 border border-violet-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed text-violet-800 font-bold text-xs px-3 py-2.5 rounded-lg transition-colors" disabled={!workspace.selectedConnection || !workspace.persistedSetupStatus?.ready || workspace.pendingAction === 'full-rates-sync'} onClick={() => void workspace.runFullRatesSync()} type="button">{workspace.pendingAction === 'full-rates-sync' ? 'Queueing…' : `Full ${workspace.fullSyncWindowDays}-day rates sync`}</button>
                    </div>
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

function formatProviderEventLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeProviderReservationEvent(value: string) {
  if (value === 'new') return 'Creates a fresh provider test reservation. Reservation ID can stay empty for this event.';
  if (value === 'modified') return 'Replays an update for an existing imported reservation using the reservation ID you provide.';
  if (value === 'cancelled') return 'Triggers a provider-side cancellation for the reservation ID so HMS can reconcile the imported stay.';
  return 'Sends a provider-side test event and syncs the resulting reservation state back into HMS.';
}
