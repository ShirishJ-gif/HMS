import { parseCalendarBlocks } from './import-calendar';

const calendar = (event: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${event}\r\nEND:VCALENDAR`;
const stay = (extra = '') => `BEGIN:VEVENT\r\nUID:external-1\r\nDTSTART;VALUE=DATE:20300110\r\nDTEND;VALUE=DATE:20300112\r\nSUMMARY:Reserved\r\n${extra}\r\nEND:VEVENT`;

describe('iCal inventory parsing', () => {
  it('treats checkout as exclusive', () => {
    expect(parseCalendarBlocks(calendar(stay()))).toEqual([{
      fromDate: new Date('2030-01-10'), toDate: new Date('2030-01-11'), title: 'Reserved',
    }]);
  });
  it('ignores cancelled and transparent events', () => {
    expect(parseCalendarBlocks(calendar(stay('STATUS:CANCELLED')))).toEqual([]);
    expect(parseCalendarBlocks(calendar(stay('TRANSP:TRANSPARENT')))).toEqual([]);
  });
  it('accepts an empty calendar to remove stale blocks', () => {
    expect(parseCalendarBlocks(calendar(''))).toEqual([]);
  });
  it('rejects invalid calendars and unsupported recurrence without partial imports', () => {
    expect(() => parseCalendarBlocks('broken')).toThrow('Invalid iCal');
    expect(() => parseCalendarBlocks(calendar(stay('RRULE:FREQ=DAILY')))).toThrow('Recurring events');
  });
  it('does not silently interpret timed events as overnight stays', () => {
    expect(() => parseCalendarBlocks(calendar(stay().replace('DTSTART;VALUE=DATE:20300110', 'DTSTART:20300110T120000Z').replace('DTEND;VALUE=DATE:20300112', 'DTEND:20300112T120000Z')))).toThrow('all-day');
  });
  it('ignores reflected HMS exports', () => {
    expect(parseCalendarBlocks(calendar(stay().replace('external-1', 'hms-inventory-block-1@hms')))).toEqual([]);
  });
});
