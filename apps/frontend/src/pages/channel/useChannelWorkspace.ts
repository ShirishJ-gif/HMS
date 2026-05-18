import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../../api/client';
import { fetchAllPages } from '../../api/pagination';
import {
  BackgroundJob,
  ChannelConnection,
  ChannelProviderCatalog,
  ChannelProviderPriceModel,
  ChannelProviderPriceModels,
  ChannelSyncLog,
  InventoryReconciliation,
  InventoryRowResults,
  Property,
  RatePlan,
  RoomCategory,
  WebhookEvent,
  ZodomusSetupResponse,
} from '../../api/types';
import { usePersistedPropertyId } from '../../hooks/usePersistedPropertyId';

const zodomusOtaOptions = [
  { key: 'BOOKING_COM', label: 'Booking.com' },
  { key: 'EXPEDIA', label: 'Expedia' },
  { key: 'AIRBNB', label: 'Airbnb' },
] as const;

type ZodomusOtaKey = (typeof zodomusOtaOptions)[number]['key'];
const providerReservationEventOptions = ['new', 'modified', 'cancelled'] as const;
type ProviderReservationEventStatus = (typeof providerReservationEventOptions)[number];

const fallbackZodomusPriceModels: ChannelProviderPriceModel[] = [
  { id: 1, model: 'Maximum / Single occupancy' },
  { id: 2, model: 'Derived pricing' },
  { id: 3, model: 'Occupancy' },
  { id: 4, model: 'Per day' },
  { id: 5, model: 'Per Day Length of stay' },
];

type UseChannelWorkspaceOptions = {
  diagnosticsEnabled?: boolean;
  enabled?: boolean;
  sessionKey?: string | null;
};

type ChannelWorkspaceCache = {
  automationEnabled: boolean;
  backgroundJobs: BackgroundJob[];
  backgroundJobsError: string | null;
  catalogConnectionId: string;
  catalogLoaded: boolean;
  categories: RoomCategory[];
  connections: ChannelConnection[];
  error: string | null;
  externalRateId: string;
  externalRateRoomId: string;
  externalRoomId: string;
  hasLoadedData: boolean;
  fullSyncWindowDays: string;
  inventoryInterval: string;
  inventoryReconciliation: InventoryReconciliation | null;
  inventoryReconciliationError: string | null;
  inventoryRowResults: InventoryRowResults | null;
  inventoryRowResultsError: string | null;
  loading: boolean;
  properties: Property[];
  providerCatalog: ChannelProviderCatalog | null;
  providerPriceModels: ChannelProviderPriceModel[];
  providerPriceModelsError: string | null;
  providerReservationEventStatus: ProviderReservationEventStatus;
  providerReservationId: string;
  ratePlanId: string;
  ratePlans: RatePlan[];
  ratesInterval: string;
  reservationImportInterval: string;
  roomCategoryId: string;
  selectedConnectionId: string;
  status: string | null;
  syncLogs: ChannelSyncLog[];
  syncLogsError: string | null;
  syncWindowDays: string;
  webhookEvents: WebhookEvent[];
  webhookEventsError: string | null;
  zodomusOtaKey: ZodomusOtaKey;
  zodomusPriceModelId: string;
  zodomusPropertyId: string;
};

const channelWorkspaceCacheBySession = new Map<string, ChannelWorkspaceCache>();
const diagnosticsCacheUpdatedAtByKey = new Map<string, number>();
const diagnosticsCacheTtlMs = 60_000;

function buildEmptyWorkspaceCache(enabled: boolean): ChannelWorkspaceCache {
  return {
    automationEnabled: true,
    backgroundJobs: [],
    backgroundJobsError: null,
    catalogConnectionId: '',
    catalogLoaded: false,
    categories: [],
    connections: [],
    error: null,
    externalRateId: '',
    externalRateRoomId: '',
    externalRoomId: '',
    hasLoadedData: false,
    fullSyncWindowDays: '365',
    inventoryInterval: '15',
    inventoryReconciliation: null,
    inventoryReconciliationError: null,
    inventoryRowResults: null,
    inventoryRowResultsError: null,
    loading: enabled,
    properties: [],
    providerCatalog: null,
    providerPriceModels: [],
    providerPriceModelsError: null,
    providerReservationEventStatus: 'new',
    providerReservationId: '',
    ratePlanId: '',
    ratePlans: [],
    ratesInterval: '60',
    reservationImportInterval: '5',
    roomCategoryId: '',
    selectedConnectionId: '',
    status: null,
    syncLogs: [],
    syncLogsError: null,
    syncWindowDays: '30',
    webhookEvents: [],
    webhookEventsError: null,
    zodomusOtaKey: 'BOOKING_COM',
    zodomusPriceModelId: '1',
    zodomusPropertyId: '',
  };
}

function getWorkspaceCache(sessionKey: string, enabled: boolean) {
  return channelWorkspaceCacheBySession.get(sessionKey) ?? buildEmptyWorkspaceCache(enabled);
}

function getDiagnosticsCacheKey(sessionKey: string, connectionId: string, propertyId: string | null) {
  return `${sessionKey}:${connectionId}:${propertyId ?? 'all'}`;
}

