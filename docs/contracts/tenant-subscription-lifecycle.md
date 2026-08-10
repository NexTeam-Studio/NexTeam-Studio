# Tenant subscription lifecycle

`apps/server/src/platform/**` is the authoritative tenant activation and subscription path. It reuses the existing tenant root, `tenantUsers`, `tenantSubscriptions`, Firebase owner claims, and `tenantMembershipAudits`; it does not create a second activation, audit, or access-control system.

## Durable records

- The permanent tenant ID remains `Tenant.id`. Its server-owned `lifecycleState` is `ACTIVE` or `DISABLED_ARCHIVED`.
- Every `TenantSubscription` is immutable. `tenantSubscriptions` is append-only, and a resubscription creates a new `sub_*` ID for the same `tenantId`.
- Existing `tenantMembershipAudits` append `tenant.cancellation_confirmation_one`, `tenant.subscription_canceled`, and `tenant.resubscribed`. Each has a correlation ID; the resubscription event also records its new subscription ID.
- Tenant users, owner Firebase UID linkage, settings/configuration, documents, transactions, and prior audits are never deleted or reassigned by this lifecycle.

## Commands and events

1. `POST /api/platform/tenants/:tenantId/subscription/cancel/confirmations` requires an active stored `OWNER`, the exact first confirmation value, and a caller-supplied idempotency key. It records only the first confirmation and returns `cancellationId`.
2. `POST /api/platform/tenants/:tenantId/subscription/cancel` requires the same owner, a matching first confirmation, the exact second confirmation value, and an idempotency key. It archives the same tenant and appends the cancellation audit. Repeats return the completed state without a second archive event.
3. `POST /api/platform/tenants/:tenantId/subscription/resubscribe` requires the active stored owner, the exact confirmation value, and an idempotency key. It appends a new immutable active subscription, restores `ACTIVE`, and preserves the same owner/profile/data linkage. A repeat with the same key returns the same subscription.

Production `requireAccessContext` checks the authoritative tenant root after Firebase token verification. A tenant member with a disabled/archived tenant is denied server-side even if their Firebase token predates cancellation; platform operators retain platform administration. Firestore direct tenant reads/writes use the same active-lifecycle rule while preserving legacy roots with no lifecycle field.

## Regression proof

`apps/server/test/platform.test.mjs` covers two deliberate confirmations, duplicate cancel/resubscribe idempotency, disabled access denial, retained tenant/user/branding/usage data, immutable new subscription ID, same tenant ID, restored owner linkage, and tenant-A/tenant-B isolation in both directions. Existing P0 Firestore and admin-isolation suites remain required gates.
