import type { AuditLog } from '../api/types';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : null;

export function billingAuditDetail(log: AuditLog) {
  const meta = object(log.metadata);
  if (meta.kind !== 'billing_change') return null;
  const actor = object(meta.actor);
  const state = (value: unknown) => {
    const data = object(value);
    return { total: text(data.total), balance: text(data.balance_due) };
  };
  return {
    operation: text(meta.operation),
    guest: text(meta.guest_name),
    reservation: text(meta.reservation_reference),
    invoice: text(meta.billing_id),
    description: text(meta.description),
    amount: text(meta.amount),
    currency: text(meta.currency),
    reason: text(meta.reason),
    actor: text(actor.name),
    role: text(actor.role),
    before: state(meta.before),
    after: state(meta.after),
  };
}

export function auditMoney(value: string | null, currency: string | null) {
  if (value === null || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  if (currency) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount); } catch { /* Unknown legacy currency. */ }
  }
  return `${currency ? `${currency} ` : ''}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
