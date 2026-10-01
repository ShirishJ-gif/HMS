CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'RENTAL_VILLAS');

ALTER TABLE "properties"
ADD COLUMN "property_type" "PropertyType" NOT NULL DEFAULT 'HOTEL';
