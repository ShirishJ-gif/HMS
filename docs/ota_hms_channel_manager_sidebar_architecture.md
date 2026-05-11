# OTA-Only HMS + Channel Manager System Structure

## Overview

This system is an OTA-only centralized HMS/PMS + Channel Manager platform connected with Zodomus APIs.

Important:
- Guests cannot book directly from this platform.
- All bookings come from OTAs via Zodomus webhooks.
- The HMS database is the source of truth.
- Zodomus is used for OTA distribution and synchronization.

---

# Recommended Sidebar Structure

```ts
const pages: Array<{
  id: Page;
  label: string;
  section: string;
  icon: SidebarIconName;
}> = [

  // =========================
  // OVERVIEW
  // =========================
  { id: 'dashboard', label: 'Dashboard', section: 'Overview', icon: 'dashboard' },

  { id: 'reports', label: 'Reports & Analytics', section: 'Overview', icon: 'clipboard' },

  // =========================
  // OPERATIONS
  // =========================
  { id: 'operations', label: 'Operations Board', section: 'Operations', icon: 'pulse' },

  { id: 'bookings', label: 'Reservations', section: 'Operations', icon: 'calendar' },

  { id: 'guests', label: 'Guests', section: 'Operations', icon: 'guest' },

  { id: 'rooms', label: 'Rooms & Inventory', section: 'Operations', icon: 'bed' },

  { id: 'housekeeping', label: 'Housekeeping', section: 'Operations', icon: 'sparkles' },

  // =========================
  // COMMERCIAL
  // =========================
  { id: 'availability', label: 'Availability & Rates', section: 'Commercial', icon: 'chart' },

  { id: 'ratePlans', label: 'Rate Plans', section: 'Commercial', icon: 'wallet' },

  { id: 'mapping', label: 'OTA Mapping', section: 'Commercial', icon: 'puzzle' },

  { id: 'setup', label: 'Property Setup', section: 'Commercial', icon: 'settings' },

  // =========================
  // FINANCE
  // =========================
  { id: 'payments', label: 'Payments & Folios', section: 'Finance', icon: 'wallet' },

  // =========================
  // INTEGRATIONS
  // =========================
  { id: 'channels', label: 'Channel Manager', section: 'Integrations', icon: 'puzzle' },

  { id: 'webhooks', label: 'Webhooks & Sync Logs', section: 'Integrations', icon: 'activity' },

  // =========================
  // ADMIN
  // =========================
  { id: 'support', label: 'Support Console', section: 'Admin', icon: 'activity' },

  { id: 'audit', label: 'Audit Logs', section: 'Admin', icon: 'shield' },

];
```

---

# Dashboard

## Purpose
Central overview of hotel operations and OTA synchronization.

## Features
- Occupancy %
- Total reservations
- OTA booking count
- Revenue overview
- Failed sync alerts
- Pending check-ins
- Pending check-outs
- Room status summary
- Channel sync health
- Recent reservations
- Inventory alerts

## Widgets
- Occupancy chart
- Revenue graph
- OTA booking trends
- Channel sync monitor

---

# Reports & Analytics

## Purpose
Business intelligence and hotel performance monitoring.

## Features
- Revenue reports
- Occupancy reports
- OTA performance
- Cancellation trends
- ADR (Average Daily Rate)
- RevPAR
- Daily audit reports
- Channel-wise revenue
- Booking trends

## Filters
- Date range
- OTA/channel
- Property
- Room type

## Export Options
- PDF
- Excel
- CSV

---

# Operations Board

## Purpose
Real-time operational mission control.

## Features
- Arrivals today
- Departures today
- In-house guests
- Dirty rooms
- Maintenance rooms
- Overbooking alerts
- Failed OTA syncs
- Reservation activity feed
- Front desk alerts

---

# Reservations

## Purpose
Manage all OTA reservations received through Zodomus.

## Features
- All reservations
- OTA source badge
- Reservation timeline
- Check-in/check-out
- Modify reservation
- Cancel reservation
- Assign room
- Guest details
- Reservation notes
- Payment status
- Reservation history

## Reservation Statuses
- Confirmed
- Checked In
- Checked Out
- Cancelled
- No Show

## Filters
- Date
- OTA
- Status
- Guest name
- Room type

---

# Guests

## Purpose
Central guest profile management.

## Features
- Guest profiles
- Stay history
- OTA source tracking
- Guest preferences
- Identity documents
- VIP tagging
- Notes
- Blacklist management

---

# Rooms & Inventory

## Purpose
Central inventory and room management.

## Sub-tabs
1. Room Types
2. Physical Rooms
3. Inventory Calendar
4. Room Blocks
5. Maintenance

## Features
- Room type management
- Physical room management
- Inventory availability calendar
- Block rooms
- Maintenance tracking
- Occupancy tracking
- Inventory override
- Availability calculations

## Important Concepts
- Room Types are sellable OTA categories.
- Physical Rooms are actual hotel rooms.
- OTAs only see room types.
- Physical rooms are assigned later.

