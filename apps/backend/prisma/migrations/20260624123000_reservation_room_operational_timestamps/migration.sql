ALTER TABLE "reservation_rooms"
ADD COLUMN "checked_in_at" TIMESTAMP(3),
ADD COLUMN "checked_out_at" TIMESTAMP(3);

UPDATE "reservation_rooms"
SET "checked_in_at" = "updated_at"
WHERE "reservation_status" IN ('CHECKED_IN', 'CHECKED_OUT')
  AND "checked_in_at" IS NULL;

UPDATE "reservation_rooms"
SET "checked_out_at" = "updated_at"
WHERE "reservation_status" = 'CHECKED_OUT'
  AND "checked_out_at" IS NULL;
