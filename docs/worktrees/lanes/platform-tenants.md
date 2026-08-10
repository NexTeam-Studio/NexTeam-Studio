# Platform - Tenants

Status: Ready for component worktree use.

## HOW

Manages tenant administration and tenant status without owning tenant business data. Its authoritative paths, branch, and worktree directory are recorded in worktree-lanes.json. Run npm run check:worktree-scope before committing.

## WHY

This lane exists so the component can change, test, and return to a known working checkpoint without silently changing another component.

## SUPPORT

Record plain-language user instructions, common questions, failures, and recovery steps here as the component develops.

## CONTRACTS

Record the public commands, queries, and events that other components and Nexi are allowed to use. Internal files are not public contracts.

### NexCommand Foundation (Phase B)

NexCommand is a component boundary within this lane, not a separate worktree. Its permitted implementation paths are `apps/web/src/features/platform/**`, `apps/web/src/features/platformOverview/**`, and `apps/server/src/platform/**`; the machine-readable record is `worktree-lanes.json#componentRegistry` (`nexcommand-foundation`).

- Canonical route: `/nexcommand`; `/platform` is the compatibility route. Both continue through the shared router.
- Public controller projection: `GET /api/platform/admin/live-build-status`, operator-only and read-only. There are no NexCommand write routes.
- Shared dependencies owned by `nexteam-global`: shared auth, router, module manifest/types, and `packages/core`. This lane must consume those contracts and coordinate changes in the integration lane.
- Conflict boundary: `src/features/missioncontrol/**` and `scripts/run-rail-local-api.mjs` are legacy local rails, not a NexCommand controller. Never route NexCommand work into them or duplicate their behavior.
- Rollback: registry/docs changes revert independently. The status projection fails closed to `IDLE` when no valid fresh local controller document is available; routing rollback remains a shared global-contract action.

Focused coverage: `apps/server/test/nexcommand-foundation-registry.test.mjs`, `apps/server/test/live-build-status.test.mjs`, `apps/server/test/platform.test.mjs`, and `apps/web/src/features/platformOverview/routes/NexCommandRoute.test.mjs`.

## KNOWN GOOD

Initial baseline: ffe442ffebac195963cbd5e66064a264315c4c15. Replace this entry with each verified component checkpoint and its test evidence.
