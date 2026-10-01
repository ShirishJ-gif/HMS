-- Retire the WhatsApp integration and its stored sessions, auth records, and messages.
-- Drop dependent tables first; do not cascade into unrelated application tables.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TABLE "whatsapp_messages";
DROP TABLE "whatsapp_auth_records";
DROP TABLE "whatsapp_conversations";
DROP TABLE "whatsapp_connections";

DROP TYPE "WhatsAppMessageStatus";
DROP TYPE "WhatsAppMessageType";
DROP TYPE "WhatsAppMessageDirection";
DROP TYPE "WhatsAppConnectionStatus";

COMMIT;
