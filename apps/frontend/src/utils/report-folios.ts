import type { ReportsData } from '../features/reports/types';

type ReportFolio = ReportsData['folios'][number];
export type ReservationReportFolio = Omit<ReportFolio, 'billing_id'> & { invoice_count: number };

export function groupReportFolios(folios: ReportFolio[]): ReservationReportFolio[] {
  const groups = new Map<string, ReservationReportFolio>();
  for (const folio of folios) {
    const key = `${folio.property_id}:${folio.group_id}`;
    const existing = groups.get(key);
    if (!existing) {
      const { billing_id: _billingId, ...values } = folio;
      groups.set(key, { ...values, invoice_count: 1 });
      continue;
    }
    for (const amount of ['total', 'paid', 'balance'] as const) {
      existing[amount] = (Math.round(existing[amount] * 100) + Math.round(folio[amount] * 100)) / 100;
    }
    existing.invoice_count += 1;
    if (folio.from < existing.from) existing.from = folio.from;
    if (folio.to > existing.to) existing.to = folio.to;
  }
  return [...groups.values()].sort((a, b) => b.from.localeCompare(a.from) || a.reference.localeCompare(b.reference));
}
