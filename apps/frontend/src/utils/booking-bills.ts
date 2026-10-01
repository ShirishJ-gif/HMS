import type { Billing, ReservationGroup, ReservationGroupFolio } from '../api/types';
import { invoiceHtml } from './invoice-print';

export function groupBookingBills(billings: Billing[], reservations: ReservationGroup[]) {
  const groups = new Map<string, Billing[]>();
  for (const billing of billings) {
    const id = billing.reservation_room.reservation_group_id;
    groups.set(id, [...(groups.get(id) ?? []), billing]);
  }
  return Array.from(groups, ([id, invoices]) => {
    const reservation = reservations.find(group => group.id === id);
    const first = invoices[0].reservation_room;
    const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const paid = invoices.reduce((sum, invoice) => sum + invoice.paid_total - invoice.refunded_total, 0);
    const balance = invoices.reduce((sum, invoice) => sum + invoice.balance_due, 0);
    const status = invoices.every(invoice => invoice.payment_status === 'REFUNDED') ? 'REFUNDED'
      : balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    return {
      id, invoices, total, paid, balance, status,
      reference: reservation?.external_reservation_id ?? first.external_reservation_id,
      guest: reservation?.primary_guest?.name ?? first.guest.name,
      property: first.property.name,
      roomCount: reservation?.rooms.length ?? invoices.length,
      arrival: reservation?.arrival_date ?? invoices.map(invoice => invoice.reservation_room.check_in_date).sort()[0],
      departure: reservation?.departure_date ?? invoices.map(invoice => invoice.reservation_room.check_out_date).sort().slice(-1)[0],
    };
  });
}

export function bookingBillHtml(folio: ReservationGroupFolio) {
  const firstInvoice = folio.invoices[0];
  if (!firstInvoice) throw new Error('There are no billed charges to print for this booking.');
  return invoiceHtml(firstInvoice, folio);
}
