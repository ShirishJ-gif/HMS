CREATE TYPE "WhatsAppConnectionStatus" AS ENUM (
  'NOT_CONNECTED',
  'CONNECTING',
  'QR_REQUIRED',
  'CONNECTED',
  'RECONNECTING',
  'DISCONNECTED',
  'LOGGED_OUT',
  'ERROR'
);

CREATE TYPE "WhatsAppMessageDirection" AS ENUM (
  'INBOUND',
  'OUTBOUND'
);

CREATE TYPE "WhatsAppMessageType" AS ENUM (
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'DOCUMENT',
  'LOCATION',
  'CONTACT',
  'STICKER',
  'REACTION',
  'SYSTEM',
  'UNSUPPORTED'
);

CREATE TYPE "WhatsAppMessageStatus" AS ENUM (
  'PENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED'
);

CREATE TABLE "whatsapp_connections" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "organization_id" UUID,
  "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
  "phone_number" VARCHAR(40),
  "phone_e164" VARCHAR(40),
  "whatsapp_jid" VARCHAR(120),
  "display_name" VARCHAR(160),
  "session_generation" INTEGER NOT NULL DEFAULT 1,
  "last_connected_at" TIMESTAMP(3),
  "last_disconnected_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(80),
  "last_error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_auth_records" (
  "id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "auth_key" VARCHAR(240) NOT NULL,
  "encrypted_value" BYTEA NOT NULL,
  "encryption_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_auth_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_conversations" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "organization_id" UUID,
  "connection_id" UUID NOT NULL,
  "remote_jid" VARCHAR(160) NOT NULL,
  "phone_e164" VARCHAR(40),
  "display_name" VARCHAR(160),
  "profile_photo_url" TEXT,
  "guest_id" UUID,
  "reservation_group_id" UUID,
  "is_group" BOOLEAN NOT NULL DEFAULT false,
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "last_message_id" UUID,
  "last_message_preview" VARCHAR(500),
  "last_message_at" TIMESTAMP(3),
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_messages" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "organization_id" UUID,
  "conversation_id" UUID NOT NULL,
  "whatsapp_message_id" VARCHAR(180) NOT NULL,
  "remote_jid" VARCHAR(160) NOT NULL,
  "direction" "WhatsAppMessageDirection" NOT NULL,
  "type" "WhatsAppMessageType" NOT NULL,
  "status" "WhatsAppMessageStatus" NOT NULL,
  "body" TEXT,
  "quoted_whatsapp_id" VARCHAR(180),
  "from_me" BOOLEAN NOT NULL,
  "whatsapp_timestamp" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "raw_type" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_connections_property_id_key" ON "whatsapp_connections"("property_id");
CREATE INDEX "whatsapp_connections_organization_id_status_idx" ON "whatsapp_connections"("organization_id", "status");
CREATE INDEX "whatsapp_connections_property_id_status_idx" ON "whatsapp_connections"("property_id", "status");

CREATE UNIQUE INDEX "whatsapp_auth_records_connection_id_auth_key_key" ON "whatsapp_auth_records"("connection_id", "auth_key");
CREATE INDEX "whatsapp_auth_records_connection_id_idx" ON "whatsapp_auth_records"("connection_id");

CREATE UNIQUE INDEX "whatsapp_conversations_connection_id_remote_jid_key" ON "whatsapp_conversations"("connection_id", "remote_jid");
CREATE INDEX "whatsapp_conversations_property_id_last_message_at_idx" ON "whatsapp_conversations"("property_id", "last_message_at");
CREATE INDEX "whatsapp_conversations_organization_id_property_id_idx" ON "whatsapp_conversations"("organization_id", "property_id");
CREATE INDEX "whatsapp_conversations_guest_id_idx" ON "whatsapp_conversations"("guest_id");
CREATE INDEX "whatsapp_conversations_reservation_group_id_idx" ON "whatsapp_conversations"("reservation_group_id");

CREATE UNIQUE INDEX "whatsapp_messages_conversation_id_whatsapp_message_id_key" ON "whatsapp_messages"("conversation_id", "whatsapp_message_id");
CREATE INDEX "whatsapp_messages_property_id_whatsapp_timestamp_idx" ON "whatsapp_messages"("property_id", "whatsapp_timestamp");
CREATE INDEX "whatsapp_messages_organization_id_property_id_idx" ON "whatsapp_messages"("organization_id", "property_id");
CREATE INDEX "whatsapp_messages_conversation_id_whatsapp_timestamp_idx" ON "whatsapp_messages"("conversation_id", "whatsapp_timestamp");

ALTER TABLE "whatsapp_connections"
  ADD CONSTRAINT "whatsapp_connections_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_auth_records"
  ADD CONSTRAINT "whatsapp_auth_records_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_guest_id_fkey"
  FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_reservation_group_id_fkey"
  FOREIGN KEY ("reservation_group_id") REFERENCES "reservation_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
