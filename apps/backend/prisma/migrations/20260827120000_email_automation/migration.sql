CREATE TYPE "EmailProviderType" AS ENUM ('GMAIL', 'MICROSOFT', 'IMAP', 'MANUAL');
CREATE TYPE "EmailConnectionStatus" AS ENUM ('CONNECTING', 'CONNECTED', 'REAUTH_REQUIRED', 'RECONNECTING', 'ERROR', 'DISCONNECTED');
CREATE TYPE "IncomingEmailStatus" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'NEEDS_REVIEW', 'IGNORED', 'FAILED');
CREATE TYPE "EmailCategory" AS ENUM ('BOOKING_CONFIRMATION', 'BOOKING_MODIFICATION', 'BOOKING_CANCELLATION', 'BOOKING_ENQUIRY', 'PAYMENT_NOTIFICATION', 'OTA_MESSAGE', 'GUEST_MESSAGE', 'OFFER', 'PROMOTION', 'GENERAL', 'UNKNOWN');
CREATE TYPE "EmailSource" AS ENUM ('BOOKING_COM', 'AIRBNB', 'EXPEDIA', 'MAKEMYTRIP', 'GOIBIBO', 'AGODA', 'WEBSITE', 'DIRECT_GUEST', 'OTHER', 'UNKNOWN');
CREATE TYPE "ParserType" AS ENUM ('DETERMINISTIC', 'AI', 'MANUAL');
CREATE TYPE "AutomationDecision" AS ENUM ('CREATE_RESERVATION', 'UPDATE_RESERVATION', 'CANCEL_RESERVATION', 'CREATE_ENQUIRY', 'ATTACH_TO_RESERVATION', 'REVIEW', 'IGNORE', 'NO_ACTION');

CREATE TABLE "email_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "property_id" UUID NOT NULL,
  "provider" "EmailProviderType" NOT NULL,
  "status" "EmailConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "email_address" VARCHAR(160) NOT NULL,
  "provider_account_id" VARCHAR(190),
  "encrypted_credential" BYTEA,
  "credential_version" INTEGER NOT NULL DEFAULT 1,
  "granted_scopes" TEXT,
  "provider_cursor" TEXT,
  "subscription_id" VARCHAR(190),
  "subscription_expires_at" TIMESTAMP(3),
  "last_sync_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(80),
  "last_error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incoming_emails" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "property_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "provider_message_id" VARCHAR(190) NOT NULL,
  "provider_thread_id" VARCHAR(190),
  "internet_message_id" VARCHAR(190),
  "from_email" VARCHAR(160) NOT NULL,
  "from_name" VARCHAR(160),
  "subject" VARCHAR(300) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "sent_at" TIMESTAMP(3),
  "plain_text" TEXT,
  "html_storage_key" TEXT,
  "status" "IncomingEmailStatus" NOT NULL DEFAULT 'RECEIVED',
  "detected_source" "EmailSource",
  "detected_category" "EmailCategory",
  "classification_confidence" DOUBLE PRECISION,
  "parser_type" "ParserType",
  "parser_version" VARCHAR(120),
  "automation_decision" "AutomationDecision",
  "reservation_id" UUID,
  "enquiry_id" UUID,
  "processing_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(80),
  "last_error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incoming_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_extractions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email_id" UUID NOT NULL,
  "source" "EmailSource" NOT NULL,
  "category" "EmailCategory" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "external_reservation_id" VARCHAR(160),
  "guest_name" VARCHAR(160),
  "guest_email" VARCHAR(160),
  "guest_phone_raw" VARCHAR(60),
  "guest_phone_e164" VARCHAR(30),
  "check_in" DATE,
  "check_out" DATE,
  "adults" INTEGER,
  "children" INTEGER,
  "infants" INTEGER,
  "external_room_name" VARCHAR(180),
  "external_rate_plan_name" VARCHAR(180),
  "currency" VARCHAR(8),
  "total_amount" DECIMAL(10,2),
  "tax_amount" DECIMAL(10,2),
  "cancellation_reason" TEXT,
  "raw_structured_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_extractions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email_id" UUID NOT NULL,
  "provider_attachment_id" VARCHAR(190),
  "file_name" VARCHAR(240),
  "mime_type" VARCHAR(120),
  "size_bytes" INTEGER,
  "storage_key" TEXT,
  "sha256" VARCHAR(128),
  "processing_status" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_enquiries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "property_id" UUID NOT NULL,
  "source" VARCHAR(60) NOT NULL DEFAULT 'EMAIL',
  "guest_name" VARCHAR(160),
  "guest_email" VARCHAR(160),
  "guest_phone_e164" VARCHAR(30),
  "check_in" DATE,
  "check_out" DATE,
  "adults" INTEGER,
  "children" INTEGER,
  "requested_room_type_id" UUID,
  "status" VARCHAR(40) NOT NULL DEFAULT 'NEW',
  "incoming_email_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_enquiries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_connections_property_id_email_address_key" ON "email_connections"("property_id", "email_address");
CREATE INDEX "email_connections_tenant_id_property_id_idx" ON "email_connections"("tenant_id", "property_id");
CREATE INDEX "email_connections_status_idx" ON "email_connections"("status");

CREATE UNIQUE INDEX "incoming_emails_connection_id_provider_message_id_key" ON "incoming_emails"("connection_id", "provider_message_id");
CREATE INDEX "incoming_emails_tenant_id_property_id_received_at_idx" ON "incoming_emails"("tenant_id", "property_id", "received_at");
CREATE INDEX "incoming_emails_status_received_at_idx" ON "incoming_emails"("status", "received_at");
CREATE INDEX "incoming_emails_reservation_id_idx" ON "incoming_emails"("reservation_id");

CREATE UNIQUE INDEX "email_extractions_email_id_key" ON "email_extractions"("email_id");
CREATE INDEX "email_attachments_email_id_idx" ON "email_attachments"("email_id");

CREATE UNIQUE INDEX "booking_enquiries_incoming_email_id_key" ON "booking_enquiries"("incoming_email_id");
CREATE INDEX "booking_enquiries_tenant_id_property_id_status_idx" ON "booking_enquiries"("tenant_id", "property_id", "status");
CREATE INDEX "booking_enquiries_property_id_created_at_idx" ON "booking_enquiries"("property_id", "created_at");

ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incoming_emails" ADD CONSTRAINT "incoming_emails_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incoming_emails" ADD CONSTRAINT "incoming_emails_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "email_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_extractions" ADD CONSTRAINT "email_extractions_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "incoming_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "incoming_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_enquiries" ADD CONSTRAINT "booking_enquiries_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_enquiries" ADD CONSTRAINT "booking_enquiries_incoming_email_id_fkey" FOREIGN KEY ("incoming_email_id") REFERENCES "incoming_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
