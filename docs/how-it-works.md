# HMS Working Flow

This document explains how the HMS works from an operations point of view. It is meant for product discussion, demos, onboarding, and handoff conversations. It avoids code-level detail.

## What this system is

This HMS is the internal control system for a hotel or hotel group.

It helps the hotel team handle:

- property setup
- room inventory
- guest records
- bookings
- availability
- housekeeping
- billing and payments
- channel connections
- audit and operational tracking

It is mainly a **hotel operations/admin platform**, not a guest-facing booking website.

## Who uses it

Main users:

- `SUPER_ADMIN`
  - sees all properties
  - controls overall setup and oversight
- `ADMIN`
  - manages one hotel/property
  - handles setup, pricing, rooms, channels, payments, and operations
- `STAFF`
  - handles day-to-day front desk and operational tasks inside one hotel/property

## Main working flow

The normal flow is:

1. create the hotel/property
2. create room categories
3. create rate plans
4. optionally add pricing rules
5. add physical rooms
6. optionally add inventory restrictions
7. create guest records
8. create bookings
8. check in guest and assign room
9. check out guest
10. generate invoice and collect payment

Around that core flow, the system also handles:

- availability checking
- centralized inventory calendar and restriction control
- housekeeping tasks
- channel sync activity
- inventory reconciliation and failed-row retry
- notifications
- audit trail

## Property setup flow

This is the commercial and inventory foundation of the hotel.

The admin starts by setting up:

- property name, contact, address, timezone
- room categories such as Deluxe, Suite, Standard
- rate plans such as Flexible, Non-refundable, Weekend plan
- pricing rules such as:
  - weekend surcharge
  - festival/date-range surcharge
  - occupancy-based surcharge
- property and room-category photos

This setup decides what the hotel can sell and at what base structure.

After that, admins can also define selling rules such as:

- stop-sell
- minimum stay
- maximum stay

for specific room categories and date ranges.

Important:

- these restriction rules are enforced inside HMS now
- they are not yet synced outward to Zodomus
- staff should treat them as internal-only controls until provider-side restriction sync is implemented

## Room inventory flow

After categories exist, the hotel adds physical rooms.

Example:

- category: Deluxe
- physical rooms: 301, 302, 303, 304

The system separates:

- **room category**: what is sold commercially
- **physical room**: what is assigned at check-in

This is important because bookings are made against category inventory first, and actual room numbers are assigned later.

The system now also supports **dated room blocks**.

That means operations can mark one physical room as unavailable from one date to another for reasons such as:

- plumbing repair
- deep cleaning
- temporary owner use
- furniture replacement

This is different from the permanent room status `MAINTENANCE`.

- `MAINTENANCE` means the room is broadly unavailable until staff changes the status back
- a dated out-of-service period means the room is unavailable only for the defined dates

The system also maintains a **central inventory calendar** at room-category/date level.

That calendar tracks:

- total rooms
- blocked rooms
- reserved rooms
- available rooms
- stop-sell
- minimum stay
- maximum stay

## Guest flow

Guest records are created before or during reservation handling.

A guest record stores:

- guest name
- phone
- email
- ID proof
- address
- property association

This gives the front desk a guest registry for repeat stays and operational tracking.

## Reservation flow

This is one of the main workflows.

### Step 1: reservation is created or imported

Reservations can enter in two ways:

- direct reservation creation from HMS
- OTA/channel reservation import from Zodomus

For OTA/channel reservation intake:

- property
- guest/contact details
- one reservation header
- one or more reservation-room lines
- arrival and departure dates
- mapped room category and rate plan

The system then:

- validates the dates and mappings
- stores a `ReservationGroup`
- stores one `ReservationRoom` per imported stay line
- reserves room-category inventory

The total is not just a simple base-rate multiplication anymore.

It now uses:

- base nightly rate
- plus any active pricing rules
- across each night of the stay

### Step 2: operations happen on reservation rooms

The imported room line starts with status:

- `BOOKED`

At this stage:

- the reservation room has reserved category inventory
- the guest has not yet been assigned a specific room number

For direct reservations, the system now also allocates room-type inventory transactionally through the same inventory engine used by OTA imports.

## Pricing flow

Pricing starts with a rate plan base rate.

Then the system can adjust the nightly price based on active rules, for example:

- weekend surcharge
- festival or date-range surcharge
- occupancy-based surcharge when demand is high

The system calculates the final reservation total from nightly prices, not just one flat base amount.

This makes pricing more realistic for hotel operations.

## Availability flow

The availability screen is used to understand what can still be sold.

The user selects:

- property
- from date
- to date

The system then shows:

- total inventory by room category
- already booked inventory
- out-of-service rooms
- restriction rules such as stop-sell, minimum stay, and maximum stay

