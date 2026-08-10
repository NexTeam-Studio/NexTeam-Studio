DOCUMENT_ID: NEXCOMMAND-FOUNDATION-LEDGER-20260810
TITLE: NexCommand Foundation Implementation Ledger
DOCUMENT_TYPE: ARCHITECTURE_RECORD
STATUS: PHASE_E_GREEN
CREATED_AT: 2026-08-10
UPDATED_AT: 2026-08-10
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Codex
PRODUCT_AREA: NexCommand Foundation
MODULES: platform, authorization, routing, controller-status, module-registry
TENANTS: all
RELATED_TESTS: apps/server/test/nexcommand-foundation-registry.test.mjs; apps/server/test/live-build-status.test.mjs; apps/server/test/platform.test.mjs; apps/web/src/features/platformOverview/routes/NexCommandRoute.test.mjs
RELATED_DOCUMENTS: docs/knowledge/code-maps/2026-08-10-nexcommand-foundation-phase-a.md; docs/knowledge/code-maps/2026-08-10-nexcommand-foundation-phase-b.md; docs/knowledge/operations/NEXCOMMAND_ADMIN_CONSOLE.md; receipts/security/NEXTEAM-P0-INDEPENDENT-VALIDATION-20260810.md; docs/worktrees/README.md
RELATED_LLM_ARTIFACTS: JOB-NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-A-20260810; JOB-NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-B-20260810
TAGS: nexcommand, foundation, phase-d, ownership, controller, relay, security, platform-team, session-security

# NexCommand Foundation Implementation Ledger

## Current authoritative phase count

As of 2026-08-10, Phases **A, B, C, and D** are independently GREEN.
That is **4 of 15 Foundation phases: 26.7% verified complete**. Phase E is
IN PROGRESS and is not included in the verified count until its complete gate
evidence is captured. This entry supersedes the stale Phase C-only status above.

## Phase E measurable gate

Phase E progress is measured as verified outcomes out of these ten required
substeps; implementation activity alone does not increase the count.

| # | Required outcome | Status |
| --- | --- | --- |
| 1 | Fifteen-minute idle timeout | VERIFIED — server invalidates at `900000ms`. |
| 2 | Fresh authentication after browser/session close | VERIFIED — token is session-storage-only; absent token denies route. |
| 3 | Explicit logout invalidates the session | VERIFIED — server invalidation plus Firebase sign-out. |
| 4 | Failed login and session lifecycle events are audited | VERIFIED — immutable, redacted platform security audits. |
| 5 | Immutable platform-audit protections | VERIFIED — only GET is exposed; mutations return 405. |
| 6 | Server-side permission enforcement remains intact | VERIFIED — platform capability and tenant-auth regressions pass. |
| 7 | Focused Phase E tests pass | VERIFIED — see Phase E receipt. |
| 8 | Aggregate and security regression suite passes | VERIFIED — 514 pass, 0 fail, 3 skipped; all static/security checks pass. |
| 9 | Phase E evidence and receipt are complete | VERIFIED — Phase E contract and recovery receipt recorded. |
| 10 | Focused Phase E GREEN commit exists | VERIFIED — see Phase E recovery commit. |

**Phase E verified progress: 10 of 10 (100%). Phase E is GREEN.**

## Phase E completion and Phase F relay packet

- Recovery job: `NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-E-RECOVERY-20260810`.
- Final local validation: focused affected tests **30 pass, 0 fail**; full non-browser suite **514 pass, 0 fail, 3 skipped**; typecheck, lint, build, tenancy, worktree scope/coverage, secret scan, secret-history scan, and diff check all passed.
- No browser, staging/production deployment, live data, outbound communication, payment action, or secret output occurred.
- Next packet: `receipts/security/NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-F-RELAY-PACKET-20260810.md` with `JOB_ID: NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-F-20260810`.

## Authorization and gate

- Job: `NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-A-20260810`.
- Scope: read-only implementation inventory, ownership plan, and evidence only.
- P0 prerequisite: **GREEN**. The fresh authenticated staging receipt records 74/74 safe outcomes, cross-tenant denials in both directions, verified temporary-identity cleanup, and no production change. See `receipts/security/NEXTEAM-P0-INDEPENDENT-VALIDATION-20260810.md`.
- Security containment remains active: no production control, secret output, live tenant-data operation, worktree mutation, push, merge, rebase, reset, amend, or deletion occurred in this phase.
- Phase A gate: **GREEN**. Current ownership and boundaries are evidenced below; no duplicate architecture or new worktree is selected.

