# Tenant owner activation (Gmail-independent)

`apps/server/src/platform/**` is the sole tenant activation path. It reuses the
tenant root, `tenantUsers`, `tenantSubscriptions`, platform subscription
assignment, prospect, membership audit, Firebase identity, and NexCommand
lifecycle projection. It creates no parallel tenant, identity, subscription,
listing, or authorization model.

## Command and durable fields

`POST /api/platform/admin/prospects/:prospectId/activate` is platform-operator
guarded. Its bounded input is `tenantId?`, `ownerEmail`, and
`ownerDisplayName`. The Firebase owner is passwordless and is created or
reused by email. Existing custom claims are merged with `tenantId`,
`tenantRole`, `tenantUserId`, and `tenantCapabilities`; non-tenant claims are
preserved.

The repository transaction atomically commits the immutable tenant ID, owner
`tenantUsers` profile (including `authUid`), active subscription, active
platform subscription assignment, converted prospect, and
`member.claims_applied` audit. A compatible repeat returns the existing
activation and does not duplicate any durable record.

## Visibility and isolation

Authorized NexCommand operators read the existing `/api/platform/admin/lifecycle`
projection, which joins the owner profile and activation/onboarding status from
the authoritative records and excludes provider failure details. Tenant routes
require an explicit Firebase tenant assignment in production; a platform
operator claim is not a tenant-owner fallback. Cross-tenant requests remain
denied in both directions.

## Quarantined email rail

Gmail/provider configuration, invitation sending, and delivery verification are
outside this contract and unchanged. They remain separately gated.
