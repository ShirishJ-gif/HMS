import type { Billing, PaymentProvider, ReservationGroupFolio } from '../api/types';
import { formatCurrency } from './format';

export function paymentReferenceLabel(payment: { provider: PaymentProvider; provider_reference: string | null }) {
  return payment.provider === 'CASH' ? '—' : payment.provider_reference ?? '—';
}

function paymentMetadata(payment: { metadata?: unknown }) {
  return payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
    ? payment.metadata as Record<string, unknown>
    : null;
}

function numericMetadataValue(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function airbnbPayoutPaymentDetails(payment: { metadata?: unknown; amount: number }) {
  const metadata = paymentMetadata(payment);
  if (metadata?.source !== 'airbnb_payout_email') return null;
  const netReceived = numericMetadataValue(metadata, 'net_received') ?? numericMetadataValue(metadata, 'payout_amount') ?? payment.amount;
  const taxWithholding = numericMetadataValue(metadata, 'tax_withholding');
  const youEarn = numericMetadataValue(metadata, 'airbnb_payout_before_tax') ?? (
    netReceived != null && taxWithholding != null ? netReceived + taxWithholding : null
  );
  return {
    youEarn,
    taxWithholding,
    netReceived,
  };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatGuestName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map(part => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : '')
    .join(' ');
}
export function nights(from: string, to: string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}
export function otaPaymentRows(billing: Billing) {
  const breakdown = billing.ota_payment_breakdown;
  if (!breakdown) return [];
  return [
    { label: 'Room fee', value: breakdown.room_fee },
    { label: 'Occupancy taxes', value: breakdown.occupancy_taxes },
    { label: 'Guest service fee', value: breakdown.guest_service_fee == null ? null : Math.abs(breakdown.guest_service_fee) },
    { label: 'Host service fee', value: breakdown.host_service_fee == null ? null : Math.abs(breakdown.host_service_fee) },
  ].filter((row): row is { label: string; value: number } => row.value != null);
}

export function invoiceChargeLines(invoices: Billing[], grouped: boolean, { includeExtras = true } = {}) {
  const lines: Array<{ desc: string; amount: number }> = [];
  const roomCharges = new Map<string, { name: string; nights: number; count: number; unit: number; cents: number; wholeVilla: boolean }>();
  const extras: Array<{ desc: string; amount: number }> = [];
  let taxCents = 0;
  for (const invoice of invoices) {
    const room = invoice.reservation_room;
    const roomNights = nights(room.check_in_date, room.check_out_date);
    if (includeExtras) extras.push(...invoice.extra_charges.map(charge => ({ desc: charge.description, amount: charge.amount })));
    const otaRows = otaPaymentRows(invoice);
    if (otaRows.length > 0) {
      lines.push(...otaRows.map(row => ({ desc: row.label, amount: row.value })));
      continue;
    }
    if (grouped) {
      const wholeVilla = room.rate_plan.code === 'HMS_WHOLE_VILLA';
      const cents = Math.round(invoice.amount * 100);
      // Group only matching stays and prices; whole-villa amounts are room allocations.
      const key = JSON.stringify([room.room_category.id, room.rate_plan.id, room.check_in_date, room.check_out_date, wholeVilla ? null : cents]);
      const existing = roomCharges.get(key);
      if (existing) {
        existing.count += 1;
        existing.cents += cents;
      } else {
        roomCharges.set(key, {
          name: wholeVilla ? 'Entire villa' : room.rate_plan.code === 'HMS_VILLA_ROOM' ? 'Room stay' : room.room_category.name,
          nights: roomNights, count: 1, unit: invoice.amount, cents, wholeVilla,
        });
      }
    } else {
      lines.push({ desc: `Room charge - ${room.room_category.name} (${roomNights} night${roomNights === 1 ? '' : 's'})`, amount: invoice.amount });
    }
    taxCents += Math.round(invoice.tax * 100);
  }
  for (const charge of roomCharges.values()) {
    const stay = `${charge.name} (${charge.nights} night${charge.nights === 1 ? '' : 's'})`;
    lines.push({
      desc: charge.wholeVilla ? stay : `${stay} · ${formatCurrency(charge.unit)} × ${charge.count} room${charge.count === 1 ? '' : 's'}`,
      amount: charge.cents / 100,
    });
  }
  lines.push(...extras);
  if (taxCents !== 0) lines.push({ desc: 'Hotel tax', amount: taxCents / 100 });
  return lines;
}

export function invoiceHtml(billing: Billing, folio?: ReservationGroupFolio) {
  const invoices = folio?.invoices ?? [billing];
  const r = billing.reservation_room;
  const property = folio?.property ?? r.property;
  const guest = folio?.guest ?? r.guest;
  const arrival = folio ? folio.rooms.map(room => room.arrival_date).sort()[0] : r.check_in_date;
  const departure = folio ? folio.rooms.map(room => room.departure_date).sort().slice(-1)[0] : r.check_out_date;
  const n = nights(arrival, departure);
  const paid = folio ? folio.paid_total - folio.refunded_total : billing.paid_total - billing.refunded_total;
  const total = folio?.billed_total ?? billing.total;
  const balanceDue = folio?.balance_due ?? billing.balance_due;
  const reservationReference = folio?.external_reservation_id ?? r.external_reservation_id;
  const reservationStatus = folio?.reservation_status ?? r.reservation_status;
  const wholeVilla = folio && folio.rooms.length > 0 && folio.rooms.every(room => room.rate_plan.code === 'HMS_WHOLE_VILLA');
  const stayTitle = folio ? (wholeVilla ? 'Entire villa' : `${folio.room_count} room${folio.room_count === 1 ? '' : 's'}`)
    : `${r.room_category.name}${r.room.room_number ? ` - Room ${r.room.room_number}` : ''}`;
  const ratePlan = folio ? Array.from(new Set(folio.rooms.map(room => room.rate_plan.name))).join(', ') : r.rate_plan.name;
  const reservationDetail = folio ? `${folio.room_count} room${folio.room_count === 1 ? '' : 's'} included` : `Room reservation ${r.external_room_reservation_id}`;
  const documentLabel = folio ? 'Booking bill' : 'Invoice';
  const lines = invoiceChargeLines(invoices, Boolean(folio));
  const guestName = formatGuestName(guest.name ?? 'Guest');
  const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const paymentStatus = folio ? (invoices.length > 0 && invoices.every(invoice => invoice.payment_status === 'REFUNDED') ? 'REFUNDED' : balanceDue > 0 ? paid > 0 ? 'PARTIAL' : 'UNPAID' : 'PAID') : billing.payment_status;
  const statusLabel = ({ PENDING: 'Unpaid', UNPAID: 'Unpaid', PARTIAL: 'Partial', PAID: 'Paid', REFUNDED: 'Refunded' } as Record<string, string>)[paymentStatus] ?? paymentStatus;
  const invoiceNo = folio ? folio.external_reservation_id : billing.id.slice(0, 8).toUpperCase();
  const checkIn = new Date(arrival).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const checkOut = new Date(departure).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const payments = invoices.flatMap(invoice => invoice.payments);
  const paymentRows = payments.map(payment => {
    const payoutDetails = airbnbPayoutPaymentDetails(payment);
    const provider = payoutDetails ? 'Airbnb payout' : payment.provider;
    const amount = payoutDetails
      ? [
          payoutDetails.youEarn != null ? `<div><span>You earn</span><strong>${formatCurrency(payoutDetails.youEarn)}</strong></div>` : '',
          payoutDetails.taxWithholding != null ? `<div><span>GST</span><strong>${formatCurrency(payoutDetails.taxWithholding)}</strong></div>` : '',
          `<div class="net"><span>Net received</span><strong>${formatCurrency(payoutDetails.netReceived)}</strong></div>`,
        ].filter(Boolean).join('')
      : formatCurrency(payment.amount);
    return `<tr>
      <td>${new Date(payment.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      <td>${escapeHtml(provider)}</td>
      <td class="mono">${escapeHtml(paymentReferenceLabel(payment))}</td>
      <td>${amount}</td>
      <td><span class="status">${escapeHtml(payment.status)}</span></td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${documentLabel} — ${escapeHtml(guestName)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; color: #172033; background: #fff; padding: 42px; max-width: 820px; margin: 0 auto; }
  .top { display:flex; justify-content:space-between; gap:32px; align-items:flex-start; padding-bottom:24px; border-bottom:2px solid #172033; }
  h1 { font-size: 30px; font-weight: 900; letter-spacing:0; color:#0f172a; }
  .muted { color:#64748b; font-size:12px; line-height:1.55; }
  .invoice-meta { text-align:right; }
  .invoice-meta strong { display:block; font-size:22px; color:#0f172a; margin-bottom:6px; }
  .badge { display:inline-block; margin-top:10px; padding:5px 10px; border-radius:999px; background:${balanceDue > 0 ? '#fff1f2' : '#ecfdf5'}; color:${balanceDue > 0 ? '#be123c' : '#047857'}; font-size:11px; font-weight:800; text-transform:uppercase; }
  .section { margin-top:26px; }
  .section-title { font-size:11px; font-weight:900; text-transform:uppercase; color:#94a3b8; margin-bottom:10px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .box { border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; min-height:96px; }
  .box p { font-size:10px; font-weight:800; text-transform:uppercase; color:#94a3b8; margin-bottom:5px; }
  .box strong { display:block; font-size:14px; color:#0f172a; margin-bottom:4px; }
  .box span { display:block; font-size:12px; color:#64748b; line-height:1.5; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:10px; font-weight:900; text-transform:uppercase; color:#94a3b8; padding:10px 0; border-bottom:1px solid #e2e8f0; }
  th:last-child, td:last-child { text-align:right; }
  td { padding:12px 0; font-size:12.5px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  .amount { font-weight:800; color:#0f172a; }
  .mono { font-family:'SFMono-Regular', Consolas, monospace; font-size:10.5px; color:#64748b; }
  .totals { width:320px; margin-left:auto; margin-top:16px; }
  .totals div { display:flex; justify-content:space-between; padding:8px 0; font-size:13px; color:#475569; }
  .totals strong { color:#0f172a; }
  .grand { border-top:2px solid #172033; margin-top:4px; padding-top:12px !important; font-size:16px !important; font-weight:900; color:#0f172a !important; }
  .paid { color:#047857 !important; font-weight:800; }
  .balance { color:${balanceDue > 0 ? '#be123c' : '#047857'} !important; font-weight:900; }
  .status { display:inline-block; padding:4px 8px; border-radius:999px; background:#ecfdf5; color:#047857; font-size:10px; font-weight:800; }
  .net { border-top:1px solid #e2e8f0; margin-top:4px; padding-top:4px; }
  td div { display:flex; justify-content:space-between; gap:12px; min-width:170px; }
  td div span { color:#64748b; }
  td div strong { color:#0f172a; }
  .footer { margin-top:34px; padding-top:16px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; gap:20px; font-size:11px; color:#94a3b8; }
  @media print { body { padding: 28px; } .no-break { break-inside: avoid; } }
</style></head><body>
<div class="top">
  <div>
    <h1>${escapeHtml(property.name)}</h1>
    <p class="muted">${escapeHtml(property.code)}<br/>Professional stay ${folio ? 'bill' : 'invoice'} generated from HMS</p>
  </div>
  <div class="invoice-meta">
    <strong>${documentLabel} ${escapeHtml(invoiceNo)}</strong>
    <p class="muted">Generated ${escapeHtml(generatedAt)}<br/>Reservation ${escapeHtml(reservationReference)}</p>
    <span class="badge">${escapeHtml(statusLabel)}</span>
  </div>
</div>

<div class="section grid no-break">
  <div class="box">
    <p>Bill to</p>
    <strong>${escapeHtml(guestName)}</strong>
    ${guest.phone ? `<span>${escapeHtml(guest.phone)}</span>` : ''}
    ${guest.email ? `<span>${escapeHtml(guest.email)}</span>` : ''}
  </div>
  <div class="box">
    <p>Stay details</p>
    <strong>${escapeHtml(stayTitle)}</strong>
    <span>${escapeHtml(checkIn)} to ${escapeHtml(checkOut)}</span>
    <span>${n} night${n !== 1 ? 's' : ''} - ${escapeHtml(ratePlan)}</span>
  </div>
  <div class="box">
    <p>Reservation details</p>
    <strong>${escapeHtml(reservationReference)}</strong>
    <span>${escapeHtml(reservationDetail)}</span>
    <span>Status: ${escapeHtml(reservationStatus)}</span>
  </div>
  <div class="box">
    <p>Invoice summary</p>
    <strong>${escapeHtml(statusLabel)}</strong>
    <span>Paid: ${formatCurrency(paid)}</span>
    <span>Balance: ${formatCurrency(balanceDue)}</span>
  </div>
</div>

<div class="section no-break">
<p class="section-title">Charges</p>
<table>
  <thead><tr><th>Description</th><th>Amount</th></tr></thead>
  <tbody>
    ${lines.map(l => `<tr><td>${escapeHtml(l.desc)}</td><td class="amount">${formatCurrency(l.amount)}</td></tr>`).join('')}
  </tbody>
</table>
</div>

<div class="totals no-break">
  <div><span>Total</span><strong>${formatCurrency(total)}</strong></div>
  <div><span>Paid</span><strong class="paid">${formatCurrency(paid)}</strong></div>
  <div class="grand"><span>Balance due</span><strong class="balance">${formatCurrency(balanceDue)}</strong></div>
</div>

${payments.length > 0 ? `
<div class="section no-break">
<p class="section-title">Payment history</p>
<table>
  <thead><tr><th>Date</th><th>Provider</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
  <tbody>${paymentRows}</tbody>
</table>
</div>` : ''}
<div class="footer">
  <span>${escapeHtml(property.name)}</span>
  <span>Thank you for your stay.</span>
</div>
</body></html>`;
  return html;
}
