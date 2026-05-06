CREATE TABLE "channel_booking_links" (
    "id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "external_reservation_id" VARCHAR(160) NOT NULL,
    "external_reservation_version" VARCHAR(160),
    "external_status" VARCHAR(80),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_booking_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_booking_links_channel_connection_id_external_reserva_key"
ON "channel_booking_links"("channel_connection_id", "external_reservation_id");

CREATE UNIQUE INDEX "channel_booking_links_booking_id_key"
ON "channel_booking_links"("booking_id");

CREATE INDEX "channel_booking_links_channel_connection_id_idx"
ON "channel_booking_links"("channel_connection_id");

CREATE INDEX "channel_booking_links_booking_id_idx"
ON "channel_booking_links"("booking_id");

CREATE INDEX "channel_booking_links_external_status_idx"
ON "channel_booking_links"("external_status");

ALTER TABLE "channel_booking_links"
ADD CONSTRAINT "channel_booking_links_channel_connection_id_fkey"
FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_booking_links"
ADD CONSTRAINT "channel_booking_links_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
