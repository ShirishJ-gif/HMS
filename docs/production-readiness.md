# HMS Production Readiness Notes

## Current Platform Capabilities

- Multi-property inventory model with properties, room categories, physical rooms, and rate plans.
- Reservation flow that sells room-category inventory and assigns physical rooms at check-in.
- JWT auth with `SUPER_ADMIN`, `ADMIN`, and `STAFF` roles.
- Refresh-token sessions, logout/session revocation, and password reset token endpoints.
- Property-scoped authorization for hotel admins and staff.
- Availability, housekeeping, billing, payment transactions, mock WhatsApp notifications, and dashboard metrics.
- Booking-created WhatsApp notifications for guests and hotel owners, with mock and WhatsApp Cloud API modes.
- Channel-manager boundary with channel connections, external room/rate mappings, and sync logs.
- Generic webhook-event store with signed ingestion for payment/channel callback foundations.
- Database-backed background-job queue with retry scheduling and dead-letter state for async webhook, channel-sync, and notification processing.
- Audit-log module for sensitive operational actions across rooms, bookings, payments, and channels.
- Paginated/searchable list responses across operational list endpoints.
- Local property and room-category image uploads for MVP content management.
- Public `GET /health` endpoint for load balancer and uptime checks.
- Structured backend HTTP logging with per-request `x-request-id` correlation.
- Metrics endpoints for Prometheus-style scrape output and dashboard-friendly JSON summary.

## Channel Manager Integration Boundary

Real SiteMinder, Booking.com, Airbnb, or Gupshup/Twilio integrations should use provider services instead of writing directly to PMS tables.

Core boundary tables:

- `channel_connections`: one provider connection per property/channel account.
- `channel_room_mappings`: maps HMS room categories to external room IDs.
- `channel_rate_mappings`: maps HMS rate plans to external rate IDs.
- `channel_sync_logs`: stores request/response payloads and failure messages for reconciliation.

The current `ChannelProviderService` uses adapter dispatch. `MOCK` accepts sync payloads locally. `SITEMINDER`, `BOOKING_COM`, and `AIRBNB` currently reject live syncs with explicit not-implemented errors until provider-specific API clients, credentials, retry policy, and webhook reconciliation are added.

## Payment Provider Boundary

The payment module uses adapter dispatch. `MOCK`, `CASH`, `CARD`, and `UPI` use the local adapter for MVP collection/refund workflows. Payment collection/refunds support `Idempotency-Key`. `RAZORPAY` and `STRIPE` currently reject live calls until SDK/API credentials, webhook signature validation, and reconciliation flows are added.

Channel sync also supports `Idempotency-Key` for replay-safe sync requests.

## Webhook Verification Boundary

The app now has a generic webhook ingestion layer:

- `POST /webhooks/:domain/:provider`
- `GET /webhook-events`
- `GET /background-jobs`
- `POST /background-jobs/:id/retry`

Webhook signatures are verified with:

```text
PAYMENT_WEBHOOK_SECRET=...
CHANNEL_WEBHOOK_SECRET=...
```

Accepted webhook events are stored in `webhook_events` with replay dedupe keys, payload metadata, and processing status. Webhooks and channel sync requests also enqueue persisted `background_jobs` records with retry scheduling and dead-letter status. This is a foundation layer only; live provider-specific signature formats, event schemas, ordering rules, and reprocessing policies still need to be implemented per provider.

## Audit Logs

Audit logs are stored in `audit_logs` and exposed through:

```http
GET /audit-logs?page=1&limit=25&search=refund
```

Current audit coverage includes booking creation, check-in, checkout, room create/update/delete, payment collection/refunds, channel connection/mapping creation, and channel sync success/failure. Future coverage should include user-management changes and any future rate-plan update endpoints.

## WhatsApp Business API

`WhatsAppNotificationService` defaults to mock logging. Set these variables for WhatsApp Cloud API delivery:

```text
WHATSAPP_PROVIDER=cloud_api
WABA_ACCESS_TOKEN=...
WABA_PHONE_NUMBER_ID=...
WABA_API_VERSION=v20.0
```

Booking creation sends a guest confirmation and a hotel-owner notification to `property.phone`. Check-in reminders also run through the same delivery path. These notifications are now queued through background jobs so delivery failures can retry and dead-letter. Production should add webhook handling for replies, delivery status tracking, opt-in/consent policy, and approved template messages where required.

## Deployment Checklist

- Move image storage from local disk to S3/R2/Cloudinary-compatible object storage before multi-server production deployment.
- Set strong `JWT_SECRET` and production `DATABASE_URL`.
- Run `npm ci`, `npm run backend:prisma:generate`, `npm run backend:build`, and `npm run frontend:build` in CI.
- Apply migrations using `npm --workspace apps/backend run prisma:deploy`.
- Serve frontend build through a CDN/static host and point `VITE_API_BASE_URL` to the backend.
- Run backend behind HTTPS, a reverse proxy, and a process manager or container orchestrator.
- Configure PostgreSQL backups, point-in-time recovery, and migration rollback procedures.
- Monitor `GET /health`, API error rates, latency, database connection saturation, and failed channel sync logs.
- Scrape `GET /metrics` and wire `GET /metrics/summary` into lightweight admin dashboards or operational checks.
- Use [docs/metrics-alerting.md](/Users/cronberry/Hms/docs/metrics-alerting.md) as the first dashboard and alert baseline.
- Monitor failed payment/channel adapter calls and unusual audit-log activity.
- Feed request-correlated application logs into centralized log storage before production rollout.

## Remaining Hardening Before Real Production

- Add production email/SMS delivery for password reset tokens and session-management UI.
- Add automated e2e tests that verify property-scoped access is enforced across every endpoint.
- Replace the generic webhook verification foundation with provider-specific signature parsing, event normalization, and ordered reconciliation rules.
- Expand audit logs to user-management changes and future rate-plan update flows.
- Add e2e API tests against PostgreSQL and CI deployment pipelines.
- Add external monitoring integrations and dashboard provisioning on top of the current metrics/logging foundation.
