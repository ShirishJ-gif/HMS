# Zodomus Test And Production Flow Comparison

This document compares the Zodomus test checklist, the Zodomus production checklist, and the current HMS implementation.

## Short Answer

HMS is mostly aligned with the Zodomus flow.

The important production path is:

1. Prepare HMS property, rooms, room categories, and rate plans.
2. Confirm Zodomus credentials with `GET /channels`.
3. Get price models with `GET /price-model`.
4. Activate the property with `POST /property-activation`.
5. Complete Booking.com channel-manager selection and agreement steps outside HMS.
6. Fetch provider room/rate catalog with `GET /room-rates`.
7. Save HMS-to-Zodomus room and rate mappings.
8. Activate mapped rooms/rates with `POST /rooms-activation`.
9. After Zodomus/Booking approval and final Booking.com confirmation, push availability and rates.
10. Receive reservations by webhook and keep `GET /reservations-queue` polling as fallback.
11. Fetch reservation details with `GET /reservations`.
12. Fetch card details with `GET /reservationCC` only when operationally required and allowed.

## Zodomus Test Flow

| Step | Zodomus test checklist | HMS status |
|---:|---|---|
| 1 | Create property, rooms, rates, and test send/receive calls | Implemented in HMS local setup and property modules |
| 2 | `GET /channels` | Implemented |
| 3 | `GET /price-model` | Implemented; operators can choose the model used for activation |
| 4 | `POST /property-activation` | Implemented |
| 5 | `GET /room-rates` | Implemented |
| 6 | `POST /property-check` | Implemented |
| 7 | `POST /rooms-activation` | Implemented |
| 8 | `POST /property-check` again | Required final readiness gate after room activation |
| 9 | `POST /availability` for one year | Implemented as explicit full sync; routine scheduler can use a shorter rolling horizon |
| 10 | `POST /rates` for one year | Implemented as explicit full sync; routine scheduler can use a shorter rolling horizon |
| 11 | `GET /reservations-summary` if needed | Implemented as a manual one-time backfill action |
| 12 | `POST /reservations-createtest` | Implemented for sandbox/testing |
| 13 | `GET /reservations-queue` | Implemented and now used for booking fallback polling |
| 14 | `GET /reservations` | Implemented |
| 15 | `GET /reservationCC` | Implemented as an explicit operator lookup |

## Zodomus Production Flow

| Step | Zodomus production checklist | HMS status |
|---:|---|---|
| 1 | Create property, rooms, rates, and verify send/receive readiness before OTA connection | Implemented; must be completed operationally before Booking.com connection |
| 2 | `GET /channels` | Implemented |
| 3 | `GET /price-model` | Implemented; operators choose the model used for activation |
| 4 | `POST /property-activation` with property ID and price model | Implemented |
| 5 | Change channel manager in Booking Admin to Zodomus two-way full connection | External manual Booking.com step, not done by HMS |
| 6 | `GET /room-rates` | Implemented |
| 7 | `POST /rooms-activation` | Implemented |
| 8 | Zodomus accepts channel-manager request in Booking | External Zodomus/Booking operation, not done by HMS |
| 9 | Confirm new channel manager in Booking Admin | External manual Booking.com step, not done by HMS |
| 10 | `POST /availability` for one year | Implemented as explicit full sync; routine scheduler can use a shorter rolling horizon |
| 11 | `POST /rates` for one year | Implemented as explicit full sync; routine scheduler can use a shorter rolling horizon |
| 12 | `GET /reservations-summary` if needed for existing future reservations | Implemented as a manual one-time backfill action |
| 13 | `GET /reservations-queue` or webhook | Implemented; webhook is primary, reservation queue is fallback polling |
| 14 | `GET /reservations` for queued reservation details | Implemented |
| 15 | `GET /reservationCC` when payment-card details are required | Implemented as an explicit operator lookup |

## Current HMS API Order

### Setup And Readiness

1. `GET /account`
2. `GET /channels`
3. `GET /price-model`
4. `POST /property-activation`
5. `POST /property-check`
6. `GET /room-rates`
7. HMS saves room/rate mappings locally.
8. `POST /rooms-activation`
9. `POST /property-check`

`GET /account` is extra compared with the checklist. It is used as a simple credential/account validation call and is not a harmful deviation.

The selected `price_model_id` is operator-controlled in HMS and sent to Zodomus during `POST /property-activation`.

HMS supports Zodomus price models `1` through `5` during rate sync. Model `2` sends the required two-step derived pricing flow: first `POST /rates` for the default price, then `POST /rates-derived` for offsets. Optional per-rate `pricing_config` can be stored on HMS channel rate mappings to provide single-occupancy prices, derived offsets, occupancy prices, per-day base occupancy, and length-of-stay prices.

### Initial Production Push

After Booking.com/Zodomus external approval and confirmation:

1. `POST /availability`
2. `POST /rates`

Production has two horizons:

- routine scheduler/manual sync window, intended for shorter rolling pushes such as 30-90 days
- explicit full sync window, defaulting to 365 days for go-live or long-range repair

### Reservation Intake

One-time go-live backfill path:

1. Operator clicks **Backfill existing future reservations**.
2. HMS calls Zodomus `GET /reservations-summary`.
3. HMS calls Zodomus `GET /reservations` for reservation IDs from the summary where details are available.
4. HMS imports or updates the local reservations.

Webhook path:

1. Zodomus calls HMS `POST /webhooks/channel/zodomus`.
2. HMS calls Zodomus `GET /reservations` when the webhook includes a reservation ID.
3. HMS imports or updates the local reservation.

Fallback polling path:

1. HMS calls Zodomus `GET /reservations-queue`.
2. HMS calls Zodomus `GET /reservations` for reservation IDs from the queue.
3. HMS imports or updates the local reservation.

If the webhook never reaches HMS, HMS cannot know the exact Zodomus retry count. The fallback is therefore schedule-based polling, not an immediate reaction to the third failed webhook delivery.

## Deviations And Notes

### Acceptable Deviations

- HMS calls `GET /account` in addition to the Zodomus checklist.
- `GET /reservations-summary` is optional and is exposed as a manual backfill action, not routine polling.
- Webhook is the preferred reservation trigger, with `GET /reservations-queue` as the reliability fallback.

### Items To Tighten Before Production

- Ensure Booking.com manual steps are represented as operator checklist items in the UI or runbook:
  - select Zodomus as channel manager
  - accept agreement
  - wait for Zodomus acceptance
  - confirm channel manager in Booking Admin
- Confirm the routine rolling window with Zodomus support before reducing or increasing production cadence.

## Production Recommendation

Use this sequence for a live Booking.com connection:

1. Finish HMS property, room, category, and rate-plan setup.
2. Validate Zodomus credentials with `GET /channels`.
3. Fetch price models with `GET /price-model`.
4. Activate property with `POST /property-activation`.
5. In Booking Admin, select Zodomus two-way full channel manager and accept the agreement.
6. Fetch `GET /room-rates`.
7. Save HMS room/rate mappings.
8. Activate rooms/rates with `POST /rooms-activation`.
9. Wait for Zodomus to accept the Booking.com channel-manager request.
10. Confirm the channel manager in Booking Admin.
11. Run initial 365-day `POST /availability`.
12. Run initial 365-day `POST /rates`.
13. Enable webhook for normal reservation intake.
14. Keep scheduled `GET /reservations-queue` fallback polling enabled.
15. Fetch reservation details with `GET /reservations` and store every reservation immediately after retrieval.
