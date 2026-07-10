import { Injectable } from '@nestjs/common';
import { ChannelConnectionStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGuestDto } from './dto/create-guest.dto';
import { GuestDirectoryQueryDto } from './dto/guest-directory-query.dto';

type GuestDirectoryRow = {
  id: string;
  property_id: string;
  name: string;
  phone: string;
  email: string | null;
  id_proof: string;
  address: string;
  property?: { id: string; name: string; code: string };
  source: 'GUEST_REGISTRY' | 'RESERVATION_FEED';
  import_blocked: boolean;
  import_error: string | null;
  reservation_ids: string[];
  created_at: Date;
  updated_at: Date;
};

type GuestRecord = Parameters<GuestService['toGuestResponse']>[0];

type ReservationDirectoryGroup = {
  id: string;
  propertyId: string;
  externalReservationId: string;
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  property: { id: string; name: string; code: string };
  primaryGuest: { name: string; phone: string; email: string | null; idProof: string } | null;
};

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

  async getDirectory(query: GuestDirectoryQueryDto = new GuestDirectoryQueryDto(), user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const requestedPropertyId = query.property_id?.trim();
    if (requestedPropertyId && requestedPropertyId !== 'ALL') {
      assertCanAccessProperty(user, requestedPropertyId);
    }
    const selectedPropertyId = scopedPropertyId ?? (requestedPropertyId && requestedPropertyId !== 'ALL' ? requestedPropertyId : null);
    const propertyWhere: Prisma.PropertyWhereInput = scopedPropertyId ? { id: scopedPropertyId } : {};
    const search = query.search?.trim();
    const source = query.source ?? 'ALL';
    const guestWhere: Prisma.GuestWhereInput = {
      ...this.guestVisibilityWhere(),
      ...(selectedPropertyId ? { propertyId: selectedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { idProof: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
              { property: { is: { name: { contains: search, mode: 'insensitive' } } } },
              { property: { is: { code: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const reservationWhere: Prisma.ReservationGroupWhereInput = {
      ...(selectedPropertyId ? { propertyId: selectedPropertyId } : {}),
      ...this.reservationVisibilityWhere(),
      ...(search
        ? {
            OR: [
              { externalReservationId: { contains: search, mode: 'insensitive' } },
              { primaryGuest: { is: { name: { contains: search, mode: 'insensitive' } } } },
              { primaryGuest: { is: { phone: { contains: search, mode: 'insensitive' } } } },
              { primaryGuest: { is: { email: { contains: search, mode: 'insensitive' } } } },
              { property: { is: { name: { contains: search, mode: 'insensitive' } } } },
              { property: { is: { code: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [properties, guests, reservationGroups] = await Promise.all([
      this.prisma.property.findMany({
        where: propertyWhere,
        include: {
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      }),
      source === 'RESERVATION_FEED'
        ? Promise.resolve([])
        : this.prisma.guest.findMany({
            where: guestWhere,
            include: { property: { select: { id: true, name: true, code: true } } },
            orderBy: { createdAt: 'desc' },
          }),
      this.prisma.reservationGroup.findMany({
        where: reservationWhere,
        select: {
          id: true,
          propertyId: true,
          externalReservationId: true,
          rawPayload: true,
          createdAt: true,
          updatedAt: true,
          property: { select: { id: true, name: true, code: true } },
          primaryGuest: {
            select: {
              name: true,
              phone: true,
              email: true,
              idProof: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const rows = this.buildDirectoryRows(guests, reservationGroups, source !== 'GUEST_REGISTRY');
    const total = rows.length;
    const pageRows = rows.slice(skip, skip + take);

    return {
      properties: properties.map((property) => this.toPropertyResponse(property)),
      guests: pageRows,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(Math.ceil(total / limit), 1),
      },
      summary: {
        total_guests: total,
        reservation_feed: rows.filter((guest) => guest.source === 'RESERVATION_FEED').length,
        repeat_guests: rows.filter((guest) => guest.reservation_ids.length > 1).length,
        with_email: rows.filter((guest) => Boolean(guest.email)).length,
      },
    };
  }

  private guestVisibilityWhere(): Prisma.GuestWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      NOT: {
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

  private reservationVisibilityWhere(): Prisma.ReservationGroupWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      OR: [
        {
          channelConnectionId: null,
          source: { in: ['DIRECT', 'WALK_IN'] },
        },
        { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
      ],
    };
  }

  private buildDirectoryRows(
    guests: GuestRecord[],
    reservationGroups: ReservationDirectoryGroup[],
    includeFeedRows = true,
  ) {
    const bySignature = new Map<string, GuestDirectoryRow>();

    for (const guest of guests) {
      const row = this.toDirectoryGuestResponse(guest);
      bySignature.set(this.guestSignature(row.property_id, row.name, row.phone, row.email), row);
    }

    for (const group of reservationGroups) {
      const importBlocked = this.isImportBlocked(group);
      const importError = this.importError(group);
      const guestName = group.primaryGuest?.name?.trim();
      const guestPhone = group.primaryGuest?.phone?.trim();
      const guestEmail = group.primaryGuest?.email?.trim() ?? null;
      if (!guestName || !guestPhone) continue;

      const signature = this.guestSignature(group.propertyId, guestName, guestPhone, guestEmail);
      const existing = bySignature.get(signature);
      if (existing) {
        existing.reservation_ids = Array.from(new Set([...existing.reservation_ids, group.externalReservationId]));
        if (!existing.import_error && importError) existing.import_error = importError;
        existing.import_blocked = existing.import_blocked || importBlocked;
        if (group.updatedAt > existing.updated_at) existing.updated_at = group.updatedAt;
        if (group.createdAt > existing.created_at) existing.created_at = group.createdAt;
        continue;
      }

      if (!includeFeedRows) continue;

      bySignature.set(signature, {
        id: `feed-guest:${signature}`,
        property_id: group.propertyId,
        name: guestName,
        phone: guestPhone,
        email: guestEmail,
        id_proof: this.maskIdProof(group.primaryGuest?.idProof),
        address: importBlocked ? 'From provider reservation feed' : 'From reservation feed',
        property: group.property,
        source: 'RESERVATION_FEED',
        import_blocked: importBlocked,
        import_error: importError,
        reservation_ids: [group.externalReservationId],
        created_at: group.createdAt,
        updated_at: group.updatedAt,
      });
    }

    return Array.from(bySignature.values()).sort((a, b) => {
      const updatedDiff = b.updated_at.getTime() - a.updated_at.getTime();
      if (updatedDiff !== 0) return updatedDiff;
      const createdDiff = b.created_at.getTime() - a.created_at.getTime();
      if (createdDiff !== 0) return createdDiff;
      return a.name.localeCompare(b.name);
    });
  }

  private toDirectoryGuestResponse(guest: GuestRecord): GuestDirectoryRow {
    return {
      ...this.toGuestResponse(guest),
      source: 'GUEST_REGISTRY' as const,
      import_blocked: false,
      import_error: null,
      reservation_ids: [] as string[],
    };
  }

  private isImportBlocked(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.readPlainRecord(group.rawPayload);
    return rawPayload.importBlocked === true;
  }

  private importError(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.readPlainRecord(group.rawPayload);
    return typeof rawPayload.importError === 'string' ? rawPayload.importError : null;
  }

  private readPlainRecord(value: Prisma.JsonValue | null | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private guestSignature(propertyId: string, name: string, phone: string, email: string | null) {
    return [propertyId, name.trim().toLowerCase(), phone.trim(), (email ?? '').trim().toLowerCase()].join('::');
  }

  private toPropertyResponse(property: {
    id: string;
    name: string;
    code: string;
    phone: string | null;
    email: string | null;
    address: string;
    timezone: string;
    defaultCheckInTime: string;
    defaultCheckOutTime: string;
    isActive: boolean;
    images?: Array<{
      id: string;
      url: string;
      caption: string | null;
      sortOrder: number;
      isPrimary: boolean;
      createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: property.id,
      name: property.name,
      code: property.code,
      phone: property.phone,
      email: property.email,
      address: property.address,
      timezone: property.timezone,
      default_check_in_time: property.defaultCheckInTime,
      default_check_out_time: property.defaultCheckOutTime,
      is_active: property.isActive,
      images: property.images?.map((image) => this.toImageResponse(image)) ?? [],
      created_at: property.createdAt,
      updated_at: property.updatedAt,
    };
  }

  private toImageResponse(image: {
    id: string;
    url: string;
    caption: string | null;
    sortOrder: number;
    isPrimary: boolean;
    createdAt: Date;
  }) {
    return {
      id: image.id,
      url: image.url,
      caption: image.caption,
      sort_order: image.sortOrder,
      is_primary: image.isPrimary,
      created_at: image.createdAt,
    };
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
      id_proof: this.maskIdProof(guest.idProof),
      address: guest.address,
      property: guest.property,
      created_at: guest.createdAt,
      updated_at: guest.updatedAt,
    };
  }

  private maskIdProof(value?: string | null) {
    const normalized = value?.trim();
    if (!normalized || normalized === '-' || normalized === 'CHANNEL_IMPORT') {
      return '';
    }
    if (/^\*+\w{1,3}$/.test(normalized)) {
      return normalized;
    }

    const visibleSuffix = normalized.replace(/[^a-zA-Z0-9]/g, '').slice(-3);
    return visibleSuffix ? `****${visibleSuffix}` : '';
  }
}
