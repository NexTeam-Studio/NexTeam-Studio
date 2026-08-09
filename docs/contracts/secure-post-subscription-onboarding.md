# Secure post-subscription onboarding

Tenant-scoped post-subscription onboarding is persisted in the existing `crmSettings` document at `operatingProfile.onboarding.checklist`.

## Fields

- `tasks[]`: fixed server-owned task identifiers, labels, required flag, status, assignee, and completion time.
- `auditHistory[]`: server-authored event records (`task.claimed`, `task.status_changed`, `task.reassigned`) with actor, task, detail, and timestamp.

## Commands

`PATCH /api/crm/settings` accepts one `onboardingCommand` with the tenant id:

- `claim` — `{ action: "claim", taskId }`
- `set-status` — `{ action: "set-status", taskId, status }`
- `reassign` — `{ action: "reassign", taskId, ownerUserId }`

The route enforces office access, validates reassignment targets as active users in the same tenant, prevents skipping required tasks, and appends audit records server-side. Raw task and audit-history replacement is not accepted.

## Events

Each accepted command persists the changed checklist and one audit event atomically in the same tenant settings save. UI progress is the completed-required-task count divided by the required-task count; optional tasks never reduce required completion.

## Phase J launch gate and module entitlement

`GET` and `PATCH /api/crm/settings` return `onboardingLaunch`: a derived, non-persistent readiness result containing `ready`, human-readable unmet `reasons`, and the subscription-backed `availableModules` list. The server derives available modules from the tenant plan; module choices outside that list are rejected and are not shown as selectable in the settings UI.

Launch review cannot be completed until every required checklist task is `complete`, at least one allowed module is selected, all guided steps are in order, and a launch-review timestamp is supplied. The same criteria are recalculated after every save so a reload reports the persisted launch state. This is an onboarding configuration gate; it does not replace the existing route and tool plan-entitlement enforcement.
