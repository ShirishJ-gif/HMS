import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
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
      if (user) {
        const existingRoom = await this.prisma.room.findUnique({ where: { id } });
        if (!existingRoom) {
          throw new NotFoundException('Room not found');
        }
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

      return { id, deleted: true };
    } catch (error) {
      this.handlePrismaError(error);
    }
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
}
