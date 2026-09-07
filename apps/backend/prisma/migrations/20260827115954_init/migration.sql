-- AlterTable
ALTER TABLE "booking_enquiries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_attachments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_connections" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_extractions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "google_calendar_connections" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "incoming_emails" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "inventory_sync_rows_channel_sync_log_id_sync_date_external_room" RENAME TO "inventory_sync_rows_channel_sync_log_id_sync_date_external__key";

-- RenameIndex
ALTER INDEX "provider_reservation_intake_records_channel_connection_id_statu" RENAME TO "provider_reservation_intake_records_channel_connection_id_s_idx";

-- RenameIndex
ALTER INDEX "provider_reservation_intake_records_channel_sync_log_id_externa" RENAME TO "provider_reservation_intake_records_channel_sync_log_id_ext_key";

-- RenameIndex
ALTER INDEX "reservation_groups_channel_connection_id_external_reservat_key" RENAME TO "reservation_groups_channel_connection_id_external_reservati_key";

-- RenameIndex
ALTER INDEX "reservation_rooms_reservation_group_id_external_room_reservat_k" RENAME TO "reservation_rooms_reservation_group_id_external_room_reserv_key";
