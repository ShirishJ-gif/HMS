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
        stopSell: false,
        closedToArrival: false,
        closedToDeparture: false,
        minStay: null,
        maxStay: null,
      },
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-02T00:00:00.000Z'),
        totalRooms: 3,
        blockedRooms: 1,
        reservedRooms: 1,
        availableRooms: 1,
        stopSell: true,
        closedToArrival: true,
        closedToDeparture: false,
        minStay: 2,
        maxStay: 5,
      },
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-03T00:00:00.000Z'),
        totalRooms: 3,
        blockedRooms: 1,
        reservedRooms: 0,
        availableRooms: 2,
        stopSell: false,
        closedToArrival: false,
        closedToDeparture: true,
        minStay: null,
        maxStay: null,
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
        stop_sell: false,
        closed_to_arrival: false,
        closed_to_departure: false,
        min_stay: null,
        max_stay: null,
      },
      {
        date: '2026-06-02',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 1,
        available: 0,
        stop_sell: true,
        closed_to_arrival: true,
        closed_to_departure: false,
        min_stay: 2,
        max_stay: 5,
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
        stop_sell: false,
        closed_to_arrival: false,
        closed_to_departure: true,
        min_stay: null,
        max_stay: null,
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
