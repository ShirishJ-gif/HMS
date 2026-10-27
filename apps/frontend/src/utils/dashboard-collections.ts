type DailyCollection = { date: string; amount: number };
type CollectionBucket = { from: string; to: string; amount: number };

// Keep the whole selected period visible, including on small screens.
export function groupDashboardCollections(points: DailyCollection[]) {
  const granularity = points.length <= 7 ? 'daily' : points.length <= 70 ? 'weekly' : 'monthly';
  const buckets: CollectionBucket[] = [];
  let previousKey = '';
  for (const [index, point] of points.entries()) {
    const key = granularity === 'daily' ? point.date : granularity === 'weekly' ? String(Math.floor(index / 7)) : point.date.slice(0, 7);
    if (key !== previousKey) {
      buckets.push({ from: point.date, to: point.date, amount: 0 });
      previousKey = key;
    }
    const bucket = buckets[buckets.length - 1];
    bucket.to = point.date;
    bucket.amount += Math.round(point.amount * 100);
  }
  return { granularity, buckets: buckets.map((bucket) => ({ ...bucket, amount: bucket.amount / 100 })) };
}
