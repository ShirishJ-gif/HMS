ALTER TABLE "billings"
ALTER COLUMN "booking_id" DROP NOT NULL;

ALTER TABLE "billings"
ADD COLUMN "reservation_room_id" UUID;

CREATE UNIQUE INDEX "billings_reservation_room_id_key"
ON "billings"("reservation_room_id");

CREATE INDEX "billings_reservation_room_id_idx"
ON "billings"("reservation_room_id");

ALTER TABLE "billings"
ADD CONSTRAINT "billings_reservation_room_id_fkey"
FOREIGN KEY ("reservation_room_id") REFERENCES "reservation_rooms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
