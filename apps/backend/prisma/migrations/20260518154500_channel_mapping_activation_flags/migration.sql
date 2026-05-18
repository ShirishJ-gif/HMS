ALTER TABLE "channel_room_mappings"
ADD COLUMN "is_activation_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "channel_rate_mappings"
ADD COLUMN "is_activation_enabled" BOOLEAN NOT NULL DEFAULT true;
