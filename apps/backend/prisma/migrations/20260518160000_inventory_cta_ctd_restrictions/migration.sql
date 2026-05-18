ALTER TABLE "inventory_calendar"
ADD COLUMN "closed_to_arrival" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inventory_calendar"
ADD COLUMN "closed_to_departure" BOOLEAN NOT NULL DEFAULT false;
