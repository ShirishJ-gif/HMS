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
import { CollectReservationGroupPaymentDto } from './dto/collect-reservation-group-payment.dto';
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
      AND: [
        ...(scopedPropertyId ? [{ billing: { reservationRoom: { propertyId: scopedPropertyId } } } satisfies Prisma.PaymentTransactionWhereInput] : []),
        ...(search
          ? [
              {
                OR: [
                  { providerReference: { contains: search, mode: 'insensitive' } },
                  { billing: { reservationRoom: { guestName: { contains: search, mode: 'insensitive' } } } },
                  { billing: { reservationRoom: { reservationGroup: { externalReservationId: { contains: search, mode: 'insensitive' } } } } },
                  { billing: { reservationRoom: { reservationGroup: { property: { name: { contains: search, mode: 'insensitive' } } } } } },
                ],
              } satisfies Prisma.PaymentTransactionWhereInput,
            ]
          : []),
      ],
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

  async collectReservationGroup(
    dto: CollectReservationGroupPaymentDto,
    user?: AuthenticatedUser,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.run(idempotencyKey, 'payments.collect-reservation-group', dto, user, () =>
      this.collectReservationGroupOnce(dto, user),
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
          reservationRoom: {
            include: {
              reservationGroup: {
                include: {
                  primaryGuest: true,
                  property: true,
                },
              },
            },
          },
        },
      });

      if (!billing) {
        throw new NotFoundException('Invoice not found');
      }

      assertCanAccessProperty(user, this.subjectPropertyId(billing));

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
      propertyId: this.subjectPropertyId(payment.billing),
      summary: `Collected ${payment.amount.toString()} from ${this.subjectGuestName(payment.billing)}`,
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

  private async collectReservationGroupOnce(
    dto: CollectReservationGroupPaymentDto,
    user?: AuthenticatedUser,
  ) {
    const requestedAmount = new Prisma.Decimal(dto.amount);

    if (requestedAmount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const provider = dto.provider ?? PaymentProvider.MOCK;

    const result = await this.prisma.$transaction(async (tx) => {
      const reservationGroup = await tx.reservationGroup.findUnique({
        where: { id: dto.reservation_group_id },
        include: {
          property: true,
          primaryGuest: true,
          rooms: {
            include: {
              billings: {
                include: {
                  payments: true,
                },
              },
            },
            orderBy: [{ departureDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      if (!reservationGroup) {
        throw new NotFoundException('Reservation group not found');
      }

      assertCanAccessProperty(user, reservationGroup.propertyId);

      const openBillings = reservationGroup.rooms.flatMap((room) =>
        room.billings
          .map((billing) => ({
            billing,
            roomId: room.id,
            remaining: billing.total.sub(this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED)).add(
              this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED),
            ),
          }))
          .filter((entry) => entry.remaining.gt(0)),
      );

      if (openBillings.length === 0) {
        throw new BadRequestException('Reservation group folio has no outstanding invoices');
      }

      const totalOutstanding = openBillings.reduce(
        (total, entry) => total.add(entry.remaining),
        new Prisma.Decimal(0),
      );

      if (requestedAmount.gt(totalOutstanding)) {
        throw new BadRequestException('Payment amount exceeds reservation group folio balance');
      }

      let remainingAllocation = requestedAmount;
      const allocatedPayments: Array<{
        paymentId: string;
        billingId: string;
        amount: Prisma.Decimal;
        providerReference: string | null;
      }> = [];

      for (const [index, entry] of openBillings.entries()) {
        if (remainingAllocation.lte(0)) {
          break;
        }

        const allocation = remainingAllocation.lessThan(entry.remaining) ? remainingAllocation : entry.remaining;
        const providerResult = await this.paymentProviderService.collect({
          amount: allocation.toFixed(2),
          provider,
          providerReference: dto.provider_reference
            ? `${dto.provider_reference}:${reservationGroup.id}:${index + 1}`
            : undefined,
        });

        const payment = await tx.paymentTransaction.create({
          data: {
            billingId: entry.billing.id,
            amount: allocation,
            provider,
            providerReference: providerResult.provider_reference,
            status: providerResult.status,
            metadata: providerResult.metadata,
          },
        });

        const paidTotal = this.sumPayments(entry.billing.payments, PaymentTransactionStatus.SUCCEEDED).add(allocation);
        await tx.billing.update({
          where: { id: entry.billing.id },
          data: {
            paymentStatus: paidTotal.gte(entry.billing.total) ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
          },
        });

        allocatedPayments.push({
          paymentId: payment.id,
          billingId: entry.billing.id,
          amount: allocation,
          providerReference: payment.providerReference,
        });
        remainingAllocation = remainingAllocation.sub(allocation);
      }

      return {
        propertyId: reservationGroup.propertyId,
        reservationGroupId: reservationGroup.id,
        externalReservationId: reservationGroup.externalReservationId,
        guestName: reservationGroup.primaryGuest?.name ?? 'Imported guest',
        allocatedPayments,
        requestedAmount,
        remainingBalance: totalOutstanding.sub(requestedAmount),
      };
    });

    await this.auditLogService.record({
      action: AuditAction.PAYMENT_COLLECT,
      entityType: 'reservation_group_folio',
      entityId: result.reservationGroupId,
      propertyId: result.propertyId,
      summary: `Collected ${result.requestedAmount.toString()} against folio ${result.externalReservationId}`,
      metadata: {
        reservation_group_id: result.reservationGroupId,
        external_reservation_id: result.externalReservationId,
        payment_count: result.allocatedPayments.length,
      },
      user,
    });

    this.metricsService.recordPaymentCollect(PaymentTransactionStatus.SUCCEEDED, provider);

    return {
      reservation_group_id: result.reservationGroupId,
      external_reservation_id: result.externalReservationId,
      guest_name: result.guestName,
      allocated_total: result.requestedAmount.toNumber(),
      remaining_balance: result.remainingBalance.toNumber(),
      payments: result.allocatedPayments.map((payment) => ({
        payment_id: payment.paymentId,
        billing_id: payment.billingId,
        amount: payment.amount.toNumber(),
        provider_reference: payment.providerReference,
      })),
    };
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
              reservationRoom: {
                include: {
                  reservationGroup: {
                    include: {
                      primaryGuest: true,
                      property: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!originalPayment || originalPayment.status !== PaymentTransactionStatus.SUCCEEDED) {
        throw new NotFoundException('Successful payment not found');
      }

      assertCanAccessProperty(user, this.subjectPropertyId(originalPayment.billing));

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
      propertyId: this.subjectPropertyId(refund.billing),
      summary: `Refunded ${refund.amount.toString()} for ${this.subjectGuestName(refund.billing)}`,
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
          reservationRoom: {
            include: {
              reservationGroup: {
                include: {
                  primaryGuest: true,
                  property: true,
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.PaymentTransactionInclude;
  }

  private subjectPropertyId(billing: { reservationRoom?: { propertyId: string } | null }) {
    const propertyId = billing.reservationRoom?.propertyId;
    if (!propertyId) {
      throw new NotFoundException('Invoice is missing a property scope');
    }

    return propertyId;
  }

  private subjectGuestName(billing: {
    reservationRoom?: { guestName?: string | null; reservationGroup?: { primaryGuest?: { name: string } | null } | null } | null;
  }) {
    return (
      billing.reservationRoom?.guestName ??
      billing.reservationRoom?.reservationGroup?.primaryGuest?.name ??
      'Imported guest'
    );
  }

  private subjectPropertyName(billing: {
    reservationRoom?: { reservationGroup?: { property?: { name: string } | null } | null } | null;
  }) {
    return (
      billing.reservationRoom?.reservationGroup?.property?.name ??
      'Unknown property'
    );
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
      reservation_room: {
        id: payment.billing.reservationRoom?.id ?? payment.billingId,
        guest_name: this.subjectGuestName(payment.billing),
        property_name: this.subjectPropertyName(payment.billing),
      },
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }
}
