import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatConnectionLabel } from './ChannelUi';

const zodomusOtaOptions = [
  { key: 'BOOKING_COM', label: 'Booking.com' },
  { key: 'EXPEDIA', label: 'Expedia' },
  { key: 'AIRBNB', label: 'Airbnb' },
] as const;

type ZodomusOtaKey = (typeof zodomusOtaOptions)[number]['key'];
const providerReservationEventOptions = ['new', 'modified', 'cancelled'] as const;
type ProviderReservationEventStatus = (typeof providerReservationEventOptions)[number];
type QueuedWorkResponse = {
  queued?: boolean;
  job_id?: string | null;
  sync_log_id?: string | null;
  id?: string;
  status?: string;
  error_message?: string | null;
  last_error?: string | null;
};

const fallbackZodomusPriceModels: ChannelProviderPriceModel[] = [
  { id: 1, model: 'Maximum / Single occupancy' },
  { id: 2, model: 'Derived pricing' },
  { id: 3, model: 'Occupancy' },
  { id: 4, model: 'Per day' },
  { id: 5, model: 'Per Day Length of stay' },
];

type UseChannelWorkspaceOptions = {
  activePropertyId?: string;
  diagnosticsEnabled?: boolean;
  enabled?: boolean;
  onPropertyChange?: (propertyId: string) => void;
  sessionKey?: string | null;
};

type ChannelWorkspaceResponse = {
  categories: RoomCategory[];
  connections: ChannelConnection[];
  properties: Property[];
  rate_plans: RatePlan[];
};

type ChannelDiagnosticsResponse = {
  background_jobs: BackgroundJob[];
  inventory_reconciliation: InventoryReconciliation;
  inventory_row_results: InventoryRowResults;
  sync_logs: ChannelSyncLog[];
  webhook_events: WebhookEvent[];
};

