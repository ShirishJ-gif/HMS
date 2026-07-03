import '../src/common/env/load-env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await readCounts();

  const result = await prisma.$transaction(async (tx) => {
    const deletedPaymentTransactions = await tx.paymentTransaction.deleteMany();
    const deletedBillingExtraCharges = await tx.billingExtraCharge.deleteMany();
    const deletedBillings = await tx.billing.deleteMany();
    const deletedHousekeepingTasks = await tx.housekeepingTask.deleteMany();
    const deletedReservationGroups = await tx.reservationGroup.deleteMany();
    const deletedGuests = await tx.guest.deleteMany();
    const deletedProviderReservationIntakeRecords =
      await tx.providerReservationIntakeRecord.deleteMany();
    const deletedInventorySyncRows = await tx.inventorySyncRow.deleteMany();
    const deletedChannelSyncLogs = await tx.channelSyncLog.deleteMany();
    const deletedBackgroundJobs = await tx.backgroundJob.deleteMany();
    const deletedWebhookEvents = await tx.webhookEvent.deleteMany();
    const deletedAuditLogs = await tx.auditLog.deleteMany();
    const deletedIdempotencyKeys = await tx.idempotencyKey.deleteMany();
    const deletedInventoryBlocks = await tx.inventoryBlock.deleteMany();
    const deletedInventoryCalendar = await tx.inventoryCalendar.deleteMany();
    const deletedRoomOutOfServicePeriods = await tx.roomOutOfServicePeriod.deleteMany();

    const resetOccupiedRooms = await tx.room.updateMany({
      where: {
        status: {
          in: ['OCCUPIED', 'MAINTENANCE'],
        },
      },
      data: { status: 'AVAILABLE' },
    });

    return {
      deletedPaymentTransactions: deletedPaymentTransactions.count,
      deletedBillingExtraCharges: deletedBillingExtraCharges.count,
      deletedBillings: deletedBillings.count,
      deletedHousekeepingTasks: deletedHousekeepingTasks.count,
      deletedReservationGroups: deletedReservationGroups.count,
      deletedGuests: deletedGuests.count,
      deletedProviderReservationIntakeRecords: deletedProviderReservationIntakeRecords.count,
      deletedInventorySyncRows: deletedInventorySyncRows.count,
      deletedChannelSyncLogs: deletedChannelSyncLogs.count,
      deletedBackgroundJobs: deletedBackgroundJobs.count,
      deletedWebhookEvents: deletedWebhookEvents.count,
      deletedAuditLogs: deletedAuditLogs.count,
      deletedIdempotencyKeys: deletedIdempotencyKeys.count,
      deletedInventoryBlocks: deletedInventoryBlocks.count,
      deletedInventoryCalendar: deletedInventoryCalendar.count,
      deletedRoomOutOfServicePeriods: deletedRoomOutOfServicePeriods.count,
      resetUnavailableRooms: resetOccupiedRooms.count,
    };
  });

  const after = await readCounts();

  console.log(
    JSON.stringify(
      {
        before,
        cleanup: result,
        after,
      },
      null,
      2,
    ),
  );
}

async function readCounts() {
  const [
    properties,
    roomCategories,
    rooms,
    ratePlans,
    users,
    channelConnections,
    guests,
    reservationGroups,
    reservationRooms,
    billings,
    paymentTransactions,
    housekeepingTasks,
    channelSyncLogs,
    inventorySyncRows,
    providerReservationIntakeRecords,
    webhookEvents,
    backgroundJobs,
    auditLogs,
    inventoryCalendar,
    inventoryBlocks,
    roomOutOfServicePeriods,
    occupiedRooms,
    maintenanceRooms,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.roomCategory.count(),
    prisma.room.count(),
    prisma.ratePlan.count(),
    prisma.user.count(),
    prisma.channelConnection.count(),
    prisma.guest.count(),
    prisma.reservationGroup.count(),
    prisma.reservationRoom.count(),
    prisma.billing.count(),
    prisma.paymentTransaction.count(),
    prisma.housekeepingTask.count(),
    prisma.channelSyncLog.count(),
    prisma.inventorySyncRow.count(),
    prisma.providerReservationIntakeRecord.count(),
    prisma.webhookEvent.count(),
    prisma.backgroundJob.count(),
    prisma.auditLog.count(),
    prisma.inventoryCalendar.count(),
    prisma.inventoryBlock.count(),
    prisma.roomOutOfServicePeriod.count(),
    prisma.room.count({ where: { status: 'OCCUPIED' } }),
    prisma.room.count({ where: { status: 'MAINTENANCE' } }),
  ]);

  return {
    kept: {
      properties,
      roomCategories,
      rooms,
      ratePlans,
      users,
      channelConnections,
    },
    removedTargets: {
      guests,
      reservationGroups,
      reservationRooms,
      billings,
      paymentTransactions,
      housekeepingTasks,
      channelSyncLogs,
      inventorySyncRows,
      providerReservationIntakeRecords,
      webhookEvents,
      backgroundJobs,
      auditLogs,
      inventoryCalendar,
      inventoryBlocks,
      roomOutOfServicePeriods,
      occupiedRooms,
      maintenanceRooms,
    },
  };
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
