CREATE TABLE "room_out_of_service_periods" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" VARCHAR(180) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_out_of_service_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "room_out_of_service_periods_room_id_from_date_to_date_idx"
ON "room_out_of_service_periods"("room_id", "from_date", "to_date");

CREATE INDEX "room_out_of_service_periods_property_id_from_date_to_date_idx"
ON "room_out_of_service_periods"("property_id", "from_date", "to_date");

ALTER TABLE "room_out_of_service_periods"
ADD CONSTRAINT "room_out_of_service_periods_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_out_of_service_periods"
ADD CONSTRAINT "room_out_of_service_periods_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
