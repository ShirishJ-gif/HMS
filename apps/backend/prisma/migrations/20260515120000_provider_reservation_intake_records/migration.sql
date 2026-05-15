CREATE TYPE "ProviderReservationIntakeStatus" AS ENUM ('FETCHED', 'IMPORTED', 'FAILED', 'SKIPPED');

CREATE TABLE "provider_reservation_intake_records" (
    "id" UUID NOT NULL,
    "channel_sync_log_id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "external_reservation_id" VARCHAR(160) NOT NULL,
    "status" "ProviderReservationIntakeStatus" NOT NULL DEFAULT 'FETCHED',
    "raw_payload" JSONB NOT NULL,
    "error_message" TEXT,
    "imported_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_reservation_intake_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_reservation_intake_records_channel_sync_log_id_external_reservation_id_key"
ON "provider_reservation_intake_records"("channel_sync_log_id", "external_reservation_id");

CREATE INDEX "provider_reservation_intake_records_channel_connection_id_status_idx"
ON "provider_reservation_intake_records"("channel_connection_id", "status");

CREATE INDEX "provider_reservation_intake_records_property_id_status_idx"
ON "provider_reservation_intake_records"("property_id", "status");

CREATE INDEX "provider_reservation_intake_records_external_reservation_id_idx"
ON "provider_reservation_intake_records"("external_reservation_id");

ALTER TABLE "provider_reservation_intake_records"
ADD CONSTRAINT "provider_reservation_intake_records_channel_sync_log_id_fkey"
FOREIGN KEY ("channel_sync_log_id") REFERENCES "channel_sync_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_reservation_intake_records"
ADD CONSTRAINT "provider_reservation_intake_records_channel_connection_id_fkey"
FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_reservation_intake_records"
ADD CONSTRAINT "provider_reservation_intake_records_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
