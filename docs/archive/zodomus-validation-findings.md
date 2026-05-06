# Zodomus Validation Findings

Historical reference: this document records real provider validation evidence and should be read as validation history, not as the primary system overview.

Last updated: 2026-05-05

## Purpose

This document records the real validation results collected while testing Zodomus against the HMS channel manager flow.

It is separate from the implementation docs because it captures:

- what was actually tested
- what responses were returned
- what is confirmed working
- what is still blocked
- whether the blocker is inside HMS or outside HMS

## Current Test Context

Validated channel:

- `channelId = 1`
- OTA = `Booking.com`

Validated property:

- `propertyId = "100"`

## Confirmed Provider Responses

### 1. `GET /channels`

Response confirmed:

- `1 = Booking.com`
- `2 = Expedia`
- `3 = Airbnb`
- `4 = Agoda`

Conclusion:

- HMS mapping `Booking.com -> channelId 1` is correct

### 2. `POST /property-activation`

Request:

```json
{
  "channelId": 1,
  "propertyId": "100",
  "priceModelId": 1
}
```

Response:

```json
{
  "status": {
    "returnCode": 200,
    "returnMessage": "Property 100 received. Property is awaiting approval",
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:09:43"
  }
}
```

Conclusion:

- `propertyId = "100"` is a real recognized property in Zodomus
- activation request shape is valid
- activation does not mean immediate readiness
- there is an intermediate provider state: `awaiting approval`

### 3. `POST /property-check`

Request:

```json
{
  "channelId": 1,
  "propertyId": "100"
}
```

Response:

```json
{
  "status": {
    "returnCode": "400",
    "returnMessage": {
      "Property status": "Evaluation OTA",
      "Channel status": "OK",
      "Product status": "Error: Some room/rates are not maped with the channel room/rates. Use /rooms-activation to map room/rates",
      "Room status": "Error: Some rooms are not maped with the channel rooms. Use /rooms-activation to map room/rates"
    },
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:10:37"
  },
  "mappedProducts": [
    {
      "roomId": "10001",
      "rateId": "100991",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10001",
      "rateId": "100992",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10001",
      "rateId": "100993",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10002",
      "rateId": "100991",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10002",
      "rateId": "100992",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10002",
      "rateId": "100993",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10003",
      "rateId": "100991",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10003",
      "rateId": "100992",
      "myRoomId": "",
      "myRateId": ""
    },
    {
      "roomId": "10003",
      "rateId": "100993",
      "myRoomId": "",
      "myRateId": ""
    }
  ],
  "mappedRooms": [
    {
      "roomId": "10001",
      "myRoomId": ""
    },
    {
      "roomId": "10002",
      "myRoomId": ""
    },
    {
      "roomId": "10003",
      "myRoomId": ""
    }
  ]
}
```

Conclusions:

- `Channel status: OK` means the Booking.com channel selection is valid
- `Property status: Evaluation OTA` means the property is not yet fully live/usable
- Zodomus expects room/rate mapping through `POST /rooms-activation`
- Zodomus revealed real provider-side identifiers:
  - rooms: `10001`, `10002`, `10003`
  - rates: `100991`, `100992`, `100993`

Important integration finding:

- local HMS room/rate mapping alone is not enough for this property workflow
- provider-side room/rate activation is also required

### 4. `POST /rooms-activation` initial failure

Tested payload:

```json
{
  "channelId": 1,
  "propertyId": "100",
  "rooms": [
    {
      "roomId": "90001",
      "roomName": "Suite",
      "quantity": 1,
      "status": 1,
      "rates": ["99001"]
    }
  ]
}
```

Response:

```json
{
  "status": {
    "returnCode": "400",
    "returnMessage": "Channel rooms and rates are not mapped. Check if you notified your channel about using Zodomus as a channel manager",
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:13:28"
  }
}
```

Conclusions:

- the request reached the provider
- the first attempt failed because the Booking.com <-> Zodomus onboarding state was still incomplete
- this exposed a real external dependency in the provider workflow

### 5. `POST /rooms-activation` successful activation

Successful multi-room request example:

```json
{
  "channelId": 1,
  "propertyId": "100",
  "rooms": [
    {
      "roomId": "10001",
      "roomName": "Room 10001",
      "quantity": 1,
      "status": 1,
      "rates": ["100991", "100992", "100993"]
    },
    {
      "roomId": "10002",
      "roomName": "Room 10002",
      "quantity": 1,
      "status": 1,
      "rates": ["100991", "100992", "100993"]
    }
  ]
}
```

