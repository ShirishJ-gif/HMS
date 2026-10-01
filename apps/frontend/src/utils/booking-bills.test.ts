import assert from 'node:assert/strict';
import test from 'node:test';
import type { Billing, ReservationGroupFolio } from '../api/types';
import { bookingBillHtml, groupBookingBills } from './booking-bills';
import { invoiceChargeLines, invoiceHtml } from './invoice-print';

function invoice(id: string, groupId = 'booking-1', paid = 0, refunded = 0): Billing {
  return {
    id, reservation_room_id: `room-${id}`, amount: 30000, tax: 0,
    total: 30000, extra_charges_total: 0, paid_total: paid, refunded_total: refunded,
    balance_due: 30000 - paid + refunded, payment_status: paid === 30000 && !refunded ? 'PAID' : 'PENDING',
    extra_charges: [], payments: [],
    reservation_room: {
      id: `room-${id}`, reservation_group_id: groupId, external_reservation_id: groupId,
      external_room_reservation_id: id, reservation_status: 'CHECKED_IN',
      property: { id: 'property-1', name: 'Test villa', code: 'TEST' },
      check_in_date: '2026-09-28', check_out_date: '2026-09-30',
      guest: { id: 'guest-1', name: 'Same Guest', phone: null, email: null },
      room_category: { id: 'category-1', name: 'Villa room', code: 'HMS_WHOLE_VILLA' },
      rate_plan: { id: 'rate-1', name: 'Villa room rate', code: 'HMS_VILLA_ROOM', base_rate: 15000 },
      room: { id: null, room_number: null },
    },
  };
}

test('four room charges form one booking bill with combined payments and balance', () => {
  const bills = groupBookingBills([invoice('1', 'booking-1', 20000), invoice('2'), invoice('3'), invoice('4')], []);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].roomCount, 4);
  assert.equal(bills[0].total, 120000);
  assert.equal(bills[0].paid, 20000);
  assert.equal(bills[0].balance, 100000);
  assert.equal(bills[0].status, 'PARTIAL');
});

test('different bookings for the same guest stay separate', () => {
  const bills = groupBookingBills([invoice('1'), invoice('2', 'booking-2')], []);
  assert.deepEqual(bills.map(bill => bill.id), ['booking-1', 'booking-2']);
});

test('combined status uses all room balances and accounts for refunds', () => {
  assert.equal(groupBookingBills([invoice('1', 'booking-1', 30000), invoice('2')], [])[0].status, 'PARTIAL');
  assert.equal(groupBookingBills([invoice('1', 'booking-1', 30000), invoice('2', 'booking-1', 30000)], [])[0].status, 'PAID');
  const refunded = groupBookingBills([invoice('1', 'booking-1', 30000, 5000)], [])[0];
  assert.equal(refunded.paid, 25000);
  assert.equal(refunded.balance, 5000);
});

test('one printable bill uses the invoice layout with every room charge and payment', () => {
  const invoices = [invoice('1', 'booking-1', 10000), invoice('2'), invoice('3'), invoice('4', 'booking-1', 10000)];
  for (const index of [0, 3]) invoices[index].payments.push({
    id: `payment-${index}`, provider: 'UPI', provider_reference: `RECEIPT-${index}`,
    amount: 10000, status: 'SUCCEEDED', created_at: '2026-09-28T12:00:00Z',
  });
  const folio = {
    reservation_group_id: 'booking-1', external_reservation_id: 'BILL-1', reservation_status: 'CHECKED_IN',
    property: invoices[0].reservation_room.property,
    guest: { id: 'guest-1', name: '<script>test</script>', phone: '', email: '' },
    room_count: 4, invoiced_room_count: 4, total_amount: 120000, billed_total: 120000,
    paid_total: 20000, refunded_total: 0, balance_due: 100000, invoices,
    rooms: invoices.map(inv => ({
      id: inv.reservation_room_id, external_room_reservation_id: inv.id,
      arrival_date: '2026-09-28', departure_date: '2026-09-30', total_amount: inv.amount,
      reservation_status: 'CHECKED_IN', room_category: inv.reservation_room.room_category,
      rate_plan: inv.reservation_room.rate_plan, room: inv.reservation_room.room, billing_id: inv.id,
    })),
  } as ReservationGroupFolio;
  const html = bookingBillHtml(folio);
  assert.ok(html.includes('Booking bill BILL-1'));
  assert.ok(html.includes('₹1,20,000.00'));
  assert.ok(html.includes('Room stay (2 nights) · ₹30,000.00 × 4 rooms'));
  assert.ok(!html.includes('Hotel tax'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;test&lt;/script&gt;'));
  const individualHtml = invoiceHtml(invoices[0]);
  assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)?.[1], individualHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1]);
  for (const section of ['Bill to', 'Stay details', 'Reservation details', 'Invoice summary', 'Payment history']) {
    assert.ok(html.includes(section));
    assert.ok(individualHtml.includes(section));
  }
  assert.equal((html.match(/class="box"/g) ?? []).length, 4);
  assert.ok(html.includes('₹20,000.00'));
  assert.ok(html.includes('₹1,00,000.00'));
  assert.ok(html.includes('RECEIPT-0'));
  assert.ok(html.includes('RECEIPT-3'));
});

