import { AuditAction, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { recalculateBilling } from './billing-calculations';

type Calculation = ReturnType<typeof recalculateBilling>;
type Subject = Parameters<typeof recalculateBilling>[0] & {
  id: string;
  reservationRoom?: {
    propertyId: string;
    reservationGroupId: string;
    guestName?: string | null;
    currency?: string | null;
    reservationGroup: {
      externalReservationId: string;
      currency?: string | null;
      primaryGuest?: { name: string } | null;
    };
  } | null;
};

function snapshot(state: Calculation) {
  return {
    total: state.total.toFixed(2),
    balance_due: state.balance.toFixed(2),
    paid_total: state.paid.toFixed(2),
    refunded_total: state.refunded.toFixed(2),
    payment_status: state.paymentStatus,
  };
}

// Save alongside the financial mutation: neither can commit without the other.
// Snapshot the actor and charge so later deletion/renaming cannot erase the history.
export async function recordBillingAudit(tx: Prisma.TransactionClient, input: {
  billing: Subject;
  after: Calculation;
  action: AuditAction;
  operation: 'charge_added' | 'charge_removed' | 'payment_collected' | 'payment_refunded';
  summary: string;
  detail: Prisma.InputJsonObject;
  user?: AuthenticatedUser;
}) {
  const { billing, user } = input;
  const room = billing.reservationRoom;
  const actor = user ? await tx.user.findUnique({ where: { id: user.sub }, select: { name: true } }) : null;
  const guestName = room?.guestName ?? room?.reservationGroup.primaryGuest?.name ?? 'Imported guest';
  await tx.auditLog.create({ data: {
    propertyId: room?.propertyId ?? null,
    userId: user?.sub ?? null,
    action: input.action,
    entityType: 'billing',
    entityId: billing.id,
    summary: `${input.summary} for ${guestName}`.slice(0, 240),
    metadata: {
      kind: 'billing_change',
      operation: input.operation,
      billing_id: billing.id,
      reservation_group_id: room?.reservationGroupId ?? null,
      reservation_reference: room?.reservationGroup.externalReservationId ?? null,
      guest_name: guestName,
      currency: room?.currency ?? room?.reservationGroup.currency ?? null,
      actor: user ? { id: user.sub, name: actor?.name ?? user.email, role: user.role } : null,
      before: snapshot(recalculateBilling(billing)),
      after: snapshot(input.after),
      ...input.detail,
    },
  } });
}