Response:

```json
{
  "status": {
    "returnCode": 200,
    "returnMessage": "Number of rooms activated: 2",
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:31:54"
  }
}
```

Conclusions:

- provider-side room/rate activation can succeed
- the room/rate identifiers returned by Zodomus are valid activation inputs
- `rooms-activation` is part of the real onboarding flow for this property

### 6. `POST /property-check` after room activation

Response:

```json
{
  "status": {
    "returnCode": "200",
    "returnMessage": {
      "Property status": "Active",
      "Channel status": "OK",
      "Product status": "OK",
      "Room status": "OK"
    },
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:34:16"
  },
  "mappedProducts": [
    {
      "roomId": "10001",
      "rateId": "100991",
      "myRoomId": "10001",
      "myRateId": "100991"
    },
    {
      "roomId": "10001",
      "rateId": "100992",
      "myRoomId": "10001",
      "myRateId": "100992"
    },
    {
      "roomId": "10001",
      "rateId": "100993",
      "myRoomId": "10001",
      "myRateId": "100993"
    },
    {
      "roomId": "10002",
      "rateId": "100991",
      "myRoomId": "10002",
      "myRateId": "100991"
    },
    {
      "roomId": "10002",
      "rateId": "100992",
      "myRoomId": "10002",
      "myRateId": "100992"
    },
    {
      "roomId": "10002",
      "rateId": "100993",
      "myRoomId": "10002",
      "myRateId": "100993"
    },
    {
      "roomId": "10003",
      "rateId": "100991",
      "myRoomId": "10003",
      "myRateId": "100991"
    },
    {
      "roomId": "10003",
      "rateId": "100992",
      "myRoomId": "10003",
      "myRateId": "100992"
    },
    {
      "roomId": "10003",
      "rateId": "100993",
      "myRoomId": "10003",
      "myRateId": "100993"
    }
  ],
  "mappedRooms": [
    {
      "roomId": "10001",
      "myRoomId": "10001"
    },
    {
      "roomId": "10002",
      "myRoomId": "10002"
    },
    {
      "roomId": "10003",
      "myRoomId": "10003"
    }
  ]
}
```

Conclusions:

- provider onboarding for this property reached a fully active state
- room status and product status are now valid
- provider-side mapping is complete
- setup-phase testing is successful

### 7. `GET /room-rates`

Response showed:

- rooms:
  - `10001 = Single room`
  - `10002 = Double room`
  - `10003 = Suite`
- rates:
  - `100991 = Non refundable`
  - `100992 = Standard rate`
  - `100993 = Special rate`

Important finding:

- rate IDs are reused across multiple rooms
- Zodomus rate operations depend on the pair `roomId + rateId`, not only `rateId`

Conclusions:

- room/rate catalog is operational
- the setup phase is fully usable for real operations

### 8. `POST /availability`

First test result:

```json
{
  "status": {
    "returnCode": "400",
    "returnMessage": "Check your room association with Zodomus. Your availability is higher than declared",
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:37:19"
  }
}
```

Meaning:

- the API shape is valid
- the business rule was enforced
- the room had been declared with `quantity = 1`, so sending availability `2` was rejected

Second test result with valid quantity:

```json
{
  "status": {
    "returnCode": 200,
    "returnMessage": "OK",
    "channelLogId": "UmFuZG9tSVYkc2RlIyh9Yf0c+r9MyekBpHKML4ATIzlmDGaCkvfZUIqNsLayoq+SVBTR78MzKiyNtnSLUdIjkVk3lvFUWB/7",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:37:48"
  }
}
```

Conclusions:

- outbound availability sync is operational
- Zodomus correctly enforces declared room inventory limits
- HMS must never push availability higher than the quantity declared during `rooms-activation`

### 9. `POST /rates`

Response:

```json
{
  "status": {
    "returnCode": 200,
    "returnMessage": "OK",
    "channelLogId": "UmFuZG9tSVYkc2RlIyh9Yf0c+r9MyekBpHKML4ATIzlmDGaCkvfZUIqNsLayoq+SVBTR78MzKiyNtnSLUdIjkVk3lvFUWB/7",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:38:34"
  }
}
```

Conclusions:

- outbound rate sync is operational
- the selected Booking.com pricing path accepts the tested rate payload
- the room/rate pair is valid for live rate updates

