ALTER TABLE "reservation_groups"
ALTER COLUMN "channel_connection_id" DROP NOT NULL;

ALTER TABLE "reservation_groups"
DROP CONSTRAINT IF EXISTS "reservation_groups_channel_connection_id_fkey";

ALTER TABLE "reservation_groups"
ADD CONSTRAINT "reservation_groups_channel_connection_id_fkey"
FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "inventory_calendar" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "stay_date" DATE NOT NULL,
    "total_rooms" INTEGER NOT NULL DEFAULT 0,
    "blocked_rooms" INTEGER NOT NULL DEFAULT 0,
    "reserved_rooms" INTEGER NOT NULL DEFAULT 0,
    "available_rooms" INTEGER NOT NULL DEFAULT 0,
    "stop_sell" BOOLEAN NOT NULL DEFAULT false,
    "min_stay" INTEGER,
    "max_stay" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_calendar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_blocks" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "blocked_rooms" INTEGER NOT NULL DEFAULT 1,
    "reason" VARCHAR(180) NOT NULL,
    "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_calendar_property_id_room_category_id_stay_date_key"
ON "inventory_calendar"("property_id", "room_category_id", "stay_date");

CREATE INDEX "inventory_calendar_property_id_stay_date_idx"
ON "inventory_calendar"("property_id", "stay_date");

CREATE INDEX "inventory_calendar_room_category_id_stay_date_idx"
ON "inventory_calendar"("room_category_id", "stay_date");

CREATE INDEX "inventory_blocks_property_id_from_date_to_date_idx"
ON "inventory_blocks"("property_id", "from_date", "to_date");

CREATE INDEX "inventory_blocks_room_category_id_from_date_to_date_idx"
ON "inventory_blocks"("room_category_id", "from_date", "to_date");

ALTER TABLE "inventory_calendar"
ADD CONSTRAINT "inventory_calendar_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_calendar"
ADD CONSTRAINT "inventory_calendar_room_category_id_fkey"
FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_blocks"
ADD CONSTRAINT "inventory_blocks_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_blocks"
ADD CONSTRAINT "inventory_blocks_room_category_id_fkey"
FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
