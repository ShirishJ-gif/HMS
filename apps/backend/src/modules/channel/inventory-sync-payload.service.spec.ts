import { InventorySyncPayloadService } from './inventory-sync-payload.service';

describe('InventorySyncPayloadService', () => {
  const inventoryService = {
    rebuildCalendarRange: jest.fn(),
  };

  let service: InventorySyncPayloadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventorySyncPayloadService(inventoryService as never);
  });

  it('builds one inventory row per mapped room per date', async () => {
    inventoryService.rebuildCalendarRange.mockResolvedValue([
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-01T00:00:00.000Z'),
        totalRooms: 3,
        blockedRooms: 1,
        reservedRooms: 1,
        availableRooms: 1,
      },
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-02T00:00:00.000Z'),
        totalRooms: 3,
        blockedRooms: 1,
        reservedRooms: 1,
        availableRooms: 1,
      },
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-03T00:00:00.000Z'),
        totalRooms: 3,
        blockedRooms: 1,
        reservedRooms: 0,
        availableRooms: 2,
      },
    ]);

    const rows = await service.buildDailyInventoryRows(
      'property-1',
      [
        {
          roomCategoryId: 'cat-1',
          externalRoomId: 'ext-room-1',
          roomCategory: { code: 'DELUXE' },
        },
      ],
      {
        from: '2026-06-01',
        to: '2026-06-03',
      },
    );

    expect(inventoryService.rebuildCalendarRange).toHaveBeenCalledWith({
      propertyId: 'property-1',
      roomCategoryIds: ['cat-1'],
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-03T00:00:00.000Z'),
    });
    expect(rows).toEqual([
      {
        date: '2026-06-01',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 1,
        available: 1,
      },
      {
        date: '2026-06-02',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 1,
        available: 1,
      },
      {
        date: '2026-06-03',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 0,
        available: 2,
      },
    ]);
  });

  it('fills missing dates with zero inventory rows', async () => {
    inventoryService.rebuildCalendarRange.mockResolvedValue([
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-02T00:00:00.000Z'),
        totalRooms: 2,
        blockedRooms: 1,
        reservedRooms: 0,
        availableRooms: 1,
      },
    ]);

    const rows = await service.buildDailyInventoryRows(
      'property-1',
      [
        {
          roomCategoryId: 'cat-1',
          externalRoomId: 'ext-room-1',
          roomCategory: { code: 'DELUXE' },
        },
      ],
      {
        from: '2026-06-01',
        to: '2026-06-02',
      },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        total_inventory: 0,
        out_of_service: 0,
        booked: 0,
        available: 0,
      }),
      expect.objectContaining({
        date: '2026-06-02',
        total_inventory: 2,
        out_of_service: 1,
        booked: 0,
        available: 1,
      }),
    ]);
  });
});
