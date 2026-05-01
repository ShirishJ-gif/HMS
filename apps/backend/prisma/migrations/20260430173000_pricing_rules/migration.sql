CREATE TYPE "PricingRuleType" AS ENUM ('WEEKEND', 'DATE_RANGE', 'OCCUPANCY');

CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "PricingRuleType" NOT NULL,
    "adjustment_percent" DECIMAL(5,2) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "occupancy_threshold" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pricing_rules_property_id_idx" ON "pricing_rules"("property_id");
CREATE INDEX "pricing_rules_rate_plan_id_idx" ON "pricing_rules"("rate_plan_id");
CREATE INDEX "pricing_rules_type_idx" ON "pricing_rules"("type");
CREATE INDEX "pricing_rules_is_active_idx" ON "pricing_rules"("is_active");

ALTER TABLE "pricing_rules"
  ADD CONSTRAINT "pricing_rules_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pricing_rules"
  ADD CONSTRAINT "pricing_rules_rate_plan_id_fkey"
  FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
