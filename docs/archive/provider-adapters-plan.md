# Provider Adapters Plan

This document defines what must change to turn the current payment and channel provider placeholders into real integrations.

## Summary

Provider adapters are not just API keys and tokens.

A real adapter requires:
- credentials and secrets
- external ID mappings
- provider-specific request/response code
- webhook verification and replay handling
- reconciliation logic
- retry/failure behavior
- sandbox testing

## Current State

The HMS already has good integration boundaries:
- provider service layers for payments and channels
- webhook ingestion foundation
- idempotency support
- background jobs with retry and dead-letter handling
- channel room/rate mappings
- sync logs
- audit logs
- metrics and alert definitions

What is still placeholder:
- live payment providers like `RAZORPAY` and `STRIPE`
- live channel providers like `SITEMINDER`, `BOOKING_COM`, and `AIRBNB`

## What Must Change

### 1. Provider Adapter Services

Implement real provider logic in the existing adapter boundaries.

For channels:
- authenticated API client
- inventory/rate push payload mapping
- provider error parsing
- provider success response parsing

For payments:
- payment create/collect/refund calls
- provider reference capture
- provider failure/status mapping

### 2. Connection And Credential Validation

Each provider needs explicit validation before use.

Examples:
- API key present
- API secret present
- account/property/hotel ID present
- webhook secret present
- connection status active
- required internal mappings complete

### 3. Secret And Config Handling

Do not treat provider setup as free-form token storage only.

Need:
- provider-specific config shape
- environment-secret requirements
- webhook secret configuration
- sandbox vs production separation

### 4. Mapping Requirements

Real integrations require external IDs.

Channel mapping requirements:
- internal property -> external hotel/property ID
- internal room category -> external room ID
- internal rate plan -> external rate ID

Payment mapping requirements:
- provider payment/reference IDs stored on transactions
- refund references stored and linked

### 5. Webhook Verification And Processing

For each provider:
- verify provider signature
- parse provider event headers/body
- normalize event shape
- deduplicate replays
- process through background jobs

### 6. Reconciliation Logic

Outbound calls are not enough.

Need:
- payment success/failure reconciliation
- refund reconciliation
- reservation create/modify/cancel reconciliation
- duplicate event handling
- out-of-order event handling

### 7. Retry And Failure Behavior

Provider calls and callbacks must be operationally resilient.

Need:
- queued execution where appropriate
- transient retry behavior
- dead-letter handling
- admin visibility
- clear error recording

### 8. Testing

Need:
- provider-shaped unit tests
- webhook verification tests
- integration tests for replay and failure cases
- sandbox contract validation where provider supports it

### 9. Documentation

Need:
- required env vars
- setup steps
- mapping requirements
- webhook setup instructions
- sandbox/live checklist

## Data Needed Beyond Tokens

### Channel Providers

- API key / token / secret
- external hotel/property ID
- external room IDs
- external rate IDs
- webhook secret
- provider endpoint/base URL details
- sync model details:
  - inventory semantics
  - rate semantics
  - taxes included/excluded
  - restrictions if applicable

### Payment Providers

- API key / secret
- account ID if required
- webhook secret
- provider transaction/reference IDs
- refund support behavior
- success/failure event contracts

## Execution Order

Best order:

1. pick one provider only
2. implement credential validation
3. implement one outbound flow
4. implement webhook verification
5. implement reconciliation
6. add integration tests
7. document setup

Do not build all providers at once.

## Recommended First Targets

### Channel

Start with one:
- `SITEMINDER`

Why:
- existing HMS already has channel connection and mapping concepts
- sync logs and queue foundations already exist

### Payments

Start with one:
- `RAZORPAY`

Why:
- current billing/payment model already fits a single-provider first rollout

## Files Likely To Change

### Channel path

- `apps/backend/src/modules/channel/channel-provider.service.ts`
- `apps/backend/src/modules/channel/channel.service.ts`
- `apps/backend/src/modules/webhook/*`
- `apps/backend/src/modules/background-job/*`
- channel DTOs and validation

### Payment path

- `apps/backend/src/modules/payment/payment-provider.service.ts`
- `apps/backend/src/modules/payment/payment.service.ts`
- `apps/backend/src/modules/webhook/*`
- `apps/backend/src/modules/background-job/*`
- payment DTOs and validation

## Non-Goals For First Pass

Do not try to solve everything in the first provider rollout.

Out of scope for first pass unless needed by the provider:
- multi-provider abstraction cleanup
- advanced pricing parity across channels
- dispute handling
- full OTA reservation import for every provider
- deep reporting UI

## Correct Expectation

If asked to make a provider real, the work is:
- not just inserting tokens
- not just changing env vars
- not just swapping a mock URL

It is a real integration slice across:
- config
- adapter code
- mappings
- webhooks
- retries
- reconciliation
- tests
