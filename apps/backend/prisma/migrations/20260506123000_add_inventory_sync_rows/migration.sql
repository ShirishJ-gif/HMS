CREATE TYPE "InventorySyncRowStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "inventory_sync_rows" (
    "id" UUID NOT NULL,
    "channel_sync_log_id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "sync_date" DATE NOT NULL,
    "external_room_id" VARCHAR(120) NOT NULL,
    "available" INTEGER NOT NULL,
    "status" "InventorySyncRowStatus" NOT NULL,
    "error_message" TEXT,
    "provider_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_sync_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_sync_rows_channel_sync_log_id_sync_date_external_room_id_key"
ON "inventory_sync_rows"("channel_sync_log_id", "sync_date", "external_room_id");

CREATE INDEX "inventory_sync_rows_channel_connection_id_status_sync_date_idx"
ON "inventory_sync_rows"("channel_connection_id", "status", "sync_date");

CREATE INDEX "inventory_sync_rows_channel_sync_log_id_idx"
ON "inventory_sync_rows"("channel_sync_log_id");

CREATE INDEX "inventory_sync_rows_external_room_id_idx"
ON "inventory_sync_rows"("external_room_id");

ALTER TABLE "inventory_sync_rows"
ADD CONSTRAINT "inventory_sync_rows_channel_sync_log_id_fkey"
FOREIGN KEY ("channel_sync_log_id") REFERENCES "channel_sync_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_sync_rows"
ADD CONSTRAINT "inventory_sync_rows_channel_connection_id_fkey"
FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
