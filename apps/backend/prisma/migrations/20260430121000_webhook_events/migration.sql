-- CreateEnum
CREATE TYPE "WebhookDomain" AS ENUM ('PAYMENT', 'CHANNEL');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "domain" "WebhookDomain" NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "property_id" UUID,
    "dedupe_key" VARCHAR(190) NOT NULL,
    "external_event_id" VARCHAR(160),
    "event_type" VARCHAR(120) NOT NULL,
    "signature" TEXT,
    "headers" JSONB,
    "payload" JSONB NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "processing_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupe_key_key" ON "webhook_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "webhook_events_domain_provider_idx" ON "webhook_events"("domain", "provider");

-- CreateIndex
CREATE INDEX "webhook_events_property_id_idx" ON "webhook_events"("property_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
