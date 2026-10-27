import type { ReportsData } from '../features/reports/types';

export function groupReportTrend(trend: ReportsData['trend'], maxGroups: number): ReportsData['trend'] {
  const size = Math.max(1, Math.ceil(trend.length / maxGroups));
  const result: ReportsData['trend'] = [];
  for (let index = 0; index < trend.length; index += size) {
    const points = trend.slice(index, index + size);
    const first = points[0], last = points[points.length - 1];
    const sum = (key: 'billed' | 'collected' | 'previous_billed' | 'previous_collected') => points.reduce((total, point) => total + Math.round(point[key] * 100), 0) / 100;
    result.push({ ...first, to: last.to, previous_to: last.previous_to, billed: sum('billed'), collected: sum('collected'), previous_billed: sum('previous_billed'), previous_collected: sum('previous_collected'), room_nights: points.reduce((total, point) => total + point.room_nights, 0) });
  }
  return result;
}
