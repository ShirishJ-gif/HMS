# Frontend Page Surface Spec

## Purpose
This document defines what each frontend page should show, what it should hide, and how the layout should be tightened so the HMS feels operational instead of loose or explanatory.

The current UI has two recurring problems:
- too many low-value panels, repeated explanation blocks, and technical details visible in the primary workflow
- too much unused space caused by wide side rails, oversized page intros, and stacked sections that do not earn their space

The goal is to make every page feel intentional, dense enough for hotel work, and easier to scan.

## Global Rules

### Shared Page Structure
Every page should follow the same structure:
1. compact header
2. optional KPI strip only if it changes decisions on that page
3. compact filters
4. primary work area
5. secondary details only if they support the main task

### Layout Rules
- Avoid large side rails unless they contain at least 2 high-value operational panels.
- Do not keep educational copy on every page. Repeated guidance should move to docs or a small help surface.
- Prefer dense lists and tables for operations pages.
- Use cards only for:
  - repeated stay/task items
  - metric summaries
  - true detail panels
- Do not let one page show both the primary workflow and deep technical/admin diagnostics at the same visual level.

### Audience Split
- Staff-first pages:
  - `Operations Board`
  - `Reservations`
  - `Housekeeping`
  - `Payments`
  - `Availability`
  - `Rooms`
  - `Guests`
- Admin/support pages:
  - `Channels`
  - `Support Console`
  - `Audit Logs`
  - `Property Setup`
  - `Reports`

### Empty-Space Rules
- No page should keep an empty right rail just for visual symmetry.
- If a section has no useful rows, collapse it into an empty-state message instead of reserving full-height space.
- Page subtitles should stay short and operational.
- One page should have one obvious primary job.

## Navigation Structure
- `Overview`
  - `Dashboard`
  - `Reports`
- `Operations`
  - `Operations Board`
  - `Reservations`
  - `Guests`
  - `Rooms`
  - `Housekeeping`
- `Commercial`
  - `Availability`
  - `Property Setup`
- `Finance`
  - `Payments`
- `Integrations`
  - `Channels`
- `Admin`
  - `Support Console`
  - `Audit Logs`

## Page Specs

## Dashboard
### Show
- occupancy
- arrivals today
- departures today
- in-house room count
- open housekeeping task count
- pending balance total
- active reservation group count

### Actions
- no primary mutation action required
- links later can go to `Operations Board`, `Payments`, and `Support Console`

### Hide
- long workflow/runbook blocks
- repeated setup explanation
- generic “how the product works” text

### Layout
- one KPI strip
- one compact attention list
- one compact operating status panel

### Empty-State Rule
- if no operational data exists, show setup-needed counts, not decorative filler

## Operations Board
### Show
- arrivals today
- in-house stays
- departures today
- late arrivals
- room readiness
- housekeeping blockers
- balance due on active grouped stays

### Actions
- `Check in`
- `Send reminder`
- `Check out`

### Hide
- provider metadata
- import trace
- raw external status details unless surfaced as a small badge
- technical copy about OTA ingestion

### Layout
- three working columns:
  - arrivals
  - in house
  - departures
- one compact side rail only for real blockers and short runbook guidance

### Empty-State Rule
- if a column has no stays, show a one-line quiet state

## Reservations
### Show
- reservation groups
- nested room lines
- guest
- property
- external reservation ID
- room category
- dates
- assigned room
- reservation status

### Actions
- expand details
- `Check in`
- `Check out`
- `Send reminder`

### Hide By Default
- provider import trace
- duplicate metadata sections
- repeated “source of truth” explanation

### Layout
- default to ledger/table view
- keep timeline as a secondary tab, not the dominant first view
- details panel should be compact and only expand for the selected reservation

### Empty-State Rule
- show “no imported reservations in current scope” plus filter reset hint

## Guests
### Show
- name
- phone
- email
- property
- ID proof
- address

### Actions
- create guest
- search guest

### Hide
- empty side panels
- long explanatory text

### Layout
- compact create form
- primary guest table beneath it

### Empty-State Rule
- if no guests exist, keep the form visible and collapse the table area into a single message

## Rooms
### Show
- room number
- property
- room category
- room status
- out-of-service windows

### Actions
- create room
- change status
- add out-of-service period
- remove room if permitted

### Hide
- oversized intro copy
- large static help sections

### Layout
- compact room form
- filter bar
- room table
- out-of-service details inline or in row expansion

### Empty-State Rule
- if no rooms exist, prioritize creation flow and show one short empty state

## Housekeeping
### Show
- task status
- priority
- room
- category
- due date
- reservation-room link if present
- notes

