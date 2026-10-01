import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { ChannelProvider, ChannelSyncType, Prisma } from '@prisma/client';

export type ChannelPayload = {
  provider: ChannelProvider;
  sync_type: ChannelSyncType;
  property_id: string;
  external_hotel_id?: string | null;
  credentials?: unknown;
  from?: string;
  to?: string;
  price_model_id?: number;
  inventory?: unknown;
  rates?: unknown;
  reservation_import?: unknown;
};

export type ChannelConnectionValidationPayload = {
  provider: ChannelProvider;
  external_hotel_id?: string | null;
  credentials?: unknown;
};

export type ChannelCatalogPayload = {
  provider: ChannelProvider;
  external_hotel_id?: string | null;
  credentials?: unknown;
};

export type ChannelPropertyActionPayload = {
  provider: ChannelProvider;
  external_hotel_id?: string | null;
  credentials?: unknown;
  price_model_id?: number;
  token?: string;
  rooms?: unknown;
};

export type ChannelReservationActionPayload = {
  provider: ChannelProvider;
  external_hotel_id?: string | null;
  credentials?: unknown;
  reservation_id?: string;
  status?: string;
};

export type ChannelConnectionConfigInput = {
  provider: ChannelProvider;
  credentials?: unknown;
};

export type NormalizedChannelConnectionConfig = {
  credentials?: Record<string, unknown>;
  shouldValidate: boolean;
  auditOtaName: string | null;
};

export type ChannelProviderSetupInput = {
  provider: ChannelProvider;
  property_id: string;
  external_hotel_id: string;
  options?: Record<string, unknown>;
};

export type ChannelProviderSetupPlan = {
  property_id: string;
  provider: ChannelProvider;
  name: string;
  external_hotel_id: string;
  credentials: Record<string, unknown>;
  response: {
    catalog: null;
    setup_status: Record<string, unknown>;
    provider_responses: Record<string, unknown>;
  };
};

export type ChannelSetupStatusSummary = {
  checked: boolean;
  activated: boolean;
  rooms_activated: boolean;
  catalog_loaded: boolean;
  ready: boolean;
  disconnected: boolean;
  checked_at: string | null;
  activated_at: string | null;
  rooms_activated_at: string | null;
  catalog_loaded_at: string | null;
  ready_at: string | null;
  disconnected_at: string | null;
  price_model_id: number | null;
  last_check_message: string | null;
  last_check_code: string | number | null;
  last_activation_message: string | null;
  last_activation_code: string | number | null;
  last_rooms_activation_message: string | null;
  last_rooms_activation_code: string | number | null;
  last_disconnect_message: string | null;
  last_disconnect_code: string | number | null;
  activated_room_count: number;
  catalog_room_count: number;
  catalog_rate_count: number;
};

export type ChannelAutomationConfigSummary = {
  enabled: boolean;
  inventory_interval_minutes: number;
  rates_interval_minutes: number;
  bookings_interval_minutes: number;
  sync_window_days: number;
  full_sync_window_days: number;
};

export type ChannelProviderConfigSummary = {
  channel_id: string | null;
  ota_name: string | null;
  environment: string | null;
  setup_status: ChannelSetupStatusSummary;
  automation: ChannelAutomationConfigSummary;
} | null;

export type ChannelProviderCapabilities = {
  automation: boolean;
  roomActivation: boolean;
  roomCancellation: boolean;
  reservationSummaryBackfill: boolean;
};

export type ChannelConnectionProviderContext = {
  provider: ChannelProvider;
  externalHotelId: string | null;
  credentials: Prisma.JsonValue | null;
};

type ZodomusOtaKey = 'BOOKING_COM' | 'EXPEDIA' | 'AIRBNB';
type ZodomusAppCredentials = {
  environment: 'sandbox' | 'production';
  [key: string]: unknown;
};
type ZodomusConnectionConfig = {
  channel_code: string;
  ota_key: ZodomusOtaKey;
  ota_name: string;
};

