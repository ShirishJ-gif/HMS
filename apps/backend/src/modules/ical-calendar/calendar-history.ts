type DateRange = { fromDate: Date; toDate: Date };
type CalendarBlock = DateRange & { title: string };
const dayMs = 86_400_000;

export function calendarToday(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  return new Date(`${date}T00:00:00Z`);
}

// Historical coverage is immutable evidence of unavailable nights, not proof of
// a booking. Import only uncovered past nights; today/future follow the feed.
export function calendarBlocksToInsert(incoming: CalendarBlock[], existing: DateRange[], today: Date): CalendarBlock[] {
  const boundary = today.getTime();
  const covered = existing
    .filter(range => range.fromDate.getTime() < boundary)
    .map(range => ({ from: range.fromDate.getTime(), to: Math.min(range.toDate.getTime(), boundary - dayMs) }));
  const result: CalendarBlock[] = [];
  for (const block of incoming) {
    const from = block.fromDate.getTime();
    const to = block.toDate.getTime();
    if (to >= boundary) result.push({ ...block, fromDate: new Date(Math.max(from, boundary)) });
    if (from >= boundary) continue;
    const end = Math.min(to, boundary - dayMs);
    let cursor = from;
    for (const range of [...covered].sort((a, b) => a.from - b.from)) {
      if (range.to < cursor) continue;
      if (range.from > end) break;
      if (range.from > cursor) result.push({ ...block, fromDate: new Date(cursor), toDate: new Date(range.from - dayMs) });
      cursor = Math.max(cursor, range.to + dayMs);
      if (cursor > end) break;
    }
    if (cursor <= end) result.push({ ...block, fromDate: new Date(cursor), toDate: new Date(end) });
    covered.push({ from, to: end });
  }
  return result;
}
