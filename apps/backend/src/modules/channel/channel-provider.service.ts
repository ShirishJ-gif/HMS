import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { ChannelProvider, ChannelSyncType, Prisma } from '@prisma/client';
import { ZodomusChannelAdapter } from './providers/zodomus-channel.adapter';

export type ChannelPayload = {
  provider: ChannelProvider;
  sync_type: ChannelSyncType;
  property_id: string;
  external_hotel_id?: string | null;
  credentials?: unknown;
  from?: string;
  to?: string;
  inventory?: unknown;
  rates?: unknown;
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
  rooms?: unknown;
};

export type ChannelReservationActionPayload = {
  provider: ChannelProvider;
  external_hotel_id?: string | null;
  credentials?: unknown;
  reservation_id?: string;
  status?: string;
};

interface ChannelAdapter {
  validateConnection(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  fetchCatalog(payload: ChannelCatalogPayload): Promise<Prisma.InputJsonObject>;
  checkProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  activateProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  activateRooms(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  disconnectProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject>;
  getAccount(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getChannels(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getCurrencies(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getPriceModels(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject>;
  getReservationsQueue(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
  getReservation(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject>;
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
  private readonly zodomusAdapter = new ZodomusChannelAdapter();

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
}
