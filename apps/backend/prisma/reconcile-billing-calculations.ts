// Preview: node --import tsx apps/backend/prisma/reconcile-billing-calculations.ts --plan=/tmp/billing-plan.json
// Apply the reviewed snapshot: same command with --apply (aborts if any affected bill has changed).
import '../src/common/env/load-env';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { lockBilling, recalculateBilling } from '../src/modules/billing/billing-calculations';

const prisma = new PrismaClient();
const include = { payments: { orderBy: { id: 'asc' as const } }, extraCharges: { orderBy: { id: 'asc' as const } }, reservationRoom: true };
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Change = { id: string; fingerprint: string; before: { total: string; paymentStatus: string }; after: { total: string; paymentStatus: string }; snapshot: unknown };
type Plan = { target: string; createdAt: string; changes: Change[] };

async function main() {
  const planPath = process.argv.find(arg => arg.startsWith('--plan='))?.slice('--plan='.length);
  if (!planPath) throw new Error('Provide --plan=/absolute/path.json; preview is the default.');
  const url = new URL(process.env.DATABASE_URL!);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}?schema=${url.searchParams.get('schema') || 'public'}`;
  if (process.argv.includes('--apply')) {
    const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan;
    if (plan.target !== target) throw new Error('Plan belongs to another database.');
    await prisma.$transaction(async tx => {
      for (const change of [...plan.changes].sort((a, b) => a.id.localeCompare(b.id))) {
        await lockBilling(tx, change.id);
        const current = await tx.billing.findUniqueOrThrow({ where: { id: change.id }, include });
        if (fingerprint(current) !== change.fingerprint) throw new Error(`Bill ${change.id} changed; regenerate and review the plan.`);
        const { total, paymentStatus } = recalculateBilling(current);
        if (total.toFixed(2) !== change.after.total || paymentStatus !== change.after.paymentStatus) {
          throw new Error(`Calculation changed for ${change.id}; regenerate the plan.`);
        }
        await tx.billing.update({ where: { id: change.id }, data: { total, paymentStatus } });
        await tx.auditLog.create({ data: {
          action: 'UPDATE', entityType: 'billing', entityId: change.id, propertyId: current.reservationRoom?.propertyId,
          summary: 'Reconciled invoice total and payment status from existing charges and payments',
          metadata: { source: 'billing_calculation_reconciliation', before: change.before, after: change.after },
        } });
      }
    }, { timeout: 30000 });
    console.log(JSON.stringify({ target, applied: plan.changes.length, changes: plan.changes.map(({ snapshot, fingerprint, ...change }) => change) }, null, 2));
  } else {
    const plan = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const bills = await tx.billing.findMany({ include, orderBy: { id: 'asc' } });
      const changes: Change[] = [];
      for (const bill of bills) {
        const { total, paymentStatus } = recalculateBilling(bill);
        if (!bill.total.equals(total) || bill.paymentStatus !== paymentStatus) changes.push({
          id: bill.id, fingerprint: fingerprint(bill), snapshot: bill,
          before: { total: bill.total.toFixed(2), paymentStatus: bill.paymentStatus },
          after: { total: total.toFixed(2), paymentStatus },
        });
      }
      return { target, createdAt: new Date().toISOString(), scanned: bills.length, changes };
    }, { isolationLevel: 'RepeatableRead' });
    writeFileSync(planPath, JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ ...plan, changes: plan.changes.map(({ snapshot, fingerprint, ...change }) => change) }, null, 2));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