---

# Housekeeping

## Purpose
Manage room cleaning and maintenance operations.

## Features
- Room cleaning status
- Assign housekeeping staff
- Dirty/clean tracking
- Inspection workflow
- Maintenance alerts
- Cleaning history

## Room Statuses
- Clean
- Dirty
- Inspected
- Maintenance

---

# Availability & Rates

## Purpose
Core channel manager inventory and pricing control.

## Features
- Inventory calendar
- Availability by date
- Bulk inventory updates
- Restrictions management
- Stop sell
- Min/max stay rules
- CTA/CTD rules
- Rate calendar
- Occupancy-based pricing

## Sync Triggers
- OTA booking received
- Reservation cancellation
- Inventory block
- Manual sync
- Scheduled sync job

---

# Rate Plans

## Purpose
Manage hotel pricing strategies.

## Features
- BAR (Best Available Rate)
- Non-refundable rates
- Breakfast included rates
- Seasonal pricing
- Weekend pricing
- Occupancy pricing
- Corporate pricing
- Dynamic pricing

## Restrictions
- Minimum stay
- Maximum stay
- Stop sell
- CTA/CTD

---

# OTA Mapping

## Purpose
Map internal entities to Zodomus/OTA entities.

## Features
- Property mapping
- Room type mapping
- Rate plan mapping
- Channel-specific mapping
- Sync validation
- Mapping health check

## Example Mapping

```text
Internal Deluxe Room
↓
Booking.com DLX123
↓
Expedia EXP_DL
↓
Agoda AG_DELUXE
```

## Important Rules
- OTAs map to room types only.
- Physical rooms are never mapped directly.
- Rate plans are mapped separately.

---

# Property Setup

## Purpose
Configure hotel-level settings.

## Features
- Hotel profile
- Taxes
- Amenities
- Policies
- Check-in/check-out timings
- Currency
- Timezone
- Invoice settings
- Email templates
- WhatsApp templates

---

# Payments & Folios

## Purpose
Track financial operations.

## Features
- Payment status
- OTA collect / Hotel collect
- Invoices
- Refunds
- Folios
- GST invoices
- Pending dues
- Payment history

## Payment Methods
- Cash
- Card
- UPI
- Bank transfer
- OTA collect
- Hotel collect

---

# Channel Manager

## Purpose
Central Zodomus integration and OTA sync management.

## Features
- Connected channels
- Sync status
- Last sync time
- Manual sync
- Retry failed sync
- Channel health monitor
- Inventory sync
- Rate sync
- Restrictions sync

## Supported Channels
- Booking.com
- Expedia
- Agoda
- Airbnb
- Others via Zodomus

---

# Webhooks & Sync Logs

## Purpose
Production debugging and monitoring.

## Features
- Incoming webhook payloads
- Raw JSON viewer
- Failed sync logs
- Retry sync
- API request logs
- API response logs
- Webhook processing status
- Error messages
- Sync timing

## Important
This will be one of the most important tabs during development and production.

---

# Support Console

## Purpose
Internal operational support tools.

## Features
- Issue tracking
- OTA sync troubleshooting
- Force inventory resync
- Reservation repair tools
- Manual sync repair
- Debug tools

---

# Audit Logs

## Purpose
Track system and user activity.

## Features
- User activity logs
- Inventory changes
- Rate changes
- Reservation modifications
- Login history
- API actions
- Mapping changes

## Important
Critical for hotel systems and production debugging.

---

# Most Important Modules for MVP

Build these first:

1. Reservations
2. Availability & Rates
3. OTA Mapping
4. Channel Manager
5. Webhooks & Sync Logs
6. Rooms & Inventory
7. Dashboard
8. Property Setup

These are the core modules required for a working OTA-only centralized HMS + Channel Manager platform.

---

# Core System Flows

## Reservation Flow
OTA Booking
→ Zodomus webhook
→ Reservation created
→ Inventory reduced
→ Sync availability to all OTAs
→ Assign physical room later
→ Check-in
→ Checkout

---

## Inventory Flow
Inventory changes
→ Central database updates
→ Sync engine triggers
→ Push updates to Zodomus
→ Zodomus distributes to OTAs

---

## OTA Mapping Flow
Internal room type
→ OTA room ID mapping
→ OTA rate plan mapping
→ Sync enabled

---

## Webhook Flow
OTA booking received
→ Save raw webhook
→ Validate payload
→ Process reservation
→ Reduce inventory
→ Sync all channels
→ Log processing result

---

# Important Architecture Rules

- HMS database is the source of truth.
- Zodomus is only a sync/distribution layer.
- Always save raw webhook payloads.
- Always use idempotency for webhooks.
- Never assign physical rooms directly from OTAs.
- OTA bookings reserve room types, not physical rooms.
- Inventory must always be transaction-safe.
- After every inventory-changing event, sync availability to Zodomus.
