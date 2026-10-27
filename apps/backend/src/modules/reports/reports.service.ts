import { financialRange, folioStayWhere, financialGroupVisibilityWhere } from '../billing/financial-scope';
import { Injectable } from '@nestjs/common';
import { ChannelConnectionStatus, PaymentTransactionStatus, Prisma, PropertyType, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { GetAnalyticsReportDto } from './dto/get-analytics-report.dto';
import { calculatePeriod, dateKey, DAY_MS, daysBetween, money } from './report-metrics';

const roomInclude = {
  property: { select: { id: true, name: true, code: true, propertyType: true } },
  roomCategory: { select: { id: true, name: true, code: true } },
  reservationGroup: { select: { id: true, externalReservationId: true, status: true, rawPayload: true } },
  billings: { include: { payments: true, extraCharges: true } },
} satisfies Prisma.ReservationRoomInclude;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(query: GetAnalyticsReportDto, user?: AuthenticatedUser) {
    const { from, end } = financialRange(query.from, query.to)!;
    const days = daysBetween(from, end);
    const previousFrom = new Date(from.getTime() - days * DAY_MS);
    const requestedPropertyId = query.property_id && query.property_id !== 'ALL' ? query.property_id : undefined;
    if (requestedPropertyId) assertCanAccessProperty(user, requestedPropertyId);
    // An owner with no properties has an empty report scope, never an unrestricted one.
    const accessiblePropertyFilter =
      user?.role === UserRole.ORG_OWNER ? { in: user.property_ids ?? [] } : propertyIdFilter(user);
    const scopedPropertyId = requestedPropertyId ?? accessiblePropertyFilter;
    const visibility = { reservationGroup: financialGroupVisibilityWhere() };
    const scopedRooms = { ...visibility, propertyId: scopedPropertyId };
    const [properties, rooms, payments, inventory, channels, expenses] = await Promise.all([
      this.prisma.property.findMany({
        where: { id: accessiblePropertyFilter },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, propertyType: true },
      }),
      this.prisma.reservationRoom.findMany({
        where: { ...scopedRooms, AND: [{ reservationGroup: folioStayWhere({ from: previousFrom, end }) }] },
        include: roomInclude,
      }),
      this.prisma.paymentTransaction.findMany({
        where: { createdAt: { gte: previousFrom, lt: end }, billing: { reservationRoom: scopedRooms } },
        include: {
          billing: {
            select: {
              reservationRoom: {
                select: {
                  propertyId: true,
                  property: { select: { name: true } },
                  reservationGroup: { select: { id: true, externalReservationId: true, rawPayload: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.room.findMany({
        where: { propertyId: scopedPropertyId },
        select: {
          propertyId: true,
          status: true,
          outOfServicePeriods: {
            where: { fromDate: { lt: end }, toDate: { gte: previousFrom } },
            select: { fromDate: true, toDate: true },
          },
        },
      }),
      this.prisma.channelConnection.findMany({
        where: { propertyId: scopedPropertyId, property: { propertyType: PropertyType.HOTEL } },
        include: {
          property: { select: { name: true } },
          syncLogs: {
            where: { syncType: { in: ['INVENTORY', 'BOOKINGS'] } },
            orderBy: { createdAt: 'desc' },
            distinct: ['syncType'],
          },
        },
      }),
      this.prisma.expense.groupBy({
        by: ['category', 'currency'],
        where: { propertyId: scopedPropertyId, expenseDate: { gte: from, lt: end }, status: { not: 'VOID' } },
        _sum: { amount: true, amountPaid: true },
        _count: { _all: true, amountPaid: true },
        orderBy: [{ currency: 'asc' }, { category: 'asc' }],
      }),
    ]);
    const current = calculatePeriod(rooms, payments, inventory, from, end);
    const previous = calculatePeriod(rooms, payments, inventory, previousFrom, from);
    const reportProperties = properties.filter((p) => !requestedPropertyId || p.id === requestedPropertyId);
    const propertyPerformance = reportProperties.map((property) => {
      const period = calculatePeriod(
        rooms.filter((r) => r.propertyId === property.id),
        payments.filter((p) => p.billing.reservationRoom?.propertyId === property.id),
        inventory.filter((r) => r.propertyId === property.id),
        from,
        end,
      );
      return {
        id: property.id,
        name: property.name,
        code: property.code,
        property_type: property.propertyType,
        groups: period.summary.reservation_groups,
        blocked: period.summary.blocked_reservation_groups,
        nights: period.summary.room_nights_sold,
        inhouse: period.summary.checked_in_room_lines,
        billed: period.summary.billed_total,
        balance: period.summary.balance_due,
        occupancy_rate: period.summary.occupancy_rate,
        average_daily_rate: period.summary.average_daily_rate,
        share:
          current.summary.billed_total > 0
            ? money((period.summary.billed_total / current.summary.billed_total) * 100)
            : 0,
      };
    });
    const categories = [
      ...new Map(
        rooms
          .filter((r) => r.arrivalDate < end && r.departureDate > from)
          .map((r) => [r.roomCategoryId, { ...r.roomCategory, property_name: r.property.name }]),
      ).values(),
    ];
    const categoryPerformance = categories.map((category) => {
      const period = calculatePeriod(
        rooms.filter((r) => r.roomCategoryId === category.id),
        [],
        [],
        from,
        end,
      );
      return { ...category, room_nights: period.summary.room_nights_sold, billed_total: period.summary.room_revenue };
    });
    const methods = [
      ...new Set(
        current.transactions
          .filter(
            (p) => p.status === PaymentTransactionStatus.SUCCEEDED || p.status === PaymentTransactionStatus.REFUNDED,
          )
          .map((p) => p.provider),
      ),
    ].map((provider) => {
      const rows = current.transactions.filter((p) => p.provider === provider);
      const collected = rows
        .filter((p) => p.status === PaymentTransactionStatus.SUCCEEDED)
        .reduce((sum, p) => sum + p.amount.toNumber(), 0);
      const refunded = rows
        .filter((p) => p.status === PaymentTransactionStatus.REFUNDED)
        .reduce((sum, p) => sum + p.amount.toNumber(), 0);
      return { provider, collected: money(collected), refunded: money(refunded), amount: money(collected - refunded) };
    });
    // Bucket actual dates into at most 12 points. Each point remains reconcilable to the selected totals.
    const bucketDays = Math.ceil(days / 12);
    const trend = [];
    for (let time = from.getTime(); time < end.getTime(); time += bucketDays * DAY_MS) {
      const bucketEnd = new Date(Math.min(end.getTime(), time + bucketDays * DAY_MS));
      const period = calculatePeriod(rooms, payments, [], new Date(time), bucketEnd);
      const previousStart = new Date(time - days * DAY_MS);
      const previousEnd = new Date(bucketEnd.getTime() - days * DAY_MS);
      const prior = calculatePeriod(rooms, payments, [], previousStart, previousEnd);
      trend.push({
        from: dateKey(new Date(time)),
        to: dateKey(new Date(bucketEnd.getTime() - DAY_MS)),
        billed: period.summary.room_revenue,
        collected: period.summary.period_net_collected,
        room_nights: period.summary.room_nights_sold,
        previous_from: dateKey(previousStart),
        previous_to: dateKey(new Date(previousEnd.getTime() - DAY_MS)),
        previous_billed: prior.summary.room_revenue,
        previous_collected: prior.summary.period_net_collected,
      });
    }
    return {
      from: query.from,
      to: query.to,
      property_id: requestedPropertyId ?? 'ALL',
      generated_at: new Date().toISOString(),
      properties: properties.map(({ propertyType, ...property }) => ({ ...property, property_type: propertyType })),
      summary: current.summary,
      comparison: {
        from: dateKey(previousFrom),
        to: dateKey(new Date(from.getTime() - DAY_MS)),
        summary: previous.summary,
      },
      trend,
      expenses_by_category: expenses.map((row) => ({
        category: row.category,
        currency: row.currency,
        amount: Number(row._sum.amount ?? 0),
        recorded_paid: Number(row._sum.amountPaid ?? 0),
        count: row._count._all,
        unknown_payment_count: row._count._all - row._count.amountPaid,
      })),
      reservation_posture: current.reservation_posture,
      property_performance: propertyPerformance,
      payments_by_method: methods,
      room_category_performance: categoryPerformance,
      reservations: current.reservations,
      folios: current.folios,
      transactions: current.transactions
        .filter(
          (p) => p.status === PaymentTransactionStatus.SUCCEEDED || p.status === PaymentTransactionStatus.REFUNDED,
        )
        .map((p) => ({
          id: p.id,
          provider: p.provider,
          amount: p.amount.toNumber(),
          status: p.status,
          date: p.createdAt.toISOString(),
          group_id: p.billing.reservationRoom?.reservationGroup.id,
          reference: p.billing.reservationRoom?.reservationGroup.externalReservationId ?? '—',
          property_name: p.billing.reservationRoom?.property.name ?? '—',
        })),
      channel_readiness: channels.map((channel) => {
        const credentials = this.asRecord(channel.credentials);
        const setup = this.asRecord(credentials.setup_status);
        const inventorySync = channel.syncLogs.find((log) => log.syncType === 'INVENTORY');
        const bookingsSync = channel.syncLogs.find((log) => log.syncType === 'BOOKINGS');
        return {
          id: channel.id,
          property_name: channel.property.name,
          ota_name: channel.name || channel.provider,
          ready:
            channel.status === ChannelConnectionStatus.ACTIVE &&
            setup.ready === true &&
            setup.disconnected !== true &&
            inventorySync?.status === 'SUCCEEDED' &&
            bookingsSync?.status === 'SUCCEEDED',
          rooms_activated: setup.rooms_activated === true,
          last_inventory_status: inventorySync?.status ?? null,
          last_bookings_status: bookingsSync?.status ?? null,
          last_inventory_at: inventorySync?.createdAt.toISOString() ?? null,
          last_bookings_at: bookingsSync?.createdAt.toISOString() ?? null,
        };
      }),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
}
