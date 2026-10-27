import '../../common/env/load-env';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ICalCalendarService } from './ical-calendar.service';
import { InventoryService } from '../inventory/inventory.service';
import { RoomOutOfServiceCalendarService } from '../room-out-of-service/room-out-of-service-calendar.service';
import * as history from './calendar-history';

const integration = process.env.RUN_ICAL_HISTORY_INTEGRATION === 'true' ? describe : describe.skip;
const feed = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
const event = (id: string, start: string, end: string, extra = '') => `BEGIN:VEVENT\r\nUID:${id}\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:Not available\r\n${extra}\r\nEND:VEVENT`;

integration('iCal refresh history (rolled back)', () => {
  const prisma = new PrismaClient();
  afterAll(async () => { jest.restoreAllMocks(); await prisma.$disconnect(); });

  it('keeps past nights while refreshing future nights, without duplicates or cross-feed changes', async () => {
    const clock = jest.spyOn(history, 'calendarToday').mockReturnValue(new Date('2026-10-09'));
    const rollback = new Error('rollback iCal history fixture');
    await expect(prisma.$transaction(async tx => {
      const property = await tx.property.create({ data: { name: 'iCal history test', code: randomUUID(), address: 'Test', propertyType: 'RENTAL_VILLAS' } });
      const db = new Proxy(tx, { get: (target, key) => key === '$transaction'
        ? async (input: unknown) => typeof input === 'function' ? input(tx) : Promise.all(input as Promise<unknown>[])
        : Reflect.get(target, key) });
      const inventory = new InventoryService(db as never, {} as never, {} as never, new RoomOutOfServiceCalendarService(db as never));
      const service = new ICalCalendarService(db as never, inventory);
      const dto = { property_id: property.id, feed_key: 'airbnb-history-test', name: 'Airbnb', content: feed([
        event('past', '20261002', '20261004'), event('spanning', '20261007', '20261012'), event('future', '20261020', '20261022'),
      ].join('\r\n')) };
      const read = () => tx.inventoryBlock.findMany({ where: { propertyId: property.id, sourceName: 'Airbnb' }, orderBy: { fromDate: 'asc' } });
      const dates = async () => (await read()).map(b => [b.fromDate.toISOString().slice(0, 10), b.toDate.toISOString().slice(0, 10)]);
      await service.syncInventory(dto);
      const pastIds = (await read()).filter(b => b.toDate < new Date('2026-10-09')).map(b => b.id);
      await service.syncInventory(dto);
      expect(await dates()).toEqual([['2026-10-02', '2026-10-03'], ['2026-10-07', '2026-10-08'], ['2026-10-09', '2026-10-11'], ['2026-10-20', '2026-10-21']]);
      expect((await read()).filter(b => b.toDate < new Date('2026-10-09')).map(b => b.id)).toEqual(pastIds);

      // Other feeds and manual blocks must be untouched by Airbnb refreshes.
      await service.syncInventory({ ...dto, feed_key: 'other', name: 'Other feed', content: feed(event('other', '20261025', '20261026')) });
      const category = await tx.roomCategory.findFirstOrThrow({ where: { propertyId: property.id } });
      const manual = await tx.inventoryBlock.create({ data: { propertyId: property.id, roomCategoryId: category.id, fromDate: new Date('2026-10-27'), toDate: new Date('2026-10-27'), reason: 'Manual test' } });

      // A day rolls into history even if the next feed no longer contains it.
      clock.mockReturnValue(new Date('2026-10-10'));
      await service.syncInventory({ ...dto, content: feed('') });
      expect(await dates()).toEqual([['2026-10-02', '2026-10-03'], ['2026-10-07', '2026-10-08'], ['2026-10-09', '2026-10-09']]);
      await service.syncInventory({ ...dto, content: feed('') });
      expect(await read()).toHaveLength(3);
      expect(await tx.inventoryBlock.count({ where: { propertyId: property.id, sourceName: 'Other feed' } })).toBe(1);
      expect(await tx.inventoryBlock.findUnique({ where: { id: manual.id } })).not.toBeNull();

      const calendar = await inventory.getInventoryCalendar({ property_id: property.id, from: '2026-10-02', to: '2026-10-21' });
      const rows = calendar.categories[0].rows;
      expect(rows.find(row => row.date === '2026-10-02')?.blocked_rooms).toBe(1);
      expect(rows.find(row => row.date === '2026-10-09')?.blocked_rooms).toBe(1);
      expect(rows.find(row => row.date === '2026-10-10')?.available_rooms).toBe(1);
      expect(rows.find(row => row.date === '2026-10-20')?.available_rooms).toBe(1);

      await expect(service.syncInventory({ ...dto, content: 'broken' })).rejects.toThrow('Invalid iCal');
      expect(await read()).toHaveLength(3);
      // Cancelled feed events cannot erase past evidence or keep future blocks.
      await service.syncInventory({ ...dto, content: feed(event('past', '20261002', '20261004', 'STATUS:CANCELLED') + '\r\n' + event('new', '20261015', '20261016')) });
      expect(await dates()).toEqual([['2026-10-02', '2026-10-03'], ['2026-10-07', '2026-10-08'], ['2026-10-09', '2026-10-09'], ['2026-10-15', '2026-10-15']]);
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  });
});
