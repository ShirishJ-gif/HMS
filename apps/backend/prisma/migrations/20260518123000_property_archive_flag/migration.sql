ALTER TABLE "properties" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "properties_is_active_idx" ON "properties"("is_active");
