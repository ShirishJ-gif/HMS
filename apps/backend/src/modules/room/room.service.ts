import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { BackgroundJobService } from '../background-job/background-job.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomOutOfServicePeriodDto } from './dto/create-room-out-of-service-period.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly backgroundJobService: BackgroundJobService,
  ) {}

  async create(createRoomDto: CreateRoomDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, createRoomDto.property_id);

    try {
      const room = await this.prisma.room.create({
        data: {
          propertyId: createRoomDto.property_id,
          roomCategoryId: createRoomDto.room_category_id,
          roomNumber: createRoomDto.room_number,
          status: createRoomDto.status,
        },
        include: this.includeRelations(),
      });

      await this.auditLogService.record({
        action: AuditAction.CREATE,
        entityType: 'room',
        entityId: room.id,
        propertyId: room.propertyId,
        summary: `Created room ${room.roomNumber}`,
        metadata: {
          room_category_id: room.roomCategoryId,
          status: room.status,
        },
        user,
      });

      await this.backgroundJobService.queueInventorySyncsForProperty(room.propertyId, {
        trigger: 'room_created',
      });

      return this.toRoomResponse(room);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.RoomWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { roomNumber: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { roomCategory: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rooms, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        include: this.includeRelations(),
        orderBy: {
          roomNumber: 'asc',
        },
        skip,
        take,
      }),
      this.prisma.room.count({ where }),
    ]);

    return paginatedResponse(rooms.map((room) => this.toRoomResponse(room)), total, page, limit);
  }

  async update(id: string, updateRoomDto: UpdateRoomDto, user?: AuthenticatedUser) {
    try {
      const existingRoom = await this.prisma.room.findUnique({ where: { id } });
      if (!existingRoom) {
        throw new NotFoundException('Room not found');
      }

      if (user) {
        assertCanAccessProperty(user, existingRoom.propertyId);
      }

      if (updateRoomDto.property_id) {
        assertCanAccessProperty(user, updateRoomDto.property_id);
      }

      const room = await this.prisma.room.update({
        where: { id },
        data: {
          propertyId: updateRoomDto.property_id,
          roomCategoryId: updateRoomDto.room_category_id,
          roomNumber: updateRoomDto.room_number,
          status: updateRoomDto.status,
        },
        include: this.includeRelations(),
      });

      await this.auditLogService.record({
        action: AuditAction.UPDATE,
        entityType: 'room',
        entityId: room.id,
        propertyId: room.propertyId,
        summary: `Updated room ${room.roomNumber}`,
        metadata: {
          room_category_id: room.roomCategoryId,
          status: room.status,
        },
        user,
      });

      const impactedPropertyIds = new Set<string>();
      if (
        existingRoom.propertyId !== room.propertyId ||
        existingRoom.roomCategoryId !== room.roomCategoryId ||
        existingRoom.status !== room.status
      ) {
        impactedPropertyIds.add(existingRoom.propertyId);
        impactedPropertyIds.add(room.propertyId);
      }

      for (const propertyId of impactedPropertyIds) {
        await this.backgroundJobService.queueInventorySyncsForProperty(propertyId, {
          trigger: 'room_updated',
        });
      }

      return this.toRoomResponse(room);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string, user?: AuthenticatedUser) {
    try {
      if (user) {
        const existingRoom = await this.prisma.room.findUnique({ where: { id } });
        if (!existingRoom) {
          throw new NotFoundException('Room not found');
        }
        assertCanAccessProperty(user, existingRoom.propertyId);
      }

      const existingRoom = await this.prisma.room.findUnique({ where: { id } });
      await this.prisma.room.delete({
        where: { id },
      });

      await this.auditLogService.record({
        action: AuditAction.DELETE,
        entityType: 'room',
        entityId: id,
        propertyId: existingRoom?.propertyId ?? user?.property_id ?? null,
        summary: `Deleted room ${existingRoom?.roomNumber ?? id}`,
        user,
      });

      if (existingRoom?.propertyId) {
        await this.backgroundJobService.queueInventorySyncsForProperty(existingRoom.propertyId, {
          trigger: 'room_deleted',
        });
      }

      return { id, deleted: true };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findOutOfServicePeriods(roomId: string, user?: AuthenticatedUser) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        outOfServicePeriods: {
          orderBy: [{ fromDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    assertCanAccessProperty(user, room.propertyId);
    return room.outOfServicePeriods.map((period) => this.toOutOfServicePeriodResponse(period));
  }

  async createOutOfServicePeriod(roomId: string, dto: CreateRoomOutOfServicePeriodDto, user?: AuthenticatedUser) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    assertCanAccessProperty(user, room.propertyId);
    const fromDate = this.parseDateOnly(dto.from_date, 'from_date');
    const toDate = this.parseDateOnly(dto.to_date, 'to_date');
    if (toDate < fromDate) {
      throw new BadRequestException('to_date must be on or after from_date');
    }

    const overlapping = await this.prisma.roomOutOfServicePeriod.findFirst({
      where: {
        roomId,
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
    });
    if (overlapping) {
      throw new ConflictException('An overlapping out-of-service period already exists for this room.');
    }

    const period = await this.prisma.roomOutOfServicePeriod.create({
      data: {
        roomId,
        propertyId: room.propertyId,
        fromDate,
        toDate,
        reason: dto.reason.trim(),
        notes: dto.notes?.trim() || null,
      },
    });

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'room_out_of_service_period',
      entityId: period.id,
      propertyId: room.propertyId,
      summary: `Created out-of-service period for room ${room.roomNumber}`,
      metadata: {
        room_id: room.id,
        from_date: dto.from_date,
        to_date: dto.to_date,
        reason: dto.reason.trim(),
      },
      user,
    });

    await this.backgroundJobService.queueInventorySyncsForProperty(room.propertyId, {
      trigger: 'room_out_of_service_created',
    });

    return this.toOutOfServicePeriodResponse(period);
  }

  async removeOutOfServicePeriod(roomId: string, periodId: string, user?: AuthenticatedUser) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    assertCanAccessProperty(user, room.propertyId);
    const period = await this.prisma.roomOutOfServicePeriod.findUnique({ where: { id: periodId } });
    if (!period || period.roomId !== roomId) {
      throw new NotFoundException('Out-of-service period not found for this room');
    }

    await this.prisma.roomOutOfServicePeriod.delete({ where: { id: periodId } });

    await this.auditLogService.record({
      action: AuditAction.DELETE,
      entityType: 'room_out_of_service_period',
      entityId: period.id,
      propertyId: room.propertyId,
      summary: `Deleted out-of-service period for room ${room.roomNumber}`,
      metadata: {
        room_id: room.id,
        from_date: period.fromDate.toISOString().slice(0, 10),
        to_date: period.toDate.toISOString().slice(0, 10),
        reason: period.reason,
      },
      user,
    });

    await this.backgroundJobService.queueInventorySyncsForProperty(room.propertyId, {
      trigger: 'room_out_of_service_deleted',
    });

    return { id: periodId, deleted: true };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Room number already exists for this property');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Room not found');
      }

      if (error.code === 'P2003') {
        throw new ConflictException('Room has dependent records or invalid property/category');
      }
    }

    throw error;
  }

  private includeRelations() {
    return {
      property: true,
      roomCategory: true,
    } satisfies Prisma.RoomInclude;
  }

  private toRoomResponse(room: {
    id: string;
    propertyId: string;
    roomCategoryId: string;
    roomNumber: string;
    status: string;
    property: { id: string; name: string; code: string };
    roomCategory: { id: string; name: string; code: string };
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: room.id,
      property_id: room.propertyId,
      room_category_id: room.roomCategoryId,
      room_number: room.roomNumber,
      room_category: room.roomCategory,
      property: room.property,
      status: room.status,
      created_at: room.createdAt,
      updated_at: room.updatedAt,
    };
  }

  private toOutOfServicePeriodResponse(period: {
    id: string;
    roomId: string;
    propertyId: string;
    fromDate: Date;
    toDate: Date;
    reason: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: period.id,
      room_id: period.roomId,
      property_id: period.propertyId,
      from_date: period.fromDate.toISOString().slice(0, 10),
      to_date: period.toDate.toISOString().slice(0, 10),
      reason: period.reason,
      notes: period.notes,
      created_at: period.createdAt,
      updated_at: period.updatedAt,
    };
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    }

    return new Date(`${value}T00:00:00.000Z`);
  }
}
