DOCUMENT_ID: CODEMAP-TENANT-INTAKE-2026-10-23
TITLE: Tenant Intake, Approval, and Guide Map
DOCUMENT_TYPE: CODE_MAP
STATUS: VERIFIED_LOCAL_CONTRACT
CREATED_AT: 2026-10-23
UPDATED_AT: 2026-10-23
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Codex
PRODUCT_AREA: Platform
MODULES: intake, approval-queue, tenancy, documentation
TENANTS: all
AUDIENCES: developer, operator, tenant administrator, support, future AI
RELATED_COMMITS: pending
RELATED_TESTS: node --import ./tests/setup.mjs --import tsx --test apps/server/test/intake.test.mjs
RELATED_DOCUMENTS: docs/knowledge/tenant-guides/tenant-onboarding-and-approval.md; apps/server/src/intake/README.md
RELATED_LLM_ARTIFACTS: LLM-JOB-NEXTEAM-CALENDAR-20261023
TAGS: code-map, intake, approval, tenant-guide

# Tenant Intake, Approval, and Guide Map

## Change record

| Field | Record |
| --- | --- |
| Reason | Establish the indexed tenant-guide entry required by the knowledge library for the verified onboarding workflow. |
| Before | The knowledge-library index named `tenant-guides/`, but the directory and a guide for the verified onboarding contract were absent. |
| After | A tenant-facing onboarding and approval guide is present and explicitly bounded to local verified behavior. |
| Tenant impact | Informational only. No tenant data, production configuration, external account, publish action, or message is changed. |
| Tests added or changed | None; documentation is derived from the existing intake contract test. |
| Evidence | `receipts/verification/NEXTEAM-CALENDAR-20261023.txt`. |
| Decision | External provisioning remains deferred; native tenant creation requires an approved queue item. |
| Prompt artifact | `LLM-JOB-NEXTEAM-CALENDAR-20261023` in the artifact index. |
| Required tenant documentation | Satisfied by `docs/knowledge/tenant-guides/tenant-onboarding-and-approval.md`. |

## Source map

| Path | Symbol or range | Purpose and behavior | Dependencies and errors |
| --- | --- | --- | --- |
| `apps/server/src/intake/machine.ts` | `intakeMachine`, `intakeStateAfter`, lines 26-50 | Defines interview progression from business questions through plan, approval, and provisioned states. | XState; invalid events do not advance the documented workflow. |
| `apps/server/src/intake/schemas.ts` | `provisioningPlanSchema`, `intakeSessionSchema`, lines 52-94 | Validates intake status, answers, and the generated plan. | Zod validation rejects malformed records. |
| `apps/server/src/intake/service.ts` | `start`, `answer`, `finalize`, `provisionFromApproval`, lines 236-339 | Saves the tenant-scoped session, prepares the plan, queues approval, and creates the native record only after approved execution. | Intake and platform repositories plus ApprovalQueue; missing sessions and invalid plans fail closed. |
| `apps/server/src/intake/approvalExecutor.ts` | `IntakeApprovalExecutor.execute`, lines 18-38 | Enforces intake operation and tenant-target matching before invoking native provisioning. | ApprovalQueue and `IntakeService`; mismatched tenant or plan is rejected. |
| `apps/server/src/intake/routes.ts` | intake routes, lines 33-89 | Exposes start, answer, finalize, read, and list endpoints behind the configured tenant and actor gate. | Express and access context; failures use `RailError`. |
| `apps/server/src/intake/nexiTools.ts` | `createIntakeNexiTools`, lines 16-88 | Provides start, answer, status, and finalize actions to Nexi with actor attribution. | Nexi tool interface and ApprovalQueue; finalization remains queue-only. |
| `apps/server/test/intake.test.mjs` | six tests, lines 54-246 | Proves state progression, approval gating, route behavior, actor attribution, routing, and deterministic answer persistence. | Local in-memory repositories and HTTP server only; not a live-system test. |

## Persistence and authorization contract

Intake sessions are tenant-scoped and are persisted through `FirestoreIntakeRepository` to `intakeSessions`; local tests use `InMemoryIntakeRepository`. The plan enters `ApprovalQueue` before provisioning. The approval executor rejects a request whose tenant target or plan tenant identifier does not match. The resulting native write does not enable external provisioning.

## Rollback

Revert the documentation commit for this record. No application executable, database schema, authorization logic, deployment setting, or tenant record changes in this job.
