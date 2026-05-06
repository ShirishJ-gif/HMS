import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryService } from '../inventory/inventory.service';

type InventoryRoomMapping = {
  roomCategoryId: string;
  externalRoomId: string;
  roomCategory: { code: string };
};

type InventoryWindow = {
  from: string;
  to: string;
};

@Injectable()
export class InventorySyncPayloadService {
  constructor(private readonly inventoryService: InventoryService) {}

  async buildDailyInventoryRows(
    propertyId: string,
    roomMappings: InventoryRoomMapping[],
    window: InventoryWindow,
  ) {
    if (roomMappings.length === 0) {
      return [];
    }

    const dates = this.expandWindow(window);
    const fromDate = this.parseDateOnly(window.from);
    const toDate = this.parseDateOnly(window.to);
    const roomCategoryIds = [...new Set(roomMappings.map((mapping) => mapping.roomCategoryId))];
    const inventoryRows = await this.inventoryService.rebuildCalendarRange({
      propertyId,
      roomCategoryIds,
      from: fromDate,
      to: toDate,
    });

    return roomMappings.flatMap((mapping) => {
      return dates.map((date) => {
        const row = inventoryRows.find(
          (inventoryRow: any) =>
            inventoryRow.roomCategoryId === mapping.roomCategoryId &&
            inventoryRow.stayDate.toISOString().slice(0, 10) === this.formatDateOnly(date),
        );

        return {
          date: this.formatDateOnly(date),
          external_room_id: mapping.externalRoomId,
          room_category_id: mapping.roomCategoryId,
          room_category_code: mapping.roomCategory.code,
          total_inventory: row?.totalRooms ?? 0,
          out_of_service: row?.blockedRooms ?? 0,
          booked: row?.reservedRooms ?? 0,
          available: row?.availableRooms ?? 0,
        };
      });
    });
  }

  private expandWindow(window: InventoryWindow) {
    const from = this.parseDateOnly(window.from);
    const to = this.parseDateOnly(window.to);

    if (to < from) {
      throw new BadRequestException('to must be on or after from');
    }

    const dates: Date[] = [];
    const current = new Date(from);
    while (current <= to) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Dates must use YYYY-MM-DD format');
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private formatDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
