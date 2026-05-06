1. BOOKINGS sync is currently implemented as inventory sync, so any reservation import path will send the wrong payload shape to providers. In apps/backend/src/modules/channel/
     channel.service:321, buildSyncPayload() only special-cases RATES; every other ChannelSyncType, including BOOKINGS, falls through to the inventory builder. Then apps/
     backend/src/modules/background-job/background-job.service:438 forwards that payload directly to the provider adapter. That means a BOOKINGS sync cannot work correctly
     even before a real provider is added.
  2. Webhooks are acknowledged as “processed” without any domain/provider-specific side effects, so the system silently drops every real webhook event today. In apps/backend/
     src/modules/webhook/webhook.service:97, accepted events are enqueued for WEBHOOK_PROCESS. But apps/backend/src/modules/background-job/background-job.service:369 only
     loads the record, flips status to PROCESSED, and writes an audit log; it never updates payments, reservations, channels, or reconciliation state. This is worse than an
     explicit “not implemented” because the event looks successfully handled.
  3. Webhook signature verification is modeled as one shared secret per domain, which is too weak for multi-provider or multi-connection integrations and will break real
     channel/payment adapters. apps/backend/src/modules/webhook/webhook.service:167 uses only PAYMENT_WEBHOOK_SECRET or CHANNEL_WEBHOOK_SECRET, ignoring provider and any
     connection-specific secret. With this design1. BOOKINGS sync is currently wired to build an inventory payload, not a reservation import payload, so a bookings sync will send
     the wrong data shape to any provider. In apps/backend/src/modules/channel/channel.service:321, buildSyncPayload() only special-cases RATES; every other sync_type falls
     through to inventory generation. Since ChannelSyncType includes BOOKINGS, POST /channels/:id/sync with BOOKINGS will enqueue a job whose requestPayload is
     { inventory: ... }, and apps/backend/src/modules/background-job/background-job.service:415 passes that straight to the provider adapter. That is a behavioral bug, not
     just an unfinished feature.
  4. Webhooks are acknowledged as “processed” without executing any domain/provider-specific business logic, so accepted events are effectively dropped. apps/backend/src/
     modules/webhook/webhook.service:97 stores the event and enqueues WEBHOOK_PROCESS, but apps/backend/src/modules/background-job/background-job.service:369 only loads the
     row and flips its status to PROCESSED at lines 392-399. There is no dispatch into payment reconciliation, channel reservation import, refund handling, or sync updates.
     The system will report success in audit logs for webhooks that did nothing.
  5. The webhook signature model is too coarse for multi-provider or multi-connection integrations and will break real external integrations. In apps/backend/src/modules/
     webhook/webhook.service:167, verification uses one global PAYMENT_WEBHOOK_SECRET or one global CHANNEL_WEBHOOK_SECRET regardless of provider or channel connection. That
     means you cannot safely support different provider secrets, rotate secrets per connection, or isolate one compromised provider from another. For channel integrations this
     becomes a real correctness and security problem the moment more than one live provider exists.
  6. The system allows creation of ACTIVE external channel connections with no provider-specific validation, even though every non-mock provider is guaranteed to fail at
     execution time. CreateChannelConnectionDto accepts arbitrary credentials JSON and optional external_hotel_id in apps/backend/src/modules/channel/dto/create-channel-
     connection.dto:1. createConnection() persists that directly in apps/backend/src/modules/channel/channel.service:27, while ChannelConnection.status defaults to ACTIVE in
     apps/backend/prisma/schema.prisma:482. But any non-MOCK sync path hits apps/backend/src/modules/channel/channel-provider.service:31 and throws NotImplementedException.
     That creates a misleading state where the API accepts and activates connections that are unusable by design.
  7. Channel sync logs are marked FAILED on the first transient failure even when the background job is still scheduled to retry, which makes operational state misleading. In
     apps/backend/src/modules/background-job/background-job.service:304, nonterminal failures set the background job back to PENDING, but apps/backend/src/modules/background-
     job/background-job.service:521 updates the related channel_sync_logs row to FAILED immediately. Since apps/backend/prisma/schema.prisma:538 has no PROCESSING or RETRYING
     status, the user-facing sync log can show a hard failure while retries are still in progress. That will create false negatives in admin/UI and complicate support.

  Open questions / assumptions:

  - I treated the current webhook endpoints and BOOKINGS sync type as intended product surface, not placeholders hidden from users.
  - I did not run the test suite here, so this is a static review of the backend core paths I inspected.

  Change summary:

  - Strong architecture overall, but the integration surfaces currently overstate completeness. The biggest problems are around externally visible flows that accept work, mark
    it successful, and either do nothing or route the wrong payload.
