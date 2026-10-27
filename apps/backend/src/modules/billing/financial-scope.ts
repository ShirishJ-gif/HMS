import { BadRequestException } from '@nestjs/common';
import { ChannelConnectionStatus, Prisma } from '@prisma/client';

const DAY_MS = 86_400_000;
/** Inclusive stay-date selection; checkout is excluded. Omitting both dates means all stays. */
export function financialRange(from?: string, to?: string) {
  if (from === undefined && to === undefined) return undefined;
  const parse = (value: string | undefined, field: string) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new BadRequestException(`${field} must be a valid date (YYYY-MM-DD); supply both from and to`);
    return date;
  };
  const start = parse(from, 'from');
  const last = parse(to, 'to');
  if (start > last) throw new BadRequestException('from must be before or equal to to');
  const end = new Date(last.getTime() + DAY_MS);
  if ((end.getTime() - start.getTime()) / DAY_MS > 366)
    throw new BadRequestException('Choose a date range of 366 days or fewer');
  return { from: start, end };
}

/** Select complete booking folios if any room has a night in the range. */
export function folioStayWhere(range?: { from: Date; end: Date }): Prisma.ReservationGroupWhereInput {
  return range ? { rooms: { some: { arrivalDate: { lt: range.end }, departureDate: { gt: range.from } } } } : {};
}

export function isImportBlocked(raw: unknown) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && (raw as Record<string, unknown>).importBlocked === true;
}

/** Both financial views must see the same manual bookings and connected OTA history. */
export function financialGroupVisibilityWhere(): Prisma.ReservationGroupWhereInput {
  if (process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY === 'true' || process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production') return {};
  return {
    OR: [
      { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
      { channelConnectionId: null, source: { in: ['DIRECT', 'WALK_IN', 'AIRBNB', 'BOOKING_COM', 'EXPEDIA', 'MAKEMYTRIP', 'GOIBIBO', 'AGODA', 'WEBSITE', 'OTHER'] } },
    ],
  };
}
