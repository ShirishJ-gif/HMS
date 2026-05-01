import { Injectable, NotImplementedException } from '@nestjs/common';
import { ChannelProvider, ChannelSyncType, Prisma } from '@prisma/client';

type ChannelPayload = {
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

interface ChannelAdapter {
  push(payload: ChannelPayload): Promise<Prisma.InputJsonObject>;
}

class MockChannelAdapter implements ChannelAdapter {
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

  async push(): Promise<Prisma.InputJsonObject> {
    throw new NotImplementedException(
      `${this.provider} sync requires signed provider API credentials, external hotel mapping, retry policy, and webhook reconciliation before live sync is enabled.`,
    );
  }
}

@Injectable()
export class ChannelProviderService {
  private readonly mockAdapter = new MockChannelAdapter();

  async push(payload: ChannelPayload) {
    return this.adapterFor(payload.provider).push(payload);
  }

  private adapterFor(provider: ChannelProvider): ChannelAdapter {
    if (provider === ChannelProvider.MOCK) {
      return this.mockAdapter;
    }

    return new ExternalChannelAdapter(provider);
  }
}
