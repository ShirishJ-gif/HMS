import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, PaymentProvider, PaymentStatus, PaymentTransactionStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentProviderService } from './payment-provider.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviderService: PaymentProviderService,
    private readonly auditLogService: AuditLogService,
    private readonly idempotencyService: IdempotencyService,
    private readonly metricsService: MetricsService,
  ) {}

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(scopedPropertyId
        ? {
            billing: {
              booking: {
                propertyId: scopedPropertyId,
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { providerReference: { contains: search, mode: 'insensitive' } },
              { billing: { booking: { guest: { name: { contains: search, mode: 'insensitive' } } } } },
              { billing: { booking: { property: { name: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };

    const [payments, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where,
        include: this.includeRelations(),
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);

    return paginatedResponse(payments.map((payment) => this.toResponse(payment)), total, page, limit);
  }

  async collect(dto: CollectPaymentDto, user?: AuthenticatedUser, idempotencyKey?: string) {
    return this.idempotencyService.run(idempotencyKey, 'payments.collect', dto, user, () =>
      this.collectOnce(dto, user),
    );
  }

  private async collectOnce(dto: CollectPaymentDto, user?: AuthenticatedUser) {
    const amount = new Prisma.Decimal(dto.amount);

    if (amount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const paymentId = await this.prisma.$transaction(async (tx) => {
      const billing = await tx.billing.findUnique({
        where: { id: dto.billing_id },
        include: {
          payments: true,
          booking: true,
        },
      });

      if (!billing) {
        throw new NotFoundException('Invoice not found');
      }

      assertCanAccessProperty(user, billing.booking.propertyId);

      const paidTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
      const remaining = billing.total.sub(paidTotal);

      if (amount.gt(remaining)) {
        throw new BadRequestException('Payment amount exceeds invoice balance');
      }

      const provider = dto.provider ?? PaymentProvider.MOCK;
      const providerResult = await this.paymentProviderService.collect({
        amount: dto.amount,
        provider,
        providerReference: dto.provider_reference,
      });

      const createdPayment = await tx.paymentTransaction.create({
        data: {
          billingId: billing.id,
          amount,
          provider,
          providerReference: providerResult.provider_reference,
          status: providerResult.status,
          metadata: providerResult.metadata,
        },
      });

      const newPaidTotal = paidTotal.add(amount);
      await tx.billing.update({
        where: { id: billing.id },
        data: {
          paymentStatus: newPaidTotal.gte(billing.total) ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
        },
      });

      return createdPayment.id;
    });

    const payment = await this.prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: paymentId },
      include: this.includeRelations(),
    });

    await this.auditLogService.record({
      action: AuditAction.PAYMENT_COLLECT,
      entityType: 'payment_transaction',
      entityId: payment.id,
      propertyId: payment.billing.booking.propertyId,
      summary: `Collected ${payment.amount.toString()} from ${payment.billing.booking.guest.name}`,
      metadata: {
        billing_id: payment.billingId,
        provider: payment.provider,
        provider_reference: payment.providerReference,
      },
      user,
    });

    this.metricsService.recordPaymentCollect(payment.status, payment.provider);

    return this.toResponse(payment);
  }

  async refund(id: string, dto: RefundPaymentDto, user?: AuthenticatedUser, idempotencyKey?: string) {
    return this.idempotencyService.run(idempotencyKey, 'payments.refund', { id, ...dto }, user, () =>
      this.refundOnce(id, dto, user),
    );
  }

  private async refundOnce(id: string, dto: RefundPaymentDto, user?: AuthenticatedUser) {
    const refundAmount = new Prisma.Decimal(dto.amount);

    if (refundAmount.lte(0)) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const refundId = await this.prisma.$transaction(async (tx) => {
      const originalPayment = await tx.paymentTransaction.findUnique({
        where: { id },
        include: {
          billing: {
            include: {
              payments: true,
              booking: true,
            },
          },
        },
      });

      if (!originalPayment || originalPayment.status !== PaymentTransactionStatus.SUCCEEDED) {
        throw new NotFoundException('Successful payment not found');
      }

      assertCanAccessProperty(user, originalPayment.billing.booking.propertyId);

      const existingRefunds = originalPayment.billing.payments
        .filter((payment) => payment.status === PaymentTransactionStatus.REFUNDED)
        .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
      const refundable = originalPayment.billing.payments
        .filter((payment) => payment.status === PaymentTransactionStatus.SUCCEEDED)
        .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0))
        .sub(existingRefunds);

      if (refundAmount.gt(refundable)) {
        throw new BadRequestException('Refund amount exceeds refundable balance');
      }

      const providerResult = await this.paymentProviderService.refund({
        amount: dto.amount,
        provider: originalPayment.provider,
        providerReference: originalPayment.providerReference ?? undefined,
        reason: dto.reason,
      });

      const refundPayment = await tx.paymentTransaction.create({
        data: {
          billingId: originalPayment.billingId,
          amount: refundAmount,
          provider: originalPayment.provider,
          providerReference: providerResult.provider_reference,
          status: PaymentTransactionStatus.REFUNDED,
          metadata: providerResult.metadata,
        },
      });

      const billing = await tx.billing.findUniqueOrThrow({
        where: { id: originalPayment.billingId },
        include: { payments: true },
      });
      const paidTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
      const refundedTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED).add(refundAmount);
      const netPaid = paidTotal.sub(refundedTotal);

      await tx.billing.update({
        where: { id: billing.id },
        data: {
          paymentStatus: netPaid.lte(0)
            ? PaymentStatus.REFUNDED
            : netPaid.gte(billing.total)
              ? PaymentStatus.PAID
              : PaymentStatus.PARTIAL,
        },
      });

      return refundPayment.id;
    });

    const refund = await this.prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: refundId },
      include: this.includeRelations(),
    });

    await this.auditLogService.record({
      action: AuditAction.PAYMENT_REFUND,
      entityType: 'payment_transaction',
      entityId: refund.id,
      propertyId: refund.billing.booking.propertyId,
      summary: `Refunded ${refund.amount.toString()} for ${refund.billing.booking.guest.name}`,
      metadata: {
        billing_id: refund.billingId,
        provider: refund.provider,
        provider_reference: refund.providerReference,
        reason: dto.reason,
      },
      user,
    });

    this.metricsService.recordPaymentRefund(refund.status, refund.provider);

    return this.toResponse(refund);
  }

  private sumPayments(
    payments: Array<{ amount: Prisma.Decimal; status: PaymentTransactionStatus }>,
    status: PaymentTransactionStatus,
  ) {
    return payments
      .filter((payment) => payment.status === status)
      .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
  }

  private includeRelations() {
    return {
      billing: {
        include: {
          booking: {
            include: {
              guest: true,
              property: true,
            },
          },
        },
      },
    } satisfies Prisma.PaymentTransactionInclude;
  }

  private toResponse(
    payment: Prisma.PaymentTransactionGetPayload<{ include: ReturnType<PaymentService['includeRelations']> }>,
  ) {
    return {
      id: payment.id,
      billing_id: payment.billingId,
      provider: payment.provider,
      provider_reference: payment.providerReference,
      amount: payment.amount.toNumber(),
      status: payment.status,
      booking: {
        id: payment.billing.booking.id,
        guest_name: payment.billing.booking.guest.name,
        property_name: payment.billing.booking.property.name,
      },
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }
}
