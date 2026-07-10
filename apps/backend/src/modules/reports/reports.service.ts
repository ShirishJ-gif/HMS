import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  ChannelConnectionStatus,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { GetAnalyticsReportDto } from './dto/get-analytics-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(query: GetAnalyticsReportDto, user?: AuthenticatedUser) {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    if (from > to) throw new BadRequestException('from must be before or equal to to');

    const requestedPropertyId = query.property_id && query.property_id !== 'ALL' ? query.property_id : undefined;
    if (requestedPropertyId) assertCanAccessProperty(user, requestedPropertyId);

    const scopedPropertyId = requestedPropertyId ?? propertyIdFilter(user);
    const accessiblePropertyFilter = propertyIdFilter(user);
    const propertyWhere: Prisma.PropertyWhereInput = accessiblePropertyFilter ? { id: accessiblePropertyFilter } : {};
    const reportPropertyWhere: Prisma.PropertyWhereInput = scopedPropertyId ? { id: scopedPropertyId } : {};
    const reservationGroupVisibilityWhere = this.reservationGroupVisibilityWhere();
    const reservationRoomVisibilityWhere = this.reservationRoomVisibilityWhere();
    const reportWindowStart = this.startOfDay(from);
    const reportWindowEnd = this.addDays(to, 1);
    const reservationRoomRangeWhere: Prisma.ReservationRoomWhereInput = {
      ...reservationRoomVisibilityWhere,
      propertyId: scopedPropertyId,
      OR: [
        {
          arrivalDate: { lte: to },
          departureDate: { gte: from },
        },
        {
          checkedInAt: {
            gte: reportWindowStart,
            lt: reportWindowEnd,
          },
        },
        {
          checkedOutAt: {
            gte: reportWindowStart,
            lt: reportWindowEnd,
          },
        },
      ],
    };

    const [properties, reportProperties, reservationGroups, reservationRooms, billings, channels, paymentTransactions] = await Promise.all([
      this.prisma.property.findMany({
        where: propertyWhere,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.property.findMany({
        where: reportPropertyWhere,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.reservationGroup.findMany({
        where: {
          ...reservationGroupVisibilityWhere,
          propertyId: scopedPropertyId,
          rooms: { some: reservationRoomRangeWhere },
        },
        include: {
          property: { select: { id: true, name: true, code: true } },
          rooms: {
            where: reservationRoomRangeWhere,
            include: {
              roomCategory: { select: { id: true, name: true, code: true } },
            },
          },
        },
      }),
      this.prisma.reservationRoom.findMany({
        where: reservationRoomRangeWhere,
        include: {
          property: { select: { id: true, name: true, code: true } },
          roomCategory: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.billing.findMany({
        where: {
          reservationRoom: reservationRoomRangeWhere,
        },
        include: {
          reservationRoom: {
            include: {
              property: { select: { id: true, name: true, code: true } },
              roomCategory: { select: { id: true, name: true, code: true } },
            },
          },
          payments: true,
        },
      }),
      this.prisma.channelConnection.findMany({
        where: {
          propertyId: scopedPropertyId,
        },
        include: {
          property: { select: { id: true, name: true, code: true } },
          syncLogs: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      }),
      this.prisma.paymentTransaction.findMany({
        where: {
          createdAt: {
            gte: reportWindowStart,
            lt: reportWindowEnd,
          },
          billing: {
            reservationRoom: {
              ...reservationRoomVisibilityWhere,
              ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
            },
          },
        },
      }),
    ]);

    const importedGroups = reservationGroups.filter((group) => !this.isImportBlocked(group));
    const blockedGroups = reservationGroups.filter((group) => this.isImportBlocked(group));
    const activeGroups = importedGroups.filter((group) => group.status === BookingStatus.BOOKED || group.status === BookingStatus.CHECKED_IN).length;
    const cancelledGroups = importedGroups.filter((group) => group.status === BookingStatus.CANCELLED).length;
    const checkedInRoomLines = reservationRooms.filter((room) => room.status === BookingStatus.CHECKED_IN).length;
    const roomNightsSold = reservationRooms.reduce((total, room) => total + this.calcNights(room.arrivalDate, room.departureDate), 0);
    const billedTotal = billings.reduce((total, billing) => total + billing.total.toNumber(), 0);
    const paidTotal = billings.reduce((total, billing) => total + this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED), 0);
    const refundedTotal = billings.reduce((total, billing) => total + this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED), 0);
    const balanceDue = billings.reduce((total, billing) => {
      const paid = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
      const refunded = this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED);
      return total + Math.max(0, billing.total.toNumber() - paid + refunded);
    }, 0);

    return {
      from: this.formatDate(from),
      to: this.formatDate(to),
      property_id: requestedPropertyId ?? 'ALL',
      properties,
      summary: {
        room_nights_sold: roomNightsSold,
        active_reservation_groups: activeGroups,
        billed_total: billedTotal,
        paid_total: paidTotal - refundedTotal,
        refunded_total: refundedTotal,
        balance_due: balanceDue,
        blocked_reservation_groups: blockedGroups.length,
        checked_in_room_lines: checkedInRoomLines,
        reservation_groups: reservationGroups.length,
      },
      reservation_posture: [
        { label: 'Active', value: activeGroups, color: '#10b981' },
        { label: 'Cancelled', value: cancelledGroups, color: '#94a3b8' },
        { label: 'Blocked', value: blockedGroups.length, color: '#f87171' },
        { label: 'Checked-in', value: checkedInRoomLines, color: '#38bdf8' },
      ],
      property_performance: reportProperties.map((property) => this.propertyPerformance(property, importedGroups, blockedGroups, reservationRooms, billings)),
      payments_by_method: this.paymentsByMethod(paymentTransactions),
      room_category_performance: this.roomCategoryPerformance(reservationRooms, billings),
      channel_readiness: channels.map((channel) => this.channelReadiness(channel)),
    };
  }

  private propertyPerformance(
    property: { id: string; name: string; code: string },
    importedGroups: Array<{ propertyId: string }>,
    blockedGroups: Array<{ propertyId: string }>,
    reservationRooms: Array<{ propertyId: string; status: BookingStatus; arrivalDate: Date; departureDate: Date }>,
    billings: Array<{ total: Prisma.Decimal; reservationRoom: { propertyId: string } | null; payments: Array<{ amount: Prisma.Decimal; status: PaymentTransactionStatus }> }>,
  ) {
    const propertyBillings = billings.filter((billing) => billing.reservationRoom?.propertyId === property.id);
    const allBilled = billings.reduce((total, billing) => total + billing.total.toNumber(), 0);
    const billed = propertyBillings.reduce((total, billing) => total + billing.total.toNumber(), 0);
    const balance = propertyBillings.reduce((total, billing) => {
      const paid = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
      const refunded = this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED);
      return total + Math.max(0, billing.total.toNumber() - paid + refunded);
    }, 0);
    const propertyRooms = reservationRooms.filter((room) => room.propertyId === property.id);

    return {
      id: property.id,
      name: property.name,
      code: property.code,
      groups: importedGroups.filter((group) => group.propertyId === property.id).length,
      blocked: blockedGroups.filter((group) => group.propertyId === property.id).length,
      nights: propertyRooms.reduce((total, room) => total + this.calcNights(room.arrivalDate, room.departureDate), 0),
      inhouse: propertyRooms.filter((room) => room.status === BookingStatus.CHECKED_IN).length,
      billed,
      balance,
      share: allBilled > 0 ? Math.round((billed / allBilled) * 100) : 0,
    };
  }

  private paymentsByMethod(payments: Array<{ provider: string; amount: Prisma.Decimal; status: PaymentTransactionStatus }>) {
    const rows = new Map<string, number>();
    for (const payment of payments.filter((entry) => entry.status === PaymentTransactionStatus.SUCCEEDED)) {
      rows.set(payment.provider, (rows.get(payment.provider) ?? 0) + payment.amount.toNumber());
    }
    return Array.from(rows.entries()).map(([provider, amount]) => ({ provider, amount }));
  }

  private roomCategoryPerformance(
    reservationRooms: Array<{ roomCategoryId: string; roomCategory: { id: string; name: string; code: string }; arrivalDate: Date; departureDate: Date }>,
    billings: Array<{ total: Prisma.Decimal; reservationRoom: { roomCategoryId: string } | null }>,
  ) {
    const categories = new Map<string, { id: string; name: string; code: string; room_nights: number; billed_total: number }>();
    for (const room of reservationRooms) {
      const current = categories.get(room.roomCategoryId) ?? {
        id: room.roomCategory.id,
        name: room.roomCategory.name,
        code: room.roomCategory.code,
        room_nights: 0,
        billed_total: 0,
      };
      current.room_nights += this.calcNights(room.arrivalDate, room.departureDate);
      categories.set(room.roomCategoryId, current);
    }
    for (const billing of billings) {
      if (!billing.reservationRoom) continue;
      const current = categories.get(billing.reservationRoom.roomCategoryId);
      if (current) current.billed_total += billing.total.toNumber();
    }
    return Array.from(categories.values());
  }

  private channelReadiness(channel: {
    id: string;
    provider: string;
    externalHotelId: string | null;
    property: { id: string; name: string; code: string };
    syncLogs: Array<{ syncType: string; status: string }>;
  }) {
    const otaName = channel.provider;
    const roomsActivated = Boolean(channel.externalHotelId);
    const latestInventory = channel.syncLogs.find((log) => log.syncType === 'INVENTORY');
    const latestBookings = channel.syncLogs.find((log) => log.syncType === 'BOOKINGS');

    return {
      id: channel.id,
      property_id: channel.property.id,
      property_name: channel.property.name,
      ota_name: otaName,
      ready: roomsActivated,
      rooms_activated: roomsActivated,
      last_inventory_status: latestInventory?.status ?? null,
      last_bookings_status: latestBookings?.status ?? null,
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

  private parseDate(value: string, field: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private startOfDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private addDays(value: Date, days: number) {
    const next = this.startOfDay(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private calcNights(arrival: Date, departure: Date) {
    return Math.max(0, Math.round((this.startOfDay(departure).getTime() - this.startOfDay(arrival).getTime()) / 86_400_000));
  }

  private sumPayments(payments: Array<{ amount: Prisma.Decimal; status: PaymentTransactionStatus }>, status: PaymentTransactionStatus) {
    return payments.filter((payment) => payment.status === status).reduce((total, payment) => total + payment.amount.toNumber(), 0);
  }

  private isImportBlocked(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.asRecord(group.rawPayload);
    return rawPayload.importBlocked === true;
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
