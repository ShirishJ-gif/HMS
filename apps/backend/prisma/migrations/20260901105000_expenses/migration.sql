CREATE TABLE "expenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "property_id" UUID NOT NULL,
  "expense_date" DATE NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "vendor" VARCHAR(160),
  "description" VARCHAR(300) NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'INR',
  "payment_mode" VARCHAR(40),
  "reference" VARCHAR(120),
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_property_id_expense_date_idx" ON "expenses"("property_id", "expense_date");
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
