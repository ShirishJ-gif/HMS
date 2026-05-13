# Zodomus Safe Testing Runbook

Last updated: 2026-05-11

Use this runbook when testing Zodomus from HMS without accidentally hammering the provider.

Important:

- hit HMS APIs only
- do not call Zodomus directly unless you explicitly want low-level provider debugging
- do not retry bad responses in a loop
- stop as soon as one required step fails

## What You May Need To Change

Change these only if the new Zodomus account uses different provider-side IDs:

- `external_hotel_id`
- room mappings
- rate mappings

Do not change these for Zodomus account switching:

- HMS admin login
- HMS property name/details
- HMS room category names
- HMS rate plan names
- guest or booking data

## Safe Testing Rules

Before you start:

- keep one terminal only
- do not fire the same request repeatedly
- wait for one response before the next call
- if `property-check` fails, stop there

Stop immediately if you see:

- `401`
- `403`
- `429`
- `Invalid property id`
- any provider message saying suspended, blocked, or rate limit

If one of those appears, fix the cause first. Do not continue to the next API.

## Base Values

Replace these placeholders:

```text
BASE_URL=http://localhost:3000
EMAIL=admin.harbour@hms.local
PASSWORD=Admin@12345
CONNECTION_ID=YOUR_HMS_ZODOMUS_CONNECTION_ID
PROPERTY_ID=YOUR_REAL_ZODOMUS_PROPERTY_ID
```

## Step 1: Get HMS Bearer Token

```bash
curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

If you only want the bearer token:

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jq -r .access_token)
```

## Step 2: Find HMS Zodomus Connection ID

Use this if you do not already know the connection id:

```bash
curl -s "$BASE_URL/channels?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

Look for your Zodomus connection and copy its `id`.

## Step 3: Update `external_hotel_id`

Do this only when you know the real Zodomus property id for the current account.

```bash
curl -s -X POST "$BASE_URL/zodomus/mapping/property" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"connection_id\": \"$CONNECTION_ID\",
    \"external_hotel_id\": \"$PROPERTY_ID\"
  }"
```

Important:

- this updates HMS only
- it does not push a large payload to Zodomus
- it does not prove the property id is valid yet

## Step 4: Validate The Property ID

This is the first real provider validation step.

```bash
curl -s -X POST "$BASE_URL/channels/$CONNECTION_ID/property-check" \
  -H "Authorization: Bearer $TOKEN"
```

Good result:

- provider says `OK`
- property status is valid/active/ready enough to proceed

Bad result:

- `Invalid property id`
- `401`
- `403`
- `429`

If bad, stop here. Do not continue to catalog, queue, or test reservation APIs.

## Step 5: Load Provider Catalog

Run this only if `property-check` passed.

```bash
curl -s "$BASE_URL/channels/$CONNECTION_ID/provider-catalog" \
  -H "Authorization: Bearer $TOKEN"
```

Use the catalog to verify:

- provider room IDs
- provider rate IDs

## Step 6: Update Room Mappings Only If Needed

If the new account shows different provider room IDs, update them.

```bash
curl -s -X POST "$BASE_URL/channels/$CONNECTION_ID/room-mappings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"room_category_id\": \"YOUR_HMS_ROOM_CATEGORY_ID\",
    \"external_room_id\": \"YOUR_PROVIDER_ROOM_ID\"
  }"
```

## Step 7: Update Rate Mappings Only If Needed

If the new account shows different provider rate IDs, update them.

```bash
curl -s -X POST "$BASE_URL/channels/$CONNECTION_ID/rate-mappings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"rate_plan_id\": \"YOUR_HMS_RATE_PLAN_ID\",
    \"external_room_id\": \"YOUR_PROVIDER_ROOM_ID\",
    \"external_rate_id\": \"YOUR_PROVIDER_RATE_ID\"
  }"
```

## Step 8: Activate Mapped Rooms

Do this only after property-check passes and mappings are correct.

```bash
curl -s -X POST "$BASE_URL/channels/$CONNECTION_ID/rooms-activate" \
  -H "Authorization: Bearer $TOKEN"
```

## Step 9: Check Reservation Queue

Do this only after the earlier steps succeed.

```bash
curl -s "$BASE_URL/channels/$CONNECTION_ID/provider-reservations-summary" \
  -H "Authorization: Bearer $TOKEN"
```

If this fails, stop. Do not keep retrying it.

## Step 10: Create One Test Reservation

Use one test event only after summary/property/catalog checks are healthy.

```bash
curl -s -X POST "$BASE_URL/channels/$CONNECTION_ID/provider-reservations-create-test" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "status": "new"
  }'
```

Do not spam this endpoint.

Use one call, inspect the result, then decide the next step.

## Optional Webhook Test

This only tests HMS webhook ingestion. It does not prove Zodomus property mapping is correct.

```bash
curl -s -X POST "$BASE_URL/webhooks/zodomus" \
  -H "Content-Type: application/json" \
  -H "x-webhook-key: YOUR_ZODOMUS_WEBHOOK_KEY" \
  -d '{
    "event_id": "zodomus-test-1",
    "event_type": "reservation.created",
    "propertyId": "YOUR_PROVIDER_PROPERTY_ID",
    "channelId": "1",
    "reservationId": "YOUR_PROVIDER_RESERVATION_ID"
  }'
```

## Fast Decision Tree

If `auth/login` fails:

- fix HMS login first

If `provider-account` fails:

- fix Zodomus API credentials first

If `property-check` fails with `Invalid property id`:

- fix `external_hotel_id`
- do not continue to later steps

If `provider-catalog` returns different provider IDs:

- update room mappings
- update rate mappings

If summary/test reservation fails after property-check passes:

- inspect the provider response once
- do not loop retries

## Minimum Safe API Order

If you want the shortest possible safe sequence, use exactly this order:

1. `POST /auth/login`
2. `POST /zodomus/mapping/property`
3. `POST /channels/:id/property-check`
4. `GET /channels/:id/provider-catalog`
5. update room mappings if needed
6. update rate mappings if needed
7. `POST /channels/:id/rooms-activate`
8. `GET /channels/:id/provider-reservations-summary`
9. `POST /channels/:id/provider-reservations-create-test`

Never skip directly from property mapping to queue/test reservation calls.
