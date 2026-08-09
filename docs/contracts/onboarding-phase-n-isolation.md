# Onboarding Phase N tenant and admin isolation

Phase N proves that the internal onboarding lifecycle remains isolated between tenants and cannot be administered by a tenant user.

## Authorization boundary

All `/api/platform/admin/*` onboarding commands require a Firebase platform-operator claim, role, or configured allow-list. A signed-in tenant user is denied with `403`; authentication alone is not sufficient. The authoritative implementation is `apps/server/src/platform/routes.ts` (`requirePlatformOperator` and `requirePlatformSupportOperator`).

The route-level proof is `apps/server/test/platform.test.mjs`:

- `onboarding-plan insights and revision acceptance require a platform operator` verifies that a tenant owner receives `403` while an operator can read insights and accept a revision.
- `tenant blockers persist by tenant and platform support escalation denies non-operators` verifies operator-only lifecycle mutation and that tenant-A records are not returned for tenant B.
- `tenant migration records persist status and require an operator plus a safe deferral reason` verifies the same tenant-filtered reload behavior for migrations.
- `Phase M runs isolated onboarding from prospect through activation and persisted operator follow-up` verifies a tenant user is denied before prospect creation and that the activated owner receives the new tenant claim without removing the pre-existing platform-operator claim.

## Persistence boundary

Tenant-owned Admin SDK documents are written through the transactional `setTenantOwnedDocument` seam in `apps/server/src/core/tenantOwnedWrite.ts`. Existing documents are read in the same transaction and their `tenantId` must match the caller-selected tenant before a write proceeds. The seam rejects a cross-tenant overwrite with a conflict and leaves the original document unchanged.

The authoritative emulator proof is `apps/server/test/admin-tenant-isolation.emulator.test.mjs`, run through `npm run test:admin-tenant-isolation:emulator`. It uses a local Firestore emulator and verifies cross-tenant denial for the shared write seam, approval records, CRM quotes, tenant users, and field-document folders, including failed read, update, overwrite, and delete paths.

## Non-production boundary

The Phase N proof uses only the in-memory platform repository, a fake Firebase owner-activation seam, and the local Firestore emulator. It does not contact Firebase production, modify rules, deploy, send communications, migrate customer data, or handle credentials.
