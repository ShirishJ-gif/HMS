CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "channel_connections" (
    "id",
    "property_id",
    "provider",
    "name",
    "status",
    "external_hotel_id",
    "credentials",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    p."id",
    'MOCK'::"ChannelProvider",
    'Legacy Booking Migration',
    'ACTIVE'::"ChannelConnectionStatus",
    NULL,
    jsonb_build_object('migration_source', 'bookings'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "properties" p
WHERE EXISTS (
    SELECT 1
    FROM "bookings" b
    WHERE b."property_id" = p."id"
)
ON CONFLICT ("property_id", "provider", "name") DO NOTHING;

INSERT INTO "reservation_groups" (
    "id",
    "property_id",
    "primary_guest_id",
    "channel_connection_id",
    "external_reservation_id",
    "external_status",
    "source",
    "currency",
    "total_amount",
    "reservation_status",
    "remarks",
    "booked_at",
    "modified_at",
    "raw_payload",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    b."property_id",
    b."guest_id",
    cc."id",
    'legacy-booking-' || b."id"::text,
    lower(b."booking_status"::text),
    'LEGACY_BOOKING_MIGRATION',
    rp."currency",
    b."total_amount",
    b."booking_status",
    'Backfilled from deprecated bookings table',
    b."created_at",
    b."updated_at",
    jsonb_build_object(
        'migration_source', 'bookings',
        'legacy_booking_id', b."id"
    ),
    b."created_at",
    b."updated_at"
FROM "bookings" b
JOIN "rate_plans" rp ON rp."id" = b."rate_plan_id"
JOIN "channel_connections" cc
  ON cc."property_id" = b."property_id"
 AND cc."provider" = 'MOCK'::"ChannelProvider"
 AND cc."name" = 'Legacy Booking Migration'
WHERE NOT EXISTS (
    SELECT 1
    FROM "reservation_groups" rg
    WHERE rg."channel_connection_id" = cc."id"
      AND rg."external_reservation_id" = 'legacy-booking-' || b."id"::text
);

INSERT INTO "reservation_rooms" (
    "id",
    "reservation_group_id",
    "property_id",
    "external_room_reservation_id",
    "external_room_id",
    "room_category_id",
    "rate_plan_id",
    "room_id",
    "arrival_date",
    "departure_date",
    "total_amount",
    "currency",
    "reservation_status",
    "guest_name",
    "raw_payload",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    rg."id",
    b."property_id",
    'legacy-room-' || b."id"::text,
    COALESCE(b."room_id"::text, b."room_category_id"::text),
    b."room_category_id",
    b."rate_plan_id",
    b."room_id",
    b."check_in_date",
    b."check_out_date",
    b."total_amount",
    rp."currency",
    b."booking_status",
    g."name",
    jsonb_build_object(
        'migration_source', 'bookings',
        'legacy_booking_id', b."id"
    ),
    b."created_at",
    b."updated_at"
FROM "bookings" b
JOIN "guests" g ON g."id" = b."guest_id"
JOIN "rate_plans" rp ON rp."id" = b."rate_plan_id"
JOIN "channel_connections" cc
  ON cc."property_id" = b."property_id"
 AND cc."provider" = 'MOCK'::"ChannelProvider"
 AND cc."name" = 'Legacy Booking Migration'
JOIN "reservation_groups" rg
  ON rg."channel_connection_id" = cc."id"
 AND rg."external_reservation_id" = 'legacy-booking-' || b."id"::text
WHERE NOT EXISTS (
    SELECT 1
    FROM "reservation_rooms" rr
    WHERE rr."reservation_group_id" = rg."id"
      AND rr."external_room_reservation_id" = 'legacy-room-' || b."id"::text
);

UPDATE "billings" bl
SET
    "reservation_room_id" = rr."id",
    "updated_at" = CURRENT_TIMESTAMP
FROM "reservation_rooms" rr
WHERE bl."booking_id" IS NOT NULL
  AND rr."external_room_reservation_id" = 'legacy-room-' || bl."booking_id"::text
  AND bl."reservation_room_id" IS NULL;

DROP TABLE IF EXISTS "channel_booking_links";

ALTER TABLE "billings"
DROP CONSTRAINT IF EXISTS "billings_booking_id_fkey";

DROP INDEX IF EXISTS "billings_booking_id_key";

ALTER TABLE "billings"
DROP COLUMN IF EXISTS "booking_id";

DROP TABLE IF EXISTS "bookings";
