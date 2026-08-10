DOCUMENT_ID: CODEMAP-NEXCOMMAND-FOUNDATION-PHASE-D-20260810
STATUS: GREEN_LOCAL_VALIDATED
PRODUCT_AREA: NexCommand Roles and Capabilities

# NexCommand Foundation Phase D

`apps/server/src/platform/team.ts` defines the ten approved platform role templates and their explicit capability catalog. `PlatformUser.capabilityOverrides` persists additive grants and explicit denies; `resolvePlatformCapabilities` is the sole server-side aggregation point. `routes.ts` first verifies the existing Firebase platform-operator boundary, then resolves the persisted active profile and required route capability. Tenant roles are never consulted.

Owner assignment, removal, disablement, and transfer are additionally protected by `platform.ownership.manage`; the transfer route moves the previous owner to Super Admin and appends immutable audits for both records. Sensitive contact fields remain redacted in list/non-manager reads.

Rollback: revert the Phase D Team schema/routes and capability guard together. The retained platform-only profile/audit records are inert without these routes; no Firebase Auth, tenant, customer, payment, browser, or production resource is changed.
