ALTER TABLE "channel_rate_mappings"
ADD COLUMN "external_room_id" VARCHAR(120);

UPDATE "channel_rate_mappings" AS crm
SET "external_room_id" = room_map."external_room_id"
FROM "rate_plans" AS rp,
     "channel_room_mappings" AS room_map
WHERE crm."rate_plan_id" = rp."id"
  AND room_map."channel_connection_id" = crm."channel_connection_id"
  AND room_map."room_category_id" = rp."room_category_id"
  AND crm."external_room_id" IS NULL;

DROP INDEX IF EXISTS "channel_rate_mappings_channel_connection_id_external_rate_i_key";

CREATE UNIQUE INDEX "channel_rate_mappings_channel_connection_id_external_room_i_key"
  ON "channel_rate_mappings"("channel_connection_id", "external_room_id", "external_rate_id");

CREATE INDEX "channel_rate_mappings_external_room_id_idx"
  ON "channel_rate_mappings"("external_room_id");
