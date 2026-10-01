ALTER TABLE "expenses"
  ADD COLUMN "amount_paid" DECIMAL(10,2),
  ADD COLUMN "invoice_number" VARCHAR(100),
  ADD COLUMN "reservation_group_id" UUID REFERENCES "reservation_groups"("id") ON DELETE RESTRICT,
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "void_reason" VARCHAR(300),
  ADD CONSTRAINT "expense_paid_bounds" CHECK ("amount_paid" IS NULL OR ("amount_paid" >= 0 AND "amount_paid" <= "amount")),
  ADD CONSTRAINT "expense_status_values" CHECK ("status" IN ('PENDING', 'APPROVED', 'VOID'));

CREATE TABLE "expense_receipts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "expense_id" UUID NOT NULL REFERENCES "expenses"("id") ON DELETE RESTRICT,
  "name" VARCHAR(180) NOT NULL,
  "mime_type" VARCHAR(80) NOT NULL,
  "content" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "expense_receipts_expense_id_idx" ON "expense_receipts"("expense_id");
