CREATE TABLE "reservation_groups" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "primary_guest_id" UUID,
    "channel_connection_id" UUID NOT NULL,
    "external_reservation_id" VARCHAR(160) NOT NULL,
    "external_reservation_version" VARCHAR(160),
    "external_status" VARCHAR(80),
    "source" VARCHAR(80),
    "currency" VARCHAR(8),
    "total_amount" DECIMAL(10,2),
    "reservation_status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "remarks" TEXT,
    "booked_at" TIMESTAMP(3),
    "modified_at" TIMESTAMP(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservation_rooms" (
    "id" UUID NOT NULL,
    "reservation_group_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "external_room_reservation_id" VARCHAR(160) NOT NULL,
    "external_room_id" VARCHAR(160) NOT NULL,
    "room_category_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "room_id" UUID,
    "arrival_date" DATE NOT NULL,
    "departure_date" DATE NOT NULL,
    "total_amount" DECIMAL(10,2),
    "currency" VARCHAR(8),
    "reservation_status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "guest_name" VARCHAR(160),
    "adults" INTEGER,
    "children" INTEGER,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservation_groups_channel_connection_id_external_reservat_key"
ON "reservation_groups"("channel_connection_id", "external_reservation_id");

CREATE INDEX "reservation_groups_property_id_idx"
ON "reservation_groups"("property_id");

CREATE INDEX "reservation_groups_primary_guest_id_idx"
ON "reservation_groups"("primary_guest_id");

CREATE INDEX "reservation_groups_channel_connection_id_idx"
ON "reservation_groups"("channel_connection_id");

CREATE INDEX "reservation_groups_reservation_status_idx"
ON "reservation_groups"("reservation_status");

CREATE INDEX "reservation_groups_external_status_idx"
ON "reservation_groups"("external_status");

CREATE UNIQUE INDEX "reservation_rooms_reservation_group_id_external_room_reservat_key"
ON "reservation_rooms"("reservation_group_id", "external_room_reservation_id");

CREATE INDEX "reservation_rooms_reservation_group_id_idx"
ON "reservation_rooms"("reservation_group_id");

CREATE INDEX "reservation_rooms_property_id_idx"
ON "reservation_rooms"("property_id");

CREATE INDEX "reservation_rooms_room_category_id_idx"
ON "reservation_rooms"("room_category_id");

CREATE INDEX "reservation_rooms_rate_plan_id_idx"
ON "reservation_rooms"("rate_plan_id");

CREATE INDEX "reservation_rooms_room_id_idx"
ON "reservation_rooms"("room_id");

CREATE INDEX "reservation_rooms_reservation_status_idx"
ON "reservation_rooms"("reservation_status");

CREATE INDEX "reservation_rooms_arrival_date_departure_date_idx"
ON "reservation_rooms"("arrival_date", "departure_date");

ALTER TABLE "reservation_groups"
ADD CONSTRAINT "reservation_groups_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_groups"
ADD CONSTRAINT "reservation_groups_primary_guest_id_fkey"
FOREIGN KEY ("primary_guest_id") REFERENCES "guests"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_groups"
ADD CONSTRAINT "reservation_groups_channel_connection_id_fkey"
FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_reservation_group_id_fkey"
FOREIGN KEY ("reservation_group_id") REFERENCES "reservation_groups"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_room_category_id_fkey"
FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_rate_plan_id_fkey"
FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
