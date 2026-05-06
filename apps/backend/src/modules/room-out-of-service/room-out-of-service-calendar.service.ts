import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RoomOutOfServiceCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async loadRoomDateMap(
    input: {
      roomIds: string[];
      from: Date;
      to: Date;
    },
    db: DbClient = this.prisma,
  ) {
    if (input.roomIds.length === 0) {
      return new Map<string, Set<string>>();
    }

    if (input.to < input.from) {
      throw new BadRequestException('to must be on or after from');
    }

    const periods = await db.roomOutOfServicePeriod.findMany({
      where: {
        roomId: { in: input.roomIds },
        fromDate: { lte: input.to },
        toDate: { gte: input.from },
      },
      select: {
        roomId: true,
        fromDate: true,
        toDate: true,
      },
    });

    const map = new Map<string, Set<string>>();
    for (const period of periods) {
      const start = this.maxDateOnly(period.fromDate, input.from);
      const end = this.minDateOnly(period.toDate, input.to);
      for (let cursor = new Date(start); cursor <= end; cursor = this.addDays(cursor, 1)) {
        const key = this.formatDateOnly(cursor);
        const roomDates = map.get(period.roomId) ?? new Set<string>();
        roomDates.add(key);
        map.set(period.roomId, roomDates);
      }
    }

    return map;
  }

  isRoomOutOfServiceOnDate(roomId: string, date: Date, roomDateMap: Map<string, Set<string>>) {
    return roomDateMap.get(roomId)?.has(this.formatDateOnly(date)) ?? false;
  }

  hasRoomOutOfServiceInWindow(roomId: string, roomDateMap: Map<string, Set<string>>) {
    return (roomDateMap.get(roomId)?.size ?? 0) > 0;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private formatDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private maxDateOnly(left: Date, right: Date) {
    return new Date(`${(left > right ? left : right).toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  private minDateOnly(left: Date, right: Date) {
    return new Date(`${(left < right ? left : right).toISOString().slice(0, 10)}T00:00:00.000Z`);
  }
}
