import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, BookingStatus, Prisma, RoomStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomOutOfServiceCalendarService } from '../room-out-of-service/room-out-of-service-calendar.service';
import { CreateInventoryBlockDto } from './dto/create-inventory-block.dto';
import { GetInventoryCalendarDto } from './dto/get-inventory-calendar.dto';
import { SetInventoryRestrictionsDto } from './dto/set-inventory-restrictions.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly roomOutOfServiceCalendarService: RoomOutOfServiceCalendarService,
  ) {}

  async getInventoryCalendar(query: GetInventoryCalendarDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, query.property_id);
    const from = this.parseDateOnly(query.from, 'from');
    const to = this.parseDateOnly(query.to, 'to');

    if (to < from) {
      throw new BadRequestException('to must be on or after from');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: query.property_id },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    await this.rebuildCalendarRange({
      propertyId: query.property_id,
      from,
      to,
    });

    const [categories, rows]: [any[], any[]] = await this.prisma.$transaction([
      this.prisma.roomCategory.findMany({
        where: { propertyId: query.property_id },
        orderBy: { name: 'asc' },
      }),
      this.prisma.inventoryCalendar.findMany({
        where: {
          propertyId: query.property_id,
          stayDate: {
            gte: from,
            lte: to,
          },
        },
        orderBy: [{ roomCategory: { name: 'asc' } }, { stayDate: 'asc' }],
      }),
    ]);

    return {
      property_id: property.id,
      property_name: property.name,
      from: query.from,
      to: query.to,
      categories: categories.map((category: any) => ({
        room_category_id: category.id,
        name: category.name,
        code: category.code,
        rows: rows
          .filter((row: any) => row.roomCategoryId === category.id)
          .map((row: any) => this.toCalendarRowResponse(row)),
      })),
    };
  }

  async createInventoryBlock(dto: CreateInventoryBlockDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    const fromDate = this.parseDateOnly(dto.from_date, 'from_date');
    const toDate = this.parseDateOnly(dto.to_date, 'to_date');

    if (toDate < fromDate) {
      throw new BadRequestException('to_date must be on or after from_date');
    }

    const roomCategory = await this.prisma.roomCategory.findUnique({
      where: { id: dto.room_category_id },
    });

    if (!roomCategory || roomCategory.propertyId !== dto.property_id) {
      throw new NotFoundException('Room category not found for this property');
    }

    const block = await this.prisma.inventoryBlock.create({
      data: {
        propertyId: dto.property_id,
        roomCategoryId: dto.room_category_id,
        fromDate,
        toDate,
        blockedRooms: dto.blocked_rooms,
        reason: dto.reason.trim(),
        source: dto.source?.trim() || 'MANUAL',
        createdByUserId: user?.sub ?? null,
      },
    });

    await this.rebuildCalendarRange({
      propertyId: dto.property_id,
      roomCategoryIds: [dto.room_category_id],
      from: fromDate,
      to: toDate,
    });

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'inventory_block',
      entityId: block.id,
      propertyId: block.propertyId,
      summary: `Created inventory block for ${roomCategory.name}`,
      metadata: {
        room_category_id: block.roomCategoryId,
        from_date: dto.from_date,
        to_date: dto.to_date,
        blocked_rooms: dto.blocked_rooms,
        reason: dto.reason.trim(),
        source: dto.source?.trim() || 'MANUAL',
      },
      user,
    });

    return this.toInventoryBlockResponse(block);
  }

  async setInventoryRestrictions(dto: SetInventoryRestrictionsDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    const fromDate = this.parseDateOnly(dto.from_date, 'from_date');
    const toDate = this.parseDateOnly(dto.to_date, 'to_date');

    if (toDate < fromDate) {
      throw new BadRequestException('to_date must be on or after from_date');
    }

    if (
      dto.stop_sell === undefined &&
      dto.min_stay === undefined &&
      dto.max_stay === undefined
    ) {
      throw new BadRequestException('At least one restriction field is required');
    }

    if (
      typeof dto.min_stay === 'number' &&
      typeof dto.max_stay === 'number' &&
      dto.max_stay < dto.min_stay
    ) {
      throw new BadRequestException('max_stay must be greater than or equal to min_stay');
    }

    const roomCategory = await this.prisma.roomCategory.findUnique({
      where: { id: dto.room_category_id },
    });

    if (!roomCategory || roomCategory.propertyId !== dto.property_id) {
      throw new NotFoundException('Room category not found for this property');
    }

    await this.rebuildCalendarRange({
      propertyId: dto.property_id,
      roomCategoryIds: [dto.room_category_id],
      from: fromDate,
      to: toDate,
    });

    await this.prisma.inventoryCalendar.updateMany({
      where: {
        propertyId: dto.property_id,
        roomCategoryId: dto.room_category_id,
        stayDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      data: {
        ...(dto.stop_sell !== undefined ? { stopSell: dto.stop_sell } : {}),
        ...(dto.min_stay !== undefined ? { minStay: dto.min_stay } : {}),
        ...(dto.max_stay !== undefined ? { maxStay: dto.max_stay } : {}),
      },
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'inventory_restriction',
      entityId: dto.room_category_id,
      propertyId: dto.property_id,
      summary: `Updated inventory restrictions for ${roomCategory.name}`,
      metadata: {
        room_category_id: dto.room_category_id,
        from_date: dto.from_date,
        to_date: dto.to_date,
        stop_sell: dto.stop_sell,
        min_stay: dto.min_stay,
        max_stay: dto.max_stay,
      },
      user,
    });

    return {
      property_id: dto.property_id,
      room_category_id: dto.room_category_id,
      from_date: dto.from_date,
      to_date: dto.to_date,
      stop_sell: dto.stop_sell,
      min_stay: dto.min_stay,
      max_stay: dto.max_stay,
      updated: true,
    };
  }

  async rebuildCalendarRange(
    input: {
      propertyId: string;
      from: Date;
      to: Date;
      roomCategoryIds?: string[];
    },
    db: DbClient = this.prisma,
  ) {
    if (input.to < input.from) {
      throw new BadRequestException('to must be on or after from');
    }

    const roomCategories = await db.roomCategory.findMany({
      where: {
        propertyId: input.propertyId,
        ...(input.roomCategoryIds?.length ? { id: { in: input.roomCategoryIds } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    if (roomCategories.length === 0) {
      return [];
    }

    const roomCategoryIds = roomCategories.map((category) => category.id);
    const dates = this.eachDateInclusive(input.from, input.to);
    const rooms = await db.room.findMany({
      where: {
        propertyId: input.propertyId,
        roomCategoryId: { in: roomCategoryIds },
      },
      select: {
        id: true,
        roomCategoryId: true,
        status: true,
      },
    });
    const roomDateMap = await this.roomOutOfServiceCalendarService.loadRoomDateMap(
      {
        roomIds: rooms.map((room) => room.id),
        from: input.from,
        to: input.to,
      },
      db,
    );
    const [reservationRooms, inventoryBlocks, existingRows]: [any[], any[], any[]] = await Promise.all([
      db.reservationRoom.findMany({
        where: {
          propertyId: input.propertyId,
          roomCategoryId: { in: roomCategoryIds },
          status: {
            in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN],
          },
          arrivalDate: { lte: input.to },
          departureDate: { gt: input.from },
        },
        select: {
          roomCategoryId: true,
          arrivalDate: true,
          departureDate: true,
        },
      }),
      db.inventoryBlock.findMany({
        where: {
          propertyId: input.propertyId,
          roomCategoryId: { in: roomCategoryIds },
          fromDate: { lte: input.to },
          toDate: { gte: input.from },
        },
        select: {
          roomCategoryId: true,
          fromDate: true,
          toDate: true,
          blockedRooms: true,
        },
      }),
      db.inventoryCalendar.findMany({
        where: {
          propertyId: input.propertyId,
          roomCategoryId: { in: roomCategoryIds },
          stayDate: { gte: input.from, lte: input.to },
        },
      }),
    ]);

    const categoryRooms = new Map<string, Array<{ id: string; status: RoomStatus }>>();
    for (const room of rooms) {
      const list = categoryRooms.get(room.roomCategoryId) ?? [];
      list.push(room);
      categoryRooms.set(room.roomCategoryId, list);
    }

    const existingKeySet = new Set(
      existingRows.map((row: any) => this.calendarKey(row.roomCategoryId, row.stayDate)),
    );
    const missingRows = roomCategoryIds.flatMap((roomCategoryId) =>
      dates
        .filter((date) => !existingKeySet.has(this.calendarKey(roomCategoryId, date)))
        .map((date) => ({
          propertyId: input.propertyId,
          roomCategoryId,
          stayDate: date,
        })),
    );

    if (missingRows.length > 0) {
      await db.inventoryCalendar.createMany({
        data: missingRows,
        skipDuplicates: true,
      });
    }

    const rows = await db.inventoryCalendar.findMany({
      where: {
        propertyId: input.propertyId,
        roomCategoryId: { in: roomCategoryIds },
        stayDate: { gte: input.from, lte: input.to },
      },
      orderBy: [{ roomCategoryId: 'asc' }, { stayDate: 'asc' }],
    });

    for (const row of rows) {
      const date = this.toDateOnly(row.stayDate);
      const roomsForCategory = categoryRooms.get(row.roomCategoryId) ?? [];
      const totalRooms = roomsForCategory.length;
      const outOfServiceRooms = roomsForCategory.filter(
        (room) =>
          room.status === RoomStatus.MAINTENANCE ||
          this.roomOutOfServiceCalendarService.isRoomOutOfServiceOnDate(room.id, date, roomDateMap),
      ).length;
      const manualBlockedRooms = inventoryBlocks
        .filter(
          (block: any) =>
            block.roomCategoryId === row.roomCategoryId &&
            this.overlapsDateInclusive(block.fromDate, block.toDate, date),
        )
        .reduce((sum: number, block: any) => sum + block.blockedRooms, 0);
      const blockedRooms = Math.min(totalRooms, outOfServiceRooms + manualBlockedRooms);
      const reservedRooms = reservationRooms.filter(
        (reservationRoom: any) =>
          reservationRoom.roomCategoryId === row.roomCategoryId &&
          this.overlapsStayDate(reservationRoom.arrivalDate, reservationRoom.departureDate, date),
      ).length;
      const availableRooms = Math.max(totalRooms - blockedRooms - reservedRooms, 0);

      await db.inventoryCalendar.update({
        where: {
          propertyId_roomCategoryId_stayDate: {
            propertyId: row.propertyId,
            roomCategoryId: row.roomCategoryId,
            stayDate: row.stayDate,
          },
        },
        data: {
          totalRooms,
          blockedRooms,
          reservedRooms,
          availableRooms,
        },
      });
    }

    return db.inventoryCalendar.findMany({
      where: {
        propertyId: input.propertyId,
        roomCategoryId: { in: roomCategoryIds },
        stayDate: { gte: input.from, lte: input.to },
      },
      orderBy: [{ roomCategoryId: 'asc' }, { stayDate: 'asc' }],
    });
  }

  async allocateInventory(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      roomCategoryId: string;
      checkInDate: Date;
      checkOutDate: Date;
      roomCount: number;
    },
  ) {
    const stayDates = this.eachStayDate(input.checkInDate, input.checkOutDate);
    if (stayDates.length === 0) {
      throw new BadRequestException('Reservation must contain at least one stay night');
    }

    await this.rebuildCalendarRange(
      {
        propertyId: input.propertyId,
        roomCategoryIds: [input.roomCategoryId],
        from: stayDates[0],
        to: stayDates[stayDates.length - 1],
      },
      tx,
    );

    await tx.$queryRaw`
      SELECT id
      FROM inventory_calendar
      WHERE property_id = ${input.propertyId}::uuid
        AND room_category_id = ${input.roomCategoryId}::uuid
        AND stay_date >= ${stayDates[0]}::date
        AND stay_date <= ${stayDates[stayDates.length - 1]}::date
      FOR UPDATE
    `;

    const rows = await tx.inventoryCalendar.findMany({
      where: {
        propertyId: input.propertyId,
        roomCategoryId: input.roomCategoryId,
        stayDate: {
          gte: stayDates[0],
          lte: stayDates[stayDates.length - 1],
        },
      },
      orderBy: { stayDate: 'asc' },
    });

    if (rows.length !== stayDates.length) {
      throw new ConflictException('Inventory calendar rows are missing for the requested stay dates');
    }

    const stayLength = stayDates.length;
    for (const row of rows) {
      if (row.stopSell) {
        throw new ConflictException(
          `Stop-sell is active for ${row.stayDate.toISOString().slice(0, 10)}`,
        );
      }
      if (row.minStay && stayLength < row.minStay) {
        throw new ConflictException(`Minimum stay is ${row.minStay} nights for this room type`);
      }
      if (row.maxStay && stayLength > row.maxStay) {
        throw new ConflictException(`Maximum stay is ${row.maxStay} nights for this room type`);
      }
      if (row.availableRooms < input.roomCount) {
        throw new ConflictException(
          `Insufficient inventory on ${row.stayDate.toISOString().slice(0, 10)}`,
        );
      }
    }

    for (const row of rows) {
      await tx.inventoryCalendar.update({
        where: { id: row.id },
        data: {
          reservedRooms: { increment: input.roomCount },
          availableRooms: { decrement: input.roomCount },
        },
      });
    }
  }

  async releaseInventory(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      roomCategoryId: string;
      checkInDate: Date;
      checkOutDate: Date;
      roomCount: number;
    },
  ) {
    const stayDates = this.eachStayDate(input.checkInDate, input.checkOutDate);
    if (stayDates.length === 0) {
      return;
    }

    await this.rebuildCalendarRange(
      {
        propertyId: input.propertyId,
        roomCategoryIds: [input.roomCategoryId],
        from: stayDates[0],
        to: stayDates[stayDates.length - 1],
      },
      tx,
    );

    await tx.$queryRaw`
      SELECT id
      FROM inventory_calendar
      WHERE property_id = ${input.propertyId}::uuid
        AND room_category_id = ${input.roomCategoryId}::uuid
        AND stay_date >= ${stayDates[0]}::date
        AND stay_date <= ${stayDates[stayDates.length - 1]}::date
      FOR UPDATE
    `;

    const rows = await tx.inventoryCalendar.findMany({
      where: {
        propertyId: input.propertyId,
        roomCategoryId: input.roomCategoryId,
        stayDate: {
          gte: stayDates[0],
          lte: stayDates[stayDates.length - 1],
        },
      },
    });

    for (const row of rows) {
      const nextReserved = Math.max(row.reservedRooms - input.roomCount, 0);
      const nextAvailable = Math.max(row.totalRooms - row.blockedRooms - nextReserved, 0);
      await tx.inventoryCalendar.update({
        where: { id: row.id },
        data: {
          reservedRooms: nextReserved,
          availableRooms: nextAvailable,
        },
      });
    }
  }

  private toCalendarRowResponse(row: {
    stayDate: Date;
    totalRooms: number;
    blockedRooms: number;
    reservedRooms: number;
    availableRooms: number;
    stopSell: boolean;
    minStay: number | null;
    maxStay: number | null;
  }) {
    return {
      date: row.stayDate.toISOString().slice(0, 10),
      total_rooms: row.totalRooms,
      blocked_rooms: row.blockedRooms,
      reserved_rooms: row.reservedRooms,
      available_rooms: row.availableRooms,
      stop_sell: row.stopSell,
      min_stay: row.minStay,
      max_stay: row.maxStay,
    };
  }

  private toInventoryBlockResponse(block: {
    id: string;
    propertyId: string;
    roomCategoryId: string;
    fromDate: Date;
    toDate: Date;
    blockedRooms: number;
    reason: string;
    source: string;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: block.id,
      property_id: block.propertyId,
      room_category_id: block.roomCategoryId,
      from_date: block.fromDate.toISOString().slice(0, 10),
      to_date: block.toDate.toISOString().slice(0, 10),
      blocked_rooms: block.blockedRooms,
      reason: block.reason,
      source: block.source,
      created_by_user_id: block.createdByUserId,
      created_at: block.createdAt,
      updated_at: block.updatedAt,
    };
  }

  private eachDateInclusive(from: Date, to: Date) {
    const dates: Date[] = [];
    for (let cursor = new Date(from); cursor <= to; cursor = this.addDays(cursor, 1)) {
      dates.push(new Date(cursor));
    }
    return dates;
  }

  private eachStayDate(checkInDate: Date, checkOutDate: Date) {
    if (checkOutDate <= checkInDate) {
      throw new BadRequestException('check_out_date must be after check_in_date');
    }

    const dates: Date[] = [];
    for (let cursor = new Date(checkInDate); cursor < checkOutDate; cursor = this.addDays(cursor, 1)) {
      dates.push(new Date(cursor));
    }
    return dates;
  }

  private overlapsDateInclusive(fromDate: Date, toDate: Date, date: Date) {
    const from = this.toDateOnly(fromDate);
    const to = this.toDateOnly(toDate);
    return from <= date && to >= date;
  }

  private overlapsStayDate(arrivalDate: Date, departureDate: Date, date: Date) {
    const arrival = this.toDateOnly(arrivalDate);
    const departure = this.toDateOnly(departureDate);
    return arrival <= date && departure > date;
  }

  private calendarKey(roomCategoryId: string, stayDate: Date) {
    return `${roomCategoryId}:${stayDate.toISOString().slice(0, 10)}`;
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDateOnly(value: Date) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }
}
