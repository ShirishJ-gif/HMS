CREATE TYPE "BackgroundJobType" AS ENUM ('WEBHOOK_PROCESS');

CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'DEAD_LETTER');

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

CREATE UNIQUE INDEX "background_jobs_dedupe_key_key" ON "background_jobs"("dedupe_key");
CREATE INDEX "background_jobs_status_run_at_idx" ON "background_jobs"("status", "run_at");
CREATE INDEX "background_jobs_property_id_idx" ON "background_jobs"("property_id");
CREATE INDEX "background_jobs_type_idx" ON "background_jobs"("type");

ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
