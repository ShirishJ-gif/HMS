ALTER TABLE "inventory_blocks" ADD COLUMN "source_name" VARCHAR(120);

-- Earlier iCal imports stored the calendar name as the reason prefix.
UPDATE "inventory_blocks"
SET "source_name" = LEFT(SPLIT_PART("reason", ': ', 1), 120)
WHERE "source" LIKE 'ICAL_IMPORT:%' AND POSITION(': ' IN "reason") > 0;
