# NexCommand Platform Team Contract

## Boundary

`platformUsers` holds NexTeam personnel profiles only. It is not `tenantUsers`, contains no `tenantId`, and never grants tenant roles or tenant capabilities. Adding a profile requires an already-known Firebase UID but does not call Firebase Admin, create an identity, send an invitation, or send email.

## Fields and redaction

Each profile stores `authUid`, first/last name, email, optional telephone, optional address, optional profile-photo reference, role template, explicit grant/deny capability overrides, `ACTIVE`/`DISABLED` account status, and creation/update attribution. Approved platform templates are Owner, Super Admin, Administrator, Developer, Developer Admin, Support, Sales & Onboarding, Marketing, Finance, and Read Only. Team lists return only name, role, status, photo reference, and update time. A full profile is returned only to its subject or a `platform.team.manage` operator.

Capabilities resolve server-side from the persisted template plus overrides (grant then deny); role labels alone never authorize a request. The verified Firebase platform-operator gate remains mandatory. Disabled platform profiles are denied. For a Firebase UID with one active profile plus legacy disabled duplicate records, server lookup selects the sole active profile; multiple active profiles fail closed until repaired. Existing claim capabilities only provide a controlled bootstrap fallback when no platform profile exists.

## Commands and events

| Command | Capability | Immutable audit event |
| --- | --- | --- |
| `POST /api/platform/admin/team` | `platform.team.manage` | `platform_user.added` |
| `PATCH /api/platform/admin/team/:userId` | `platform.team.manage` | `platform_user.updated` |
| `POST /api/platform/admin/team/:userId/disable` | `platform.team.manage` | `platform_user.disabled` |
| `POST /api/platform/admin/team/:userId/reactivate` | `platform.team.manage` | `platform_user.reactivated` |
| `POST /api/platform/admin/team/:userId/transfer-ownership` | `platform.ownership.manage` | `platform_user.ownership_transferred` |
| `GET /api/platform/admin/team/me` | `platform.profile.self` | none |

All commands require a server-verified platform operator as well as the named capability. NexCommand area routes resolve an explicit capability for dashboard, tenants, prospects, onboarding, migrations, support, integrations, billing, code, security, and settings actions. Tenant ownership and tenant capabilities do not satisfy these gates. Only `platform.ownership.manage` can assign, remove, disable, or transfer an Owner. Production capability is not in any lower-role template and must be explicitly granted.

## Persistence and rollback

Profiles persist in the platform-owned `platformUsers` collection and audits append once to `platformUserAudits`; there is no update/delete audit command. No tenant/customer document is accessed or mutated. Roll back by reverting the Team routes and repository methods; the feature has no Firebase Auth mutation, invitation, email, deployment, or production operation to undo. Retained platform profile/audit records are inert if the routes are removed.
