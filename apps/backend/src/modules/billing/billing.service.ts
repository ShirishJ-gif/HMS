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
    reservationRoom: {
      include: {
        reservationGroup: {
          include: {
            property: true;
            primaryGuest: true;
          };
        };
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
        const tax = new Prisma.Decimal(createInvoiceDto.tax ?? '0.00');

        const reservationRoom = await tx.reservationRoom.findUnique({
          where: { id: createInvoiceDto.reservation_room_id },
          include: {
            reservationGroup: true,
          },
        });

        if (!reservationRoom) {
          throw new NotFoundException('Imported reservation room not found');
        }

        assertCanAccessProperty(user, reservationRoom.propertyId);

        const existingReservationRoomBilling = await tx.billing.findUnique({
          where: { reservationRoomId: reservationRoom.id },
        });

        if (existingReservationRoomBilling) {
          throw new ConflictException('Invoice already exists for imported room stay');
        }

        const amount = reservationRoom.totalAmount ?? new Prisma.Decimal(0);

        return tx.billing.create({
          data: {
            reservationRoomId: reservationRoom.id,
            amount,
            tax,
            total: amount.add(tax),
            paymentStatus: PaymentStatus.PENDING,
          },
          include: this.includeRelations(),
        });
      });

      return this.toBillingResponse(
        await this.prisma.billing.findUniqueOrThrow({
          where: { id: billing.id },
          include: this.includeRelations(),
        }),
      );
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.BillingWhereInput = {
      AND: [
        { reservationRoomId: { not: null } },
        ...(scopedPropertyId ? [{ reservationRoom: { propertyId: scopedPropertyId } } satisfies Prisma.BillingWhereInput] : []),
        ...(search
          ? [
              {
                OR: [
                  { reservationRoom: { guestName: { contains: search, mode: 'insensitive' } } },
                  { reservationRoom: { reservationGroup: { externalReservationId: { contains: search, mode: 'insensitive' } } } },
                  { reservationRoom: { reservationGroup: { property: { name: { contains: search, mode: 'insensitive' } } } } },
                ],
              } satisfies Prisma.BillingWhereInput,
            ]
          : []),
      ],
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

    assertCanAccessProperty(user, this.subjectPropertyId(billing));

    return this.toBillingResponse(billing);
  }

  async findReservationGroupFolio(id: string, user?: AuthenticatedUser) {
    const group = await this.prisma.reservationGroup.findUnique({
      where: { id },
      include: {
        property: true,
        primaryGuest: true,
        rooms: {
          include: {
            roomCategory: true,
            ratePlan: true,
            room: true,
            billings: {
              include: this.includeRelations(),
            },
          },
          orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Reservation group not found');
    }

    assertCanAccessProperty(user, group.propertyId);

    const lineInvoices = group.rooms.flatMap((room) => room.billings.map((billing) => this.toBillingResponse(billing)));
    const billedTotal = lineInvoices.reduce((total, invoice) => total + invoice.total, 0);
    const paidTotal = lineInvoices.reduce((total, invoice) => total + invoice.paid_total, 0);
    const refundedTotal = lineInvoices.reduce((total, invoice) => total + invoice.refunded_total, 0);
    const balanceDue = lineInvoices.reduce((total, invoice) => total + invoice.balance_due, 0);

    return {
      reservation_group_id: group.id,
      external_reservation_id: group.externalReservationId,
      reservation_status: group.status,
      property: {
        id: group.property.id,
        name: group.property.name,
        code: group.property.code,
      },
      guest: group.primaryGuest
        ? {
            id: group.primaryGuest.id,
            name: group.primaryGuest.name,
            phone: group.primaryGuest.phone,
            email: group.primaryGuest.email,
          }
        : null,
      room_count: group.rooms.length,
      invoiced_room_count: group.rooms.filter((room) => room.billings.length > 0).length,
      total_amount: group.totalAmount?.toNumber() ?? 0,
      billed_total: billedTotal,
      paid_total: paidTotal,
      refunded_total: refundedTotal,
      balance_due: balanceDue,
      invoices: lineInvoices,
      rooms: group.rooms.map((room) => ({
        id: room.id,
        external_room_reservation_id: room.externalRoomReservationId,
        arrival_date: room.arrivalDate.toISOString().slice(0, 10),
        departure_date: room.departureDate.toISOString().slice(0, 10),
        total_amount: room.totalAmount?.toNumber() ?? 0,
        reservation_status: room.status,
        room_category: {
          id: room.roomCategory.id,
          name: room.roomCategory.name,
          code: room.roomCategory.code,
        },
        rate_plan: {
          id: room.ratePlan.id,
          name: room.ratePlan.name,
          code: room.ratePlan.code,
        },
        room: {
          id: room.room?.id ?? null,
          room_number: room.room?.roomNumber ?? null,
        },
        billing_id: room.billings[0]?.id ?? null,
      })),
    };
  }

  async generateMissingInvoicesForReservationGroup(id: string, user?: AuthenticatedUser) {
    const group = await this.prisma.$transaction(async (tx) => {
      const reservationGroup = await tx.reservationGroup.findUnique({
        where: { id },
        include: {
          rooms: {
            include: {
              billings: true,
            },
          },
        },
      });

      if (!reservationGroup) {
        throw new NotFoundException('Reservation group not found');
      }

      assertCanAccessProperty(user, reservationGroup.propertyId);

      for (const room of reservationGroup.rooms) {
        if (room.status !== 'CHECKED_OUT' || room.billings.length > 0) {
          continue;
        }

        const amount = room.totalAmount ?? new Prisma.Decimal(0);
        await tx.billing.create({
          data: {
            reservationRoomId: room.id,
            amount,
            tax: new Prisma.Decimal(0),
            total: amount,
            paymentStatus: PaymentStatus.PENDING,
          },
        });
      }

      return reservationGroup;
    });

    return this.findReservationGroupFolio(group.id, user);
  }

  async addExtraCharge(id: string, addExtraChargeDto: AddExtraChargeDto, user?: AuthenticatedUser) {
    const billing = await this.prisma.$transaction(async (tx) => {
      const existingBilling = await tx.billing.findUnique({
        where: { id },
        include: this.includeRelations(),
      });

      if (!existingBilling) {
        throw new NotFoundException('Invoice not found');
      }

      assertCanAccessProperty(user, this.subjectPropertyId(existingBilling));

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
          include: this.includeRelations(),
        });
        if (!existingBilling) {
          throw new NotFoundException('Invoice not found');
        }
        assertCanAccessProperty(user, this.subjectPropertyId(existingBilling));
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
      reservationRoom: {
        include: {
          reservationGroup: {
            include: {
              property: true,
              primaryGuest: true,
            },
          },
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
        throw new ConflictException('Invoice already exists for imported room stay');
      }
    }

    throw error;
  }

  private subjectPropertyId(billing: { reservationRoom?: { propertyId: string } | null }) {
    const propertyId = billing.reservationRoom?.propertyId;
    if (!propertyId) {
      throw new NotFoundException('Invoice is missing a property scope');
    }

    return propertyId;
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
    const subject = billing.reservationRoom
      ? {
          reservation_room_id: billing.reservationRoomId,
          reservation_room: {
            id: billing.reservationRoom.id,
            reservation_group_id: billing.reservationRoom.reservationGroupId,
            external_room_reservation_id: billing.reservationRoom.externalRoomReservationId,
            external_reservation_id: billing.reservationRoom.reservationGroup.externalReservationId,
            reservation_status: billing.reservationRoom.status,
            property: {
              id: billing.reservationRoom.reservationGroup.property.id,
              name: billing.reservationRoom.reservationGroup.property.name,
              code: billing.reservationRoom.reservationGroup.property.code,
            },
            check_in_date: billing.reservationRoom.arrivalDate.toISOString().slice(0, 10),
            check_out_date: billing.reservationRoom.departureDate.toISOString().slice(0, 10),
            guest: {
              id: billing.reservationRoom.reservationGroup.primaryGuest?.id ?? null,
              name:
                billing.reservationRoom.guestName ??
                billing.reservationRoom.reservationGroup.primaryGuest?.name ??
                'Imported guest',
              phone: billing.reservationRoom.reservationGroup.primaryGuest?.phone ?? null,
              email: billing.reservationRoom.reservationGroup.primaryGuest?.email ?? null,
            },
            room_category: {
              id: billing.reservationRoom.roomCategory.id,
              name: billing.reservationRoom.roomCategory.name,
              code: billing.reservationRoom.roomCategory.code,
            },
            rate_plan: {
              id: billing.reservationRoom.ratePlan.id,
              name: billing.reservationRoom.ratePlan.name,
              code: billing.reservationRoom.ratePlan.code,
              base_rate: billing.reservationRoom.ratePlan.baseRate.toNumber(),
            },
            room: {
              id: billing.reservationRoom.room?.id ?? null,
              room_number: billing.reservationRoom.room?.roomNumber ?? null,
            },
          },
        }
      : (() => {
          throw new NotFoundException('Invoice is missing a reservation room subject');
        })();

    return {
      id: billing.id,
      reservation_room_id: subject.reservation_room_id,
      amount: billing.amount.toNumber(),
      tax: billing.tax.toNumber(),
      extra_charges_total: extraChargesTotal.toNumber(),
      paid_total: paidTotal.toNumber(),
      refunded_total: refundedTotal.toNumber(),
      balance_due: balanceDue.toNumber(),
      total: billing.total.toNumber(),
      payment_status: billing.paymentStatus,
      reservation_room: subject.reservation_room,
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
