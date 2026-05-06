import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const migratedGroups = await prisma.reservationGroup.findMany({
    where: {
      source: 'LEGACY_BOOKING_MIGRATION',
    },
    include: {
      rooms: {
        include: {
          billings: {
            include: {
              payments: true,
            },
          },
        },
      },
      primaryGuest: true,
      channelConnection: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const failures: string[] = [];

  for (const group of migratedGroups) {
    if (!group.channelConnection || group.channelConnection.name !== 'Legacy Booking Migration') {
      failures.push(`${group.id}: migrated reservation group is linked to an unexpected channel connection`);
    }

    if (group.rooms.length !== 1) {
      failures.push(`${group.id}: expected exactly 1 migrated reservation room, found ${group.rooms.length}`);
      continue;
    }

    const room = group.rooms[0];

    if (!group.primaryGuestId || !group.primaryGuest) {
      failures.push(`${group.id}: migrated reservation group is missing its primary guest`);
    }

    if (room.reservationGroupId !== group.id) {
      failures.push(`${group.id}: migrated reservation room points to a different reservation group`);
    }

    if (room.propertyId !== group.propertyId) {
      failures.push(`${group.id}: migrated reservation room property mismatch`);
    }

    if (room.billings.length > 1) {
      failures.push(`${group.id}: expected at most 1 billing on migrated reservation room, found ${room.billings.length}`);
    }

    for (const billing of room.billings) {
      if (billing.reservationRoomId !== room.id) {
        failures.push(`${group.id}: billing ${billing.id} is not linked to the migrated reservation room`);
      }

      const paidTotal = billing.payments
        .filter((payment) => payment.status === 'SUCCEEDED')
        .reduce((sum, payment) => sum + payment.amount.toNumber(), 0);
      const refundedTotal = billing.payments
        .filter((payment) => payment.status === 'REFUNDED')
        .reduce((sum, payment) => sum + payment.amount.toNumber(), 0);

      if (paidTotal < 0 || refundedTotal < 0) {
        failures.push(`${group.id}: billing ${billing.id} has invalid payment aggregates`);
      }
    }
  }

  const orphanMigratedBillings = await prisma.billing.count({
    where: {
      reservationRoom: {
        is: null,
      },
    },
  });

  if (orphanMigratedBillings > 0) {
    failures.push(`found ${orphanMigratedBillings} billing rows without a reservation room link`);
  }

  const migratedSummary = {
    migrated_group_count: migratedGroups.length,
    migrated_room_count: migratedGroups.reduce((sum, group) => sum + group.rooms.length, 0),
    migrated_billing_count: migratedGroups.reduce(
      (sum, group) => sum + group.rooms.reduce((roomSum, room) => roomSum + room.billings.length, 0),
      0,
    ),
  };

  console.log(JSON.stringify(migratedSummary, null, 2));

  if (failures.length > 0) {
    console.error('\nLegacy booking migration validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nLegacy booking migration validation passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