## Current authoritative implementation

| Concern | Current source of truth | Owner lane | Current behavior | Phase A finding |
| --- | --- | --- | --- | --- |
| NexCommand UI | `apps/web/src/features/platformOverview/**` | `platform-tenants` | Read-only internal console at `/nexcommand`; `/platform` remains compatible. | Reuse, do not fork. |
| Web routing and session shell | `apps/web/src/shared/router/**`; `apps/web/src/shared/auth/**` | `nexteam-global` | Authenticated `/platform` and `/nexcommand` both render `PlatformRoute`; sign-in wording identifies NexCommand. | Shared routing contract; change only by coordinated contract. |
| Platform API, tenancy lifecycle, access administration | `apps/server/src/platform/**` | `platform-tenants` | Platform routes use platform-operator guards; tenant lifecycle records persist through the platform repository. | Reuse existing service boundary. |
| Auth context and tenant capability enforcement | `apps/server/src/auth/**`; `packages/core/**` | `nexteam-global` | Firebase-token platform-operator gate is distinct from tenant role/capability checks; tenant roles map to explicit capabilities. | Existing model is authoritative; do not create a NexCommand-specific role model. |
| Module registry | `apps/server/src/modules/manifest.ts`; `apps/server/src/modules/types.ts` | `nexteam-global` | Server modules register through the shared manifest. | NexCommand directory is presentation only, not a second module registry. |
| Controller status projection | `apps/server/src/platform/liveBuildStatus.ts`; `apps/server/src/platform/routes.ts` | `platform-tenants` | Operator-only read endpoint reads `NEXCOMMAND_LIVE_BUILD_STATUS_FILE`; missing, malformed, invalid, or >2-minute stale status is `IDLE`. | Read-only projection exists; no job execution authority exists. |
| Controller status panel | `apps/web/src/features/platformOverview/routes/NexCommandRoute.tsx` | `platform-tenants` | Fetches the operator-only endpoint every 30 seconds and displays sanitized status fields. | Existing panel is the only status surface. |
| Legacy local rails / Mission Control | `src/features/missioncontrol/**`; `scripts/run-rail-local-api.mjs` | Integration legacy area; no declared component owner | Local adapter server, not NexCommand controller; it includes unrelated legacy operational adapters. | Must not be adopted or expanded as NexCommand architecture. |
| Deployment and release controls | NexCommand `system` and `releases` UI areas | `platform-tenants` | Informational only; embedded build controls are explicitly disabled and release area exposes no operation. | No deployment runner or release executor exists. |
| Codex SDK / persistent runner | No tracked implementation found; package inventory has no `@openai/codex-sdk`. | Unassigned because no implementation file exists | No source-backed SDK integration, PID management, heartbeat writer, or job dispatcher exists. | The sole missing Foundation capability; Phase B must establish it without widening platform authority. |

## Access and routing contract

- `/nexcommand` and `/platform` are authenticated web routes. `PlatformRoute` renders the NexCommand route for `/platform` and `/nexcommand`; other platform subroutes use the existing platform subroute resolver.
- `GET /api/platform/admin/live-build-status` is a read-only platform-admin route. A tenant user is denied; a platform operator may receive only the sanitized status projection.
- Platform access is granted only by configured operator UID/email or platform-operator custom claims/role. Tenant ownership alone does not grant NexCommand access.
- Tenant roles remain `OWNER`, `OFFICE_ADMIN`, and `TECHNICIAN`; current capability values are `team.view`, `team.manage`, `team.invite`, and `tenant.audit.read`. The controller must not use tenant capabilities as a substitute for a platform-operator gate.
- The status contract fields are `currentBuild`, `currentTask`, `actualState`, `runId`, `pid`, `lastHeartbeat`, `progress`, `completedTasks`, `remainingTasks`, `blocker`, and `lastActivity`. The server derives `ACTIVE` only from a fresh, structurally valid status document.