export function clearChannelWorkspaceCache(sessionKey?: string | null) {
  if (sessionKey == null) {
    channelWorkspaceCacheBySession.clear();
    return;
  }

  channelWorkspaceCacheBySession.delete(sessionKey);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildSyncWindow(windowDays: number) {
  const fromDate = new Date();
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + Math.max(windowDays - 1, 0));
  return {
    from: formatDateInput(fromDate),
    to: formatDateInput(toDate),
  };
}

function defaultPriceModelId(channelId: string | null | undefined) {
  if (channelId === '1') return 1;
  if (channelId === '2') return 3;
  if (channelId === '3') return 4;
  return 1;
}

function defaultPriceModelIdForOta(otaKey: ZodomusOtaKey) {
  if (otaKey === 'BOOKING_COM') return 1;
  if (otaKey === 'EXPEDIA') return 3;
  return 4;
}

function normalizePriceModelId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function extractPriceModels(payload: ChannelProviderPriceModels) {
  const candidates = payload.response?.models ?? payload.price_models ?? [];
  return candidates.filter(
    (model): model is ChannelProviderPriceModel =>
      Number.isFinite(model.id) && typeof model.model === 'string' && model.model.trim().length > 0,
  );
}

function parseProviderStatusMessage(message: string | null | undefined) {
  if (!message) return null;

  try {
    const parsed = JSON.parse(message);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return Object.entries(parsed).flatMap(([label, value]) =>
      typeof value === 'string' && value.trim()
        ? [
            {
              label,
              value: value.trim(),
            },
          ]
        : [],
    );
  } catch {
    return null;
  }
}