test('matching one-night room charges print once with quantity and no zero tax rows', () => {
  const invoices = ['1', '2', '3', '4'].map(id => {
    const bill = invoice(id);
    bill.amount = 15000;
    bill.reservation_room.check_out_date = '2026-09-29';
    bill.reservation_room.room.room_number = `HMS_VILLA_ROOM_00${id}`;
    return bill;
  });
  assert.deepEqual(invoiceChargeLines(invoices, true), [
    { desc: 'Room stay (1 night) · ₹15,000.00 × 4 rooms', amount: 60000 },
  ]);
});

test('different room prices stay separate and actual tax and extras remain included', () => {
  const invoices = [invoice('1'), invoice('2'), invoice('3')];
  invoices[2].amount = 40000;
  invoices[0].tax = 1500;
  invoices[1].tax = 1500;
  invoices[0].extra_charges.push({ id: 'extra-1', description: 'Breakfast', amount: 500, created_at: '2026-09-28' });
  assert.deepEqual(invoiceChargeLines(invoices, true), [
    { desc: 'Room stay (2 nights) · ₹30,000.00 × 2 rooms', amount: 60000 },
    { desc: 'Room stay (2 nights) · ₹40,000.00 × 1 room', amount: 40000 },
    { desc: 'Breakfast', amount: 500 },
    { desc: 'Hotel tax', amount: 3000 },
  ]);
  invoices[1].reservation_room.check_out_date = '2026-10-01';
  assert.equal(invoiceChargeLines(invoices, true).length, 5);
});

test('whole-villa allocations print as one villa charge without multiplying by room count', () => {
  const invoices = [invoice('1'), invoice('2'), invoice('3'), invoice('4')];
  for (const bill of invoices) bill.reservation_room.rate_plan.code = 'HMS_WHOLE_VILLA';
  assert.deepEqual(invoiceChargeLines(invoices, true), [{ desc: 'Entire villa (2 nights)', amount: 120000 }]);
});

test('food and laundry stay itemized without changing the room rate or counting extras twice', () => {
  const invoices = [invoice('1'), invoice('2'), invoice('3'), invoice('4')];
  invoices[0].extra_charges = [
    { id: 'food', description: 'Food', amount: 500, created_at: '2026-09-28' },
    { id: 'laundry', description: 'Laundry', amount: 200, created_at: '2026-09-28' },
  ];
  invoices[0].extra_charges_total = 700;
  invoices[0].total += 700;
  invoices[0].balance_due += 700;
  const stayLines = invoiceChargeLines(invoices, true, { includeExtras: false });
  assert.deepEqual(stayLines, [{ desc: 'Room stay (2 nights) · ₹30,000.00 × 4 rooms', amount: 120000 }]);
  const lines = invoiceChargeLines(invoices, true);
  assert.deepEqual(lines.slice(1), [{ desc: 'Food', amount: 500 }, { desc: 'Laundry', amount: 200 }]);
  assert.equal(lines.reduce((sum, line) => sum + line.amount, 0), groupBookingBills(invoices, [])[0].total);
  const html = invoiceHtml(invoices[0]);
  assert.ok(html.includes('<td>Food</td><td class="amount">₹500.00</td>'));
  assert.ok(html.includes('<td>Laundry</td><td class="amount">₹200.00</td>'));
});

test('OTA invoices retain separately added charges in printed bills', () => {
  const bill = invoice('1');
  bill.ota_payment_breakdown = { room_fee: 30000, occupancy_taxes: 0, guest_service_fee: null, host_service_fee: null } as NonNullable<Billing['ota_payment_breakdown']>;
  bill.extra_charges = [{ id: 'food', description: 'Food', amount: 500, created_at: '2026-09-28' }];
  assert.ok(invoiceChargeLines([bill], true).some(line => line.desc === 'Food' && line.amount === 500));
  assert.ok(invoiceChargeLines([bill], false).some(line => line.desc === 'Food' && line.amount === 500));
});
