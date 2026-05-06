# Improvement Suggestions

This document lists the highest-value next improvements for the HMS across frontend, backend, product depth, and operations.

## 1. Move Navigation To Real Routes

Current navigation is app-state based.

Improve it by using real URL routes such as:

- `/dashboard`
- `/guests`
- `/bookings`
- `/payments`

Benefits:

- better refresh behavior
- browser back/forward support
- direct linking to specific pages
- more scalable frontend structure

## 2. Unify The Design System

The UI is much better now, but not fully consistent yet.

Areas to standardize:

- page header spacing
- panel padding
- table actions
- button sizing
- status color usage
- form section rhythm

Goal:

- make the whole app feel like one system, not a set of individually improved screens

## 3. Make Bookings And Availability More Interactive

Current reservation operations and availability are much better than before, but they can go further.

Possible improvements:

- richer reservation timeline interactions
- better date-grid interaction on availability
- click into day/category detail
- more visual occupancy flow

Goal:

- move from “good admin page” to “strong hotel operations surface”

## 4. Improve Integrations Operations View

The channels page now has sync, background job, webhook, and metrics surfaces.

Next improvements:

- expandable job/sync/webhook detail
- clearer failure drill-down
- retry/replay controls where appropriate
- more visible error grouping

Goal:

- make integrations easier to operate under failure conditions

## 5. Improve Pagination And Filter UX

Filtering works, but it can be made more usable.

Suggested additions:

- reset filters button
- active filter chips
- page-size selector
- clearer total/result count feedback
- maybe saved filter presets later

Goal:

- faster daily use on larger data sets

## 6. Add Toasts And Better Confirmation UX

Current success/error handling works, but can feel plain.

Suggested improvements:

- toast notifications for success/failure
- cleaner destructive confirmations
- more consistent async action feedback

Goal:

- make actions feel more polished and lower-risk for operators

## 7. Improve Empty And Loading States

Some pages still rely on simple text states.

Suggested improvements:

- skeleton loading states
- clearer empty states
- context-aware “what to do next” messaging

Goal:

- better perceived quality and clarity

## 8. Implement Real Provider Adapters

This is still one of the biggest product gaps.

Main targets:

- real channel adapters such as SiteMinder
- real payment providers such as Razorpay or Stripe

Goal:

- move from strong internal platform foundation to true external production integration

## 9. Add Better Operational Guidance On Complex Pages

Some admin screens are operationally dense.

Good targets:

- channels
- pricing rules
- payments

Suggested improvements:

- small contextual cues
- stronger action grouping
- lightweight guidance blocks

Goal:

- make advanced pages easier to explain and use

## 10. Expand Workflow Test Coverage

Core coverage is already solid, but more workflow testing will improve confidence further.

Suggested areas:

- remaining operational edge cases
- frontend-critical workflows
- more integration behavior around async processing

Goal:

- strengthen release confidence and prevent regressions

## Best Priority Split

If choosing by impact:

### Best frontend improvement

- real routing
- stronger design-system consistency

### Best product improvement

- real provider adapters

### Best operations improvement

- better integrations drill-down and retry surfaces