export interface ChannelAdapter {
  validateConnection(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  fetchCatalog(payload: ChannelCatalogPayload): Promise<Prisma.InputJsonObject>;
  checkProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  activateProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  activateRooms(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  cancelRooms(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  disconnectProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  getAccount(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getChannels(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getCurrencies(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getPriceModels(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getReservationsQueue(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
  getReservation(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
  getReservationCC(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
  getReservationsSummary(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
  createTestReservation(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
  push(payload: ChannelPayload): Promise<Prisma.InputJsonObject>;
}

class MockChannelAdapter implements ChannelAdapter {
  async validateConnection(payload: ChannelConnectionValidationPayload) {
    return {
      provider: payload.provider,
      accepted: true,
      message: 'Mock channel provider accepted connection configuration',
    };
  }

  async fetchCatalog(payload: ChannelCatalogPayload) {
    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id ?? null,
      rooms: [],
      rates: [],
      raw_payload: { message: 'Mock provider has no remote room/rate catalog.' },
    };
  }

  async checkProperty(payload: ChannelPropertyActionPayload) {
    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id ?? null,
      accepted: true,
      message: 'Mock provider accepted property check.',
    };
  }

  async activateProperty(payload: ChannelPropertyActionPayload) {
    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id ?? null,
      price_model_id: payload.price_model_id ?? null,
      accepted: true,
      message: 'Mock provider accepted property activation.',
    };
  }

  async disconnectProperty(payload: ChannelPropertyActionPayload) {
    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id ?? null,
      accepted: true,
      message: 'Mock provider accepted property disconnection.',
    };
  }

  async activateRooms(payload: ChannelPropertyActionPayload) {
    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id ?? null,
      accepted: true,
      rooms: payload.rooms ?? [],
      message: 'Mock provider accepted room activation.',
    };
  }

  async cancelRooms(payload: ChannelPropertyActionPayload) {
    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id ?? null,
      accepted: true,
      rooms: payload.rooms ?? [],
      message: 'Mock provider accepted room cancellation.',
    };
  }

  async getAccount(payload: ChannelConnectionValidationPayload) {
    return {
      provider: payload.provider,
      accepted: true,
      message: 'Mock provider has no remote account API.',
    };
  }

  async getChannels(payload: ChannelConnectionValidationPayload) {
    return {
      provider: payload.provider,
      channels: [],
      message: 'Mock provider has no remote channels API.',
    };
  }

  async getCurrencies(payload: ChannelConnectionValidationPayload) {
    return {
      provider: payload.provider,
      currencies: [],
      message: 'Mock provider has no remote currencies API.',
    };
  }

  async getPriceModels(payload: ChannelConnectionValidationPayload) {
    return {
      provider: payload.provider,
      price_models: [],
      message: 'Mock provider has no remote price models API.',
    };
  }

  async getReservationsQueue(payload: ChannelReservationActionPayload) {
    return {
      provider: payload.provider,
      reservations: [],
      external_hotel_id: payload.external_hotel_id ?? null,
      message: 'Mock provider has no reservations queue API.',
    };
  }

  async getReservation(payload: ChannelReservationActionPayload) {
    return {
      provider: payload.provider,
      reservation_id: payload.reservation_id ?? null,
      reservations: [],
      message: 'Mock provider has no reservation detail API.',
    };
  }

  async getReservationCC(payload: ChannelReservationActionPayload) {
    return {
      provider: payload.provider,
      reservation_id: payload.reservation_id ?? null,
      cards: [],
      message: 'Mock provider has no reservation card API.',
    };
  }

  async getReservationsSummary(payload: ChannelReservationActionPayload) {
    return {
      provider: payload.provider,
      reservations: [],
      external_hotel_id: payload.external_hotel_id ?? null,
      message: 'Mock provider has no reservations summary API.',
    };
  }

  async createTestReservation(payload: ChannelReservationActionPayload) {
    return {
      provider: payload.provider,
      reservation_id: payload.reservation_id ?? null,
      status: payload.status ?? null,
      accepted: true,
      message: 'Mock provider accepted test reservation creation.',
    };
  }

  async push(payload: ChannelPayload) {
    return {
      provider: payload.provider,
      external_reference: `mock-sync-${Date.now()}`,
      accepted: true,
      message: 'Mock channel provider accepted sync payload',
    };
  }
}

class ExternalChannelAdapter implements ChannelAdapter {
  constructor(private readonly provider: ChannelProvider) {}

  async validateConnection(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} connection validation requires a real provider adapter before it can be enabled.`,
    );
  }

  async fetchCatalog(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} provider catalog lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async checkProperty(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} property check requires a real provider adapter before it can be enabled.`,
    );
  }

  async activateProperty(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} property activation requires a real provider adapter before it can be enabled.`,
    );
  }

  async disconnectProperty(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} property disconnection requires a real provider adapter before it can be enabled.`,
    );
  }

  async activateRooms(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} room activation requires a real provider adapter before it can be enabled.`,
    );
  }

  async cancelRooms(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} room cancellation requires a real provider adapter before it can be enabled.`,
    );
  }

