import { Injectable, NotImplementedException } from '@nestjs/common';
import { PaymentProvider, PaymentTransactionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

type CollectPaymentInput = {
  amount: string;
  provider: PaymentProvider;
  providerReference?: string;
};

type RefundPaymentInput = {
  amount: string;
  provider: PaymentProvider;
  providerReference?: string;
  reason?: string;
};

type ProviderResult = {
  provider_reference: string;
  status: PaymentTransactionStatus;
  metadata: Prisma.InputJsonObject;
};

interface PaymentAdapter {
  collect(input: CollectPaymentInput): Promise<ProviderResult>;
  refund(input: RefundPaymentInput): Promise<ProviderResult>;
}

class LocalPaymentAdapter implements PaymentAdapter {
  async collect(input: CollectPaymentInput) {
    return {
      provider_reference: input.providerReference ?? `local_${randomUUID()}`,
      status: PaymentTransactionStatus.SUCCEEDED,
      metadata: {
        provider: input.provider,
        mode: 'local',
      },
    };
  }

  async refund(input: RefundPaymentInput) {
    return {
      provider_reference: input.providerReference ?? `refund_${randomUUID()}`,
      status: PaymentTransactionStatus.REFUNDED,
      metadata: {
        provider: input.provider,
        mode: 'local',
        reason: input.reason,
      },
    };
  }
}

class ExternalPaymentAdapter implements PaymentAdapter {
  constructor(private readonly provider: PaymentProvider) {}

  async collect(): Promise<ProviderResult> {
    throw new NotImplementedException(
      `${this.provider} payments require provider SDK/API credentials, webhook signature verification, and idempotency keys before live collection is enabled.`,
    );
  }

  async refund(): Promise<ProviderResult> {
    throw new NotImplementedException(
      `${this.provider} refunds require provider SDK/API credentials, webhook signature verification, and idempotency keys before live refunds are enabled.`,
    );
  }
}

@Injectable()
export class PaymentProviderService {
  private readonly localAdapter = new LocalPaymentAdapter();

  async collect(input: CollectPaymentInput) {
    return this.adapterFor(input.provider).collect(input);
  }

  async refund(input: RefundPaymentInput) {
    return this.adapterFor(input.provider).refund(input);
  }

  private adapterFor(provider: PaymentProvider): PaymentAdapter {
    if (
      provider === PaymentProvider.MOCK ||
      provider === PaymentProvider.CASH ||
      provider === PaymentProvider.CARD ||
      provider === PaymentProvider.UPI
    ) {
      return this.localAdapter;
    }

    return new ExternalPaymentAdapter(provider);
  }
}
