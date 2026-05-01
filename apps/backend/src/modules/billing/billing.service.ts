import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { AddExtraChargeDto } from './dto/add-extra-charge.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

type BillingWithRelations = Prisma.BillingGetPayload<{
  include: {
    booking: {
      include: {
        property: true;
        guest: true;
        roomCategory: true;
        ratePlan: true;
        room: true;
      };
    };
    extraCharges: true;
    payments: true;
  };
}>;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async createInvoice(createInvoiceDto: CreateInvoiceDto, user?: AuthenticatedUser) {
    try {
      const billing = await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: createInvoiceDto.booking_id },
          include: {
            billing: true,
          },
        });

        if (!booking) {
          throw new NotFoundException('Booking not found');
        }

        assertCanAccessProperty(user, booking.propertyId);

        if (booking.billing) {
          throw new ConflictException('Invoice already exists for booking');
        }

        const tax = new Prisma.Decimal(createInvoiceDto.tax ?? '0.00');

        return tx.billing.create({
          data: {
            bookingId: booking.id,
            amount: booking.totalAmount,
            tax,
            total: booking.totalAmount.add(tax),
            paymentStatus: PaymentStatus.PENDING,
          },
          include: this.includeRelations(),
        });
      });

      return this.toBillingResponse(billing);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.BillingWhereInput = {
      ...(scopedPropertyId ? { booking: { propertyId: scopedPropertyId } } : {}),
      ...(search
        ? {
            OR: [
              { booking: { guest: { name: { contains: search, mode: 'insensitive' } } } },
              { booking: { guest: { phone: { contains: search, mode: 'insensitive' } } } },
              { booking: { property: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [billings, total] = await this.prisma.$transaction([
      this.prisma.billing.findMany({
        where,
        include: this.includeRelations(),
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      this.prisma.billing.count({ where }),
    ]);

    return paginatedResponse(billings.map((billing) => this.toBillingResponse(billing)), total, page, limit);
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    const billing = await this.prisma.billing.findUnique({
      where: { id },
      include: this.includeRelations(),
    });

    if (!billing) {
      throw new NotFoundException('Invoice not found');
    }

    assertCanAccessProperty(user, billing.booking.propertyId);

    return this.toBillingResponse(billing);
  }

  async addExtraCharge(id: string, addExtraChargeDto: AddExtraChargeDto, user?: AuthenticatedUser) {
    const billing = await this.prisma.$transaction(async (tx) => {
      const existingBilling = await tx.billing.findUnique({
        where: { id },
        include: {
          extraCharges: true,
          booking: true,
        },
      });

      if (!existingBilling) {
        throw new NotFoundException('Invoice not found');
      }

      assertCanAccessProperty(user, existingBilling.booking.propertyId);

      await tx.billingExtraCharge.create({
        data: {
          billingId: id,
          description: addExtraChargeDto.description,
          amount: addExtraChargeDto.amount,
        },
      });

      const extraChargesTotal = existingBilling.extraCharges
        .reduce((total, charge) => total.add(charge.amount), new Prisma.Decimal(0))
        .add(new Prisma.Decimal(addExtraChargeDto.amount));

      return tx.billing.update({
        where: { id },
        data: {
          total: existingBilling.amount.add(existingBilling.tax).add(extraChargesTotal),
        },
        include: this.includeRelations(),
      });
    });

    return this.toBillingResponse(billing);
  }

  async updatePaymentStatus(id: string, updatePaymentStatusDto: UpdatePaymentStatusDto, user?: AuthenticatedUser) {
    try {
      if (user) {
        const existingBilling = await this.prisma.billing.findUnique({
          where: { id },
          include: { booking: true },
        });
        if (!existingBilling) {
          throw new NotFoundException('Invoice not found');
        }
        assertCanAccessProperty(user, existingBilling.booking.propertyId);
      }

      const billing = await this.prisma.billing.update({
        where: { id },
        data: {
          paymentStatus: updatePaymentStatusDto.payment_status,
        },
        include: this.includeRelations(),
      });

      return this.toBillingResponse(billing);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private includeRelations() {
    return {
      booking: {
        include: {
          property: true,
          guest: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      },
      extraCharges: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      payments: {
        orderBy: {
          createdAt: 'desc',
        },
      },
    } satisfies Prisma.BillingInclude;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Invoice not found');
      }

      if (error.code === 'P2002') {
        throw new ConflictException('Invoice already exists for booking');
      }
    }

    throw error;
  }

  private toBillingResponse(billing: BillingWithRelations) {
    const extraChargesTotal = billing.extraCharges.reduce(
      (total, charge) => total.add(charge.amount),
      new Prisma.Decimal(0),
    );
    const paidTotal = billing.payments
      .filter((payment) => payment.status === 'SUCCEEDED')
      .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
    const refundedTotal = billing.payments
      .filter((payment) => payment.status === 'REFUNDED')
      .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
    const balanceDue = billing.total.sub(paidTotal).add(refundedTotal);

    return {
      id: billing.id,
      booking_id: billing.bookingId,
      amount: billing.amount.toNumber(),
      tax: billing.tax.toNumber(),
      extra_charges_total: extraChargesTotal.toNumber(),
      paid_total: paidTotal.toNumber(),
      refunded_total: refundedTotal.toNumber(),
      balance_due: balanceDue.toNumber(),
      total: billing.total.toNumber(),
      payment_status: billing.paymentStatus,
      booking: {
        id: billing.booking.id,
        booking_status: billing.booking.status,
        property: {
          id: billing.booking.property.id,
          name: billing.booking.property.name,
          code: billing.booking.property.code,
        },
        check_in_date: billing.booking.checkInDate.toISOString().slice(0, 10),
        check_out_date: billing.booking.checkOutDate.toISOString().slice(0, 10),
        guest: {
          id: billing.booking.guest.id,
          name: billing.booking.guest.name,
          phone: billing.booking.guest.phone,
          email: billing.booking.guest.email,
        },
        room_category: {
          id: billing.booking.roomCategory.id,
          name: billing.booking.roomCategory.name,
          code: billing.booking.roomCategory.code,
        },
        rate_plan: {
          id: billing.booking.ratePlan.id,
          name: billing.booking.ratePlan.name,
          code: billing.booking.ratePlan.code,
          base_rate: billing.booking.ratePlan.baseRate.toNumber(),
        },
        room: {
          id: billing.booking.room?.id ?? null,
          room_number: billing.booking.room?.roomNumber ?? null,
        },
      },
      extra_charges: billing.extraCharges.map((charge) => ({
        id: charge.id,
        description: charge.description,
        amount: charge.amount.toNumber(),
        created_at: charge.createdAt,
      })),
      payments: billing.payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        provider_reference: payment.providerReference,
        amount: payment.amount.toNumber(),
        status: payment.status,
        created_at: payment.createdAt,
      })),
      created_at: billing.createdAt,
      updated_at: billing.updatedAt,
    };
  }
}
