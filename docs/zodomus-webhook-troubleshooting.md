# Zodomus Webhook Troubleshooting

Use this when Zodomus test reservations or manual webhook tests do not show in HMS reservations.

## Important Difference

There are two different ways reservations can reach HMS.

### Manual bookings sync

You call:

```http
POST /channels/:connectionId/sync
```

with:

```json
{
  "sync_type": "BOOKINGS"
}
```

The sync log will show:

```json
{
  "reservation_import": {
    "mode": "reservation_queue_poll"
  }
}
```

This means HMS polled Zodomus. It does not prove webhook is working.

### Webhook-triggered sync

Zodomus, or your manual test curl, calls:

```http
POST /webhooks/channel/zodomus
```

If processing works, the sync log will show:

```json
{
  "reservation_import": {
    "mode": "webhook_trigger",
    "webhook_event_id": "...",
    "reservation_id": "..."
  }
}
```

This proves the webhook path is being used.

## Create Test Reservation Behavior

When you call:

```http
POST /channels/:connectionId/provider-reservations-create-test
```

HMS creates the test reservation in Zodomus and then tries to import it directly using the returned reservation id.

If it does not show in reservations, run a manual bookings sync:

```bash
curl -s -X POST "http://localhost:3000/channels/$CONNECTION_ID/sync" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "sync_type": "BOOKINGS"
  }'
```

That fallback is polling, not webhook.

## Required Webhook Setup

Backend env must include:

```env
ZODOMUS_WEBHOOK_KEY="your_secret_here"
```

Zodomus webhook URL should be:

```text
https://YOUR_PUBLIC_BACKEND_URL/webhooks/channel/zodomus
```

For local testing through a tunnel, point the tunnel to the backend port, normally `3000`.

## Webhook Body

Use provider ids, not HMS ids.

Correct:

```json
{
  "event_id": "test-webhook-1",
  "event_type": "reservation.created",
  "propertyId": "51",
  "channelId": "1",
  "reservationId": "519042"
}
```

Wrong:

```json
{
  "channelId": "d8aba32a-f880-4605-a106-655b8dd72def"
}
```

That UUID is the HMS channel connection id. It is not the Zodomus provider channel id.

## Get A Token

```bash
TOKEN=$(curl -s -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.harbour@hms.local","password":"Admin@12345"}' | jq -r .access_token)
```

## Find The HMS Zodomus Connection

```bash
curl -s "http://localhost:3000/channels?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.provider=="ZODOMUS") | {
    id,
    provider,
    status,
    external_hotel_id,
    provider_config_summary
  }'
```

Set:

```bash
CONNECTION_ID=d8aba32a-f880-4605-a106-655b8dd72def
```

## Get The Zodomus Channel Id

```bash
curl -s "http://localhost:3000/channels/$CONNECTION_ID/provider-channels" \
  -H "Authorization: Bearer $TOKEN"
```

Use the provider channel id from this response as webhook `channelId`.

## Check Whether Connection Can Process Webhooks

Run:

```bash
curl -s "http://localhost:3000/channels?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.id=="'$CONNECTION_ID'") | {
    id,
    provider,
    status,
    external_hotel_id,
    channel_id: .provider_config_summary.channel_id,
    automation: .provider_config_summary.automation,
    setup_status: .provider_config_summary.setup_status
  }'
```

For webhook processing to work, these must be true:

```text
provider = ZODOMUS
status = ACTIVE
external_hotel_id = webhook propertyId
provider_config_summary.channel_id = webhook channelId
automation.enabled = true
setup_status.activated = true
setup_status.catalog_loaded = true
setup_status.ready = true
setup_status.disconnected = false
```

The most common failure is:

```json
{
  "automation": {
    "enabled": false
  }
}
```

If automation is false, enable it:

```bash
curl -s -X POST "http://localhost:3000/channels/$CONNECTION_ID/automation" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "enabled": true
  }'
```

## If Setup Status Is Not Ready

Run these in order:

