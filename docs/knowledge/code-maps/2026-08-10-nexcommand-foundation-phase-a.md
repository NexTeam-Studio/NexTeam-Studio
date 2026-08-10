DOCUMENT_ID: CODEMAP-NEXCOMMAND-FOUNDATION-PHASE-A-20260810
TITLE: NexCommand Foundation Phase A Inventory and Ownership Map
DOCUMENT_TYPE: CODE_MAP
STATUS: GREEN
CREATED_AT: 2026-08-10
UPDATED_AT: 2026-08-10
AUTHOR: NexTeam Global Control
SOURCE_AGENT: Codex
PRODUCT_AREA: NexCommand Foundation
MODULES: platform, authorization, routing, controller-status, worktrees
TENANTS: all
RELATED_COMMITS: none
RELATED_TESTS: apps/server/test/live-build-status.test.mjs; apps/server/test/platform.test.mjs; apps/web/src/features/platformOverview/routes/NexCommandRoute.test.mjs
RELATED_DOCUMENTS: docs/knowledge/checkpoints/NEXCOMMAND_FOUNDATION_IMPLEMENTATION_LEDGER.md; receipts/security/NEXTEAM-P0-INDEPENDENT-VALIDATION-20260810.md
RELATED_LLM_ARTIFACTS: JOB-NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-A-20260810
TAGS: code-map, nexcommand, phase-a, ownership, evidence

# NexCommand Foundation Phase A Inventory and Ownership Map

## Purpose and scope

This is a read-only inventory for `NEXTEAM-NEXCOMMAND-FOUNDATION-PHASE-A-20260810`. No implementation code, route, deployment, tenant data, release control, worktree, or production resource was changed. The authoritative outcome is the accompanying Foundation ledger.

## Current path and symbol map

| Path | Symbols / relevant range | Inputs and outputs | Authorization and tenant effect | Test and rollback |
| --- | --- | --- | --- | --- |
| `apps/web/src/shared/router/AppRouter.tsx` | `AppRouter` | Authenticated pathname -> platform or product route. | `/platform` and `/nexcommand` route to `PlatformRoute`; no data write. | Covered indirectly by platform route tests. Revert routing changes independently in `nexteam-global`. |
| `apps/web/src/features/platform/routes/PlatformRoute.tsx` | `PlatformRoute` | Pathname -> `NexCommandRoute` or existing platform subroute. | Canonical `/nexcommand`; compatible `/platform`. | No alternate NexCommand shell is selected. |
| `apps/web/src/features/platformOverview/routes/NexCommandRoute.tsx` | `NexCommandRoute`, `LiveBuildStatusPanel` | Authenticated user token -> sanitized status fetch and display. | Requests operator-only status endpoint; display has no execution command. | `NexCommandRoute.test.mjs`; panel-only rollback is safe. |
| `apps/server/src/platform/routes.ts` | `registerPlatformRoutes`, live-build status route | Bearer token -> platform-operator guard -> `readLiveBuildStatus` response. | Tenant user denial; operator-only read. No tenant mutation in the status route. | `platform.test.mjs`; route removal restores no control, not a permissive state. |
| `apps/server/src/platform/liveBuildStatus.ts` | `readLiveBuildStatus`, `LiveBuildStatus` | Status-file path and clock -> validated status projection. | No user input; invalid/missing/stale data returns `IDLE`. | `live-build-status.test.mjs`; reader rollback is separate from future runner rollback. |
| `apps/server/src/auth/accessContext.ts` | `hasPlatformAccess`, `requireAccessContext`, `assertAccessCapability` | Firebase ID token and configured operator identity -> access context. | Distinguishes platform operator from tenant role/capability. | Platform route tests; shared auth changes require `nexteam-global`. |
| `apps/server/src/platform/accessManagement.ts` | `ROLE_CAPABILITIES`, `customClaimsForTenantUser` | Tenant-user record -> custom claims/capabilities. | Tenant user roles do not confer NexCommand platform access. | `platform.test.mjs`; do not create a duplicate capability model. |
| `apps/server/src/modules/manifest.ts` | `registerServerModules`, `collectNexiToolProviders` | Module list -> server registration/tool-provider list. | No NexCommand-specific registry. | Any registry change is a shared-contract change. |
| `worktree-lanes.json` | `platform-tenants`, `nexteam-global`, `nexteam-integration` | Paths -> unique component-lane owner. | Establishes ownership, not runtime authorization. | `check:worktree-scope`, `check:worktree-coverage`; no lane added in Phase A. |
| `receipts/security/NEXTEAM-P0-INDEPENDENT-VALIDATION-20260810.md` | P0 staging validation record | Synthetic authenticated staging requests -> pass/fail evidence. | Records cross-tenant rejection and platform status endpoint operator verification. | Independent historical receipt; production unchanged. |

## Focused validation executed on 2026-08-10

- `npm --workspace @nexteam/server run build` — PASS, exit 0.
- `node --import ./tests/setup.mjs --import tsx --test apps/server/test/live-build-status.test.mjs apps/server/test/platform.test.mjs apps/web/src/features/platformOverview/routes/NexCommandRoute.test.mjs` — PASS, exit 0.
- `npm run check:worktree-scope` — PASS, exit 0.
- `npm run check:worktree-coverage` — PASS, exit 0.
- `npm run check:secrets` — PASS, exit 0.

Phase B dispatch preflight ran after this green gate. The discovered local `codex` executable was denied execution by Windows before command help or a process launch. No SDK package is installed, so no real controller run was created and no run ID/PID/heartbeat was fabricated.

The command output is intentionally not copied here because it can contain unstable local paths. These focused checks are source/local evidence only; the referenced P0 receipt is the staging evidence. No production change occurred.

## Known gap and Phase B boundary

No source-backed Codex SDK, persistent local controller, status-file writer, job launch protocol, PID lifecycle handler, or heartbeat producer was found. The current `liveBuildStatus` reader is a projection seam only. Phase B may fill that seam locally, under `platform-tenants`, but must keep the deployed API read-only and retain `nexteam-global` ownership of any shared auth/module contract.
