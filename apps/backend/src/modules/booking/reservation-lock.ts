import { Prisma } from '@prisma/client';

// Lock the parent before reading mutable stay state. All direct edits, lifecycle
// transitions and invoice creation use this order: group -> inventory -> billing.
export async function lockReservationGroup(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw`SELECT id FROM reservation_groups WHERE id = ${groupId}::uuid FOR UPDATE`;
}

export async function lockReservationRoomGroup(tx: Prisma.TransactionClient, roomId: string) {
  await tx.$queryRaw`SELECT g.id FROM reservation_groups g
    JOIN reservation_rooms r ON r.reservation_group_id = g.id
    WHERE r.id = ${roomId}::uuid FOR UPDATE OF g`;
}
