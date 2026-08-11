# NexCommand settings and tenant lifecycle contract

Scope: authorized NexTeam platform operators in NexCommand staging. This contract does not create identities, send invitations, expose credentials, or alter production.

## Stored fields

- Platform self-profile: `firstName`, `lastName`, `email`, optional telephone/address/photo reference. `role` and capability overrides are excluded from self-service edits.
- Platform team: internal platform profile role, active/disabled status, and capability overrides. These are distinct from tenant-user roles.
- Tenant lifecycle: `lifecycleState` (`ACTIVE` or `DISABLED_ARCHIVED`), `lifecycleUpdatedAt`, immutable subscription records, and immutable tenant membership audit records.

## Commands

- `PATCH /api/platform/admin/team/me`: save only the signed-in operator's permitted profile fields.
- `PATCH /api/platform/admin/team/:userId`: managed team profile and role updates; capability-gated.
- `POST /api/platform/admin/team/:userId/disable|reactivate`: managed account status changes; capability-gated.
- `POST /api/platform/admin/tenants/:tenantId/subscription/cancel/confirmations`: deliberate cancellation confirmation one.
- `POST /api/platform/admin/tenants/:tenantId/subscription/cancel`: deliberate confirmation two; archives tenant access without deleting its data.
- `POST /api/platform/admin/tenants/:tenantId/subscription/resubscribe`: creates a new immutable subscription and restores the same tenant record.

## Events and UI rules

- Profile and permission updates create platform-user and platform-security audit events.
- Cancellation records `tenant.cancellation_confirmation_one`, then `tenant.subscription_canceled`; resubscribe records `tenant.resubscribed`.
- Lifecycle actions require explicit browser confirmation. The UI exposes a tenant search and lifecycle-state filter.
- The server remains authoritative: authorization, schema validation, idempotency, and tenant data preservation are never delegated to the browser.
