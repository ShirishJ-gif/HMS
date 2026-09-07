import { Injectable } from '@nestjs/common';
import { EmailSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ParsedEmailEvent, ReservationResolution } from '../types';

@Injectable()
export class EmailReservationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(propertyId: string, event: ParsedEmailEvent): Promise<ReservationResolution> {
    if (!event.externalReservationId) {
      return event.category === 'BOOKING_ENQUIRY'
        ? { type: 'NOT_APPLICABLE', reason: 'Direct enquiry has no reservation identity' }
        : { type: 'AMBIGUOUS', candidates: [], reason: 'Missing external reservation ID' };
    }

    const sourceVariants = this.sourceVariants(event.source);
    const matches = await this.prisma.reservationGroup.findMany({
      where: {
        propertyId,
        externalReservationId: event.externalReservationId,
        ...(sourceVariants.length ? { source: { in: sourceVariants } } : {}),
      } as Prisma.ReservationGroupWhereInput,
      select: { id: true },
      take: 5,
    });

    if (matches.length === 1) return { type: 'EXISTING', reservationId: matches[0].id, reason: 'Matched by source and external reservation ID' };
    if (matches.length > 1) return { type: 'AMBIGUOUS', candidates: matches.map((match) => match.id), reason: 'Multiple reservations matched' };

    const idOnly = await this.prisma.reservationGroup.findMany({
      where: { propertyId, externalReservationId: event.externalReservationId },
      select: { id: true },
      take: 5,
    });
    if (idOnly.length === 1) return { type: 'EXISTING', reservationId: idOnly[0].id, reason: 'Matched by external reservation ID' };
    if (idOnly.length > 1) return { type: 'AMBIGUOUS', candidates: idOnly.map((match) => match.id), reason: 'External reservation ID is not unique across sources' };

    return { type: 'NEW', reason: 'No matching reservation found' };
  }

  private sourceVariants(source: EmailSource) {
    const variants: Record<EmailSource, string[]> = {
      BOOKING_COM: ['BOOKING_COM', 'Booking.com', 'booking.com'],
      AIRBNB: ['AIRBNB', 'Airbnb'],
      EXPEDIA: ['EXPEDIA', 'Expedia'],
      MAKEMYTRIP: ['MAKEMYTRIP', 'MakeMyTrip'],
      GOIBIBO: ['GOIBIBO', 'Goibibo'],
      AGODA: ['AGODA', 'Agoda'],
      WEBSITE: ['WEBSITE', 'Website'],
      DIRECT_GUEST: ['DIRECT_GUEST', 'DIRECT', 'Email'],
      OTHER: ['OTHER'],
      UNKNOWN: [],
    };
    return variants[source];
  }
}
