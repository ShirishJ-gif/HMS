CREATE TYPE "GoogleCalendarConnectionStatus" AS ENUM ('CONNECTED', 'ERROR', 'REAUTH_REQUIRED', 'DISCONNECTED');

CREATE TABLE "google_calendar_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "property_id" UUID NOT NULL,
  "status" "GoogleCalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "email_address" VARCHAR(160) NOT NULL,
  "provider_account_id" VARCHAR(190),
  "calendar_id" VARCHAR(256) NOT NULL,
  "calendar_summary" VARCHAR(190),
  "encrypted_credential" BYTEA NOT NULL,
  "credential_version" INTEGER NOT NULL DEFAULT 1,
  "granted_scopes" TEXT,
  "last_sync_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(80),
  "last_error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_calendar_connections_property_id_calendar_id_key"
  ON "google_calendar_connections"("property_id", "calendar_id");

CREATE INDEX "google_calendar_connections_tenant_id_property_id_idx"
  ON "google_calendar_connections"("tenant_id", "property_id");

CREATE INDEX "google_calendar_connections_status_idx"
  ON "google_calendar_connections"("status");

ALTER TABLE "google_calendar_connections"
  ADD CONSTRAINT "google_calendar_connections_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
