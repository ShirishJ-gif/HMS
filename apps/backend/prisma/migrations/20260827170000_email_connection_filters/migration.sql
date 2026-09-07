ALTER TABLE "email_connections"
  ADD COLUMN "trusted_from_email" VARCHAR(160),
  ADD COLUMN "trusted_subject" VARCHAR(300);