### 10. `POST /reservations-createtest`

Response:

```json
{
  "status": {
    "returnCode": "200",
    "returnMessage": "1 Reservation(s) was created / modified / cancelled. ReservationId=9355237",
    "channelLogId": "jfh46hwytw4shjhdsfuhsdfuhsdfosidfyh463uh23y3ggt23",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:42:37"
  }
}
```

Conclusions:

- test reservation creation is operational
- the real generated reservation ID is `9355237`
- inbound reservation testing can continue with this ID

### 11. `GET /reservations-queue`

Response:

```json
{
  "status": {
    "returnCode": "200",
    "returnMessage": "OK",
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-05 09:43:16"
  },
  "reservations": [
    {
      "id": "9355237",
      "status": 1,
      "date": "2026-05-05"
    }
  ]
}
```

Conclusions:

- inbound reservation queue polling is operational
- reservation `9355237` is available for detail retrieval
- the reservation event is being surfaced correctly by Zodomus

### 12. `GET /reservations`

Response highlights:

- reservation header includes:
  - `id = 9355237`
  - `status = 1`
  - `currencyCode = EUR`
  - `totalPrice = 520`
- customer block is present
- reservation contains **2 rooms**
- room IDs returned:
  - `10001`
  - `10002`
- room reservation IDs returned:
  - `10064750`
  - `10064751`
- room-level `prices[]` include `rateId = 100991`
- room-level arrival/departure dates are present
- add-ons, taxes, guest counts, and extra payment info are also present

Conclusions:

- inbound reservation detail API is operational
- the reservation payload is richer than a simple single-room booking model
- Zodomus reservations can contain multiple rooms under a single reservation ID
- importer design must handle:
  - multi-room reservations
  - room-level dates
  - room-level price totals
  - partial guest/contact fields
  - currency not equal to default HMS currency

## What Is Confirmed Working

The following are confirmed:

- Zodomus credentials are valid enough to access provider APIs
- `channelId 1` is correct for Booking.com
- `propertyId "100"` is a recognized property in Zodomus
- property activation request is accepted
- provider-side room/rate activation works through `POST /rooms-activation`
- property check reaches fully active state
- provider-side mapping completes successfully
- `GET /room-rates` works
- `POST /availability` works when availability stays within declared room quantity
- `POST /rates` works
- `POST /reservations-createtest` works
- `GET /reservations-queue` works
- `GET /reservations` works
- HMS channel mapping assumption `Booking.com -> 1` is correct

## What Is Not Yet Confirmed

The following are still not proven end to end:

- successful HMS import of the reservation payload for this property
- successful replay handling for modified reservations
- successful replay handling for cancelled reservations
- final HMS handling decision for multi-room reservations

## Main Blocker Right Now

Current blocker:

- no setup blocker remains for outbound sync
- the next unvalidated area is inbound reservation flow

## What This Means For HMS

### What HMS is likely doing correctly

- choosing the correct channel ID for Booking.com
- reaching the correct Zodomus endpoints
- progressing to the real onboarding boundary

### What HMS still needs to reflect better

The staff/admin UI should treat these as real connection states:

- activation submitted
- awaiting OTA approval
- provider room/rate mapping required
- active
- remotely disconnected

It should not assume:

- activation success = fully usable connection

### Operational rule discovered from live testing

When using `POST /availability`:

- declared room quantity in `rooms-activation` is the ceiling
- availability higher than declared quantity is rejected by Zodomus

So HMS availability sync must remain consistent with the activated provider-side room quantity.

## Recommended Next Steps

### Next validation phase

Now that setup, outbound sync, and reservation API access are validated, test HMS import behavior:

1. import reservation `9355237` through HMS
2. verify how HMS handles the 2-room payload
3. test replay of the same reservation
4. create a modified reservation event
5. create a cancelled reservation event
6. verify idempotent update/cancel behavior

## Final Assessment

Current integration confidence:

- provider access: confirmed
- channel selection: confirmed
- property recognition: confirmed
- OTA onboarding completion: confirmed
- outbound availability sync: confirmed
- outbound rate sync: confirmed
- reservation API access: confirmed
- HMS reservation import behavior: not yet confirmed

Short conclusion:

For property `100` on Booking.com (`channelId 1`), the Zodomus setup flow, outbound channel-manager operations, and reservation API access are now validated. The remaining unverified area is HMS import behavior for real reservation payloads, especially multi-room reservations and replay/update/cancel handling.