```bash
curl -s "http://localhost:3000/channels/$CONNECTION_ID/provider-catalog" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s -X POST "http://localhost:3000/channels/$CONNECTION_ID/rooms-activate" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s -X POST "http://localhost:3000/channels/$CONNECTION_ID/property-check" \
  -H "Authorization: Bearer $TOKEN"
```

Then check:

```bash
curl -s "http://localhost:3000/channels?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.id=="'$CONNECTION_ID'") | .provider_config_summary.setup_status'
```

You need:

```json
{
  "activated": true,
  "rooms_activated": true,
  "catalog_loaded": true,
  "ready": true,
  "disconnected": false
}
```

## Send A Manual Webhook Test

Always use a new `event_id`. Reusing the same `event_id` becomes a duplicate.

```bash
curl -s -X POST "http://localhost:3000/webhooks/channel/zodomus" \
  -H "Content-Type: application/json" \
  -H "x-webhook-key: YOUR_ZODOMUS_WEBHOOK_KEY" \
  -d '{
    "event_id": "test-webhook-NEW",
    "event_type": "reservation.created",
    "propertyId": "51",
    "channelId": "1",
    "reservationId": "519042"
  }'
```

Expected immediate response:

```json
{
  "domain": "CHANNEL",
  "provider": "zodomus",
  "status": "RECEIVED",
  "duplicate": false
}
```

`RECEIVED` only means HMS accepted the webhook. It does not mean reservation import finished.

## Check Webhook Events

```bash
curl -s "http://localhost:3000/webhook-events?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

Good final state:

```json
{
  "status": "PROCESSED",
  "processed_at": "..."
}
```

If it remains `RECEIVED`, check background jobs.

## Check Background Jobs

```bash
curl -s "http://localhost:3000/background-jobs?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

Look for:

```text
WEBHOOK_PROCESS
```

If it is `DEAD_LETTER` with:

```text
No ready Zodomus channel connection matched the webhook event.
```

then one of these is wrong:

- webhook `propertyId` does not match `external_hotel_id`
- webhook `channelId` does not match provider `channel_id`
- connection `status` is not `ACTIVE`
- `automation.enabled` is false
- `setup_status.ready` is false
- `setup_status.activated` is false
- `setup_status.catalog_loaded` is false
- `setup_status.disconnected` is true

When a Zodomus webhook process job reaches `DEAD_LETTER`, HMS also tries to queue an automatic fallback bookings sync if it can safely identify the connection from webhook `propertyId` and `channelId`.

The fallback sync log will show:

```json
{
  "sync_type": "BOOKINGS",
  "request_payload": {
    "trigger": "webhook_dead_letter_fallback",
    "reservation_import": {
      "mode": "reservation_queue_poll",
      "fallback_for_webhook_event_id": "..."
    }
  }
}
```

This fallback still uses reservation polling. It is a recovery path, not proof that webhook processing succeeded.

## Check Sync Logs

```bash
curl -s "http://localhost:3000/channels/$CONNECTION_ID/sync-logs?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

Webhook worked if you see:

```json
{
  "sync_type": "BOOKINGS",
  "request_payload": {
    "reservation_import": {
      "mode": "webhook_trigger"
    }
  }
}
```

Manual polling happened if you see:

```json
{
  "sync_type": "BOOKINGS",
  "request_payload": {
    "reservation_import": {
      "mode": "reservation_queue_poll"
    }
  }
}
```

## Quick Decision Table

| Symptom | Meaning | Fix |
| --- | --- | --- |
| Webhook response is `RECEIVED` | HMS accepted webhook | Wait/check background job |
| Background job is `DEAD_LETTER` with no ready connection | Webhook could not match a ready Zodomus connection | Check property id, channel id, ready status, automation |
| Sync log mode is `reservation_queue_poll` | Manual bookings sync was used | Not webhook |
| Sync log mode is `webhook_trigger` | Webhook path was used | Check final sync status/import result |
| Reused `event_id` returns duplicate | Same webhook event already accepted | Use a new `event_id` |
