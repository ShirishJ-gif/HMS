import { BadRequestException } from '@nestjs/common';

// ical.js exposes CommonJS directly, while its declarations describe the ESM default.
const ICAL: typeof import('ical.js').default = require('ical.js');

export function parseCalendarBlocks(content: string) {
  try {
    const calendar = new ICAL.Component(ICAL.parse(content));
    if (calendar.name !== 'vcalendar') throw new Error('Expected VCALENDAR');
    const components = calendar.getAllSubcomponents('vevent');
    if (components.length > 5000) throw new Error('Too many events');
    const blocks: Array<{ fromDate: Date; toDate: Date; title: string }> = [];
    for (const component of components) {
      if (String(component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED' ||
          String(component.getFirstPropertyValue('transp')).toUpperCase() === 'TRANSPARENT') continue;
      const event = new ICAL.Event(component);
      // Do not re-import our own exported inventory through a subscribed calendar.
      if (event.uid?.startsWith('hms-') && event.uid.endsWith('@hms')) continue;
      if (event.isRecurring() || event.isRecurrenceException()) {
        throw new BadRequestException('Recurring events are not supported for inventory imports. Use a booking calendar with individual stays.');
      }
      const start = event.startDate;
      const end = event.endDate;
      if (!start?.isDate || !end?.isDate) {
        throw new BadRequestException('Inventory imports require all-day stay dates. Timed events cannot be imported as villa nights.');
      }
      const fromDate = new Date(Date.UTC(start.year, start.month - 1, start.day));
      const exclusiveEnd = new Date(Date.UTC(end.year, end.month - 1, end.day));
      if (!Number.isFinite(fromDate.getTime()) || exclusiveEnd <= fromDate) throw new Error('Invalid event dates');
      blocks.push({ fromDate, toDate: new Date(exclusiveEnd.getTime() - 86400000), title: event.summary || 'Imported stay' });
    }
    return blocks;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Invalid iCal content. Existing imported blocks have not been changed.');
  }
}
