import { calendarBlocksToInsert, calendarToday } from './calendar-history';

const range = (from: string, to: string, title = 'Unavailable') => ({ fromDate: new Date(from), toDate: new Date(to), title });
const today = new Date('2026-10-09');

describe('iCal historical coverage', () => {
  it('uses India midnight even when UTC is still the previous date', () => {
    expect(calendarToday(new Date('2026-10-08T18:29:59Z'))).toEqual(new Date('2026-10-08'));
    expect(calendarToday(new Date('2026-10-08T18:30:00Z'))).toEqual(today);
  });

  it('does not recreate existing past nights on repeat refreshes', () => {
    const past = range('2026-10-02', '2026-10-03');
    expect(calendarBlocksToInsert([past], [past], today)).toEqual([]);
    expect(calendarBlocksToInsert([], [past], today)).toEqual([]);
  });

  it('splits stays spanning today into history and current availability', () => {
    const stay = range('2026-10-07', '2026-10-12');
    expect(calendarBlocksToInsert([stay], [], today)).toEqual([
      range('2026-10-09', '2026-10-12'), range('2026-10-07', '2026-10-08'),
    ]);
    expect(calendarBlocksToInsert([stay], [stay], today)).toEqual([range('2026-10-09', '2026-10-12')]);
  });

  it('adds only missing historical nights even across overlapping ranges', () => {
    expect(calendarBlocksToInsert([range('2026-10-01', '2026-10-08')], [
      range('2026-10-02', '2026-10-03'), range('2026-10-03', '2026-10-04'), range('2026-10-06', '2026-10-07'),
    ], today)).toEqual([range('2026-10-01', '2026-10-01'), range('2026-10-05', '2026-10-05'), range('2026-10-08', '2026-10-08')]);
  });

  it('deduplicates historical events in one feed and handles year boundaries', () => {
    const old = range('2025-12-31', '2026-01-01');
    expect(calendarBlocksToInsert([old, old], [], today)).toEqual([old]);
  });
});