export function useChannelWorkspace(options: UseChannelWorkspaceOptions = {}) {
  const {
    diagnosticsEnabled = true,
    enabled = true,
    sessionKey = 'default',
  } = options;
  const resolvedSessionKey = sessionKey ?? 'default';
  const cachedState = getWorkspaceCache(resolvedSessionKey, enabled);
  const [connections, setConnections] = useState<ChannelConnection[]>(() => cachedState.connections);
  const [properties, setProperties] = useState<Property[]>(() => cachedState.properties);
  const [categories, setCategories] = useState<RoomCategory[]>(() => cachedState.categories);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>(() => cachedState.ratePlans);
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => cachedState.selectedConnectionId);
  const [propertyId, setPropertyId] = usePersistedPropertyId();
  const [zodomusPropertyId, setZodomusPropertyId] = useState(() => cachedState.zodomusPropertyId);
  const [zodomusOtaKey, setZodomusOtaKey] = useState<ZodomusOtaKey>(() => cachedState.zodomusOtaKey);
  const [zodomusPriceModelId, setZodomusPriceModelId] = useState(() => cachedState.zodomusPriceModelId);
  const [roomCategoryId, setRoomCategoryId] = useState(() => cachedState.roomCategoryId);
  const [externalRoomId, setExternalRoomId] = useState(() => cachedState.externalRoomId);
  const [ratePlanId, setRatePlanId] = useState(() => cachedState.ratePlanId);
  const [externalRateId, setExternalRateId] = useState(() => cachedState.externalRateId);
  const [externalRateRoomId, setExternalRateRoomId] = useState(() => cachedState.externalRateRoomId);
  const [providerCatalog, setProviderCatalog] = useState<ChannelProviderCatalog | null>(() => cachedState.providerCatalog);
  const [providerPriceModels, setProviderPriceModels] = useState<ChannelProviderPriceModel[]>(
    () => cachedState.providerPriceModels,
  );
  const [providerPriceModelsLoading, setProviderPriceModelsLoading] = useState(false);
  const [providerPriceModelsError, setProviderPriceModelsError] = useState<string | null>(
    () => cachedState.providerPriceModelsError,
  );
  const [catalogConnectionId, setCatalogConnectionId] = useState(() => cachedState.catalogConnectionId);
  const [catalogLoaded, setCatalogLoaded] = useState(() => cachedState.catalogLoaded);
  const [status, setStatus] = useState<string | null>(() => cachedState.status);
  const [error, setError] = useState<string | null>(() => cachedState.error);
  const [loading, setLoading] = useState(() => cachedState.loading);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState(() => cachedState.automationEnabled);
  const [inventoryInterval, setInventoryInterval] = useState(() => cachedState.inventoryInterval);
  const [ratesInterval, setRatesInterval] = useState(() => cachedState.ratesInterval);
  const [reservationImportInterval, setReservationImportInterval] = useState(() => cachedState.reservationImportInterval);
  const [syncWindowDays, setSyncWindowDays] = useState(() => cachedState.syncWindowDays);
  const [inventoryReconciliation, setInventoryReconciliation] = useState<InventoryReconciliation | null>(
    () => cachedState.inventoryReconciliation,
  );
  const [inventoryReconciliationLoading, setInventoryReconciliationLoading] = useState(false);
  const [inventoryReconciliationError, setInventoryReconciliationError] = useState<string | null>(
    () => cachedState.inventoryReconciliationError,
  );
  const [inventoryRowResults, setInventoryRowResults] = useState<InventoryRowResults | null>(
    () => cachedState.inventoryRowResults,
  );
  const [inventoryRowResultsLoading, setInventoryRowResultsLoading] = useState(false);
  const [inventoryRowResultsError, setInventoryRowResultsError] = useState<string | null>(
    () => cachedState.inventoryRowResultsError,
  );
  const [syncLogs, setSyncLogs] = useState<ChannelSyncLog[]>(() => cachedState.syncLogs);
  const [syncLogsLoading, setSyncLogsLoading] = useState(false);
  const [syncLogsError, setSyncLogsError] = useState<string | null>(() => cachedState.syncLogsError);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>(() => cachedState.webhookEvents);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookEventsError, setWebhookEventsError] = useState<string | null>(() => cachedState.webhookEventsError);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>(() => cachedState.backgroundJobs);
  const [backgroundJobsLoading, setBackgroundJobsLoading] = useState(false);
  const [backgroundJobsError, setBackgroundJobsError] = useState<string | null>(() => cachedState.backgroundJobsError);
  const [providerReservationEventStatus, setProviderReservationEventStatus] =
    useState<ProviderReservationEventStatus>(() => cachedState.providerReservationEventStatus);
  const [providerReservationId, setProviderReservationId] = useState(() => cachedState.providerReservationId);
  const [hasLoadedData, setHasLoadedData] = useState(() => cachedState.hasLoadedData);
  const [fullSyncWindowDays, setFullSyncWindowDays] = useState(() => cachedState.fullSyncWindowDays);

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
  const priceModelOptions = providerPriceModels.length > 0 ? providerPriceModels : fallbackZodomusPriceModels;
  const selectedRoomMappingForRatePlan = useMemo(() => {
    if (!selectedConnection || !selectedRatePlan) return null;
    return (
      selectedConnection.room_mappings.find((mapping) => mapping.room_category_id === selectedRatePlan.room_category_id) ??
      null
    );
  }, [selectedConnection, selectedRatePlan]);
  const filteredCatalogRates = useMemo(() => {
    const mappedExternalRoomId = selectedRoomMappingForRatePlan?.external_room_id ?? null;
    if (!mappedExternalRoomId) return catalogRates;
    const matchingRates = catalogRates.filter((rate) => rate.external_room_id === mappedExternalRoomId);
    return matchingRates.length > 0 ? matchingRates : catalogRates;
  }, [catalogRates, selectedRoomMappingForRatePlan]);
  const hasCatalogRooms = catalogRooms.length > 0;
  const hasCatalogRates = filteredCatalogRates.length > 0;
  const canLoadCatalog = Boolean(selectedConnection?.external_hotel_id && selectedConnection.provider_config_summary?.ota_name);
  const canMap = Boolean(selectedConnection && catalogLoaded && catalogConnectionId === selectedConnection.id);
  const activeRoomMappings = selectedConnection?.room_mappings ?? [];
  const activeExternalRoomIds = new Set(activeRoomMappings.map((mapping) => mapping.external_room_id));
  const activeRateMappings =
    selectedConnection?.rate_mappings.filter(
      (mapping) => Boolean(mapping.external_room_id && activeExternalRoomIds.has(mapping.external_room_id)),
    ) ?? [];
  const canActivateMappedRooms = Boolean(
    selectedConnection &&
      activeRoomMappings.length > 0 &&
      activeRateMappings.length > 0,
  );
  const selectedPropertyScopeId = selectedConnection?.property_id ?? null;
  const providerCatalogRoomCount = persistedSetupStatus?.catalog_room_count ?? providerCatalog?.rooms.length ?? 0;
  const providerCatalogRateCount = persistedSetupStatus?.catalog_rate_count ?? providerCatalog?.rates.length ?? 0;
  const mappedRoomCategoryIds = useMemo(
    () => new Set(selectedConnection?.room_mappings.map((mapping) => mapping.room_category_id) ?? []),
    [selectedConnection?.room_mappings],
  );
  const mappedRatePlanIds = useMemo(
    () => new Set(selectedConnection?.rate_mappings.map((mapping) => mapping.rate_plan_id) ?? []),
    [selectedConnection?.rate_mappings],
  );
  const unmappedRoomCategories = useMemo(
    () => scopedCategories.filter((category) => !mappedRoomCategoryIds.has(category.id)),
    [mappedRoomCategoryIds, scopedCategories],
  );
  const unmappedRatePlans = useMemo(
    () => scopedRatePlans.filter((ratePlan) => !mappedRatePlanIds.has(ratePlan.id)),
    [mappedRatePlanIds, scopedRatePlans],
  );
  const roomMappingGap = Math.max(providerCatalogRoomCount - (selectedConnection?.room_mappings.length ?? 0), 0);
  const rateMappingGap = Math.max(providerCatalogRateCount - (selectedConnection?.rate_mappings.length ?? 0), 0);
  const localRatePlanShortfall =
    providerCatalogRateCount > 0 ? Math.max(providerCatalogRateCount - scopedRatePlans.length, 0) : 0;
  const localRoomCategoryShortfall =
    providerCatalogRoomCount > 0 ? Math.max(providerCatalogRoomCount - scopedCategories.length, 0) : 0;
  const parsedProviderCheckStatuses = useMemo(
    () => parseProviderStatusMessage(persistedSetupStatus?.last_check_message),
    [persistedSetupStatus?.last_check_message],
  );
  const setupRunbook = [
    {
      key: 'activate',
      label: 'Property activation',
      done: Boolean(persistedSetupStatus?.activated),
      detail: persistedSetupStatus?.activated
        ? 'Provider accepted the property link.'
        : 'Activate the property link first or wait for provider approval.',
    },
    {
      key: 'catalog',
      label: 'Provider IDs',
      done: Boolean(persistedSetupStatus?.catalog_loaded),
      detail: persistedSetupStatus?.catalog_loaded
        ? `${providerCatalogRoomCount} rooms and ${providerCatalogRateCount} provider products are loaded.`
        : 'Load the provider catalog so room and rate IDs are available for mapping.',
    },
    {
      key: 'rooms',
      label: 'Room mappings',
      done: selectedConnection ? unmappedRoomCategories.length === 0 && selectedConnection.room_mappings.length > 0 : false,
      detail: selectedConnection
        ? `${selectedConnection.room_mappings.length}/${scopedCategories.length} HMS room categories mapped.`
        : 'Choose a connection first.',
    },
    {
      key: 'rates',
      label: 'Rate mappings',
      done: selectedConnection ? unmappedRatePlans.length === 0 && selectedConnection.rate_mappings.length > 0 : false,
      detail: selectedConnection
        ? `${selectedConnection.rate_mappings.length}/${scopedRatePlans.length} HMS rate plans mapped.`
        : 'Choose a connection first.',
    },
    {
      key: 'activation',
      label: 'Room activation',
      done: Boolean(persistedSetupStatus?.rooms_activated),
      detail: persistedSetupStatus?.rooms_activated
        ? 'Mapped products were sent to the provider for activation.'
        : 'Activate mapped rooms after room and rate mappings are saved.',
    },
    {
      key: 'ready',
      label: 'Ready for sync',
      done: Boolean(persistedSetupStatus?.ready),
      detail: persistedSetupStatus?.ready
        ? 'Inventory and rate pushes can run against this connection.'
        : 'Run the final property check and resolve remaining provider blockers.',
    },
  ];
  const nextSetupAction =
    !selectedConnection
      ? 'Select or create a connection to continue onboarding.'
      : !persistedSetupStatus?.activated
        ? 'Re-activate the property or wait for provider approval before attempting full sync.'
        : !persistedSetupStatus?.catalog_loaded
          ? 'Load provider room and rate IDs before mapping anything.'
          : unmappedRoomCategories.length > 0
            ? `Map ${unmappedRoomCategories.length} remaining HMS room categor${unmappedRoomCategories.length === 1 ? 'y' : 'ies'}.`
            : localRoomCategoryShortfall > 0
              ? `HMS has ${localRoomCategoryShortfall} fewer room categories than the provider catalog. Add local room types or reduce provider rooms.`
              : unmappedRatePlans.length > 0
                ? `Map ${unmappedRatePlans.length} remaining HMS rate plan${unmappedRatePlans.length === 1 ? '' : 's'}.`
                : localRatePlanShortfall > 0
                  ? `Create ${localRatePlanShortfall} more HMS rate plan${localRatePlanShortfall === 1 ? '' : 's'} or deactivate extra provider products.`
                  : canActivateMappedRooms && !persistedSetupStatus?.rooms_activated
                    ? 'Activate mapped rooms so provider products become usable.'
                    : persistedSetupStatus?.rooms_activated && !persistedSetupStatus?.ready
                      ? 'Run property check and clear the remaining provider blockers before syncing.'
                      : 'Connection is ready for inventory and rate sync.';
  const mappingHealth = {
    localRoomCategories: scopedCategories.length,
    localRatePlans: scopedRatePlans.length,
    mappedRooms: selectedConnection?.room_mappings.length ?? 0,
    mappedRates: selectedConnection?.rate_mappings.length ?? 0,
    activeRooms: activeRoomMappings.length,
    activeRates: activeRateMappings.length,
    providerRooms: providerCatalogRoomCount,
    providerRates: providerCatalogRateCount,
    roomMappingGap,
    rateMappingGap,
    localRoomCategoryShortfall,
    localRatePlanShortfall,
    unmappedRoomCategories,
    unmappedRatePlans,
    needsMoreRatePlans: localRatePlanShortfall > 0,
    needsMoreRoomCategories: localRoomCategoryShortfall > 0,
  };
  const syncGuidance = {
    inventory: {
      title: 'Inventory sync updates availability',
      when: 'Use after bookings, cancellations, maintenance blocks, room status changes, or room count updates.',
      warning: !persistedSetupStatus?.ready
        ? 'Provider setup is not ready yet, so inventory pushes may be rejected.'
        : 'If a queued inventory sync never advances, the background job worker is probably disabled.',
    },
    rates: {
      title: 'Rates sync updates sell prices',
      when: 'Use after changing base rates, pricing rules, or rate-plan pricing for the selected date window.',
      warning: mappingHealth.needsMoreRatePlans
        ? `Provider exposes ${providerCatalogRateCount} products but HMS only has ${scopedRatePlans.length} rate plans, so some products still cannot map.`
        : !persistedSetupStatus?.ready
          ? 'Provider setup is not ready yet, so rate pushes may be rejected.'
          : 'If a queued rates sync never advances, the background job worker is probably disabled.',
    },
    queueHint:
      'Manual sync buttons enqueue work first. If the latest log stays QUEUED and never changes, check that the background job worker is running.',
  };
  const channelWarnings = [
    !persistedSetupStatus?.activated ? 'Property activation is still pending.' : null,
    !persistedSetupStatus?.catalog_loaded ? 'Provider room/rate IDs are not loaded yet.' : null,
    selectedConnection && selectedConnection.room_mappings.length === 0 ? 'No HMS room categories are mapped yet.' : null,
    selectedConnection && selectedConnection.rate_mappings.length === 0 ? 'No HMS rate plans are mapped yet.' : null,
    selectedConnection && selectedConnection.room_mappings.length > 0 && activeRoomMappings.length === 0
      ? 'No mapped rooms are available for provider activation.'
      : null,
    selectedConnection && selectedConnection.rate_mappings.length > 0 && activeRateMappings.length === 0
      ? 'No mapped rates are linked to mapped rooms for provider activation.'
      : null,
    persistedSetupStatus?.activated &&
    persistedSetupStatus?.catalog_loaded &&
    canActivateMappedRooms &&
    !persistedSetupStatus?.rooms_activated
      ? 'Mapped rooms still need provider-side room activation.'
      : null,
    persistedSetupStatus?.rooms_activated && !persistedSetupStatus?.ready
      ? 'Provider room activation finished, but the final readiness check is not OK yet.'
      : null,
    mappingHealth.localRoomCategoryShortfall > 0
      ? `Provider exposes ${providerCatalogRoomCount} rooms but HMS only has ${scopedCategories.length} room categories in this property.`
      : null,
    mappingHealth.localRatePlanShortfall > 0
      ? `Provider exposes ${providerCatalogRateCount} products but HMS only has ${scopedRatePlans.length} rate plans to map against them.`
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  const propertyActivationPriceModelId = normalizePriceModelId(
    zodomusPriceModelId || String(defaultPriceModelId(selectedConnection?.provider_config_summary?.channel_id)),
  );

  function applyWorkspaceCache(nextState: ChannelWorkspaceCache) {
    setConnections(nextState.connections);
    setProperties(nextState.properties);
    setCategories(nextState.categories);
    setRatePlans(nextState.ratePlans);
    setSelectedConnectionId(nextState.selectedConnectionId);
    setZodomusPropertyId(nextState.zodomusPropertyId);
    setZodomusOtaKey(nextState.zodomusOtaKey);
    setZodomusPriceModelId(nextState.zodomusPriceModelId);
    setRoomCategoryId(nextState.roomCategoryId);
    setExternalRoomId(nextState.externalRoomId);
    setRatePlanId(nextState.ratePlanId);
    setExternalRateId(nextState.externalRateId);
    setExternalRateRoomId(nextState.externalRateRoomId);
    setProviderCatalog(nextState.providerCatalog);
    setProviderPriceModels(nextState.providerPriceModels);
    setProviderPriceModelsError(nextState.providerPriceModelsError);
    setCatalogConnectionId(nextState.catalogConnectionId);
    setCatalogLoaded(nextState.catalogLoaded);
    setStatus(nextState.status);
    setError(nextState.error);
    setLoading(nextState.loading);
    setAutomationEnabled(nextState.automationEnabled);
    setInventoryInterval(nextState.inventoryInterval);
    setRatesInterval(nextState.ratesInterval);
    setReservationImportInterval(nextState.reservationImportInterval);
    setSyncWindowDays(nextState.syncWindowDays);
    setFullSyncWindowDays(nextState.fullSyncWindowDays);
    setInventoryReconciliation(nextState.inventoryReconciliation);
    setInventoryReconciliationError(nextState.inventoryReconciliationError);
    setInventoryRowResults(nextState.inventoryRowResults);
    setInventoryRowResultsError(nextState.inventoryRowResultsError);
    setSyncLogs(nextState.syncLogs);
    setSyncLogsError(nextState.syncLogsError);
    setWebhookEvents(nextState.webhookEvents);
    setWebhookEventsError(nextState.webhookEventsError);
    setBackgroundJobs(nextState.backgroundJobs);
    setBackgroundJobsError(nextState.backgroundJobsError);
    setProviderReservationEventStatus(nextState.providerReservationEventStatus);
    setProviderReservationId(nextState.providerReservationId);
    setHasLoadedData(nextState.hasLoadedData);
    setFullSyncWindowDays(nextState.fullSyncWindowDays);
  }

  async function loadData(options?: { background?: boolean }) {
    if (!enabled) {
      return;
    }

    if (!options?.background) {
      setLoading(true);
    }
    setError(null);
    try {
      const [loadedConnections, loadedProperties, loadedCategories, loadedRatePlans] = await Promise.all([
        fetchAllPages<ChannelConnection>('/channels'),
        fetchAllPages<Property>('/properties'),
        fetchAllPages<RoomCategory>('/room-categories'),
        fetchAllPages<RatePlan>('/rate-plans'),
      ]);
      const loadedZodomusConnections = loadedConnections.filter((connection) => connection.provider === 'ZODOMUS');
      const nextSelectedConnectionId = loadedZodomusConnections.some((connection) => connection.id === selectedConnectionId)
        ? selectedConnectionId
        : loadedZodomusConnections[0]?.id ?? '';
      setConnections(loadedConnections);
      setProperties(loadedProperties);
      setCategories(loadedCategories);
      setRatePlans(loadedRatePlans);
      setSelectedConnectionId(nextSelectedConnectionId);
      setHasLoadedData(true);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled || hasLoadedData) {
      return;
    }

    void loadData();
  }, [enabled, hasLoadedData]);

  useEffect(() => {
    applyWorkspaceCache(getWorkspaceCache(resolvedSessionKey, enabled));
  }, [enabled, resolvedSessionKey]);

  useEffect(() => {
    channelWorkspaceCacheBySession.set(resolvedSessionKey, {
      automationEnabled,
      backgroundJobs,
      backgroundJobsError,
      catalogConnectionId,
      catalogLoaded,
      categories,
      connections,
      error,
      externalRateId,
      externalRateRoomId,
      externalRoomId,
      hasLoadedData,
      fullSyncWindowDays,
      inventoryInterval,
      inventoryReconciliation,
      inventoryReconciliationError,
      inventoryRowResults,
      inventoryRowResultsError,
      loading,
      properties,
      providerCatalog,
      providerPriceModels,
      providerPriceModelsError,
      providerReservationEventStatus,
      providerReservationId,
      ratePlanId,
      ratePlans,
      ratesInterval,
      reservationImportInterval,
      roomCategoryId,
      selectedConnectionId,
      status,
      syncLogs,
      syncLogsError,
      syncWindowDays,
      webhookEvents,
      webhookEventsError,
      zodomusOtaKey,
      zodomusPriceModelId,
      zodomusPropertyId,
    });
  }, [
    automationEnabled,
    backgroundJobs,
    backgroundJobsError,
    catalogConnectionId,
    catalogLoaded,
    categories,
    connections,
    error,
    externalRateId,
    externalRateRoomId,
    externalRoomId,
    hasLoadedData,
    fullSyncWindowDays,
    inventoryInterval,
    inventoryReconciliation,
    inventoryReconciliationError,
    inventoryRowResults,
    inventoryRowResultsError,
    loading,
    properties,
    providerCatalog,
    providerPriceModels,
    providerPriceModelsError,
    providerReservationEventStatus,
    providerReservationId,
    ratePlanId,
    ratePlans,
    ratesInterval,
    reservationImportInterval,
    resolvedSessionKey,
    roomCategoryId,
    selectedConnectionId,
    status,
    syncLogs,
    syncLogsError,
    syncWindowDays,
    webhookEvents,
    webhookEventsError,
    zodomusOtaKey,
    zodomusPriceModelId,
    zodomusPropertyId,
  ]);

  useEffect(() => {
    if (properties.length === 0) {
      if (propertyId) setPropertyId('');
      return;
    }

    if (!propertyId || !properties.some((property) => property.id === propertyId)) {
      setPropertyId(properties[0].id);
    }
  }, [properties, propertyId, setPropertyId]);

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
    setFullSyncWindowDays(String(automationSummary?.full_sync_window_days ?? 365));
  }, [
    automationSummary?.enabled,
    automationSummary?.inventory_interval_minutes,
    automationSummary?.rates_interval_minutes,
    automationSummary?.bookings_interval_minutes,
    automationSummary?.sync_window_days,
    automationSummary?.full_sync_window_days,
  ]);

  useEffect(() => {
    if (selectedConnection) {
      setZodomusPriceModelId(
        String(
          persistedSetupStatus?.price_model_id ??
            defaultPriceModelId(selectedConnection.provider_config_summary?.channel_id),
        ),
      );
      return;
    }

    setZodomusPriceModelId(String(defaultPriceModelIdForOta(zodomusOtaKey)));
  }, [
    persistedSetupStatus?.price_model_id,
    selectedConnection?.id,
    selectedConnection?.provider_config_summary?.channel_id,
    zodomusOtaKey,
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

  async function loadSyncLogs(connectionId: string) {
    setSyncLogsLoading(true);
    setSyncLogsError(null);
    try {
      setSyncLogs(await fetchAllPages<ChannelSyncLog>(`/channels/${connectionId}/sync-logs`));
    } catch (loadError) {
      setSyncLogsError(getApiErrorMessage(loadError));
    } finally {
      setSyncLogsLoading(false);
    }
  }

  async function loadWebhookEvents() {
    setWebhookEventsLoading(true);
    setWebhookEventsError(null);
    try {
      const filteredEvents = (await fetchAllPages<WebhookEvent>('/webhook-events')).filter((event) =>
        selectedPropertyScopeId ? event.property_id === selectedPropertyScopeId : true,
      );
      setWebhookEvents(filteredEvents);
    } catch (loadError) {
      setWebhookEventsError(getApiErrorMessage(loadError));
    } finally {
      setWebhookEventsLoading(false);
    }
  }

  async function loadBackgroundJobs() {
    setBackgroundJobsLoading(true);
    setBackgroundJobsError(null);
    try {
      const filteredJobs = (await fetchAllPages<BackgroundJob>('/background-jobs')).filter((job) =>
        selectedPropertyScopeId ? job.property_id === selectedPropertyScopeId || job.entity_id === selectedConnectionId : true,
      );
      setBackgroundJobs(filteredJobs);
    } catch (loadError) {
      setBackgroundJobsError(getApiErrorMessage(loadError));
    } finally {
      setBackgroundJobsLoading(false);
    }
  }

  async function loadProviderPriceModels(connectionId: string) {
    setProviderPriceModelsLoading(true);
    setProviderPriceModelsError(null);
    try {
      const response = await api.get<ChannelProviderPriceModels>(`/channels/${connectionId}/provider-price-models`);
      const models = extractPriceModels(response.data);
      setProviderPriceModels(models.length > 0 ? models : fallbackZodomusPriceModels);
    } catch (loadError) {
      setProviderPriceModels(fallbackZodomusPriceModels);
      setProviderPriceModelsError(getApiErrorMessage(loadError));
    } finally {
      setProviderPriceModelsLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled || !diagnosticsEnabled) {
      return;
    }

    if (!selectedConnectionId) {
      setInventoryReconciliation(null);
      setInventoryReconciliationError(null);
      setInventoryRowResults(null);
      setInventoryRowResultsError(null);
      setSyncLogs([]);
      setSyncLogsError(null);
      setWebhookEvents([]);
      setBackgroundJobs([]);
      return;
    }

    const diagnosticsCacheKey = getDiagnosticsCacheKey(
      resolvedSessionKey,
      selectedConnectionId,
      selectedPropertyScopeId,
    );
    const cachedAt = diagnosticsCacheUpdatedAtByKey.get(diagnosticsCacheKey) ?? 0;
    if (Date.now() - cachedAt < diagnosticsCacheTtlMs) {
      return;
    }

    void Promise.all([
      loadInventoryReconciliation(selectedConnectionId),
      loadInventoryRowResults(selectedConnectionId),
      loadSyncLogs(selectedConnectionId),
      loadWebhookEvents(),
      loadBackgroundJobs(),
    ]).then(() => {
      diagnosticsCacheUpdatedAtByKey.set(diagnosticsCacheKey, Date.now());
    });
  }, [diagnosticsEnabled, enabled, resolvedSessionKey, selectedConnectionId, selectedPropertyScopeId]);

  useEffect(() => {
    if (!enabled || !selectedConnectionId) {
      setProviderPriceModels([]);
      setProviderPriceModelsError(null);
      return;
    }

    void loadProviderPriceModels(selectedConnectionId);
  }, [enabled, selectedConnectionId]);

  function selectConnection(connectionId: string) {
    setSelectedConnectionId(connectionId);
    setCatalogConnectionId('');
    setCatalogLoaded(false);
    setProviderCatalog(null);
    setProviderPriceModels([]);
    setProviderPriceModelsError(null);
    setExternalRoomId('');
    setExternalRateId('');
    setExternalRateRoomId('');
    setRoomCategoryId('');
    setRatePlanId('');
    setStatus(null);
    setError(null);
  }

  async function createConnection(event: FormEvent) {
    event.preventDefault();
    await runAction('create-connection', async () => {
      const response = await api.post<ZodomusSetupResponse>('/channels/zodomus/setup', {
        property_id: propertyId,
        external_hotel_id: zodomusPropertyId,
        ota_key: zodomusOtaKey,
        price_model_id: normalizePriceModelId(zodomusPriceModelId),
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
      setStatus('Mapped rooms and rates activated in Zodomus. Run property check before syncing.');
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
    if (!window.confirm(`Re-activate ${selectedConnection.name} in Zodomus? Use this when provider-side onboarding or approval has changed.`)) return;
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
    if (!window.confirm(`Remove ${selectedConnection.name}? This will delete its room mappings, rate mappings, and sync logs from HMS.`)) return;
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
    if (!window.confirm(`Disconnect ${selectedConnection.name} from Zodomus? This pauses sync and marks the remote property link as disconnected.`)) return;
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

  async function runInventorySync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(syncWindowDays));
    await runAction('inventory-sync', async () => {
      await api.post(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'INVENTORY',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      await loadData();
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      await loadSyncLogs(selectedConnection.id);
      setStatus(`Queued inventory sync for ${syncWindow.from} to ${syncWindow.to}.`);
    });
  }

  async function runRatesSync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(syncWindowDays));
    await runAction('rates-sync', async () => {
      await api.post(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'RATES',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      await loadData();
      await loadSyncLogs(selectedConnection.id);
      setStatus(`Queued rates sync for ${syncWindow.from} to ${syncWindow.to}.`);
    });
  }

  async function runFullInventorySync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(fullSyncWindowDays));
    if (!window.confirm(`Queue full inventory sync for ${syncWindow.from} to ${syncWindow.to}?`)) return;
    await runAction('full-inventory-sync', async () => {
      await api.post(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'INVENTORY',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      await loadData();
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      await loadSyncLogs(selectedConnection.id);
      setStatus(`Queued full inventory sync for ${syncWindow.from} to ${syncWindow.to}.`);
    });
  }

  async function runFullRatesSync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(fullSyncWindowDays));
    if (!window.confirm(`Queue full rates sync for ${syncWindow.from} to ${syncWindow.to}?`)) return;
    await runAction('full-rates-sync', async () => {
      await api.post(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'RATES',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      await loadData();
      await loadSyncLogs(selectedConnection.id);
      setStatus(`Queued full rates sync for ${syncWindow.from} to ${syncWindow.to}.`);
    });
  }

  async function backfillExistingReservations() {
    if (!selectedConnection) return;
    if (
      !window.confirm(
        'Backfill existing future reservations from Zodomus summary? Use this once during production go-live after mappings are ready.',
      )
    ) {
      return;
    }

    await runAction('reservations-summary-backfill', async () => {
      await api.post(`/channels/${selectedConnection.id}/reservations-summary-backfill`);
      await loadData();
      await loadSyncLogs(selectedConnection.id);
      setStatus('Queued one-time future reservation backfill from Zodomus summary.');
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
      await loadSyncLogs(selectedConnection.id);
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
      await loadSyncLogs(selectedConnection.id);
      setStatus('Queued retry for failed inventory rows.');
    });
  }

  async function submitProviderReservationEvent(event: FormEvent) {
    event.preventDefault();
    if (!selectedConnection) return;

    const trimmedReservationId = providerReservationId.trim();
    if (providerReservationEventStatus !== 'new' && !trimmedReservationId) {
      setError('Reservation ID is required for modified or cancelled provider events.');
      return;
    }

    if (
      providerReservationEventStatus === 'cancelled' &&
      !window.confirm(
        `Cancel provider reservation ${trimmedReservationId} in Zodomus and sync that cancellation into HMS?`,
      )
    ) {
      return;
    }

    await runAction('provider-reservation-event', async () => {
      const response = await api.post<{
        reservation_id?: string;
        import_summary?: {
          created?: number;
          updated?: number;
          cancelled?: number;
          skipped?: number;
        };
      }>(`/channels/${selectedConnection.id}/provider-reservations-create-test`, {
        status: providerReservationEventStatus,
        ...(trimmedReservationId ? { reservation_id: trimmedReservationId } : {}),
      });

      const effectiveReservationId =
        response.data.reservation_id ?? trimmedReservationId ?? 'provider reservation';
      const importSummary = response.data.import_summary;
      const importMessage = importSummary
        ? ` Import: created ${importSummary.created ?? 0}, updated ${importSummary.updated ?? 0}, cancelled ${importSummary.cancelled ?? 0}, skipped ${importSummary.skipped ?? 0}.`
        : '';

      setStatus(
        `Provider reservation ${providerReservationEventStatus} accepted for ${effectiveReservationId}.${importMessage}`,
      );

      if (providerReservationEventStatus === 'new') {
        setProviderReservationId(response.data.reservation_id ?? '');
      }

      await loadData();
      await loadSyncLogs(selectedConnection.id);
    });
  }

  return {
    automationEnabled,
    activateMappedRooms,
    backfillExistingReservations,
    backgroundJobs,
    backgroundJobsError,
    backgroundJobsLoading,
    canActivateMappedRooms,
    canLoadCatalog,
    canMap,
    catalogConnectionId,
    catalogLoaded,
    catalogRates,
    catalogRooms,
    categories,
    channelWarnings,
    connections,
    createConnection,
    createRateMapping,
    createRoomMapping,
    deleteConnection,
    disconnectConnection,
    error,
    externalRateId,
    externalRateRoomId,
    externalRoomId,
    filteredCatalogRates,
    fullSyncWindowDays,
    hasCatalogRates,
    hasCatalogRooms,
    inventoryInterval,
    inventoryReconciliation,
    inventoryReconciliationError,
    inventoryReconciliationLoading,
    inventoryRowResults,
    inventoryRowResultsError,
    inventoryRowResultsLoading,
    latestInventorySyncLog,
    loadBackgroundJobs,
    loadData,
    loadProviderCatalog,
    loadSyncLogs,
    loadWebhookEvents,
    loading,
    mappingHealth,
    nextSetupAction,
    pauseConnection,
    pendingAction,
    parsedProviderCheckStatuses,
    persistedSetupStatus,
    priceModelOptions,
    properties,
    propertyActivationPriceModelId,
    propertyId,
    providerPriceModelsError,
    providerPriceModelsLoading,
    providerReservationEventOptions,
    providerReservationEventStatus,
    providerReservationId,
    providerCatalog,
    ratePlanId,
    ratePlans,
    ratesInterval,
    reactivateProperty,
    runInventorySync,
    runFullInventorySync,
    runFullRatesSync,
    runPropertyCheck,
    runRatesSync,
    refreshInventoryReconciliation,
    reservationImportInterval,
    resumeConnection,
    resyncInventoryDriftWindow,
    retryFailedInventoryRows,
    roomCategoryId,
    saveAutomationSettings,
    scopedCategories,
    scopedRatePlans,
    selectedConnection,
    selectedConnectionId,
    selectedPropertyId,
    selectedPropertyScopeId,
    selectedRoomMappingForRatePlan,
    selectConnection,
    setAutomationEnabled,
    setCatalogConnectionId,
    setCatalogLoaded,
    setExternalRateId,
    setExternalRateRoomId,
    setExternalRoomId,
    setInventoryInterval,
    setPropertyId,
    setProviderReservationEventStatus,
    setProviderReservationId,
    setRatePlanId,
    setRatesInterval,
    setReservationImportInterval,
    setRoomCategoryId,
    setSelectedConnectionId,
    setSyncWindowDays,
    setZodomusOtaKey,
    setZodomusPriceModelId,
    setZodomusPropertyId,
    status,
    submitProviderReservationEvent,
    syncLogs,
    syncLogsError,
    syncLogsLoading,
    syncGuidance,
    syncWindowDays,
    setupRunbook,
    webhookEvents,
    webhookEventsError,
    webhookEventsLoading,
    zodomusConnections,
    zodomusOtaKey,
    zodomusOtaOptions,
    zodomusPriceModelId,
    zodomusPropertyId,
  };
}

export type ChannelWorkspace = ReturnType<typeof useChannelWorkspace>;