  async getAccount(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} account lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getChannels(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} channel lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getCurrencies(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} currency lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getPriceModels(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} price model lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getReservationsQueue(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} reservations queue lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getReservation(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} reservation detail lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getReservationCC(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} reservation card lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async getReservationsSummary(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} reservations summary lookup requires a real provider adapter before it can be enabled.`,
    );
  }

  async createTestReservation(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} test reservation creation requires a real provider adapter before it can be enabled.`,
    );
  }

  async push(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} sync requires signed provider API credentials, external hotel mapping, retry policy, and webhook reconciliation before live sync is enabled.`,
    );
  }
}

@Injectable()
export class ChannelProviderService {
  private readonly mockAdapter = new MockChannelAdapter();
  private zodomusAdapter: ChannelAdapter | null = null;

  normalizeConnectionConfig(input: ChannelConnectionConfigInput): NormalizedChannelConnectionConfig {
    if (input.provider === ChannelProvider.ZODOMUS) {
      const appCredentials = this.readZodomusAppCredentials();
      const connectionConfig = this.readZodomusConnectionConfig(input.credentials);
      const credentials = {
        channel_code: connectionConfig.channel_code,
        ota_key: connectionConfig.ota_key,
        ota_name: connectionConfig.ota_name,
        environment: appCredentials.environment,
        automation: this.defaultZodomusAutomationConfig(),
        setup_status: this.defaultZodomusSetupStatus(),
      };

      return {
        credentials,
        shouldValidate: true,
        auditOtaName: connectionConfig.ota_name,
      };
    }

    const credentials =
      input.credentials && typeof input.credentials === 'object' && !Array.isArray(input.credentials)
        ? ({ ...(input.credentials as Record<string, unknown>) })
        : undefined;

    return {
      credentials,
      shouldValidate: input.provider === ChannelProvider.MOCK,
      auditOtaName: typeof credentials?.ota_name === 'string' ? credentials.ota_name : null,
    };
  }

  buildSetupPlan(input: ChannelProviderSetupInput): ChannelProviderSetupPlan {
    if (input.provider !== ChannelProvider.ZODOMUS) {
      throw new NotImplementedException(`${input.provider} guided setup is not implemented yet.`);
    }

    const otaKey = this.readSetupOtaKey(input.options);
    const connectionConfig = this.readZodomusConnectionConfig({ ota_key: otaKey });
    const priceModelId = this.readOptionalNumber(input.options?.price_model_id) ?? this.defaultZodomusPriceModel(otaKey);
    this.assertValidZodomusPriceModel(connectionConfig.ota_key, priceModelId);

    return {
      property_id: input.property_id,
      provider: input.provider,
      name: `${connectionConfig.ota_name} OTA`,
      external_hotel_id: input.external_hotel_id,
      credentials: {
        ota_key: otaKey,
        setup_status: {
          checked: false,
          activated: false,
          catalog_loaded: false,
          rooms_activated: false,
          ready: false,
          disconnected: false,
          price_model_id: priceModelId,
        },
      },
      response: {
        catalog: null,
        setup_status: {
          checked: false,
          activated: false,
          catalog_loaded: false,
          rooms_activated: false,
          ready: false,
          price_model_id: priceModelId,
          ota_name: connectionConfig.ota_name,
        },
        provider_responses: {
          account: null,
          channels: null,
          property_check: null,
          activation: null,
        },
      },
    };
  }

  capabilitiesFor(provider: ChannelProvider): ChannelProviderCapabilities {
    return {
      automation: provider === ChannelProvider.ZODOMUS,
      roomActivation: provider === ChannelProvider.ZODOMUS,
      roomCancellation: provider === ChannelProvider.ZODOMUS,
      reservationSummaryBackfill: provider === ChannelProvider.ZODOMUS,
    };
  }

  summarizeConfig(provider: ChannelProvider, credentials: Prisma.JsonValue | null): ChannelProviderConfigSummary {
    const record = this.readPlainRecord(credentials);

    if (provider === ChannelProvider.ZODOMUS) {
      const channelId = typeof record.channel_code === 'string' ? record.channel_code : null;
      const environment = typeof record.environment === 'string' ? record.environment : null;
      const otaName = typeof record.ota_name === 'string' ? record.ota_name : null;

      return {
        channel_id: channelId,
        ota_name: otaName,
        environment: environment ?? process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null,
        setup_status: this.readZodomusSetupStatus(record),
        automation: this.readZodomusAutomationConfig(record),
      };
    }

    return null;
  }

  validatePropertyActivationInput(provider: ChannelProvider, credentials: Prisma.JsonValue | null, priceModelId: number) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return;
    }

    const connectionConfig = this.readZodomusConnectionConfig(credentials);
    this.assertValidZodomusPriceModel(connectionConfig.ota_key, priceModelId);
  }

  defaultPriceModelId(provider: ChannelProvider, credentials: Prisma.JsonValue | null) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    return this.defaultZodomusPriceModel(this.readZodomusConnectionConfig(credentials).ota_key);
  }

  reservationWebhookFallbackContext(connection: ChannelConnectionProviderContext) {
    if (connection.provider !== ChannelProvider.ZODOMUS) {
      return {
        provider_channel_id: null,
      };
    }

    return {
      provider_channel_id: this.readZodomusConnectionConfig(connection.credentials).channel_code,
    };
  }

  async activateAirbnbHost(connection: ChannelConnectionProviderContext) {
    const { client, channelId, propertyId } = this.zodomusClientForConnection(connection);
    return client.activateAirbnbHost({ channelId, propertyId });
  }

  async activateAirbnbOauthTest(
    connection: ChannelConnectionProviderContext,
    input: { token?: string; client_id?: string },
  ) {
    const { client, channelId, propertyId } = this.zodomusClientForConnection(connection);
    return client.activateAirbnbOauthTest({
      channelId,
      propertyId,
      ...(input.token ? { token: input.token } : {}),
      ...(input.client_id ? { client_id: input.client_id } : {}),
    });
  }

  async getAirbnbHostStatus(connection: ChannelConnectionProviderContext, token: string | undefined) {
    this.zodomusClientForConnection(connection);
    const trimmedToken = token?.trim();
    if (!trimmedToken) {
      throw new BadRequestException('Airbnb token is required to check host status.');
    }

    return this.zodomusClient().getAirbnbHostStatus({
      token: trimmedToken,
    });
  }

  async getAirbnbHostInfo(connection: ChannelConnectionProviderContext, token: string | undefined) {
    this.zodomusClientForConnection(connection);
    const trimmedToken = token?.trim();
    if (!trimmedToken) {
      throw new BadRequestException('Airbnb token is required to get host info.');
    }

    return this.zodomusClient().getAirbnbHostInfo({
      token: trimmedToken,
    });
  }

  async cancelAirbnbHost(connection: ChannelConnectionProviderContext, token: string) {
    this.zodomusClientForConnection(connection);
    return this.zodomusClient().cancelAirbnbHost({ token });
  }

  async getAirbnbListings(connection: ChannelConnectionProviderContext) {
    const { client, propertyId } = this.zodomusClientForConnection(connection);
    return client.getAirbnbListings({
      propertyId,
      _limit: '50',
    });
  }

  async getAirbnbListingsWithToken(connection: ChannelConnectionProviderContext, token: string | undefined) {
    this.zodomusClientForConnection(connection);
    const trimmedToken = token?.trim();
    if (!trimmedToken) {
      throw new BadRequestException('Airbnb token is required to get listings.');
    }

    return this.zodomusClient().getAirbnbListings({
      token: trimmedToken,
      _limit: '50',
    });
  }

  async getAvailability(
    connection: ChannelConnectionProviderContext,
    query: { from?: string; to?: string } = {},
  ) {
    const { client, channelId, propertyId } = this.zodomusClientForConnection(connection);
    const window = this.providerAvailabilityWindow(query);
    return client.getAvailability({
      channelId: channelId.toString(),
      propertyId,
      dateFrom: window.from,
      dateTo: window.to,
    });
  }

  normalizeAutomationPatch(provider: ChannelProvider, patch: {
    enabled?: boolean;
    inventory_interval_minutes?: number;
    rates_interval_minutes?: number;
    bookings_interval_minutes?: number;
    sync_window_days?: number;
  }) {
    if (!this.capabilitiesFor(provider).automation) {
      throw new BadRequestException(`Automation settings are not implemented for ${provider} connections.`);
    }

    const normalizedSyncWindowDays =
      patch.sync_window_days !== undefined
        ? this.normalizeZodomusSyncWindowDays(patch.sync_window_days)
        : undefined;

    return {
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.inventory_interval_minutes !== undefined
        ? { inventory_interval_minutes: patch.inventory_interval_minutes }
        : {}),
      ...(patch.rates_interval_minutes !== undefined ? { rates_interval_minutes: patch.rates_interval_minutes } : {}),
      ...(patch.bookings_interval_minutes !== undefined
        ? { bookings_interval_minutes: patch.bookings_interval_minutes }
        : {}),
      ...(normalizedSyncWindowDays !== undefined ? { sync_window_days: normalizedSyncWindowDays } : {}),
    };
  }

  catalogLoadedConfigPatch(provider: ChannelProvider, response: unknown) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    const catalog = response as { rooms?: unknown[]; rates?: unknown[] };
    return {
      setup_status: {
        catalog_loaded: true,
        catalog_loaded_at: new Date().toISOString(),
        catalog_room_count: Array.isArray(catalog.rooms) ? catalog.rooms.length : 0,
        catalog_rate_count: Array.isArray(catalog.rates) ? catalog.rates.length : 0,
      },
    };
  }

  propertyCheckedConfigPatch(provider: ChannelProvider, credentials: Prisma.JsonValue | null, response: unknown) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    const setupStatus = this.summarizeConfig(provider, credentials)?.setup_status ?? this.defaultZodomusSetupStatus();
    const providerReady = this.isZodomusReadyCheckResponse(response);
    const ready = providerReady && setupStatus.rooms_activated;

    return {
      setup_status: {
        checked: true,
        disconnected: false,
        checked_at: new Date().toISOString(),
        last_check_message: this.readProviderReturnMessage(response),
        last_check_code: this.readProviderReturnCode(response),
        ready,
        ready_at: ready ? new Date().toISOString() : null,
      },
    };
  }

  disconnectedConfigPatch(provider: ChannelProvider, response: unknown) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    return {
      setup_status: {
        disconnected: true,
        disconnected_at: new Date().toISOString(),
        last_disconnect_message: this.readProviderReturnMessage(response),
        last_disconnect_code: this.readProviderReturnCode(response),
        ready: false,
        ready_at: null,
      },
    };
  }

  mappingsChangedConfigPatch(provider: ChannelProvider) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    return {
      setup_status: {
        rooms_activated: false,
        ready: false,
        ready_at: null,
      },
    };
  }

  roomsCancelledConfigPatch(provider: ChannelProvider, response: unknown, roomCount: number) {
    if (provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    return {
      setup_status: {
        rooms_activated: false,
        rooms_cancelled: true,
        rooms_cancelled_at: new Date().toISOString(),
        cancelled_room_count: roomCount,
        last_rooms_cancellation_message: this.readProviderReturnMessage(response),
        last_rooms_cancellation_code: this.readProviderReturnCode(response),
        ready: false,
        ready_at: null,
      },
    };
  }

  async validateConnection(payload: ChannelConnectionValidationPayload) {
    try {
      return await this.adapterFor(payload.provider).validateConnection(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async fetchCatalog(payload: ChannelCatalogPayload) {
    try {
      return await this.adapterFor(payload.provider).fetchCatalog(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async checkProperty(payload: ChannelPropertyActionPayload) {
    try {
      return await this.adapterFor(payload.provider).checkProperty(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async activateProperty(payload: ChannelPropertyActionPayload) {
    try {
      return await this.adapterFor(payload.provider).activateProperty(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async activateRooms(payload: ChannelPropertyActionPayload) {
    try {
      return await this.adapterFor(payload.provider).activateRooms(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async cancelRooms(payload: ChannelPropertyActionPayload) {
    try {
      return await this.adapterFor(payload.provider).cancelRooms(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async disconnectProperty(payload: ChannelPropertyActionPayload) {
    try {
      return await this.adapterFor(payload.provider).disconnectProperty(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getAccount(payload: ChannelConnectionValidationPayload) {
    try {
      return await this.adapterFor(payload.provider).getAccount(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getChannels(payload: ChannelConnectionValidationPayload) {
    try {
      return await this.adapterFor(payload.provider).getChannels(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getCurrencies(payload: ChannelConnectionValidationPayload) {
    try {
      return await this.adapterFor(payload.provider).getCurrencies(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getPriceModels(payload: ChannelConnectionValidationPayload) {
    try {
      return await this.adapterFor(payload.provider).getPriceModels(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getReservationsQueue(payload: ChannelReservationActionPayload) {
    try {
      return await this.adapterFor(payload.provider).getReservationsQueue(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getReservation(payload: ChannelReservationActionPayload) {
    try {
      return await this.adapterFor(payload.provider).getReservation(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getReservationCC(payload: ChannelReservationActionPayload) {
    try {
      return await this.adapterFor(payload.provider).getReservationCC(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async getReservationsSummary(payload: ChannelReservationActionPayload) {
    try {
      return await this.adapterFor(payload.provider).getReservationsSummary(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async createTestReservation(payload: ChannelReservationActionPayload) {
    try {
      return await this.adapterFor(payload.provider).createTestReservation(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async push(payload: ChannelPayload) {
    try {
      return await this.adapterFor(payload.provider).push(payload);
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  private adapterFor(provider: ChannelProvider): ChannelAdapter {
    if (provider === ChannelProvider.MOCK) {
      return this.mockAdapter;
    }

    if (provider === ChannelProvider.ZODOMUS) {
      this.zodomusAdapter ??= this.zodomusChannelAdapter();
      return this.zodomusAdapter;
    }

    return new ExternalChannelAdapter(provider);
  }

  private mapProviderError(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof NotImplementedException) {
      throw error;
    }

    if (error instanceof Error) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }

  private zodomusChannelAdapter(): ChannelAdapter {
    try {
      const module = require('./providers/zodomus-channel.adapter') as {
        ZodomusChannelAdapter: new () => ChannelAdapter;
      };
      return new module.ZodomusChannelAdapter();
    } catch (error) {
      throw new NotImplementedException(
        `ZODOMUS provider adapter is not available: ${error instanceof Error ? error.message : 'unknown load error'}.`,
      );
    }
  }

  private zodomusClient(credentials: ZodomusAppCredentials = this.readZodomusAppCredentials()) {
    try {
      const module = require('./providers/zodomus-client') as {
        ZodomusClient: new (credentials: ZodomusAppCredentials) => {
          activateAirbnbHost(input: { channelId: number; propertyId: string }): Promise<Prisma.InputJsonObject>;
          activateAirbnbOauthTest(input: {
            channelId: number;
            propertyId: string;
            token?: string;
            client_id?: string;
          }): Promise<Prisma.InputJsonObject>;
          getAirbnbHostStatus(input: { token: string }): Promise<Prisma.InputJsonObject>;
          getAirbnbHostInfo(input: { token: string }): Promise<Prisma.InputJsonObject>;
          cancelAirbnbHost(input: { token: string }): Promise<Prisma.InputJsonObject>;
          getAirbnbListings(input: {
            propertyId?: string;
            token?: string;
            _limit: string;
          }): Promise<Prisma.InputJsonObject>;
          getAvailability(input: {
            channelId: string;
            propertyId: string;
            dateFrom: string;
            dateTo: string;
          }): Promise<Prisma.InputJsonObject>;
        };
      };
      return new module.ZodomusClient(credentials);
    } catch (error) {
      throw new NotImplementedException(
        `ZODOMUS provider client is not available: ${error instanceof Error ? error.message : 'unknown load error'}.`,
      );
    }
  }

  private readZodomusAppCredentials(): ZodomusAppCredentials {
    try {
      const module = require('./providers/zodomus.types') as {
        readZodomusAppCredentials: () => ZodomusAppCredentials;
      };
      return module.readZodomusAppCredentials();
    } catch (error) {
      throw new NotImplementedException(
        `ZODOMUS provider credentials are not available: ${error instanceof Error ? error.message : 'unknown load error'}.`,
      );
    }
  }

  private readZodomusConnectionConfig(value: unknown): ZodomusConnectionConfig {
    try {
      const module = require('./providers/zodomus.types') as {
        readZodomusConnectionConfig: (value: unknown) => ZodomusConnectionConfig;
      };
      return module.readZodomusConnectionConfig(value);
    } catch (error) {
      throw new NotImplementedException(
        `ZODOMUS provider connection config is not available: ${error instanceof Error ? error.message : 'unknown load error'}.`,
      );
    }
  }

  private zodomusClientForConnection(connection: ChannelConnectionProviderContext) {
    if (connection.provider !== ChannelProvider.ZODOMUS) {
      throw new BadRequestException('This provider API is currently supported only for Zodomus connections.');
    }

    const appCredentials = this.readZodomusAppCredentials();
    const connectionConfig = this.readZodomusConnectionConfig(connection.credentials);
    const propertyId = this.requiredExternalHotelId(connection.externalHotelId);

    return {
      client: this.zodomusClient(appCredentials),
      channelId: Number(connectionConfig.channel_code),
      propertyId,
    };
  }

  private providerAvailabilityWindow(query: { from?: string; to?: string }) {
    if ((query.from && !query.to) || (!query.from && query.to)) {
      throw new BadRequestException('Both from and to are required when checking provider availability for a custom window.');
    }

    if (query.from && query.to) {
      if (query.from > query.to) {
        throw new BadRequestException('Provider availability from date must be on or before the to date.');
      }

      return { from: query.from, to: query.to };
    }

    const appCredentials = this.readZodomusAppCredentials();
    const windowDays = this.defaultZodomusSyncWindowDays(appCredentials.environment);
    const fromDate = this.toDateOnly(new Date());
    const toDate = this.addDays(fromDate, Math.max(windowDays - 1, 0));

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
    };
  }

  private requiredExternalHotelId(value: string | null) {
    if (!value?.trim()) {
      throw new BadRequestException('Provider property ID is required for this provider call.');
    }

    return value.trim();
  }

  private toDateOnly(value: Date) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private readSetupOtaKey(options: Record<string, unknown> | undefined): ZodomusOtaKey {
    const value = options?.ota_key;
    if (value === 'BOOKING_COM' || value === 'EXPEDIA' || value === 'AIRBNB') {
      return value;
    }

    throw new BadRequestException('A supported ota_key is required for Zodomus setup.');
  }

  private defaultZodomusPriceModel(otaKey: ZodomusOtaKey) {
    if (otaKey === 'BOOKING_COM') return 1;
    if (otaKey === 'EXPEDIA') return 3;
    return 4;
  }

  private allowedZodomusPriceModels(otaKey: ZodomusOtaKey) {
    if (otaKey === 'BOOKING_COM') return [1, 2];
    if (otaKey === 'EXPEDIA') return [3, 4, 5];
    return [4];
  }

  private zodomusOtaLabel(otaKey: ZodomusOtaKey) {
    if (otaKey === 'BOOKING_COM') return 'Booking.com';
    if (otaKey === 'EXPEDIA') return 'Expedia';
    return 'Airbnb';
  }

  private assertValidZodomusPriceModel(otaKey: ZodomusOtaKey, priceModelId: number) {
    const allowedPriceModels = this.allowedZodomusPriceModels(otaKey);

    if (!allowedPriceModels.includes(priceModelId)) {
      throw new BadRequestException(
        `Price model ${priceModelId} is not supported for ${this.zodomusOtaLabel(otaKey)}. ` +
          `Allowed price models: ${allowedPriceModels.join(', ')}.`,
      );
    }
  }

  private defaultZodomusAutomationConfig(): ChannelAutomationConfigSummary {
    const environment = process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null;

    return {
      enabled: (process.env.ZODOMUS_AUTO_SYNC_ENABLED?.trim() ?? 'true') !== 'false',
      inventory_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readPositiveInteger(process.env.ZODOMUS_AUTO_SYNC_INVENTORY_MINUTES, 15),
        'inventory',
        environment,
      ),
      rates_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readPositiveInteger(process.env.ZODOMUS_AUTO_SYNC_RATES_MINUTES, 60),
        'rates',
        environment,
      ),
      bookings_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readPositiveInteger(process.env.ZODOMUS_AUTO_SYNC_BOOKINGS_MINUTES, 5),
        'bookings',
        environment,
      ),
      sync_window_days: this.defaultZodomusSyncWindowDays(environment),
      full_sync_window_days: this.defaultZodomusFullSyncWindowDays(environment),
    };
  }

  private defaultZodomusSetupStatus(): ChannelSetupStatusSummary {
    return {
      checked: false,
      activated: false,
      rooms_activated: false,
      catalog_loaded: false,
      ready: false,
      disconnected: false,
      checked_at: null,
      activated_at: null,
      rooms_activated_at: null,
      catalog_loaded_at: null,
      ready_at: null,
      disconnected_at: null,
      price_model_id: null,
      last_check_message: null,
      last_check_code: null,
      last_activation_message: null,
      last_activation_code: null,
      last_rooms_activation_message: null,
      last_rooms_activation_code: null,
      last_disconnect_message: null,
      last_disconnect_code: null,
      activated_room_count: 0,
      catalog_room_count: 0,
      catalog_rate_count: 0,
    };
  }

  private readZodomusSetupStatus(record: Record<string, Prisma.JsonValue>): ChannelSetupStatusSummary {
    const setup = this.readNestedRecord(record.setup_status);
    const defaults = this.defaultZodomusSetupStatus();

    return {
      checked: this.readBoolean(setup.checked, defaults.checked),
      activated: this.readBoolean(setup.activated, defaults.activated),
      rooms_activated: this.readBoolean(setup.rooms_activated, defaults.rooms_activated),
      catalog_loaded: this.readBoolean(setup.catalog_loaded, defaults.catalog_loaded),
      ready: this.readBoolean(setup.ready, defaults.ready),
      disconnected: this.readBoolean(setup.disconnected, defaults.disconnected),
      checked_at: this.readOptionalString(setup.checked_at),
      activated_at: this.readOptionalString(setup.activated_at),
      rooms_activated_at: this.readOptionalString(setup.rooms_activated_at),
      catalog_loaded_at: this.readOptionalString(setup.catalog_loaded_at),
      ready_at: this.readOptionalString(setup.ready_at),
      disconnected_at: this.readOptionalString(setup.disconnected_at),
      price_model_id: this.readOptionalNumber(setup.price_model_id),
      last_check_message: this.readOptionalString(setup.last_check_message),
      last_check_code: this.readOptionalStringOrNumber(setup.last_check_code),
      last_activation_message: this.readOptionalString(setup.last_activation_message),
      last_activation_code: this.readOptionalStringOrNumber(setup.last_activation_code),
      last_rooms_activation_message: this.readOptionalString(setup.last_rooms_activation_message),
      last_rooms_activation_code: this.readOptionalStringOrNumber(setup.last_rooms_activation_code),
      last_disconnect_message: this.readOptionalString(setup.last_disconnect_message),
      last_disconnect_code: this.readOptionalStringOrNumber(setup.last_disconnect_code),
      activated_room_count: this.readNumber(setup.activated_room_count, defaults.activated_room_count),
      catalog_room_count: this.readNumber(setup.catalog_room_count, defaults.catalog_room_count),
      catalog_rate_count: this.readNumber(setup.catalog_rate_count, defaults.catalog_rate_count),
    };
  }

  private readZodomusAutomationConfig(record: Record<string, Prisma.JsonValue>): ChannelAutomationConfigSummary {
    const automation = this.readNestedRecord(record.automation);
    const defaults = this.defaultZodomusAutomationConfig();
    const environment = this.readOptionalString(record.environment) ?? process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null;
    const syncWindowDays = this.normalizeZodomusSyncWindowDays(
      this.readNumber(automation.sync_window_days, defaults.sync_window_days),
      environment,
    );
    const fullSyncWindowDays = this.normalizeZodomusFullSyncWindowDays(
      this.readNumber(automation.full_sync_window_days, defaults.full_sync_window_days),
      environment,
    );

    return {
      enabled: this.readBoolean(automation.enabled, defaults.enabled),
      inventory_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readNumber(automation.inventory_interval_minutes, defaults.inventory_interval_minutes),
        'inventory',
        environment,
      ),
      rates_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readNumber(automation.rates_interval_minutes, defaults.rates_interval_minutes),
        'rates',
        environment,
      ),
      bookings_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readNumber(automation.bookings_interval_minutes, defaults.bookings_interval_minutes),
        'bookings',
        environment,
      ),
      sync_window_days: syncWindowDays,
      full_sync_window_days: fullSyncWindowDays,
    };
  }

  private normalizeZodomusIntervalMinutes(
    value: number,
    syncType: 'inventory' | 'rates' | 'bookings',
    environment?: string | null,
  ) {
    const normalized = Math.max(value, 0);
    if (environment !== 'sandbox') {
      return normalized;
    }

    if (syncType === 'inventory') {
      return Math.max(normalized, this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MIN_INVENTORY_SYNC_MINUTES, 60));
    }

    if (syncType === 'rates') {
      return Math.max(normalized, this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MIN_RATES_SYNC_MINUTES, 180));
    }

    return Math.max(normalized, this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MIN_BOOKINGS_SYNC_MINUTES, 15));
  }

  private normalizeZodomusSyncWindowDays(value: number, environment?: string | null) {
    const normalized = Math.max(value, 1);
    if (environment === 'sandbox') {
      return Math.min(normalized, this.sandboxMaximumZodomusSyncWindowDays());
    }

    return normalized;
  }

  private normalizeZodomusFullSyncWindowDays(value: number, environment?: string | null) {
    const normalized = Math.max(value, 1);
    if (environment === 'sandbox') {
      return Math.min(normalized, this.sandboxMaximumZodomusSyncWindowDays());
    }

    return Math.max(normalized, this.productionFullZodomusSyncWindowDays());
  }

  private productionMinimumZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_PRODUCTION_ROUTINE_SYNC_WINDOW_DAYS, 90);
  }

  private productionFullZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_PRODUCTION_FULL_SYNC_WINDOW_DAYS, 365);
  }

  private sandboxMaximumZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MAX_SYNC_WINDOW_DAYS, 7);
  }

  private defaultZodomusSyncWindowDays(environment?: string | null) {
    return this.normalizeZodomusSyncWindowDays(
      this.readPositiveInteger(
        process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS,
        environment === 'sandbox'
          ? this.sandboxMaximumZodomusSyncWindowDays()
          : this.productionMinimumZodomusSyncWindowDays(),
      ),
      environment,
    );
  }

  private defaultZodomusFullSyncWindowDays(environment?: string | null) {
    return this.normalizeZodomusFullSyncWindowDays(
      this.readPositiveInteger(
        process.env.ZODOMUS_FULL_SYNC_WINDOW_DAYS,
        environment === 'sandbox'
          ? this.sandboxMaximumZodomusSyncWindowDays()
          : this.productionFullZodomusSyncWindowDays(),
      ),
      environment,
    );
  }

  private isZodomusReadyCheckResponse(response: unknown) {
    const wrapper = this.readUnknownRecord(response);
    const rawResponse = this.readUnknownRecord(wrapper.response);
    const status = this.readUnknownRecord(rawResponse.status);
    const returnCode = this.readUnknownRecord({ value: status.returnCode }).value;
    const returnMessage = this.readUnknownRecord(status.returnMessage);

    const propertyStatus = this.readLooseStatusValue(returnMessage['Property status']);
    const channelStatus = this.readLooseStatusValue(returnMessage['Channel status']);
    const productStatus = this.readLooseStatusValue(returnMessage['Product status']);
    const roomStatus = this.readLooseStatusValue(returnMessage['Room status']);

    return (
      (returnCode === 200 || returnCode === '200') &&
      propertyStatus === 'active' &&
      channelStatus === 'ok' &&
      productStatus === 'ok' &&
      roomStatus === 'ok'
    );
  }

  private readProviderReturnMessage(response: unknown) {
    const wrapper = this.readUnknownRecord(response);
    const rawResponse = this.readUnknownRecord(wrapper.response);
    const status = this.readUnknownRecord(rawResponse.status);
    const returnMessage = status.returnMessage;

    if (typeof returnMessage === 'string') {
      return returnMessage;
    }

    if (returnMessage && typeof returnMessage === 'object') {
      return JSON.stringify(returnMessage);
    }

    return null;
  }

  private readProviderReturnCode(response: unknown) {
    const wrapper = this.readUnknownRecord(response);
    const rawResponse = this.readUnknownRecord(wrapper.response);
    const status = this.readUnknownRecord(rawResponse.status);
    const value = status.returnCode;

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }

    return null;
  }

  private readLooseStatusValue(value: unknown) {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }

    if (typeof value === 'number') {
      return value.toString().trim().toLowerCase();
    }

    return '';
  }

  private readPlainRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private readUnknownRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNestedRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private readBoolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private readNumber(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readOptionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readOptionalStringOrNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return this.readOptionalString(value);
  }

  private readPositiveInteger(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number.parseInt(value, 10)
          : NaN;

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
