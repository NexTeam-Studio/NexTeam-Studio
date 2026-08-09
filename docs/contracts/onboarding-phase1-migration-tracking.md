# Onboarding Phase I migration tracking

## Purpose

NexTeam Admin tracks the lifecycle of an onboarding migration without storing source exports, credentials, tokens, or customer records. A migration record is tenant-scoped and platform-operator-only.

## Record

`TenantMigrationRecord` is stored in `platformTenantMigrationRecords` with `tenantId`, `sourceSystem`, a non-sensitive `scope`, lifecycle `status`, audit timestamps/actors, and—only while deferred—a `deferredReason` plus optional review date.

Allowed statuses: `PENDING`, `IN_PROGRESS`, `VALIDATION`, `DEFERRED`, and `COMPLETED`. `DEFERRED` requires a safe deferral reason. `COMPLETED` receives a server timestamp. Deferral details and completion timestamps are cleared when their state no longer applies.

## Commands and events

- `POST /api/platform/admin/tenants/:tenantId/migrations` creates a `PENDING` or safely `DEFERRED` record and returns `migration.created` data.
- `PATCH /api/platform/admin/migrations/:migrationId` changes lifecycle status and returns `migration.status_changed` data.
- `GET /api/platform/admin/migrations?tenantId=` reloads persisted records, scoped by tenant when requested.

Each command requires a platform operator. Tenant users receive authorization denial. The platform overview UI reads, saves, reports errors, and reloads the persisted record.

## Deferral and migration policy

Deferral is a planning decision, not an automated data transfer. The record must describe why work is safely deferred; it never contains a path, credential, export, token, or customer payload. Resuming a deferred migration removes the deferral metadata. No source-system write, import, export, or provider action occurs through this contract.
