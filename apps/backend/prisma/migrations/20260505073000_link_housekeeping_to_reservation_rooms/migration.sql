-- AlterTable
ALTER TABLE "housekeeping_tasks"
ADD COLUMN "reservation_room_id" UUID;

-- CreateIndex
CREATE INDEX "housekeeping_tasks_reservation_room_id_idx" ON "housekeeping_tasks"("reservation_room_id");

-- AddForeignKey
ALTER TABLE "housekeeping_tasks"
ADD CONSTRAINT "housekeeping_tasks_reservation_room_id_fkey"
FOREIGN KEY ("reservation_room_id") REFERENCES "reservation_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
