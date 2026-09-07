import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const maxICalBytes = 2 * 1024 * 1024;
const fetchTimeoutMs = 12_000;
const blockedHostnames = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1']);

@Injectable()
export class ICalCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchCalendar(url: string) {
    const parsedUrl = this.validateUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

    try {
      const response = await fetch(parsedUrl.toString(), {
        headers: {
          Accept: 'text/calendar,text/plain,*/*',
          'User-Agent': 'HMS-iCal-Calendar/1.0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException(`Calendar returned HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > maxICalBytes) {
        throw new BadRequestException('Calendar file is too large.');
      }

      const content = await response.text();
      if (Buffer.byteLength(content, 'utf8') > maxICalBytes) {
        throw new BadRequestException('Calendar file is too large.');
      }

      if (!content.includes('BEGIN:VCALENDAR')) {
        throw new BadRequestException('The link did not return iCal content.');
      }

      return {
        url: parsedUrl.toString(),
        content,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadRequestException('Calendar request timed out.');
      }
      throw new BadRequestException('Failed to fetch iCal calendar.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async renderPropertyCalendar(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, code: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const today = this.dateOnly(new Date());
    const horizon = this.addDays(today, 730);
    const [blocks, reservationRooms] = await this.prisma.$transaction([
      this.prisma.inventoryBlock.findMany({
        where: {
          propertyId,
          toDate: { gte: today },
          fromDate: { lte: horizon },
        },
        include: { roomCategory: true },
        orderBy: [{ fromDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.reservationRoom.findMany({
        where: {
          propertyId,
          status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] },
          departureDate: { gte: today },
          arrivalDate: { lte: horizon },
        },
        include: { roomCategory: true },
        orderBy: [{ arrivalDate: 'asc' }],
      }),
    ]);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HMS//Inventory Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${this.escapeText(`${property.name} HMS availability`)}`,
      `X-WR-CALDESC:${this.escapeText('HMS bookings and manual inventory blocks')}`,
      ...blocks.flatMap((block) => [
        'BEGIN:VEVENT',
        `UID:hms-inventory-block-${block.id}@hms`,
        `DTSTAMP:${this.formatDateTimeUtc(block.updatedAt)}`,
        `DTSTART;VALUE=DATE:${this.formatDate(block.fromDate)}`,
        `DTEND;VALUE=DATE:${this.formatDate(this.addDays(block.toDate, 1))}`,
        `SUMMARY:${this.escapeText(`Blocked - ${block.roomCategory.name}`)}`,
        `DESCRIPTION:${this.escapeText(`${block.blockedRooms} room(s) blocked. Reason: ${block.reason}. Source: ${block.source}`)}`,
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT',
      ]),
      ...reservationRooms.flatMap((room) => [
        'BEGIN:VEVENT',
        `UID:hms-reservation-room-${room.id}@hms`,
        `DTSTAMP:${this.formatDateTimeUtc(room.updatedAt)}`,
        `DTSTART;VALUE=DATE:${this.formatDate(room.arrivalDate)}`,
        `DTEND;VALUE=DATE:${this.formatDate(room.departureDate)}`,
        `SUMMARY:${this.escapeText(`Booked - ${room.roomCategory.name}`)}`,
        `DESCRIPTION:${this.escapeText(`Reservation ${room.externalRoomReservationId}. ${room.guestName ? `Guest: ${room.guestName}. ` : ''}Status: ${room.status}`)}`,
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT',
      ]),
      'END:VCALENDAR',
      '',
    ];

    return lines.join('\r\n');
  }

  private validateUrl(url: string) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Enter a valid iCal URL.');
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new BadRequestException('Only HTTP and HTTPS calendar links are supported.');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      blockedHostnames.has(hostname) ||
      hostname.endsWith('.localhost') ||
      this.isPrivateIPv4(hostname)
    ) {
      throw new BadRequestException('Private network calendar links are not supported.');
    }

    parsedUrl.hash = '';
    return parsedUrl;
  }

  private isPrivateIPv4(hostname: string) {
    const parts = hostname.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    const [first, second] = parts;
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  private dateOnly(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private formatDateTimeUtc(date: Date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  private escapeText(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }
}