## Minimum justified worktree plan

No dedicated NexCommand worktree is justified in Phase A. The implementation is presently one cohesive platform control surface owned by `platform-tenants`, with two existing cross-cutting contracts owned by `nexteam-global`. Creating a parallel lane now would duplicate live paths and obscure ownership.

| Proposed Phase B boundary | Primary owner | Shared contract owner | Routing requirement | Test owner | Rollback boundary |
| --- | --- | --- | --- | --- | --- |
| Controller-runner protocol and status-file writer, if added | `platform-tenants` | `nexteam-global` only if the shared module/auth contract changes | No new public route; retain the existing operator-guarded read-only status endpoint | `platform-tenants` for runner/status integration; `nexteam-global` for shared contract changes | Revert only the controller-runner commit; stale or absent status remains fail-closed `IDLE`. |
| NexCommand panel presentation of approved status additions | `platform-tenants` | None unless shared router changes | Retain `/nexcommand` canonical route and `/platform` compatibility | `platform-tenants` | Revert panel-only commit; server remains read-only. |
| Platform operator gate or shared module registration change | `nexteam-global` | `nexteam-global` | Existing route remains; no tenant-role fallback | `nexteam-global` with platform route regression coverage | Independent coordinated-contract rollback; never bundle with runner rollback. |

Phase B must not start Team/Users work, modify tenant records, create a second module registry, make NexCommand a release executor, or make a deployed server invoke a local coding agent. A dedicated `nexcommand` worktree can be reconsidered only if the controller acquires an independently owned implementation directory with at least two non-overlapping consumers and documented, stable public contracts. That condition is not proven.

## Phase B dispatch specification

The next job is limited to a local, non-production controller adapter that can launch and observe an authorized coding job without granting NexCommand execution controls. Before implementation it must:

1. Confirm the available Codex SDK/runtime entry point and its documented lifecycle semantics without outputting credentials.
2. Define a versioned, atomic local status-document protocol compatible with the existing reader and two-minute stale fail-closed behavior.
3. Keep job prompting, run ID, PID, heartbeat, cancellation/recovery semantics, logs, and artifacts local and sanitized; the deployed server may only read the projected status document.
4. Add focused tests for authorized job registration, malformed/stale status, duplicate-run rejection, runner exit recovery, and tenant-user denial of status reads.
5. Record a run ID, PID, heartbeat, test evidence, rollback, and the absence of production changes in a receipt.

The controller job must stop before any source change if a genuine Codex SDK/runtime cannot be invoked from the local environment. It must report that fact truthfully rather than fabricating a run ID, PID, or heartbeat.

## Evidence and validation

- Fresh P0 staging evidence: `receipts/security/NEXTEAM-P0-INDEPENDENT-VALIDATION-20260810.md`.
- Current status reader unit coverage: `apps/server/test/live-build-status.test.mjs`.
- Current operator-denial/read-only route coverage: `apps/server/test/platform.test.mjs`.
- Current route/panel coverage: `apps/web/src/features/platformOverview/routes/NexCommandRoute.test.mjs`.
- Phase A focused validation is recorded in `docs/knowledge/code-maps/2026-08-10-nexcommand-foundation-phase-a.md` after execution.

## Phase B dispatch result

On 2026-08-10, immediately after the Phase A green gate, the local runtime discovery and dispatch preflight attempted the available `codex` executable with `exec --help`. Windows denied execution of the discovered executable before it could report supported commands or launch a process (`Access is denied`). No Codex SDK package is installed in the workspace. Therefore no genuine Phase B controller process could be dispatched, and there is truthfully no Phase B run ID, PID, or heartbeat to record.

This is an environment-runtime blocker, not a reason to synthesize controller state. The existing NexCommand status endpoint remains `IDLE` when no valid fresh status document exists. After the local Codex runtime is made executable or an approved SDK/runtime is supplied, dispatch the bounded Phase B specification above and append its real run ID, PID, first heartbeat, status-file location class (never a secret), test evidence, and rollback receipt here.

## Phase B authoritative boundary registry

