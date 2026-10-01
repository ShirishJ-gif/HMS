ALTER TABLE "properties"
  ADD COLUMN "villa_whole_rate" DECIMAL(10,2),
  ADD COLUMN "villa_room_rate" DECIMAL(10,2),
  ADD COLUMN "villa_total_rooms" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "villa_min_rooms" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "villa_max_rooms" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_villa_room_limits_check"
  CHECK ("villa_total_rooms" BETWEEN 1 AND 20 AND "villa_min_rooms" BETWEEN 1 AND "villa_total_rooms" AND "villa_max_rooms" BETWEEN "villa_min_rooms" AND "villa_total_rooms");
