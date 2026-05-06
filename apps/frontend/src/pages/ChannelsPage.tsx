import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import {
  ChannelConnection,
  InventoryReconciliation,
  InventoryRowResults,
  ChannelProviderCatalog,
  Property,
  RatePlan,
  RoomCategory,
  ZodomusSetupResponse,
} from '../api/types';

const zodomusOtaOptions = [
  { key: 'BOOKING_COM', label: 'Booking.com' },
  { key: 'EXPEDIA', label: 'Expedia' },
  { key: 'AIRBNB', label: 'Airbnb' },
] as const;

type ZodomusOtaKey = (typeof zodomusOtaOptions)[number]['key'];
type ChannelWorkspaceView = 'setup' | 'mappings' | 'sync' | 'advanced';

function defaultPriceModelId(channelId: string | null | undefined) {
  if (channelId === '1') return 1;
  if (channelId === '2') return 3;
  if (channelId === '3') return 4;
  return 1;
}

export function ChannelsPage() {
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [zodomusPropertyId, setZodomusPropertyId] = useState('');
  const [zodomusOtaKey, setZodomusOtaKey] = useState<ZodomusOtaKey>('BOOKING_COM');
  const [roomCategoryId, setRoomCategoryId] = useState('');
  const [externalRoomId, setExternalRoomId] = useState('');
  const [ratePlanId, setRatePlanId] = useState('');
  const [externalRateId, setExternalRateId] = useState('');
  const [externalRateRoomId, setExternalRateRoomId] = useState('');
  const [providerCatalog, setProviderCatalog] = useState<ChannelProviderCatalog | null>(null);
  const [catalogConnectionId, setCatalogConnectionId] = useState('');
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<ChannelWorkspaceView>('setup');
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [inventoryInterval, setInventoryInterval] = useState('15');
  const [ratesInterval, setRatesInterval] = useState('60');
  const [reservationImportInterval, setReservationImportInterval] = useState('5');
  const [syncWindowDays, setSyncWindowDays] = useState('30');
  const [inventoryReconciliation, setInventoryReconciliation] = useState<InventoryReconciliation | null>(null);
  const [inventoryReconciliationLoading, setInventoryReconciliationLoading] = useState(false);
  const [inventoryReconciliationError, setInventoryReconciliationError] = useState<string | null>(null);
  const [inventoryRowResults, setInventoryRowResults] = useState<InventoryRowResults | null>(null);
  const [inventoryRowResultsLoading, setInventoryRowResultsLoading] = useState(false);
  const [inventoryRowResultsError, setInventoryRowResultsError] = useState<string | null>(null);

  const zodomusConnections = connections.filter((connection) => connection.provider === 'ZODOMUS');
  const selectedConnection = zodomusConnections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const selectedPropertyId = selectedConnection?.property_id ?? propertyId;
  const selectedProperty = properties.find((property) => property.id === propertyId) ?? null;
  const selectedOtaLabel = zodomusOtaOptions.find((option) => option.key === zodomusOtaKey)?.label ?? 'OTA';
  const persistedSetupStatus = selectedConnection?.provider_config_summary?.setup_status ?? null;
  const automationSummary = selectedConnection?.provider_config_summary?.automation ?? null;
  const latestInventorySyncLog = useMemo(
    () => selectedConnection?.recent_sync_logs.find((log) => log.sync_type === 'INVENTORY') ?? null,
    [selectedConnection],
  );

  const scopedCategories = useMemo(
    () => categories.filter((category) => category.property_id === selectedPropertyId),
    [categories, selectedPropertyId],
  );
  const scopedRatePlans = useMemo(
    () => ratePlans.filter((ratePlan) => ratePlan.property_id === selectedPropertyId),
    [ratePlans, selectedPropertyId],
  );
  const selectedRatePlan = useMemo(
    () => scopedRatePlans.find((ratePlan) => ratePlan.id === ratePlanId) ?? null,
    [scopedRatePlans, ratePlanId],
  );

  const catalogRooms = providerCatalog?.rooms ?? [];
  const catalogRates = providerCatalog?.rates ?? [];
  const selectedRoomMappingForRatePlan = useMemo(() => {
    if (!selectedConnection || !selectedRatePlan) return null;
    return (
      selectedConnection.room_mappings.find((mapping) => mapping.room_category_id === selectedRatePlan.room_category_id) ??
      null
    );
  }, [selectedConnection, selectedRatePlan]);
  const filteredCatalogRates = useMemo(() => {
    const mappedExternalRoomId = selectedRoomMappingForRatePlan?.external_room_id ?? null;
    if (!mappedExternalRoomId) {
      return catalogRates;
    }

    const matchingRates = catalogRates.filter((rate) => rate.external_room_id === mappedExternalRoomId);
    return matchingRates.length > 0 ? matchingRates : catalogRates;
  }, [catalogRates, selectedRoomMappingForRatePlan]);
  const hasCatalogRooms = catalogRooms.length > 0;
  const hasCatalogRates = filteredCatalogRates.length > 0;
  const canLoadCatalog = Boolean(selectedConnection?.external_hotel_id && selectedConnection.provider_config_summary?.ota_name);
  const canMap = Boolean(selectedConnection && catalogLoaded && catalogConnectionId === selectedConnection.id);
  const canActivateMappedRooms = Boolean(
    selectedConnection &&
      selectedConnection.room_mappings.length > 0 &&
      selectedConnection.rate_mappings.length > 0,
  );
  const channelWarnings = [
    !persistedSetupStatus?.activated ? 'Property activation is still pending.' : null,
    !persistedSetupStatus?.catalog_loaded ? 'Provider room/rate IDs are not loaded yet.' : null,
    selectedConnection && selectedConnection.room_mappings.length === 0 ? 'No HMS room categories are mapped yet.' : null,
    selectedConnection && selectedConnection.rate_mappings.length === 0 ? 'No HMS rate plans are mapped yet.' : null,
    persistedSetupStatus?.activated &&
    persistedSetupStatus?.catalog_loaded &&
    canActivateMappedRooms &&
    !persistedSetupStatus?.rooms_activated
      ? 'Mapped rooms still need provider-side room activation.'
      : null,
    persistedSetupStatus?.rooms_activated && !persistedSetupStatus?.ready
      ? 'Provider room activation finished, but the final readiness check is not OK yet.'
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  const propertyActivationPriceModelId =
    persistedSetupStatus?.price_model_id ??
    defaultPriceModelId(selectedConnection?.provider_config_summary?.channel_id);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [connectionResponse, propertyResponse, categoryResponse, ratePlanResponse] = await Promise.all([
        api.get<PaginatedResponse<ChannelConnection>>('/channels', { params: { limit: 100 } }),
        api.get<PaginatedResponse<Property>>('/properties', { params: { limit: 100 } }),
        api.get<PaginatedResponse<RoomCategory>>('/room-categories', { params: { limit: 100 } }),
        api.get<PaginatedResponse<RatePlan>>('/rate-plans', { params: { limit: 100 } }),
      ]);

      const loadedConnections = unwrapList(connectionResponse.data);
      const loadedProperties = unwrapList(propertyResponse.data);
      const loadedZodomusConnections = loadedConnections.filter((connection) => connection.provider === 'ZODOMUS');

      setConnections(loadedConnections);
      setProperties(loadedProperties);
      setCategories(unwrapList(categoryResponse.data));
      setRatePlans(unwrapList(ratePlanResponse.data));

      if (!selectedConnectionId && loadedZodomusConnections[0]) {
        setSelectedConnectionId(loadedZodomusConnections[0].id);
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
    if (!selectedConnectionId) {
      setInventoryReconciliation(null);
      setInventoryReconciliationError(null);
      setInventoryRowResults(null);
      setInventoryRowResultsError(null);
      return;
    }

    void loadInventoryReconciliation(selectedConnectionId);
    void loadInventoryRowResults(selectedConnectionId);
  }, [selectedConnectionId, connections]);

  useEffect(() => {
    setRoomCategoryId('');
    setRatePlanId('');
    setExternalRateId('');
    setExternalRateRoomId('');
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!hasCatalogRooms || externalRoomId) return;
    setExternalRoomId(catalogRooms[0].external_room_id);
  }, [catalogRooms, externalRoomId, hasCatalogRooms]);

  useEffect(() => {
    setExternalRateId('');
  }, [ratePlanId]);

  useEffect(() => {
    if (!hasCatalogRates || externalRateId) return;
    setExternalRateId(filteredCatalogRates[0].external_rate_id);
    setExternalRateRoomId(filteredCatalogRates[0].external_room_id ?? selectedRoomMappingForRatePlan?.external_room_id ?? '');
  }, [externalRateId, filteredCatalogRates, hasCatalogRates, selectedRoomMappingForRatePlan?.external_room_id]);

  useEffect(() => {
    if (selectedRoomMappingForRatePlan?.external_room_id) {
      setExternalRateRoomId(selectedRoomMappingForRatePlan.external_room_id);
    }
  }, [selectedRoomMappingForRatePlan?.external_room_id]);

  useEffect(() => {
    setAutomationEnabled(automationSummary?.enabled ?? true);
    setInventoryInterval(String(automationSummary?.inventory_interval_minutes ?? 15));
    setRatesInterval(String(automationSummary?.rates_interval_minutes ?? 60));
    setReservationImportInterval(String(automationSummary?.bookings_interval_minutes ?? 5));
    setSyncWindowDays(String(automationSummary?.sync_window_days ?? 30));
  }, [
    automationSummary?.enabled,
    automationSummary?.inventory_interval_minutes,
    automationSummary?.rates_interval_minutes,
    automationSummary?.bookings_interval_minutes,
    automationSummary?.sync_window_days,
  ]);

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

  async function loadInventoryReconciliation(connectionId: string) {
    setInventoryReconciliationLoading(true);
    setInventoryReconciliationError(null);

    try {
      const response = await api.get<InventoryReconciliation>(`/channels/${connectionId}/inventory-reconciliation`);
      setInventoryReconciliation(response.data);
    } catch (loadError) {
      setInventoryReconciliationError(getApiErrorMessage(loadError));
    } finally {
      setInventoryReconciliationLoading(false);
    }
  }

  async function loadInventoryRowResults(connectionId: string) {
    setInventoryRowResultsLoading(true);
    setInventoryRowResultsError(null);

    try {
      const response = await api.get<InventoryRowResults>(`/channels/${connectionId}/inventory-row-results`);
      setInventoryRowResults(response.data);
    } catch (loadError) {
      setInventoryRowResultsError(getApiErrorMessage(loadError));
    } finally {
      setInventoryRowResultsLoading(false);
    }
  }

  async function createConnection(event: FormEvent) {
    event.preventDefault();

    await runAction('create-connection', async () => {
      const response = await api.post<ZodomusSetupResponse>('/channels/zodomus/setup', {
        property_id: propertyId,
        external_hotel_id: zodomusPropertyId,
        ota_key: zodomusOtaKey,
      });

      setSelectedConnectionId(response.data.connection.id);
      setProviderCatalog(response.data.catalog);
      setCatalogConnectionId(response.data.connection.id);
      setCatalogLoaded(response.data.setup_status.catalog_loaded);
      setZodomusPropertyId('');
      setStatus(`${selectedProperty ? selectedProperty.name : 'Property'} connected to ${selectedOtaLabel}.`);
      await loadData();
      setSelectedConnectionId(response.data.connection.id);
    });
  }

  async function loadProviderCatalog() {
    if (!selectedConnection) return;

    await runAction('load-provider-catalog', async () => {
      const response = await api.get<ChannelProviderCatalog>(`/channels/${selectedConnection.id}/provider-catalog`);
      setProviderCatalog(response.data);
      setCatalogConnectionId(selectedConnection.id);
      setCatalogLoaded(true);
      setStatus('Room and rate IDs loaded.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function createRoomMapping(event: FormEvent) {
    event.preventDefault();
    if (!selectedConnection) return;

    await runAction('create-room-mapping', async () => {
      await api.post(`/channels/${selectedConnection.id}/room-mappings`, {
        room_category_id: roomCategoryId,
        external_room_id: externalRoomId,
      });

      setExternalRoomId(hasCatalogRooms ? catalogRooms[0]?.external_room_id ?? '' : '');
      setStatus('Room mapping saved.');
      await loadData();
    });
  }

  async function createRateMapping(event: FormEvent) {
    event.preventDefault();
    if (!selectedConnection) return;

    await runAction('create-rate-mapping', async () => {
      await api.post(`/channels/${selectedConnection.id}/rate-mappings`, {
        rate_plan_id: ratePlanId,
        external_room_id: externalRateRoomId || selectedRoomMappingForRatePlan?.external_room_id || undefined,
        external_rate_id: externalRateId,
      });

      setExternalRateId(hasCatalogRates ? filteredCatalogRates[0]?.external_rate_id ?? '' : '');
      setExternalRateRoomId(
        hasCatalogRates
          ? filteredCatalogRates[0]?.external_room_id ?? selectedRoomMappingForRatePlan?.external_room_id ?? ''
          : selectedRoomMappingForRatePlan?.external_room_id ?? '',
      );
      setStatus('Rate mapping saved.');
      await loadData();
    });
  }

  async function activateMappedRooms() {
    if (!selectedConnection) return;

    await runAction('activate-mapped-rooms', async () => {
      await api.post(`/channels/${selectedConnection.id}/rooms-activate`);
      setStatus('Mapped rooms and rates activated in Zodomus.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function runPropertyCheck() {
    if (!selectedConnection) return;

    await runAction('property-check', async () => {
      await api.post(`/channels/${selectedConnection.id}/property-check`);
      setStatus('Property check completed.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function reactivateProperty() {
    if (!selectedConnection) return;
    if (
      !window.confirm(
        `Re-activate ${selectedConnection.name} in Zodomus? Use this when provider-side onboarding or approval has changed.`,
      )
    ) {
      return;
    }

    await runAction('property-activate', async () => {
      await api.post(`/channels/${selectedConnection.id}/property-activate`, {
        price_model_id: propertyActivationPriceModelId,
      });
      setStatus('Property activation request sent to Zodomus.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function deleteConnection() {
    if (!selectedConnection) return;
    if (!window.confirm(`Remove ${selectedConnection.name}? This will delete its room mappings, rate mappings, and sync logs from HMS.`)) {
      return;
    }

    await runAction('delete-connection', async () => {
      await api.delete(`/channels/${selectedConnection.id}`);
      setProviderCatalog(null);
      setCatalogConnectionId('');
      setCatalogLoaded(false);
      setExternalRoomId('');
      setExternalRateId('');
      setExternalRateRoomId('');
      setRoomCategoryId('');
      setRatePlanId('');
      setSelectedConnectionId('');
      setStatus('OTA connection removed.');
      await loadData();
    });
  }

  async function pauseConnection() {
    if (!selectedConnection) return;
    await runAction('pause-connection', async () => {
      await api.post(`/channels/${selectedConnection.id}/pause`);
      setStatus('Connection paused.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function resumeConnection() {
    if (!selectedConnection) return;
    await runAction('resume-connection', async () => {
      await api.post(`/channels/${selectedConnection.id}/resume`);
      setStatus('Connection resumed.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function disconnectConnection() {
    if (!selectedConnection) return;
    if (!window.confirm(`Disconnect ${selectedConnection.name} from Zodomus? This pauses sync and marks the remote property link as disconnected.`)) {
      return;
    }

    await runAction('disconnect-connection', async () => {
      await api.post(`/channels/${selectedConnection.id}/disconnect`);
      setStatus('Connection disconnected from Zodomus.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function saveAutomationSettings(event: FormEvent) {
    event.preventDefault();
    if (!selectedConnection) return;

    await runAction('save-automation', async () => {
      await api.post(`/channels/${selectedConnection.id}/automation`, {
        enabled: automationEnabled,
        inventory_interval_minutes: Number(inventoryInterval),
        rates_interval_minutes: Number(ratesInterval),
        bookings_interval_minutes: Number(reservationImportInterval),
        sync_window_days: Number(syncWindowDays),
      });
      setStatus('Automation settings saved.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function refreshInventoryReconciliation() {
    if (!selectedConnection) return;

    await runAction('refresh-reconciliation', async () => {
      await loadInventoryReconciliation(selectedConnection.id);
      setStatus('Inventory reconciliation refreshed.');
    });
  }

  async function resyncInventoryDriftWindow() {
    if (!selectedConnection || !inventoryReconciliation?.compared_window) return;
    const comparedWindow = inventoryReconciliation.compared_window;

    await runAction('resync-reconciliation', async () => {
      await api.post(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'INVENTORY',
        from: comparedWindow.from,
        to: comparedWindow.to,
      });
      await loadData();
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      setStatus('Queued inventory re-sync for the compared window.');
    });
  }

  async function retryFailedInventoryRows() {
    if (!selectedConnection || !latestInventorySyncLog) return;

    await runAction('retry-failed-inventory-rows', async () => {
      await api.post(`/channels/${selectedConnection.id}/sync-logs/${latestInventorySyncLog.id}/retry-failed-rows`);
      await loadData();
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      setStatus('Queued retry for failed inventory rows.');
    });
  }

  return (
    <section className="channel-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2>OTA Connections</h2>
          <p className="page-subtitle">
            Connect OTA distribution through Zodomus, manage provider setup readiness, and monitor outbound inventory/rate sync plus inbound reservation import.
          </p>
        </div>
      </div>

      {loading && <p className="muted">Loading channel data...</p>}
      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}

      <div className="channel-summary-grid">
        <SummaryTile label="Configured connections" value={zodomusConnections.length.toString()} detail="Saved OTA links in HMS" />
        <SummaryTile
          label="Room mappings"
          value={zodomusConnections.reduce((total, connection) => total + connection.room_mappings.length, 0).toString()}
          detail="Mapped HMS room categories"
        />
        <SummaryTile
          label="Rate mappings"
          value={zodomusConnections.reduce((total, connection) => total + connection.rate_mappings.length, 0).toString()}
          detail="Mapped HMS rate plans"
        />
      </div>

      <div className="channel-workspace">
        <aside className="channel-rail">
          <form className="channel-panel" onSubmit={createConnection}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">New connection</p>
                <h3>Add OTA connection</h3>
              </div>
            </div>

            <label>
              Hotel property
              <select onChange={(event) => setPropertyId(event.target.value)} required value={propertyId}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              OTA
              <select onChange={(event) => setZodomusOtaKey(event.target.value as ZodomusOtaKey)} value={zodomusOtaKey}>
                {zodomusOtaOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Zodomus property ID
              <input
                onChange={(event) => setZodomusPropertyId(event.target.value)}
                placeholder="999999"
                required
                value={zodomusPropertyId}
              />
            </label>

            <button className="primary-button" disabled={pendingAction === 'create-connection'} type="submit">
              {pendingAction === 'create-connection' ? 'Saving...' : 'Save connection'}
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
              <select
                disabled={zodomusConnections.length === 0}
                onChange={(event) => {
                  setSelectedConnectionId(event.target.value);
                  setCatalogConnectionId('');
                  setCatalogLoaded(false);
                  setProviderCatalog(null);
                  setExternalRoomId('');
                  setExternalRateId('');
                }}
                value={selectedConnectionId}
              >
                <option value="">Select connection</option>
                {zodomusConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
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
                    <dt>OTA</dt>
                    <dd>{selectedConnection.provider_config_summary?.ota_name ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Zodomus property ID</dt>
                    <dd>{selectedConnection.external_hotel_id ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Mapped</dt>
                    <dd>
                      {selectedConnection.room_mappings.length} rooms / {selectedConnection.rate_mappings.length} rates
                    </dd>
                  </div>
                  <div>
                    <dt>Readiness</dt>
                    <dd>
                      {persistedSetupStatus?.disconnected
                        ? 'Disconnected remotely'
                        : persistedSetupStatus?.ready
                        ? 'Ready for sync'
                        : persistedSetupStatus?.rooms_activated
                        ? 'Awaiting final readiness check'
                        : persistedSetupStatus?.activated
                        ? 'Property activated, mappings pending'
                        : persistedSetupStatus?.checked
                          ? 'Checked, activation pending'
                          : 'Setup pending'}
                    </dd>
                  </div>
                  <div>
                    <dt>Auto sync</dt>
                    <dd>
                      {automationSummary?.enabled
                        ? `Inv ${automationSummary.inventory_interval_minutes}m / Rates ${automationSummary.rates_interval_minutes}m / Import ${automationSummary.bookings_interval_minutes}m`
                        : 'Disabled'}
                    </dd>
                  </div>
                </dl>
                <button
                  className="secondary-button"
                  disabled={pendingAction === 'delete-connection'}
                  onClick={() => void deleteConnection()}
                  type="button"
                >
                  {pendingAction === 'delete-connection' ? 'Removing...' : 'Remove connection'}
                </button>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={pendingAction === 'pause-connection' || selectedConnection.status === 'PAUSED'}
                    onClick={() => void pauseConnection()}
                    type="button"
                  >
                    {pendingAction === 'pause-connection' ? 'Pausing...' : 'Pause'}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={
                      pendingAction === 'resume-connection' ||
                      selectedConnection.status === 'ACTIVE' ||
                      Boolean(persistedSetupStatus?.disconnected)
                    }
                    onClick={() => void resumeConnection()}
                    type="button"
                  >
                    {pendingAction === 'resume-connection' ? 'Resuming...' : 'Resume'}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pendingAction === 'disconnect-connection' || Boolean(persistedSetupStatus?.disconnected)}
                    onClick={() => void disconnectConnection()}
                    type="button"
                  >
                    {pendingAction === 'disconnect-connection' ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
                <div className="connection-note">
                  <strong>Current state</strong>
                  <p className="muted">Setup, mappings, sync health, and advanced diagnostics are separated below.</p>
                </div>
              </div>
            ) : (
              <p className="muted">Add an OTA connection to start mapping rooms and rates.</p>
            )}
          </section>
        </aside>

        <div className="channel-main">
          {selectedConnection && (
            <>
              <section className="channel-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Workspace</p>
                    <h3>Connection workspace</h3>
                  </div>
                </div>
                <div className="wizard-summary">
                  <SetupBadge done={Boolean(persistedSetupStatus?.activated)} label="Activated" />
                  <SetupBadge done={Boolean(persistedSetupStatus?.catalog_loaded)} label="IDs loaded" />
                  <SetupBadge done={selectedConnection.room_mappings.length > 0} label="Rooms mapped" />
                  <SetupBadge done={selectedConnection.rate_mappings.length > 0} label="Rates mapped" />
                  <SetupBadge done={Boolean(persistedSetupStatus?.rooms_activated)} label="Rooms activated" />
                  <SetupBadge done={Boolean(persistedSetupStatus?.ready)} label="Ready" />
                </div>
                <div className="view-switch">
                  <button
                    className={workspaceView === 'setup' ? 'secondary-button active-toggle' : 'secondary-button'}
                    onClick={() => setWorkspaceView('setup')}
                    type="button"
                  >
                    Setup
                  </button>
                  <button
                    className={workspaceView === 'mappings' ? 'secondary-button active-toggle' : 'secondary-button'}
                    onClick={() => setWorkspaceView('mappings')}
                    type="button"
                  >
                    Mappings
                  </button>
                  <button
                    className={workspaceView === 'sync' ? 'secondary-button active-toggle' : 'secondary-button'}
                    onClick={() => setWorkspaceView('sync')}
                    type="button"
                  >
                    Sync health
                  </button>
                  <button
                    className={workspaceView === 'advanced' ? 'secondary-button active-toggle' : 'secondary-button'}
                    onClick={() => setWorkspaceView('advanced')}
                    type="button"
                  >
                    Advanced
                  </button>
                </div>
              </section>

              {workspaceView === 'setup' && (
                <>
                  {channelWarnings.length > 0 && (
                    <section className="channel-panel">
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">Action needed</p>
                          <h3>Setup blockers</h3>
                        </div>
                      </div>
                      <ul className="attention-list">
                        {channelWarnings.map((warning) => (
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
                    {persistedSetupStatus?.last_check_message && (
                      <p className="muted">
                        Last provider check: {persistedSetupStatus.last_check_message}
                        {persistedSetupStatus.last_check_code ? ` (${persistedSetupStatus.last_check_code})` : ''}
                      </p>
                    )}
                    {persistedSetupStatus?.last_activation_message && (
                      <p className="muted">
                        Last activation: {persistedSetupStatus.last_activation_message}
                        {persistedSetupStatus.last_activation_code ? ` (${persistedSetupStatus.last_activation_code})` : ''}
                      </p>
                    )}
                    {persistedSetupStatus?.last_rooms_activation_message && (
                      <p className="muted">
                        Last room activation: {persistedSetupStatus.last_rooms_activation_message}
                        {persistedSetupStatus.last_rooms_activation_code ? ` (${persistedSetupStatus.last_rooms_activation_code})` : ''}
                      </p>
                    )}
                    <div className="button-row">
                      <button
                        className="secondary-button"
                        disabled={!canLoadCatalog || pendingAction === 'load-provider-catalog'}
                        onClick={() => void loadProviderCatalog()}
                        type="button"
                      >
                        {pendingAction === 'load-provider-catalog' ? 'Loading...' : canMap ? 'Reload IDs' : 'Load IDs'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!selectedConnection || pendingAction === 'property-check'}
                        onClick={() => void runPropertyCheck()}
                        type="button"
                      >
                        {pendingAction === 'property-check' ? 'Checking...' : 'Run property check'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!selectedConnection || pendingAction === 'property-activate'}
                        onClick={() => void reactivateProperty()}
                        type="button"
                      >
                        {pendingAction === 'property-activate' ? 'Activating...' : 'Re-activate property'}
                      </button>
                      <button
                        className="primary-button"
                        disabled={!canActivateMappedRooms || pendingAction === 'activate-mapped-rooms'}
                        onClick={() => void activateMappedRooms()}
                        type="button"
                      >
                        {pendingAction === 'activate-mapped-rooms' ? 'Activating...' : 'Activate mapped rooms'}
                      </button>
                    </div>
                  </section>

                  <form className="channel-panel" onSubmit={saveAutomationSettings}>
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Operations</p>
                        <h3>Automation settings</h3>
                      </div>
                    </div>
                    <label>
                      <input
                        checked={automationEnabled}
                        onChange={(event) => setAutomationEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      Enable automatic sync
                    </label>
                    <div className="split-panels">
                      <label>
                        Inventory minutes
                        <input min="1" onChange={(event) => setInventoryInterval(event.target.value)} type="number" value={inventoryInterval} />
                      </label>
                      <label>
                        Rate minutes
                        <input min="1" onChange={(event) => setRatesInterval(event.target.value)} type="number" value={ratesInterval} />
                      </label>
                      <label>
                        Reservation import minutes
                        <input min="1" onChange={(event) => setReservationImportInterval(event.target.value)} type="number" value={reservationImportInterval} />
                      </label>
                      <label>
                        Sync window days
                        <input min="1" onChange={(event) => setSyncWindowDays(event.target.value)} type="number" value={syncWindowDays} />
                      </label>
                    </div>
                    <button className="primary-button" disabled={pendingAction === 'save-automation'} type="submit">
                      {pendingAction === 'save-automation' ? 'Saving...' : 'Save automation'}
                    </button>
                  </form>
                </>
              )}

              {workspaceView === 'mappings' && (
                <>
                  {canMap && (
                    <section className="channel-panel">
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">Provider IDs</p>
                          <h3>Available room and rate IDs</h3>
                        </div>
                      </div>
                      <div className="split-panels">
                        <CatalogList emptyText="No room IDs were returned." items={catalogRooms} title="Rooms" valueKey="external_room_id" />
                        <CatalogList emptyText="No rate IDs were returned." items={catalogRates} title="Rates" valueKey="external_rate_id" />
                      </div>
                    </section>
                  )}

                  <div className="channel-action-grid">
                    <form className="channel-panel" onSubmit={createRoomMapping}>
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">Rooms</p>
                          <h3>Map rooms</h3>
                        </div>
                      </div>

                      {!canMap && <p className="muted">Load room and rate IDs before creating mappings.</p>}

                      <label>
                        HMS room category
                        <select disabled={!canMap} onChange={(event) => setRoomCategoryId(event.target.value)} required value={roomCategoryId}>
                          <option value="">Select category</option>
                          {scopedCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name} ({category.code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Provider room ID
                        {hasCatalogRooms ? (
                          <select disabled={!canMap} onChange={(event) => setExternalRoomId(event.target.value)} required value={externalRoomId}>
                            {catalogRooms.map((room) => (
                              <option key={room.external_room_id} value={room.external_room_id}>
                                {room.external_room_name ? `${room.external_room_name} - ${room.external_room_id}` : room.external_room_id}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            disabled={!canMap}
                            onChange={(event) => setExternalRoomId(event.target.value)}
                            placeholder="Provider room ID"
                            required
                            value={externalRoomId}
                          />
                        )}
                      </label>

                      <button className="primary-button" disabled={!canMap || pendingAction === 'create-room-mapping'} type="submit">
                        {pendingAction === 'create-room-mapping' ? 'Saving...' : 'Save room mapping'}
                      </button>
                    </form>

                    <form className="channel-panel" onSubmit={createRateMapping}>
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">Rates</p>
                          <h3>Map rates</h3>
                        </div>
                      </div>

                      {!canMap && <p className="muted">Load room and rate IDs before creating mappings.</p>}

                      <label>
                        HMS rate plan
                        <select disabled={!canMap} onChange={(event) => setRatePlanId(event.target.value)} required value={ratePlanId}>
                          <option value="">Select rate plan</option>
                          {scopedRatePlans.map((ratePlan) => (
                            <option key={ratePlan.id} value={ratePlan.id}>
                              {ratePlan.name} ({ratePlan.code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Provider rate ID
                        {hasCatalogRates ? (
                          <select
                            disabled={!canMap}
                            onChange={(event) => {
                              const [roomId, rateId] = event.target.value.split('::');
                              setExternalRateRoomId(roomId);
                              setExternalRateId(rateId ?? '');
                            }}
                            required
                            value={`${externalRateRoomId}::${externalRateId}`}
                          >
                            {filteredCatalogRates.map((rate) => (
                              <option
                                key={`${rate.external_room_id ?? 'none'}-${rate.external_rate_id}`}
                                value={`${rate.external_room_id ?? ''}::${rate.external_rate_id}`}
                              >
                                {rate.external_rate_name ? `${rate.external_rate_name} - ${rate.external_rate_id}` : rate.external_rate_id}
                                {rate.external_room_id
                                  ? ` (${catalogRooms.find((room) => room.external_room_id === rate.external_room_id)?.external_room_name ?? rate.external_room_id})`
                                  : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            disabled={!canMap}
                            onChange={(event) => {
                              setExternalRateId(event.target.value);
                              setExternalRateRoomId(selectedRoomMappingForRatePlan?.external_room_id ?? '');
                            }}
                            placeholder="Provider rate ID"
                            required
                            value={externalRateId}
                          />
                        )}
                      </label>

                      {selectedRoomMappingForRatePlan && (
                        <p className="muted">
                          This HMS rate plan belongs to provider room <strong>{selectedRoomMappingForRatePlan.external_room_id}</strong>.
                        </p>
                      )}

                      <button className="primary-button" disabled={!canMap || pendingAction === 'create-rate-mapping'} type="submit">
                        {pendingAction === 'create-rate-mapping' ? 'Saving...' : 'Save rate mapping'}
                      </button>
                    </form>
                  </div>

                  <div className="mapping-grid">
                    <MappingTable
                      emptyText="No room mappings yet."
                      rows={selectedConnection.room_mappings.map((mapping) => ({
                        id: mapping.id,
                        internal: `${mapping.room_category.name} (${mapping.room_category.code})`,
                        external: mapping.external_room_id,
                      }))}
                      title="Mapped rooms"
                    />
                    <MappingTable
                      emptyText="No rate mappings yet."
                      rows={selectedConnection.rate_mappings.map((mapping) => ({
                        id: mapping.id,
                        internal: `${mapping.rate_plan.name} (${mapping.rate_plan.code})`,
                        external: mapping.external_room_id
                          ? `${mapping.external_room_id} / ${mapping.external_rate_id}`
                          : mapping.external_rate_id,
                      }))}
                      title="Mapped rates"
                    />
                  </div>
                </>
              )}

              {workspaceView === 'sync' && (
                <>
                  <section className="channel-panel">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Operations</p>
                        <h3>Sync health</h3>
                      </div>
                    </div>
                    <div className="split-panels">
                      <SyncStateCard label="Inventory" state={selectedConnection.sync_summary.inventory} />
                      <SyncStateCard label="Rates" state={selectedConnection.sync_summary.rates} />
                      <SyncStateCard label="Reservation import" state={selectedConnection.sync_summary.bookings} />
                    </div>
                  </section>

                  <section className="channel-panel">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Operations</p>
                        <h3>Inventory reconciliation</h3>
                      </div>
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          disabled={inventoryReconciliationLoading || pendingAction === 'refresh-reconciliation'}
                          onClick={() => void refreshInventoryReconciliation()}
                          type="button"
                        >
                          {pendingAction === 'refresh-reconciliation' ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button
                          className="secondary-button"
                          disabled={
                            !inventoryReconciliation?.compared_window ||
                            pendingAction === 'resync-reconciliation' ||
                            inventoryReconciliationLoading
                          }
                          onClick={() => void resyncInventoryDriftWindow()}
                          type="button"
                        >
                          {pendingAction === 'resync-reconciliation' ? 'Queueing...' : 'Re-sync compared window'}
                        </button>
                        <button
                          className="secondary-button"
                          disabled={
                            latestInventorySyncLog?.status !== 'PARTIAL_FAILED' ||
                            pendingAction === 'retry-failed-inventory-rows' ||
                            inventoryReconciliationLoading
                          }
                          onClick={() => void retryFailedInventoryRows()}
                          type="button"
                        >
                          {pendingAction === 'retry-failed-inventory-rows' ? 'Queueing...' : 'Retry failed rows'}
                        </button>
                      </div>
                    </div>
                    {inventoryReconciliationLoading ? <p className="muted">Calculating current HMS inventory drift…</p> : null}
                    {inventoryReconciliationError ? <p className="error">{inventoryReconciliationError}</p> : null}
                    {inventoryReconciliation ? (
                      <>
                        <div className="wizard-summary">
                          <span
                            className={`status-pill ${
                              inventoryReconciliation.status === 'IN_SYNC'
                                ? 'active'
                                : inventoryReconciliation.status === 'DRIFT_DETECTED'
                                  ? 'pending'
                                  : ''
                            }`}
                          >
                            {inventoryReconciliation.status === 'IN_SYNC'
                              ? 'In sync'
                              : inventoryReconciliation.status === 'DRIFT_DETECTED'
                                ? 'Drift detected'
                                : 'No baseline'}
                          </span>
                          {inventoryReconciliation.compared_window ? (
                            <span className="status-pill">
                              Window: {inventoryReconciliation.compared_window.from} to {inventoryReconciliation.compared_window.to}
                            </span>
                          ) : null}
                          {inventoryReconciliation.latest_synced_at ? (
                            <span className="status-pill">
                              Last baseline: {formatDateTime(inventoryReconciliation.latest_synced_at)}
                            </span>
                          ) : null}
                          {inventoryReconciliation.trigger ? <span className="status-pill">Trigger: {inventoryReconciliation.trigger}</span> : null}
                        </div>
                        {inventoryReconciliation.message ? <p className="muted">{inventoryReconciliation.message}</p> : null}
                        <div className="split-panels">
                          <SummaryTile
                            detail="Rows compared across the latest successful inventory window."
                            label="Compared rows"
                            value={String(inventoryReconciliation.summary.compared_row_count)}
                          />
                          <SummaryTile
                            detail="Rows whose HMS inventory still matches the last pushed snapshot."
                            label="Unchanged"
                            value={String(inventoryReconciliation.summary.unchanged_rows)}
                          />
                          <SummaryTile
                            detail="Rows that differ, disappeared, or were added since the last successful push."
                            label="Drift rows"
                            value={String(
                              inventoryReconciliation.summary.drifted_rows +
                                inventoryReconciliation.summary.snapshot_only_rows +
                                inventoryReconciliation.summary.current_only_rows,
                            )}
                          />
                          <SummaryTile
                            detail="Net HMS available-room change across the compared window."
                            label="Availability delta"
                            value={formatSignedNumber(inventoryReconciliation.summary.total_available_delta)}
                          />
                        </div>
                        {inventoryReconciliation.drift_rows.length > 0 ? (
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
                                {inventoryReconciliation.drift_rows.slice(0, 12).map((row) => (
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

                  <section className="channel-panel">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Operations</p>
                        <h3>Failed inventory rows</h3>
                      </div>
                    </div>
                    {inventoryRowResultsLoading ? <p className="muted">Loading row-level inventory failures…</p> : null}
                    {inventoryRowResultsError ? <p className="error">{inventoryRowResultsError}</p> : null}
                    {inventoryRowResults ? (
                      <>
                        <div className="split-panels">
                          <SummaryTile detail="Persisted inventory row attempts for this connection." label="Stored rows" value={String(inventoryRowResults.summary.total_rows)} />
                          <SummaryTile detail="Rows that failed across all stored inventory sync attempts." label="Failed rows" value={String(inventoryRowResults.summary.failed_rows)} />
                          <SummaryTile detail="Distinct provider rooms with at least one failed row." label="Failed rooms" value={String(inventoryRowResults.summary.failed_rooms)} />
                          <SummaryTile detail="Rows that completed successfully and were persisted." label="Succeeded rows" value={String(inventoryRowResults.summary.succeeded_rows)} />
                        </div>
                        <div className="split-panels">
                          <div className="mapping-card">
                            <div className="section-heading">
                              <div>
                                <p className="eyebrow">Recent failures</p>
                                <h3>Latest failed room/date rows</h3>
                              </div>
                            </div>
                            {inventoryRowResults.recent_failed_rows.length > 0 ? (
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
                                    {inventoryRowResults.recent_failed_rows.slice(0, 10).map((row) => (
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
                            {inventoryRowResults.grouped_failures.length > 0 ? (
                              <div className="mapping-scroll">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Provider room</th>
                                      <th>Failures</th>
                                      <th>Last date</th>
                                      <th>Last seen</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {inventoryRowResults.grouped_failures.map((row) => (
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
                              <p className="muted">No recurring room-level failures are recorded yet.</p>
                            )}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </section>
                </>
              )}

              {workspaceView === 'advanced' && (
                <section className="channel-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Admin detail</p>
                      <h3>Provider diagnostics</h3>
                    </div>
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>Environment</dt>
                      <dd>{selectedConnection.provider_config_summary?.environment ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Channel ID</dt>
                      <dd>{selectedConnection.provider_config_summary?.channel_id ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Price model ID</dt>
                      <dd>{persistedSetupStatus?.price_model_id ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Catalog room count</dt>
                      <dd>{persistedSetupStatus?.catalog_room_count ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Catalog rate count</dt>
                      <dd>{persistedSetupStatus?.catalog_rate_count ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Activated room count</dt>
                      <dd>{persistedSetupStatus?.activated_room_count ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Last check code</dt>
                      <dd>{persistedSetupStatus?.last_check_code ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Last activation code</dt>
                      <dd>{persistedSetupStatus?.last_activation_code ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Last room activation code</dt>
                      <dd>{persistedSetupStatus?.last_rooms_activation_code ?? '-'}</dd>
                    </div>
                  </dl>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryTile({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function SetupBadge({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`status-pill ${done ? 'active' : 'pending'}`}>
      {done ? label : `${label}: pending`}
    </span>
  );
}

function SyncStateCard({
  label,
  state,
}: {
  label: string;
  state: {
    last_status: string | null;
    last_synced_at: string | null;
    last_error: string | null;
    next_due_at: string | null;
  };
}) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{state.last_status ?? 'Never run'}</strong>
      <span>{state.last_synced_at ? `Last: ${formatDateTime(state.last_synced_at)}` : 'No sync yet'}</span>
      <span>{state.next_due_at ? `Next: ${formatDateTime(state.next_due_at)}` : 'No next schedule'}</span>
      {state.last_error ? <span>{state.last_error}</span> : null}
    </article>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatSignedNumber(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatInventorySnapshot(
  value:
    | {
        total_inventory: number;
        out_of_service: number;
        booked: number;
        available: number;
      }
    | null
    | undefined,
) {
  if (!value) return '-';
  return `avail ${value.available} | booked ${value.booked} | ooo ${value.out_of_service} | total ${value.total_inventory}`;
}

function CatalogList<T extends { external_room_id?: string | null; external_rate_id?: string | null; external_room_name?: string | null; external_rate_name?: string | null }>({
  emptyText,
  items,
  title,
  valueKey,
}: {
  emptyText: string;
  items: T[];
  title: string;
  valueKey: 'external_room_id' | 'external_rate_id';
}) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <table className="data-table compact-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const id = item[valueKey] ?? '';
              const name = item.external_room_name ?? item.external_rate_name ?? '-';
              return (
                <tr key={id}>
                  <td>{id}</td>
                  <td>{name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
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
          <p className="eyebrow">Saved mappings</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="mapping-scroll">
        <table>
          <thead>
            <tr>
              <th>HMS item</th>
              <th>Provider ID</th>
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
    </div>
  );
}