Phase B supersedes the earlier runtime-discovery conclusion for ownership/routing work only. The existing persistent file relay is available at `C:\Users\Peyto\.openclaw\workspace\ops-bridge\to-codex.jsonl`; it is an external local execution-plane seam, never a deployed NexCommand endpoint. The repository now registers the `nexcommand-foundation` component in `worktree-lanes.json` with these authoritative boundaries:

| Boundary | Record |
| --- | --- |
| Authoritative lane | `platform-tenants`; no physical `nexcommand` worktree and no duplicate lane. |
| Permitted implementation paths | `apps/web/src/features/platform/**`, `apps/web/src/features/platformOverview/**`, `apps/server/src/platform/**`. |
| Shared dependencies | `nexteam-global` owns shared auth, routing, module manifest/types, and `packages/core`; any change is a coordinated integration contract change. |
| Routing | `/nexcommand` is canonical; `/platform` is compatible; `GET /api/platform/admin/live-build-status` is the sole controller projection and has no write peer. |
| Conflict relationships | Do not duplicate auth/router/module registries. `src/features/missioncontrol/**` and `scripts/run-rail-local-api.mjs` remain unrelated legacy local rails. |
| Tests | `nexcommand-foundation-registry`, live-status, platform route, and NexCommand route tests. |
| Rollback | Registry/docs revert independently. Missing, malformed, or stale controller documents remain fail-closed `IDLE`; shared-route rollback stays with `nexteam-global`. |

No Team/Users implementation, tenant-record mutation, production change, release execution, or browser automation is included in this phase.

## Phase C dispatch

Phase C is dispatched only through the validated local relay after the Phase B checks are green. Its packet is bounded to a persistence-first NexCommand Team/Users discovery-and-contract job: it must preserve the existing platform-operator gate, create no duplicate user/role model, make no production or customer-data change, and stop before implementation if its required persistence/authorization contract is not present. The relay receipt records the actual queue packet identifier, job run identifier, executor PID, and first heartbeat when and only when the existing executor acknowledges them. No value is synthesized in this ledger.

- Queued packet ID: `msg-76a45b7f-6c77-432a-b7d4-4cbe1e2186ba`.
- Task ID: `NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-C-20260810`.
- Queued at: `2026-08-10T15:59:25.6481712Z`.
- Relay route/target: `ops-bridge/to-codex.jsonl` → `atlas`.
- Acknowledgement check: no relay acknowledgement or executor return was present after dispatch.
- Actual run ID, PID, and heartbeat: **not available**. The existing file relay has queued the task but has not started an executor; recording invented values would violate the work order.

## Phase C green gate repair and Phase D dispatch

The Phase C aggregate gate was repaired on 2026-08-10 without weakening Firebase-required authentication. Existing local-only route fixtures now explicitly set `NEXI_FIREBASE_AUTH_REQUIRED: "false"`; the mobile profile helper now evaluates the route's injected runtime environment rather than global process state. Regression coverage proves profiles are unavailable when Firebase authentication is required and the Firebase-required runtime still fails closed without an Admin SDK.

- Aggregate gate: `npm test` — 511 passed, 0 failed, 3 skipped.
- Phase C focused gate: 27 passed, 0 failed.
- Admin tenant-isolation emulator: 5 passed, 0 failed.
- Static and boundary checks: typecheck, lint, tenancy, worktree scope/coverage, secret and secret-history scans, and `git diff --check` passed.
- Phase D packet: `msg-5d254553-9825-4d8b-bb59-d42737406b9f` for `NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-D-20260810`, queued at `2026-08-10T17:56:44.8357745Z` through `ops-bridge/to-clawdia.jsonl`.
- Phase D executor acknowledgement: not yet present in the relay at dispatch verification. No run ID, PID, or heartbeat is recorded until a real executor reports it.

## Risks and recovery

- A status file is not a job runner. It can report only a process that another authorized local component has started.
- The deployed application must never accept a status-writing API, execute arbitrary jobs, or expose controller logs/credentials.
- Any runner failure or lost heartbeat degrades to `IDLE`; this is safe but can mask an interrupted local job. Recovery is to inspect the local receipt/process, then restart only through the authorized local controller path.
- No tenant guide is required: NexCommand is an internal operator console and this phase changes neither tenant-visible behavior nor tenant data.
