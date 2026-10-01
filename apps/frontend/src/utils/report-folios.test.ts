import assert from 'node:assert/strict';
import test from 'node:test';
import { groupReportFolios } from './report-folios';

const folio = (billing_id: string, group_id = 'booking-1', overrides = {}) => ({
  billing_id, group_id, reference: group_id, property_id: 'villa-1', property_name: 'Test villa', guest_name: 'Same guest',
  from: '2026-09-25', to: '2026-09-27', total: 30000, paid: 5000, balance: 25000, ...overrides,
});

test('combines four room invoices into one reservation with the full balance', () => {
  const input = ['1', '2', '3', '4'].map(id => folio(id));
  const rows = groupReportFolios(input);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].invoice_count, 4);
  assert.equal(rows[0].total, 120000);
  assert.equal(rows[0].paid, 20000);
  assert.equal(rows[0].balance, 100000);
  assert.equal(input[0].total, 30000);
});

test('does not merge separate reservations for the same guest', () => {
  assert.equal(groupReportFolios([folio('1'), folio('2', 'booking-2')]).length, 2);
});

test('includes paid invoices and sums currency amounts in minor units', () => {
  const [row] = groupReportFolios([folio('1', 'booking-1', { total: 0.1, paid: 0.1, balance: 0 }), folio('2', 'booking-1', { total: 0.2, paid: 0, balance: 0.2 })]);
  assert.equal(row.total, 0.3);
  assert.equal(row.paid, 0.1);
  assert.equal(row.balance, 0.2);
});

test('sorts recent stays first and retains the full stay date range', () => {
  const rows = groupReportFolios([folio('1'), folio('2', 'booking-2', { from: '2026-09-29', to: '2026-09-30' }), folio('3', 'booking-1', { from: '2026-09-26', to: '2026-09-28' })]);
  assert.equal(rows[0].group_id, 'booking-2');
  assert.equal(rows[1].from, '2026-09-25');
  assert.equal(rows[1].to, '2026-09-28');
});
