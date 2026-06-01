ALTER TABLE "housekeeping_tasks"
ADD COLUMN "completed_at" TIMESTAMP(3);

UPDATE "housekeeping_tasks"
SET "completed_at" = "updated_at"
WHERE "status" = 'INSPECTED'
  AND "completed_at" IS NULL;

CREATE INDEX "housekeeping_tasks_completed_at_idx" ON "housekeeping_tasks"("completed_at");
