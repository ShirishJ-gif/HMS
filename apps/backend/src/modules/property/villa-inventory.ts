import { BadRequestException } from '@nestjs/common';
import { Prisma, PropertyType } from '@prisma/client';

export const VILLA_INVENTORY_CODE = 'HMS_WHOLE_VILLA';
export const VILLA_ROOM_RATE_CODE = 'HMS_VILLA_ROOM';

// Keep one inventory unit per physical room; whole-villa bookings reserve all units.
export async function ensureVillaInventory(db: Prisma.TransactionClient, propertyId: string) {
  const property = await db.property.findUniqueOrThrow({ where: { id: propertyId } });
  if (property.propertyType !== PropertyType.RENTAL_VILLAS) {
    throw new BadRequestException('This property is not a rental villa');
  }
  await db.roomCategory.createMany({
    data: [{ propertyId, code: VILLA_INVENTORY_CODE, name: 'Entire villa', maxOccupancy: 20 }],
    skipDuplicates: true,
  });
  const category = await db.roomCategory.findUniqueOrThrow({ where: { propertyId_code: { propertyId, code: VILLA_INVENTORY_CODE } } });
  const roomCount = Math.max(1, Math.min(20, property.villaTotalRooms ?? 1));
  const roomNumbers = [VILLA_INVENTORY_CODE, ...Array.from({ length: roomCount - 1 }, (_, index) => `HMS_VILLA_ROOM_${String(index + 2).padStart(3, '0')}`)];
  await db.room.createMany({
    data: roomNumbers.map(roomNumber => ({ propertyId, roomCategoryId: category.id, roomNumber })),
    skipDuplicates: true,
  });
  const room = await db.room.findUniqueOrThrow({ where: { propertyId_roomNumber: { propertyId, roomNumber: VILLA_INVENTORY_CODE } } });
  await db.ratePlan.createMany({
    data: [
      { propertyId, roomCategoryId: category.id, code: VILLA_INVENTORY_CODE, name: 'Whole-villa nightly rate', baseRate: property.villaWholeRate ?? 0, currency: 'INR', isActive: Boolean(property.villaWholeRate && property.villaWholeRate.gt(0)) },
      { propertyId, roomCategoryId: category.id, code: VILLA_ROOM_RATE_CODE, name: 'Per-room nightly rate', baseRate: property.villaRoomRate ?? 0, currency: 'INR', isActive: Boolean(property.villaRoomRate && property.villaRoomRate.gt(0)) },
    ],
    skipDuplicates: true,
  });
  const ratePlan = await db.ratePlan.findUniqueOrThrow({ where: { propertyId_code: { propertyId, code: VILLA_INVENTORY_CODE } } });
  const roomRatePlan = await db.ratePlan.findUniqueOrThrow({ where: { propertyId_code: { propertyId, code: VILLA_ROOM_RATE_CODE } } });
  return { property, category, room, ratePlan, roomRatePlan };
}
