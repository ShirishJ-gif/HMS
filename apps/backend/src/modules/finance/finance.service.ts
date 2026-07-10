import { Injectable } from '@nestjs/common';
import { BookingStatus, ChannelConnectionStatus, PaymentTransactionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { GetFinanceOverviewDto } from './dto/get-finance-overview.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: GetFinanceOverviewDto, user?: AuthenticatedUser) {
    const requestedPropertyId = query.property_id && query.property_id !== 'ALL' ? query.property_id : undefined;
    if (requestedPropertyId) assertCanAccessProperty(user, requestedPropertyId);

    const scopedPropertyId = requestedPropertyId ?? propertyIdFilter(user);
    const reservationGroupVisibilityWhere = this.reservationGroupVisibilityWhere();
    const reservationRoomVisibilityWhere = this.reservationRoomVisibilityWhere();

    const [billings, reservationGroups, transactionCount] = await Promise.all([
      this.prisma.billing.findMany({
        where: {
          reservationRoom: {
            ...reservationRoomVisibilityWhere,
            ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
          },
        },
        include: {
          reservationRoom: {
            include: {
              reservationGroup: {
                include: {
                  property: { select: { id: true, name: true, code: true } },
                  primaryGuest: true,
                },
              },
              roomCategory: true,
              ratePlan: true,
              room: true,
            },
          },
          extraCharges: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reservationGroup.findMany({
        where: {
          ...reservationGroupVisibilityWhere,
          propertyId: scopedPropertyId,
          rooms: {
            some: {
              OR: [
                { status: BookingStatus.CHECKED_OUT },
                { billings: { some: {} } },
              ],
            },
          },
        },
        include: {
          property: { select: { id: true, name: true, code: true } },
          primaryGuest: true,
          channelConnection: true,
          rooms: {
            include: {
              roomCategory: true,
              ratePlan: true,
              room: true,
              billings: { select: { id: true } },
            },
            orderBy: { arrivalDate: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentTransaction.count({
        where: {
          billing: {
            reservationRoom: {
              ...reservationRoomVisibilityWhere,
              ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
            },
          },
        },
      }),
    ]);

    const invoiceResponses = billings.map((billing) => this.toBillingResponse(billing));
    const totalBilled = invoiceResponses.reduce((total, billing) => total + billing.total, 0);
    const totalCollected = invoiceResponses.reduce((total, billing) => total + billing.paid_total - billing.refunded_total, 0);
    const totalBalance = invoiceResponses.reduce((total, billing) => total + billing.balance_due, 0);

    return {
      summary: {
        total_billed: totalBilled,
        total_collected: totalCollected,
        total_balance: totalBalance,
        open_invoice_count: invoiceResponses.filter((billing) => billing.balance_due > 0).length,
        invoice_count: invoiceResponses.length,
        transaction_count: transactionCount,
      },
      billings: invoiceResponses,
      reservation_groups: reservationGroups.map((group) => this.toReservationGroupResponse(group)),
    };
  }

  private toBillingResponse(billing: {
    id: string;
    reservationRoomId: string | null;
    amount: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    paymentStatus: string;
    createdAt: Date;
    updatedAt: Date;
    reservationRoom: {
      id: string;
      reservationGroupId: string;
      externalRoomReservationId: string;
      status: BookingStatus;
      arrivalDate: Date;
      departureDate: Date;
      guestName: string | null;
      reservationGroup: {
        externalReservationId: string;
        property: { id: string; name: string; code: string };
        primaryGuest: { id: string; name: string; phone: string | null; email: string | null } | null;
      };
      roomCategory: { id: string; name: string; code: string };
      ratePlan: { id: string; name: string; code: string; baseRate: Prisma.Decimal };
      room: { id: string; roomNumber: string } | null;
    } | null;
    extraCharges: Array<{ id: string; description: string; amount: Prisma.Decimal; createdAt: Date }>;
    payments: Array<{ id: string; provider: string; providerReference: string | null; amount: Prisma.Decimal; status: PaymentTransactionStatus; createdAt: Date }>;
  }) {
    if (!billing.reservationRoom || !billing.reservationRoomId) {
      throw new Error('Invoice is missing a reservation room subject');
    }

    const paidTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
    const refundedTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED);
    const balanceDue = Math.max(0, billing.total.toNumber() - paidTotal + refundedTotal);

    return {
      id: billing.id,
      reservation_room_id: billing.reservationRoomId,
      amount: billing.amount.toNumber(),
      tax: billing.tax.toNumber(),
      extra_charges_total: billing.extraCharges.reduce((total, charge) => total + charge.amount.toNumber(), 0),
      paid_total: paidTotal,
      refunded_total: refundedTotal,
      balance_due: balanceDue,
      total: billing.total.toNumber(),
      payment_status: billing.paymentStatus,
      reservation_room: {
        id: billing.reservationRoom.id,
        reservation_group_id: billing.reservationRoom.reservationGroupId,
        external_room_reservation_id: billing.reservationRoom.externalRoomReservationId,
        external_reservation_id: billing.reservationRoom.reservationGroup.externalReservationId,
        reservation_status: billing.reservationRoom.status,
        property: billing.reservationRoom.reservationGroup.property,
        check_in_date: this.formatDate(billing.reservationRoom.arrivalDate),
        check_out_date: this.formatDate(billing.reservationRoom.departureDate),
        guest: {
          id: billing.reservationRoom.reservationGroup.primaryGuest?.id ?? null,
          name: billing.reservationRoom.guestName ?? billing.reservationRoom.reservationGroup.primaryGuest?.name ?? 'Imported guest',
          phone: billing.reservationRoom.reservationGroup.primaryGuest?.phone ?? null,
          email: billing.reservationRoom.reservationGroup.primaryGuest?.email ?? null,
        },
        room_category: billing.reservationRoom.roomCategory,
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

  private toReservationGroupResponse(group: {
    id: string;
    propertyId: string;
    primaryGuestId: string | null;
    channelConnectionId: string | null;
    externalReservationId: string;
    externalReservationVersion: string | null;
    externalStatus: string | null;
    source: string | null;
    currency: string | null;
    totalAmount: Prisma.Decimal | null;
    status: BookingStatus;
    remarks: string | null;
    bookedAt: Date | null;
    modifiedAt: Date | null;
    rawPayload: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    property: { id: string; name: string; code: string };
    primaryGuest: { id: string; name: string; phone: string | null; email: string | null } | null;
    channelConnection: { provider: string; name: string } | null;
    rooms: Array<{
      id: string;
      externalRoomReservationId: string;
      externalRoomId: string;
      arrivalDate: Date;
      departureDate: Date;
      totalAmount: Prisma.Decimal | null;
      currency: string | null;
      status: BookingStatus;
      guestName: string | null;
      adults: number | null;
      children: number | null;
      checkedInAt: Date | null;
      checkedOutAt: Date | null;
      roomCategory: { id: string; name: string; code: string };
      ratePlan: { id: string; name: string; code: string; baseRate: Prisma.Decimal; currency: string };
      room: { id: string; roomNumber: string; status: string } | null;
      billings: Array<{ id: string }>;
    }>;
  }) {
    const arrivalDates = group.rooms.map((room) => this.formatDate(room.arrivalDate)).sort();
    const departureDates = group.rooms.map((room) => this.formatDate(room.departureDate)).sort();
    const roomTotal = group.rooms.reduce((total, room) => total + (room.totalAmount?.toNumber() ?? 0), 0);
    const groupTotal = group.totalAmount?.toNumber();

    return {
      id: group.id,
      property_id: group.propertyId,
      primary_guest_id: group.primaryGuestId,
      channel_connection_id: group.channelConnectionId,
      external_reservation_id: group.externalReservationId,
      external_reservation_version: group.externalReservationVersion,
      external_status: group.externalStatus,
      source: this.connectionSourceLabel(group.channelConnection) ?? group.source,
      currency: group.currency,
      total_amount: groupTotal == null || groupTotal <= 0 ? roomTotal || null : groupTotal,
      reservation_status: group.status,
      remarks: group.remarks,
      booked_at: group.bookedAt?.toISOString() ?? null,
      modified_at: group.modifiedAt?.toISOString() ?? null,
      arrival_date: arrivalDates[0] ?? null,
      departure_date: departureDates[departureDates.length - 1] ?? null,
      import_blocked: this.isImportBlocked(group),
      import_error: this.importError(group),
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
      property: group.property,
      primary_guest: group.primaryGuest,
      rooms: group.rooms.map((room) => ({
        id: room.id,
        external_room_reservation_id: room.externalRoomReservationId,
        external_room_id: room.externalRoomId,
        arrival_date: this.formatDate(room.arrivalDate),
        departure_date: this.formatDate(room.departureDate),
        total_amount: room.totalAmount?.toNumber() ?? null,
        currency: room.currency,
        reservation_status: room.status,
        guest_name: room.guestName,
        adults: room.adults,
        children: room.children,
        checked_in_at: room.checkedInAt?.toISOString() ?? null,
        checked_out_at: room.checkedOutAt?.toISOString() ?? null,
        room_category: room.roomCategory,
        rate_plan: {
          id: room.ratePlan.id,
          name: room.ratePlan.name,
          code: room.ratePlan.code,
          base_rate: room.ratePlan.baseRate.toNumber(),
          currency: room.ratePlan.currency,
        },
        room: {
          id: room.room?.id ?? null,
          room_number: room.room?.roomNumber ?? null,
          status: room.room?.status ?? null,
        },
      })),
    };
  }

  private reservationGroupVisibilityWhere(): Prisma.ReservationGroupWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) return {};
    return {
      OR: [
        { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
        { channelConnectionId: null, source: { in: ['DIRECT', 'WALK_IN'] } },
      ],
    };
  }

  private reservationRoomVisibilityWhere(): Prisma.ReservationRoomWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) return {};
    return { reservationGroup: this.reservationGroupVisibilityWhere() };
  }

  private sumPayments(payments: Array<{ amount: Prisma.Decimal; status: PaymentTransactionStatus }>, status: PaymentTransactionStatus) {
    return payments.filter((payment) => payment.status === status).reduce((total, payment) => total + payment.amount.toNumber(), 0);
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private connectionSourceLabel(connection: { provider: string; name: string } | null) {
    if (!connection) return null;
    return connection.name || connection.provider;
  }

  private isImportBlocked(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.asRecord(group.rawPayload);
    return rawPayload.importBlocked === true;
  }

  private importError(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.asRecord(group.rawPayload);
    return typeof rawPayload.importError === 'string' ? rawPayload.importError : null;
  }

  private asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private shouldShowDetachedOtaReservationHistory() {
    return (
      process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY === 'true' ||
      process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production'
    );
  }
}
