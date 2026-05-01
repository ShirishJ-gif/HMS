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
CREATE TYPE "ChannelSyncStatus" AS ENUM ('QUEUED', 'SUCCEEDED', 'FAILED');

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
CREATE TABLE "billings" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_room_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_rate_mappings" (
    "id" UUID NOT NULL,
    "channel_connection_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "external_rate_id" VARCHAR(120) NOT NULL,
    "external_rate_name" VARCHAR(160),
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

-- CreateIndex
CREATE INDEX "guests_property_id_idx" ON "guests"("property_id");

-- CreateIndex
CREATE INDEX "guests_phone_idx" ON "guests"("phone");

-- CreateIndex
CREATE INDEX "guests_email_idx" ON "guests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

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
CREATE INDEX "rooms_property_id_idx" ON "rooms"("property_id");

-- CreateIndex
CREATE INDEX "rooms_room_category_id_idx" ON "rooms"("room_category_id");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_room_number_key" ON "rooms"("property_id", "room_number");

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
CREATE UNIQUE INDEX "billings_booking_id_key" ON "billings"("booking_id");

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
CREATE UNIQUE INDEX "channel_rate_mappings_channel_connection_id_external_rate_i_key" ON "channel_rate_mappings"("channel_connection_id", "external_rate_id");

-- CreateIndex
CREATE INDEX "channel_sync_logs_channel_connection_id_idx" ON "channel_sync_logs"("channel_connection_id");

-- CreateIndex
CREATE INDEX "channel_sync_logs_sync_type_idx" ON "channel_sync_logs"("sync_type");

-- CreateIndex
CREATE INDEX "channel_sync_logs_status_idx" ON "channel_sync_logs"("status");

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
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "billings" ADD CONSTRAINT "billings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "billings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_extra_charges" ADD CONSTRAINT "billing_extra_charges_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

