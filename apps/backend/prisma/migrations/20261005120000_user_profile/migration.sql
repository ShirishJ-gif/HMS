ALTER TABLE "users"
  ADD COLUMN "phone" VARCHAR(30),
  ADD COLUMN "default_property_id" UUID,
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users" ADD CONSTRAINT "users_default_property_id_fkey"
  FOREIGN KEY ("default_property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refresh_sessions" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
