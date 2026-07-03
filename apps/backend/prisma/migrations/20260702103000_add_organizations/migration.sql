ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ORG_OWNER';

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  "billing_email" VARCHAR(160),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "organization_id" UUID;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" UUID;

CREATE INDEX IF NOT EXISTS "organizations_status_idx" ON "organizations"("status");
CREATE INDEX IF NOT EXISTS "properties_organization_id_idx" ON "properties"("organization_id");
CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users"("organization_id");

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
