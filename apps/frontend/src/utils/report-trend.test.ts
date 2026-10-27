import assert from 'node:assert/strict';
import test from 'node:test';
import { groupReportTrend } from './report-trend';

const trend = Array.from({ length: 7 }, (_, index) => ({
  from: `2026-10-0${index + 1}`, to: `2026-10-0${index + 1}`,
  previous_from: `2026-09-0${index + 1}`, previous_to: `2026-09-0${index + 1}`,
  billed: index === 0 ? 0.1 : 0.2, collected: index === 0 ? -50 : 10,
  previous_billed: 20, previous_collected: -1, room_nights: 2,
}));

test('responsive groups retain billed, collected, refunds, and previous-period totals', () => {
  for (const limit of [3, 4, 6]) {
    const grouped = groupReportTrend(trend, limit);
    assert.ok(grouped.length <= limit);
    assert.equal(grouped[0].from, '2026-10-01');
    assert.equal(grouped.at(-1)?.to, '2026-10-07');
    assert.equal(grouped[0].previous_from, '2026-09-01');
    assert.equal(grouped.at(-1)?.previous_to, '2026-09-07');
    for (const key of ['billed', 'collected', 'previous_billed', 'previous_collected', 'room_nights'] as const) {
      assert.equal(grouped.reduce((sum, point) => sum + Math.round(point[key] * 100), 0), trend.reduce((sum, point) => sum + Math.round(point[key] * 100), 0));
    }
    assert.ok(grouped[0].collected < 0);
  }
});

test('single-day and empty reports remain valid', () => {
  assert.deepEqual(groupReportTrend([], 3), []);
  assert.deepEqual(groupReportTrend(trend.slice(0, 1), 3), trend.slice(0, 1));
});
