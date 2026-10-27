import { recalculateBilling } from '../billing/billing-calculations';
import { financialGroupVisibilityWhere } from '../billing/financial-scope';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';

const DAY = 86_400_000;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const blocked = (raw: unknown) =>
  !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).importBlocked === true;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    referenceDate = new Date(),
    user?: AuthenticatedUser,
    requestedPropertyId?: string,
    requestedDate?: string,
    requestedRange?: { from?: string; to?: string },
  ) {
    if (requestedPropertyId) assertCanAccessProperty(user, requestedPropertyId);
    const scopedPropertyId = requestedPropertyId ?? propertyIdFilter(user);
    const currentDate = new Date(`${this.formatAsiaKolkataDate(referenceDate)}T00:00:00Z`);
    if (requestedRange && (requestedDate || !requestedRange.from || !requestedRange.to)) {
      throw new BadRequestException('Provide both from and to, without date.');
    }
    const serviceDate = requestedRange?.to ?? requestedDate ?? this.formatAsiaKolkataDate(referenceDate);
    const rangeFrom = requestedRange?.from ?? serviceDate;
    const periodStartDate = new Date(`${rangeFrom}T00:00:00Z`);
    const periodEndDate = new Date(`${serviceDate}T00:00:00Z`);
    const periodDays = (periodEndDate.getTime() - periodStartDate.getTime()) / DAY + 1;
    if (!Number.isInteger(periodDays) || periodDays < 1 || periodDays > 366 ||
        periodStartDate.toISOString().slice(0, 10) !== rangeFrom || periodEndDate.toISOString().slice(0, 10) !== serviceDate) {
      throw new BadRequestException('Choose an end date on or after the start, within 366 days.');
    }
    const periodStart = new Date(`${rangeFrom}T00:00:00+05:30`);
    const periodEnd = new Date(new Date(`${serviceDate}T00:00:00+05:30`).getTime() + DAY);
    const previousStart = new Date(periodStart.getTime() - periodDays * DAY);
    const currentNextWeek = new Date(currentDate.getTime() + 7 * DAY);
    const date = new Date(`${serviceDate}T00:00:00Z`);
    const startOfDay = new Date(`${serviceDate}T00:00:00+05:30`);
    const endOfDay = new Date(startOfDay.getTime() + DAY);
    const startOfWeek = new Date(startOfDay.getTime() - 6 * DAY);
    const startOfMonth = new Date(`${serviceDate.slice(0, 7)}-01T00:00:00+05:30`);
    const nextWeek = new Date(date.getTime() + 7 * DAY);
    const visibility = financialGroupVisibilityWhere();
    const roomScope = { propertyId: scopedPropertyId, reservationGroup: visibility };
    const [properties, rooms, groups, stayRooms, payments, billings, tasks] = await Promise.all([
      this.prisma.property.findMany({
        where: { id: scopedPropertyId },
        select: { id: true, name: true, propertyType: true },
      }),
      this.prisma.room.findMany({
        where: { propertyId: scopedPropertyId },
        select: {
          id: true,
          status: true,
          outOfServicePeriods: {
            where: { fromDate: { lte: currentDate }, toDate: { gte: currentDate } },
            select: { id: true },
          },
        },
      }),
      this.prisma.reservationGroup.findMany({
        where: {
          ...visibility,
          propertyId: scopedPropertyId,
          AND: [
            {
              OR: [
                { createdAt: { gte: periodStart, lt: periodEnd } },
                { status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] } },
              ],
            },
          ],
        },
        select: { id: true, status: true, createdAt: true, rawPayload: true },
      }),
      this.prisma.reservationRoom.findMany({
        where: {
          ...roomScope,
          status: { not: BookingStatus.CANCELLED },
          OR: [
            {
              arrivalDate: { gte: date, lt: nextWeek },
              status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
            },
            { arrivalDate: { gte: periodStartDate, lte: periodEndDate } },
            { departureDate: { gte: periodStartDate, lte: periodEndDate } },
            { arrivalDate: { gte: currentDate, lt: currentNextWeek } },
            { departureDate: currentDate },
          ],
        },
        orderBy: [{ arrivalDate: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          roomId: true,
          arrivalDate: true,
          departureDate: true,
          status: true,
          guestName: true,
          property: { select: { id: true, name: true } },
          room: { select: { roomNumber: true } },
          roomCategory: { select: { name: true } },
          reservationGroup: {
            select: {
              id: true,
              externalReservationId: true,
              status: true,
              rawPayload: true,
              primaryGuest: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.paymentTransaction.findMany({
        where: {
          createdAt: { gte: new Date(Math.min(startOfWeek.getTime(), startOfMonth.getTime(), previousStart.getTime())), lt: endOfDay },
          status: { in: ['SUCCEEDED', 'REFUNDED'] },
          billing: { reservationRoom: roomScope },
        },
        select: {
          amount: true,
          status: true,
          createdAt: true,
          billing: {
            select: {
              reservationRoom: {
                select: {
                  reservationGroup: {
                    select: {
                      source: true,
                      rawPayload: true,
                      channelConnection: { select: { provider: true, name: true, credentials: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.billing.findMany({
        where: { paymentStatus: { not: PaymentStatus.PAID }, reservationRoom: roomScope },
        select: {
          amount: true,
          tax: true,
          extraCharges: { select: { description: true, amount: true } },
          payments: { select: { amount: true, status: true, metadata: true } },
          reservationRoom: { select: { reservationGroup: { select: { rawPayload: true } } } },
        },
      }),
      this.prisma.housekeepingTask.findMany({
        where: {
          propertyId: scopedPropertyId,
          completedAt: null,
          status: { in: ['DIRTY', 'CLEANING', 'OUT_OF_SERVICE'] },
        },
        select: { status: true, dueDate: true },
      }),
    ]);
    const visibleGroups = groups.filter((group) => !blocked(group.rawPayload));
    const visibleStays = stayRooms.filter(
      (room) => !blocked(room.reservationGroup.rawPayload) && room.reservationGroup.status !== BookingStatus.CANCELLED,
    );
    const visiblePayments = payments.filter(
      (payment) => !blocked(payment.billing.reservationRoom?.reservationGroup.rawPayload),
    );
    const arrivals = visibleStays.filter(
      (room) => room.arrivalDate.getTime() === date.getTime() && room.status !== BookingStatus.CANCELLED,
    );
    const departures = visibleStays.filter(
      (room) => room.departureDate.getTime() === date.getTime() && room.status !== BookingStatus.CANCELLED,
    );
    const upcoming = visibleStays.filter(
      (room) => room.arrivalDate > date && room.arrivalDate < nextWeek && room.status === BookingStatus.BOOKED,
    );
    const arrivalPending = arrivals.filter((room) => room.status === BookingStatus.BOOKED);
    const departurePending = departures.filter((room) => room.status !== BookingStatus.CHECKED_OUT);
    const occupiedRooms = rooms.filter((room) => room.status === RoomStatus.OCCUPIED).length;
    const outOfService = rooms.filter(
      (room) =>
        room.status !== RoomStatus.OCCUPIED &&
        (room.status === RoomStatus.MAINTENANCE || room.outOfServicePeriods.length > 0),
    ).length;
    const signedAmount = (payment: (typeof payments)[number]) =>
      payment.amount.toNumber() * (payment.status === 'REFUNDED' ? -1 : 1);
    const todayPayments = visiblePayments.filter(
      (payment) => payment.createdAt >= startOfDay && payment.createdAt < endOfDay,
    );
    const yesterdayPayments = visiblePayments.filter(
      (payment) => payment.createdAt >= new Date(startOfDay.getTime() - DAY) && payment.createdAt < startOfDay,
    );
    const monthPayments = visiblePayments.filter(
      (payment) => payment.createdAt >= startOfMonth && payment.createdAt < endOfDay,
    );
    const sourceTotals = new Map<string, { label: string; collected: number; refunded: number; amount: number }>();
    for (const payment of monthPayments) {
      const label = this.sourceLabel(payment.billing.reservationRoom?.reservationGroup);
      const row = sourceTotals.get(label) ?? { label, collected: 0, refunded: 0, amount: 0 };
      if (payment.status === 'SUCCEEDED') row.collected += payment.amount.toNumber();
      else row.refunded += payment.amount.toNumber();
      row.amount += signedAmount(payment);
      sourceTotals.set(label, row);
    }
    let pendingBalance = 0,
      unpaidInvoices = 0;
    for (const billing of billings) {
      if (blocked(billing.reservationRoom?.reservationGroup.rawPayload)) continue;
      const balance = recalculateBilling(billing).balance.toNumber();
      if (balance > 0) {
        pendingBalance += balance;
        unpaidInvoices += 1;
      }
    }
    const schedule = (rows: typeof stayRooms, kind: 'arrival' | 'departure') => {
      const grouped = new Map<string, typeof rows>();
      for (const room of rows) {
        const key = `${room.reservationGroup.id}:${(kind === 'arrival' ? room.arrivalDate : room.departureDate).toISOString()}`;
        const group = grouped.get(key) ?? [];
        group.push(room);
        grouped.set(key, group);
      }
      return [...grouped.values()]
        .map((lines) => ({
          id: lines[0].reservationGroup.id,
          reference: lines[0].reservationGroup.externalReservationId,
          guest_name: lines[0].reservationGroup.primaryGuest?.name ?? lines[0].guestName ?? 'Guest',
          property_id: lines[0].property.id,
          property_name: lines[0].property.name,
          arrival: new Date(Math.min(...lines.map((room) => room.arrivalDate.getTime()))).toISOString().slice(0, 10),
          departure: new Date(Math.max(...lines.map((room) => room.departureDate.getTime())))
            .toISOString()
            .slice(0, 10),
          room_count: lines.length,
          pending_rooms: lines.filter((room) =>
            kind === 'arrival' ? room.status === BookingStatus.BOOKED : room.status !== BookingStatus.CHECKED_OUT,
          ).length,
          unassigned_rooms: lines.filter((room) => !room.roomId).length,
          room_labels: [...new Set(lines.map((room) => room.room?.roomNumber ?? room.roomCategory.name))].join(', '),
        }))
        .sort(
          (a, b) =>
            (kind === 'arrival' ? a.arrival.localeCompare(b.arrival) : a.departure.localeCompare(b.departure)) ||
            b.pending_rooms - a.pending_rooms,
        );
    };
    const periodPayments = visiblePayments.filter(payment => payment.createdAt >= periodStart && payment.createdAt < periodEnd);
    const periodArrivals = visibleStays.filter(room => room.arrivalDate >= periodStartDate && room.arrivalDate <= periodEndDate && room.status !== BookingStatus.CANCELLED);
    const periodDepartures = visibleStays.filter(room => room.departureDate >= periodStartDate && room.departureDate <= periodEndDate && room.status !== BookingStatus.CANCELLED);
    const periodSources = new Map<string, { label: string; collected: number; refunded: number; amount: number }>();
    const dailyNet = new Map<string, number>();
    for (const payment of periodPayments) {
      const label = this.sourceLabel(payment.billing.reservationRoom?.reservationGroup);
      const row = periodSources.get(label) ?? { label, collected: 0, refunded: 0, amount: 0 };
      if (payment.status === 'SUCCEEDED') row.collected += payment.amount.toNumber();
      else row.refunded += payment.amount.toNumber();
      row.amount += signedAmount(payment);
      periodSources.set(label, row);
      const key = this.formatAsiaKolkataDate(payment.createdAt);
      dailyNet.set(key, (dailyNet.get(key) ?? 0) + signedAmount(payment));
    }
    return {
      period: {
        from: rangeFrom,
        to: serviceDate,
        days: periodDays,
        bookings_created: visibleGroups.filter(group => group.createdAt >= periodStart && group.createdAt < periodEnd).length,
        arrivals_count: periodArrivals.length,
        departures_count: periodDepartures.length,
        pending_arrivals: periodArrivals.filter(room => room.status === BookingStatus.BOOKED).length,
        pending_departures: periodDepartures.filter(room => room.status !== BookingStatus.CHECKED_OUT).length,
        net_collected: round(periodPayments.reduce((sum, payment) => sum + signedAmount(payment), 0)),
        collected: round(periodPayments.filter(payment => payment.status === 'SUCCEEDED').reduce((sum, payment) => sum + payment.amount.toNumber(), 0)),
        refunded: round(periodPayments.filter(payment => payment.status === 'REFUNDED').reduce((sum, payment) => sum + payment.amount.toNumber(), 0)),
        previous_net_collected: round(visiblePayments.filter(payment => payment.createdAt >= previousStart && payment.createdAt < periodStart).reduce((sum, payment) => sum + signedAmount(payment), 0)),
        collections_trend: Array.from({ length: periodDays }, (_, index) => {
          const date = new Date(periodStartDate.getTime() + index * DAY).toISOString().slice(0, 10);
          return { date, amount: round(dailyNet.get(date) ?? 0) };
        }),
        revenue_by_source: [...periodSources.values()].map(row => ({ ...row, collected: round(row.collected), refunded: round(row.refunded), amount: round(row.amount) })).sort((a, b) => b.amount - a.amount),
        arrivals: schedule(periodArrivals, 'arrival'),
        departures: schedule(periodDepartures, 'departure'),
      },
      current: {
        date: this.formatAsiaKolkataDate(referenceDate),
        unassigned_arrivals: visibleStays.filter(room => room.arrivalDate.getTime() === currentDate.getTime() && room.status === BookingStatus.BOOKED && !room.roomId).length,
        pending_departures: visibleStays.filter(room => room.departureDate.getTime() === currentDate.getTime() && ['BOOKED', 'CHECKED_IN'].includes(room.status)).length,
        upcoming_arrivals: schedule(visibleStays.filter(room => room.arrivalDate > currentDate && room.arrivalDate < currentNextWeek && room.status === BookingStatus.BOOKED), 'arrival'),
      },
      date: serviceDate,
      timezone: 'Asia/Kolkata',
      generated_at: referenceDate.toISOString(),
      property_id: requestedPropertyId ?? 'ALL',
      properties: properties.map(({ propertyType, ...property }) => ({ ...property, property_type: propertyType })),
      reservation_groups_today: visibleGroups.filter(
        (group) => group.createdAt >= startOfDay && group.createdAt < endOfDay,
      ).length,
      occupancy_rate: rooms.length ? round((occupiedRooms / rooms.length) * 100) : 0,
      occupied_rooms: occupiedRooms,
      total_rooms: rooms.length,
      available_rooms: rooms.length - occupiedRooms - outOfService,
      out_of_service_rooms: outOfService,
      revenue_today: round(todayPayments.reduce((sum, payment) => sum + signedAmount(payment), 0)),
      collected_today: round(
        todayPayments
          .filter((payment) => payment.status === 'SUCCEEDED')
          .reduce((sum, payment) => sum + payment.amount.toNumber(), 0),
      ),
      refunded_today: round(
        todayPayments
          .filter((payment) => payment.status === 'REFUNDED')
          .reduce((sum, payment) => sum + payment.amount.toNumber(), 0),
      ),
      revenue_yesterday: round(yesterdayPayments.reduce((sum, payment) => sum + signedAmount(payment), 0)),
      revenue_month_to_date: round(monthPayments.reduce((sum, payment) => sum + signedAmount(payment), 0)),
      reservation_room_arrivals_today: arrivals.length,
      reservation_room_departures_today: departures.length,
      pending_arrivals_today: arrivalPending.length,
      pending_departures_today: departurePending.length,
      unassigned_arrivals_today: arrivalPending.filter((room) => !room.roomId).length,
      active_reservation_groups: visibleGroups.filter(
        (group) => group.status === BookingStatus.BOOKED || group.status === BookingStatus.CHECKED_IN,
      ).length,
      open_housekeeping_tasks: tasks.length,
      overdue_housekeeping_tasks: tasks.filter((task) => task.dueDate && task.dueDate < currentDate).length,
      housekeeping_by_status: ['DIRTY', 'CLEANING', 'OUT_OF_SERVICE'].map((status) => ({
        status,
        count: tasks.filter((task) => task.status === status).length,
      })),
      pending_balance_total: round(pendingBalance),
      unpaid_invoice_count: unpaidInvoices,
      revenue_by_ota: [...sourceTotals.values()]
        .map((row) => ({
          ...row,
          collected: round(row.collected),
          refunded: round(row.refunded),
          amount: round(row.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
      collections_trend: Array.from({ length: 7 }, (_, index) => {
        const from = new Date(startOfWeek.getTime() + index * DAY),
          to = new Date(from.getTime() + DAY);
        return {
          date: this.formatAsiaKolkataDate(from),
          amount: round(
            visiblePayments
              .filter((payment) => payment.createdAt >= from && payment.createdAt < to)
              .reduce((sum, payment) => sum + signedAmount(payment), 0),
          ),
        };
      }),
      arrivals: schedule(arrivals, 'arrival'),
      departures: schedule(departures, 'departure'),
      upcoming_arrivals: schedule(upcoming, 'arrival'),
    };
  }

  private sourceLabel(
    group?: {
      source: string | null;
      channelConnection: { provider: string; name: string; credentials: Prisma.JsonValue | null } | null;
    } | null,
  ) {
    if (group?.channelConnection) {
      const connection = group.channelConnection;
      const credentials =
        connection.credentials && typeof connection.credentials === 'object' && !Array.isArray(connection.credentials)
          ? connection.credentials
          : {};
      return typeof credentials.ota_name === 'string' && credentials.ota_name.trim()
        ? credentials.ota_name.trim()
        : connection.name || connection.provider;
    }
    return (group?.source ?? 'DIRECT')
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
  private formatAsiaKolkataDate(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
