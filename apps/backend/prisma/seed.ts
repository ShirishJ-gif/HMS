import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  await prisma.propertyImage.deleteMany();
  await prisma.roomCategoryImage.deleteMany();
  await prisma.inventorySyncRow.deleteMany();
  await prisma.channelSyncLog.deleteMany();
  await prisma.channelRateMapping.deleteMany();
  await prisma.channelRoomMapping.deleteMany();
  await prisma.channelConnection.deleteMany();
  await prisma.billingExtraCharge.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.billing.deleteMany();
  await prisma.housekeepingTask.deleteMany();
  await prisma.roomOutOfServicePeriod.deleteMany();
  await prisma.reservationRoom.deleteMany();
  await prisma.reservationGroup.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.inventoryBlock.deleteMany();
  await prisma.inventoryCalendar.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.room.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.roomCategory.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.property.deleteMany();

  await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@hms.local',
      passwordHash: await hashPassword('Admin@12345'),
      role: UserRole.SUPER_ADMIN,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
