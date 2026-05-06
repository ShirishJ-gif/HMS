> Obsolete document.
>
> This is an older SiteMinder-focused planning note from before the current Zodomus-first reservation-centric direction. Use [docs/README.md](/Users/cronberry/Hms/docs/README.md) to find current docs.

 # SiteMinder Integration Plan for HMS

  ## Summary

  Build this as a staged bidirectional integration while keeping the existing multi-property model intact. For the current deployment, a single hotel is represented as one
  Property, so the HMS should work correctly for one hotel without schema simplification; all operational tables already key off property_id, and the access rules allow one-
  property operation cleanly.

  The first execution step should be to add a dedicated planning document such as plan.md or docs/siteminder-plan.md and capture this plan there before implementation
  starts.

  ## Key Changes

  ### 1. Integration target and rollout shape

  - Phase 1: outbound SiteMinder sync for INVENTORY and RATES.
  - Phase 2: inbound reservation flows for create, modify, cancel, and reconciliation.
  - Keep the existing Property model; do not fork the codebase into a single-hotel version.
  - Treat one live hotel as one active Property, one SiteMinder connection, and one set of mappings.

  ### 2. Missing platform capabilities that must be added

  - Replace the current external channel placeholder in apps/backend/src/modules/channel/channel-provider.service.ts:31 with a real SiteMinder adapter.
  - Fix BOOKINGS sync design: today BOOKINGS falls through to the inventory payload path in apps/backend/src/modules/channel/channel.service.ts:318, which is not a valid
    reservation flow.
  - Add inbound webhook/API endpoints for SiteMinder reservation events and acknowledgment handling.
  - Add retryable background execution for channel sync jobs; do not rely only on synchronous controller calls.
  - Add provider credential encryption at rest; do not leave live secrets as plain generic JSON.
  - Add provider-specific validation for connection setup, mapping completeness, and sync eligibility.
  - Add conflict/reconciliation policy for duplicates, changed dates, cancellations, and stale retries.

  ### 3. Data model and interface additions required for real SiteMinder support

  Add the minimum booking/channel metadata needed so inbound reservations can be safely created and replayed:

  - Booking source fields: channel_provider, channel_connection_id, external_booking_id, external_booking_status, external_modified_at.
  - Booking payload trace fields: raw inbound payload or normalized event log for reconciliation/debugging.
  - Guest ingestion fallback: OTA reservations may not provide id_proof or full address, but current guest creation requires both in apps/backend/src/modules/guest/dto/
    create-guest.dto.ts:3. Add an inbound booking path that can create or upsert guests with partial channel data.
  - Guest dedupe strategy: match by provider guest/contact signal first, then phone/email within the same property.
  - Channel event idempotency: store provider event/reference IDs separately from the existing request idempotency key mechanism.
  - Mapping completeness checks: require external hotel ID, room mappings, and rate mappings before enabling live sync.
  - Rate model expansion: current outbound rates use only baseRate from each rate plan in apps/backend/src/modules/channel/channel.service.ts:318. Add date-based rate
    calendar support or explicit provider rules if SiteMinder requires per-date prices.
  - Restriction support if needed by the provider contract: stop-sell, min/max stay, CTA/CTD, occupancy-based pricing, tax inclusion mode.

  Public/backend interface changes:

  - POST /channels should validate SiteMinder-specific credentials and connection prerequisites.
  - POST /channels/:id/sync should support provider-specific sync modes and queue async execution.
  - Add inbound provider endpoint(s) for reservation notifications or polling reconciliation.
  - Booking creation service should gain an internal channel-ingestion path that can create/update guest + booking from normalized SiteMinder payloads without requiring
    frontend-style guest_id input.

  ### 4. Execution design by phase

  #### Phase 1: outbound inventory and rates

  - Implement a SiteMinderChannelAdapter with authenticated API client, request signing/auth headers, error mapping, and provider response parsing.
  - Keep existing channel connection, room mapping, and rate mapping tables.
  - Build outbound payload transformers from internal room-category/rate-plan data into SiteMinder room/rate payloads.
  - Queue sync jobs and persist status transitions in channel_sync_logs.
  - Enforce preflight checks before sync:
      - connection is active
      - credentials are present and valid
      - external hotel ID exists
      - all targeted room categories and rate plans are mapped
  - Add scheduled/manual sync triggers and retry/backoff policy for transient failures.
  - Record request/response summaries and provider reference IDs in sync logs.

  #### Phase 2: inbound reservations

  - Add a reservation ingestion service that normalizes SiteMinder reservation payloads.
  - On reservation create:
      - resolve property from connection
      - upsert guest with partial data support
      - resolve room category/rate plan through mappings
      - create booking with external booking reference and audit trail
  - On reservation modify:
      - locate by external_booking_id
      - update dates, guest details, status, and totals according to normalized provider data
      - reject or flag unsafe modifications if the booking is already checked in/checked out
  - On reservation cancel:
      - map provider cancellation to local booking cancellation policy
      - ensure inventory is released consistently
  - Add replay safety so duplicate webhook events do not create duplicate bookings.

  ### 5. Single-hotel operating assumptions

  - Use the current property model unchanged.
  - Seed or create exactly one Property for the hotel.
  - Assign all hotel admins/staff to that property_id; SUPER_ADMIN remains optional.
  - Create exactly one active SiteMinder connection for that property initially.
  - No code simplification is required for one-hotel deployment; only operational setup is simpler.

  ## Test Plan

  - Unit tests for SiteMinder adapter request building, auth handling, provider error mapping, and response normalization.
  - Service tests for:
      - sync preflight failure when mappings/credentials/external hotel ID are missing
      - inventory sync payload correctness
      - duplicate event replay and idempotent booking handling
      - create connection -> add mappings -> queue sync -> success/failure log lifecycle
      - inbound reservation create produces guest + booking + audit log
      - inbound cancellation updates booking state and releases availability
      - transient provider failure retries without duplicate writes
  - Acceptance scenarios:
      - one hotel with one property and one SiteMinder connection can push inventory/rates successfully
      - SiteMinder reservation arrives and creates a local booking without manual guest pre-creation
      - the same reservation event replay does not create a second booking
      - a modified/cancelled reservation updates the existing booking deterministically

  ## Assumptions and defaults

  - Provider target is SiteMinder first; other aggregators stay out of scope for the first implementation.
  - Delivery is staged bidirectional: outbound first, inbound reservations second.
  - The system remains multi-property compatible, even if production initially has one hotel.
  - One hotel deployment is considered valid and supported as-is.
  - SiteMinder credentials will be stored securely with encryption, not plain JSON-at-rest semantics.
  - The current booking/guest flow is insufficient for inbound OTA reservations because it requires guest_id, id_proof, and address; implementation must add a channel-
    ingestion path rather than forcing OTA data through the frontend booking contract.
  - The current rate model is too thin for full OTA parity unless SiteMinder accepts a simple base-rate push; otherwise a date-based rate calendar must be added before go-
    live.