type ChannelWorkspaceCache = {
  automationEnabled: boolean;
  airbnbCompletedActions: string[];
  airbnbClientId: string;
  airbnbToken: string;
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
  providerPriceModelsConnectionId: string;
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
const diagnosticsCacheByKey = new Map<string, ChannelDiagnosticsResponse>();
const diagnosticsCacheUpdatedAtByKey = new Map<string, number>();
const diagnosticsRequestByKey = new Map<string, Promise<ChannelDiagnosticsResponse>>();
const syncLogsCacheByKey = new Map<string, ChannelSyncLog[]>();
const syncLogsCacheUpdatedAtByKey = new Map<string, number>();
const syncLogsRequestByKey = new Map<string, Promise<ChannelSyncLog[]>>();
const diagnosticsCacheTtlMs = 60_000;
const syncLogsCacheTtlMs = 60_000;
const statusAutoClearMs = 5000;
const queuedWorkPollIntervalMs = 2500;
const queuedWorkPollTimeoutMs = 120_000;
const selectedConnectionStorageKey = 'hms_selected_channel_connection_id';
const airbnbCompletedActionsStoragePrefix = 'hms_airbnb_completed_actions';

function readPersistedSelectedConnectionId() {
  try {
    return localStorage.getItem(selectedConnectionStorageKey) ?? '';
  } catch {
    return '';
  }
}

function persistSelectedConnectionId(connectionId: string) {
  try {
    if (connectionId) {
      localStorage.setItem(selectedConnectionStorageKey, connectionId);
      return;
    }

    localStorage.removeItem(selectedConnectionStorageKey);
  } catch {
    // Ignore storage failures so the workspace still works in restricted browser contexts.
  }
}

function airbnbCompletedActionsStorageKey(connectionId: string) {
  return `${airbnbCompletedActionsStoragePrefix}:${connectionId}`;
}

function readPersistedAirbnbCompletedActions(connectionId: string | null | undefined) {
  if (!connectionId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(airbnbCompletedActionsStorageKey(connectionId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((action): action is string => typeof action === 'string') : [];
  } catch {
    return [];
  }
}

function persistAirbnbCompletedActions(connectionId: string, actions: Iterable<string>) {
  try {
    localStorage.setItem(
      airbnbCompletedActionsStorageKey(connectionId),
      JSON.stringify(Array.from(new Set(actions))),
    );
  } catch {
    // Ignore storage failures; the in-memory state still updates for the active session.
  }
}

function buildEmptyWorkspaceCache(enabled: boolean): ChannelWorkspaceCache {
  return {
    automationEnabled: true,
    airbnbCompletedActions: [],
    airbnbClientId: '',
    airbnbToken: '',
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
    providerPriceModelsConnectionId: '',
    providerPriceModelsError: null,
    providerReservationEventStatus: 'new',
    providerReservationId: '',
    ratePlanId: '',
    ratePlans: [],
    ratesInterval: '60',
    reservationImportInterval: '5',
    roomCategoryId: '',
    selectedConnectionId: readPersistedSelectedConnectionId(),
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

function getSyncLogsCacheKey(sessionKey: string, connectionId: string) {
  return `${sessionKey}:${connectionId}`;
}

function applyDiagnosticsPayload(
  payload: ChannelDiagnosticsResponse,
  setters: {
    setBackgroundJobs: (jobs: BackgroundJob[]) => void;
    setInventoryReconciliation: (reconciliation: InventoryReconciliation) => void;
    setInventoryRowResults: (results: InventoryRowResults) => void;
    setSyncLogs: (logs: ChannelSyncLog[]) => void;
    setWebhookEvents: (events: WebhookEvent[]) => void;
  },
) {
  setters.setInventoryReconciliation(payload.inventory_reconciliation);
  setters.setInventoryRowResults(payload.inventory_row_results);
  setters.setSyncLogs(payload.sync_logs);
  setters.setWebhookEvents(payload.webhook_events);
  setters.setBackgroundJobs(payload.background_jobs);
}

export function clearChannelWorkspaceCache(sessionKey?: string | null) {
  if (sessionKey == null) {
    channelWorkspaceCacheBySession.clear();
    diagnosticsCacheByKey.clear();
    diagnosticsCacheUpdatedAtByKey.clear();
    diagnosticsRequestByKey.clear();
    syncLogsCacheByKey.clear();
    syncLogsCacheUpdatedAtByKey.clear();
    syncLogsRequestByKey.clear();
    return;
  }

  channelWorkspaceCacheBySession.delete(sessionKey);
  for (const key of diagnosticsCacheByKey.keys()) {
    if (key.startsWith(`${sessionKey}:`)) {
      diagnosticsCacheByKey.delete(key);
      diagnosticsCacheUpdatedAtByKey.delete(key);
    }
  }
  for (const key of diagnosticsCacheUpdatedAtByKey.keys()) {
    if (key.startsWith(`${sessionKey}:`)) {
      diagnosticsCacheUpdatedAtByKey.delete(key);
    }
  }
  for (const key of diagnosticsRequestByKey.keys()) {
    if (key.startsWith(`${sessionKey}:`)) {
      diagnosticsRequestByKey.delete(key);
    }
  }
  for (const key of syncLogsCacheByKey.keys()) {
    if (key.startsWith(`${sessionKey}:`)) {
      syncLogsCacheByKey.delete(key);
      syncLogsCacheUpdatedAtByKey.delete(key);
    }
  }
  for (const key of syncLogsCacheUpdatedAtByKey.keys()) {
    if (key.startsWith(`${sessionKey}:`)) {
      syncLogsCacheUpdatedAtByKey.delete(key);
    }
  }
  for (const key of syncLogsRequestByKey.keys()) {
    if (key.startsWith(`${sessionKey}:`)) {
      syncLogsRequestByKey.delete(key);
    }
  }
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

function buildAirbnbAuthorizationUrl(input: { clientId: string; environment: 'production' | 'sandbox'; token: string }) {
  const baseUrl =
    input.environment === 'production'
      ? 'https://www.airbnb.com/oauth2/auth'
      : 'https://api.zodomus.com/airbnb-oauth2-tests';
  const redirectUri =
    input.environment === 'production'
      ? 'https://api.zodomus.com/airbnb-webhook-redirect'
      : 'https://api.zodomus.com/airbnb-webhook-redirect-test';
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: redirectUri,
    scope: 'property_management,messages_read,messages_write',
    state: input.token,
  });

  return `${baseUrl}?${params.toString()}`;
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
    activePropertyId = '',
    diagnosticsEnabled = true,
    enabled = true,
    onPropertyChange,
    sessionKey = 'default',
  } = options;
  const resolvedSessionKey = sessionKey ?? 'default';
  const cachedState = getWorkspaceCache(resolvedSessionKey, enabled);
  const [connections, setConnections] = useState<ChannelConnection[]>(() => cachedState.connections);
  const [properties, setProperties] = useState<Property[]>(() => cachedState.properties);
  const [categories, setCategories] = useState<RoomCategory[]>(() => cachedState.categories);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>(() => cachedState.ratePlans);
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => cachedState.selectedConnectionId);
  const [propertyId, setPropertyIdState] = useState(activePropertyId);
  const setPropertyId = useCallback((nextPropertyId: string) => {
    setPropertyIdState(nextPropertyId);
    onPropertyChange?.(nextPropertyId);
  }, [onPropertyChange]);
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
  const [providerPriceModelsConnectionId, setProviderPriceModelsConnectionId] = useState(
    () => cachedState.providerPriceModelsConnectionId,
  );
  const [providerPriceModelsLoading, setProviderPriceModelsLoading] = useState(false);
  const [providerPriceModelsError, setProviderPriceModelsError] = useState<string | null>(
    () => cachedState.providerPriceModelsError,
  );
  const [catalogConnectionId, setCatalogConnectionId] = useState(() => cachedState.catalogConnectionId);
  const [catalogLoaded, setCatalogLoaded] = useState(() => cachedState.catalogLoaded);
  const [status, setStatus] = useState<string | null>(() => cachedState.status);
  const statusAutoClearTimerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(() => cachedState.error);
  const [certificationResponse, setCertificationResponse] = useState<{
    label: string;
    payload: unknown;
  } | null>(null);
  const [loading, setLoading] = useState(() => cachedState.loading);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [airbnbCompletedActions, setAirbnbCompletedActions] = useState<Set<string>>(
    () => new Set(cachedState.airbnbCompletedActions),
  );
  const [airbnbToken, setAirbnbToken] = useState(() => cachedState.airbnbToken);
  const [airbnbClientId, setAirbnbClientId] = useState(() => cachedState.airbnbClientId);
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

  useEffect(() => {
    if (activePropertyId && activePropertyId !== propertyId) {
      setPropertyIdState(activePropertyId);
    }
  }, [activePropertyId, propertyId]);

  useEffect(() => {
    if (statusAutoClearTimerRef.current != null) {
      window.clearTimeout(statusAutoClearTimerRef.current);
      statusAutoClearTimerRef.current = null;
    }

    if (!status) {
      return;
    }

    statusAutoClearTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusAutoClearTimerRef.current = null;
    }, statusAutoClearMs);

    return () => {
      if (statusAutoClearTimerRef.current != null) {
        window.clearTimeout(statusAutoClearTimerRef.current);
        statusAutoClearTimerRef.current = null;
      }
    };
  }, [status]);
  const selectedOtaLabel = zodomusOtaOptions.find((option) => option.key === zodomusOtaKey)?.label ?? 'OTA';
  const persistedSetupStatus = selectedConnection?.provider_config_summary?.setup_status ?? null;
  const automationSummary = selectedConnection?.provider_config_summary?.automation ?? null;
  const latestInventorySyncLog = useMemo(
    () => selectedConnection?.recent_sync_logs.find((log) => log.sync_type === 'INVENTORY') ?? null,
    [selectedConnection],
  );
  const latestRateSyncLog = useMemo(
    () => selectedConnection?.recent_sync_logs.find((log) => log.sync_type === 'RATES') ?? null,
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
  const canCancelMappedRooms = Boolean(selectedConnection && activeRoomMappings.length > 0);
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
    setProviderPriceModelsConnectionId(nextState.providerPriceModelsConnectionId);
    setProviderPriceModelsError(nextState.providerPriceModelsError);
    setCatalogConnectionId(nextState.catalogConnectionId);
    setCatalogLoaded(nextState.catalogLoaded);
    setStatus(nextState.status);
    setError(nextState.error);
    setLoading(nextState.loading);
    setAirbnbCompletedActions(new Set(nextState.airbnbCompletedActions));
    setAirbnbToken(nextState.airbnbToken);
    setAirbnbClientId(nextState.airbnbClientId);
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
      const response = await api.get<ChannelWorkspaceResponse>('/channels/workspace');
      const loadedConnections = response.data.connections;
      const loadedProperties = response.data.properties;
      const loadedCategories = response.data.categories;
      const loadedRatePlans = response.data.rate_plans;
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

  function replaceConnection(updatedConnection: ChannelConnection) {
    setConnections((current) =>
      current.map((connection) => connection.id === updatedConnection.id ? updatedConnection : connection),
    );
  }

  async function refreshConnection(connectionId: string) {
    const response = await api.get<ChannelConnection>(`/channels/${connectionId}`);
    replaceConnection(response.data);
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
      airbnbCompletedActions: Array.from(airbnbCompletedActions),
      airbnbClientId,
      airbnbToken,
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
      providerPriceModelsConnectionId,
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
    airbnbCompletedActions,
    airbnbClientId,
    airbnbToken,
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
    providerPriceModelsConnectionId,
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
    persistSelectedConnectionId(selectedConnectionId);
  }, [selectedConnectionId]);

  useEffect(() => {
    setAirbnbCompletedActions(new Set(readPersistedAirbnbCompletedActions(selectedConnectionId)));
  }, [selectedConnectionId]);

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

  function rememberCertificationResponse(label: string, payload: unknown) {
    setCertificationResponse({ label, payload });
  }

  function markAirbnbActionDone(action: string) {
    const connectionId = selectedConnection?.id;
    setAirbnbCompletedActions((current) => {
      const next = new Set(current);
      next.add(action);
      if (connectionId) {
        persistAirbnbCompletedActions(connectionId, next);
      }
      return next;
    });
  }

  function airbnbActionsForConnection(connectionId: string | null | undefined) {
    if (!connectionId) {
      return new Set<string>();
    }

    if (connectionId === selectedConnectionId) {
      return airbnbCompletedActions;
    }

    return new Set(readPersistedAirbnbCompletedActions(connectionId));
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

  async function loadSyncLogs(connectionId: string, options?: { force?: boolean }) {
    const syncLogsCacheKey = getSyncLogsCacheKey(resolvedSessionKey, connectionId);
    const cachedLogs = syncLogsCacheByKey.get(syncLogsCacheKey);
    const cachedAt = syncLogsCacheUpdatedAtByKey.get(syncLogsCacheKey) ?? 0;
    if (!options?.force && cachedLogs && Date.now() - cachedAt < syncLogsCacheTtlMs) {
      setSyncLogs(cachedLogs);
      setSyncLogsError(null);
      return;
    }

    setSyncLogsLoading(true);
    setSyncLogsError(null);
    try {
      let request = syncLogsRequestByKey.get(syncLogsCacheKey);
      if (!request || options?.force) {
        request = fetchAllPages<ChannelSyncLog>(`/channels/${connectionId}/sync-logs`);
        syncLogsRequestByKey.set(syncLogsCacheKey, request);
      }
      const logs = await request;
      setSyncLogs(logs);
      syncLogsCacheByKey.set(syncLogsCacheKey, logs);
      syncLogsCacheUpdatedAtByKey.set(syncLogsCacheKey, Date.now());
      updateCachedSyncLogs(connectionId, logs);
    } catch (loadError) {
      setSyncLogsError(getApiErrorMessage(loadError));
    } finally {
      syncLogsRequestByKey.delete(syncLogsCacheKey);
      setSyncLogsLoading(false);
    }
  }

  function updateCachedSyncLogs(connectionId: string, logs: ChannelSyncLog[]) {
    const diagnosticsCacheKey = getDiagnosticsCacheKey(resolvedSessionKey, connectionId, selectedPropertyScopeId);
    const cachedDiagnostics = diagnosticsCacheByKey.get(diagnosticsCacheKey);
    if (!cachedDiagnostics) {
      return;
    }

    diagnosticsCacheByKey.set(diagnosticsCacheKey, { ...cachedDiagnostics, sync_logs: logs });
    diagnosticsCacheUpdatedAtByKey.set(diagnosticsCacheKey, Date.now());
    const syncLogsCacheKey = getSyncLogsCacheKey(resolvedSessionKey, connectionId);
    syncLogsCacheByKey.set(syncLogsCacheKey, logs);
    syncLogsCacheUpdatedAtByKey.set(syncLogsCacheKey, Date.now());
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

  async function loadDiagnostics(connectionId: string) {
    const diagnosticsCacheKey = getDiagnosticsCacheKey(
      resolvedSessionKey,
      connectionId,
      selectedPropertyScopeId,
    );
    setInventoryReconciliationLoading(true);
    setInventoryRowResultsLoading(true);
    setSyncLogsLoading(true);
    setWebhookEventsLoading(true);
    setBackgroundJobsLoading(true);
    setInventoryReconciliationError(null);
    setInventoryRowResultsError(null);
    setSyncLogsError(null);
    setWebhookEventsError(null);
    setBackgroundJobsError(null);
    try {
      let request = diagnosticsRequestByKey.get(diagnosticsCacheKey);
      if (!request) {
        request = api
          .get<ChannelDiagnosticsResponse>(`/channels/${connectionId}/diagnostics`)
          .then((response) => response.data);
        diagnosticsRequestByKey.set(diagnosticsCacheKey, request);
      }
      const diagnostics = await request;
      diagnosticsCacheByKey.set(diagnosticsCacheKey, diagnostics);
      diagnosticsCacheUpdatedAtByKey.set(diagnosticsCacheKey, Date.now());
      applyDiagnosticsPayload(diagnostics, {
        setBackgroundJobs,
        setInventoryReconciliation,
        setInventoryRowResults,
        setSyncLogs,
        setWebhookEvents,
      });
    } catch (loadError) {
      const message = getApiErrorMessage(loadError);
      setInventoryReconciliationError(message);
      setInventoryRowResultsError(message);
      setSyncLogsError(message);
      setWebhookEventsError(message);
      setBackgroundJobsError(message);
    } finally {
      diagnosticsRequestByKey.delete(diagnosticsCacheKey);
      setInventoryReconciliationLoading(false);
      setInventoryRowResultsLoading(false);
      setSyncLogsLoading(false);
      setWebhookEventsLoading(false);
      setBackgroundJobsLoading(false);
    }
  }

  async function waitForQueuedWork(
    connectionId: string,
    payload: QueuedWorkResponse,
    messages: {
      queued: string;
      processing: string;
      success: string;
      partial?: string;
      failure: string;
      timeout: string;
    },
  ) {
    const syncLogId = payload.sync_log_id ?? (payload.status && payload.id ? payload.id : null);
    const jobId = payload.job_id ?? null;

    if (!syncLogId && !jobId) {
      return;
    }

    setStatus(messages.queued);
    const startedAt = Date.now();
    while (Date.now() - startedAt < queuedWorkPollTimeoutMs) {
      await wait(queuedWorkPollIntervalMs);

      if (syncLogId) {
        const logs = await fetchAllPages<ChannelSyncLog>(`/channels/${connectionId}/sync-logs`);
        setSyncLogs(logs);
        updateCachedSyncLogs(connectionId, logs);
        const syncLog = logs.find((log) => log.id === syncLogId);

        if (!syncLog || syncLog.status === 'QUEUED') {
          setStatus(messages.processing);
          continue;
        }

        if (syncLog.status === 'SUCCEEDED') {
          setStatus(messages.success);
          return;
        }

        if (syncLog.status === 'PARTIAL_FAILED') {
          setStatus(messages.partial ?? messages.failure);
          throw new Error(syncLog.error_message ?? messages.partial ?? messages.failure);
        }

        throw new Error(syncLog.error_message ?? messages.failure);
      }

      if (jobId) {
        const jobs = await fetchAllPages<BackgroundJob>('/background-jobs');
        const filteredJobs = jobs.filter((job) =>
          selectedPropertyScopeId ? job.property_id === selectedPropertyScopeId || job.entity_id === connectionId : true,
        );
        setBackgroundJobs(filteredJobs);
        const job = jobs.find((entry) => entry.id === jobId);

        if (!job || job.status === 'PENDING' || job.status === 'PROCESSING') {
          setStatus(messages.processing);
          continue;
        }

        if (job.status === 'SUCCEEDED') {
          setStatus(messages.success);
          return;
        }

        throw new Error(job.last_error ?? messages.failure);
      }
    }

    setStatus(messages.timeout);
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function loadProviderPriceModels(connectionId: string) {
    if (providerPriceModelsConnectionId === connectionId && providerPriceModels.length > 0) {
      return;
    }

    setProviderPriceModelsLoading(true);
    setProviderPriceModelsError(null);
    try {
      const response = await api.get<ChannelProviderPriceModels>(`/channels/${connectionId}/provider-price-models`);
      const models = extractPriceModels(response.data);
      setProviderPriceModels(models.length > 0 ? models : fallbackZodomusPriceModels);
      setProviderPriceModelsConnectionId(connectionId);
    } catch (loadError) {
      setProviderPriceModels(fallbackZodomusPriceModels);
      setProviderPriceModelsConnectionId(connectionId);
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
    const cachedDiagnostics = diagnosticsCacheByKey.get(diagnosticsCacheKey);
    const cachedAt = diagnosticsCacheUpdatedAtByKey.get(diagnosticsCacheKey) ?? 0;
    if (cachedDiagnostics && Date.now() - cachedAt < diagnosticsCacheTtlMs) {
      applyDiagnosticsPayload(cachedDiagnostics, {
        setBackgroundJobs,
        setInventoryReconciliation,
        setInventoryRowResults,
        setSyncLogs,
        setWebhookEvents,
      });
      setInventoryReconciliationError(null);
      setInventoryRowResultsError(null);
      setSyncLogsError(null);
      setWebhookEventsError(null);
      setBackgroundJobsError(null);
      return;
    }

    void loadDiagnostics(selectedConnectionId);
  }, [diagnosticsEnabled, enabled, resolvedSessionKey, selectedConnectionId, selectedPropertyScopeId]);

  function selectConnection(connectionId: string) {
    if (connectionId === selectedConnectionId) {
      setStatus(null);
      setError(null);
      return;
    }

    setSelectedConnectionId(connectionId);
    setCatalogConnectionId('');
    setCatalogLoaded(false);
    setProviderCatalog(null);
    setProviderPriceModels([]);
    setProviderPriceModelsConnectionId('');
    setProviderPriceModelsError(null);
    setExternalRoomId('');
    setExternalRateId('');
    setExternalRateRoomId('');
    setRoomCategoryId('');
    setRatePlanId('');
    setStatus(null);
    setError(null);
  }

  function selectZodomusOtaKey(nextOtaKey: ZodomusOtaKey) {
    setZodomusOtaKey((current) => {
      if (current !== nextOtaKey) {
        setZodomusPropertyId('');
        setZodomusPriceModelId(String(defaultPriceModelIdForOta(nextOtaKey)));
      }

      return nextOtaKey;
    });
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
      setCatalogConnectionId(response.data.catalog ? response.data.connection.id : '');
      setCatalogLoaded(response.data.setup_status.catalog_loaded);
      setZodomusPropertyId('');
      setStatus(`${selectedProperty ? selectedProperty.name : 'Property'} connection saved for ${selectedOtaLabel}. Run certification steps next.`);
      await loadProviderPriceModels(response.data.connection.id);
      await loadData();
      setSelectedConnectionId(response.data.connection.id);
    });
  }

  async function fetchProviderChannels() {
    if (!selectedConnection) return;
    await runAction('provider-channels', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/provider-channels`);
      rememberCertificationResponse('Get channels', response.data);
      setStatus('Zodomus channels fetched.');
    });
  }

  async function fetchProviderPriceModels() {
    if (!selectedConnection) return;
    await runAction('provider-price-models', async () => {
      const response = await api.get<ChannelProviderPriceModels>(`/channels/${selectedConnection.id}/provider-price-models`);
      const models = extractPriceModels(response.data);
      setProviderPriceModels(models.length > 0 ? models : fallbackZodomusPriceModels);
      setProviderPriceModelsConnectionId(selectedConnection.id);
      rememberCertificationResponse('Get price models', response.data);
      setStatus('Zodomus price models fetched.');
    });
  }

  async function activateAirbnbHost() {
    if (!selectedConnection) return;
    await runAction('airbnb-host-activation', async () => {
      const response = await api.post(`/channels/${selectedConnection.id}/airbnb-host-activation`);
      rememberCertificationResponse('Airbnb host activation', response.data);
      markAirbnbActionDone('airbnb-host-activation');
      setStatus('Airbnb host activation request sent.');
    });
  }

  async function activateAirbnbOauthTest() {
    if (!selectedConnection) return;
    const token = airbnbToken.trim();
    const clientId = airbnbClientId.trim();
    if (!token || !clientId) {
      setError('Airbnb token and client ID are required to open the authorization URL.');
      return;
    }

    await runAction('airbnb-oauth2-tests', async () => {
      const environment = selectedConnection.provider_config_summary?.environment === 'production' ? 'production' : 'sandbox';
      const authUrl = buildAirbnbAuthorizationUrl({
        clientId,
        environment,
        token,
      });
      rememberCertificationResponse('Airbnb authorization URL', {
        auth_url: authUrl,
        client_id: clientId,
        environment,
        redirect_uri:
          environment === 'production'
            ? 'https://api.zodomus.com/airbnb-webhook-redirect'
            : 'https://api.zodomus.com/airbnb-webhook-redirect-test',
        scope: 'property_management,messages_read,messages_write',
        state: token,
      });
      window.open(authUrl, '_blank', 'noopener,noreferrer');
      markAirbnbActionDone('airbnb-oauth2-tests');
      setStatus('Airbnb authorization URL opened.');
    });
  }

  async function fetchAirbnbHostStatus() {
    if (!selectedConnection) return;
    const token = airbnbToken.trim();
    if (!token) {
      setError('Airbnb token is required to check host status.');
      return;
    }

    await runAction('airbnb-host-status', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/airbnb-host-status`, {
        params: { token },
      });
      rememberCertificationResponse('Airbnb host status', response.data);
      markAirbnbActionDone('airbnb-host-status');
      setStatus('Airbnb host status fetched.');
    });
  }

  async function fetchAirbnbHostInfo() {
    if (!selectedConnection) return;
    const token = airbnbToken.trim();
    if (!token) {
      setError('Airbnb token is required to get host info.');
      return;
    }

    await runAction('airbnb-host-info', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/airbnb-host-info`, {
        params: { token },
      });
      rememberCertificationResponse('Airbnb host info', response.data);
      markAirbnbActionDone('airbnb-host-info');
      setStatus('Airbnb host info fetched.');
    });
  }

  async function cancelAirbnbHost() {
    if (!selectedConnection) return;
    const token = airbnbToken.trim();
    if (!token) {
      setError('Airbnb token is required to cancel host activation.');
      return;
    }

    await runAction('airbnb-host-cancellation', async () => {
      const response = await api.post(`/channels/${selectedConnection.id}/airbnb-host-cancellation`, { token });
      rememberCertificationResponse('Airbnb host cancellation', response.data);
      setStatus('Airbnb host cancellation request sent.');
    });
  }

  async function fetchAirbnbListings() {
    if (!selectedConnection) return;
    const token = airbnbToken.trim();
    if (!token) {
      setError('Airbnb token is required to get listings.');
      return;
    }

    await runAction('airbnb-listings', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/airbnb-listings`, {
        params: { token },
      });
      rememberCertificationResponse('Airbnb listings', response.data);
      markAirbnbActionDone('airbnb-listings');
      setStatus('Airbnb listings fetched.');
    });
  }

  async function fetchProviderAvailability() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(syncWindowDays));
    await runAction('provider-availability', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/provider-availability`, {
        params: {
          from: syncWindow.from,
          to: syncWindow.to,
        },
      });
      rememberCertificationResponse('Get availability', response.data);
      setStatus(`Availability fetched from Zodomus for ${syncWindow.from} to ${syncWindow.to}.`);
    });
  }

  async function loadProviderCatalog() {
    if (!selectedConnection) return;
    await runAction('load-provider-catalog', async () => {
      const response = await api.get<ChannelProviderCatalog>(`/channels/${selectedConnection.id}/provider-catalog`);
      setProviderCatalog(response.data);
      rememberCertificationResponse('Get rooms & rates', response.data);
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
    if (!confirmMappingChange('room')) return;
    await runAction('create-room-mapping', async () => {
      await api.post(`/channels/${selectedConnection.id}/room-mappings`, {
        room_category_id: roomCategoryId,
        external_room_id: externalRoomId,
      });
      setExternalRoomId(hasCatalogRooms ? catalogRooms[0]?.external_room_id ?? '' : '');
      setStatus('Room mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function createRoomMappingPair(input: { roomCategoryId: string; externalRoomId: string }) {
    if (!selectedConnection) return;
    if (!confirmMappingChange('room')) return;
    await runAction('create-room-mapping', async () => {
      await api.post(`/channels/${selectedConnection.id}/room-mappings`, {
        room_category_id: input.roomCategoryId,
        external_room_id: input.externalRoomId,
      });
      setRoomCategoryId(input.roomCategoryId);
      setExternalRoomId(input.externalRoomId);
      setStatus('Room mapping saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function saveRoomMappingsBatch(input: Array<{ roomCategoryId: string; externalRoomId: string }>) {
    if (!selectedConnection || input.length === 0) return;
    if (!confirmMappingChange('room')) return;
    await runAction('create-room-mapping', async () => {
      await api.post(`/channels/${selectedConnection.id}/mappings/batch`, {
        room_mappings: input.map((mapping) => ({
          room_category_id: mapping.roomCategoryId,
          external_room_id: mapping.externalRoomId,
        })),
      });
      setStatus('Room mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function updateRoomMapping(mappingId: string, input: { externalRoomId: string }) {
    if (!selectedConnection) return;
    if (!confirmMappingChange('room')) return;
    await runAction('update-room-mapping', async () => {
      await api.patch(`/channels/${selectedConnection.id}/room-mappings/${mappingId}`, {
        external_room_id: input.externalRoomId,
      });
      setStatus('Room mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function deleteRoomMapping(mappingId: string) {
    if (!selectedConnection) return;
    if (!window.confirm('Delete this room mapping?')) return;
    if (!confirmMappingChange('room')) return;
    await runAction('delete-room-mapping', async () => {
      await api.delete(`/channels/${selectedConnection.id}/room-mappings/${mappingId}`);
      setStatus('Room mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function createRateMapping(event: FormEvent) {
    event.preventDefault();
    if (!selectedConnection) return;
    if (!confirmMappingChange('rate')) return;
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
      setStatus('Rate mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function saveRateMappingsBatch(input: Array<{ ratePlanId: string; externalRoomId: string; externalRateId: string }>) {
    if (!selectedConnection || input.length === 0) return;
    if (!confirmMappingChange('rate')) return;
    await runAction('create-rate-mapping', async () => {
      await api.post(`/channels/${selectedConnection.id}/mappings/batch`, {
        rate_mappings: input.map((mapping) => ({
          rate_plan_id: mapping.ratePlanId,
          external_room_id: mapping.externalRoomId,
          external_rate_id: mapping.externalRateId,
        })),
      });
      setStatus('Rate mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function updateRateMapping(mappingId: string, input: { externalRoomId: string; externalRateId: string }) {
    if (!selectedConnection) return;
    if (!confirmMappingChange('rate')) return;
    await runAction('update-rate-mapping', async () => {
      await api.patch(`/channels/${selectedConnection.id}/rate-mappings/${mappingId}`, {
        external_room_id: input.externalRoomId,
        external_rate_id: input.externalRateId,
      });
      setStatus('Rate mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  async function deleteRateMapping(mappingId: string) {
    if (!selectedConnection) return;
    if (!window.confirm('Delete this rate mapping?')) return;
    if (!confirmMappingChange('rate')) return;
    await runAction('delete-rate-mapping', async () => {
      await api.delete(`/channels/${selectedConnection.id}/rate-mappings/${mappingId}`);
      setStatus('Rate mappings are saved.');
      await refreshConnection(selectedConnection.id);
    });
  }

  function confirmMappingChange(mappingType: 'room' | 'rate') {
    if (!selectedConnection) return false;
    const hasLiveSignals =
      Boolean(selectedConnection.provider_config_summary?.setup_status.ready) ||
      Boolean(selectedConnection.provider_config_summary?.setup_status.rooms_activated) ||
      selectedConnection.recent_sync_logs.length > 0;

    if (!hasLiveSignals) {
      return true;
    }

    return window.confirm(
      `Save this ${mappingType} mapping for ${formatConnectionLabel(selectedConnection)}? This connection already has activation or sync history, so run room activation/property check and a fresh sync after changing mappings.`,
    );
  }

  async function activateMappedRooms() {
    if (!selectedConnection) return;
    await runAction('activate-mapped-rooms', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/rooms-activate`);
      rememberCertificationResponse('Activate rooms/rates', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Room activation queued.',
        processing: 'Room activation is still processing...',
        success: 'Mapped rooms and rates activated in Zodomus. Run property check before syncing.',
        failure: 'Room activation failed.',
        timeout: 'Room activation is still processing. Check background jobs for the final result.',
      });
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function cancelMappedRooms() {
    if (!selectedConnection) return;

    const rooms = Array.from(
      new Set(
        selectedConnection.room_mappings
          .map((mapping) => mapping.external_room_id.trim())
          .filter(Boolean),
      ),
    ).map((roomId) => ({ roomId }));

    if (rooms.length === 0) {
      setError('No mapped Zodomus room IDs are available to cancel.');
      return;
    }

    await runAction('cancel-mapped-rooms', async () => {
      const response = await api.post(`/channels/${selectedConnection.id}/rooms-cancellation`, { rooms });
      rememberCertificationResponse('Cancel room associations', response.data);
      setStatus('Mapped room associations cancelled in Zodomus. Run property check before syncing again.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function runPropertyCheck() {
    if (!selectedConnection) return;
    await runAction('property-check', async () => {
      const response = await api.post(`/channels/${selectedConnection.id}/property-check`);
      rememberCertificationResponse('Property check', response.data);
      setStatus('Property check completed.');
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function reactivateProperty() {
    if (!selectedConnection) return;
    if (!window.confirm(`Re-activate ${selectedConnection.name} in Zodomus? Use this when provider-side onboarding or approval has changed.`)) return;
    await runAction('property-activate', async () => {
      const isAirbnb =
        selectedConnection.provider_config_summary?.channel_id === '3' ||
        selectedConnection.provider_config_summary?.ota_name?.toLowerCase().includes('airbnb');
      const response = await api.post(`/channels/${selectedConnection.id}/property-activate`, {
        price_model_id: propertyActivationPriceModelId,
        ...(isAirbnb && airbnbToken.trim() ? { token: airbnbToken.trim() } : {}),
      });
      rememberCertificationResponse('Activate property', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Property activation queued.',
        processing: 'Property activation is still processing...',
        success: 'Property activation completed.',
        failure: 'Property activation failed.',
        timeout: 'Property activation is still processing. Check background jobs for the final result.',
      });
      await loadData();
      setSelectedConnectionId(selectedConnection.id);
    });
  }

  async function fetchReservationSummary() {
    if (!selectedConnection) return;
    await runAction('provider-reservations-summary', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/provider-reservations-summary`);
      rememberCertificationResponse('Reservation summary', response.data);
      setStatus('Reservation summary fetched from Zodomus.');
    });
  }

  async function fetchReservationQueue() {
    if (!selectedConnection) return;
    await runAction('provider-reservations-queue', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/provider-reservations-queue`);
      rememberCertificationResponse('Reservation queue', response.data);
      setStatus('Reservation queue fetched from Zodomus.');
    });
  }

  async function fetchProviderReservationDetail() {
    if (!selectedConnection) return;
    const trimmedReservationId = providerReservationId.trim();
    if (!trimmedReservationId) {
      setError('Reservation ID is required to fetch reservation detail.');
      return;
    }

    await runAction('provider-reservation-detail', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/provider-reservations/${encodeURIComponent(trimmedReservationId)}`);
      rememberCertificationResponse('Get reservation', response.data);
      setStatus(`Reservation ${trimmedReservationId} detail fetched from Zodomus.`);
    });
  }

  async function fetchProviderReservationCard() {
    if (!selectedConnection) return;
    const trimmedReservationId = providerReservationId.trim();
    if (!trimmedReservationId) {
      setError('Reservation ID is required to fetch reservation card data.');
      return;
    }

    await runAction('provider-reservation-card', async () => {
      const response = await api.get(`/channels/${selectedConnection.id}/provider-reservations/${encodeURIComponent(trimmedReservationId)}/card`);
      rememberCertificationResponse('Get card data', response.data);
      setStatus(`Reservation ${trimmedReservationId} card data fetched from Zodomus.`);
    });
  }

  async function runReservationImportSync() {
    if (!selectedConnection) return;
    await runAction('reservation-import-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'BOOKINGS',
      });
      rememberCertificationResponse('Import bookings sync', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Reservation import queued.',
        processing: 'Reservation import is still processing...',
        success: 'Reservation import completed.',
        partial: 'Reservation import partially failed.',
        failure: 'Reservation import failed.',
        timeout: 'Reservation import is still processing. Check sync logs for the final result.',
      });
      await loadData();
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function runAvailabilityMultipleSync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(syncWindowDays));
    await runAction('availability-multiple-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/availability-multiple`, {
        sync_type: 'INVENTORY',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      rememberCertificationResponse('Post availability multiple', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: `Availability sync queued for ${syncWindow.from} to ${syncWindow.to}.`,
        processing: 'Availability sync is still processing...',
        success: `Availability sync completed for ${syncWindow.from} to ${syncWindow.to}.`,
        partial: 'Availability sync partially failed.',
        failure: 'Availability sync failed.',
        timeout: 'Availability sync is still processing. Check sync logs for the final result.',
      });
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function runRatesMultipleSync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(syncWindowDays));
    await runAction('rates-multiple-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/rates-multiple`, {
        sync_type: 'RATES',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      rememberCertificationResponse('Post rates multiple', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: `Rates sync queued for ${syncWindow.from} to ${syncWindow.to}.`,
        processing: 'Rates sync is still processing...',
        success: `Rates sync completed for ${syncWindow.from} to ${syncWindow.to}.`,
        partial: 'Rates sync partially failed.',
        failure: 'Rates sync failed.',
        timeout: 'Rates sync is still processing. Check sync logs for the final result.',
      });
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function deleteConnection(connectionId = selectedConnection?.id) {
    if (!connectionId) return;
    await runAction('delete-connection', async () => {
      await api.delete(`/channels/${connectionId}`);
      setProviderCatalog(null);
      setCatalogConnectionId('');
      setCatalogLoaded(false);
      setExternalRoomId('');
      setExternalRateId('');
      setExternalRateRoomId('');
      setRoomCategoryId('');
      setRatePlanId('');
      if (selectedConnection?.id === connectionId) setSelectedConnectionId('');
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

  async function runInventorySync(windowDaysOverride?: number) {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(windowDaysOverride ?? syncWindowDays));
    await runAction('inventory-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'INVENTORY',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      rememberCertificationResponse('Post availability', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: `Inventory sync queued for ${syncWindow.from} to ${syncWindow.to}.`,
        processing: 'Inventory sync is still processing...',
        success: `Inventory sync completed for ${syncWindow.from} to ${syncWindow.to}.`,
        partial: 'Inventory sync partially failed.',
        failure: 'Inventory sync failed.',
        timeout: 'Inventory sync is still processing. Check sync logs for the final result.',
      });
      await loadData({ background: true });
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function runRatesSync(windowDaysOverride?: number) {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(windowDaysOverride ?? syncWindowDays));
    await runAction('rates-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'RATES',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      rememberCertificationResponse('Post rates', response.data);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: `Rates sync queued for ${syncWindow.from} to ${syncWindow.to}.`,
        processing: 'Rates sync is still processing...',
        success: `Rates sync completed for ${syncWindow.from} to ${syncWindow.to}.`,
        partial: 'Rates sync partially failed.',
        failure: 'Rates sync failed.',
        timeout: 'Rates sync is still processing. Check sync logs for the final result.',
      });
      await loadData({ background: true });
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function runFullInventorySync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(fullSyncWindowDays));
    if (!window.confirm(`Queue full inventory sync for ${syncWindow.from} to ${syncWindow.to}?`)) return;
    await runAction('full-inventory-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'INVENTORY',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: `Full inventory sync queued for ${syncWindow.from} to ${syncWindow.to}.`,
        processing: 'Full inventory sync is still processing...',
        success: `Full inventory sync completed for ${syncWindow.from} to ${syncWindow.to}.`,
        partial: 'Full inventory sync partially failed.',
        failure: 'Full inventory sync failed.',
        timeout: 'Full inventory sync is still processing. Check sync logs for the final result.',
      });
      await loadData({ background: true });
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function runFullRatesSync() {
    if (!selectedConnection) return;
    const syncWindow = buildSyncWindow(Number(fullSyncWindowDays));
    if (!window.confirm(`Queue full rates sync for ${syncWindow.from} to ${syncWindow.to}?`)) return;
    await runAction('full-rates-sync', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'RATES',
        from: syncWindow.from,
        to: syncWindow.to,
      });
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: `Full rates sync queued for ${syncWindow.from} to ${syncWindow.to}.`,
        processing: 'Full rates sync is still processing...',
        success: `Full rates sync completed for ${syncWindow.from} to ${syncWindow.to}.`,
        partial: 'Full rates sync partially failed.',
        failure: 'Full rates sync failed.',
        timeout: 'Full rates sync is still processing. Check sync logs for the final result.',
      });
      await loadData({ background: true });
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function backfillExistingReservations() {
    if (!selectedConnection) return;
    await runAction('reservations-summary-backfill', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/reservations-summary-backfill`);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Future reservation backfill queued.',
        processing: 'Future reservation backfill is still processing...',
        success: 'Future reservation backfill completed.',
        partial: 'Future reservation backfill partially failed.',
        failure: 'Future reservation backfill failed.',
        timeout: 'Future reservation backfill is still processing. Check sync logs for the final result.',
      });
      await loadData();
      await loadSyncLogs(selectedConnection.id, { force: true });
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
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync`, {
        sync_type: 'INVENTORY',
        from: comparedWindow.from,
        to: comparedWindow.to,
      });
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Inventory re-sync queued for the compared window.',
        processing: 'Inventory re-sync is still processing...',
        success: 'Inventory re-sync completed for the compared window.',
        partial: 'Inventory re-sync partially failed.',
        failure: 'Inventory re-sync failed.',
        timeout: 'Inventory re-sync is still processing. Check sync logs for the final result.',
      });
      await loadData();
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function retryFailedInventoryRows() {
    if (!selectedConnection || !latestInventorySyncLog) return;
    await runAction('retry-failed-inventory-rows', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync-logs/${latestInventorySyncLog.id}/retry-failed-rows`);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Retry for failed inventory rows queued.',
        processing: 'Failed inventory row retry is still processing...',
        success: 'Failed inventory row retry completed.',
        partial: 'Failed inventory row retry partially failed.',
        failure: 'Failed inventory row retry failed.',
        timeout: 'Failed inventory row retry is still processing. Check sync logs for the final result.',
      });
      await loadData();
      await loadInventoryReconciliation(selectedConnection.id);
      await loadInventoryRowResults(selectedConnection.id);
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function retryFailedRateRows() {
    if (!selectedConnection || !latestRateSyncLog) return;
    await runAction('retry-failed-rate-rows', async () => {
      const response = await api.post<QueuedWorkResponse>(`/channels/${selectedConnection.id}/sync-logs/${latestRateSyncLog.id}/retry-failed-rows`);
      await waitForQueuedWork(selectedConnection.id, response.data, {
        queued: 'Retry for failed rate rows queued.',
        processing: 'Failed rate row retry is still processing...',
        success: 'Failed rate row retry completed.',
        partial: 'Failed rate row retry partially failed.',
        failure: 'Failed rate row retry failed.',
        timeout: 'Failed rate row retry is still processing. Check sync logs for the final result.',
      });
      await loadData();
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  async function submitProviderReservationEvent(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedConnection) return;

    const trimmedReservationId = providerReservationId.trim();
    if (providerReservationEventStatus !== 'new' && !trimmedReservationId) {
      setError('Reservation ID is required for modified or cancelled provider events.');
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
      await loadSyncLogs(selectedConnection.id, { force: true });
    });
  }

  return {
    automationEnabled,
    airbnbClientId,
    airbnbCompletedActions,
    airbnbActionsForConnection,
    airbnbToken,
    activateMappedRooms,
    activateAirbnbHost,
    activateAirbnbOauthTest,
    backfillExistingReservations,
    backgroundJobs,
    backgroundJobsError,
    backgroundJobsLoading,
    canActivateMappedRooms,
    canCancelMappedRooms,
    canLoadCatalog,
    canMap,
    cancelAirbnbHost,
    cancelMappedRooms,
    catalogConnectionId,
    catalogLoaded,
    catalogRates,
    catalogRooms,
    categories,
    certificationResponse,
    channelWarnings,
    clearStatus: () => setStatus(null),
    connections,
    createConnection,
    createRateMapping,
    createRoomMapping,
    createRoomMappingPair,
    saveRoomMappingsBatch,
    saveRateMappingsBatch,
    updateRoomMapping,
    updateRateMapping,
    deleteRoomMapping,
    deleteRateMapping,
    deleteConnection,
    disconnectConnection,
    error,
    externalRateId,
    externalRateRoomId,
    externalRoomId,
    fetchAirbnbHostInfo,
    fetchAirbnbHostStatus,
    fetchAirbnbListings,
    fetchProviderChannels,
    fetchProviderAvailability,
    fetchProviderPriceModels,
    fetchProviderReservationCard,
    fetchProviderReservationDetail,
    fetchReservationQueue,
    fetchReservationSummary,
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
    latestRateSyncLog,
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
    runReservationImportSync,
    runAvailabilityMultipleSync,
    runRatesMultipleSync,
    refreshInventoryReconciliation,
    reservationImportInterval,
    resumeConnection,
    resyncInventoryDriftWindow,
    retryFailedInventoryRows,
    retryFailedRateRows,
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
    setAirbnbClientId,
    setAirbnbToken,
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
    setZodomusOtaKey: selectZodomusOtaKey,
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
