# HMS Docs Index

Use this file as the documentation entry point.

The repo now has three documentation buckets:

1. Canonical current docs
2. Historical reference docs
3. Archived docs

## 1. Canonical Current Docs

These describe the current reservation-centric system and should be treated as the primary source of truth.

- [README.md](/Users/cronberry/Hms/README.md)
- [PROJECT_CONTEXT.md](/Users/cronberry/Hms/PROJECT_CONTEXT.md)
- [ai-handoff.md](/Users/cronberry/Hms/docs/ai-handoff.md)
- [implemented-features.md](/Users/cronberry/Hms/docs/implemented-features.md)
- [how-it-works.md](/Users/cronberry/Hms/docs/how-it-works.md)
- [production-readiness.md](/Users/cronberry/Hms/docs/production-readiness.md)
- [api-examples.http](/Users/cronberry/Hms/docs/api-examples.http)
- [metrics-alerting.md](/Users/cronberry/Hms/docs/metrics-alerting.md)
- [legacy-booking-migration-validation.md](/Users/cronberry/Hms/docs/legacy-booking-migration-validation.md)
- [ConnectionLifecycle.md](/Users/cronberry/Hms/docs/ConnectionLifecycle.md)
- [zodomus-env-profiles.md](/Users/cronberry/Hms/docs/zodomus-env-profiles.md)
- [zodomus-safe-testing-runbook.md](/Users/cronberry/Hms/docs/zodomus-safe-testing-runbook.md)
- [zodomus-api-webhook-reference.md](/Users/cronberry/Hms/docs/zodomus-api-webhook-reference.md)
- [zodomus-test-production-flow-comparison.md](/Users/cronberry/Hms/docs/zodomus-test-production-flow-comparison.md)
- [zodomus-inventory-import-issue.md](/Users/cronberry/Hms/docs/zodomus-inventory-import-issue.md)

## 2. Historical Reference Docs

These are still useful, but they should be read as design history, validation history, or provider-specific reference material. They are not the canonical system description.

- [validations.md](/Users/cronberry/Hms/docs/validations.md)
- [zodomus-postman-collection.json](/Users/cronberry/Hms/docs/zodomus-postman-collection.json)
- [app-api-tokens.md](/Users/cronberry/Hms/docs/app-api-tokens.md)

## 3. Archived Docs

These no longer match the active reservation-centric system closely enough to keep them in the main docs set. Use them only for legacy context or implementation history.

- [archive/schema.md](/Users/cronberry/Hms/docs/archive/schema.md)
- [archive/plan.md](/Users/cronberry/Hms/docs/archive/plan.md)
- [archive/postman-collection.json](/Users/cronberry/Hms/docs/archive/postman-collection.json)
- [archive/flaws_backend.md](/Users/cronberry/Hms/docs/archive/flaws_backend.md)
- [archive/flaws-frontend.md](/Users/cronberry/Hms/docs/archive/flaws-frontend.md)
- [archive/improvement-suggestions.md](/Users/cronberry/Hms/docs/archive/improvement-suggestions.md)
- [archive/provider-adapters-plan.md](/Users/cronberry/Hms/docs/archive/provider-adapters-plan.md)
- [archive/reservation-group-centric-plan.md](/Users/cronberry/Hms/docs/archive/reservation-group-centric-plan.md)
- [archive/centralized-hms-zodomus-usage.md](/Users/cronberry/Hms/docs/archive/centralized-hms-zodomus-usage.md)
- [archive/zodomus-api-implementation-plan.md](/Users/cronberry/Hms/docs/archive/zodomus-api-implementation-plan.md)
- [archive/zodomus-channel-manager-flow.md](/Users/cronberry/Hms/docs/archive/zodomus-channel-manager-flow.md)
- [archive/zodomus-reservation-import-discussion.md](/Users/cronberry/Hms/docs/archive/zodomus-reservation-import-discussion.md)
- [archive/zodomus-validation-findings.md](/Users/cronberry/Hms/docs/archive/zodomus-validation-findings.md)

## Usage Rule

When updating docs:

- update canonical current docs first
- keep historical docs clearly framed as reference/history
- do not move canonical docs into `docs/archive/` just because they are provider-specific
- do not reintroduce legacy direct-booking behavior into canonical docs
