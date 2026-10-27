import assert from 'node:assert/strict';
import test from 'node:test';
import { groupDashboardCollections } from './dashboard-collections';

function days(from: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.parse(`${from}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10),
    amount: 0,
  }));
}

test('keeps single-day and seven-day ranges daily, including zero days', () => {
  for (const count of [1, 7]) {
    const result = groupDashboardCollections(days('2026-10-01', count));
    assert.equal(result.granularity, 'daily');
    assert.equal(result.buckets.length, count);
  }
});

test('weekly totals retain partial weeks and refunds across a month boundary', () => {
  const input = days('2026-09-28', 10);
  input[0].amount = 0.1;
  input[3].amount = 0.2;
  input[9].amount = -15;
  assert.deepEqual(groupDashboardCollections(input), {
    granularity: 'weekly',
    buckets: [
      { from: '2026-09-28', to: '2026-10-04', amount: 0.3 },
      { from: '2026-10-05', to: '2026-10-07', amount: -15 },
    ],
  });
});

test('June–October collections stay visible in five monthly buckets with the same total', () => {
  const input = days('2026-06-01', 128);
  input[90].amount = 45500;
  input[127].amount = 35900;
  const result = groupDashboardCollections(input);
  assert.equal(result.granularity, 'monthly');
  assert.equal(result.buckets.length, 5);
  assert.equal(result.buckets.reduce((sum, point) => sum + point.amount, 0), 81400);
  assert.deepEqual(result.buckets[4], { from: '2026-10-01', to: '2026-10-06', amount: 35900 });
});

test('keeps months in different years distinct and clips first and last months', () => {
  const result = groupDashboardCollections(days('2025-10-06', 366));
  assert.equal(result.buckets.length, 13);
  assert.equal(result.buckets[0].from, '2025-10-06');
  assert.equal(result.buckets[0].to, '2025-10-31');
  assert.equal(result.buckets[12].from, '2026-10-01');
  assert.equal(result.buckets[12].to, '2026-10-06');
});
