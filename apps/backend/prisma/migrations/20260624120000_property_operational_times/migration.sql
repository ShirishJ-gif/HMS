ALTER TABLE "properties"
ADD COLUMN "default_check_in_time" VARCHAR(5) NOT NULL DEFAULT '12:00',
ADD COLUMN "default_check_out_time" VARCHAR(5) NOT NULL DEFAULT '11:00';
