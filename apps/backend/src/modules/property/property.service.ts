import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dirname, join } from 'node:path';
import { renameSync } from 'node:fs';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateRatePlanDto } from './dto/create-rate-plan.dto';
import { CreateRoomCategoryDto } from './dto/create-room-category.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { UpdatePropertyStatusDto } from './dto/update-property-status.dto';
import { UpdateRoomCategoryDto } from './dto/update-room-category.dto';

@Injectable()
export class PropertyService {
  constructor(private readonly prisma: PrismaService) {}

  async createProperty(dto: CreatePropertyDto) {
    try {
      const property = await this.prisma.property.create({
        data: {
          name: dto.name,
          code: dto.code,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          timezone: dto.timezone,
        },
      });

      return this.toPropertyResponse(property);
    } catch (error) {
      this.handlePrismaError(error, 'Property code already exists');
    }
  }

  async findProperties(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.PropertyWhereInput = {
      ...(scopedPropertyId ? { id: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [properties, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        include: {
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.property.count({ where }),
    ]);

    return paginatedResponse(properties.map((property) => this.toPropertyResponse(property)), total, page, limit);
  }

  async updatePropertyStatus(id: string, dto: UpdatePropertyStatusDto) {
    try {
      const updatedCount = await this.prisma.$executeRaw`
        UPDATE "properties"
        SET "is_active" = ${dto.is_active}, "updated_at" = NOW()
        WHERE "id" = ${id}::uuid
      `;
      if (updatedCount === 0) {
        throw new NotFoundException('Property not found');
      }

      const property = await this.prisma.property.findUnique({
        where: { id },
        include: {
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found');
      }

      return this.toPropertyResponse({ ...property, isActive: dto.is_active });
    } catch (error) {
      this.handlePrismaError(error, 'Property code already exists');
    }
  }

  async removeProperty(id: string) {
    const existing = await this.prisma.property.findUnique({
      where: { id },
      include: {
        roomCategories: { select: { id: true } },
        ratePlans: { select: { id: true } },
        rooms: { select: { id: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Property not found');
    }

    const [
      userCount,
      reservationGroupCount,
      reservationRoomCount,
      channelConnectionCount,
      webhookEventCount,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { propertyId: id } }),
      this.prisma.reservationGroup.count({ where: { propertyId: id } }),
      this.prisma.reservationRoom.count({ where: { propertyId: id } }),
      this.prisma.channelConnection.count({ where: { propertyId: id } }),
      this.prisma.webhookEvent.count({ where: { propertyId: id } }),
    ]);

    const blockers = this.formatDeleteBlockers([
      ['assigned user', userCount],
      ['reservation group', reservationGroupCount],
      ['reservation stay', reservationRoomCount],
      ['channel connection', channelConnectionCount],
      ['webhook event', webhookEventCount],
    ]);

    if (blockers.length > 0) {
      throw new ConflictException(`Cannot delete this property because ${blockers.join(', ')} still depend on it.`);
    }

    const roomCategoryIds = existing.roomCategories.map((category) => category.id);
    const ratePlanIds = existing.ratePlans.map((ratePlan) => ratePlan.id);
    const roomIds = existing.rooms.map((room) => room.id);

    try {
      const summary = await this.prisma.$transaction(async (tx) => {
        const deletedPricingRules = await tx.pricingRule.deleteMany({ where: { propertyId: id } });
        const deletedRatePlans = await tx.ratePlan.deleteMany({ where: { propertyId: id } });
        const deletedHousekeepingTasks =
          roomIds.length > 0 ? await tx.housekeepingTask.deleteMany({ where: { roomId: { in: roomIds } } }) : { count: 0 };
        const deletedOutOfServicePeriods = await tx.roomOutOfServicePeriod.deleteMany({ where: { propertyId: id } });
        const deletedRooms = await tx.room.deleteMany({ where: { propertyId: id } });
        const deletedInventoryBlocks = await tx.inventoryBlock.deleteMany({ where: { propertyId: id } });
        const deletedInventoryRows = await tx.inventoryCalendar.deleteMany({ where: { propertyId: id } });
        const deletedRoomCategories = await tx.roomCategory.deleteMany({ where: { propertyId: id } });
        const deletedGuests = await tx.guest.deleteMany({ where: { propertyId: id } });

        await tx.property.delete({ where: { id } });

        return {
          room_categories_deleted: deletedRoomCategories.count,
          rooms_deleted: deletedRooms.count,
          rate_plans_deleted: deletedRatePlans.count,
          pricing_rules_deleted: deletedPricingRules.count,
          housekeeping_tasks_deleted: deletedHousekeepingTasks.count,
          out_of_service_periods_deleted: deletedOutOfServicePeriods.count,
          inventory_blocks_deleted: deletedInventoryBlocks.count,
          inventory_rows_deleted: deletedInventoryRows.count,
          guests_deleted: deletedGuests.count,
        };
      });

      return {
        id,
        deleted: true,
        room_category_ids: roomCategoryIds,
        rate_plan_ids: ratePlanIds,
        ...summary,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete this property because users, guests, reservations, mappings, rooms, or inventory still depend on it.',
        );
      }

      throw error;
    }
  }

  async createRoomCategory(dto: CreateRoomCategoryDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);

    try {
      const category = await this.prisma.roomCategory.create({
        data: {
          propertyId: dto.property_id,
          name: dto.name,
          code: dto.code,
          description: dto.description,
          maxOccupancy: dto.max_occupancy,
        },
        include: { property: true },
      });

      return this.toRoomCategoryResponse(category);
    } catch (error) {
      this.handlePrismaError(error, 'Room category code already exists for this property');
    }
  }

  async findRoomCategories(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.RoomCategoryWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [categories, total] = await this.prisma.$transaction([
      this.prisma.roomCategory.findMany({
        where,
        include: {
          property: true,
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.roomCategory.count({ where }),
    ]);

    return paginatedResponse(categories.map((category) => this.toRoomCategoryResponse(category)), total, page, limit);
  }

  async updateRoomCategory(id: string, dto: UpdateRoomCategoryDto, user?: AuthenticatedUser) {
    const existing = await this.prisma.roomCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Room category not found');
    }

    assertCanAccessProperty(user, existing.propertyId);

    if (dto.property_id && dto.property_id !== existing.propertyId) {
      throw new ConflictException('Room category cannot be moved to another property');
    }

    try {
      const category = await this.prisma.roomCategory.update({
        where: { id },
        data: {
          name: dto.name,
          code: dto.code,
          description: dto.description,
          maxOccupancy: dto.max_occupancy,
        },
        include: {
          property: true,
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      return this.toRoomCategoryResponse(category);
    } catch (error) {
      this.handlePrismaError(error, 'Room category code already exists for this property');
    }
  }

  async removeRoomCategory(id: string, user?: AuthenticatedUser) {
    const existing = await this.prisma.roomCategory.findUnique({
      where: { id },
      include: {
        ratePlans: { select: { id: true } },
        rooms: { select: { id: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Room category not found');
    }

    assertCanAccessProperty(user, existing.propertyId);

    const ratePlanIds = existing.ratePlans.map((ratePlan) => ratePlan.id);
    const roomIds = existing.rooms.map((room) => room.id);
    const [
      reservationRoomCount,
      channelRoomMappingCount,
      channelRateMappingCount,
    ] = await this.prisma.$transaction([
      this.prisma.reservationRoom.count({ where: { roomCategoryId: id } }),
      this.prisma.channelRoomMapping.count({ where: { roomCategoryId: id } }),
      ratePlanIds.length > 0
        ? this.prisma.channelRateMapping.count({ where: { ratePlanId: { in: ratePlanIds } } })
        : this.prisma.channelRateMapping.count({ where: { id: { in: [] } } }),
    ]);

    if (reservationRoomCount > 0 || channelRoomMappingCount > 0 || channelRateMappingCount > 0) {
      const blockers = [
        reservationRoomCount > 0 ? `${reservationRoomCount} reservation stay${reservationRoomCount === 1 ? '' : 's'}` : null,
        channelRoomMappingCount > 0 ? `${channelRoomMappingCount} room mapping${channelRoomMappingCount === 1 ? '' : 's'}` : null,
        channelRateMappingCount > 0 ? `${channelRateMappingCount} rate mapping${channelRateMappingCount === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      throw new ConflictException(`Cannot delete this room type because ${blockers.join(', ')} still depend on it.`);
    }

    try {
      const summary = await this.prisma.$transaction(async (tx) => {
        const deletedHousekeepingTasks =
          roomIds.length > 0
            ? await tx.housekeepingTask.deleteMany({ where: { roomId: { in: roomIds } } })
            : { count: 0 };
        const deletedRooms = await tx.room.deleteMany({ where: { roomCategoryId: id } });
        const deletedRatePlans =
          ratePlanIds.length > 0
            ? await tx.ratePlan.deleteMany({ where: { id: { in: ratePlanIds } } })
            : { count: 0 };
        const deletedInventoryBlocks = await tx.inventoryBlock.deleteMany({ where: { roomCategoryId: id } });
        const deletedInventoryRows = await tx.inventoryCalendar.deleteMany({ where: { roomCategoryId: id } });

        await tx.roomCategory.delete({
          where: { id },
        });

        return {
          rooms_deleted: deletedRooms.count,
          rate_plans_deleted: deletedRatePlans.count,
          housekeeping_tasks_deleted: deletedHousekeepingTasks.count,
          inventory_blocks_deleted: deletedInventoryBlocks.count,
          inventory_rows_deleted: deletedInventoryRows.count,
        };
      });

      return { id, deleted: true, ...summary };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete this room type because rooms, rate plans, reservations, mappings, or inventory still depend on it.',
        );
      }

      throw error;
    }
  }

  async createRatePlan(dto: CreateRatePlanDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);

    const roomCategory = await this.prisma.roomCategory.findUnique({
      where: { id: dto.room_category_id },
    });

    if (!roomCategory) {
      throw new NotFoundException('Room category not found');
    }

    if (roomCategory.propertyId !== dto.property_id) {
      throw new ConflictException('Room category does not belong to property');
    }

    try {
      const ratePlan = await this.prisma.ratePlan.create({
        data: {
          propertyId: dto.property_id,
          roomCategoryId: dto.room_category_id,
          name: dto.name,
          code: dto.code,
          baseRate: dto.base_rate,
          currency: dto.currency,
          isActive: dto.is_active,
        },
        include: {
          property: true,
          roomCategory: true,
        },
      });

      return this.toRatePlanResponse(ratePlan);
    } catch (error) {
      this.handlePrismaError(error, 'Rate plan code already exists for this property');
    }
  }

  async findRatePlans(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.RatePlanWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { roomCategory: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [ratePlans, total] = await this.prisma.$transaction([
      this.prisma.ratePlan.findMany({
        where,
        include: {
          property: true,
          roomCategory: true,
        },
        orderBy: [{ property: { name: 'asc' } }, { roomCategory: { name: 'asc' } }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.ratePlan.count({ where }),
    ]);

    return paginatedResponse(ratePlans.map((ratePlan) => this.toRatePlanResponse(ratePlan)), total, page, limit);
  }

  async removeRatePlan(id: string, user?: AuthenticatedUser) {
    const existing = await this.prisma.ratePlan.findUnique({
      where: { id },
      include: {
        pricingRules: { select: { id: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Rate plan not found');
    }

    assertCanAccessProperty(user, existing.propertyId);

    const [reservationRoomCount, channelRateMappingCount] = await this.prisma.$transaction([
      this.prisma.reservationRoom.count({ where: { ratePlanId: id } }),
      this.prisma.channelRateMapping.count({ where: { ratePlanId: id } }),
    ]);
    const blockers = this.formatDeleteBlockers([
      ['reservation stay', reservationRoomCount],
      ['rate mapping', channelRateMappingCount],
    ]);

    if (blockers.length > 0) {
      throw new ConflictException(`Cannot delete this rate plan because ${blockers.join(', ')} still depend on it.`);
    }

    const pricingRuleIds = existing.pricingRules.map((rule) => rule.id);

    try {
      const summary = await this.prisma.$transaction(async (tx) => {
        const deletedPricingRules = await tx.pricingRule.deleteMany({ where: { ratePlanId: id } });
        await tx.ratePlan.delete({ where: { id } });

        return {
          pricing_rules_deleted: deletedPricingRules.count,
        };
      });

      return { id, deleted: true, pricing_rule_ids: pricingRuleIds, ...summary };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete this rate plan because reservations, mappings, or pricing rules still depend on it.',
        );
      }

      throw error;
    }
  }

  async createPricingRule(dto: CreatePricingRuleDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);

    const ratePlan = await this.prisma.ratePlan.findUnique({
      where: { id: dto.rate_plan_id },
      include: {
        roomCategory: true,
      },
    });

    if (!ratePlan) {
      throw new NotFoundException('Rate plan not found');
    }

    if (ratePlan.propertyId !== dto.property_id) {
      throw new ConflictException('Rate plan does not belong to property');
    }

    this.validatePricingRule(dto);

    const rule = await this.prisma.pricingRule.create({
      data: {
        propertyId: dto.property_id,
        ratePlanId: dto.rate_plan_id,
        name: dto.name,
        type: dto.type,
        adjustmentPercent: dto.adjustment_percent,
        startDate: dto.start_date ? new Date(`${dto.start_date}T00:00:00.000Z`) : undefined,
        endDate: dto.end_date ? new Date(`${dto.end_date}T00:00:00.000Z`) : undefined,
        occupancyThreshold: dto.occupancy_threshold,
        isActive: dto.is_active ?? true,
      },
      include: {
        property: true,
        ratePlan: {
          include: {
            roomCategory: true,
          },
        },
      },
    });

    return this.toPricingRuleResponse(rule);
  }

  async findPricingRules(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.PricingRuleWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { ratePlan: { name: { contains: search, mode: 'insensitive' } } },
              { ratePlan: { code: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rules, total] = await this.prisma.$transaction([
      this.prisma.pricingRule.findMany({
        where,
        include: {
          property: true,
          ratePlan: {
            include: {
              roomCategory: true,
            },
          },
        },
        orderBy: [{ property: { name: 'asc' } }, { ratePlan: { name: 'asc' } }, { createdAt: 'asc' }],
        skip,
        take,
      }),
      this.prisma.pricingRule.count({ where }),
    ]);

    return paginatedResponse(rules.map((rule) => this.toPricingRuleResponse(rule)), total, page, limit);
  }

  async updatePricingRule(id: string, dto: UpdatePricingRuleDto, user?: AuthenticatedUser) {
    const existing = await this.prisma.pricingRule.findUnique({
      where: { id },
      include: {
        property: true,
        ratePlan: {
          include: {
            roomCategory: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Pricing rule not found');
    }

    assertCanAccessProperty(user, existing.propertyId);

    const candidate = {
      property_id: existing.propertyId,
      rate_plan_id: existing.ratePlanId,
      name: dto.name ?? existing.name,
      type: dto.type ?? existing.type,
      adjustment_percent: dto.adjustment_percent ?? existing.adjustmentPercent.toString(),
      start_date: undefined as string | undefined,
      end_date: undefined as string | undefined,
      occupancy_threshold: undefined as number | undefined,
      is_active: dto.is_active ?? existing.isActive,
    } satisfies CreatePricingRuleDto;

    if (candidate.type === 'DATE_RANGE') {
      candidate.start_date =
        dto.start_date === undefined ? existing.startDate?.toISOString().slice(0, 10) : dto.start_date;
      candidate.end_date =
        dto.end_date === undefined ? existing.endDate?.toISOString().slice(0, 10) : dto.end_date;
    }

    if (candidate.type === 'OCCUPANCY') {
      candidate.occupancy_threshold =
        dto.occupancy_threshold === undefined ? existing.occupancyThreshold ?? undefined : dto.occupancy_threshold;
    }

    this.validatePricingRule(candidate);

    const updated = await this.prisma.pricingRule.update({
      where: { id },
      data: {
        name: candidate.name,
        type: candidate.type,
        adjustmentPercent: candidate.adjustment_percent,
        startDate: candidate.start_date ? new Date(`${candidate.start_date}T00:00:00.000Z`) : null,
        endDate: candidate.end_date ? new Date(`${candidate.end_date}T00:00:00.000Z`) : null,
        occupancyThreshold: candidate.occupancy_threshold ?? null,
        isActive: candidate.is_active ?? true,
      },
      include: {
        property: true,
        ratePlan: {
          include: {
            roomCategory: true,
          },
        },
      },
    });

    return this.toPricingRuleResponse(updated);
  }

  async removePricingRule(id: string, user?: AuthenticatedUser) {
    const existing = await this.prisma.pricingRule.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Pricing rule not found');
    }

    assertCanAccessProperty(user, existing.propertyId);

    await this.prisma.pricingRule.delete({
      where: { id },
    });

    return { id, deleted: true };
  }

  async addPropertyImage(
    propertyId: string,
    file: { filename?: string; mimetype?: string; path?: string } | undefined,
    body: { caption?: string; sort_order?: string; is_primary?: string },
    user?: AuthenticatedUser,
  ) {
    assertCanAccessProperty(user, propertyId);
    this.validateUploadedImage(file);

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const isPrimary = this.parseBoolean(body.is_primary);

    const fileName = this.finalizeUploadedFile(file);
    const image = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.propertyImage.updateMany({
          where: { propertyId },
          data: { isPrimary: false },
        });
      }

      return tx.propertyImage.create({
        data: {
          propertyId,
          url: `/uploads/properties/${fileName}`,
          caption: body.caption || undefined,
          sortOrder: this.parseSortOrder(body.sort_order),
          isPrimary,
        },
      });
    });

    return this.toImageResponse(image);
  }

  async addRoomCategoryImage(
    roomCategoryId: string,
    file: { filename?: string; mimetype?: string; path?: string } | undefined,
    body: { caption?: string; sort_order?: string; is_primary?: string },
    user?: AuthenticatedUser,
  ) {
    const category = await this.prisma.roomCategory.findUnique({ where: { id: roomCategoryId } });
    if (!category) {
      throw new NotFoundException('Room category not found');
    }

    assertCanAccessProperty(user, category.propertyId);
    this.validateUploadedImage(file);
    const isPrimary = this.parseBoolean(body.is_primary);

    const fileName = this.finalizeUploadedFile(file);
    const image = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.roomCategoryImage.updateMany({
          where: { roomCategoryId },
          data: { isPrimary: false },
        });
      }

      return tx.roomCategoryImage.create({
        data: {
          roomCategoryId,
          url: `/uploads/room-categories/${fileName}`,
          caption: body.caption || undefined,
          sortOrder: this.parseSortOrder(body.sort_order),
          isPrimary,
        },
      });
    });

    return this.toImageResponse(image);
  }

  private validateUploadedImage(file: { filename?: string; mimetype?: string } | undefined) {
    if (!file?.filename) {
      throw new BadRequestException('Image file is required');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are allowed');
    }
  }

  private finalizeUploadedFile(file: { filename?: string; mimetype?: string; path?: string } | undefined) {
    this.validateUploadedImage(file);
    const extension = this.extensionForMimeType(file?.mimetype);
    const fileName = `${file?.filename}${extension}`;

    if (file?.path) {
      renameSync(file.path, join(dirname(file.path), fileName));
    }

    return fileName;
  }

  private extensionForMimeType(mimeType?: string) {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      default:
        return '.img';
    }
  }

  private parseSortOrder(value?: string) {
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseBoolean(value?: string) {
    return value === 'true' || value === '1' || value === 'on';
  }

  private formatDeleteBlockers(blockers: Array<[label: string, count: number]>) {
    return blockers
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`);
  }

  private handlePrismaError(error: unknown, conflictMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(conflictMessage);
      }

      if (error.code === 'P2003') {
        throw new NotFoundException('Related property or room category not found');
      }
    }

    throw error;
  }

  private toPropertyResponse(property: {
    id: string;
    name: string;
    code: string;
    phone: string | null;
    email: string | null;
    address: string;
    timezone: string;
    isActive?: boolean;
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
      is_active: property.isActive ?? true,
      images: property.images?.map((image) => this.toImageResponse(image)) ?? [],
      created_at: property.createdAt,
      updated_at: property.updatedAt,
    };
  }

  private toRoomCategoryResponse(category: {
    id: string;
    propertyId: string;
    name: string;
    code: string;
    description: string | null;
    maxOccupancy: number;
    property: { id: string; name: string; code: string };
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
      id: category.id,
      property_id: category.propertyId,
      name: category.name,
      code: category.code,
      description: category.description,
      max_occupancy: category.maxOccupancy,
      property: category.property,
      images: category.images?.map((image) => this.toImageResponse(image)) ?? [],
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    };
  }

  private toRatePlanResponse(ratePlan: {
    id: string;
    propertyId: string;
    roomCategoryId: string;
    name: string;
    code: string;
    baseRate: Prisma.Decimal;
    currency: string;
    isActive: boolean;
    property: { id: string; name: string; code: string };
    roomCategory: { id: string; name: string; code: string };
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: ratePlan.id,
      property_id: ratePlan.propertyId,
      room_category_id: ratePlan.roomCategoryId,
      name: ratePlan.name,
      code: ratePlan.code,
      base_rate: ratePlan.baseRate.toNumber(),
      currency: ratePlan.currency,
      is_active: ratePlan.isActive,
      property: ratePlan.property,
      room_category: ratePlan.roomCategory,
      created_at: ratePlan.createdAt,
      updated_at: ratePlan.updatedAt,
    };
  }

  private toPricingRuleResponse(rule: {
    id: string;
    propertyId: string;
    ratePlanId: string;
    name: string;
    type: string;
    adjustmentPercent: Prisma.Decimal;
    startDate: Date | null;
    endDate: Date | null;
    occupancyThreshold: number | null;
    isActive: boolean;
    property: { id: string; name: string; code: string };
    ratePlan: {
      id: string;
      name: string;
      code: string;
      roomCategory: { id: string; name: string; code: string };
    };
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: rule.id,
      property_id: rule.propertyId,
      rate_plan_id: rule.ratePlanId,
      name: rule.name,
      type: rule.type,
      adjustment_percent: rule.adjustmentPercent.toNumber(),
      start_date: rule.startDate?.toISOString().slice(0, 10) ?? null,
      end_date: rule.endDate?.toISOString().slice(0, 10) ?? null,
      occupancy_threshold: rule.occupancyThreshold,
      is_active: rule.isActive,
      property: rule.property,
      rate_plan: {
        id: rule.ratePlan.id,
        name: rule.ratePlan.name,
        code: rule.ratePlan.code,
        room_category: rule.ratePlan.roomCategory,
      },
      created_at: rule.createdAt,
      updated_at: rule.updatedAt,
    };
  }

  private validatePricingRule(dto: CreatePricingRuleDto) {
    if (dto.type === 'DATE_RANGE') {
      if (!dto.start_date || !dto.end_date) {
        throw new BadRequestException('DATE_RANGE rules require start_date and end_date');
      }

      if (new Date(`${dto.end_date}T00:00:00.000Z`) < new Date(`${dto.start_date}T00:00:00.000Z`)) {
        throw new BadRequestException('end_date must be on or after start_date');
      }

      return;
    }

    if (dto.type === 'OCCUPANCY') {
      if (typeof dto.occupancy_threshold !== 'number') {
        throw new BadRequestException('OCCUPANCY rules require occupancy_threshold');
      }

      return;
    }
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
}
