import type { ReportsData } from './types';

// Quote every field and neutralize spreadsheet formulas in user-controlled names/references.
function csvCell(value: string | number) {
  const text = typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? `'${value}` : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
export function exportReport(data: ReportsData) {
  const scope =
    data.property_id === 'ALL'
      ? 'All accessible properties'
      : (data.properties.find((p) => p.id === data.property_id)?.name ?? data.property_id);
  const rows: Array<Array<string | number>> = [
    ['Reports & Analytics'],
    ['Property', scope],
    ['From', data.from],
    ['To (inclusive)', data.to],
    ['Generated at', data.generated_at],
    [],
    ['Metric', 'Selected period', 'Previous period'],
    ...Object.entries(data.summary).map(([key, value]) => [
      key.replace(/_/g, ' '),
      value ?? 'N/A',
      data.comparison.summary[key as keyof typeof data.summary] ?? 'N/A',
    ]),
    [],
    ['Previous period', data.comparison.from, data.comparison.to],
    [
      'Basis',
      'Stay nights exclude checkout day, cancelled stays and blocked imports. Billed totals are allocated evenly over stay nights, including tax and extras. Average nightly rate uses room charges only.',
    ],
    [
      'Collections basis',
      'Payment creation date (UTC); refund transactions reduce net collections on their own creation dates.',
    ],
    ['Balance basis', 'Current full-folio balances for stays overlapping the selected dates.'],
    [
      'Occupancy basis',
      'Booked room nights / current room inventory nights, excluding rooms currently in maintenance and dated out-of-service periods. Villa rooms are counted individually.',
    ],
    [],
    ['Trend from', 'Trend to', 'Allocated billed', 'Net collected', 'Room nights', 'Previous from', 'Previous to', 'Previous billed', 'Previous collected'],
    ...data.trend.map((p) => [p.from, p.to, p.billed, p.collected, p.room_nights, p.previous_from, p.previous_to, p.previous_billed, p.previous_collected]),
    [],
    ['Reservation status', 'Groups'],
    ...data.reservation_posture.map((s) => [s.label, s.value]),
    [],
    ['Property', 'Groups', 'Room nights', 'Occupancy %', 'Average nightly rate', 'Allocated billed', 'Current balance'],
    ...data.property_performance.map((p) => [
      p.name,
      p.groups,
      p.nights,
      p.occupancy_rate ?? 'N/A',
      p.average_daily_rate ?? 'N/A',
      p.billed,
      p.balance,
    ]),
    [],
    ['Payment method', 'Collected', 'Refunded', 'Net collected'],
    ...data.payments_by_method.map((p) => [p.provider, p.collected, p.refunded, p.amount]),
    [],
    ['Expense category', 'Currency', 'Entries', 'Expense amount', 'Recorded paid', 'Unknown payment entries'],
    ...(data.expenses_by_category ?? []).map(row => [row.category, row.currency, row.count, row.amount, row.recorded_paid, row.unknown_payment_count]),
    [],
    ['Room category', 'Property', 'Room nights', 'Allocated billed'],
    ...data.room_category_performance.map((c) => [c.name, c.property_name, c.room_nights, c.billed_total]),
    [],
    ['Reservation', 'Property', 'Guest', 'Status', 'Arrival', 'Departure', 'Nights in period'],
    ...data.reservations.map((r) => [
      r.reference,
      r.property_name,
      r.guest_name,
      r.status,
      r.from,
      r.to,
      r.room_nights,
    ]),
    [],
    ['Invoice ID', 'Reservation', 'Property', 'Guest', 'Full invoice total', 'Net paid', 'Current balance'],
    ...data.folios.map((f) => [f.billing_id, f.reference, f.property_name, f.guest_name, f.total, f.paid, f.balance]),
    [],
    ['Transaction ID', 'Date (UTC)', 'Reservation', 'Property', 'Method', 'Status', 'Amount'],
    ...data.transactions.map((t) => [t.id, t.date, t.reference, t.property_name, t.provider, t.status, t.amount]),
  ];
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hms-report-${data.from}-to-${data.to}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