### Actions
- create task
- move task to cleaning
- mark clean
- mark inspected
- mark out of service

### Hide
- oversized manual task form on desktop when tasks are the main workflow

### Layout
- task board grouped by status is preferred over one long flat table
- manual task creation should move into a compact drawer/modal later

### Empty-State Rule
- if no tasks exist, show “all clear” and keep quick task creation accessible

## Availability
### Show
- property
- date range
- category inventory
- out-of-service count
- reserved count
- available count
- lowest rate

### Actions
- update date range
- refresh

### Hide
- long instructional copy
- duplicate commercial explanation

### Layout
- compact date strip on top
- category grid or table as the main surface
- any side summary should be narrow and only contain sellable-inventory context

### Empty-State Rule
- if no inventory exists, show missing room/category setup rather than a blank grid

## Property Setup
### Show
- properties
- room categories
- rate plans
- pricing rules
- media

### Actions
- create, edit, enable/disable, delete setup records

### Hide For Staff
- pricing administration and media management if role is staff-only

### Layout
- split into tabs:
  - `Property`
  - `Categories`
  - `Rates`
  - `Pricing`
  - `Media`

### Empty-State Rule
- show setup sequence only when records are actually missing

## Payments
### Show
- invoices
- grouped folios
- outstanding checked-out room stays needing invoice
- collected total
- balance due
- transactions

### Actions
- generate invoice
- generate missing folio invoices
- collect single invoice payment
- collect grouped folio payment

### Hide
- mock-provider explanation copy
- large generic finance side panels that do not change action

### Layout
- keep top cash posture summary compact
- use folio review as an inline detail panel or drawer
- do not stack multiple full-width finance tables unless the selected folio is open

### Empty-State Rule
- if no invoices exist, show whether there are checked-out room stays still waiting for invoice creation

## Channels
### Show
- OTA connection creation
- selected OTA
- Zodomus property ID
- readiness state
- room mappings
- rate mappings
- provider room activation state
- sync health

### Actions
- add OTA connection
- load IDs
- map rooms
- map rates
- activate mapped rooms
- pause
- resume
- disconnect
- remove connection

### Hide From Staff Path
- raw payloads
- provider debug calls
- currencies/account tools
- background jobs and webhook tables in the main setup surface

### Layout
- split into tabs or sections:
  - `Setup`
  - `Mappings`
  - `Sync Health`
  - `Advanced`
- keep `Advanced` collapsed/admin-oriented

### Empty-State Rule
- if no connections exist, show only the OTA connection setup flow

## Reports
### Show
- room nights sold
- occupancy snapshot
- arrivals/departures counts
- billed total
- balance due
- property performance
- OTA/source mix
- channel readiness summary

### Actions
- filter by property
- future: export

### Hide
- operational action buttons
- duplicated support/admin diagnostics

### Layout
- KPI strip on top
- report tables in the main rail
- one small side rail for mix/context only

### Empty-State Rule
- no decorative placeholders; explain which source data is missing

## Support Console
### Show
- unready channels
- failed jobs
- failed webhook events
- connection readiness
- sync posture
- runtime metrics summary

### Actions
- retry dead-letter jobs
- inspect channel connection state

### Hide From Staff
- entire page unless role is admin/super admin

### Layout
- connection health table
- jobs table
- webhook table
- compact side rail for runtime counts and operator priorities

### Empty-State Rule
- if no failures exist, show “healthy” summary rather than empty tables first

## Audit Logs
### Show
- timestamp
- action
- actor
- entity type
- entity ID
- summary
- property scope

### Actions
- search
- action filter
- actor filter

### Hide
- decorative summary tiles if they repeat the filtered list without adding new signal

### Layout
- event stream or dense list
- filters at top
- metadata compact and secondary

### Empty-State Rule
- show “no audit events in current filter window”

## Cleanup Priority
1. `Channels`
2. `Payments`
3. `Operations Board`
4. `Reservations`
5. `Housekeeping`
6. `Reports`
7. `Dashboard`
8. `Rooms`
9. `Guests`
10. `Property Setup`
11. `Audit Logs`

## Acceptance Criteria
- no page keeps a large empty side rail without meaningful content
- no staff-facing page shows provider debug/raw data by default
- every page has one clear primary job
- filters are compact and near the main work area
- long explanatory copy is reduced across the app
- grouped reservations remain the visible reservation model
- grouped folio flow remains visible in `Payments`
- admin/support surfaces remain available without polluting staff workflows

## Notes For Implementation
- This document is a frontend cleanup spec, not a backend change request.
- Existing backend APIs already appear sufficient for most of this work.
- The next frontend pass should prioritize layout compression, information hierarchy, and role-appropriate visibility before adding new features.
