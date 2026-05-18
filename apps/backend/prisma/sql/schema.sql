-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('DIRTY', 'CLEANING', 'CLEAN', 'INSPECTED', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "HousekeepingPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'CASH', 'CARD', 'UPI', 'RAZORPAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('MOCK', 'SITEMINDER', 'BOOKING_COM', 'AIRBNB');

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "ChannelSyncType" AS ENUM ('INVENTORY', 'RATES', 'BOOKINGS');

-- CreateEnum
CREATE TYPE "ChannelSyncStatus" AS ENUM ('QUEUED', 'SUCCEEDED', 'PARTIAL_FAILED', 'FAILED');
CREATE TYPE "InventorySyncRowStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookDomain" AS ENUM ('PAYMENT', 'CHANNEL');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "BackgroundJobType" AS ENUM ('WEBHOOK_PROCESS', 'CHANNEL_SYNC', 'NOTIFICATION_SEND');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('WEEKEND', 'DATE_RANGE', 'OCCUPANCY');

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(160),
    "id_proof" VARCHAR(120) NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(160),
    "address" TEXT NOT NULL,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "property_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_categories" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "max_occupancy" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "base_rate" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "PricingRuleType" NOT NULL,
    "adjustment_percent" DECIMAL(5,2) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "occupancy_threshold" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "room_number" VARCHAR(20) NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "room_id" UUID,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "booking_status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "billings" (
    "id" UUID NOT NULL,
    "booking_id" UUID,
    "reservation_room_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "billing_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MOCK',
    "provider_reference" VARCHAR(120),
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_extra_charges" (
    "id" UUID NOT NULL,
    "billing_id" UUID NOT NULL,
    "description" VARCHAR(180) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_extra_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "reservation_room_id" UUID,
    "status" "HousekeepingStatus" NOT NULL DEFAULT 'DIRTY',
    "priority" "HousekeepingPriority" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_images" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "caption" VARCHAR(180),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_category_images" (
    "id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "caption" VARCHAR(180),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_category_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_connections" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "external_hotel_id" VARCHAR(120),
    "credentials" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_room_mappings" (
    "id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "external_room_id" VARCHAR(120) NOT NULL,
    "external_room_name" VARCHAR(160),
    "is_activation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_room_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_rate_mappings" (
    "id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "external_room_id" VARCHAR(120),
    "external_rate_id" VARCHAR(120) NOT NULL,
    "external_rate_name" VARCHAR(160),
    "is_activation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_rate_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_sync_logs" (
    "id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "sync_type" "ChannelSyncType" NOT NULL,
    "status" "ChannelSyncStatus" NOT NULL DEFAULT 'QUEUED',
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "type" "BackgroundJobType" NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "property_id" UUID,
    "dedupe_key" VARCHAR(190),
    "entity_type" VARCHAR(80),
    "entity_id" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(120),
    "last_error" TEXT,
    "completed_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guests_property_id_idx" ON "guests"("property_id");

-- CreateIndex
CREATE INDEX "guests_phone_idx" ON "guests"("phone");

-- CreateIndex
CREATE INDEX "guests_email_idx" ON "guests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

-- CreateIndex
CREATE INDEX "properties_is_active_idx" ON "properties"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_property_id_idx" ON "users"("property_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "room_categories_property_id_idx" ON "room_categories"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_categories_property_id_code_key" ON "room_categories"("property_id", "code");

-- CreateIndex
CREATE INDEX "rate_plans_property_id_idx" ON "rate_plans"("property_id");

-- CreateIndex
CREATE INDEX "rate_plans_room_category_id_idx" ON "rate_plans"("room_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plans_property_id_code_key" ON "rate_plans"("property_id", "code");

-- CreateIndex
CREATE INDEX "pricing_rules_property_id_idx" ON "pricing_rules"("property_id");

-- CreateIndex
CREATE INDEX "pricing_rules_rate_plan_id_idx" ON "pricing_rules"("rate_plan_id");

-- CreateIndex
CREATE INDEX "pricing_rules_type_idx" ON "pricing_rules"("type");

-- CreateIndex
CREATE INDEX "pricing_rules_is_active_idx" ON "pricing_rules"("is_active");

-- CreateIndex
CREATE INDEX "rooms_property_id_idx" ON "rooms"("property_id");

-- CreateIndex
CREATE INDEX "rooms_room_category_id_idx" ON "rooms"("room_category_id");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_room_number_key" ON "rooms"("property_id", "room_number");

-- CreateIndex
CREATE INDEX "room_out_of_service_periods_room_id_from_date_to_date_idx" ON "room_out_of_service_periods"("room_id", "from_date", "to_date");

-- CreateIndex
CREATE INDEX "room_out_of_service_periods_property_id_from_date_to_date_idx" ON "room_out_of_service_periods"("property_id", "from_date", "to_date");

-- CreateIndex
CREATE INDEX "bookings_property_id_idx" ON "bookings"("property_id");

-- CreateIndex
CREATE INDEX "bookings_guest_id_idx" ON "bookings"("guest_id");

-- CreateIndex
CREATE INDEX "bookings_room_id_idx" ON "bookings"("room_id");

-- CreateIndex
CREATE INDEX "bookings_room_category_id_idx" ON "bookings"("room_category_id");

-- CreateIndex
CREATE INDEX "bookings_rate_plan_id_idx" ON "bookings"("rate_plan_id");

-- CreateIndex
CREATE INDEX "bookings_booking_status_idx" ON "bookings"("booking_status");

-- CreateIndex
CREATE INDEX "bookings_check_in_date_check_out_date_idx" ON "bookings"("check_in_date", "check_out_date");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_groups_channel_connection_id_external_reservat_key" ON "reservation_groups"("channel_connection_id", "external_reservation_id");

-- CreateIndex
CREATE INDEX "reservation_groups_property_id_idx" ON "reservation_groups"("property_id");

-- CreateIndex
CREATE INDEX "reservation_groups_primary_guest_id_idx" ON "reservation_groups"("primary_guest_id");

-- CreateIndex
CREATE INDEX "reservation_groups_channel_connection_id_idx" ON "reservation_groups"("channel_connection_id");

-- CreateIndex
CREATE INDEX "reservation_groups_reservation_status_idx" ON "reservation_groups"("reservation_status");

-- CreateIndex
CREATE INDEX "reservation_groups_external_status_idx" ON "reservation_groups"("external_status");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_rooms_reservation_group_id_external_room_reservat_key" ON "reservation_rooms"("reservation_group_id", "external_room_reservation_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_reservation_group_id_idx" ON "reservation_rooms"("reservation_group_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_property_id_idx" ON "reservation_rooms"("property_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_room_category_id_idx" ON "reservation_rooms"("room_category_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_rate_plan_id_idx" ON "reservation_rooms"("rate_plan_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_room_id_idx" ON "reservation_rooms"("room_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_reservation_status_idx" ON "reservation_rooms"("reservation_status");

-- CreateIndex
CREATE INDEX "reservation_rooms_arrival_date_departure_date_idx" ON "reservation_rooms"("arrival_date", "departure_date");

-- CreateIndex
CREATE UNIQUE INDEX "billings_booking_id_key" ON "billings"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "billings_reservation_room_id_key" ON "billings"("reservation_room_id");

-- CreateIndex
CREATE INDEX "billings_reservation_room_id_idx" ON "billings"("reservation_room_id");

-- CreateIndex
CREATE INDEX "billings_payment_status_idx" ON "billings"("payment_status");

-- CreateIndex
CREATE INDEX "payment_transactions_billing_id_idx" ON "payment_transactions"("billing_id");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_idx" ON "payment_transactions"("provider");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "billing_extra_charges_billing_id_idx" ON "billing_extra_charges"("billing_id");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_property_id_idx" ON "housekeeping_tasks"("property_id");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_room_id_idx" ON "housekeeping_tasks"("room_id");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_reservation_room_id_idx" ON "housekeeping_tasks"("reservation_room_id");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_status_idx" ON "housekeeping_tasks"("status");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_due_date_idx" ON "housekeeping_tasks"("due_date");

-- CreateIndex
CREATE INDEX "property_images_property_id_idx" ON "property_images"("property_id");

-- CreateIndex
CREATE INDEX "property_images_is_primary_idx" ON "property_images"("is_primary");

-- CreateIndex
CREATE INDEX "room_category_images_room_category_id_idx" ON "room_category_images"("room_category_id");

-- CreateIndex
CREATE INDEX "room_category_images_is_primary_idx" ON "room_category_images"("is_primary");

-- CreateIndex
CREATE INDEX "channel_connections_property_id_idx" ON "channel_connections"("property_id");

-- CreateIndex
CREATE INDEX "channel_connections_provider_idx" ON "channel_connections"("provider");

-- CreateIndex
CREATE INDEX "channel_connections_status_idx" ON "channel_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_property_id_provider_name_key" ON "channel_connections"("property_id", "provider", "name");

-- CreateIndex
CREATE INDEX "channel_room_mappings_room_category_id_idx" ON "channel_room_mappings"("room_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_room_mappings_channel_connection_id_room_category_i_key" ON "channel_room_mappings"("channel_connection_id", "room_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_room_mappings_channel_connection_id_external_room_i_key" ON "channel_room_mappings"("channel_connection_id", "external_room_id");

-- CreateIndex
CREATE INDEX "channel_rate_mappings_rate_plan_id_idx" ON "channel_rate_mappings"("rate_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_rate_mappings_channel_connection_id_rate_plan_id_key" ON "channel_rate_mappings"("channel_connection_id", "rate_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_rate_mappings_channel_connection_id_external_room_i_key" ON "channel_rate_mappings"("channel_connection_id", "external_room_id", "external_rate_id");

-- CreateIndex
CREATE INDEX "channel_rate_mappings_external_room_id_idx" ON "channel_rate_mappings"("external_room_id");

-- CreateIndex
CREATE INDEX "channel_sync_logs_channel_connection_id_idx" ON "channel_sync_logs"("channel_connection_id");

-- CreateIndex
CREATE INDEX "channel_sync_logs_sync_type_idx" ON "channel_sync_logs"("sync_type");

-- CreateIndex
CREATE INDEX "channel_sync_logs_status_idx" ON "channel_sync_logs"("status");
CREATE UNIQUE INDEX "inventory_sync_rows_channel_sync_log_id_sync_date_external_room_id_key" ON "inventory_sync_rows"("channel_sync_log_id", "sync_date", "external_room_id");
CREATE INDEX "inventory_sync_rows_channel_connection_id_status_sync_date_idx" ON "inventory_sync_rows"("channel_connection_id", "status", "sync_date");
CREATE INDEX "inventory_sync_rows_channel_sync_log_id_idx" ON "inventory_sync_rows"("channel_sync_log_id");
CREATE INDEX "inventory_sync_rows_external_room_id_idx" ON "inventory_sync_rows"("external_room_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupe_key_key" ON "webhook_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "webhook_events_domain_provider_idx" ON "webhook_events"("domain", "provider");

-- CreateIndex
CREATE INDEX "webhook_events_property_id_idx" ON "webhook_events"("property_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_dedupe_key_key" ON "background_jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "background_jobs_status_run_at_idx" ON "background_jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "background_jobs_property_id_idx" ON "background_jobs"("property_id");

-- CreateIndex
CREATE INDEX "background_jobs_type_idx" ON "background_jobs"("type");

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_out_of_service_periods" ADD CONSTRAINT "room_out_of_service_periods_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_out_of_service_periods" ADD CONSTRAINT "room_out_of_service_periods_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_groups" ADD CONSTRAINT "reservation_groups_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_groups" ADD CONSTRAINT "reservation_groups_primary_guest_id_fkey" FOREIGN KEY ("primary_guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_groups" ADD CONSTRAINT "reservation_groups_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_reservation_group_id_fkey" FOREIGN KEY ("reservation_group_id") REFERENCES "reservation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billings" ADD CONSTRAINT "billings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billings" ADD CONSTRAINT "billings_reservation_room_id_fkey" FOREIGN KEY ("reservation_room_id") REFERENCES "reservation_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "billings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_extra_charges" ADD CONSTRAINT "billing_extra_charges_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_reservation_room_id_fkey" FOREIGN KEY ("reservation_room_id") REFERENCES "reservation_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_category_images" ADD CONSTRAINT "room_category_images_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_room_mappings" ADD CONSTRAINT "channel_room_mappings_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_room_mappings" ADD CONSTRAINT "channel_room_mappings_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_rate_mappings" ADD CONSTRAINT "channel_rate_mappings_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_rate_mappings" ADD CONSTRAINT "channel_rate_mappings_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_sync_logs" ADD CONSTRAINT "channel_sync_logs_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sync_rows" ADD CONSTRAINT "inventory_sync_rows_channel_sync_log_id_fkey" FOREIGN KEY ("channel_sync_log_id") REFERENCES "channel_sync_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sync_rows" ADD CONSTRAINT "inventory_sync_rows_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
