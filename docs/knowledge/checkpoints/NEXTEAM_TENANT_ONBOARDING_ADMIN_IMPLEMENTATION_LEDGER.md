# NexTeam Tenant Onboarding and Admin Implementation Ledger

## Wave

- Job: `NEXTEAM-TENANT-ONBOARDING-ADMIN-AUTONOMOUS-BUILD`
- Boundary: Ready for Chris end-user onboarding test
- Integration worktree: `target-architecture-integration`
- Active component owner: `platform-tenants`

## Active-wave operating rule

- This authorized build stays active until its stated green-gate or genuine human-blocker boundary.
- A status request does not cancel, pause, or replace the work order.
- After every green phase, dispatch the next authorized phase automatically. Missing, failed, skipped, contradictory, or timed-out proof is red and must be repaired before advancement.
- Do not describe a phase as active unless an actual job is executing or an evidence-backed active-job record proves it is running.

## Phase ledger

| Phase | Status | Owner | Evidence / next requirement |
| --- | --- | --- | --- |
| A — inventory and ownership | GREEN | platform-tenants + integration | Existing platform repository/routes/UI, Firebase tenant-user contract, tenant settings onboarding, and capability guards were inspected. Extend these authoritative paths; do not create a second tenant or subscription system. |
| B — prospect, intake, Blueprint contracts | GREEN | platform-tenants + integration | Shared non-sensitive Prospect, intake/software-inventory, Blueprint, and append-only Blueprint revision contracts are persisted through the platform repository. Targeted server build, 15 platform tests, scope, and coverage checks passed on 2026-08-09. |
| C — NexTeam Admin foundation | GREEN | platform-tenants | The existing platform console is explicitly NexTeam Admin. Its lifecycle summary API is platform-operator guarded, never tenant-role guarded; it compiles and is exercised in the platform route suite. |
| D — manual intake and Blueprint UI | GREEN | platform-tenants | NexTeam Admin now has an operator-facing manual form that creates a Prospect, saves the same non-sensitive intake contract, creates a Blueprint, and appends its first immutable revision. Server route suite and web build passed on 2026-08-09. |
| E — required test subscription | GREEN | platform-tenants | The active `all-access-test` package is versioned, $0.00, all-access, and must be assigned durably to an onboarding-plan-ready Prospect before activation. Full `npm run verify` passed on 2026-08-09 after platform-owned writes were moved behind the approved transaction seam. |
| F — tenant and owner activation | GREEN | platform-tenants + nexteam-global | Activation requires the durable assigned $0 test package, creates the existing tenant, subscription, and tenant-user records, then creates or reuses the Firebase owner without a password. Tenant-specific claims merge into existing claims and preserve platform claims. Full test suite passed: 489 pass, 0 fail, 3 skipped on 2026-08-09. Firebase runtime activation remains built / not operationally proven until staging-safe credentials and tenant test data are used. |
| G–O | NOT STARTED | assigned per phase | Advance only after the preceding phase has captured green evidence. |

## Authoritative existing ownership

## Phase H contract

- `TenantBlocker` is tenant-scoped by `tenantId`; it records only non-secret operational blockers with a lifecycle of `OPEN`, `ESCALATED`, or `RESOLVED`.
- `PlatformSupportEscalation` is linked to exactly one blocker for the same tenant. It is platform-operator-only and has a lifecycle of `OPEN`, `ACKNOWLEDGED`, or `RESOLVED`.
- Commands: create/list/update a blocker; create/list/update a linked escalation. Events: `tenant_blocker.created`, `tenant_blocker.status_changed`, `platform_support_escalation.created`, and `platform_support_escalation.status_changed`.
- Routes reject non-platform operators; repository validation rejects mismatched tenant/blocker links. No credentials, provider tokens, or payment data belong in either record.

## Phase K contract

- Onboarding-plan insights are deterministic, read-only recommendations calculated from a durable Blueprint, its latest immutable revision, and the non-sensitive Prospect intake. They cannot change a plan, configure a module, activate a tenant, or call a provider.
- Commands: list Blueprint revisions; read recommendation-only insights; accept the latest DRAFT revision with an operator-supplied reason. Acceptance appends an immutable `APPROVED` revision whose snapshot matches the accepted draft; it never mutates the draft record.
- Event records: reading insights produces no persisted event because it is side-effect-free; an accepted revision is the durable, append-only `onboarding_plan.revision_accepted` record. All three routes require a platform operator. No credentials, payment information, or customer data is accepted.

| Domain | Existing authoritative implementation | Build direction |
| --- | --- | --- |
| Platform tenant administration | `apps/server/src/platform/**`; `apps/web/src/features/platform/**` | Extend in the platform-tenants lane. |
| Tenant users, roles, capabilities | platform repository/routes and Firebase auth guards | Reuse; activation must create the existing tenant-user linkage. |
| Tenant configuration and current guided settings onboarding | NexOps settings and tenant configuration contracts | Keep onboarding configuration in the existing durable tenant record path. |
| Firebase auth | shared web auth plus server admin-auth guards | Reuse secure invitation/password-reset mechanisms; no plaintext passwords. |
| Tenant audit | platform membership audits and existing tenant-scoped persistence | Extend with immutable onboarding and Blueprint revisions. |
| Assistant intake | Nexi runtime | Consume the shared intake contract after manual intake is operational. |

## Phase A gaps confirmed

- No unified durable prospect/intake/Blueprint lifecycle contract is present.
- Existing subscription support is tenant-oriented but does not yet provide the required package-selection activation gate.
- Existing platform administration is tenant-management oriented; it lacks the complete internal prospect, Blueprint, onboarding, migration, support-blocker, and integration-health workflow.
- Existing tenant onboarding settings must be connected to the activation lifecycle, not duplicated.
