ALTER TABLE "inventory_blocks"
ADD COLUMN "google_calendar_id" VARCHAR(255),
ADD COLUMN "google_calendar_event_id" VARCHAR(255),
ADD COLUMN "google_calendar_html_link" TEXT;

CREATE INDEX "inventory_blocks_google_calendar_event_id_idx"
ON "inventory_blocks"("google_calendar_event_id");
