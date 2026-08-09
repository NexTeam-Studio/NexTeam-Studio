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