At the moment, the availability screen shows those restrictions clearly, but they remain HMS-only rules. OTA/channel selling behavior only reflects them after outbound restriction sync is implemented.
- remaining sellable inventory
- starting rate
- active stop-sell / min-stay / max-stay rules in the inventory calendar

This helps the hotel team decide:

- whether they can accept more bookings
- which categories are tight
- what pricing pressure exists
- which dates are commercially closed or constrained

Out-of-service counts now come from two sources:

- rooms whose current status is `MAINTENANCE`
- rooms that have a dated out-of-service period overlapping the selected window

For connected OTA/channel flows, HMS now also turns that availability truth into daily provider inventory rows. If a provider accepts some room/date rows and rejects others, operators can see the exact failed rows and retry only those failures instead of resending the whole sync window.

The Availability page now also lets admins add selling restrictions directly for a room type and date range.

## Check-in flow

When the guest arrives, staff checks the guest in.

At check-in, the system:

- finds an available physical room in the booked category
- assigns that room to the booking
- marks the booking as:
  - `CHECKED_IN`
- marks the room as:
  - `OCCUPIED`

This is the point where the reservation becomes a real stay in a real room.

## Check-out flow

When the guest leaves, staff checks the guest out.

The system then:

- marks the booking as:
  - `CHECKED_OUT`
- marks the room back to:
  - `AVAILABLE`
- ensures a billing record exists for the booking

This closes the stay operationally.

## Billing and payment flow

After or around checkout, the billing and payment flow is used.

### Billing

The system creates one invoice per reservation room.

The invoice can include:

- reservation-room amount
- tax
- extra charges

### Payment collection

Payments are then collected against the invoice.

The system tracks:

- total invoiced
- total paid
- refunded amount
- remaining balance

Payment state can become:

- pending
- partial
- paid
- refunded

This gives a clean operational picture of what is still due.

## Housekeeping flow

Housekeeping tasks are used to track room readiness.

Rooms can move through operational cleaning states such as:

- dirty
- cleaning
- clean
- inspected
- out of service

This helps hotel staff know:

- which rooms are ready
- which rooms still need attention
- which rooms should not be sold

## Channel manager flow

For Zodomus-style channel management, HMS is the operational source of truth.

The working loop is:

1. HMS imports reservations from the provider
2. HMS recalculates inventory from physical rooms, maintenance state, and active room stays
3. HMS pushes daily availability outward
4. HMS records room/date-level push outcomes
5. Operators reconcile drift and retry only failed rows when needed

This makes the channel flow operationally safer than a blind “push everything and hope” model.

The channel section is the integration control area.

It allows the hotel team to:

- create a channel connection
- map internal room categories to external room IDs
- map internal rate plans to external rate IDs
- trigger manual syncs

The current system supports the operational flow and sync tracking, but real live provider adapters still depend on provider-specific credentials and implementation.

Operationally, the page now also shows:

- sync activity
- background jobs
- webhook events
- retry state
- monitoring snapshot

So it acts like an integrations command center.

## Notifications flow

The system can send operational WhatsApp-style notifications such as:

- booking confirmation
- owner notification
- check-in reminder

These are queued and processed in the background rather than blocking the user’s action.

Operationally that means:

- booking creation feels faster
- failed sends can be retried
- delivery issues are easier to track

## Audit flow

The audit log is the operational history of sensitive actions.

It records things like:

- booking creation
- check-in
- checkout
- room changes
- payment actions
- channel actions

This helps answer questions like:

- who changed this?
- when did it happen?
- what action was taken?

It is useful for accountability and troubleshooting.

## Monitoring and queue flow

Some actions do not finish fully inside the user request anymore.

Instead, the system queues background work for:

- webhook processing
- channel sync processing
- notification sending

This means the system is now closer to real operations behavior:

- user action is accepted
- background worker processes the next step
- failures can retry
- dead-letter cases can be reviewed and retried manually

## What this system is not yet

Important product boundary:

- this is not yet a public booking website for guests
- it is not yet a fully live production channel stack with real provider adapters completed

Right now it is best understood as:

- a strong hotel operations/admin system
- with internal workflow control
- with integration foundations in place

## How to explain it simply

If you need to explain it to another person in one short summary:

> This system runs the hotel’s internal operations. First the hotel sets up categories, prices, and rooms. Then staff create guests and bookings, check guests in and out, handle invoices and payments, track housekeeping, monitor availability, and manage channel sync activity from one admin platform.

## Best demo order

If you are showing this to someone, the cleanest order is:

1. Dashboard
2. Property Setup
3. Rooms
4. Guests
5. Bookings
6. Availability
7. Housekeeping
8. Payments
9. Channels
10. Audit Logs

That gives a natural story from setup to operations to oversight.
