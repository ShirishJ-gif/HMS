import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGuestDto } from './dto/create-guest.dto';

@Injectable()
export class GuestService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createGuestDto: CreateGuestDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, createGuestDto.property_id);

    const guest = await this.prisma.guest.create({
      data: {
        propertyId: createGuestDto.property_id,
        name: createGuestDto.name,
        phone: createGuestDto.phone,
        email: createGuestDto.email,
        idProof: createGuestDto.id_proof,
        address: createGuestDto.address,
      },
    });

    return this.toGuestResponse(guest);
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.GuestWhereInput = {
      ...this.guestVisibilityWhere(),
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { idProof: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [guests, total] = await this.prisma.$transaction([
      this.prisma.guest.findMany({
        where,
        include: {
          property: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      this.prisma.guest.count({ where }),
    ]);

    return paginatedResponse(guests.map((guest) => this.toGuestResponse(guest)), total, page, limit);
  }

  private guestVisibilityWhere(): Prisma.GuestWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      NOT: {
        idProof: 'CHANNEL_IMPORT',
        address: 'Imported from Zodomus',
      },
    };
  }

  private shouldShowDetachedOtaReservationHistory() {
    return (
      process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY === 'true' ||
      process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production'
    );
  }

  private toGuestResponse(guest: {
    id: string;
    propertyId: string;
    name: string;
    phone: string;
    email: string | null;
    idProof: string;
    address: string;
    property?: { id: string; name: string; code: string };
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: guest.id,
      property_id: guest.propertyId,
      name: guest.name,
      phone: guest.phone,
      email: guest.email,
      id_proof: guest.idProof,
      address: guest.address,
      property: guest.property,
      created_at: guest.createdAt,
      updated_at: guest.updatedAt,
    };
  }
}
