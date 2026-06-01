import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HousekeepingStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHousekeepingTaskDto } from './dto/create-housekeeping-task.dto';
import { UpdateHousekeepingTaskDto } from './dto/update-housekeeping-task.dto';

@Injectable()
export class HousekeepingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.HousekeepingTaskWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { notes: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { room: { roomNumber: { contains: search, mode: 'insensitive' } } },
              { room: { roomCategory: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.housekeepingTask.findMany({
        where,
        include: this.includeRelations(),
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.housekeepingTask.count({ where }),
    ]);

    return paginatedResponse(tasks.map((task) => this.toResponse(task)), total, page, limit);
  }

  async create(dto: CreateHousekeepingTaskDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);

    const room = await this.prisma.room.findUnique({
      where: { id: dto.room_id },
    });

    if (!room || room.propertyId !== dto.property_id) {
      throw new ConflictException('Room does not belong to property');
    }

    const task = await this.prisma.housekeepingTask.create({
      data: {
        propertyId: dto.property_id,
        roomId: dto.room_id,
        status: dto.status,
        priority: dto.priority,
        notes: dto.notes,
        dueDate: dto.due_date ? new Date(`${dto.due_date}T00:00:00.000Z`) : undefined,
        completedAt: dto.status === HousekeepingStatus.INSPECTED ? new Date() : undefined,
      },
      include: this.includeRelations(),
    });

    return this.toResponse(task);
  }

  async update(id: string, dto: UpdateHousekeepingTaskDto, user?: AuthenticatedUser) {
    try {
      if (user) {
        const existingTask = await this.prisma.housekeepingTask.findUnique({ where: { id } });
        if (!existingTask) {
          throw new NotFoundException('Housekeeping task not found');
        }
        assertCanAccessProperty(user, existingTask.propertyId);
      }

      const task = await this.prisma.housekeepingTask.update({
        where: { id },
        data: {
          status: dto.status,
          priority: dto.priority,
          notes: dto.notes,
          dueDate: dto.due_date ? new Date(`${dto.due_date}T00:00:00.000Z`) : undefined,
          ...(dto.status
            ? { completedAt: dto.status === HousekeepingStatus.INSPECTED ? new Date() : null }
            : {}),
        },
        include: this.includeRelations(),
      });

      return this.toResponse(task);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Housekeeping task not found');
      }

      throw error;
    }
  }

  private includeRelations() {
    return {
      property: true,
      reservationRoom: {
        include: {
          reservationGroup: true,
        },
      },
      room: {
        include: {
          roomCategory: true,
        },
      },
    } satisfies Prisma.HousekeepingTaskInclude;
  }

  private toResponse(task: {
    id: string;
    propertyId: string;
    roomId: string;
    reservationRoomId: string | null;
    status: string;
    priority: string;
    notes: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    property: { id: string; name: string; code: string };
    reservationRoom: {
      id: string;
      externalRoomReservationId: string;
      reservationGroup: { id: string; externalReservationId: string };
    } | null;
    room: {
      id: string;
      roomNumber: string;
      roomCategory: { id: string; name: string; code: string };
    };
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: task.id,
      property_id: task.propertyId,
      room_id: task.roomId,
      reservation_room_id: task.reservationRoomId,
      status: task.status,
      priority: task.priority,
      notes: task.notes,
      due_date: task.dueDate?.toISOString().slice(0, 10) ?? null,
      completed_at: task.completedAt?.toISOString() ?? null,
      property: {
        id: task.property.id,
        name: task.property.name,
        code: task.property.code,
      },
      room: {
        id: task.room.id,
        room_number: task.room.roomNumber,
        room_category: {
          id: task.room.roomCategory.id,
          name: task.room.roomCategory.name,
          code: task.room.roomCategory.code,
        },
      },
      reservation_room: task.reservationRoom
        ? {
            id: task.reservationRoom.id,
            external_room_reservation_id: task.reservationRoom.externalRoomReservationId,
            reservation_group_id: task.reservationRoom.reservationGroup.id,
            external_reservation_id: task.reservationRoom.reservationGroup.externalReservationId,
          }
        : null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };
  }
}
